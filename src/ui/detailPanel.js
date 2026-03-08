/**
 * Detail Panel - Manages the right-side detail panel that shows
 * information about the selected node, including properties,
 * DAX expression, and dependency lists.
 */

import { NODE_COLORS, NODE_LABELS, ENRICHMENT_TYPES } from '../utils/constants.js';

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
 * Show the detail panel for a selected node.
 * @param {object} node - The graph node to display.
 * @param {{ upstream: Array<string>, downstream: Array<string> }} impact - Impact analysis results.
 * @param {{ nodes: Array, edges: Array }} graph - The full graph for lookups.
 */
export function showNodeDetail(node, impact, graph) {
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
      html += `<li>${escapeHtml(field.reference || field.name)}</li>`;
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

  // Upstream dependencies
  if (impact && impact.upstream && impact.upstream.size > 0) {
    html += '<div class="detail-section"><h4>Upstream Dependencies</h4>';
    html += '<ul class="dep-list">';
    for (const id of impact.upstream) {
      const depNode = nodeMap.get(id);
      const label = depNode ? depNode.name : id;
      const badgeColor = depNode ? (NODE_COLORS[depNode.type] || '#757575') : '#757575';
      html += `<li data-node-id="${escapeHtml(id)}"><span class="type-badge" style="background:${badgeColor}; font-size:9px; padding:1px 4px; margin-right:4px;">${(depNode?.type || '').substring(0, 3).toUpperCase()}</span>${escapeHtml(label)}</li>`;
    }
    html += '</ul>';
    html += '</div>';
  }

  // Downstream dependents
  if (impact && impact.downstream && impact.downstream.size > 0) {
    html += '<div class="detail-section"><h4>Downstream Dependents</h4>';
    html += '<ul class="dep-list">';
    for (const id of impact.downstream) {
      const depNode = nodeMap.get(id);
      const label = depNode ? depNode.name : id;
      const badgeColor = depNode ? (NODE_COLORS[depNode.type] || '#757575') : '#757575';
      html += `<li data-node-id="${escapeHtml(id)}"><span class="type-badge" style="background:${badgeColor}; font-size:9px; padding:1px 4px; margin-right:4px;">${(depNode?.type || '').substring(0, 3).toUpperCase()}</span>${escapeHtml(label)}</li>`;
    }
    html += '</ul>';
    html += '</div>';
  }

  // Analyze Impact button
  html += '<div class="detail-section" style="text-align:center; margin-top:12px;">';
  html += '<button id="btn-analyze-impact" class="btn-primary" style="font-size:13px; padding:8px 16px;">Analyze Impact</button>';
  html += '</div>';

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
