/**
 * Impact Analysis slide-over panel.
 * Shows upstream dependencies and downstream dependents for a selected node.
 */

import { analyzeImpact, exportImpactReport } from '@pbip-lineage/core';

// Node type colors (matching CSS variables)
const NODE_COLORS = {
  table: '#4285f4',
  column: '#9c27b0',
  measure: '#ff9800',
  visual: '#4caf50',
  page: '#00bcd4',
  source: '#757575',
  expression: '#607d8b',
};

let currentNodeId = null;
let currentGraph = null;
let currentDirection = 'downstream';
let callbacks = {};

/**
 * Initialize the impact panel with navigation callbacks.
 * @param {{ onMeasureNavigate: Function, onVisualNavigate: Function }} opts
 */
export function initImpactPanel(opts = {}) {
  callbacks = opts;

  const closeBtn = document.getElementById('impact-panel-close');
  if (closeBtn) closeBtn.addEventListener('click', closeImpactPanel);

  // Tab switching
  document.querySelectorAll('.impact-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentDirection = tab.dataset.direction;
      document.querySelectorAll('.impact-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      renderCurrentImpact();
    });
  });

  // Export button
  const exportBtn = document.getElementById('impact-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', handleExport);

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = document.getElementById('impact-panel');
      if (panel && !panel.classList.contains('hidden')) {
        closeImpactPanel();
      }
    }
  });
}

/**
 * Open the impact panel for a given node.
 * @param {string} nodeId - The node to analyze.
 * @param {object} graph - The full lineage graph.
 */
export function openImpactPanel(nodeId, graph) {
  currentNodeId = nodeId;
  currentGraph = graph;
  currentDirection = 'downstream';

  const panel = document.getElementById('impact-panel');
  const title = document.getElementById('impact-panel-title');
  const node = graph.nodes.get(nodeId);

  if (title) {
    title.textContent = node ? `Impact: ${node.name}` : 'Impact Analysis';
  }

  // Reset tabs to downstream
  document.querySelectorAll('.impact-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.direction === 'downstream');
  });

  if (panel) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    // Trigger animation on next frame
    requestAnimationFrame(() => panel.classList.add('visible'));
  }

  renderCurrentImpact();
}

/**
 * Close the impact panel.
 */
export function closeImpactPanel() {
  const panel = document.getElementById('impact-panel');
  if (panel) {
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    setTimeout(() => panel.classList.add('hidden'), 250);
  }
  currentNodeId = null;
  currentGraph = null;
}

/**
 * Render the current impact direction (upstream or downstream).
 */
function renderCurrentImpact() {
  if (!currentNodeId || !currentGraph) return;

  const container = document.getElementById('impact-panel-content');
  if (!container) return;

  const { upstream, downstream } = analyzeImpact(currentNodeId, currentGraph);
  const nodeIds = currentDirection === 'upstream' ? upstream : downstream;

  // Group nodes by type — skip file-artifact phantom nodes (from TMDL config files
  // like database.tmdl / model.tmdl that don't define user tables).
  const PHANTOM_TABLE_RE = /^(definition|database|model|culture|en-US|en_US)$|\.pbism$/i;
  const groups = {};
  for (const id of nodeIds) {
    const node = currentGraph.nodes.get(id);
    if (!node) continue;
    if (node.type === 'table' && PHANTOM_TABLE_RE.test(node.name)) continue;
    const type = node.type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(node);
  }

  if (Object.keys(groups).length === 0) {
    container.innerHTML = `<div class="impact-empty">No ${currentDirection} dependencies found.</div>`;
    return;
  }

  // Render order: visuals first, then measures, columns, tables, sources
  const typeOrder = ['visual', 'measure', 'column', 'table', 'source', 'page', 'expression'];
  const typeLabels = {
    visual: 'Visuals', measure: 'Measures', column: 'Columns',
    table: 'Tables', source: 'Sources', page: 'Pages', expression: 'Expressions',
  };

  let html = '';
  for (const type of typeOrder) {
    const items = groups[type];
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.name.localeCompare(b.name));

    html += `<div class="impact-group">`;
    html += `<div class="impact-group-header">`;
    html += `<span>${typeLabels[type] || type}</span>`;
    html += `<span class="impact-group-count">${items.length}</span>`;
    html += `</div>`;
    html += `<div class="impact-group-items">`;
    for (const node of items) {
      const color = NODE_COLORS[node.type] || '#888';
      const escapedName = escapeHtml(node.name);
      const navigable = node.type === 'measure' || node.type === 'visual';
      html += `<div class="impact-item${navigable ? ' impact-item-navigable' : ''}" data-id="${escapeHtml(node.id)}" data-type="${node.type}">`;
      html += `<span class="impact-item-dot" style="background:${color}"></span>`;
      html += `<span class="impact-item-name" title="${escapedName}">${escapedName}</span>`;
      html += `</div>`;
    }
    html += `</div></div>`;
  }

  container.innerHTML = html;

  // Attach click handlers for navigable items
  container.querySelectorAll('.impact-item-navigable').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const type = el.dataset.type;
      closeImpactPanel();
      if (type === 'measure' && callbacks.onMeasureNavigate) {
        callbacks.onMeasureNavigate(id);
      } else if (type === 'visual' && callbacks.onVisualNavigate) {
        callbacks.onVisualNavigate(id);
      }
    });
  });
}

/**
 * Handle export button click.
 */
function handleExport() {
  if (!currentNodeId || !currentGraph) return;

  const markdown = exportImpactReport(currentNodeId, currentGraph, 'markdown');
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const node = currentGraph.nodes.get(currentNodeId);
  a.href = url;
  a.download = `impact-${(node?.name || 'report').replace(/[^a-zA-Z0-9]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);

  // Visual feedback
  const btn = document.getElementById('impact-export-btn');
  if (btn) {
    const prev = btn.textContent;
    btn.textContent = 'Exported!';
    setTimeout(() => { btn.textContent = prev; }, 1500);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
