/**
 * Measure Picker - Left sidebar for the Lineage Trace view.
 * Displays a searchable, grouped list of all measures.
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
      debounce = setTimeout(() => filterMeasures(searchInput.value), 200);
    });
  }

  _callbacks = callbacks;
}

let _callbacks = {};
let _measures = []; // { id, name, table }
let _graph = null;

/**
 * Populate the measure list from graph data.
 * @param {{ nodes: Map }} graph
 */
export function populateMeasures(graph) {
  _graph = graph;
  _measures = [];

  for (const node of graph.nodes.values()) {
    if (node.type === 'measure') {
      _measures.push({
        id: node.id,
        name: node.name,
        table: node.metadata?.table || '',
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

function filterMeasures(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderList(_measures);
    return;
  }

  const filtered = _measures.filter(m =>
    m.name.toLowerCase().includes(q) || m.table.toLowerCase().includes(q)
  );
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
    html += `<details class="measure-group" open>`;
    html += `<summary class="measure-group-header">${escapeHtml(table)} <span class="measure-group-count">(${items.length})</span></summary>`;
    html += `<div class="measure-group-items">`;
    for (const m of items) {
      html += `<div class="measure-item" data-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</div>`;
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

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
