/**
 * PBIP Lineage Explorer - VS Code Extension
 * Trace DAX measure lineage from visuals to source columns in Power BI PBIP projects.
 */

const vscode = require('vscode');
const { analyze, computeStats, traceMeasureLineage, findOrphans } = require('@pbip-lineage/core');
const { loadProjectFromWorkspace } = require('./vscodeReader');
const { MeasureTreeProvider } = require('./providers/measureTreeProvider');
const { OrphanTreeProvider } = require('./providers/orphanTreeProvider');
const { StatsTreeProvider } = require('./providers/statsTreeProvider');
const { TmdlCodeLensProvider } = require('./providers/codelensProvider');
const { showLineagePanel } = require('./webview/lineagePanel');

let graph = null;
let enrichments = null;
let orphanIds = new Set();
let statusBarItem = null;

// Tree view providers
const measureTree = new MeasureTreeProvider();
const orphanTree = new OrphanTreeProvider();
const statsTree = new StatsTreeProvider();
const codeLensProvider = new TmdlCodeLensProvider();

function activate(context) {
  console.log('PBIP Lineage Explorer activated');

  // Register tree views
  vscode.window.registerTreeDataProvider('pbipLineage.measures', measureTree);
  vscode.window.registerTreeDataProvider('pbipLineage.orphans', orphanTree);
  vscode.window.registerTreeDataProvider('pbipLineage.stats', statsTree);

  // Register CodeLens
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { pattern: '**/*.tmdl' },
      codeLensProvider
    )
  );

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = 'pbipLineage.showModelHealth';
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('pbipLineage.traceMeasure', handleTraceMeasure),
    vscode.commands.registerCommand('pbipLineage.findOrphans', handleFindOrphans),
    vscode.commands.registerCommand('pbipLineage.showModelHealth', handleShowModelHealth),
    vscode.commands.registerCommand('pbipLineage.refresh', handleRefresh),
  );

  // Watch for .tmdl file changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.tmdl');
  watcher.onDidChange(() => loadProject());
  watcher.onDidCreate(() => loadProject());
  watcher.onDidDelete(() => loadProject());
  context.subscriptions.push(watcher);

  // Initial load
  loadProject();
}

async function loadProject() {
  try {
    const project = await loadProjectFromWorkspace();

    if (!project.modelStructure && !project.reportStructure) {
      statusBarItem.hide();
      return;
    }

    const result = analyze({
      modelStructure: project.modelStructure,
      reportStructure: project.reportStructure,
    });

    graph = result.graph;
    enrichments = result.enrichments;

    // Find orphans (returns array of node IDs)
    orphanIds = new Set(findOrphans(graph));

    // Update all providers
    measureTree.setGraph(graph, orphanIds);
    orphanTree.setGraph(graph, orphanIds);
    statsTree.setData(result.stats, enrichments, orphanIds.size);
    codeLensProvider.setGraph(graph, orphanIds);

    // Update status bar
    const stats = result.stats;
    statusBarItem.text = `$(graph-line) ${stats.measures} measures`;
    if (orphanIds.size > 0) {
      statusBarItem.text += ` (${orphanIds.size} orphans)`;
    }
    statusBarItem.tooltip = `PBIP: ${stats.tables} tables, ${stats.measures} measures, ${stats.visuals} visuals`;
    statusBarItem.show();
  } catch (err) {
    console.error('PBIP Lineage Explorer: Failed to load project', err);
    statusBarItem.text = '$(graph-line) PBIP: Error';
    statusBarItem.tooltip = `Error: ${err.message}`;
    statusBarItem.show();
  }
}

async function handleTraceMeasure(measureId) {
  if (!graph) {
    vscode.window.showWarningMessage('No PBIP project loaded. Open a folder with .tmdl files.');
    return;
  }

  // If no measureId provided, show a quick pick
  if (!measureId) {
    const measures = [];
    for (const [id, node] of graph.nodes) {
      if (node.type === 'measure') {
        const tableName = node.metadata?.table || '';
        measures.push({
          label: node.name,
          description: tableName,
          detail: orphanIds.has(id) ? '$(warning) orphan' : '',
          id,
        });
      }
    }
    measures.sort((a, b) => a.label.localeCompare(b.label));

    const picked = await vscode.window.showQuickPick(measures, {
      placeHolder: 'Select a measure to trace lineage',
      matchOnDescription: true,
    });
    if (!picked) return;
    measureId = picked.id;
  }

  try {
    const lineage = traceMeasureLineage(measureId, graph);
    if (!lineage) {
      vscode.window.showWarningMessage(`Could not trace lineage for this measure.`);
      return;
    }
    showLineagePanel(null, measureId, graph, lineage);
  } catch (err) {
    vscode.window.showErrorMessage(`Lineage trace failed: ${err.message}`);
  }
}

function handleFindOrphans() {
  if (!graph) {
    vscode.window.showWarningMessage('No PBIP project loaded.');
    return;
  }

  if (orphanIds.size === 0) {
    vscode.window.showInformationMessage('No orphan measures found. All measures are referenced by at least one visual.');
  } else {
    vscode.window.showInformationMessage(`Found ${orphanIds.size} orphan measure(s). Check the "Orphan Measures" panel.`);
    // Focus the orphan tree view
    vscode.commands.executeCommand('pbipLineage.orphans.focus');
  }
}

function handleShowModelHealth() {
  if (!graph) {
    vscode.window.showWarningMessage('No PBIP project loaded.');
    return;
  }
  vscode.commands.executeCommand('pbipLineage.stats.focus');
}

async function handleRefresh() {
  await loadProject();
  vscode.window.showInformationMessage('PBIP Lineage refreshed.');
}

function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
}

module.exports = { activate, deactivate };
