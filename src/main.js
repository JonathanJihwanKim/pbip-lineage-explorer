/**
 * Main entry point for PBIP Lineage Explorer.
 * Orchestrates parsing, graph building, and UI initialization.
 */

// Parsers
import { openPbipProject } from './parser/pbipReader.js';
import { parseTmdlModel } from './parser/tmdlParser.js';
import { parsePbirReport } from './parser/pbirParser.js';
import { parseDaxExpression } from './parser/daxParser.js';
import { detectEnrichments, applyEnrichments } from './parser/enrichment.js';

// Graph
import { buildGraph, computeStats } from './graph/graphBuilder.js';
import { initRenderer, exportSvg, exportPng } from './graph/graphRenderer.js';
import { analyzeImpact, findOrphans } from './graph/impactAnalysis.js';

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
 * Handle Open Folder button click.
 */
async function handleOpenFolder() {
  try {
    showLoading('Opening project...');

    // 1. Open directory and get files
    const files = await openPbipProject();

    showLoading('Parsing model...');

    // 2. Parse TMDL model
    const model = parseTmdlModel(files.tmdlFiles, files.relationshipFiles);

    // 3. Parse DAX in each measure to get dependency info
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

    // 4. Parse PBIR report
    const report = parsePbirReport(files.visualFiles, files.pageFiles);

    // 5. Detect enrichments
    const enrichments = detectEnrichments(model.tables);

    showLoading('Building graph...');

    // 6. Build graph
    let graph = buildGraph(model, report, enrichments);

    // 7. Apply enrichments to graph nodes
    graph = applyEnrichments(graph, enrichments);

    // 8. Find orphans
    const orphans = findOrphans(graph);
    state.orphans = orphans;
    state.graph = graph;

    showLoading('Rendering...');

    // 9. Initialize renderer (pass the container, not the SVG itself)
    const graphContainer = document.getElementById('graph-container');
    if (state.renderer) {
      state.renderer.destroy();
    }
    state.renderer = initRenderer(graphContainer, graph, {
      layout: state.currentLayout,
      onNodeClick: handleNodeClick,
    });

    // 10. Update search panel filters
    updateFilters(graph);

    // 11. Update toolbar stats
    const rawStats = computeStats(graph);
    updateStats({
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.length,
      byType: {
        table: rawStats.tables,
        measure: rawStats.measures,
        visual: rawStats.visuals,
        column: rawStats.columns,
        page: rawStats.pages
      },
      orphanCount: orphans.length
    });

    // 12. Hide welcome overlay
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

  // Analyze impact
  const impact = analyzeImpact(node.id, state.graph);

  // Show detail panel
  showNodeDetail(node, impact, state.graph);

  // Highlight connected nodes
  if (state.renderer) {
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
  if (state.renderer) {
    state.renderer.resetHighlight();
  }
}

/**
 * Handle Analyze Impact button in detail panel.
 */
function handleAnalyzeImpact(nodeId, impact) {
  if (!state.renderer || !impact) return;
  const allConnected = [nodeId, ...impact.upstream, ...impact.downstream];
  state.renderer.highlightNodes(allConnected);
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
