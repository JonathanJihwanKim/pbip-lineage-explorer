/**
 * Lineage Tree - D3.js tree/flow diagram for visualizing a traced lineage path.
 * Uses d3.tree() layout (deterministic, left-to-right) to show the full
 * lineage from Visuals down to data sources: Visual → Measure → Table → Column → Source.
 */

import * as d3 from 'd3';
import { LAYER_COLORS, LAYER_LABELS } from '@pbip-lineage/core/utils/constants.js';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 40;
const VERTICAL_SPACING = 64;    // was 52; increased for breathing room between nodes
const HORIZONTAL_SPACING = 260;
const MAX_SVG_HEIGHT = 1600;    // was 600; let tall trees expand instead of compressing

/**
 * Build a tree for a visual-first view: selected visual as root,
 * branching into each measure's upstream lineage.
 */
export function buildVisualTreeData(visual, allMeasures, graph) {
  const measuresWithLineage = allMeasures.filter(m => m.lineage);
  if (measuresWithLineage.length === 0) return null;

  const measureNodes = measuresWithLineage.map(m => {
    const { measureChain, sourceTable } = m.lineage;
    const sourceMap = new Map();
    for (const row of sourceTable) {
      sourceMap.set(`${row.pbiTable}.${row.pbiColumn}`, row);
    }

    const measureNode = {
      name: measureChain.name,
      layer: 2,
      layerLabel: LAYER_LABELS[2],
      type: 'measure',
      detail: truncateExpr(measureChain.expression),
      children: [],
    };
    addChainChildren(measureNode, measureChain, sourceMap, graph, new Set());
    return measureNode;
  });

  return {
    name: visual.title || visual.type || 'Visual',
    layer: 1,
    layerLabel: LAYER_LABELS[1],
    type: 'visual',
    detail: `${visual.type} on ${visual.page}`,
    children: measureNodes,
  };
}

/**
 * Build a hierarchical tree data structure from lineage output.
 * Root is the selected measure. Visuals branch left; tables/columns/sources branch right.
 */
export function buildTreeData(lineage, graph) {
  const { visuals, measureChain, sourceTable } = lineage;

  const sourceMap = new Map();
  for (const row of sourceTable) {
    sourceMap.set(`${row.pbiTable}.${row.pbiColumn}`, row);
  }

  const root = {
    name: measureChain.name,
    layer: 2,
    layerLabel: LAYER_LABELS[2],
    type: 'measure',
    detail: truncateExpr(measureChain.expression),
    children: [],
  };

  addChainChildren(root, measureChain, sourceMap, graph, new Set());

  if (visuals.length > 0) {
    const visualNodes = visuals.map(v => ({
      name: v.title || v.visualType,
      layer: 1,
      layerLabel: LAYER_LABELS[1],
      type: 'visual',
      detail: `${v.visualType} on ${v.page}`,
      children: [deepClone(root)],
    }));

    if (visualNodes.length === 1) return visualNodes[0];

    return {
      name: measureChain.name,
      layer: 0,
      layerLabel: 'Shared Measure',
      type: 'hub',
      detail: `Used by ${visuals.length} visuals`,
      children: visualNodes,
    };
  }

  return root;
}

/**
 * Recursively add sub-measures and columns (grouped by table) as children.
 * New structure: Measure → Table → Columns + Source (instead of flat column list).
 */
function addChainChildren(node, chain, sourceMap, graph, visited) {
  if (visited.has(chain.id)) return;
  visited.add(chain.id);

  // Sub-measure children
  for (const child of chain.children) {
    const subNode = {
      name: child.name,
      layer: 3,
      layerLabel: LAYER_LABELS[3],
      type: 'subMeasure',
      detail: truncateExpr(child.expression),
      children: [],
    };
    addChainChildren(subNode, child, sourceMap, graph, visited);
    node.children.push(subNode);
  }

  // Group columns by their PBI table → one Table node per table
  const tableGroups = new Map();
  for (const col of chain.columns) {
    if (!tableGroups.has(col.table)) tableGroups.set(col.table, []);
    tableGroups.get(col.table).push(col);
  }

  for (const [tableName, cols] of tableGroups) {
    const tableNodeId = `table::${tableName}`;
    const tableGraphNode = graph?.nodes?.get(tableNodeId);
    const ds = tableGraphNode?.metadata?.dataSource;

    // Build table detail from data source metadata
    const detailParts = [];
    if (ds?.sourceType) detailParts.push(ds.sourceType);
    if (ds?.database) detailParts.push(ds.database);

    const tableNode = {
      name: tableName,
      layer: 4,
      layerLabel: LAYER_LABELS[4],
      type: 'table',
      detail: detailParts.join(' · '),
      children: [],
    };

    // Column nodes under table — layer label shows rename hint if applicable
    for (const col of cols) {
      const srcColName = col.originalSourceColumn || col.sourceColumn;
      const wasRenamed = col.wasRenamed || (srcColName && srcColName !== col.name);

      let colLayerLabel = 'PBI Column';
      if (wasRenamed && srcColName) {
        colLayerLabel = `← src: ${truncateText(srcColName, 22)}`;
      }

      const key = `${col.table}.${col.name}`;
      const sourceRow = sourceMap.get(key);

      tableNode.children.push({
        name: col.name,
        layer: 4,
        layerLabel: colLayerLabel,
        type: 'column',
        detail: sourceRow?.sourceColumnFull || '',
        children: [],
      });
    }

    // Resolve source chain: PQ expression (L5) → Source connection (L6)
    // Walk graph adjacency: table → expression → source
    let addedSource = false;
    if (graph?.adjacency?.downstream && tableNodeId) {
      const tableDownIds = graph.adjacency.downstream.get(tableNodeId) || new Set();
      for (const dId of tableDownIds) {
        const dNode = graph.nodes.get(dId);
        if (dNode?.type === 'expression') {
          // PQ Expression node (L5)
          const exprChildren = [];
          const exprDownIds = graph.adjacency.downstream.get(dNode.id) || new Set();
          for (const eId of exprDownIds) {
            const srcNode = graph.nodes.get(eId);
            if (srcNode?.type === 'source') {
              const srcMeta = srcNode.metadata || {};
              const srcDetail = [srcMeta.sourceType, srcMeta.server, srcMeta.database, srcMeta.schema]
                .filter(Boolean).join(' · ');
              exprChildren.push({
                name: truncateText(srcMeta.sourceTable || srcNode.name || eId.split('::')[1] || 'Source', 30),
                layer: 6,
                layerLabel: LAYER_LABELS[6],
                type: 'source',
                detail: srcDetail,
                children: [],
              });
            }
          }
          tableNode.children.push({
            name: truncateText(dNode.name || 'Expression', 30),
            layer: 5,
            layerLabel: LAYER_LABELS[5],
            type: 'expression',
            detail: 'Power Query expression',
            children: exprChildren,
          });
          addedSource = true;
          break; // one expression node per table is enough for the tree
        }
      }

      // If no expression, look for direct table → source edges
      if (!addedSource) {
        for (const dId of tableDownIds) {
          const dNode = graph.nodes.get(dId);
          if (dNode?.type === 'source') {
            const srcMeta = dNode.metadata || {};
            const srcDetail = [srcMeta.sourceType, srcMeta.server, srcMeta.database, srcMeta.schema]
              .filter(Boolean).join(' · ');
            tableNode.children.push({
              name: truncateText(srcMeta.sourceTable || dNode.name || 'Source', 30),
              layer: 6,
              layerLabel: LAYER_LABELS[6],
              type: 'source',
              detail: srcDetail,
              children: [],
            });
            addedSource = true;
            break;
          }
        }
      }
    }

    // Fallback: use data source metadata from column sourceMap
    if (!addedSource) {
      const firstCol = cols[0];
      const firstSource = sourceMap.get(`${firstCol.table}.${firstCol.name}`);
      if (firstSource?.sourceTablePath) {
        const srcName = firstSource.sourceTable || firstSource.sourceTablePath.split('.').pop() || firstSource.sourceTablePath;
        const srcDetail = [ds?.sourceType, ds?.server, ds?.database, ds?.schema]
          .filter(Boolean).join(' · ');
        tableNode.children.push({
          name: truncateText(srcName, 30),
          layer: 6,
          layerLabel: LAYER_LABELS[6],
          type: 'source',
          detail: srcDetail,
          children: [],
        });
      }
    }

    node.children.push(tableNode);
  }
}

/**
 * Render the lineage tree into a container element.
 */
export function renderLineageTree(container, treeData) {
  destroyTree(container);

  if (!treeData || (!treeData.children?.length && treeData.layer === 0)) {
    if (container) {
      container.innerHTML = '<p class="lineage-muted">No tree visualization available for this measure.</p>';
    }
    return;
  }

  const hierarchy = d3.hierarchy(treeData);

  // Calculate dimensions — height based on leaf count, width based on depth
  const treeDepth = Math.max(hierarchy.height + 1, 2);
  const leaves = hierarchy.leaves().length;
  const width = treeDepth * HORIZONTAL_SPACING + NODE_WIDTH + 80;
  const height = Math.max(leaves * VERTICAL_SPACING, 200) + 60;

  // Increased separation prevents node overlap on wide trees
  const treeLayout = d3.tree()
    .size([height - 60, width - NODE_WIDTH - 80])
    .separation((a, b) => a.parent === b.parent ? 1.2 : 1.6);

  treeLayout(hierarchy);

  // SVG height: use full computed height up to MAX_SVG_HEIGHT so tall trees aren't compressed
  const svgHeight = Math.min(height, MAX_SVG_HEIGHT);

  const svg = d3.select(container)
    .append('svg')
    .attr('class', 'lineage-tree-svg')
    .attr('width', '100%')
    .attr('height', svgHeight)
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g');

  const zoom = d3.zoom()
    .scaleExtent([0.2, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Auto-fit: after SVG is in DOM, compute scale to fit full tree in viewport
  requestAnimationFrame(() => {
    const svgEl = svg.node();
    if (!svgEl) return;
    const availW = svgEl.clientWidth || width;
    const availH = svgEl.clientHeight || svgHeight;
    // Scale to fit the full tree coordinate space in the visible area
    const scaleX = availW / (width + 80);
    const scaleY = availH / (height + 60);
    const fitScale = Math.min(scaleX, scaleY, 1); // never zoom in beyond 1x initially
    const tx = Math.max(20, (availW - width * fitScale) / 2);
    const ty = Math.max(10, (availH - height * fitScale) / 2);
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(fitScale));
  });

  // Draw links
  const linkGenerator = d3.linkHorizontal()
    .x(d => d.y)
    .y(d => d.x);

  g.selectAll('.tree-link')
    .data(hierarchy.links())
    .join('path')
    .attr('class', 'tree-link')
    .attr('d', linkGenerator)
    .attr('fill', 'none')
    .attr('stroke', d => getLayerColor(d.target.data.type))
    .attr('stroke-width', 2.5)
    .attr('stroke-opacity', 0.65);

  // Draw nodes
  const nodes = g.selectAll('.tree-node')
    .data(hierarchy.descendants())
    .join('g')
    .attr('class', 'tree-node')
    .attr('transform', d => `translate(${d.y}, ${d.x})`);

  // Node background rectangles
  nodes.append('rect')
    .attr('x', -NODE_WIDTH / 2)
    .attr('y', -NODE_HEIGHT / 2)
    .attr('width', NODE_WIDTH)
    .attr('height', NODE_HEIGHT)
    .attr('rx', 6)
    .attr('ry', 6)
    .attr('fill', d => getLayerColor(d.data.type))
    .attr('fill-opacity', 0.22)
    .attr('stroke', d => getLayerColor(d.data.type))
    .attr('stroke-width', 1.5)
    // Source nodes get a dashed border to signal external system
    .attr('stroke-dasharray', d => d.data.type === 'source' ? '4,3' : null);

  // Layer indicator dot
  nodes.append('circle')
    .attr('cx', -NODE_WIDTH / 2 + 14)
    .attr('cy', 0)
    .attr('r', 5)
    .attr('fill', d => getLayerColor(d.data.type));

  // Node name text — increased truncation limit from 22 → 28 chars
  nodes.append('text')
    .attr('x', -NODE_WIDTH / 2 + 26)
    .attr('y', -3)
    .attr('class', 'tree-node-name')
    .text(d => truncateText(d.data.name, 28))
    .attr('fill', '#ececec')
    .attr('font-size', '13px')
    .attr('font-weight', 600)
    .attr('dominant-baseline', 'auto');

  // Layer / rename label text (second line)
  nodes.append('text')
    .attr('x', -NODE_WIDTH / 2 + 26)
    .attr('y', 11)
    .attr('class', 'tree-node-layer')
    .text(d => d.data.layerLabel || '')
    .attr('fill', d => {
      // Highlight rename labels in amber to draw attention
      if (d.data.type === 'column' && d.data.layerLabel?.startsWith('← src:')) return '#ffb74d';
      return '#9999bb';
    })
    .attr('font-size', '10px')
    .attr('dominant-baseline', 'auto');

  // Tooltips with full detail
  nodes.append('title')
    .text(d => {
      let tip = `${d.data.layerLabel}: ${d.data.name}`;
      if (d.data.detail) tip += `\n${d.data.detail}`;
      if (d.children && d.children.length > 0) tip += '\n(click to collapse)';
      return tip;
    });

  // Collapse/expand indicator
  nodes.filter(d => d.data.children && d.data.children.length > 0)
    .append('text')
    .attr('x', NODE_WIDTH / 2 - 14)
    .attr('y', 4)
    .attr('text-anchor', 'middle')
    .attr('fill', '#7a7a90')
    .attr('font-size', '12px')
    .attr('class', 'tree-node-toggle')
    .text(d => d.children ? '\u25BC' : '\u25B6')
    .style('cursor', 'pointer');

  // Click to collapse/expand
  nodes.filter(d => d.data.children && d.data.children.length > 0)
    .style('cursor', 'pointer')
    .on('click', function(event, d) {
      event.stopPropagation();
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else if (d._children) {
        d.children = d._children;
        d._children = null;
      }
      renderLineageTree(container, treeData);
    });

  addLegend(svg, width);
}

/**
 * Destroy the tree SVG from the container.
 */
export function destroyTree(container) {
  if (container) container.innerHTML = '';
}

/**
 * Export the current tree as SVG file.
 */
export function exportTreeAsSvg(container, filename = 'lineage-tree') {
  const svgEl = container.querySelector('svg');
  if (!svgEl) return;

  const clone = svgEl.cloneNode(true);
  const viewBox = clone.getAttribute('viewBox');
  if (viewBox) {
    const [, , w, h] = viewBox.split(' ').map(Number);
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
  }

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    svg { background: #1a1a2e; }
    .tree-node-name { fill: #ececec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .tree-node-layer { fill: #9999bb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  `;
  clone.insertBefore(style, clone.firstChild);

  const vb = viewBox ? viewBox.split(' ').map(Number) : [0, 0, 800, 400];
  const watermark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  watermark.setAttribute('x', vb[2] - 10);
  watermark.setAttribute('y', vb[3] - 8);
  watermark.setAttribute('text-anchor', 'end');
  watermark.setAttribute('fill', '#555580');
  watermark.setAttribute('font-size', '10');
  watermark.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
  watermark.textContent = 'PBIP Lineage Explorer — free & open-source by Jihwan Kim (MVP) | github.com/sponsors/JonathanJihwanKim';
  clone.appendChild(watermark);

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, `${filename}.svg`);
}

/**
 * Export the current tree as PNG file.
 */
export function exportTreeAsPng(container, filename = 'lineage-tree') {
  const svgEl = container.querySelector('svg');
  if (!svgEl) return;

  const clone = svgEl.cloneNode(true);
  const viewBox = clone.getAttribute('viewBox');
  const [, , w, h] = viewBox ? viewBox.split(' ').map(Number) : [0, 0, 800, 400];

  const scale = 2;
  clone.setAttribute('width', w * scale);
  clone.setAttribute('height', h * scale);

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    svg { background: #1a1a2e; }
    .tree-node-name { fill: #ececec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .tree-node-layer { fill: #9999bb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  `;
  clone.insertBefore(style, clone.firstChild);

  const watermark = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  watermark.setAttribute('x', w - 10);
  watermark.setAttribute('y', h - 8);
  watermark.setAttribute('text-anchor', 'end');
  watermark.setAttribute('fill', '#555580');
  watermark.setAttribute('font-size', '10');
  watermark.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
  watermark.textContent = 'PBIP Lineage Explorer — free & open-source by Jihwan Kim (MVP) | github.com/sponsors/JonathanJihwanKim';
  clone.appendChild(watermark);

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}.png`);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Helpers ---

function getLayerColor(type) {
  return LAYER_COLORS[type] || '#607d8b';
}

function truncateExpr(expr) {
  if (!expr) return '';
  const first = expr.split('\n')[0];
  return first.length > 80 ? first.substring(0, 80) + '...' : first;
}

function truncateText(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen - 1) + '\u2026' : text;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function addLegend(svg, width) {
  const legendData = [
    { type: 'visual',      label: LAYER_LABELS[1], prefix: 'L1' },
    { type: 'measure',     label: LAYER_LABELS[2], prefix: 'L2' },
    { type: 'subMeasure',  label: LAYER_LABELS[3], prefix: 'L3' },
    { type: 'table',       label: 'PBI Table',      prefix: 'L4' },
    { type: 'column',      label: 'PBI Column',     prefix: 'L4' },
    { type: 'expression',  label: LAYER_LABELS[5], prefix: 'L5' },
    { type: 'source',      label: LAYER_LABELS[6], prefix: 'L6' },
  ];

  const legend = svg.append('g')
    .attr('class', 'tree-legend')
    .attr('transform', `translate(${width - 175}, 10)`);

  legend.append('rect')
    .attr('x', -8)
    .attr('y', -8)
    .attr('width', 173)
    .attr('height', legendData.length * 20 + 16)
    .attr('rx', 6)
    .attr('fill', 'rgba(22, 33, 62, 0.92)')
    .attr('stroke', '#2a2a4a');

  const entries = legend.selectAll('.legend-entry')
    .data(legendData)
    .join('g')
    .attr('class', 'legend-entry')
    .attr('transform', (d, i) => `translate(0, ${i * 20})`);

  entries.append('circle')
    .attr('cx', 6)
    .attr('cy', 6)
    .attr('r', 4)
    .attr('fill', d => LAYER_COLORS[d.type] || '#607d8b');

  entries.append('text')
    .attr('x', 16)
    .attr('y', 10)
    .text(d => `${d.prefix}: ${d.label}`)
    .attr('fill', '#b0b0c0')
    .attr('font-size', '11px');
}
