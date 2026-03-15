/**
 * Page Layout Diagram - Renders a scaled visual layout of a Power BI report page.
 * Shows positioned rectangles for each visual, color-coded by type.
 * Click a visual to trace its lineage; hover for details.
 */

let _callbacks = {};

/**
 * Initialize the page layout component.
 * @param {{ onVisualSelect: function }} callbacks
 */
export function initPageLayout(callbacks = {}) {
  _callbacks = callbacks;
}

/**
 * Render the page layout diagram using the existing lineage content structure.
 * Uses #lineage-title for the page name, #lineage-tree-container for the canvas,
 * and #lineage-sections for supplementary content.
 * @param {object} pageNode - The page graph node.
 * @param {object} graph - The full graph { nodes, adjacency }.
 */
export function renderPageLayout(pageNode, graph) {
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

  const pageW = pageNode.metadata.width || 1280;
  const pageH = pageNode.metadata.height || 720;
  const pageId = pageNode.metadata.pageId;

  // Set title
  if (titleEl) {
    titleEl.textContent = pageNode.name;
    // Remove any existing subtitle and add page dimensions subtitle
    const oldSub = titleEl.nextElementSibling;
    if (oldSub && oldSub.classList.contains('lineage-subtitle')) oldSub.remove();
    const sub = document.createElement('div');
    sub.className = 'lineage-subtitle';
    sub.textContent = `${pageW} \u00d7 ${pageH}`;
    titleEl.insertAdjacentElement('afterend', sub);
  }

  // Gather visuals on this page
  const visuals = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'visual') continue;
    if (node.metadata.pageId !== pageId) continue;

    let measureCount = 0;
    let columnCount = 0;
    const measures = [];
    const columns = [];
    const fpTables = [];
    const fpMeasures = [];
    const upstream = graph.adjacency.upstream.get(node.id) || [];

    for (const upId of upstream) {
      const upNode = graph.nodes.get(upId);
      if (!upNode) continue;
      if (upNode.type === 'measure') {
        measureCount++;
        measures.push(upNode.name);
      } else if (upNode.type === 'column') {
        columnCount++;
        columns.push(`${upNode.metadata?.table || ''}.${upNode.name}`);
      } else if (upNode.type === 'table' && upNode.enrichment?.type === 'field_parameter') {
        fpTables.push(upNode.name);
        const fpUpstream = graph.adjacency.upstream.get(upNode.id) || [];
        for (const fpUpId of fpUpstream) {
          const fpUpNode = graph.nodes.get(fpUpId);
          if (!fpUpNode) continue;
          if (fpUpNode.type === 'measure') {
            fpMeasures.push(fpUpNode.name);
          } else if (fpUpNode.type === 'column') {
            columns.push(`${fpUpNode.metadata?.table || ''}.${fpUpNode.name}`);
            columnCount++;
          }
        }
      }
    }

    const totalMeasureCount = measureCount + fpMeasures.length;

    visuals.push({
      id: node.id,
      title: node.metadata.title || node.name || '',
      type: node.metadata.visualType || 'unknown',
      position: node.metadata.position,
      measureCount: totalMeasureCount,
      columnCount,
      measures,
      fpMeasures,
      fpTables,
      columns,
    });
  }

  const positioned = visuals.filter(v => v.position);
  const unpositioned = visuals.filter(v => !v.position);

  // Render canvas into #lineage-tree-container
  if (treeContainer) {
    const paddingPct = (pageH / pageW * 100).toFixed(4);
    let canvasHtml = `<div class="page-layout-canvas" style="padding-bottom: ${paddingPct}%">`;

    for (const v of positioned) {
      const p = v.position;
      const left = (p.x / pageW * 100).toFixed(3);
      const top = (p.y / pageH * 100).toFixed(3);
      const width = (p.width / pageW * 100).toFixed(3);
      const height = (p.height / pageH * 100).toFixed(3);
      const cat = typeCategory(v.type);
      const label = v.title || shortType(v.type);

      canvasHtml += `<div class="page-layout-visual" data-id="${esc(v.id)}" data-category="${cat}" `;
      canvasHtml += `style="left:${left}%;top:${top}%;width:${width}%;height:${height}%" `;
      canvasHtml += `title="">`;
      canvasHtml += `<span class="page-layout-visual-badge" data-category="${cat}">${esc(shortType(v.type))}</span>`;
      canvasHtml += `<span class="page-layout-visual-title">${esc(label)}</span>`;
      if (v.measureCount > 0 || v.columnCount > 0) {
        const parts = [];
        if (v.measureCount > 0) parts.push(`${v.measureCount}m`);
        if (v.columnCount > 0) parts.push(`${v.columnCount}f`);
        canvasHtml += `<span class="page-layout-visual-meta">${parts.join(' ')}</span>`;
      }
      canvasHtml += `</div>`;
    }

    canvasHtml += `</div>`;
    treeContainer.innerHTML = canvasHtml;
  }

  // Render unpositioned visuals + stats into #lineage-sections
  if (sectionsContainer) {
    let html = '';
    html += `<div class="page-layout-stats">${visuals.length} visual${visuals.length !== 1 ? 's' : ''}</div>`;

    if (unpositioned.length > 0) {
      html += `<div class="page-layout-unpositioned">`;
      html += `<div class="page-layout-unpositioned-header">Visuals without position data (${unpositioned.length})</div>`;
      html += `<div class="page-layout-unpositioned-list">`;
      for (const v of unpositioned) {
        const cat = typeCategory(v.type);
        const label = v.title || shortType(v.type);
        html += `<div class="page-layout-unpositioned-item" data-id="${esc(v.id)}">`;
        html += `<span class="visual-type-badge" data-category="${cat}">${esc(shortType(v.type))}</span>`;
        html += `<span>${esc(label)}</span>`;
        if (v.measureCount > 0) html += `<span class="visual-measure-count">${v.measureCount}</span>`;
        html += `</div>`;
      }
      html += `</div></div>`;
    }

    html += `<div class="sponsor-footer">Built with <span class="sponsor-heart">\u2665</span> by Jihwan Kim \u00b7 <a href="https://github.com/sponsors/JonathanJihwanKim" target="_blank" rel="noopener">Sponsor</a></div>`;
    sectionsContainer.innerHTML = html;
  }

  // Build tooltip element
  let tooltip = document.getElementById('page-layout-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'page-layout-tooltip';
    tooltip.className = 'page-layout-tooltip hidden';
    document.body.appendChild(tooltip);
  }

  // Bind interactions on all visual rectangles
  const allItems = content.querySelectorAll('.page-layout-visual, .page-layout-unpositioned-item');
  allItems.forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_callbacks.onVisualSelect) _callbacks.onVisualSelect(el.dataset.id);
    });

    el.addEventListener('mouseenter', () => {
      const v = visuals.find(vis => vis.id === el.dataset.id);
      if (!v) return;
      let tipHtml = `<div class="tip-title">${esc(v.title || shortType(v.type))}</div>`;
      tipHtml += `<div class="tip-type">${esc(v.type)}</div>`;
      if (v.measures.length > 0) {
        tipHtml += `<div class="tip-section">Measures (${v.measures.length})</div>`;
        tipHtml += `<div class="tip-list">${v.measures.map(m => esc(m)).join('<br>')}</div>`;
      }
      if (v.fpMeasures.length > 0) {
        const fpLabel = v.fpTables.length > 0 ? `via ${v.fpTables.join(', ')}` : 'field parameter';
        tipHtml += `<div class="tip-section">FP Measures (${v.fpMeasures.length}) <span class="tip-fp-badge">${esc(fpLabel)}</span></div>`;
        tipHtml += `<div class="tip-list">${v.fpMeasures.map(m => esc(m)).join('<br>')}</div>`;
      }
      if (v.columns.length > 0) {
        tipHtml += `<div class="tip-section">Columns (${v.columns.length})</div>`;
        tipHtml += `<div class="tip-list">${v.columns.map(c => esc(c)).join('<br>')}</div>`;
      }
      if (v.measures.length === 0 && v.fpMeasures.length === 0 && v.columns.length === 0) {
        tipHtml += `<div class="tip-muted">No field bindings</div>`;
      }
      tooltip.innerHTML = tipHtml;
      tooltip.classList.remove('hidden');
    });

    el.addEventListener('mousemove', (e) => {
      const x = e.clientX + 12;
      const y = e.clientY + 12;
      const maxX = window.innerWidth - tooltip.offsetWidth - 8;
      const maxY = window.innerHeight - tooltip.offsetHeight - 8;
      tooltip.style.left = `${Math.min(x, maxX)}px`;
      tooltip.style.top = `${Math.min(y, maxY)}px`;
    });

    el.addEventListener('mouseleave', () => {
      tooltip.classList.add('hidden');
    });
  });
}

// --- Utility functions (duplicated from visualBrowser.js for simplicity) ---

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

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
