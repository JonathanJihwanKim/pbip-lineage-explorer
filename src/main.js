/**
 * Main entry point for PBIP Lineage Explorer.
 * Orchestrates parsing, graph building, and UI initialization.
 */

// Parsers
import { openReportFolder, openSemanticModelFolder } from './parser/pbipReader.js';
import { parseTmdlModel } from './parser/tmdlParser.js';
import { parsePbirReport } from './parser/pbirParser.js';
import { parseDaxExpression } from './parser/daxParser.js';
import { detectEnrichments, applyEnrichments } from './parser/enrichment.js';

// Graph
import { buildGraph, computeStats } from './graph/graphBuilder.js';
import { initRenderer, exportSvg, exportPng } from './graph/graphRenderer.js';
import { analyzeImpact, findOrphans, extractSubgraph } from './graph/impactAnalysis.js';

// UI
import { initSearchPanel, updateFilters, clearSearch } from './ui/searchPanel.js';
import { initDetailPanel, showNodeDetail, hideDetailPanel } from './ui/detailPanel.js';
import { initToolbar, updateStats, setActiveLayout, showLoading, hideLoading } from './ui/toolbar.js';

// Constants
import { LAYOUT_TYPES } from './utils/constants.js';

/**
 * Application state.
 */
const state = {
  graph: null,
  renderer: null,
  currentLayout: LAYOUT_TYPES.FORCE,
  selectedNode: null,
  orphans: [],
  focusMode: false,
  focusNodeId: null,
  focusGraph: null,
};

/**
 * Initialize the application on DOMContentLoaded.
 */
function init() {
  // Initialize toolbar
  initToolbar({
    onOpenFolder: handleOpenFolder,
    onLayoutChange: handleLayoutChange,
    onZoomIn: () => state.renderer?.zoomIn(),
    onZoomOut: () => state.renderer?.zoomOut(),
    onZoomReset: () => state.renderer?.zoomReset(),
    onExportSvg: handleExportSvg,
    onExportPng: handleExportPng,
  });

  // Initialize search panel (no graph data yet)
  initSearchPanel({
    onSearch: handleSearch,
    onFilter: handleFilterChange,
    onOrphanToggle: handleOrphanToggle,
    graphData: null,
  });

  // Initialize detail panel
  initDetailPanel({
    onNodeNavigate: handleSearch,
    onClose: handleDetailClose,
    onAnalyzeImpact: handleAnalyzeImpact,
  });
}

/**
 * Show the semantic model prompt overlay with a path hint.
 * Returns a promise that resolves when the user clicks Select or Skip.
 * @param {string|null} pathHint - The relative path from definition.pbir
 * @returns {Promise<'select'|'skip'>}
 */
function showSemanticModelPrompt(pathHint) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('semantic-model-prompt');
    const hintEl = document.getElementById('semantic-model-path-hint');
    const btnSelect = document.getElementById('btn-select-model');
    const btnSkip = document.getElementById('btn-skip-model');

    if (hintEl) {
      hintEl.textContent = pathHint || '(path not found in definition.pbir)';
    }
    if (overlay) overlay.classList.remove('hidden');

    function cleanup() {
      if (btnSelect) btnSelect.removeEventListener('click', onSelect);
      if (btnSkip) btnSkip.removeEventListener('click', onSkip);
      if (overlay) overlay.classList.add('hidden');
    }

    function onSelect() {
      cleanup();
      resolve('select');
    }

    function onSkip() {
      cleanup();
      resolve('skip');
    }

    if (btnSelect) btnSelect.addEventListener('click', onSelect);
    if (btnSkip) btnSkip.addEventListener('click', onSkip);
  });
}

/**
 * Handle Open Report Folder button click.
 */
async function handleOpenFolder() {
  try {
    showLoading('Select your .Report folder...');

    // Step 1: Open report folder
    const reportResult = await openReportFolder();

    // Step 2: If definition.pbir found a semantic model path, prompt user
    let modelStructure = null;
    if (reportResult.semanticModelPath) {
      hideLoading();
      const choice = await showSemanticModelPrompt(reportResult.semanticModelPath);

      if (choice === 'select') {
        try {
          showLoading('Select semantic model folder...');
          const modelResult = await openSemanticModelFolder();
          modelStructure = modelResult.modelStructure;
        } catch (err) {
          if (err.name === 'AbortError') {
            // User cancelled - proceed without model
          } else {
            throw err;
          }
        }
      }
    }

    showLoading('Parsing model...');

    // Step 3: Parse TMDL model (if semantic model was loaded)
    const tmdlFiles = modelStructure?.tmdlFiles || [];
    const relationshipFiles = modelStructure?.relationshipFiles || [];
    const model = parseTmdlModel(tmdlFiles, relationshipFiles);

    // Step 4: Parse DAX in each measure to get dependency info
    for (const table of model.tables) {
      for (const measure of (table.measures || [])) {
        if (measure.expression) {
          measure.daxDeps = parseDaxExpression(measure.expression);
        }
      }
      // Also parse calculated column expressions
      for (const col of (table.calculatedColumns || [])) {
        if (col.expression) {
          col.daxDeps = parseDaxExpression(col.expression);
        }
      }
    }

    showLoading('Parsing report...');

    // Step 5: Parse PBIR report
    const report = parsePbirReport(
      reportResult.reportStructure.visualFiles,
      reportResult.reportStructure.pageFiles
    );

    // Step 6: Detect enrichments
    const enrichments = detectEnrichments(model.tables);

    showLoading('Building graph...');

    // Step 7: Build graph
    let graph = buildGraph(model, report, enrichments);

    // Step 8: Apply enrichments to graph nodes
    graph = applyEnrichments(graph, enrichments);

    // Step 9: Find orphans
    const orphans = findOrphans(graph);
    state.orphans = orphans;
    state.graph = graph;

    showLoading('Rendering...');

    // Step 10: Initialize renderer
    const graphContainer = document.getElementById('graph-container');
    if (state.renderer) {
      state.renderer.destroy();
    }
    state.renderer = initRenderer(graphContainer, graph, {
      layout: state.currentLayout,
      onNodeClick: handleNodeClick,
    });

    // Step 11: Update search panel filters
    updateFilters(graph);

    // Step 12: Update toolbar stats
    const rawStats = computeStats(graph);
    updateStats({
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      byType: {
        table: rawStats.tables,
        measure: rawStats.measures,
        visual: rawStats.visuals,
        column: rawStats.columns,
        page: rawStats.pages,
        source: rawStats.sources
      },
      orphanCount: orphans.length
    });

    // Step 13: Hide welcome overlay
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.classList.add('hidden');

    hideLoading();
  } catch (err) {
    hideLoading();
    if (err.name === 'AbortError') {
      // User cancelled the directory picker
      return;
    }
    console.error('Error loading project:', err);
    showError(`Failed to load project: ${err.message}`);
  }
}

/**
 * Handle clicking a node in the graph.
 */
function handleNodeClick(node) {
  if (!node || !state.graph) return;

  state.selectedNode = node;

  // Analyze impact against the full graph
  const impact = analyzeImpact(node.id, state.graph);

  // Show detail panel
  showNodeDetail(node, impact, state.graph, { focusMode: state.focusMode });

  // In focus mode, everything is already visible; otherwise highlight
  if (!state.focusMode && state.renderer) {
    const allConnected = [node.id, ...impact.upstream, ...impact.downstream];
    state.renderer.highlightNodes(allConnected);
  }
}

/**
 * Handle search result selection - center graph on node.
 */
function handleSearch(nodeId) {
  if (!state.graph) return;

  const node = state.graph.nodes.get(nodeId);
  if (!node) return;

  handleNodeClick(node);
}

/**
 * Handle filter changes from search panel.
 */
function handleFilterChange(filters) {
  if (!state.renderer || !state.graph) return;

  if (filters.type || filters.table) {
    const matching = [];
    for (const node of state.graph.nodes.values()) {
      if (filters.type && node.type !== filters.type) continue;
      if (filters.table) {
        const tableName = node.metadata?.table || (node.type === 'table' ? node.name : '');
        if (tableName !== filters.table) continue;
      }
      matching.push(node.id);
    }
    state.renderer.highlightNodes(matching);
  } else {
    state.renderer.resetHighlight();
  }
}

/**
 * Handle orphan toggle.
 */
function handleOrphanToggle(showOrphansOnly) {
  if (!state.renderer || !state.graph) return;

  if (showOrphansOnly && state.orphans.length > 0) {
    state.renderer.highlightNodes(state.orphans);
  } else {
    state.renderer.resetHighlight();
  }
}

/**
 * Handle layout change.
 */
function handleLayoutChange(layout) {
  state.currentLayout = layout;
  setActiveLayout(layout);
  if (state.renderer) {
    state.renderer.setLayout(layout);
  }
}

/**
 * Handle detail panel close.
 */
function handleDetailClose() {
  state.selectedNode = null;
  if (state.focusMode) {
    exitFocusMode();
  } else if (state.renderer) {
    state.renderer.resetHighlight();
  }
}

/**
 * Handle Focus Lineage button in detail panel - enter focus mode.
 */
function handleAnalyzeImpact(nodeId, impact) {
  if (!state.renderer || !state.graph) return;

  // Extract subgraph with only upstream + downstream nodes
  const subgraph = extractSubgraph(nodeId, state.graph);
  state.focusMode = true;
  state.focusNodeId = nodeId;
  state.focusGraph = subgraph;

  // Switch renderer to subgraph with tree layout
  state.renderer.update(subgraph);
  state.renderer.setLayout(LAYOUT_TYPES.TREE);

  // Zoom to fit after layout settles
  setTimeout(() => {
    state.renderer.zoomToFit();
  }, 150);

  // Show back button
  showFocusModeUI();

  // Refresh detail panel in focus mode
  const node = state.graph.nodes.get(nodeId);
  if (node) {
    const fullImpact = impact || analyzeImpact(nodeId, state.graph);
    showNodeDetail(node, fullImpact, state.graph, { focusMode: true });
  }
}

/**
 * Exit focus mode and restore the full graph.
 */
function exitFocusMode() {
  if (!state.focusMode) return;

  state.focusMode = false;
  state.focusNodeId = null;
  state.focusGraph = null;

  // Restore full graph and original layout
  state.renderer.update(state.graph);
  state.renderer.setLayout(state.currentLayout);
  state.renderer.resetHighlight();

  hideFocusModeUI();
  hideDetailPanel();
}

/**
 * Show the focus mode back button in the toolbar.
 */
function showFocusModeUI() {
  let backBtn = document.getElementById('btn-exit-focus');
  if (!backBtn) {
    backBtn = document.createElement('button');
    backBtn.id = 'btn-exit-focus';
    backBtn.className = 'btn-focus-back';
    backBtn.textContent = '\u2190 Back to Full Graph';
    backBtn.addEventListener('click', exitFocusMode);
    const toolbar = document.querySelector('.toolbar-left');
    if (toolbar) toolbar.appendChild(backBtn);
  }
  backBtn.style.display = 'inline-block';
}

/**
 * Hide the focus mode back button.
 */
function hideFocusModeUI() {
  const backBtn = document.getElementById('btn-exit-focus');
  if (backBtn) backBtn.style.display = 'none';
}

/**
 * Export graph as SVG.
 */
function handleExportSvg() {
  const container = document.getElementById('graph-container');
  const svgElement = container?.querySelector('svg');
  if (!svgElement) return;

  const svgData = exportSvg(svgElement);
  if (svgData) {
    downloadFile(svgData, 'lineage-graph.svg', 'image/svg+xml');
  }
}

/**
 * Export graph as PNG.
 */
async function handleExportPng() {
  const container = document.getElementById('graph-container');
  const svgElement = container?.querySelector('svg');
  if (!svgElement) return;

  try {
    const pngDataUrl = await exportPng(svgElement);
    if (pngDataUrl) {
      // Convert data URL to blob for download
      const response = await fetch(pngDataUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lineage-graph.png';
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('PNG export failed:', err);
    showError('Failed to export PNG');
  }
}

/**
 * Download a file with given content.
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Show an error message to the user.
 */
function showError(message) {
  // Use the stats area to show errors briefly
  const statsEl = document.getElementById('stats');
  if (statsEl) {
    const prev = statsEl.textContent;
    statsEl.textContent = message;
    statsEl.style.color = '#ff5252';
    setTimeout(() => {
      statsEl.textContent = prev;
      statsEl.style.color = '';
    }, 5000);
  }
}

// Start on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
