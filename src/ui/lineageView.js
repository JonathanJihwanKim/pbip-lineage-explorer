/**
 * Lineage View - Renders the D3 tree diagram + 4-section lineage output
 * for a selected measure or visual. Follows the instruction document output format.
 */

import { NODE_COLORS } from '@pbip-lineage/core/utils/constants.js';
import { buildTreeData, buildVisualTreeData, renderLineageTree, destroyTree } from './lineageTree.js';

let _onMeasureNavigate = null;
let _onVisualNavigate = null;

/**
 * Initialize the lineage view.
 */
export function initLineageView(callbacks = {}) {
  _onMeasureNavigate = callbacks.onMeasureNavigate;
  _onVisualNavigate = callbacks.onVisualNavigate;
}

/**
 * Render the full lineage for a measure.
 * @param {object} lineage - Output from traceMeasureLineage()
 * @param {string} measureName
 * @param {object} graph - The full graph
 */
export function renderLineage(lineage, measureName, graph) {
  const empty = document.getElementById('lineage-empty');
  const content = document.getElementById('lineage-content');
  const titleEl = document.getElementById('lineage-title');
  const treeContainer = document.getElementById('lineage-tree-container');
  const sectionsContainer = document.getElementById('lineage-sections');

  if (!content) return;

  if (empty) empty.classList.add('hidden');
  content.classList.remove('hidden');
  if (titleEl) {
    titleEl.textContent = measureName;
    titleEl.removeAttribute('data-subtitle');
    const sub = titleEl.nextElementSibling;
    if (sub && sub.classList.contains('lineage-subtitle')) sub.remove();
  }

  if (treeContainer) {
    const treeData = buildTreeData(lineage, graph);
    renderLineageTree(treeContainer, treeData);
  }

  if (sectionsContainer) {
    let html = '';
    html += renderVisualsSection(lineage.visuals);
    html += renderMeasureChainSection(lineage.measureChain, lineage.summaryTrees);
    html += renderSourceTableSection(lineage.sourceTable);
    html += renderSummarySection(lineage.summaryTrees, lineage.measureChain, lineage.sourceTable);
    sectionsContainer.innerHTML = html;
    bindClickHandlers(sectionsContainer);
  }
}

/**
 * Render the full lineage for a visual (Phase 2).
 * @param {object} visualLineage - Output from traceVisualLineage()
 * @param {object} graph
 */
export function renderVisualLineage(visualLineage, graph) {
  const empty = document.getElementById('lineage-empty');
  const content = document.getElementById('lineage-content');
  const titleEl = document.getElementById('lineage-title');
  const treeContainer = document.getElementById('lineage-tree-container');
  const sectionsContainer = document.getElementById('lineage-sections');

  if (!content) return;

  if (empty) empty.classList.add('hidden');
  content.classList.remove('hidden');

  const { visual, measures, fpMeasures, fieldParameterMeasures } = visualLineage;

  // Combine direct + FP measures for display; FP measures get traced too
  const allMeasures = [...(measures || []), ...(fpMeasures || [])];

  if (titleEl) {
    titleEl.textContent = visual.title || visual.type || 'Visual';
    const oldSub = titleEl.nextElementSibling;
    if (oldSub && oldSub.classList.contains('lineage-subtitle')) oldSub.remove();
    const sub = document.createElement('div');
    sub.className = 'lineage-subtitle';
    sub.textContent = `${visual.type} on "${visual.page}"`;
    titleEl.insertAdjacentElement('afterend', sub);
  }

  // D3 tree: visual as root, all measures as branches
  if (treeContainer) {
    const treeData = buildVisualTreeData(visual, allMeasures, graph);
    if (treeData) {
      renderLineageTree(treeContainer, treeData);
    } else {
      destroyTree(treeContainer);
    }
  }

  if (sectionsContainer) {
    let html = '';

    // Visual header section
    html += '<div class="lineage-section">';
    html += `<h3>Visual Details</h3>`;
    html += '<div class="trace-table-wrapper"><table class="trace-table">';
    html += '<thead><tr><th>Type</th><th>Title</th><th>Page</th><th>Object ID</th></tr></thead>';
    html += '<tbody><tr>';
    html += `<td>${esc(visual.type)}</td>`;
    html += `<td>${esc(visual.title)}</td>`;
    html += `<td>${esc(visual.page)}</td>`;
    html += `<td class="lineage-mono">${esc(visual.objectId)}</td>`;
    html += '</tr></tbody></table></div>';
    html += '</div>';

    // Field parameter indicator (if FP measures found)
    if (fieldParameterMeasures && fieldParameterMeasures.length > 0) {
      html += '<div class="lineage-section">';
      html += '<h3>Field Parameter — Available Measures <span class="visual-type-badge" style="background:rgba(233,30,99,0.2);color:#e91e63">FP</span></h3>';
      html += `<p class="lineage-muted" style="margin-bottom:8px">This visual uses a field parameter. All ${fieldParameterMeasures.length} available measures are shown below with full lineage.</p>`;
      html += '</div>';
    }

    // Per-measure lineage sections (direct + FP measures combined)
    // Visual-first view: skip "1. Visuals" section (already shown in Visual Details)
    if (allMeasures.length === 0) {
      html += '<div class="lineage-section"><p class="lineage-muted">No measure references found on this visual.</p></div>';
    } else if (allMeasures.length === 1 && (!fpMeasures || fpMeasures.length === 0)) {
      // Single direct measure (no FP): show DAX chain + source lineage directly
      const m = allMeasures[0];
      if (m.lineage) {
        html += renderMeasureChainSection(m.lineage.measureChain, m.lineage.summaryTrees);
        html += renderSourceTableSection(m.lineage.sourceTable);
        html += renderVisualSummarySection(visual, m.lineage.measureChain, m.lineage.sourceTable);
      }
    } else {
      // Multiple measures or FP measures: accordion per measure
      for (const m of allMeasures) {
        const isFp = fpMeasures && fpMeasures.some(fp => fp.measureId === m.measureId);
        const isDirect = measures && measures.some(dm => dm.measureId === m.measureId);
        html += `<details class="measure-accordion">`;
        html += `<summary class="measure-accordion-header">`;
        html += `<span class="chain-dot" style="background:${NODE_COLORS.measure};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;"></span>`;
        html += `[${esc(m.measureName)}]`;
        if (isFp && !isDirect) html += ` <span class="visual-type-badge" style="background:rgba(255,152,0,0.2);color:#ff9800;margin-left:6px">FP</span>`;
        if (isDirect) html += ` <span class="visual-type-badge" style="background:rgba(76,175,80,0.2);color:#4caf50;margin-left:6px">active</span>`;
        html += `</summary>`;
        html += `<div class="measure-accordion-body">`;
        if (m.lineage) {
          html += renderMeasureChainSection(m.lineage.measureChain, m.lineage.summaryTrees);
          html += renderSourceTableSection(m.lineage.sourceTable);
          html += renderVisualSummarySection(visual, m.lineage.measureChain, m.lineage.sourceTable);
        }
        html += `</div></details>`;
      }
    }

    sectionsContainer.innerHTML = html;
    bindClickHandlers(sectionsContainer);
  }
}

/**
 * Clear the lineage view.
 */
export function clearLineage() {
  const empty = document.getElementById('lineage-empty');
  const content = document.getElementById('lineage-content');
  const treeContainer = document.getElementById('lineage-tree-container');
  const sectionsContainer = document.getElementById('lineage-sections');
  const titleEl = document.getElementById('lineage-title');

  if (empty) empty.classList.remove('hidden');
  if (content) content.classList.add('hidden');
  if (treeContainer) destroyTree(treeContainer);
  if (sectionsContainer) sectionsContainer.innerHTML = '';
  if (titleEl) {
    const sub = titleEl.nextElementSibling;
    if (sub && sub.classList.contains('lineage-subtitle')) sub.remove();
  }
}

// --- Section 1: Visuals ---

function renderVisualsSection(visuals) {
  let html = '<div class="lineage-section">';
  html += '<h3>1. Visuals</h3>';

  if (visuals.length === 0) {
    html += '<p class="lineage-muted">No visuals reference this measure directly.</p>';
    html += '</div>';
    return html;
  }

  html += '<div class="trace-table-wrapper"><table class="trace-table">';
  html += '<thead><tr><th>#</th><th>Page</th><th>Visual Type</th><th>Visual Title</th><th>Object ID</th><th>Metric Display</th><th>Metric DAX Name</th><th>Binding</th></tr></thead>';
  html += '<tbody>';
  visuals.forEach((v, i) => {
    const displayDiffers = v.metricDisplayName && v.metricDaxName &&
      !v.metricDaxName.endsWith(`.${v.metricDisplayName}`);
    html += `<tr>`;
    html += `<td>${i + 1}</td>`;
    html += `<td>${esc(v.page)}</td>`;
    html += `<td>${esc(v.visualType)}</td>`;
    html += `<td class="clickable" data-visual-id="${esc(v.id)}">${esc(v.title)}</td>`;
    html += `<td class="lineage-mono">${esc(v.id.split('/').pop() || v.id)}</td>`;
    html += `<td${displayDiffers ? ' class="renamed-cell"' : ''}>${esc(v.metricDisplayName)}</td>`;
    html += `<td>${esc(v.metricDaxName)}</td>`;
    html += `<td>${v.bindingType === 'fieldParameter' ? '<span class="visual-type-badge" style="background:rgba(233,30,99,0.2);color:#e91e63">FP</span>' : ''}</td>`;
    html += `</tr>`;
  });
  html += '</tbody></table></div>';
  html += '</div>';
  return html;
}

// --- Section 2: DAX Measure Chain ---

function renderMeasureChainSection(chain, summaryTrees) {
  let html = '<div class="lineage-section">';
  html += '<h3>2. DAX Measure Chain';
  // Copy lineage button
  if (summaryTrees && summaryTrees.length > 0) {
    const copyText = esc(summaryTrees.join('\n\n'));
    html += ` <button class="btn-copy-lineage" data-lineage-text="${copyText}" title="Copy lineage as text">Copy</button>`;
  }
  html += '</h3>';
  html += '<div class="measure-tree">';
  html += renderChainNode(chain, 0);
  html += '</div></div>';
  return html;
}

function renderChainNode(chain, depth) {
  if (!chain) return '';
  const indent = depth * 20;
  const nodeId = `dax-${chain.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  let html = `<div class="chain-node" style="margin-left:${indent}px">`;
  html += `<div class="chain-header">`;
  html += `<span class="chain-dot" style="background:${NODE_COLORS.measure}"></span>`;
  html += `<strong class="chain-name clickable" data-id="${esc(chain.id)}">[${esc(chain.name)}]</strong>`;
  if (chain.table) html += ` <span class="chain-table">(${esc(chain.table)})</span>`;
  // Copy DAX button
  if (chain.expression) {
    html += ` <button class="btn-copy-dax" data-dax="${esc(chain.expression)}" title="Copy DAX">&#128203;</button>`;
  }
  html += `</div>`;

  if (chain.expression) {
    // Full DAX with syntax highlighting in collapsible details
    const firstLine = chain.expression.split('\n')[0];
    const isLong = chain.expression.length > 100 || chain.expression.includes('\n');
    if (isLong) {
      html += `<details class="chain-dax-details">`;
      html += `<summary class="chain-dax-summary">${highlightDax(firstLine.substring(0, 100))}${firstLine.length > 100 ? '...' : ''}</summary>`;
      html += `<div class="chain-dax">${highlightDax(chain.expression)}</div>`;
      html += `</details>`;
    } else {
      html += `<div class="chain-dax">${highlightDax(chain.expression)}</div>`;
    }
  }

  // Column references as leaves
  if (chain.columns.length > 0) {
    html += `<div class="chain-columns" style="margin-left:20px">`;
    for (const col of chain.columns) {
      html += `<div class="chain-column">`;
      html += `<span class="chain-dot" style="background:${NODE_COLORS.column}"></span>`;
      html += `<span class="clickable" data-id="${esc(col.id)}">${esc(col.table)}[${esc(col.name)}]</span>`;
      if (col.wasRenamed) {
        html += ` <span class="renamed-badge">renamed</span>`;
        if (col.originalSourceColumn && col.sourceColumn) {
          html += ` <span class="rename-chain">${esc(col.originalSourceColumn)} → ${esc(col.sourceColumn)} → ${esc(col.name)}</span>`;
        }
      }
      html += `</div>`;
      // Source column info for data engineers
      if (col.originalSourceColumn && col.originalSourceColumn !== col.name) {
        html += `<div class="chain-source-info">Source: ${esc(col.sourceTablePath ? `${col.sourceTablePath}.${col.originalSourceColumn}` : col.originalSourceColumn)}</div>`;
      }
    }
    html += `</div>`;
  }

  // Recurse sub-measures
  for (const child of chain.children) {
    html += renderChainNode(child, depth + 1);
  }

  html += `</div>`;
  return html;
}

// --- Section 3: Source Lineage Table ---

function renderSourceTableSection(sourceTable) {
  let html = '<div class="lineage-section">';
  html += '<h3>3. Source Lineage</h3>';

  if (sourceTable.length === 0) {
    html += '<p class="lineage-muted">No column-level source tracing available.</p>';
    html += '</div>';
    return html;
  }

  html += '<div class="trace-table-wrapper"><table class="trace-table">';
  html += '<thead><tr><th>DAX Ref</th><th>PBI Table</th><th>PBI Column</th><th>Source Column (PQ)</th><th>Original Source Column</th><th>Rename Chain</th><th>PQ Expression</th><th>Source Table</th><th>Source Column (Full)</th></tr></thead>';
  html += '<tbody>';
  for (const row of sourceTable) {
    const rowClass = row.renamed ? ' class="renamed-row"' : '';
    html += `<tr${rowClass}>`;
    html += `<td>${esc(row.daxReference)}</td>`;
    html += `<td>${esc(row.pbiTable)}</td>`;
    html += `<td>${esc(row.pbiColumn)}</td>`;
    html += `<td>${esc(row.sourceColumn)}</td>`;
    html += `<td>${esc(row.originalSourceColumn || '')}</td>`;
    if (row.renamed && row.originalSourceColumn && row.sourceColumn && row.pbiColumn) {
      html += `<td class="rename-chain-cell">${esc(row.originalSourceColumn)} <span class="rename-arrow">→</span> ${esc(row.sourceColumn)} <span class="rename-arrow">→</span> ${esc(row.pbiColumn)}</td>`;
    } else {
      html += `<td></td>`;
    }
    html += `<td>${esc(row.pqExpression)}</td>`;
    html += `<td>${esc(row.sourceTable)}</td>`;
    html += `<td>${esc(row.sourceColumnFull)}</td>`;
    html += `</tr>`;
  }
  html += '</tbody></table></div>';
  html += '</div>';
  return html;
}

// --- Section 4: Summary Trees (structured HTML, color-coded) ---

/**
 * Render summary section for a single selected visual (visual-first view).
 */
function renderVisualSummarySection(visual, measureChain, sourceTable) {
  let html = '<div class="lineage-section">';
  html += '<h3>4. Lineage Summary</h3>';

  const colSourceMap = buildColSourceMap(sourceTable || []);
  const visualHeader = `Visual: ${visual.type} "${visual.title}" (${visual.objectId})`;

  html += '<div class="summary-tree-html">';
  html += `<div class="summary-node layer-visual">`;
  html += `<span class="layer-label">L1</span>`;
  html += `<span class="summary-dot" style="background:#4caf50"></span>`;
  html += `<span class="summary-node-name">${esc(visualHeader)}</span>`;
  html += `</div>`;
  if (measureChain) {
    html += renderSummaryChainNode(measureChain, 1, colSourceMap);
  }
  html += '</div>';

  html += '</div>';
  return html;
}

function renderSummarySection(summaryTrees, measureChain, sourceTable) {
  let html = '<div class="lineage-section">';
  html += '<h3>4. Lineage Summary</h3>';

  if (!summaryTrees || summaryTrees.length === 0) {
    html += '<p class="lineage-muted">No visual lineage paths available.</p>';
  } else {
    const colSourceMap = buildColSourceMap(sourceTable || []);
    for (const tree of summaryTrees) {
      html += renderStructuredSummaryTree(tree, measureChain, colSourceMap);
    }
  }

  html += '</div>';
  return html;
}

function buildColSourceMap(sourceTable) {
  const map = new Map();
  for (const row of sourceTable) {
    map.set(`${row.pbiTable}.${row.pbiColumn}`, row);
  }
  return map;
}

/**
 * Render a structured HTML summary tree (color-coded, indented with guides).
 * Uses the raw summary string as fallback for the visual header,
 * but builds structured HTML for the measure chain.
 */
function renderStructuredSummaryTree(treeString, measureChain, colSourceMap) {
  // Extract visual header line from the summary string
  const lines = treeString.split('\n');
  const visualHeader = lines[0] || '';
  const metricDisplay = lines[1]?.trim() || '';
  const metricDax = lines[2]?.trim() || '';

  let html = '<div class="summary-tree-html">';

  // L1: Visual node
  html += `<div class="summary-node layer-visual">`;
  html += `<span class="layer-label">L1</span>`;
  html += `<span class="summary-dot" style="background:#4caf50"></span>`;
  html += `<span class="summary-node-name">${esc(visualHeader)}</span>`;
  html += `</div>`;
  if (metricDisplay) {
    html += `<div class="summary-node-meta" style="margin-left:28px">${esc(metricDisplay)}</div>`;
  }

  // L2+: Measure chain
  if (measureChain) {
    html += renderSummaryChainNode(measureChain, 1, colSourceMap);
  }

  html += '</div>';
  return html;
}

function renderSummaryChainNode(chain, depth, colSourceMap) {
  if (!chain) return '';
  const indent = depth * 20;
  const isSub = depth > 1;

  let html = `<div class="summary-node ${isSub ? 'layer-submeasure' : 'layer-measure'}" style="margin-left:${indent}px">`;
  html += `<span class="layer-label">${isSub ? 'L3' : 'L2'}</span>`;
  html += `<span class="summary-dot" style="background:${isSub ? '#ffb74d' : '#ff9800'}"></span>`;
  html += `<span class="summary-node-name clickable" data-id="${esc(chain.id)}">[${esc(chain.name)}]</span>`;
  if (chain.table) html += ` <span class="chain-table">(${esc(chain.table)})</span>`;
  html += `</div>`;

  // Columns (L4) → PQ (L5) → Source (L6)
  for (const col of chain.columns) {
    const key = `${col.table}.${col.name}`;
    const source = colSourceMap.get(key);
    const colIndent = (depth + 1) * 20;

    html += `<div class="summary-node layer-column${col.wasRenamed ? ' renamed-node' : ''}" style="margin-left:${colIndent}px">`;
    html += `<span class="layer-label">L4</span>`;
    html += `<span class="summary-dot" style="background:#9c27b0"></span>`;
    html += `<span class="summary-node-name">${esc(col.table)}[${esc(col.name)}]</span>`;
    if (col.wasRenamed) html += ` <span class="renamed-badge">renamed</span>`;
    html += `</div>`;

    if (source?.pqExpression) {
      html += `<div class="summary-node layer-expression" style="margin-left:${colIndent + 20}px">`;
      html += `<span class="layer-label">L5</span>`;
      html += `<span class="summary-dot" style="background:#795548"></span>`;
      html += `<span class="summary-node-name">PQ: ${esc(source.pqExpression)}</span>`;
      html += `</div>`;
    }

    if (source?.sourceTable) {
      html += `<div class="summary-node layer-source" style="margin-left:${colIndent + 40}px">`;
      html += `<span class="layer-label">L6</span>`;
      html += `<span class="summary-dot" style="background:#607d8b"></span>`;
      html += `<span class="summary-node-name">${esc(source.sourceTable)}.${esc(source.sourceColumnFull)}</span>`;
      html += `</div>`;
    }
  }

  // Sub-measures
  for (const child of chain.children) {
    html += renderSummaryChainNode(child, depth + 1, colSourceMap);
  }

  return html;
}

// --- DAX Syntax Highlighting ---

/** DAX functions to highlight */
const DAX_FUNCTIONS = new Set([
  'CALCULATE', 'CALCULATETABLE', 'FILTER', 'ALL', 'ALLEXCEPT', 'ALLSELECTED',
  'SUM', 'SUMX', 'AVERAGE', 'AVERAGEX', 'COUNT', 'COUNTX', 'COUNTA', 'COUNTAX',
  'COUNTROWS', 'COUNTBLANK', 'MIN', 'MINX', 'MAX', 'MAXX',
  'DIVIDE', 'IF', 'SWITCH', 'SELECTEDVALUE', 'HASONEVALUE',
  'RELATED', 'RELATEDTABLE', 'USERELATIONSHIP', 'CROSSFILTER',
  'VALUES', 'DISTINCT', 'DISTINCTCOUNT', 'DISTINCTCOUNTNOBLANK',
  'EARLIER', 'EARLIEST', 'LOOKUPVALUE', 'TREATAS',
  'RANKX', 'TOPN', 'GENERATE', 'GENERATEALL', 'ADDCOLUMNS', 'SELECTCOLUMNS',
  'SUMMARIZE', 'SUMMARIZECOLUMNS', 'GROUPBY',
  'ISBLANK', 'ISEMPTY', 'ISERROR', 'ISINSCOPE',
  'FORMAT', 'CONCATENATE', 'CONCATENATEX', 'COMBINEVALUES',
  'DATE', 'YEAR', 'MONTH', 'DAY', 'TODAY', 'NOW', 'DATEDIFF', 'DATEADD',
  'TOTALYTD', 'TOTALQTD', 'TOTALMTD', 'SAMEPERIODLASTYEAR', 'DATESBETWEEN',
  'PREVIOUSYEAR', 'PREVIOUSQUARTER', 'PREVIOUSMONTH', 'PREVIOUSDAY',
  'NEXTYEAR', 'NEXTQUARTER', 'NEXTMONTH', 'NEXTDAY',
  'PARALLELPERIOD', 'OPENINGBALANCEYEAR', 'CLOSINGBALANCEYEAR',
  'VAR', 'RETURN', 'TRUE', 'FALSE', 'BLANK', 'NOT', 'AND', 'OR', 'IN',
  'UNION', 'INTERSECT', 'EXCEPT', 'NATURALINNERJOIN', 'NATURALLEFTOUTERJOIN',
  'ROW', 'DATATABLE', 'ERROR', 'USERCULTURE', 'USERNAME',
  'KEEPFILTERS', 'REMOVEFILTERS', 'ALLNOBLANKROW',
  'NAMEOF', 'SELECTEDVALUE', 'ISSELECTEDMEASURE', 'SELECTEDMEASURE',
  'CALCULATIONGROUP', 'CONTAINS', 'CONTAINSROW',
  'FIRSTDATE', 'LASTDATE', 'FIRSTNONBLANK', 'LASTNONBLANK',
  'POWER', 'SQRT', 'ABS', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'INT', 'MOD',
  'CALENDAR', 'CALENDARAUTO', 'EOMONTH', 'EDATE',
  'CONVERT', 'CURRENCY', 'FIXED', 'LEFT', 'RIGHT', 'MID', 'LEN',
  'UPPER', 'LOWER', 'TRIM', 'SUBSTITUTE', 'REPLACE', 'SEARCH', 'FIND',
  'PATHCONTAINS', 'PATHITEM', 'PATHITEMREVERSE', 'PATHLENGTH',
  'PRODUCTX', 'GEOMEANX', 'MEDIANX', 'PERCENTILEX',
  'STDEV', 'STDEVX', 'VAR', 'VARX',
]);

/**
 * Apply basic DAX syntax highlighting.
 * Returns HTML with span classes for coloring.
 */
function highlightDax(expression) {
  if (!expression) return '';

  // First escape HTML
  let text = esc(expression);

  // Replace comments (// line comments)
  text = text.replace(/(\/\/[^\n]*)/g, '<span class="dax-comment">$1</span>');

  // Replace block comments
  text = text.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="dax-comment">$1</span>');

  // Replace string literals
  text = text.replace(/(&quot;[^&]*?&quot;)/g, '<span class="dax-str">$1</span>');

  // Replace table references 'TableName'
  text = text.replace(/(&apos;|&#39;|')?([A-Za-z_][\w\s]*?)(&apos;|&#39;|')(?=\[)/g,
    '<span class="dax-table-ref">$1$2$3</span>');

  // Replace column/measure references [Name]
  text = text.replace(/\[([^\]]+)\]/g, '<span class="dax-col-ref">[$1]</span>');

  // Replace numbers
  text = text.replace(/\b(\d+\.?\d*)\b/g, '<span class="dax-number">$1</span>');

  // Replace DAX function names (word boundary + known function + opening paren)
  text = text.replace(/\b([A-Z][A-Z0-9_.]*)\s*(?=\()/g, (match, fn) => {
    if (DAX_FUNCTIONS.has(fn.toUpperCase())) {
      return `<span class="dax-fn">${fn}</span>`;
    }
    return match;
  });

  return text;
}

// --- Helpers ---

function bindClickHandlers(container) {
  // Measure navigation
  container.querySelectorAll('.clickable[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (id.startsWith('measure::') && _onMeasureNavigate) {
        _onMeasureNavigate(id);
      }
    });
  });

  // Visual navigation from visuals table
  container.querySelectorAll('[data-visual-id]').forEach(el => {
    el.addEventListener('click', () => {
      if (_onVisualNavigate) _onVisualNavigate(el.dataset.visualId);
    });
  });

  // Copy DAX buttons
  container.querySelectorAll('.btn-copy-dax').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dax = btn.dataset.dax;
      if (dax) {
        navigator.clipboard.writeText(dax).then(() => {
          const orig = btn.innerHTML;
          btn.innerHTML = '&#10003;';
          btn.style.color = '#4caf50';
          setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
        }).catch(() => {});
      }
    });
  });

  // Copy lineage buttons
  container.querySelectorAll('.btn-copy-lineage').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.dataset.lineageText;
      if (text) {
        const decoded = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        const footer = '\n\nGenerated by PBIP Lineage Explorer — free & open source\nhttps://github.com/JonathanJihwanKim/pbip-lineage-explorer\nSponsor: https://github.com/sponsors/JonathanJihwanKim';
        navigator.clipboard.writeText(decoded + footer).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.color = '#4caf50';
          setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
        }).catch(() => {});
      }
    });
  });
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
