/**
 * Lineage Tree - D3.js tree/flow diagram for visualizing a traced lineage path.
 * Uses d3.tree() layout (deterministic, left-to-right) to show the 6-layer
 * lineage from Visuals down to BigQuery sources.
 */

import * as d3 from 'd3';
import { LAYER_COLORS, LAYER_LABELS } from '../utils/constants.js';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 36;
const VERTICAL_SPACING = 52;
const HORIZONTAL_SPACING = 260;

/**
 * Build a tree for a visual-first view: selected visual as root,
 * branching into each measure's upstream lineage.
 * @param {{ title: string, type: string, page: string }} visual - The selected visual.
 * @param {Array<{ measureName: string, lineage: object }>} allMeasures - All measures (direct + FP).
 * @param {object} graph
 * @returns {object} Tree data for renderLineageTree.
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

  // Visual as root, measures as children
  const visualRoot = {
    name: visual.title || visual.type || 'Visual',
    layer: 1,
    layerLabel: LAYER_LABELS[1],
    type: 'visual',
    detail: `${visual.type} on ${visual.page}`,
    children: measureNodes,
  };

  return visualRoot;
}

/**
 * Build a hierarchical tree data structure from lineage output.
 * The root is the selected measure, with visuals as a branch above
 * and sub-measures/columns/sources as branches below.
 *
 * Tree is inverted for display: visuals at left, sources at right.
 */
export function buildTreeData(lineage, graph) {
  const { visuals, measureChain, sourceTable } = lineage;

  // Build a lookup for source info by column key
  const sourceMap = new Map();
  for (const row of sourceTable) {
    const key = `${row.pbiTable}.${row.pbiColumn}`;
    sourceMap.set(key, row);
  }

  // Root node = the selected measure
  const root = {
    name: measureChain.name,
    layer: 2,
    layerLabel: LAYER_LABELS[2],
    type: 'measure',
    detail: truncateExpr(measureChain.expression),
    children: [],
  };

  // Add sub-measure / column children recursively
  addChainChildren(root, measureChain, sourceMap, graph, new Set());

  // Wrap: visuals -> root measure -> ...
  // If there are visuals, make a wrapper structure
  if (visuals.length > 0) {
    const visualNodes = visuals.map(v => ({
      name: v.title || v.visualType,
      layer: 1,
      layerLabel: LAYER_LABELS[1],
      type: 'visual',
      detail: `${v.visualType} on ${v.page}`,
      children: [deepClone(root)],
    }));

    // If multiple visuals, create a virtual root
    if (visualNodes.length === 1) {
      return visualNodes[0];
    }

    return {
      name: measureChain.name,
      layer: 0,
      layerLabel: 'Shared Measure',
      type: 'hub',
      detail: `Used by ${visuals.length} visuals`,
      children: visualNodes,
    };
  }

  // No visuals — root is the measure
  return root;
}

function addChainChildren(node, chain, sourceMap, graph, visited) {
  if (visited.has(chain.id)) return;
  visited.add(chain.id);

  // Add sub-measures
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

  // Add columns (leaf nodes)
  for (const col of chain.columns) {
    const key = `${col.table}.${col.name}`;
    const source = sourceMap.get(key);

    const colNode = {
      name: `${col.table}[${col.name}]`,
      layer: 4,
      layerLabel: LAYER_LABELS[4],
      type: 'column',
      detail: col.sourceColumn && col.sourceColumn !== col.name
        ? `Source: ${col.sourceColumn}`
        : '',
      children: [],
    };

    // Add PQ expression node if available
    if (source?.pqExpression) {
      const exprNode = {
        name: source.pqExpression,
        layer: 5,
        layerLabel: LAYER_LABELS[5],
        type: 'expression',
        detail: '',
        children: [],
      };

      // Add BigQuery source node if available
      if (source.bigQueryTable) {
        exprNode.children.push({
          name: source.bigQueryTable,
          layer: 6,
          layerLabel: LAYER_LABELS[6],
          type: 'source',
          detail: source.bigQueryColumn || '',
          children: [],
        });
      }

      colNode.children.push(exprNode);
    } else if (source?.bigQueryTable) {
      // Direct source without PQ expression
      colNode.children.push({
        name: source.bigQueryTable,
        layer: 6,
        layerLabel: LAYER_LABELS[6],
        type: 'source',
        detail: source.bigQueryColumn || '',
        children: [],
      });
    }

    node.children.push(colNode);
  }
}

/**
 * Render the lineage tree into a container element.
 */
export function renderLineageTree(container, treeData) {
  // Clear previous
  destroyTree(container);

  if (!treeData || (!treeData.children?.length && treeData.layer === 0)) {
    console.warn('renderLineageTree: skipped — treeData is empty or hub node with no children', treeData);
    if (container) {
      container.innerHTML = '<p class="lineage-muted">No tree visualization available for this measure.</p>';
    }
    return;
  }

  const hierarchy = d3.hierarchy(treeData);
  const nodeCount = hierarchy.descendants().length;

  // Calculate dimensions based on tree size
  const treeHeight = Math.max(hierarchy.height + 1, 2);
  const leaves = hierarchy.leaves().length;
  const width = treeHeight * HORIZONTAL_SPACING + NODE_WIDTH + 80;
  const height = Math.max(leaves * VERTICAL_SPACING, 200) + 60;

  // Create tree layout (left-to-right)
  const treeLayout = d3.tree()
    .size([height - 60, width - NODE_WIDTH - 80])
    .separation((a, b) => a.parent === b.parent ? 1 : 1.2);

  treeLayout(hierarchy);

  // Create SVG
  const svg = d3.select(container)
    .append('svg')
    .attr('class', 'lineage-tree-svg')
    .attr('width', '100%')
    .attr('height', Math.min(height, 600))
    .attr('viewBox', `0 0 ${width} ${height}`);

  // Add zoom
  const g = svg.append('g')
    .attr('transform', `translate(40, 30)`);

  const zoom = d3.zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Initial transform to center
  svg.call(zoom.transform, d3.zoomIdentity.translate(40, 30));

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
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.5);

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
    .attr('fill-opacity', 0.15)
    .attr('stroke', d => getLayerColor(d.data.type))
    .attr('stroke-width', 1.5);

  // Layer indicator dot
  nodes.append('circle')
    .attr('cx', -NODE_WIDTH / 2 + 14)
    .attr('cy', 0)
    .attr('r', 5)
    .attr('fill', d => getLayerColor(d.data.type));

  // Node name text
  nodes.append('text')
    .attr('x', -NODE_WIDTH / 2 + 26)
    .attr('y', -3)
    .attr('class', 'tree-node-name')
    .text(d => truncateText(d.data.name, 22))
    .attr('fill', '#e0e0e0')
    .attr('font-size', '12px')
    .attr('font-weight', 600)
    .attr('dominant-baseline', 'auto');

  // Layer label text
  nodes.append('text')
    .attr('x', -NODE_WIDTH / 2 + 26)
    .attr('y', 11)
    .attr('class', 'tree-node-layer')
    .text(d => d.data.layerLabel || '')
    .attr('fill', '#8888aa')
    .attr('font-size', '9px')
    .attr('dominant-baseline', 'auto');

  // Tooltips
  nodes.append('title')
    .text(d => {
      let tip = `${d.data.layerLabel}: ${d.data.name}`;
      if (d.data.detail) tip += `\n${d.data.detail}`;
      return tip;
    });

  // Add legend
  addLegend(svg, width);
}

/**
 * Destroy the tree SVG from the container.
 */
export function destroyTree(container) {
  if (container) {
    container.innerHTML = '';
  }
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
    { layer: 1, type: 'visual', label: LAYER_LABELS[1] },
    { layer: 2, type: 'measure', label: LAYER_LABELS[2] },
    { layer: 3, type: 'subMeasure', label: LAYER_LABELS[3] },
    { layer: 4, type: 'column', label: LAYER_LABELS[4] },
    { layer: 5, type: 'expression', label: LAYER_LABELS[5] },
    { layer: 6, type: 'source', label: LAYER_LABELS[6] },
  ];

  const legend = svg.append('g')
    .attr('class', 'tree-legend')
    .attr('transform', `translate(${width - 170}, 10)`);

  legend.append('rect')
    .attr('x', -8)
    .attr('y', -8)
    .attr('width', 168)
    .attr('height', legendData.length * 18 + 16)
    .attr('rx', 6)
    .attr('fill', 'rgba(22, 33, 62, 0.92)')
    .attr('stroke', '#2a2a4a');

  const entries = legend.selectAll('.legend-entry')
    .data(legendData)
    .join('g')
    .attr('class', 'legend-entry')
    .attr('transform', (d, i) => `translate(0, ${i * 18})`);

  entries.append('circle')
    .attr('cx', 6)
    .attr('cy', 6)
    .attr('r', 4)
    .attr('fill', d => LAYER_COLORS[d.type]);

  entries.append('text')
    .attr('x', 16)
    .attr('y', 10)
    .text(d => `L${d.layer}: ${d.label}`)
    .attr('fill', '#a0a0b0')
    .attr('font-size', '10px');
}
