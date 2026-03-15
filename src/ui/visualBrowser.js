/**
 * Visual Browser - Left sidebar tab for browsing pages and visuals.
 * Two-level collapsible tree: Pages → Visuals.
 * Mirrors the measurePicker pattern.
 */

let _callbacks = {};
let _visuals = []; // { id, title, type, page, pageOrdinal, measureCount, columnCount }
let _allPages = []; // { name, ordinal } — all pages including empty ones
let _searchQuery = '';

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
      debounce = setTimeout(() => {
        _searchQuery = searchInput.value.toLowerCase().trim();
        filterVisuals(_searchQuery);
      }, 200);
    });
  }
}

/**
 * Populate the visual list from graph data.
 * @param {{ nodes: Map, adjacency: object }} graph
 */
export function populateVisuals(graph) {
  _visuals = [];
  _allPages = [];

  // Collect all pages from graph
  for (const node of graph.nodes.values()) {
    if (node.type === 'page') {
      _allPages.push({
        name: node.name || node.id,
        ordinal: node.metadata?.ordinal ?? 0,
      });
    }
  }

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

    // Count measures and columns this visual references (upstream)
    let measureCount = 0;
    let columnCount = 0;
    const upNeighbors = graph.adjacency.upstream.get(node.id) || [];
    for (const upId of upNeighbors) {
      const upNode = graph.nodes.get(upId);
      if (upNode && upNode.type === 'measure') measureCount++;
      if (upNode && upNode.type === 'column') columnCount++;
    }

    _visuals.push({
      id: node.id,
      title: node.metadata?.title || '',
      type: node.metadata?.visualType || node.name || 'visual',
      page: pageName,
      pageOrdinal,
      measureCount,
      columnCount,
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
  if (!query) {
    renderList(_visuals);
    return;
  }
  const filtered = _visuals.filter(v =>
    v.page.toLowerCase().includes(query) ||
    v.title.toLowerCase().includes(query) ||
    v.type.toLowerCase().includes(query)
  );
  renderList(filtered);
}

function renderList(visuals) {
  const container = document.getElementById('visual-list');
  if (!container) return;

  // Group by page
  const groups = new Map();
  for (const v of visuals) {
    const page = v.page || '(No Page)';
    if (!groups.has(page)) groups.set(page, []);
    groups.get(page).push(v);
  }

  // Add empty pages that have no visuals
  for (const p of _allPages) {
    if (!groups.has(p.name)) {
      groups.set(p.name, []);
    }
  }

  if (groups.size === 0) {
    container.innerHTML = '<div class="visual-empty">No visuals found</div>';
    return;
  }

  let html = '';
  for (const [page, items] of groups) {
    html += `<details class="visual-group" open>`;
    if (items.length === 0) {
      html += `<summary class="visual-group-header">${esc(page)} <span class="measure-group-count empty-page">(empty)</span></summary>`;
    } else {
      html += `<summary class="visual-group-header">${esc(page)} <span class="measure-group-count">(${items.length})</span>`;
      html += `<button class="page-layout-btn" data-page="${esc(page)}" title="Show page layout diagram">&#9638;</button>`;
      html += `</summary>`;
    }
    html += `<div class="visual-group-items">`;
    for (const v of items) {
      const label = v.title || generateVisualLabel(v);
      const tooltip = `${v.type} on ${v.page}\n${v.measureCount} measures, ${v.columnCount} fields`;
      const category = typeCategory(v.type);
      html += `<div class="visual-item" data-id="${esc(v.id)}" title="${esc(tooltip)}">`;
      html += `<span class="visual-type-badge" data-category="${category}">${esc(shortType(v.type))}</span>`;
      html += `<span class="visual-item-label">${highlightMatch(label, _searchQuery)}</span>`;
      if (v.measureCount > 0) {
        html += `<span class="visual-measure-count">${v.measureCount}</span>`;
      } else if (v.columnCount > 0) {
        html += `<span class="visual-field-count">${v.columnCount}f</span>`;
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

  container.querySelectorAll('.page-layout-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (_callbacks.onPageLayoutSelect) _callbacks.onPageLayoutSelect(btn.dataset.page);
    });
  });
}

/**
 * Generate a descriptive label for a visual with no title.
 */
function generateVisualLabel(v) {
  const typeLabel = shortType(v.type);
  if (v.measureCount > 0) return `${typeLabel} (${v.measureCount} measures)`;
  if (v.columnCount > 0) return `${typeLabel} (${v.columnCount} fields)`;
  return typeLabel;
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
    pivotTable: 'Pivot', clusteredColumnChart: 'CCol', clusteredBarChart: 'CBar',
    stackedColumnChart: 'SCol', stackedBarChart: 'SBar',
    hundredPercentStackedColumnChart: '%Col', hundredPercentStackedBarChart: '%Bar',
    lineClusteredColumnComboChart: 'Combo', decompositionTreeVisual: 'DTree',
    ribbonChart: 'Ribn', cardVisual: 'nCard',
  };
  return map[type] || type.substring(0, 5);
}

/**
 * Categorize a visual type for badge coloring.
 */
function typeCategory(type) {
  const charts = new Set([
    'barChart', 'columnChart', 'lineChart', 'areaChart', 'pieChart', 'donutChart',
    'scatterChart', 'waterfallChart', 'funnel', 'ribbonChart', 'treemap',
    'clusteredColumnChart', 'clusteredBarChart', 'stackedColumnChart', 'stackedBarChart',
    'hundredPercentStackedColumnChart', 'hundredPercentStackedBarChart',
    'lineClusteredColumnComboChart', 'decompositionTreeVisual',
  ]);
  const tables = new Set(['tableEx', 'matrix', 'pivotTable']);
  const cards = new Set(['card', 'multiRowCard', 'kpi', 'gauge', 'cardVisual']);
  const filters = new Set(['slicer']);

  if (charts.has(type)) return 'chart';
  if (tables.has(type)) return 'table';
  if (cards.has(type)) return 'card';
  if (filters.has(type)) return 'filter';
  return 'other';
}

/**
 * Highlight matching text in a search result.
 */
function highlightMatch(text, query) {
  if (!query) return esc(text);
  const escaped = esc(text);
  const qEscaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${qEscaped})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
