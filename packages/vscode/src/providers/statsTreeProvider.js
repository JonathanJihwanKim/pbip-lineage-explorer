/**
 * Stats Tree View Provider - Shows model health statistics.
 */

const vscode = require('vscode');

class StatsTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._stats = null;
    this._enrichments = null;
    this._orphanCount = 0;
  }

  setData(stats, enrichments, orphanCount) {
    this._stats = stats;
    this._enrichments = enrichments;
    this._orphanCount = orphanCount;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!this._stats || element) return [];

    const items = [];

    const addStat = (label, value, icon) => {
      const item = new vscode.TreeItem(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(icon);
      items.push(item);
    };

    addStat('Tables', this._stats.tables, 'table');
    addStat('Columns', this._stats.columns, 'symbol-field');
    addStat('Measures', this._stats.measures, 'symbol-method');
    addStat('Visuals', this._stats.visuals, 'symbol-enum');
    addStat('Pages', this._stats.pages, 'file');
    addStat('Sources', this._stats.sources, 'database');

    // Separator
    const sep = new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None);
    items.push(sep);

    // Health indicators
    if (this._orphanCount > 0) {
      const orphanItem = new vscode.TreeItem(
        `Orphan Measures: ${this._orphanCount}`,
        vscode.TreeItemCollapsibleState.None
      );
      orphanItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
      orphanItem.tooltip = 'Measures not referenced by any visual';
      items.push(orphanItem);
    } else {
      addStat('Orphan Measures', '0', 'check');
    }

    const fpCount = this._enrichments?.fieldParameters?.length || 0;
    if (fpCount > 0) addStat('Field Parameters', fpCount, 'symbol-parameter');

    const cgCount = this._enrichments?.calculationGroups?.length || 0;
    if (cgCount > 0) addStat('Calculation Groups', cgCount, 'symbol-class');

    return items;
  }
}

module.exports = { StatsTreeProvider };
