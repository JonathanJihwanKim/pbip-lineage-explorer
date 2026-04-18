/**
 * Page Layout Diagram — renders a scaled visual layout of a Power BI report page.
 * Features: dynamic canvas height (scrollable pages), fold-line, companion visual list,
 * hidden-visual toggle, and bidirectional hover highlight between canvas and list.
 */

import { collectPageVisuals, shortType, typeCategory, esc } from './pageLayoutData.js';

let _callbacks = {};
let _currentPageNode = null;
let _currentGraph = null;
let _currentVisuals = []; // resolved for current page, used by live event handlers
let _sortOrder = 'z';
let _listQuery = '';

export function initPageLayout(callbacks = {}) {
  _callbacks = callbacks;
}

/**
 * Render (or re-render) the page layout for the given page node.
 * Stores state so the hidden-visual toggle can trigger a full repaint without
 * needing to re-fetch the page node.
 * @param {object} pageNode
 * @param {object} graph
 */
export function renderPageLayout(pageNode, graph) {
  _currentPageNode = pageNode;
  _currentGraph = graph;
  _listQuery = '';
  _repaint();
}

// ---------------------------------------------------------------------------
// Core render
// ---------------------------------------------------------------------------

function _repaint() {
  const empty = document.getElementById('lineage-empty');
  const content = document.getElementById('lineage-content');
  const sourceMap = document.getElementById('source-map-container');
  const titleEl = document.getElementById('lineage-title');
  const treeContainer = document.getElementById('lineage-tree-container');
  const sectionsContainer = document.getElementById('lineage-sections');

  if (!content) return;
  if (empty) empty.classList.add('hidden');
  if (sourceMap) sourceMap.classList.add('hidden');
  content.classList.remove('hidden');

  const { pageW, pageH, contentMaxY, visuals } = collectPageVisuals(_currentPageNode, _currentGraph);
  _currentVisuals = visuals;

  const showHidden = sessionStorage.getItem('pbip-show-hidden') === 'true';

  // Title + subtitle (pageW × pageH; note below-fold extension if any)
  if (titleEl) {
    titleEl.textContent = _currentPageNode.name;
    const oldSub = titleEl.nextElementSibling;
    if (oldSub && oldSub.classList.contains('lineage-subtitle')) oldSub.remove();
    const sub = document.createElement('div');
    sub.className = 'lineage-subtitle';
    const ext = contentMaxY > pageH
      ? ` \u00b7 content extends to ${Math.round(contentMaxY)}px`
      : '';
    sub.textContent = `${pageW} \u00d7 ${pageH}${ext}`;
    titleEl.insertAdjacentElement('afterend', sub);
  }

  const nonGroups = visuals.filter(v => v.type !== 'group');
  const visibleVisuals = nonGroups.filter(v => !v.isHidden);
  const hiddenVisuals = nonGroups.filter(v => v.isHidden);
  const hasHidden = hiddenVisuals.length > 0;

  // --- Canvas (in #lineage-tree-container) ---
  const paddingPct = (contentMaxY / pageW * 100).toFixed(4);
  let canvasHtml = `<div class="page-layout-canvas" id="page-layout-canvas" style="padding-bottom:${paddingPct}%">`;
  canvasHtml += _buildCanvasVisuals(visibleVisuals, hiddenVisuals, pageW, pageH, contentMaxY, showHidden);
  canvasHtml += `</div>`;

  if (treeContainer) treeContainer.innerHTML = `<div class="page-layout-canvas-wrapper">${canvasHtml}</div>`;

  // --- Controls + companion list (in #lineage-sections) ---
  const statsText = `${visibleVisuals.length} visual${visibleVisuals.length !== 1 ? 's' : ''}` +
    (hasHidden ? ` (${hiddenVisuals.length} hidden)` : '');
  const hiddenToggle = hasHidden
    ? `<label class="show-hidden-label"><input type="checkbox" id="show-hidden-toggle"${showHidden ? ' checked' : ''}> Show hidden</label>`
    : '';

  const listHtml = _buildListHtml(nonGroups, _sortOrder, _listQuery, showHidden);

  const sectionsHtml = `
    <div class="page-layout-controls">
      <span class="page-layout-stats">${statsText}</span>
      ${hiddenToggle}
    </div>
    <div class="layout-list-controls">
      <span class="layout-list-heading">All visuals (${nonGroups.length})</span>
      <input id="layout-list-filter" class="layout-list-filter" placeholder="Filter by title, type, measure, or column\u2026" value="${esc(_listQuery)}">
      <span class="layout-list-legend">m\u00a0= measures\u00a0\u00b7\u00a0f\u00a0= fields (columns)</span>
      <select id="layout-list-sort" class="layout-list-sort">
        <option value="z"${_sortOrder === 'z' ? ' selected' : ''}>Z-order</option>
        <option value="measures"${_sortOrder === 'measures' ? ' selected' : ''}>Measures \u2193</option>
        <option value="title"${_sortOrder === 'title' ? ' selected' : ''}>Title</option>
      </select>
    </div>
    <div id="layout-list-body" class="layout-list-body">${listHtml}</div>
    <div class="sponsor-footer">Built with <span class="sponsor-heart">\u2665</span> by Jihwan Kim \u00b7 <a href="https://github.com/sponsors/JonathanJihwanKim" target="_blank" rel="noopener">Sponsor</a></div>
  `;

  if (sectionsContainer) sectionsContainer.innerHTML = sectionsHtml;

  // Ensure floating tooltip element exists in <body>
  if (!document.getElementById('page-layout-tooltip')) {
    const tip = document.createElement('div');
    tip.id = 'page-layout-tooltip';
    tip.className = 'page-layout-tooltip hidden';
    document.body.appendChild(tip);
  }

  // Bind delegated events once per container (survives innerHTML replacements)
  _bindDelegatedOnce(treeContainer, sectionsContainer);
}

function _repaintList() {
  const listBody = document.getElementById('layout-list-body');
  if (!listBody) return;
  const showHidden = sessionStorage.getItem('pbip-show-hidden') === 'true';
  const nonGroups = _currentVisuals.filter(v => v.type !== 'group');
  listBody.innerHTML = _buildListHtml(nonGroups, _sortOrder, _listQuery, showHidden);
}

// ---------------------------------------------------------------------------
// HTML builders
// ---------------------------------------------------------------------------

function _buildCanvasVisuals(visibleVisuals, hiddenVisuals, pageW, pageH, contentMaxY, showHidden) {
  let html = '';

  const positioned = visibleVisuals.filter(v => v.position);
  positioned.sort((a, b) => (a.position.z || 0) - (b.position.z || 0));

  for (const v of positioned) {
    html += _visualRect(v, pageW, contentMaxY, false);
  }

  if (showHidden) {
    const hiddenPositioned = hiddenVisuals.filter(v => v.position);
    hiddenPositioned.sort((a, b) => (a.position.z || 0) - (b.position.z || 0));
    for (const v of hiddenPositioned) {
      html += _visualRect(v, pageW, contentMaxY, true);
    }
  }

  // Dashed fold line when visuals extend below declared page height
  if (contentMaxY > pageH) {
    const foldPct = (pageH / contentMaxY * 100).toFixed(3);
    html += `<div class="page-layout-fold-line" style="top:${foldPct}%">`;
    html += `<span class="page-layout-fold-label">page bottom (${pageH}px)</span>`;
    html += `</div>`;
  }

  return html;
}

function _visualRect(v, pageW, contentMaxY, isHidden) {
  const p = v.position;
  const left = (p.x / pageW * 100).toFixed(3);
  const top = (p.y / contentMaxY * 100).toFixed(3);
  const width = (p.width / pageW * 100).toFixed(3);
  const height = (p.height / contentMaxY * 100).toFixed(3);
  const zIndex = p.z != null ? Math.max(0, Math.floor(p.z / 100)) : 'auto';
  const cat = typeCategory(v.type);
  const label = v.title || shortType(v.type);
  const parts = [];
  if (v.measureCount > 0) parts.push(`${v.measureCount}m`);
  if (v.fpMeasures && v.fpMeasures.length > 0) parts.push(`+${v.fpMeasures.length}fp`);
  if (v.columnCount > 0) parts.push(`${v.columnCount}f`);
  const hiddenClass = isHidden ? ' page-layout-hidden-visual' : '';
  const hasBindings = v.measureCount > 0 || v.columnCount > 0 || (v.fpMeasures && v.fpMeasures.length > 0);
  const noBindingClass = hasBindings ? '' : ' page-layout-nobinding';
  let html = `<div class="page-layout-visual${hiddenClass}${noBindingClass}" data-id="${esc(v.id)}" data-category="${cat}" `;
  html += `style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;z-index:${zIndex}" title="">`;
  html += `<span class="page-layout-visual-badge" data-category="${cat}">${esc(shortType(v.type))}</span>`;
  html += `<span class="page-layout-visual-title">${esc(label)}</span>`;
  if (parts.length > 0) {
    const metaTitleParts = [];
    if (v.measureCount > 0) metaTitleParts.push(`${v.measureCount} measure${v.measureCount !== 1 ? 's' : ''}`);
    if (v.fpMeasures && v.fpMeasures.length > 0) metaTitleParts.push(`${v.fpMeasures.length} via field parameter`);
    if (v.columnCount > 0) metaTitleParts.push(`${v.columnCount} field${v.columnCount !== 1 ? 's' : ''} (columns)`);
    html += `<span class="page-layout-visual-meta" title="${metaTitleParts.join(', ')}">${parts.join('\u00a0')}</span>`;
  }
  if (isHidden) html += `<span class="page-layout-hidden-chip">HIDDEN</span>`;
  html += `</div>`;
  return html;
}

function _buildListHtml(nonGroups, sortOrder, query, showHidden) {
  let list = showHidden ? nonGroups : nonGroups.filter(v => !v.isHidden);

  if (query) {
    const q = query.toLowerCase();
    list = list.filter(v =>
      v.title.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q) ||
      v.measures.some(m => m.toLowerCase().includes(q)) ||
      v.fpMeasures.some(m => m.toLowerCase().includes(q)) ||
      v.columns.some(c => c.toLowerCase().includes(q))
    );
  }

  if (sortOrder === 'measures') {
    list = [...list].sort((a, b) => b.measureCount - a.measureCount || a.title.localeCompare(b.title));
  } else if (sortOrder === 'title') {
    list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  } else {
    // z-order: positioned visuals first (sorted by z), unpositioned at end
    const hasPos = list.filter(v => v.position);
    const noPos = list.filter(v => !v.position);
    hasPos.sort((a, b) => (a.position.z || 0) - (b.position.z || 0));
    list = [...hasPos, ...noPos];
  }

  if (list.length === 0) {
    return '<div class="layout-list-empty">No visuals match filter</div>';
  }

  return list.map(v => {
    const cat = typeCategory(v.type);
    const label = v.title || shortType(v.type);
    const metaParts = [];
    if (v.measureCount > 0) metaParts.push(`${v.measureCount}m`);
    if (v.fpMeasures && v.fpMeasures.length > 0) metaParts.push(`+${v.fpMeasures.length}fp`);
    if (v.columnCount > 0) metaParts.push(`${v.columnCount}f`);
    const metaTitleParts = [];
    if (v.measureCount > 0) metaTitleParts.push(`${v.measureCount} measure${v.measureCount !== 1 ? 's' : ''}`);
    if (v.fpMeasures && v.fpMeasures.length > 0) metaTitleParts.push(`${v.fpMeasures.length} via field parameter`);
    if (v.columnCount > 0) metaTitleParts.push(`${v.columnCount} field${v.columnCount !== 1 ? 's' : ''} (columns)`);
    const zVal = v.position?.z != null ? Math.floor(v.position.z / 100) : null;
    const zBadge = zVal != null ? `<span class="layout-list-z">z${zVal}</span>` : '';
    const noPosBadge = !v.position ? `<span class="layout-list-badge layout-badge-nopos">no pos</span>` : '';
    const hiddenBadge = v.isHidden ? `<span class="layout-list-badge layout-badge-hidden">HIDDEN</span>` : '';
    return `<div class="layout-list-row${v.isHidden ? ' is-hidden' : ''}" data-id="${esc(v.id)}">` +
      `<span class="visual-type-badge" data-category="${cat}">${esc(shortType(v.type))}</span>` +
      `<span class="layout-list-title">${esc(label)}</span>` +
      `${hiddenBadge}${noPosBadge}` +
      `<span class="layout-list-meta" title="${metaTitleParts.join(', ')}">${metaParts.join('\u00a0')}</span>` +
      `${zBadge}` +
      `</div>`;
  }).join('');
}

function _buildTooltipHtml(v) {
  let html = `<div class="tip-title">${esc(v.title || shortType(v.type))}</div>`;
  html += `<div class="tip-type">${esc(v.type)}</div>`;
  if (v.measures.length > 0) {
    html += `<div class="tip-section">Measures (${v.measures.length})</div>`;
    html += `<div class="tip-list">${v.measures.map(m => esc(m)).join('<br>')}</div>`;
  }
  if (v.fpMeasures.length > 0) {
    const fpLabel = v.fpTables.length > 0 ? `via ${v.fpTables.join(', ')}` : 'field parameter';
    html += `<div class="tip-section">FP Measures (${v.fpMeasures.length}) <span class="tip-fp-badge">${esc(fpLabel)}</span></div>`;
    html += `<div class="tip-list">${v.fpMeasures.map(m => esc(m)).join('<br>')}</div>`;
  }
  if (v.columns.length > 0) {
    html += `<div class="tip-section">Columns (${v.columns.length})</div>`;
    html += `<div class="tip-list">${v.columns.map(c => esc(c)).join('<br>')}</div>`;
  }
  if (v.measures.length === 0 && v.fpMeasures.length === 0 && v.columns.length === 0) {
    html += `<div class="tip-muted">No field bindings</div>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Event delegation — bound once per container, survives innerHTML swaps
// ---------------------------------------------------------------------------

function _bindDelegatedOnce(treeContainer, sectionsContainer) {
  if (treeContainer && !treeContainer.dataset.pageLayoutBound) {
    treeContainer.dataset.pageLayoutBound = '1';

    // Canvas click → lineage
    treeContainer.addEventListener('click', (e) => {
      const el = e.target.closest('.page-layout-visual');
      if (!el || !el.dataset.id) return;
      const tip = document.getElementById('page-layout-tooltip');
      if (tip) tip.classList.add('hidden');
      if (_callbacks.onVisualSelect) _callbacks.onVisualSelect(el.dataset.id);
    });

    // Canvas hover enter → highlight list row + tooltip
    treeContainer.addEventListener('mouseover', (e) => {
      const el = e.target.closest('.page-layout-visual');
      if (!el || !el.dataset.id) return;
      // Skip re-fire when moving between children of same rect
      const fromEl = e.relatedTarget?.closest?.('.page-layout-visual');
      if (fromEl === el) return;

      const listBody = document.getElementById('layout-list-body');
      if (listBody) {
        const row = listBody.querySelector(`.layout-list-row[data-id="${CSS.escape(el.dataset.id)}"]`);
        if (row) { row.classList.add('layout-highlight'); }
      }
      const tip = document.getElementById('page-layout-tooltip');
      if (tip) {
        const v = _currentVisuals.find(vis => vis.id === el.dataset.id);
        if (v) { tip.innerHTML = _buildTooltipHtml(v); tip.classList.remove('hidden'); }
      }
    });

    // Canvas hover move → reposition tooltip
    treeContainer.addEventListener('mousemove', (e) => {
      if (!e.target.closest('.page-layout-visual')) return;
      _moveTooltip(e);
    });

    // Canvas hover leave → clear list highlight + tooltip
    treeContainer.addEventListener('mouseout', (e) => {
      const el = e.target.closest('.page-layout-visual');
      if (!el || !el.dataset.id) return;
      const toEl = e.relatedTarget?.closest?.('.page-layout-visual');
      if (toEl === el) return; // still inside same rect

      const listBody = document.getElementById('layout-list-body');
      if (listBody) {
        const row = listBody.querySelector(`.layout-list-row[data-id="${CSS.escape(el.dataset.id)}"]`);
        if (row) row.classList.remove('layout-highlight');
      }
      const tip = document.getElementById('page-layout-tooltip');
      if (tip) tip.classList.add('hidden');
    });
  }

  if (sectionsContainer && !sectionsContainer.dataset.pageLayoutBound) {
    sectionsContainer.dataset.pageLayoutBound = '1';

    let _filterDebounce = null;

    // List row hover enter → highlight canvas rect + tooltip
    sectionsContainer.addEventListener('mouseover', (e) => {
      const row = e.target.closest('.layout-list-row');
      if (!row || !row.dataset.id) return;
      const fromRow = e.relatedTarget?.closest?.('.layout-list-row');
      if (fromRow === row) return;

      const canvas = document.getElementById('page-layout-canvas');
      if (canvas) {
        const rect = canvas.querySelector(`.page-layout-visual[data-id="${CSS.escape(row.dataset.id)}"]`);
        if (rect) rect.classList.add('layout-highlight');
      }
      row.classList.add('layout-highlight');

      const tip = document.getElementById('page-layout-tooltip');
      if (tip) {
        const v = _currentVisuals.find(vis => vis.id === row.dataset.id);
        if (v) { tip.innerHTML = _buildTooltipHtml(v); tip.classList.remove('hidden'); }
      }
    });

    // List row hover move → reposition tooltip
    sectionsContainer.addEventListener('mousemove', (e) => {
      if (!e.target.closest('.layout-list-row')) return;
      _moveTooltip(e);
    });

    // List row hover leave → clear canvas highlight + tooltip
    sectionsContainer.addEventListener('mouseout', (e) => {
      const row = e.target.closest('.layout-list-row');
      if (!row || !row.dataset.id) return;
      const toRow = e.relatedTarget?.closest?.('.layout-list-row');
      if (toRow === row) return;

      const canvas = document.getElementById('page-layout-canvas');
      if (canvas) {
        const rect = canvas.querySelector(`.page-layout-visual[data-id="${CSS.escape(row.dataset.id)}"]`);
        if (rect) rect.classList.remove('layout-highlight');
      }
      row.classList.remove('layout-highlight');
      const tip = document.getElementById('page-layout-tooltip');
      if (tip) tip.classList.add('hidden');
    });

    // List row click → lineage
    sectionsContainer.addEventListener('click', (e) => {
      const row = e.target.closest('.layout-list-row');
      if (row && row.dataset.id) {
        const tip = document.getElementById('page-layout-tooltip');
        if (tip) tip.classList.add('hidden');
        if (_callbacks.onVisualSelect) _callbacks.onVisualSelect(row.dataset.id);
      }
    });

    // Controls: show-hidden toggle + sort + filter (delegated change/input)
    sectionsContainer.addEventListener('change', (e) => {
      if (e.target.id === 'show-hidden-toggle') {
        sessionStorage.setItem('pbip-show-hidden', e.target.checked ? 'true' : 'false');
        _repaint();
      } else if (e.target.id === 'layout-list-sort') {
        _sortOrder = e.target.value;
        _repaintList();
      }
    });

    sectionsContainer.addEventListener('input', (e) => {
      if (e.target.id === 'layout-list-filter') {
        clearTimeout(_filterDebounce);
        _filterDebounce = setTimeout(() => {
          _listQuery = e.target.value.toLowerCase().trim();
          _repaintList();
        }, 200);
      }
    });
  }
}

function _moveTooltip(e) {
  const tip = document.getElementById('page-layout-tooltip');
  if (!tip) return;
  const x = e.clientX + 12;
  const y = e.clientY + 12;
  tip.style.left = `${Math.min(x, window.innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(y, window.innerHeight - tip.offsetHeight - 8)}px`;
}
