/**
 * Visual Browser - Left sidebar tab for browsing pages and visuals.
 * Two-level collapsible tree: Pages → Visuals.
 * Mirrors the measurePicker pattern.
 */

import { collectPageVisuals, shortType, typeCategory, esc } from './pageLayoutData.js';

let _callbacks = {};
let _visuals = []; // { id, title, type, page, pageOrdinal, measureCount, columnCount }
let _allPages = []; // { name, ordinal } — all pages including empty ones
let _searchQuery = '';
let _pageChangeCounts = new Map(); // pageName → change count
let _graph = null; // stored for sidebar thumbnail previews

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

  _graph = graph;

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
    html += `<details class="visual-group">`;
    if (items.length === 0) {
      html += `<summary class="visual-group-header">${esc(page)} <span class="measure-group-count empty-page">(empty)</span></summary>`;
    } else {
      const pgChangeCount = _pageChangeCounts.get(page) || 0;
      const pgChangeBadge = pgChangeCount > 0 ? ` <span class="measure-badge measure-badge-changed page-change-badge" data-page="${esc(page)}" title="${pgChangeCount} change${pgChangeCount !== 1 ? 's' : ''} on this page — click to view">${pgChangeCount}</span>` : '';
      html += `<summary class="visual-group-header">${esc(page)} <span class="measure-group-count">(${items.length})</span>${pgChangeBadge}`;
      html += `<button class="page-layout-btn" data-page="${esc(page)}" aria-label="View page layout"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="14" height="14" rx="2"/><line x1="1" y1="5" x2="15" y2="5"/><line x1="6" y1="5" x2="6" y2="15"/></svg> Layout</button>`;
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
      const tip = document.getElementById('sidebar-tooltip');
      if (tip) tip.classList.add('hidden');
      if (_callbacks.onPageLayoutSelect) _callbacks.onPageLayoutSelect(btn.dataset.page);
    });

    btn.addEventListener('mouseenter', (e) => {
      let tip = document.getElementById('sidebar-tooltip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'sidebar-tooltip';
        tip.className = 'page-layout-tooltip sidebar-thumbnail-tip';
        document.body.appendChild(tip);
      }
      if (!btn._thumbnailHtml) {
        btn._thumbnailHtml = _buildThumbnail(btn.dataset.page);
      }
      if (btn._thumbnailHtml) {
        tip.innerHTML = btn._thumbnailHtml;
      } else {
        tip.textContent = 'View page layout';
      }
      const x = e.clientX + 12;
      const y = e.clientY + 12;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
      tip.classList.remove('hidden');
    });

    btn.addEventListener('mousemove', (e) => {
      const tip = document.getElementById('sidebar-tooltip');
      if (!tip) return;
      const x = e.clientX + 12;
      const y = e.clientY + 12;
      const maxX = window.innerWidth - tip.offsetWidth - 8;
      const maxY = window.innerHeight - tip.offsetHeight - 8;
      tip.style.left = `${Math.min(x, maxX)}px`;
      tip.style.top = `${Math.min(y, maxY)}px`;
    });

    btn.addEventListener('mouseleave', () => {
      const tip = document.getElementById('sidebar-tooltip');
      if (tip) tip.classList.add('hidden');
    });
  });

  container.querySelectorAll('.page-change-badge').forEach(badge => {
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (_callbacks.onPageChangeBadgeClick) {
        _callbacks.onPageChangeBadgeClick(badge.dataset.page);
      }
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
/**
 * Update page-level change counts for sidebar badges.
 * @param {Map<string, number>} counts - pageName → change count
 */
export function updatePageChangeCounts(counts) {
  _pageChangeCounts = counts || new Map();
  filterVisuals(_searchQuery); // re-render with badges
}

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

/**
 * Build a miniature page-layout preview HTML for the sidebar hover tooltip.
 * Cached on the button element as btn._thumbnailHtml after the first call.
 */
function _buildThumbnail(pageName) {
  if (!_graph) return null;
  let pageNode = null;
  for (const node of _graph.nodes.values()) {
    if (node.type === 'page' && node.name === pageName) { pageNode = node; break; }
  }
  if (!pageNode) return null;

  const { pageW, pageH, contentMaxY, visuals } = collectPageVisuals(pageNode, _graph);

  const thumbW = 220;
  const thumbH = Math.round(thumbW * pageH / pageW);

  const catBg = {
    chart: 'var(--color-table)',
    table: 'var(--color-column)',
    card: 'var(--color-visual)',
    filter: 'var(--color-measure)',
    other: 'var(--color-source)',
  };

  const positioned = visuals.filter(v => v.type !== 'group' && !v.isHidden && v.position);
  positioned.sort((a, b) => (a.position.z || 0) - (b.position.z || 0));

  let rects = '';
  for (const v of positioned) {
    const p = v.position;
    const left = (p.x / pageW * 100).toFixed(2);
    const top = (p.y / pageH * 100).toFixed(2);
    const width = (p.width / pageW * 100).toFixed(2);
    const height = (p.height / pageH * 100).toFixed(2);
    const bg = catBg[typeCategory(v.type)] || catBg.other;
    rects += `<div style="position:absolute;left:${left}%;top:${top}%;width:${width}%;height:${height}%;background:${bg};opacity:0.65;border-radius:1px;box-sizing:border-box;"></div>`;
  }

  const belowFold = contentMaxY > pageH
    ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">+ content below declared page bottom</div>`
    : '';

  return `<div style="font-size:11px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">${esc(pageName)}</div>` +
    `<div style="position:relative;width:${thumbW}px;height:${thumbH}px;background:var(--bg-body);border:1px solid rgba(66,133,244,0.35);border-radius:4px;overflow:hidden;">${rects}</div>` +
    belowFold +
    `<div style="font-size:10px;color:var(--text-muted);margin-top:6px;">Click to explore visual lineage</div>`;
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

