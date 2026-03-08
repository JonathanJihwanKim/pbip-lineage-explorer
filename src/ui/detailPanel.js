/**
 * Detail Panel - Manages the right-side detail panel that shows
 * information about the selected node, including properties,
 * DAX expression, and dependency lists.
 */

import { NODE_COLORS, NODE_LABELS, ENRICHMENT_TYPES, NODE_TYPES } from '../utils/constants.js';
import { computeDepthMap } from '../graph/impactAnalysis.js';

let _callbacks = {};

/**
 * Initialize the detail panel.
 * @param {object} callbacks
 * @param {function} callbacks.onNodeNavigate - Called when a dependency link is clicked.
 * @param {function} callbacks.onClose - Called when the panel is closed.
 * @param {function} callbacks.onAnalyzeImpact - Called when Analyze Impact is clicked.
 */
export function initDetailPanel(callbacks = {}) {
  _callbacks = callbacks;

  const closeBtn = document.getElementById('btn-close-detail');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideDetailPanel();
      if (_callbacks.onClose) _callbacks.onClose();
    });
  }
}

/**
 * Group node IDs by type and order by lineage depth.
 * @param {Set<string>} nodeIds - Node IDs to group.
 * @param {Map} nodeMap - Full node map.
 * @param {Map} depthMap - Depth map from computeDepthMap.
 * @param {string} direction - 'upstream' or 'downstream'.
 * @returns {Array<{ type: string, nodes: Array }>}
 */
function groupByTypeAndDepth(nodeIds, nodeMap, depthMap, direction) {
  const typeOrder = direction === 'upstream'
    ? [NODE_TYPES.SOURCE, NODE_TYPES.TABLE, NODE_TYPES.COLUMN, NODE_TYPES.MEASURE]
    : [NODE_TYPES.MEASURE, NODE_TYPES.VISUAL, NODE_TYPES.PAGE];

  const groups = new Map();
  for (const id of nodeIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const entry = depthMap.get(id);
    if (entry && entry.direction !== direction) continue;
    if (!groups.has(node.type)) groups.set(node.type, []);
    groups.get(node.type).push({
      id: node.id,
      name: node.name,
      type: node.type,
      depth: entry ? entry.depth : 999,
      metadata: node.metadata
    });
  }

  // Sort within each group by depth
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.depth - b.depth);
  }

  // Order groups by type hierarchy
  const result = [];
  for (const type of typeOrder) {
    if (groups.has(type)) {
      result.push({ type, nodes: groups.get(type) });
      groups.delete(type);
    }
  }
  // Append any remaining types
  for (const [type, nodes] of groups) {
    result.push({ type, nodes });
  }
  return result;
}

/**
 * Show the detail panel for a selected node.
 * @param {object} node - The graph node to display.
 * @param {{ upstream: Set<string>, downstream: Set<string> }} impact - Impact analysis results.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The full graph for lookups.
 * @param {object} [options={}] - Display options.
 * @param {boolean} [options.focusMode=false] - Whether focus mode is active.
 */
export function showNodeDetail(node, impact, graph, options = {}) {
  const panel = document.getElementById('detail-panel');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('detail-content');
  if (!panel || !content) return;

  const nodeMap = graph?.nodes instanceof Map ? graph.nodes : new Map();

  // Set title
  if (title) title.textContent = node.name || node.id;

  // Build content
  let html = '';

  // Type badge and ID
  const color = NODE_COLORS[node.type] || '#757575';
  const typeLabel = NODE_LABELS[node.type] || node.type || 'Unknown';
  html += '<div class="detail-section">';
  html += `<span class="type-badge" style="background:${color}">${typeLabel}</span>`;

  // Enrichment badge
  if (node.enrichment?.type === ENRICHMENT_TYPES.FIELD_PARAMETER) {
    html += ' <span class="badge badge-field-param">Field Parameter</span>';
  } else if (node.enrichment?.type === ENRICHMENT_TYPES.CALCULATION_GROUP) {
    html += ' <span class="badge badge-calc-group">Calc Group</span>';
  }

  html += `<div class="detail-row"><span class="label">ID</span><span class="value">${escapeHtml(node.id)}</span></div>`;
  html += '</div>';

  // Properties section
  html += '<div class="detail-section"><h4>Properties</h4>';

  if (node.type === 'table') {
    const allNodes = graph ? Array.from(graph.nodes.values()) : [];
    const columns = allNodes.filter(n => n.type === 'column' && n.metadata?.table === node.name);
    const measures = allNodes.filter(n => n.type === 'measure' && n.metadata?.table === node.name);
    html += `<div class="detail-row"><span class="label">Columns</span><span class="value">${columns.length}</span></div>`;
    html += `<div class="detail-row"><span class="label">Measures</span><span class="value">${measures.length}</span></div>`;

    // Data source info from partition M expression
    if (node.metadata?.dataSource) {
      const ds = node.metadata.dataSource;
      html += '</div><div class="detail-section"><h4>Data Source</h4>';
      if (ds.sourceType) html += `<div class="detail-row"><span class="label">Type</span><span class="value">${escapeHtml(ds.sourceType)}</span></div>`;
      if (ds.server) html += `<div class="detail-row"><span class="label">Server</span><span class="value" style="word-break:break-all;font-size:11px;">${escapeHtml(ds.server)}</span></div>`;
      if (ds.database) html += `<div class="detail-row"><span class="label">Database</span><span class="value">${escapeHtml(ds.database)}</span></div>`;
      if (ds.schema) html += `<div class="detail-row"><span class="label">Schema</span><span class="value">${escapeHtml(ds.schema)}</span></div>`;
      if (ds.sourceTable) html += `<div class="detail-row"><span class="label">Source Table</span><span class="value">${escapeHtml(ds.sourceTable)}</span></div>`;
      if (ds.mode) html += `<div class="detail-row"><span class="label">Mode</span><span class="value">${escapeHtml(ds.mode)}</span></div>`;
    }
  }

  if (node.type === 'source') {
    if (node.metadata?.sourceType) html += `<div class="detail-row"><span class="label">Type</span><span class="value">${escapeHtml(node.metadata.sourceType)}</span></div>`;
    if (node.metadata?.server) html += `<div class="detail-row"><span class="label">Server</span><span class="value" style="word-break:break-all;font-size:11px;">${escapeHtml(node.metadata.server)}</span></div>`;
    if (node.metadata?.database) html += `<div class="detail-row"><span class="label">Database</span><span class="value">${escapeHtml(node.metadata.database)}</span></div>`;
    // Count connected tables
    const connectedTables = graph ? Array.from(graph.edges || []).filter(e => e.target === node.id && e.type === 'table_to_source').length : 0;
    if (connectedTables > 0) html += `<div class="detail-row"><span class="label">Tables</span><span class="value">${connectedTables}</span></div>`;
  }

  if (node.type === 'column') {
    if (node.metadata?.table) {
      html += `<div class="detail-row"><span class="label">Table</span><span class="value">${escapeHtml(node.metadata.table)}</span></div>`;
    }
    if (node.metadata?.dataType) {
      html += `<div class="detail-row"><span class="label">Data Type</span><span class="value">${escapeHtml(node.metadata.dataType)}</span></div>`;
    }
    if (node.metadata?.sourceColumn) {
      html += `<div class="detail-row"><span class="label">Source Column</span><span class="value">${escapeHtml(node.metadata.sourceColumn)}</span></div>`;
    }
  }

  if (node.type === 'measure') {
    if (node.metadata?.table) {
      html += `<div class="detail-row"><span class="label">Table</span><span class="value">${escapeHtml(node.metadata.table)}</span></div>`;
    }
  }

  if (node.type === 'visual') {
    if (node.metadata?.visualType) {
      html += `<div class="detail-row"><span class="label">Visual Type</span><span class="value">${escapeHtml(node.metadata.visualType)}</span></div>`;
    }
    if (node.metadata?.pageName) {
      html += `<div class="detail-row"><span class="label">Page</span><span class="value">${escapeHtml(node.metadata.pageName)}</span></div>`;
    }
    if (node.metadata?.fields && node.metadata.fields.length > 0) {
      html += `<div class="detail-row"><span class="label">Fields</span><span class="value">${node.metadata.fields.length}</span></div>`;
      html += '<ul class="dep-list">';
      for (const field of node.metadata.fields) {
        const fieldLabel = field.table ? `${field.table}[${field.column || field.measure || ''}]` : (field.column || field.measure || '');
        html += `<li>${escapeHtml(fieldLabel)}</li>`;
      }
      html += '</ul>';
    }
  }

  if (node.type === 'page') {
    const pageVisuals = graph ? Array.from(graph.nodes.values()).filter(n => n.type === 'visual' && n.metadata?.pageId === node.metadata?.pageId) : [];
    html += `<div class="detail-row"><span class="label">Visuals</span><span class="value">${pageVisuals.length}</span></div>`;
  }

  html += '</div>';

  // DAX expression for measures
  if (node.type === 'measure' && node.metadata?.expression) {
    html += '<div class="detail-section"><h4>DAX Expression</h4>';
    html += `<div class="dax-expression">${escapeHtml(node.metadata.expression)}</div>`;
    html += '</div>';
  }

  // Enrichment info
  if (node.enrichment?.type === ENRICHMENT_TYPES.FIELD_PARAMETER && node.enrichment.data?.fields) {
    html += '<div class="detail-section"><h4>Field Parameter Options</h4>';
    html += '<ul class="dep-list">';
    for (const field of node.enrichment.data.fields) {
      // Make references clickable by resolving to node IDs
      const refMatch = field.reference?.match(/'([^']+)'\[([^\]]+)\]/);
      let targetNodeId = null;
      if (refMatch) {
        const colId = `column::${refMatch[1]}.${refMatch[2]}`;
        const measureId = `measure::${refMatch[1]}.${refMatch[2]}`;
        targetNodeId = nodeMap.has(measureId) ? measureId : (nodeMap.has(colId) ? colId : null);
      }
      if (targetNodeId) {
        html += `<li data-node-id="${escapeHtml(targetNodeId)}">${escapeHtml(field.reference || field.name)}</li>`;
      } else {
        html += `<li>${escapeHtml(field.reference || field.name)}</li>`;
      }
    }
    html += '</ul>';
    if (node.enrichment.data.switchMeasure) {
      html += `<div class="detail-row"><span class="label">Switch Measure</span><span class="value">${escapeHtml(node.enrichment.data.switchMeasure)}</span></div>`;
    }
    html += '</div>';
  }

  if (node.enrichment?.type === ENRICHMENT_TYPES.CALCULATION_GROUP && node.enrichment.data?.items) {
    html += '<div class="detail-section"><h4>Calculation Group Items</h4>';
    html += '<ul class="dep-list">';
    for (const item of node.enrichment.data.items) {
      html += `<li>${escapeHtml(item.name)}</li>`;
    }
    html += '</ul>';
    html += '</div>';
  }

  // Compute depth map for grouped display
  const depthMap = graph?.adjacency ? computeDepthMap(node.id, graph.adjacency) : new Map();

  // Upstream dependencies (grouped by type, ordered by depth)
  if (impact && impact.upstream && impact.upstream.size > 0) {
    html += '<div class="detail-section"><h4>Upstream Dependencies</h4>';
    const grouped = groupByTypeAndDepth(impact.upstream, nodeMap, depthMap, 'upstream');
    for (const group of grouped) {
      const typeLabel = NODE_LABELS[group.type] || group.type;
      const typeColor = NODE_COLORS[group.type] || '#757575';
      html += `<div class="dep-group">`;
      html += `<div class="dep-group-header"><span class="type-badge" style="background:${typeColor}">${escapeHtml(typeLabel)}</span> <span class="dep-count">(${group.nodes.length})</span></div>`;
      html += '<ul class="dep-list">';
      for (const dep of group.nodes) {
        html += `<li data-node-id="${escapeHtml(dep.id)}">`;
        html += escapeHtml(dep.name);
        // Show source details inline
        if (dep.type === 'source' && dep.metadata) {
          if (dep.metadata.server) html += `<div class="dep-source-detail">Server: ${escapeHtml(dep.metadata.server)}</div>`;
          if (dep.metadata.database) html += `<div class="dep-source-detail">Database: ${escapeHtml(dep.metadata.database)}</div>`;
        }
        if (dep.type === 'table' && dep.metadata?.dataSource) {
          const ds = dep.metadata.dataSource;
          if (ds.schema) html += `<div class="dep-source-detail">Schema: ${escapeHtml(ds.schema)}</div>`;
          if (ds.sourceTable) html += `<div class="dep-source-detail">Source Table: ${escapeHtml(ds.sourceTable)}</div>`;
          if (ds.mode) html += `<div class="dep-source-detail">Mode: ${escapeHtml(ds.mode)}</div>`;
        }
        html += `</li>`;
      }
      html += '</ul></div>';
    }
    html += '</div>';
  }

  // Downstream dependents (grouped by type, ordered by depth)
  if (impact && impact.downstream && impact.downstream.size > 0) {
    html += '<div class="detail-section"><h4>Downstream Dependents</h4>';
    const grouped = groupByTypeAndDepth(impact.downstream, nodeMap, depthMap, 'downstream');
    for (const group of grouped) {
      const typeLabel = NODE_LABELS[group.type] || group.type;
      const typeColor = NODE_COLORS[group.type] || '#757575';
      html += `<div class="dep-group">`;
      html += `<div class="dep-group-header"><span class="type-badge" style="background:${typeColor}">${escapeHtml(typeLabel)}</span> <span class="dep-count">(${group.nodes.length})</span></div>`;
      html += '<ul class="dep-list">';
      for (const dep of group.nodes) {
        html += `<li data-node-id="${escapeHtml(dep.id)}">`;
        html += escapeHtml(dep.name);
        if (dep.type === 'visual' && dep.metadata?.visualType) {
          html += `<div class="dep-source-detail">Type: ${escapeHtml(dep.metadata.visualType)}</div>`;
        }
        html += `</li>`;
      }
      html += '</ul></div>';
    }
    html += '</div>';
  }

  // Focus Lineage / Analyze Impact button
  if (!options.focusMode) {
    html += '<div class="detail-section" style="text-align:center; margin-top:12px;">';
    html += '<button id="btn-analyze-impact" class="btn-primary" style="font-size:13px; padding:8px 16px;">Focus Lineage</button>';
    html += '</div>';
  }

  content.innerHTML = html;

  // Bind click handlers on dependency links
  const depLinks = content.querySelectorAll('.dep-list li[data-node-id]');
  for (const li of depLinks) {
    li.addEventListener('click', () => {
      const nodeId = li.dataset.nodeId;
      if (_callbacks.onNodeNavigate && nodeId) {
        _callbacks.onNodeNavigate(nodeId);
      }
    });
  }

  // Bind Analyze Impact button
  const impactBtn = content.querySelector('#btn-analyze-impact');
  if (impactBtn) {
    impactBtn.addEventListener('click', () => {
      if (_callbacks.onAnalyzeImpact) {
        _callbacks.onAnalyzeImpact(node.id, impact);
      }
    });
  }

  // Show panel
  panel.classList.remove('hidden');
}

/**
 * Hide the detail panel.
 */
export function hideDetailPanel() {
  const panel = document.getElementById('detail-panel');
  if (panel) {
    panel.classList.add('hidden');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
