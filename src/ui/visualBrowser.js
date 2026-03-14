/**
 * Visual Browser - Left sidebar tab for browsing pages and visuals.
 * Two-level collapsible tree: Pages → Visuals.
 * Mirrors the measurePicker pattern.
 */

let _callbacks = {};
let _visuals = []; // { id, title, type, page, pageOrdinal, measureCount }

/**
 * Initialize the visual browser.
 * @param {{ onVisualSelect: function, onMeasureNavigate: function }} callbacks
 */
export function initVisualBrowser(callbacks = {}) {
  _callbacks = callbacks;

  const searchInput = document.getElementById('visual-search');
  if (searchInput) {
    let debounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => filterVisuals(searchInput.value), 200);
    });
  }
}

/**
 * Populate the visual list from graph data.
 * @param {{ nodes: Map, adjacency: object }} graph
 */
export function populateVisuals(graph) {
  _visuals = [];

  for (const node of graph.nodes.values()) {
    if (node.type !== 'visual') continue;

    // Determine page name and ordinal
    let pageName = node.metadata?.pageName || '';
    let pageOrdinal = 0;

    if (!pageName) {
      const downNeighbors = graph.adjacency.downstream.get(node.id) || [];
      for (const nId of downNeighbors) {
        const n = graph.nodes.get(nId);
        if (n && n.type === 'page') {
          pageName = n.name;
          pageOrdinal = n.metadata?.ordinal ?? 0;
          break;
        }
      }
    }

    // Count measures this visual references (upstream)
    let measureCount = 0;
    const upNeighbors = graph.adjacency.upstream.get(node.id) || [];
    for (const upId of upNeighbors) {
      const upNode = graph.nodes.get(upId);
      if (upNode && upNode.type === 'measure') measureCount++;
    }

    _visuals.push({
      id: node.id,
      title: node.metadata?.title || '',
      type: node.metadata?.visualType || node.name || 'visual',
      page: pageName,
      pageOrdinal,
      measureCount,
    });
  }

  // Sort: pages by ordinal, visuals by title within page
  _visuals.sort((a, b) => {
    if (a.pageOrdinal !== b.pageOrdinal) return a.pageOrdinal - b.pageOrdinal;
    const pageCmp = a.page.localeCompare(b.page);
    if (pageCmp !== 0) return pageCmp;
    return a.title.localeCompare(b.title);
  });

  updateCount();
  renderList(_visuals);
}

function updateCount() {
  const badge = document.getElementById('visual-count');
  if (badge) badge.textContent = _visuals.length;
}

function filterVisuals(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderList(_visuals);
    return;
  }
  const filtered = _visuals.filter(v =>
    v.page.toLowerCase().includes(q) ||
    v.title.toLowerCase().includes(q) ||
    v.type.toLowerCase().includes(q)
  );
  renderList(filtered);
}

function renderList(visuals) {
  const container = document.getElementById('visual-list');
  if (!container) return;

  if (visuals.length === 0) {
    container.innerHTML = '<div class="visual-empty">No visuals found</div>';
    return;
  }

  // Group by page
  const groups = new Map();
  for (const v of visuals) {
    const page = v.page || '(No Page)';
    if (!groups.has(page)) groups.set(page, []);
    groups.get(page).push(v);
  }

  let html = '';
  for (const [page, items] of groups) {
    html += `<details class="visual-group" open>`;
    html += `<summary class="visual-group-header">${esc(page)} <span class="measure-group-count">(${items.length})</span></summary>`;
    html += `<div class="visual-group-items">`;
    for (const v of items) {
      const label = v.title || v.type || 'Visual';
      html += `<div class="visual-item" data-id="${esc(v.id)}">`;
      html += `<span class="visual-type-badge">${esc(shortType(v.type))}</span>`;
      html += `<span class="visual-item-label">${esc(label)}</span>`;
      if (v.measureCount > 0) {
        html += `<span class="visual-measure-count">${v.measureCount}</span>`;
      }
      html += `</div>`;
    }
    html += `</div></details>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.visual-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.visual-item.active').forEach(a => a.classList.remove('active'));
      el.classList.add('active');
      if (_callbacks.onVisualSelect) _callbacks.onVisualSelect(el.dataset.id);
    });
  });
}

/**
 * Programmatically select a visual by ID.
 */
export function selectVisual(visualId) {
  const container = document.getElementById('visual-list');
  if (!container) return;
  container.querySelectorAll('.visual-item.active').forEach(a => a.classList.remove('active'));
  const el = container.querySelector(`[data-id="${CSS.escape(visualId)}"]`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'nearest' });
  }
}

function shortType(type) {
  if (!type) return '?';
  const map = {
    barChart: 'Bar', columnChart: 'Col', lineChart: 'Line', areaChart: 'Area',
    pieChart: 'Pie', donutChart: 'Donut', card: 'Card', multiRowCard: 'mCard',
    tableEx: 'Table', matrix: 'Matrix', slicer: 'Slicer', map: 'Map',
    filledMap: 'Map', scatterChart: 'Scatter', waterfallChart: 'Waterfall',
    funnel: 'Funnel', gauge: 'Gauge', kpi: 'KPI', treemap: 'Tree',
    image: 'Img', textbox: 'Text', shape: 'Shape', actionButton: 'Btn',
  };
  return map[type] || type.substring(0, 4);
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
