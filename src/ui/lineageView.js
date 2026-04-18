/**
 * Lineage View - Renders the D3 tree diagram + 4-section lineage output
 * for a selected measure or visual. Follows the instruction document output format.
 */

import { NODE_COLORS } from '@pbip-lineage/core/utils/constants.js';
import { buildTreeData, buildVisualTreeData, renderLineageTree, destroyTree, exportTreeAsSvg, exportTreeAsPng } from './lineageTree.js';
import { openImpactPanel } from './impactPanel.js';

let _onMeasureNavigate = null;
let _onVisualNavigate = null;
let _currentGraph = null;
let _currentLineage = null;
let _currentMeasureName = null;
let _changeData = null; // { flatChanges, measureChangeCounts }

/**
 * Initialize the lineage view.
 */
export function initLineageView(callbacks = {}) {
  _onMeasureNavigate = callbacks.onMeasureNavigate;
  _onVisualNavigate = callbacks.onVisualNavigate;
}

/**
 * Set change history data for rendering in lineage sections.
 * @param {{ flatChanges: Array, measureChangeCounts: Map }} data
 */
export function setChangeData(data) {
  _changeData = data;
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
  _currentGraph = graph;
  _currentLineage = lineage;
  _currentMeasureName = measureName;

  if (empty) empty.classList.add('hidden');
  content.classList.remove('hidden');

  // Check for circular references
  const hasCircular = chainHasCircularRef(lineage.measureChain);

  if (titleEl) {
    titleEl.textContent = measureName;
    titleEl.removeAttribute('data-subtitle');
    const sub = titleEl.nextElementSibling;
    if (sub && sub.classList.contains('lineage-subtitle')) sub.remove();
  }

  if (treeContainer) {
    const treeData = buildTreeData(lineage, graph);
    renderLineageTree(treeContainer, treeData);
    addExportToolbar(treeContainer, measureName);
  }

  if (sectionsContainer) {
    const sourceFirst = localStorage.getItem('pbip-lineage-source-first') === 'true';
    let html = '';
    // View toggle — clarifies section ordering for power users
    html += `<div class="view-toggle-bar">`;
    html += `<button class="btn-view-toggle${!sourceFirst ? ' active' : ''}" data-view="dax" title="DAX-First: shows DAX dependency chain before source column mapping">`;
    html += `DAX-First <span class="view-toggle-sub">Measures → Columns → Source</span></button>`;
    html += `<button class="btn-view-toggle${sourceFirst ? ' active' : ''}" data-view="source" title="Source-First: shows source column mapping before the DAX chain — ideal for data engineers">`;
    html += `Source-First <span class="view-toggle-sub">Source → Columns → Measures</span></button>`;
    html += `</div>`;
    if (hasCircular) {
      html += '<div class="circular-warning">Circular reference detected in this dependency chain. Some measures reference each other, which may cause calculation issues.</div>';
    }
    html += renderVisualsSection(lineage.visuals);
    if (sourceFirst) {
      html += renderSourceTableSection(lineage.sourceTable);
      html += renderMeasureChainSection(lineage.measureChain, lineage.summaryTrees, lineage.sourceTable);
    } else {
      html += renderMeasureChainSection(lineage.measureChain, lineage.summaryTrees, lineage.sourceTable);
      html += renderSourceTableSection(lineage.sourceTable);
    }
    html += renderSummarySection(lineage.summaryTrees, lineage.measureChain, lineage.sourceTable);
    html += renderChangeHistorySection(measureName, lineage.visuals);
    sectionsContainer.innerHTML = html;
    bindClickHandlers(sectionsContainer);
    // Bind view toggle
    sectionsContainer.querySelectorAll('.btn-view-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const isSource = btn.dataset.view === 'source';
        localStorage.setItem('pbip-lineage-source-first', isSource ? 'true' : 'false');
        renderLineage(lineage, measureName, graph);
      });
    });
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
  _currentGraph = graph;

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
      addExportToolbar(treeContainer, visual.title || visual.type || 'visual');
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

    // Aggregated source columns — shown immediately after Visual Details for data engineers
    // Answers: "What source tables/columns feed this visual?"
    html += renderAggregatedSourceSection(allMeasures);

    // Change history for this visual's page and measures
    html += renderVisualChangeHistorySection(visual, allMeasures);

    // Calculation group indicator (if CG detected)
    const calculationGroups = visualLineage.calculationGroups || [];
    if (calculationGroups.length > 0) {
      for (const cg of calculationGroups) {
        html += '<div class="lineage-section">';
        html += `<h3>Calculation Group — ${esc(cg.tableName)} <span class="visual-type-badge" style="background:rgba(0,188,212,0.2);color:#00bcd4">CG</span></h3>`;
        html += `<p class="lineage-muted" style="margin-bottom:8px">This visual's measures are modified by ${cg.items.length} calculation item${cg.items.length !== 1 ? 's' : ''}. Each item applies a transformation (e.g., YTD, QTD, MTD) to the selected measure.</p>`;
        if (cg.items.length > 0) {
          html += '<div class="trace-table-wrapper"><table class="trace-table cg-items-table">';
          html += '<thead><tr><th>Item Name</th><th>DAX Expression</th></tr></thead>';
          html += '<tbody>';
          for (const item of cg.items) {
            html += '<tr>';
            html += `<td><strong>${esc(item.name)}</strong></td>`;
            html += `<td class="chain-dax">${highlightDax(item.expression || '')}</td>`;
            html += '</tr>';
          }
          html += '</tbody></table></div>';
        }
        html += '</div>';
      }
    }

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
        html += renderMeasureChainSection(m.lineage.measureChain, m.lineage.summaryTrees, m.lineage.sourceTable);
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
        if (m.fpDisplayName && m.fpDisplayName !== m.measureName) html += ` <span class="fp-display-label">displayed as</span> <span class="fp-display-name">${esc(m.fpDisplayName)}</span>`;
        if (isFp && !isDirect) html += ` <span class="visual-type-badge" style="background:rgba(255,152,0,0.2);color:#ff9800;margin-left:6px">FP</span>`;
        if (isDirect) html += ` <span class="visual-type-badge" style="background:rgba(76,175,80,0.2);color:#4caf50;margin-left:6px">active</span>`;
        html += `</summary>`;
        html += `<div class="measure-accordion-body">`;
        if (m.lineage) {
          html += renderMeasureChainSection(m.lineage.measureChain, m.lineage.summaryTrees, m.lineage.sourceTable);
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

function renderMeasureChainSection(chain, summaryTrees, sourceTable) {
  // Count measures and columns in the chain
  const counts = countChainNodes(chain);
  const sourceCount = sourceTable ? sourceTable.length : 0;

  let html = '<details class="lineage-section lineage-section-collapsible" open>';
  html += '<summary class="lineage-section-header"><h3>2. DAX Measure Chain';
  html += ` <span class="section-summary-count">${counts.measures} measure${counts.measures !== 1 ? 's' : ''}, ${counts.columns} column${counts.columns !== 1 ? 's' : ''}</span>`;
  // Copy lineage button
  if (summaryTrees && summaryTrees.length > 0) {
    const copyText = esc(summaryTrees.join('\n\n'));
    html += ` <button class="btn-copy-lineage" data-lineage-text="${copyText}" title="Copy lineage as text">Copy</button>`;
  }
  html += '</h3></summary>';
  html += '<div class="measure-tree">';
  html += renderChainNode(chain, 0);
  html += '</div></details>';
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
  if (chain.description) html += ` <span class="chain-description">${esc(chain.description)}</span>`;
  if (chain.expression === '(circular reference)') html += ` <span class="circular-badge">circular</span>`;
  // Copy DAX button
  if (chain.expression && chain.expression !== '(circular reference)') {
    html += ` <button class="btn-copy-dax" data-dax="${esc(chain.expression)}" title="Copy DAX">&#128203;</button>`;
  }
  // Impact analysis button — show upstream/downstream dependencies
  html += ` <button class="btn-impact" data-impact-id="${esc(chain.id)}" title="Impact Analysis — see every measure, column, and visual that depends on or is used by this measure">&#8599; Impact</button>`;
  html += `</div>`;

  if (chain.expression) {
    // Full DAX with syntax highlighting in collapsible details
    const lines = chain.expression.split('\n');
    const isLong = chain.expression.length > 100 || lines.length > 1;
    if (isLong) {
      // Find the first non-empty, non-fence preview line so the summary always
      // communicates something useful (triple-backtick fences and leading blanks
      // otherwise produce an opaque bar that looks uninteractive).
      const previewLine = lines.find(l => {
        const t = l.trim();
        return t && t !== '```' && !/^```/.test(t);
      }) || '';
      const lineCount = lines.length;
      const lineCountLabel = `<span class="chain-dax-summary-hint"> \u00b7 ${lineCount} line${lineCount !== 1 ? 's' : ''}</span>`;
      const summaryBody = previewLine.trim()
        ? `${highlightDax(previewLine.substring(0, 100))}${previewLine.length > 100 ? '\u2026' : ''}${lineCountLabel}`
        : `<span class="chain-dax-summary-hint">Show full DAX expression \u00b7 ${lineCount} line${lineCount !== 1 ? 's' : ''}</span>`;
      html += `<details class="chain-dax-details">`;
      html += `<summary class="chain-dax-summary" title="Click to expand full DAX expression">${summaryBody}</summary>`;
      html += `<div class="chain-dax">${highlightDax(chain.expression)}</div>`;
      html += `</details>`;
    } else {
      html += `<div class="chain-dax">${highlightDax(chain.expression)}</div>`;
    }
  }

  // USERELATIONSHIP references
  if (chain.useRelationships && chain.useRelationships.length > 0) {
    // Group relationship columns into pairs
    const relPairs = [];
    for (let i = 0; i < chain.useRelationships.length; i += 2) {
      const from = chain.useRelationships[i];
      const to = chain.useRelationships[i + 1];
      if (from && to) {
        relPairs.push({ from, to });
      } else if (from) {
        relPairs.push({ from, to: null });
      }
    }
    if (relPairs.length > 0 || chain.useRelationships.length > 0) {
      html += `<div class="chain-relationships">`;
      html += `<div class="chain-rel-header">Relationships:</div>`;
      if (relPairs.length > 0) {
        for (const pair of relPairs) {
          html += `<div class="chain-rel-item">`;
          html += `<span class="chain-dot" style="background:#ff5722"></span>`;
          html += `${esc(pair.from.table)}[${esc(pair.from.column)}]`;
          if (pair.to) html += ` &#8596; ${esc(pair.to.table)}[${esc(pair.to.column)}]`;
          const cf = chain.useRelationships.crossFilter;
          if (cf) html += ` <span class="mode-badge mode-badge-dual">${esc(cf)}</span>`;
          html += `</div>`;
        }
      } else {
        // Show individual columns involved
        for (const ur of chain.useRelationships) {
          html += `<div class="chain-rel-item">`;
          html += `<span class="chain-dot" style="background:#ff5722"></span>`;
          html += `${esc(ur.table)}[${esc(ur.column)}]`;
          html += `</div>`;
        }
      }
      html += `</div>`;
    }
  }

  // Column references as leaves
  if (chain.columns.length > 0) {
    html += `<div class="chain-columns" style="margin-left:20px">`;
    for (const col of chain.columns) {
      html += `<div class="chain-column">`;
      html += `<span class="chain-dot" style="background:${NODE_COLORS.column}"></span>`;
      html += `<span class="clickable" data-id="${esc(col.id)}">${esc(col.table)}[${esc(col.name)}]</span>`;
      if (col.dataType) html += ` ${renderDataTypeBadge(col.dataType)}`;
      if (col.isHidden) html += ` <span class="hidden-indicator" title="Hidden from report view">&#128065;&#8211;</span>`;
      if (col.wasRenamed) {
        html += ` <span class="renamed-badge">renamed</span>`;
        if (col.originalSourceColumn && col.sourceColumn) {
          html += ` <span class="rename-chain">${esc(col.originalSourceColumn)} → ${esc(col.sourceColumn)} → ${esc(col.name)}</span>`;
        }
      }
      html += `</div>`;
      // Source column info for data engineers — show for ALL columns with source info
      if (col.sourceTableFull || col.originalSourceColumn) {
        const sourceDisplay = col.sourceTableFull
          || (col.sourceTablePath ? `${col.sourceTablePath}.${col.originalSourceColumn || col.name}` : (col.originalSourceColumn || ''));
        if (sourceDisplay) {
          html += `<div class="chain-source-highlight">`;
          html += `PBI: ${esc(col.table)}[${esc(col.name)}]`;
          html += ` <span class="rename-arrow">←</span> Source: ${esc(sourceDisplay)}`;
          html += `</div>`;
        }
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
  if (sourceTable.length === 0) {
    let html = '<div class="lineage-section">';
    html += '<h3>3. Source Lineage</h3>';
    html += '<p class="lineage-muted">No column-level source tracing available.</p>';
    html += '</div>';
    return html;
  }

  // Count unique sources
  const uniqueSources = new Set(sourceTable.filter(r => r.sourceTable).map(r => r.sourceTable));

  let html = '<details class="lineage-section lineage-section-collapsible" open>';
  html += `<summary class="lineage-section-header"><h3>3. Source Lineage <span class="section-summary-count">${sourceTable.length} column${sourceTable.length !== 1 ? 's' : ''} traced to ${uniqueSources.size} source${uniqueSources.size !== 1 ? 's' : ''}</span></h3></summary>`;

  html += '<div class="trace-table-wrapper"><table class="trace-table">';
  html += '<thead><tr><th>DAX Ref</th><th>PBI Table</th><th>PBI Column</th><th>Type</th><th>Mode</th><th>Source Column (PQ)</th><th>Original Source Column</th><th>Rename Chain</th><th>Source Table</th><th>Source Column (Full)</th></tr></thead>';
  html += '<tbody>';
  for (const row of sourceTable) {
    const rowClass = row.renamed ? ' class="renamed-row"' : '';
    html += `<tr${rowClass}>`;
    const daxRefs = row.daxReferences && row.daxReferences.length > 0
      ? row.daxReferences.join(', ')
      : (row.daxReference || '');
    html += `<td>${esc(daxRefs)}</td>`;
    html += `<td>${esc(row.pbiTable)}</td>`;
    html += `<td>${esc(row.pbiColumn)}${row.isHidden ? ' <span class="hidden-indicator" title="Hidden from report view">&#128065;&#8211;</span>' : ''}</td>`;
    html += `<td>${renderDataTypeBadge(row.dataType)}</td>`;
    html += `<td>${renderModeBadge(row.mode)}</td>`;
    html += `<td>${esc(row.sourceColumn)}</td>`;
    html += `<td>${esc(row.originalSourceColumn || '')}</td>`;
    if (row.renamed && row.originalSourceColumn && row.sourceColumn && row.pbiColumn) {
      html += `<td class="rename-chain-cell">${esc(row.originalSourceColumn)} <span class="rename-arrow">→</span> ${esc(row.sourceColumn)} <span class="rename-arrow">→</span> ${esc(row.pbiColumn)}</td>`;
    } else {
      html += `<td></td>`;
    }
    html += `<td>${esc(row.sourceTable)}</td>`;
    html += `<td>${esc(row.sourceColumnFull)}</td>`;
    html += `</tr>`;
  }
  html += '</tbody></table></div>';
  html += '</details>';
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

    if (source?.sourceTable) {
      html += `<div class="summary-node layer-source" style="margin-left:${colIndent + 20}px">`;
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

// --- Section 5: Change History ---

function renderChangeHistorySection(measureName, visuals) {
  if (!_changeData || !_changeData.flatChanges || _changeData.flatChanges.length === 0) {
    return '';
  }

  // Direct measure DAX changes
  const measureChanges = _changeData.flatChanges.filter(c =>
    c.target?.measureName === measureName
  );

  // Contextual changes: only changes for THIS measure's visuals + page-level filters
  let contextChanges = [];
  if (visuals && visuals.length > 0) {
    const visualGuids = new Set();
    const pageIds = new Set();
    const pageNames = new Set();
    for (const v of visuals) {
      const parts = v.id?.split('::')[1]?.split('/');
      if (parts?.[0]) pageIds.add(parts[0]);
      if (parts?.[1]) visualGuids.add(parts[1]);
      if (v.page) pageNames.add(v.page);
    }

    contextChanges = _changeData.flatChanges.filter(c => {
      if (!c.target) return false;
      if (c.scope === 'measure') return false;
      // Visual-scope: only changes for THIS measure's visuals
      if (c.scope === 'visual') {
        return c.target.visualId && visualGuids.has(c.target.visualId);
      }
      // Page-scope: page-level filters affect all visuals on the page
      if (c.scope === 'page') {
        if (c.target.pageId && pageIds.has(c.target.pageId)) return true;
        if (c.target.pageName && pageNames.has(c.target.pageName)) return true;
        return false;
      }
      // Bookmark/report: exclude
      return false;
    });
  }

  // Source/column/relationship changes that affect upstream lineage
  const sourceChanges = _changeData.flatChanges.filter(c => {
    if (!c.target) return false;
    return c.scope === 'column' || c.scope === 'relationship' || c.scope === 'source' || c.scope === 'expression';
  });

  const total = measureChanges.length + contextChanges.length + sourceChanges.length;
  if (total === 0) return '';

  let html = '<div class="lineage-section change-history-section">';
  html += `<h3>5. Change History <span class="section-summary-count">${total} change${total !== 1 ? 's' : ''}</span></h3>`;

  if (measureChanges.length > 0) {
    html += '<div class="change-history-group-label">DAX expression changes</div>';
    html += renderChangeItems(measureChanges);
  }

  if (contextChanges.length > 0) {
    if (measureChanges.length > 0) {
      html += '<div class="change-history-group-label" style="margin-top:12px">Related page &amp; visual changes</div>';
    }
    html += renderChangeItems(contextChanges);
  }

  if (sourceChanges.length > 0) {
    html += '<div class="change-history-group-label" style="margin-top:12px">Source &amp; schema changes</div>';
    html += renderChangeItems(sourceChanges);
  }

  html += '</div>';
  return html;
}

/**
 * Render change history for a visual — shows changes on the same page.
 * @param {object} visual - Visual info from traceVisualLineage().
 */
function renderVisualChangeHistorySection(visual, measures) {
  if (!_changeData || !_changeData.flatChanges || _changeData.flatChanges.length === 0) {
    return '';
  }

  // Extract pageId and visualId from visual node ID: "visual::pageId/visualId"
  const idParts = visual.id?.split('::')[1]?.split('/');
  const pageId = idParts?.[0] || '';
  const visualId = idParts?.[1] || visual.objectId || '';
  const pageName = visual.page || '';

  // Extract measure names used by this visual
  const measureNames = new Set();
  if (measures) {
    for (const m of measures) {
      if (m.measureName) measureNames.add(m.measureName);
    }
  }

  const measureChanges = [];
  const visualChanges = [];
  const pageChanges = [];

  for (const c of _changeData.flatChanges) {
    if (!c.target) continue;
    // Measure-scope: DAX changes for measures used by this visual
    if (c.scope === 'measure' && c.target.measureName && measureNames.has(c.target.measureName)) {
      measureChanges.push(c);
      continue;
    }
    // Direct visual match: change targets this exact visual
    if (c.scope === 'visual' && c.target.visualId && c.target.visualId === visualId) {
      visualChanges.push(c);
      continue;
    }
    // Page-scope changes: page-level filters affect all visuals on the page
    if (c.scope === 'page') {
      if ((c.target.pageId && c.target.pageId === pageId) ||
          (c.target.pageName && c.target.pageName === pageName)) {
        pageChanges.push(c);
      }
    }
  }

  // Source/column/relationship changes
  const sourceChanges = _changeData.flatChanges.filter(c => {
    if (!c.target) return false;
    return c.scope === 'column' || c.scope === 'relationship' || c.scope === 'source' || c.scope === 'expression';
  });

  const total = measureChanges.length + visualChanges.length + pageChanges.length + sourceChanges.length;
  if (total === 0) return '';

  let html = '<div class="lineage-section change-history-section">';
  html += `<h3>Change History <span class="section-summary-count">${total} change${total !== 1 ? 's' : ''}</span></h3>`;

  if (measureChanges.length > 0) {
    html += '<div class="change-history-group-label">DAX expression changes</div>';
    html += renderChangeItems(measureChanges);
  }

  if (visualChanges.length > 0) {
    if (measureChanges.length > 0) {
      html += '<div class="change-history-group-label" style="margin-top:12px">Visual changes</div>';
    } else {
      html += '<div class="change-history-group-label">Visual changes</div>';
    }
    html += renderChangeItems(visualChanges);
  }

  if (pageChanges.length > 0) {
    if (measureChanges.length > 0 || visualChanges.length > 0) {
      html += '<div class="change-history-group-label" style="margin-top:12px">Page-level changes</div>';
    }
    html += renderChangeItems(pageChanges);
  }

  if (sourceChanges.length > 0) {
    html += '<div class="change-history-group-label" style="margin-top:12px">Source &amp; schema changes</div>';
    html += renderChangeItems(sourceChanges);
  }

  html += '</div>';
  return html;
}

/**
 * Render page change history in the main content area.
 * Called when user clicks a page change badge in the sidebar.
 */
export function renderPageChangeHistory(pageName, changes) {
  const empty = document.getElementById('lineage-empty');
  const content = document.getElementById('lineage-content');
  const titleEl = document.getElementById('lineage-title');
  const treeContainer = document.getElementById('lineage-tree-container');
  const sectionsContainer = document.getElementById('lineage-sections');

  if (!content) return;

  if (empty) empty.classList.add('hidden');
  content.classList.remove('hidden');

  if (treeContainer) {
    destroyTree(treeContainer);
    const toolbar = treeContainer.querySelector('.export-toolbar');
    if (toolbar) toolbar.remove();
  }

  if (titleEl) {
    titleEl.textContent = pageName;
    const oldSub = titleEl.nextElementSibling;
    if (oldSub && oldSub.classList.contains('lineage-subtitle')) oldSub.remove();
    const sub = document.createElement('div');
    sub.className = 'lineage-subtitle';
    const commitCount = new Set(changes.map(c => c.commitHash)).size;
    sub.textContent = `${changes.length} change${changes.length !== 1 ? 's' : ''} across ${commitCount} commit${commitCount !== 1 ? 's' : ''}`;
    titleEl.insertAdjacentElement('afterend', sub);
  }

  if (sectionsContainer) {
    let html = '<div class="lineage-section change-history-section">';
    html += `<h3>Page Change History <span class="section-summary-count">${changes.length}</span></h3>`;
    html += renderChangeItemsGroupedByCommit(changes);
    html += '</div>';
    sectionsContainer.innerHTML = html;
  }
}

function renderChangeItems(changes) {
  let html = '<div class="change-history-list">';
  for (const change of changes) {
    html += '<div class="change-history-item">';
    html += `<div class="change-history-header">`;
    html += `<span class="change-type-badge change-type-${change.scope || 'measure'}">${formatChangeType(change.type)}</span>`;
    html += `<span class="change-commit-info" title="${esc(change.commitHash)}">${esc(change.commitHash)}</span>`;
    if (change.commitDate) {
      html += ` <span class="change-date">${formatDate(change.commitDate)}</span>`;
    }
    html += '</div>';
    html += `<div class="change-description">${esc(change.description)}</div>`;
    if (change.commitMessage) {
      html += `<div class="change-commit-msg">${esc(change.commitMessage)}</div>`;
    }
    // DAX expression diff for measure/calc changes
    html += renderExpressionDiff(change);
    // Impact chain (grouped by page)
    html += renderImpactChain(change.impact);
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/**
 * Render change items grouped by commit, each group collapsible (default collapsed).
 */
function renderChangeItemsGroupedByCommit(changes) {
  // Group by commitHash
  const groups = new Map();
  for (const c of changes) {
    const key = c.commitHash || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  // Sort by date descending (newest first)
  const sorted = [...groups.entries()].sort((a, b) => {
    const dateA = a[1][0].commitDate || '';
    const dateB = b[1][0].commitDate || '';
    return dateB.localeCompare(dateA);
  });

  let html = '';
  for (const [hash, groupChanges] of sorted) {
    const first = groupChanges[0];
    html += '<details class="commit-group">';
    html += '<summary class="commit-group-summary">';
    html += `<span class="change-commit-info">${esc(hash)}</span>`;
    if (first.commitDate) html += ` <span class="change-date">${formatDate(first.commitDate)}</span>`;
    if (first.commitMessage) html += ` <span class="commit-group-msg">${esc(first.commitMessage)}</span>`;
    html += ` <span class="section-summary-count">${groupChanges.length}</span>`;
    html += '</summary>';
    html += renderChangeItems(groupChanges);
    html += '</details>';
  }
  return html;
}

/**
 * Render collapsible before/after DAX expression diff.
 */
function renderExpressionDiff(change) {
  if (!change.details) return '';
  const before = change.details.before?.expression;
  const after = change.details.after?.expression;
  if (!before && !after) return '';

  let html = '<details class="change-dax-details">';
  html += '<summary class="change-dax-summary">View expression change</summary>';
  html += '<div class="change-dax-diff">';

  if (before && after) {
    html += `<div class="change-dax-block change-dax-before"><span class="change-dax-label">Before</span><div class="chain-dax">${highlightDax(before)}</div></div>`;
    html += `<div class="change-dax-block change-dax-after"><span class="change-dax-label">After</span><div class="chain-dax">${highlightDax(after)}</div></div>`;
  } else if (after) {
    html += `<div class="change-dax-block change-dax-after"><span class="change-dax-label">Added</span><div class="chain-dax">${highlightDax(after)}</div></div>`;
  } else if (before) {
    html += `<div class="change-dax-block change-dax-before"><span class="change-dax-label">Removed</span><div class="chain-dax">${highlightDax(before)}</div></div>`;
  }

  html += '</div></details>';
  return html;
}

/**
 * Render impact chain grouped by page, deduplicated.
 */
function renderImpactChain(impact) {
  if (!impact || impact.length === 0) return '';

  // Deduplicate by visualId and group by page
  const seen = new Set();
  const byPage = new Map();
  for (const imp of impact) {
    const key = imp.visualId || imp.visualName || '';
    if (seen.has(key)) continue;
    seen.add(key);
    const page = imp.pageName || '(unknown)';
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(imp);
  }

  let html = '<div class="change-impact">';
  html += '<span class="change-impact-label">Impact:</span> ';
  const groups = [];
  for (const [page, items] of byPage) {
    const visuals = items.map(imp =>
      `<span class="change-impact-item" title="${esc(imp.reason || '')}">${esc(imp.visualName || imp.visualId || 'unknown')}</span>`
    ).join(', ');
    groups.push(`<span class="change-impact-page">${esc(page)}</span> → ${visuals}`);
  }
  html += groups.join(' · ');
  html += '</div>';
  return html;
}

function formatChangeType(type) {
  if (!type) return 'change';
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return isoStr; }
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

// --- Aggregated Source Columns (Data Engineer View) ---

/**
 * Render an aggregated source columns section for visual lineage.
 * Answers: "What source tables/columns feed this visual?" — primary data engineer view.
 * Supports Flat view (all rows) and "By Source" grouped view.
 */
function renderAggregatedSourceSection(allMeasures) {
  if (!allMeasures || allMeasures.length === 0) return '';

  // Collect all source rows across all measures, deduplicate by sourceColumnFull
  const seen = new Set();
  const rows = [];
  for (const m of allMeasures) {
    if (!m.lineage?.sourceTable) continue;
    for (const row of m.lineage.sourceTable) {
      const key = row.sourceColumnFull || `${row.pbiTable}.${row.pbiColumn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...row, fromMeasure: m.measureName });
    }
  }

  if (rows.length === 0) return '';

  const uniqueSources = new Set(rows.filter(r => r.sourceTable).map(r => r.sourceTable));
  const renamedCount = rows.filter(r => r.renamed).length;

  let html = '<details class="lineage-section lineage-section-collapsible agg-source-section" open>';
  html += `<summary class="lineage-section-header">`;
  html += `<h3>Source Columns — All Measures `;
  html += `<span class="section-summary-count">${rows.length} column${rows.length !== 1 ? 's' : ''} from ${uniqueSources.size} source${uniqueSources.size !== 1 ? 's' : ''}`;
  if (renamedCount > 0) html += ` · ${renamedCount} renamed`;
  html += `</span></h3>`;
  // View toggle inside summary (stops propagation via JS)
  html += `<span class="agg-view-toggle" onclick="event.stopPropagation()">`;
  html += `<span class="agg-view-label">View:</span>`;
  html += `<button class="btn-agg-view active" data-agg-view="flat" title="Show all columns in one single table">All Columns</button>`;
  html += `<button class="btn-agg-view" data-agg-view="grouped" title="Group columns by source database/table">Grouped by Source</button>`;
  html += `</span>`;
  html += `</summary>`;

  // Flat view
  html += '<div class="agg-source-flat">';
  html += '<div class="trace-table-wrapper"><table class="trace-table">';
  html += '<thead><tr><th>PBI Column</th><th>Source Table</th><th>Original Source Column</th><th>Rename Chain</th><th>Used By Measure</th></tr></thead>';
  html += '<tbody>';
  for (const row of rows) {
    html += `<tr${row.renamed ? ' class="renamed-row"' : ''}>`;
    html += `<td>${esc(row.pbiTable)}[${esc(row.pbiColumn)}]</td>`;
    html += `<td>${esc(row.sourceTable || '')}</td>`;
    html += `<td>${esc(row.originalSourceColumn || row.sourceColumn || '')}</td>`;
    if (row.renamed && row.renameChain) {
      html += `<td class="rename-chain-cell">${esc(row.renameChain.sourceName)} <span class="rename-arrow">→</span> ${esc(row.renameChain.pqName)} <span class="rename-arrow">→</span> ${esc(row.renameChain.pbiName)}</td>`;
    } else {
      html += '<td></td>';
    }
    html += `<td>${esc(row.fromMeasure)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  html += '</div>';

  // Grouped-by-source view (hidden initially)
  html += '<div class="agg-source-grouped hidden">';
  const groups = new Map();
  for (const row of rows) {
    const key = row.sourceTable || '(source unknown)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [sourceName, groupRows] of groups) {
    const mode = groupRows[0]?.mode || '';
    html += `<details class="source-group" open>`;
    html += `<summary class="source-group-header">`;
    html += `<span class="source-group-dot"></span>`;
    html += `<strong class="source-group-name">${esc(sourceName)}</strong>`;
    if (mode) html += ` ${renderModeBadge(mode)}`;
    html += ` <span class="section-summary-count">${groupRows.length} column${groupRows.length !== 1 ? 's' : ''}</span>`;
    html += `</summary>`;
    html += '<div class="trace-table-wrapper"><table class="trace-table">';
    html += '<thead><tr><th>PBI Column</th><th>Original Source Column</th><th>Rename Chain</th><th>Used By Measure</th></tr></thead>';
    html += '<tbody>';
    for (const row of groupRows) {
      html += `<tr${row.renamed ? ' class="renamed-row"' : ''}>`;
      html += `<td>${esc(row.pbiTable)}[${esc(row.pbiColumn)}]</td>`;
      html += `<td>${esc(row.originalSourceColumn || row.sourceColumn || '')}</td>`;
      if (row.renamed && row.renameChain) {
        html += `<td class="rename-chain-cell">${esc(row.renameChain.sourceName)} <span class="rename-arrow">→</span> ${esc(row.renameChain.pqName)} <span class="rename-arrow">→</span> ${esc(row.renameChain.pbiName)}</td>`;
      } else {
        html += '<td></td>';
      }
      html += `<td>${esc(row.fromMeasure)}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    html += '</details>';
  }
  html += '</div>';

  html += '</details>';
  return html;
}

// --- Helpers ---

function bindClickHandlers(container) {
  // Aggregated source view toggle (Flat / By Source)
  container.querySelectorAll('.btn-agg-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const view = btn.dataset.aggView;
      const section = btn.closest('.agg-source-section');
      if (!section) return;
      section.querySelectorAll('.btn-agg-view').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const flat = section.querySelector('.agg-source-flat');
      const grouped = section.querySelector('.agg-source-grouped');
      if (view === 'grouped') {
        flat?.classList.add('hidden');
        grouped?.classList.remove('hidden');
      } else {
        flat?.classList.remove('hidden');
        grouped?.classList.add('hidden');
      }
    });
  });

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

  // Impact analysis buttons
  container.querySelectorAll('.btn-impact[data-impact-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_currentGraph) {
        openImpactPanel(btn.dataset.impactId, _currentGraph);
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

/**
 * Add export toolbar (SVG/PNG buttons) above the tree SVG.
 */
function addExportToolbar(container, name) {
  // Remove any existing toolbar
  const existing = container.querySelector('.tree-export-toolbar');
  if (existing) existing.remove();

  const toolbar = document.createElement('div');
  toolbar.className = 'tree-export-toolbar';

  const btnSvg = document.createElement('button');
  btnSvg.className = 'btn-tree-export';
  btnSvg.textContent = 'Export SVG';
  btnSvg.title = 'Download tree as SVG';
  btnSvg.addEventListener('click', () => {
    exportTreeAsSvg(container, sanitizeFilename(name));
    showExportFeedback(btnSvg);
  });

  const btnPng = document.createElement('button');
  btnPng.className = 'btn-tree-export';
  btnPng.textContent = 'Export PNG';
  btnPng.title = 'Download tree as PNG';
  btnPng.addEventListener('click', () => {
    exportTreeAsPng(container, sanitizeFilename(name));
    showExportFeedback(btnPng);
  });

  const btnMd = document.createElement('button');
  btnMd.className = 'btn-tree-export';
  btnMd.textContent = 'Copy Markdown';
  btnMd.title = 'Copy lineage as Markdown to clipboard';
  btnMd.addEventListener('click', () => {
    const md = buildLineageMarkdown(name);
    if (md) {
      navigator.clipboard.writeText(md).then(() => showExportFeedback(btnMd));
    }
  });

  toolbar.appendChild(btnSvg);
  toolbar.appendChild(btnPng);
  toolbar.appendChild(btnMd);
  container.insertBefore(toolbar, container.firstChild);
}

function sanitizeFilename(name) {
  return (name || 'lineage').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

function buildLineageMarkdown() {
  if (!_currentLineage || !_currentMeasureName) return null;
  const lineage = _currentLineage;
  const lines = [];

  lines.push(`## Lineage: ${_currentMeasureName}`);
  lines.push('');

  // Visuals section
  if (lineage.visuals && lineage.visuals.length > 0) {
    lines.push(`### Used by ${lineage.visuals.length} visual(s)`);
    for (const v of lineage.visuals) {
      const page = v.pageName || '';
      const title = v.title || v.name || v.id;
      lines.push(`- **${title}** (${page})`);
    }
    lines.push('');
  }

  // DAX chain
  if (lineage.measureChain) {
    lines.push('### Dependency Chain');
    buildChainMarkdown(lineage.measureChain, 0, lines);
    lines.push('');
  }

  // Source table
  if (lineage.sourceTable && lineage.sourceTable.length > 0) {
    lines.push('### Source Lineage');
    lines.push('');
    lines.push('| PBI Table | PBI Column | Type | Source Table | Source Column | Mode |');
    lines.push('|-----------|------------|------|-------------|---------------|------|');
    for (const row of lineage.sourceTable) {
      lines.push(`| ${row.pbiTable} | ${row.pbiColumn} | ${row.dataType || ''} | ${row.sourceTable || ''} | ${row.sourceColumn || ''} | ${row.mode || ''} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Generated by [PBIP Lineage Explorer](https://github.com/JonathanJihwanKim/pbip-lineage-explorer) — free & open-source*');

  return lines.join('\n');
}

function buildChainMarkdown(chain, depth, lines) {
  if (!chain) return;
  const indent = '  '.repeat(depth);
  const daxSnippet = (chain.expression || '').replace(/\n/g, ' ').substring(0, 80);
  lines.push(`${indent}- **${chain.name}** ${chain.table ? `(${chain.table})` : ''}`);
  if (daxSnippet) lines.push(`${indent}  \`${daxSnippet}${chain.expression?.length > 80 ? '...' : ''}\``);
  for (const col of chain.columns || []) {
    lines.push(`${indent}  - ${col.table}[${col.name}] ${col.dataType ? `(${col.dataType})` : ''}`);
  }
  for (const child of chain.children || []) {
    buildChainMarkdown(child, depth + 1, lines);
  }
}

function showExportFeedback(btn) {
  const orig = btn.textContent;
  btn.textContent = 'Exported!';
  btn.style.color = '#4caf50';
  btn.style.borderColor = '#4caf50';
  setTimeout(() => { btn.textContent = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 1500);
}

/**
 * Render Import/DirectQuery mode badge.
 */
function renderModeBadge(mode) {
  if (!mode) return '';
  const lower = mode.toLowerCase();
  if (lower === 'import') return '<span class="mode-badge mode-badge-import">Import</span>';
  if (lower === 'directquery') return '<span class="mode-badge mode-badge-dq">DQ</span>';
  if (lower === 'dual') return '<span class="mode-badge mode-badge-dual">Dual</span>';
  return `<span class="mode-badge">${esc(mode)}</span>`;
}

function renderDataTypeBadge(dataType) {
  if (!dataType) return '';
  const lower = dataType.toLowerCase();
  let cssClass = '';
  let label = dataType;
  if (lower === 'string') { cssClass = 'dt-string'; label = 'abc'; }
  else if (lower === 'int64') { cssClass = 'dt-int64'; label = 'int'; }
  else if (lower === 'double') { cssClass = 'dt-double'; label = 'dec'; }
  else if (lower === 'decimal') { cssClass = 'dt-decimal'; label = 'dec'; }
  else if (lower === 'datetime') { cssClass = 'dt-dateTime'; label = 'date'; }
  else if (lower === 'boolean') { cssClass = 'dt-boolean'; label = 'bool'; }
  else { cssClass = ''; label = dataType.substring(0, 4); }
  return `<span class="data-type-badge ${cssClass}" title="${esc(dataType)}">${label}</span>`;
}

/**
 * Count total measures and columns in a chain tree.
 */
function countChainNodes(chain) {
  if (!chain) return { measures: 0, columns: 0 };
  let measures = 1; // count self
  let columns = chain.columns ? chain.columns.length : 0;
  for (const child of (chain.children || [])) {
    const sub = countChainNodes(child);
    measures += sub.measures;
    columns += sub.columns;
  }
  return { measures, columns };
}

/**
 * Check if a measure chain contains circular references.
 */
function chainHasCircularRef(chain) {
  if (!chain) return false;
  if (chain.expression === '(circular reference)') return true;
  for (const child of (chain.children || [])) {
    if (chainHasCircularRef(child)) return true;
  }
  return false;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
