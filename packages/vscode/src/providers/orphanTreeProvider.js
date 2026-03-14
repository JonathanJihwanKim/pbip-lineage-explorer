/**
 * Orphan Tree View Provider - Shows measures that no visual references.
 */

const vscode = require('vscode');

class OrphanTreeProvider {
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
    if (!this._graph || element) return [];

    const orphans = [];
    for (const id of this._orphanIds) {
      const node = this._graph.nodes.get(id);
      if (node) orphans.push(node);
    }

    orphans.sort((a, b) => a.name.localeCompare(b.name));

    if (orphans.length === 0) {
      const item = new vscode.TreeItem('No orphan measures found', vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      return [item];
    }

    return orphans.map(node => {
      const tableName = node.metadata?.table || 'Unknown';
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
      item.description = tableName;
      item.contextValue = 'orphanMeasure';
      item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));

      if (node.metadata?.expression) {
        item.tooltip = new vscode.MarkdownString(`**${node.name}** (${tableName})\n\`\`\`dax\n${node.metadata.expression}\n\`\`\`\n\n*This measure is not referenced by any visual.*`);
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

module.exports = { OrphanTreeProvider };
