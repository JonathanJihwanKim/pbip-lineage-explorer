/**
 * Measure Tree View Provider - Shows all measures grouped by table in the sidebar.
 */

const vscode = require('vscode');

class MeasureTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._graph = null;
    this._orphanIds = new Set();
  }

  setGraph(graph, orphanIds = new Set()) {
    this._graph = graph;
    this._orphanIds = orphanIds;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!this._graph) return [];

    // Root level: show tables that have measures
    if (!element) {
      return this._getTableItems();
    }

    // Table level: show measures in that table
    if (element.contextValue === 'table') {
      return this._getMeasureItems(element.tableId);
    }

    return [];
  }

  _getTableItems() {
    const tableMap = new Map(); // tableName -> { tableId, measures: [] }

    for (const [id, node] of this._graph.nodes) {
      if (node.type === 'measure') {
        const tableName = node.metadata?.table || 'Unknown';
        if (!tableMap.has(tableName)) {
          tableMap.set(tableName, { tableId: tableName, measures: [] });
        }
        tableMap.get(tableName).measures.push(node);
      }
    }

    // Sort tables alphabetically
    const sorted = [...tableMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    return sorted.map(([tableName, { measures }]) => {
      const orphanCount = measures.filter(m => this._orphanIds.has(m.id)).length;
      const label = orphanCount > 0
        ? `${tableName} (${measures.length} measures, ${orphanCount} orphans)`
        : `${tableName} (${measures.length} measures)`;

      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'table';
      item.tableId = tableName;
      item.iconPath = new vscode.ThemeIcon('table');
      return item;
    });
  }

  _getMeasureItems(tableName) {
    const measures = [];

    for (const [id, node] of this._graph.nodes) {
      if (node.type === 'measure' && (node.metadata?.table || 'Unknown') === tableName) {
        measures.push(node);
      }
    }

    measures.sort((a, b) => a.name.localeCompare(b.name));

    return measures.map(node => {
      const isOrphan = this._orphanIds.has(node.id);
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'measure';
      item.measureId = node.id;

      if (isOrphan) {
        item.description = 'orphan';
        item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
      } else {
        item.iconPath = new vscode.ThemeIcon('symbol-method');
      }

      // Show DAX expression as tooltip
      if (node.metadata?.expression) {
        item.tooltip = new vscode.MarkdownString(`**${node.name}**\n\`\`\`dax\n${node.metadata.expression}\n\`\`\``);
      }

      item.command = {
        command: 'pbipLineage.traceMeasure',
        title: 'Trace Lineage',
        arguments: [node.id],
      };

      return item;
    });
  }
}

module.exports = { MeasureTreeProvider };
