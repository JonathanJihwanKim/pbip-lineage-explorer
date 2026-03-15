/**
 * Main entry point for PBIP Lineage Explorer.
 * Orchestrates parsing, graph building, and UI initialization.
 * Single-view: measure picker + lineage trace output with D3 tree visualization.
 */

// Core analysis engine
import {
  parseTmdlModel, parseExpressions, parseDaxExpression,
  parsePbirReport, detectEnrichments, applyEnrichments,
  buildGraph, computeStats, traceMeasureLineage, traceVisualLineage,
} from '@pbip-lineage/core';

// Browser-specific file reader
import { openProjectFolder, loadSelectedReport, loadSemanticModelFolder } from './parser/pbipReader.js';

// UI
import { initToolbar, updateStats, showLoading, hideLoading } from './ui/toolbar.js';
import { initMeasurePicker, populateMeasures, selectMeasure } from './ui/measurePicker.js';
import { initVisualBrowser, populateVisuals, selectVisual } from './ui/visualBrowser.js';
import { initLineageView, renderLineage, renderVisualLineage, clearLineage } from './ui/lineageView.js';
import { populateSourceMapping, renderSourceMapping } from './ui/sourceMapping.js';
import { initPageLayout, renderPageLayout } from './ui/pageLayout.js';

const state = {
  graph: null,
  reportStructure: null,
  reportName: null,
  semanticModelPath: null,
  sourceMapVisible: false,
  measureSelectCount: 0,
  navigationHistory: [], // stack of { type: 'measure'|'visual', id: string }
  currentSelection: null, // { type: 'measure'|'visual', id: string }
};

// --- Initialization ---

function init() {
  initToolbar({ onOpenFolder: handleOpenFolder });
  initMeasurePicker({ onSelect: handleMeasureSelect });
  initVisualBrowser({ onVisualSelect: handleVisualSelect, onMeasureNavigate: handleMeasureSelect, onPageLayoutSelect: handlePageLayoutSelect });
  initLineageView({ onMeasureNavigate: handleMeasureSelect, onVisualNavigate: handleVisualSelect });
  initPageLayout({ onVisualSelect: handleVisualSelect });

  const btnLoadModel = document.getElementById('btn-load-model');
  if (btnLoadModel) btnLoadModel.addEventListener('click', handleLoadSemanticModel);

  const btnBack = document.getElementById('btn-back');
  if (btnBack) btnBack.addEventListener('click', navigateBack);

  // Source Map toggle
  const btnSourceMap = document.getElementById('btn-source-map');
  if (btnSourceMap) btnSourceMap.addEventListener('click', toggleSourceMap);

  // Toast close
  const toastClose = document.getElementById('toast-close');
  if (toastClose) toastClose.addEventListener('click', hideToast);

  // Sidebar tab switching
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      const panelId = `tab-${tab.dataset.tab}`;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.remove('hidden');
    });
  });

  document.addEventListener('keydown', handleKeyDown);
}

// --- Source Map Toggle ---

function toggleSourceMap() {
  state.sourceMapVisible = !state.sourceMapVisible;
  const btn = document.getElementById('btn-source-map');
  const lineageEmpty = document.getElementById('lineage-empty');
  const lineageContent = document.getElementById('lineage-content');
  const sourceMapContainer = document.getElementById('source-map-container');

  if (state.sourceMapVisible) {
    if (btn) btn.classList.add('active');
    if (lineageEmpty) lineageEmpty.classList.add('hidden');
    if (lineageContent) lineageContent.classList.add('hidden');
    if (sourceMapContainer) {
      sourceMapContainer.classList.remove('hidden');
      renderSourceMapping(sourceMapContainer);
    }
  } else {
    if (btn) btn.classList.remove('active');
    if (sourceMapContainer) sourceMapContainer.classList.add('hidden');
    // Restore previous lineage view
    if (lineageContent && lineageContent.innerHTML.trim()) {
      lineageContent.classList.remove('hidden');
    } else {
      if (lineageEmpty) lineageEmpty.classList.remove('hidden');
    }
  }
}

// --- Toast ---

function showSponsorToast() {
  if (sessionStorage.getItem('pbip-toast-shown')) return;
  const toast = document.getElementById('sponsor-toast');
  if (toast) {
    toast.classList.remove('hidden');
    sessionStorage.setItem('pbip-toast-shown', '1');
  }
}

function hideToast() {
  const toast = document.getElementById('sponsor-toast');
  if (toast) toast.classList.add('hidden');
}

// --- Data Loading ---

async function handleOpenFolder() {
  try {
    clearWelcomeError();
    showLoading('Select the folder that contains your .Report and .SemanticModel folders...');

    const projectResult = await openProjectFolder();

    // Multiple reports found — show picker overlay
    if (projectResult.multipleReports) {
      hideLoading();
      showReportPicker(projectResult.multipleReports, projectResult.modelCandidates);
      return;
    }

    // Single report (or direct .Report selection) — load immediately
    await loadProjectResult(projectResult);
  } catch (err) {
    hideLoading();
    hideLoadingOverlay();
    if (err.name === 'AbortError') return;
    console.error('Error loading project:', err);
    showWelcomeError(`Failed to load project: ${err.message}`);
  }
}

/**
 * Show the report picker overlay when multiple .Report folders are found.
 */
function showReportPicker(reportEntries, modelCandidates) {
  const overlay = document.getElementById('report-picker-overlay');
  const list = document.getElementById('report-picker-list');
  if (!overlay || !list) return;

  // Hide welcome overlay
  const welcome = document.getElementById('welcome-overlay');
  if (welcome) welcome.classList.add('hidden');

  list.innerHTML = '';
  for (const entry of reportEntries) {
    const item = document.createElement('div');
    item.className = 'report-picker-item';
    item.textContent = entry.name;
    item.addEventListener('click', async () => {
      overlay.classList.add('hidden');
      try {
        showLoadingProgress('Loading report...', 10);
        const result = await loadSelectedReport(entry.handle, modelCandidates);
        await loadProjectResult(result);
      } catch (err) {
        hideLoadingOverlay();
        console.error('Error loading report:', err);
        showWelcomeError(`Failed to load report: ${err.message}`);
      }
    });
    list.appendChild(item);
  }

  overlay.classList.remove('hidden');
}

/**
 * Process a loaded project result (single report): parse, build graph, update UI.
 */
async function loadProjectResult(projectResult) {
  const modelStructure = projectResult.modelStructure;

  state.reportStructure = projectResult.reportStructure;
  state.reportName = projectResult.reportName;
  state.semanticModelPath = projectResult.semanticModelPath;

  showLoadingProgress('Step 1/5: Parsing model...', 10);

  const tmdlFiles = modelStructure?.tmdlFiles || [];
  const relationshipFiles = modelStructure?.relationshipFiles || [];
  const expressionFiles = modelStructure?.expressionFiles || [];
  const model = parseTmdlModel(tmdlFiles, relationshipFiles);

  let parsedExpressions = { expressions: [], parameters: new Map() };
  for (const { content } of expressionFiles) {
    const result = parseExpressions(content);
    parsedExpressions.expressions.push(...result.expressions);
    for (const [k, v] of result.parameters) parsedExpressions.parameters.set(k, v);
  }
  model.expressions = parsedExpressions.expressions;
  model.parameters = parsedExpressions.parameters;

  showLoadingProgress('Step 2/5: Parsing DAX...', 30);

  for (const table of model.tables) {
    for (const measure of (table.measures || [])) {
      if (measure.expression) measure.daxDeps = parseDaxExpression(measure.expression);
    }
    for (const col of (table.calculatedColumns || [])) {
      if (col.expression) col.daxDeps = parseDaxExpression(col.expression);
    }
  }

  showLoadingProgress('Step 3/5: Parsing report...', 50);

  const report = parsePbirReport(
    projectResult.reportStructure.visualFiles,
    projectResult.reportStructure.pageFiles
  );

  const enrichments = detectEnrichments(model.tables);

  showLoadingProgress('Step 4/5: Building graph...', 70);

  let graph = buildGraph(model, report, enrichments);
  graph = applyEnrichments(graph, enrichments);
  state.graph = graph;

  showLoadingProgress('Step 5/5: Done!', 100);

  const rawStats = computeStats(graph);
  const projectName = projectResult.reportName || projectResult.modelName || 'Project';
  updateStats({
    projectName,
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    byType: {
      table: rawStats.tables, measure: rawStats.measures,
      visual: rawStats.visuals, column: rawStats.columns,
      page: rawStats.pages, source: rawStats.sources,
    },
    orphanedMeasures: rawStats.orphanedMeasures || 0,
    fieldParameters: enrichments.fieldParameters?.length || 0,
    calculationGroups: enrichments.calculationGroups?.length || 0,
  });

  // Reset navigation history on new project load
  state.navigationHistory = [];
  state.currentSelection = null;
  updateBackButton();

  populateMeasures(graph);
  populateVisuals(graph);
  populateSourceMapping(graph);

  // Show Source Map button
  const btnSourceMap = document.getElementById('btn-source-map');
  if (btnSourceMap) btnSourceMap.classList.remove('hidden');

  // Show orphan filter
  const filterRow = document.getElementById('measure-filter-row');
  if (filterRow) filterRow.classList.remove('hidden');

  // Hide overlays
  const overlay = document.getElementById('welcome-overlay');
  if (overlay) overlay.classList.add('hidden');

  // Show/hide model banner based on whether semantic model was loaded
  const banner = document.getElementById('model-banner');
  if (banner) {
    if (!modelStructure) {
      const modelHint = state.semanticModelPath
        ? state.semanticModelPath.replace(/^\.\.\//, '').replace(/\/$/, '')
        : '.SemanticModel';
      const bannerText = banner.querySelector('.model-banner-text');
      if (bannerText) bannerText.textContent = `Select the ${modelHint} folder to enable full DAX lineage`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  hideLoading();
  hideLoadingOverlay();
}

// --- Semantic Model Loading ---

async function handleLoadSemanticModel() {
  try {
    showLoadingProgress('Select the .SemanticModel folder...', 0);
    showLoading('Select the .SemanticModel folder...');

    const result = await loadSemanticModelFolder();
    if (!result) {
      hideLoadingOverlay();
      return; // User cancelled
    }

    showLoadingProgress('Parsing semantic model...', 30);

    const modelStructure = result.modelStructure;
    const tmdlFiles = modelStructure?.tmdlFiles || [];
    const relationshipFiles = modelStructure?.relationshipFiles || [];
    const expressionFiles = modelStructure?.expressionFiles || [];
    const model = parseTmdlModel(tmdlFiles, relationshipFiles);

    let parsedExpressions = { expressions: [], parameters: new Map() };
    for (const { content } of expressionFiles) {
      const r = parseExpressions(content);
      parsedExpressions.expressions.push(...r.expressions);
      for (const [k, v] of r.parameters) parsedExpressions.parameters.set(k, v);
    }
    model.expressions = parsedExpressions.expressions;
    model.parameters = parsedExpressions.parameters;

    for (const table of model.tables) {
      for (const measure of (table.measures || [])) {
        if (measure.expression) measure.daxDeps = parseDaxExpression(measure.expression);
      }
      for (const col of (table.calculatedColumns || [])) {
        if (col.expression) col.daxDeps = parseDaxExpression(col.expression);
      }
    }

    showLoadingProgress('Rebuilding graph...', 70);

    const report = parsePbirReport(
      state.reportStructure.visualFiles,
      state.reportStructure.pageFiles
    );

    const enrichments = detectEnrichments(model.tables);
    let graph = buildGraph(model, report, enrichments);
    graph = applyEnrichments(graph, enrichments);
    state.graph = graph;

    showLoadingProgress('Done!', 100);

    const rawStats = computeStats(graph);
    updateStats({
      projectName: state.reportName || result.modelName || 'Project',
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      byType: {
        table: rawStats.tables, measure: rawStats.measures,
        visual: rawStats.visuals, column: rawStats.columns,
        page: rawStats.pages, source: rawStats.sources,
      },
      orphanedMeasures: rawStats.orphanedMeasures || 0,
      fieldParameters: enrichments.fieldParameters?.length || 0,
      calculationGroups: enrichments.calculationGroups?.length || 0,
    });

    populateMeasures(graph);
    populateVisuals(graph);
    populateSourceMapping(graph);

    // Hide the model banner
    const banner = document.getElementById('model-banner');
    if (banner) banner.classList.add('hidden');

    hideLoadingOverlay();
  } catch (err) {
    hideLoadingOverlay();
    if (err.name === 'AbortError') return;
    console.error('Error loading semantic model:', err);
    showError(`Failed to load semantic model: ${err.message}`);
  }
}

// --- Measure Selection ---

function handleMeasureSelect(measureId, { skipHistory = false } = {}) {
  if (!state.graph) return;

  // Exit source map view if active
  if (state.sourceMapVisible) {
    state.sourceMapVisible = false;
    const btn = document.getElementById('btn-source-map');
    if (btn) btn.classList.remove('active');
    const sourceMapContainer = document.getElementById('source-map-container');
    if (sourceMapContainer) sourceMapContainer.classList.add('hidden');
  }

  const node = state.graph.nodes.get(measureId);
  if (!node || node.type !== 'measure') {
    console.warn(`handleMeasureSelect: node not found or not a measure: ${measureId}`);
    showLineageMessage(`Measure not found in graph: ${measureId}`);
    return;
  }

  // Push current selection to history before navigating
  if (!skipHistory && state.currentSelection) {
    state.navigationHistory.push(state.currentSelection);
  }
  state.currentSelection = { type: 'measure', id: measureId };
  updateBackButton();

  try {
    const lineage = traceMeasureLineage(measureId, state.graph);
    if (!lineage) {
      console.warn(`handleMeasureSelect: traceMeasureLineage returned null for ${measureId}`);
      showLineageMessage(`Could not trace lineage for "${node.name}". The measure may not have any dependencies.`);
      selectMeasure(measureId);
      return;
    }
    renderLineage(lineage, node.name, state.graph);
    selectMeasure(measureId);

    // Sponsor toast after 5th measure selection
    state.measureSelectCount++;
    if (state.measureSelectCount === 5) {
      showSponsorToast();
    }
  } catch (err) {
    console.error(`Error tracing lineage for measure ${measureId}:`, err);
    showLineageMessage(`Failed to trace lineage for "${node.name}": ${err.message}`);
  }
}

// --- Visual Selection ---

function handleVisualSelect(visualId, { skipHistory = false } = {}) {
  if (!state.graph) return;

  // Exit source map view if active
  if (state.sourceMapVisible) {
    state.sourceMapVisible = false;
    const btn = document.getElementById('btn-source-map');
    if (btn) btn.classList.remove('active');
    const sourceMapContainer = document.getElementById('source-map-container');
    if (sourceMapContainer) sourceMapContainer.classList.add('hidden');
  }

  const node = state.graph.nodes.get(visualId);
  if (!node || node.type !== 'visual') {
    console.warn(`handleVisualSelect: node not found or not a visual: ${visualId}`);
    showLineageMessage(`Visual not found in graph: ${visualId}`);
    return;
  }

  // Push current selection to history before navigating
  if (!skipHistory && state.currentSelection) {
    state.navigationHistory.push(state.currentSelection);
  }
  state.currentSelection = { type: 'visual', id: visualId };
  updateBackButton();

  try {
    const lineage = traceVisualLineage(visualId, state.graph);
    if (!lineage) {
      showLineageMessage(`Could not trace lineage for this visual.`);
      selectVisual(visualId);
      return;
    }
    renderVisualLineage(lineage, state.graph);
    selectVisual(visualId);
  } catch (err) {
    console.error(`Error tracing lineage for visual ${visualId}:`, err);
    showLineageMessage(`Failed to trace lineage for visual: ${err.message}`);
  }
}

// --- Page Layout Selection ---

function handlePageLayoutSelect(pageName, { skipHistory = false } = {}) {
  if (!state.graph) return;

  // Exit source map view if active
  if (state.sourceMapVisible) {
    state.sourceMapVisible = false;
    const btn = document.getElementById('btn-source-map');
    if (btn) btn.classList.remove('active');
    const sourceMapContainer = document.getElementById('source-map-container');
    if (sourceMapContainer) sourceMapContainer.classList.add('hidden');
  }

  // Find page node by matching name or pageId
  let pageNode = null;
  for (const node of state.graph.nodes.values()) {
    if (node.type === 'page' && (node.name === pageName || node.metadata.pageId === pageName)) {
      pageNode = node;
      break;
    }
  }

  if (!pageNode) {
    showLineageMessage(`Page not found: ${pageName}`);
    return;
  }

  // Push current selection to history before navigating
  if (!skipHistory && state.currentSelection) {
    state.navigationHistory.push(state.currentSelection);
  }
  state.currentSelection = { type: 'page', id: pageName };
  updateBackButton();

  renderPageLayout(pageNode, state.graph);
  updateBackButton();
}

function showLineageMessage(message) {
  const empty = document.getElementById('lineage-empty');
  const content = document.getElementById('lineage-content');
  if (content) content.classList.add('hidden');
  if (empty) {
    empty.classList.remove('hidden');
    empty.innerHTML = `<p class="lineage-muted">${message}</p>`;
  }
}

// --- Keyboard Shortcuts ---

function handleKeyDown(event) {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    event.preventDefault();
    const input = document.getElementById('measure-search');
    if (input) input.focus();
  }

  // Escape to close source map view
  if (event.key === 'Escape' && state.sourceMapVisible) {
    toggleSourceMap();
  }

  // Alt+Left to go back in navigation history
  if (event.key === 'ArrowLeft' && event.altKey) {
    event.preventDefault();
    navigateBack();
  }
}

// --- Back Navigation ---

function navigateBack() {
  if (state.navigationHistory.length === 0) return;
  const prev = state.navigationHistory.pop();
  if (prev.type === 'measure') {
    handleMeasureSelect(prev.id, { skipHistory: true });
  } else if (prev.type === 'visual') {
    handleVisualSelect(prev.id, { skipHistory: true });
  } else if (prev.type === 'page') {
    handlePageLayoutSelect(prev.id, { skipHistory: true });
  }
  updateBackButton();
}

function updateBackButton() {
  const btn = document.getElementById('btn-back');
  if (!btn) return;
  if (state.navigationHistory.length > 0) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

// --- Utility ---

function showLoadingProgress(message, percent) {
  const overlay = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  const fill = document.getElementById('loading-bar-fill');
  if (overlay) overlay.classList.remove('hidden');
  if (text) text.textContent = message;
  if (fill) fill.style.width = `${percent}%`;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function showError(message) {
  const el = document.getElementById('stats');
  if (el) {
    const prev = el.textContent;
    el.textContent = message;
    el.style.color = '#ff5252';
    setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 5000);
  }
}

function showWelcomeError(message) {
  const el = document.getElementById('welcome-error');
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
  // Also ensure welcome overlay is visible so user sees the error
  const overlay = document.getElementById('welcome-overlay');
  if (overlay) overlay.classList.remove('hidden');
}

function clearWelcomeError() {
  const el = document.getElementById('welcome-error');
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

// --- Start ---

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
