/**
 * Graph Renderer - Renders the lineage graph using D3.js.
 * Handles force-directed and tree layouts, zoom/pan, node interaction,
 * and visual updates (highlighting, filtering, etc.).
 */

import * as d3 from 'd3';
import { NODE_COLORS, NODE_TYPES, LAYOUT_TYPES } from '../utils/constants.js';

/**
 * Initialize the graph renderer inside a container element.
 * @param {string} containerId - CSS selector or ID of the container element.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The graph data.
 * @param {object} [options={}] - Renderer options.
 * @param {Function} [options.onNodeClick] - Callback when a node is clicked.
 * @param {Function} [options.onNodeHover] - Callback when a node is hovered.
 * @param {string} [options.layout='force'] - Initial layout type.
 * @returns {object} Renderer instance with control methods.
 */
export function initRenderer(containerId, graph, options = {}) {
  const container = typeof containerId === 'string'
    ? document.querySelector(containerId.startsWith('#') ? containerId : `#${containerId}`)
    : containerId;

  if (!container) {
    throw new Error(`Container element not found: ${containerId}`);
  }

  const width = container.clientWidth || 960;
  const height = container.clientHeight || 600;

  // Clear previous content
  d3.select(container).selectAll('*').remove();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height]);

  // Arrow marker definitions
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#4a4a6a');

  // Glow filters for highlighting
  const glowBlue = defs.append('filter').attr('id', 'glow-upstream');
  glowBlue.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
  glowBlue.append('feFlood').attr('flood-color', '#2196f3').attr('flood-opacity', '0.8');
  glowBlue.append('feComposite').attr('in2', 'blur').attr('operator', 'in');
  const glowBlueMerge = glowBlue.append('feMerge');
  glowBlueMerge.append('feMergeNode');
  glowBlueMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  const glowOrange = defs.append('filter').attr('id', 'glow-downstream');
  glowOrange.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
  glowOrange.append('feFlood').attr('flood-color', '#ff9800').attr('flood-opacity', '0.8');
  glowOrange.append('feComposite').attr('in2', 'blur').attr('operator', 'in');
  const glowOrangeMerge = glowOrange.append('feMerge');
  glowOrangeMerge.append('feMergeNode');
  glowOrangeMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  const glowYellow = defs.append('filter').attr('id', 'glow-search');
  glowYellow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
  glowYellow.append('feFlood').attr('flood-color', '#ffeb3b').attr('flood-opacity', '0.8');
  glowYellow.append('feComposite').attr('in2', 'blur').attr('operator', 'in');
  const glowYellowMerge = glowYellow.append('feMerge');
  glowYellowMerge.append('feMergeNode');
  glowYellowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Zoom behavior
  const zoomGroup = svg.append('g').attr('class', 'zoom-group');
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      zoomGroup.attr('transform', event.transform);
    });
  svg.call(zoom);

  // Create layers
  const edgeGroup = zoomGroup.append('g').attr('class', 'edges');
  const nodeGroup = zoomGroup.append('g').attr('class', 'nodes');
  const labelGroup = zoomGroup.append('g').attr('class', 'labels');

  // State
  let currentLayout = options.layout || LAYOUT_TYPES.FORCE;
  let selectedNode = null;
  let simulation = null;
  let nodesData = [];
  let edgesData = [];

  function prepareData(g) {
    nodesData = Array.from(g.nodes.values()).map(n => ({ ...n }));
    edgesData = g.edges.map(e => ({
      ...e,
      source: typeof e.source === 'string' ? e.source : e.source.id,
      target: typeof e.target === 'string' ? e.target : e.target.id
    }));
  }

  function getNodeRadius(node) {
    const upstream = graph.adjacency.upstream;
    const downstream = graph.adjacency.downstream;
    const upCount = upstream.has(node.id) ? upstream.get(node.id).length : 0;
    const downCount = downstream.has(node.id) ? downstream.get(node.id).length : 0;
    const connections = upCount + downCount;
    return Math.min(25, Math.max(8, 8 + connections * 1.5));
  }

  function truncateLabel(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
  }

  function render() {
    prepareData(graph);

    // Edges
    const links = edgeGroup.selectAll('line')
      .data(edgesData, d => `${d.source}-${d.target}-${d.type}`)
      .join('line')
      .attr('stroke', '#4a4a6a')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead)');

    // Nodes
    const circles = nodeGroup.selectAll('circle')
      .data(nodesData, d => d.id)
      .join('circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => NODE_COLORS[d.type] || '#999')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .call(dragBehavior());

    // Enrichment badges
    nodeGroup.selectAll('.enrichment-badge').remove();
    nodeGroup.selectAll('.enrichment-badge')
      .data(nodesData.filter(d => d.enrichment), d => d.id)
      .join('circle')
      .attr('class', 'enrichment-badge')
      .attr('r', 4)
      .attr('fill', d => d.enrichment.type === 'field_parameter' ? '#e91e63' : '#673ab7')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none');

    // Labels
    const labels = labelGroup.selectAll('text')
      .data(nodesData, d => d.id)
      .join('text')
      .text(d => truncateLabel(d.name, 15))
      .attr('font-size', '10px')
      .attr('text-anchor', 'middle')
      .attr('dy', d => getNodeRadius(d) + 12)
      .attr('fill', '#e0e0e0')
      .attr('pointer-events', 'none');

    // Event handlers
    circles.on('click', (event, d) => {
      selectedNode = d;
      if (options.onNodeClick) options.onNodeClick(d);
    });

    circles.on('mouseenter', (event, d) => {
      if (options.onNodeHover) options.onNodeHover(d);
    });

    circles.on('mouseleave', () => {
      if (options.onNodeHover) options.onNodeHover(null);
    });

    if (currentLayout === LAYOUT_TYPES.FORCE) {
      applyForceLayout(links, circles, labels);
    } else {
      applyTreeLayout(links, circles, labels);
    }
  }

  function applyForceLayout(links, circles, labels) {
    if (simulation) simulation.stop();

    simulation = d3.forceSimulation(nodesData)
      .force('link', d3.forceLink(edgesData).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => getNodeRadius(d) + 5))
      .on('tick', () => {
        links
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        circles
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);

        nodeGroup.selectAll('.enrichment-badge')
          .attr('cx', d => {
            const node = nodesData.find(n => n.id === d.id);
            return node ? node.x + getNodeRadius(d) - 2 : 0;
          })
          .attr('cy', d => {
            const node = nodesData.find(n => n.id === d.id);
            return node ? node.y - getNodeRadius(d) + 2 : 0;
          });

        labels
          .attr('x', d => d.x)
          .attr('y', d => d.y);
      });
  }

  function applyTreeLayout(links, circles, labels) {
    if (simulation) simulation.stop();

    // Assign hierarchical depth by node type
    const depthOrder = {
      [NODE_TYPES.SOURCE]: 0,
      [NODE_TYPES.TABLE]: 1,
      [NODE_TYPES.COLUMN]: 2,
      [NODE_TYPES.MEASURE]: 2,
      [NODE_TYPES.VISUAL]: 3,
      [NODE_TYPES.PAGE]: 4
    };

    const padding = 60;
    const layerHeight = (height - padding * 2) / 5;

    // Group nodes by depth
    const layers = {};
    nodesData.forEach(d => {
      const depth = depthOrder[d.type] !== undefined ? depthOrder[d.type] : 2;
      if (!layers[depth]) layers[depth] = [];
      layers[depth].push(d);
    });

    // Position nodes
    Object.entries(layers).forEach(([depth, layerNodes]) => {
      const y = padding + parseInt(depth) * layerHeight;
      const spacing = (width - padding * 2) / (layerNodes.length + 1);
      layerNodes.forEach((node, i) => {
        node.x = padding + (i + 1) * spacing;
        node.y = y;
      });
    });

    links
      .attr('x1', d => {
        const s = nodesData.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
        return s ? s.x : 0;
      })
      .attr('y1', d => {
        const s = nodesData.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
        return s ? s.y : 0;
      })
      .attr('x2', d => {
        const t = nodesData.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
        return t ? t.x : 0;
      })
      .attr('y2', d => {
        const t = nodesData.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
        return t ? t.y : 0;
      });

    circles
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    labels
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  }

  function dragBehavior() {
    return d3.drag()
      .on('start', (event, d) => {
        if (simulation && !event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (simulation && !event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  function addLegend() {
    const legendData = Object.entries(NODE_COLORS);
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(20, 20)`);

    const items = legend.selectAll('.legend-item')
      .data(legendData)
      .join('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 22})`);

    items.append('circle')
      .attr('r', 6)
      .attr('cx', 6)
      .attr('cy', 0)
      .attr('fill', d => d[1]);

    items.append('text')
      .attr('x', 18)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('fill', '#a0a0b0')
      .text(d => d[0].charAt(0).toUpperCase() + d[0].slice(1));
  }

  // Initial render
  render();
  addLegend();

  // Return the renderer API
  const renderer = {
    update(newGraph) {
      graph = newGraph;
      render();
    },

    highlightNodes(nodeIds, type = 'upstream') {
      const idSet = new Set(nodeIds);
      const filterName = `glow-${type}`;

      nodeGroup.selectAll('circle')
        .attr('opacity', d => idSet.has(d.id) ? 1 : 0.1)
        .attr('filter', d => idSet.has(d.id) ? `url(#${filterName})` : null);

      edgeGroup.selectAll('line')
        .attr('opacity', d => {
          const srcId = typeof d.source === 'string' ? d.source : d.source.id;
          const tgtId = typeof d.target === 'string' ? d.target : d.target.id;
          return (idSet.has(srcId) && idSet.has(tgtId)) ? 1 : 0.1;
        });

      labelGroup.selectAll('text')
        .attr('opacity', d => idSet.has(d.id) ? 1 : 0.1);
    },

    resetHighlight() {
      nodeGroup.selectAll('circle')
        .attr('opacity', 1)
        .attr('filter', null);

      edgeGroup.selectAll('line')
        .attr('opacity', 0.6);

      labelGroup.selectAll('text')
        .attr('opacity', 1);
    },

    zoomToFit(padding = 40) {
      const bbox = zoomGroup.node().getBBox();
      if (bbox.width === 0 || bbox.height === 0) return;

      const fullWidth = width;
      const fullHeight = height;
      const scale = Math.min(
        (fullWidth - padding * 2) / bbox.width,
        (fullHeight - padding * 2) / bbox.height,
        2 // max scale
      );
      const tx = fullWidth / 2 - (bbox.x + bbox.width / 2) * scale;
      const ty = fullHeight / 2 - (bbox.y + bbox.height / 2) * scale;

      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
    },

    setLayout(layoutType) {
      currentLayout = layoutType;
      render();
    },

    destroy() {
      if (simulation) simulation.stop();
      d3.select(container).selectAll('*').remove();
    },

    getSelectedNode() {
      return selectedNode;
    },

    onNodeClick(callback) {
      options.onNodeClick = callback;
    },

    onNodeHover(callback) {
      options.onNodeHover = callback;
    }
  };

  return renderer;
}

/**
 * Export the current graph view as SVG markup.
 * @param {SVGElement|string} svgElementOrContainer - The SVG element or container selector.
 * @returns {string} The serialized SVG string.
 */
export function exportSvg(svgElementOrContainer) {
  let svgEl = svgElementOrContainer;
  if (typeof svgElementOrContainer === 'string') {
    const container = document.querySelector(svgElementOrContainer);
    svgEl = container ? container.querySelector('svg') : null;
  }
  if (!svgEl) return '';

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgEl);
}

/**
 * Export the current graph view as a PNG blob.
 * @param {SVGElement|string} svgElementOrContainer - The SVG element or container selector.
 * @param {number} [scale=2] - Scale factor for resolution.
 * @returns {Promise<Blob>} PNG blob.
 */
export async function exportPng(svgElementOrContainer, scale = 2) {
  const svgString = exportSvg(svgElementOrContainer);
  if (!svgString) return null;

  const svgEl = typeof svgElementOrContainer === 'string'
    ? document.querySelector(svgElementOrContainer)?.querySelector('svg')
    : svgElementOrContainer;

  const w = parseInt(svgEl.getAttribute('width')) || 960;
  const h = parseInt(svgEl.getAttribute('height')) || 600;

  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const img = new Image();
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}
