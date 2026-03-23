/**
 * Measure Picker - Left sidebar for the Lineage Trace view.
 * Displays a searchable, grouped list of all measures.
 * Supports: search count, orphan filter, DAX expression search.
 */

/**
 * Initialize the measure picker.
 * @param {{ onSelect: function }} callbacks
 */
export function initMeasurePicker(callbacks = {}) {
  const searchInput = document.getElementById('measure-search');
  if (searchInput) {
    let debounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => applyFilters(), 200);
    });
  }

  const orphanFilter = document.getElementById('orphan-filter');
  if (orphanFilter) {
    orphanFilter.addEventListener('change', () => applyFilters());
  }

  _callbacks = callbacks;
}

let _callbacks = {};
let _measures = []; // { id, name, table, expression, isOrphan }
let _graph = null;
let _searchQuery = '';
let _measureChangeCounts = new Map();

/**
 * Populate the measure list from graph data.
 * @param {{ nodes: Map }} graph
 */
export function populateMeasures(graph) {
  _graph = graph;
  _measures = [];

  const downstream = graph.adjacency?.downstream || new Map();

  for (const node of graph.nodes.values()) {
    if (node.type === 'measure') {
      const isOrphan = !downstream.has(node.id) || downstream.get(node.id).length === 0;
      _measures.push({
        id: node.id,
        name: node.name,
        table: node.metadata?.table || '',
        expression: node.metadata?.expression || '',
        description: node.metadata?.description || '',
        isOrphan,
        isHidden: node.metadata?.isHidden || false,
      });
    }
  }

  // Sort by table then name
  _measures.sort((a, b) => {
    const cmp = a.table.localeCompare(b.table);
    return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
  });

  updateCount();
  renderList(_measures);
}

function updateCount() {
  const badge = document.getElementById('measure-count');
  if (badge) badge.textContent = _measures.length;
}

function applyFilters() {
  const searchInput = document.getElementById('measure-search');
  const orphanFilter = document.getElementById('orphan-filter');
  const q = (searchInput?.value || '').toLowerCase().trim();
  const orphanOnly = orphanFilter?.checked || false;

  _searchQuery = q;

  let filtered = _measures;

  if (orphanOnly) {
    filtered = filtered.filter(m => m.isOrphan);
  }

  if (q) {
    filtered = filtered.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.table.toLowerCase().includes(q) ||
      m.expression.toLowerCase().includes(q)
    );
  }

  // Update search info
  const info = document.getElementById('measure-search-info');
  if (info) {
    if (q || orphanOnly) {
      info.classList.remove('hidden');
      info.textContent = `${filtered.length} of ${_measures.length} measures`;
    } else {
      info.classList.add('hidden');
    }
  }

  renderList(filtered);
}

function renderList(measures) {
  const container = document.getElementById('measure-list');
  if (!container) return;

  if (measures.length === 0) {
    container.innerHTML = '<div class="measure-empty">No measures found</div>';
    return;
  }

  // Group by table
  const groups = new Map();
  for (const m of measures) {
    const table = m.table || '(No Table)';
    if (!groups.has(table)) groups.set(table, []);
    groups.get(table).push(m);
  }

  let html = '';
  for (const [table, items] of groups) {
    html += `<details class="measure-group">`;
    html += `<summary class="measure-group-header">${escapeHtml(table)} <span class="measure-group-count">(${items.length})</span></summary>`;
    html += `<div class="measure-group-items">`;
    for (const m of items) {
      const orphanBadge = m.isOrphan ? ' <span class="measure-badge measure-badge-orphan" title="Not used by any visual">orphan</span>' : '';
      const hiddenBadge = m.isHidden ? ' <span class="measure-badge measure-badge-hidden" title="Hidden from report view">hidden</span>' : '';
      const changeCount = _measureChangeCounts.get(m.name) || 0;
      const changeBadge = changeCount > 0 ? ` <span class="measure-badge measure-badge-changed" title="${changeCount} change${changeCount !== 1 ? 's' : ''} in recent commits">${changeCount}</span>` : '';
      const tooltip = `${m.table}[${m.name}]${m.isOrphan ? ' (orphan)' : ''}${m.isHidden ? ' (hidden)' : ''}${changeCount > 0 ? ` (${changeCount} recent change${changeCount !== 1 ? 's' : ''})` : ''}${m.description ? '\n' + m.description : ''}\n${m.expression.substring(0, 120)}`;
      html += `<div class="measure-item${m.isHidden ? ' is-hidden-field' : ''}" data-id="${escapeHtml(m.id)}" title="${escapeHtml(tooltip)}">${highlightMatch(m.name, _searchQuery)}${hiddenBadge}${orphanBadge}${changeBadge}</div>`;
    }
    html += `</div></details>`;
  }

  container.innerHTML = html;

  // Bind click handlers
  container.querySelectorAll('.measure-item').forEach(el => {
    el.addEventListener('click', () => {
      // Remove previous active
      container.querySelectorAll('.measure-item.active').forEach(a => a.classList.remove('active'));
      el.classList.add('active');
      if (_callbacks.onSelect) _callbacks.onSelect(el.dataset.id);
    });
  });
}

/**
 * Programmatically select a measure by ID.
 */
export function selectMeasure(measureId) {
  const container = document.getElementById('measure-list');
  if (!container) return;

  container.querySelectorAll('.measure-item.active').forEach(a => a.classList.remove('active'));
  const el = container.querySelector(`[data-id="${CSS.escape(measureId)}"]`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Highlight matching text in a search result.
 */
function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const qEscaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${qEscaped})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

/**
 * Update change count badges on measure items.
 * @param {Map<string, number>} counts - Map of measure name → change count.
 */
export function updateChangeCounts(counts) {
  _measureChangeCounts = counts || new Map();
  applyFilters(); // re-render with badges
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
