/**
 * Change Tree Provider — VS Code TreeDataProvider for displaying
 * detected changes in a tree view, grouped by commit and page.
 */

const vscode = require('vscode');

class ChangeTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._scanResults = [];     // Array of { fromCommit, toCommit, changes, summary }
    this._flatChanges = [];     // Flat list of all changes with commit info
  }

  /**
   * Update the tree with new scan results.
   * @param {Array} scanResults - From commitScanner.scanRecentChanges()
   */
  setResults(scanResults) {
    this._scanResults = scanResults || [];
    this._flatChanges = [];
    for (const result of this._scanResults) {
      for (const change of result.changes) {
        this._flatChanges.push({
          ...change,
          commitHash: result.toCommit.hash.substring(0, 7),
          commitMessage: result.toCommit.message,
          commitDate: result.toCommit.date,
        });
      }
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get the change count for a specific page (for badge display).
   * @param {string} pageName
   * @returns {number}
   */
  getPageChangeCount(pageName) {
    return this._flatChanges.filter(c =>
      (c.target?.pageName || c.target?.pageId) === pageName
    ).length;
  }

  /**
   * Get the change count for a specific measure.
   * @param {string} measureName
   * @returns {number}
   */
  getMeasureChangeCount(measureName) {
    return this._flatChanges.filter(c => c.target?.measureName === measureName).length;
  }

  /**
   * Get total number of changes.
   * @returns {number}
   */
  getTotalChangeCount() {
    return this._flatChanges.length;
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // Root level: show commits
      if (this._scanResults.length === 0) {
        return [this._createInfoItem('No changes detected in recent commits')];
      }

      return this._scanResults.map((result, index) => {
        const hash = result.toCommit.hash.substring(0, 7);
        const msg = result.toCommit.message || 'No message';
        const count = result.changes.length;

        const item = new vscode.TreeItem(
          `${hash} — ${msg}`,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.description = `${count} change${count !== 1 ? 's' : ''}`;
        item.iconPath = new vscode.ThemeIcon('git-commit');
        item.contextValue = 'commit';
        item._resultIndex = index;
        return item;
      });
    }

    // Commit level: show changes grouped by scope
    if (element._resultIndex !== undefined) {
      const result = this._scanResults[element._resultIndex];
      if (!result) return [];

      // Group changes by scope
      const groups = new Map();
      for (const change of result.changes) {
        const scope = change.scope || 'other';
        if (!groups.has(scope)) groups.set(scope, []);
        groups.get(scope).push(change);
      }

      const scopeIcons = {
        report: 'file',
        page: 'file-text',
        visual: 'symbol-misc',
        measure: 'symbol-method',
        bookmark: 'bookmark',
        column: 'symbol-field',
        relationship: 'link',
        source: 'database',
        expression: 'symbol-variable',
      };

      const scopeLabels = {
        report: 'Report',
        page: 'Page',
        visual: 'Visual',
        measure: 'Measure',
        bookmark: 'Bookmark',
        column: 'Column',
        relationship: 'Relationship',
        source: 'Source',
        expression: 'Expression',
      };

      return [...groups.entries()].map(([scope, changes]) => {
        const item = new vscode.TreeItem(
          scopeLabels[scope] || scope,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.description = `${changes.length}`;
        item.iconPath = new vscode.ThemeIcon(scopeIcons[scope] || 'circle-outline');
        item._resultIndex = element._resultIndex;
        item._scope = scope;
        return item;
      });
    }

    // Scope level: show individual changes
    if (element._scope !== undefined && element._resultIndex !== undefined) {
      const result = this._scanResults[element._resultIndex];
      if (!result) return [];

      const changes = result.changes.filter(c => c.scope === element._scope);
      return changes.map(change => this._createChangeItem(change));
    }

    // Change item with impact: show impact details
    if (element._change?.impact?.length > 0) {
      return element._change.impact.map(impact => {
        const item = new vscode.TreeItem(
          `${impact.visualName} (${impact.pageName})`,
          vscode.TreeItemCollapsibleState.None
        );
        item.description = impact.reason;
        item.iconPath = new vscode.ThemeIcon(
          impact.type === 'field_parameter' ? 'references'
            : impact.type === 'calculation_group' ? 'symbol-operator'
              : 'arrow-right'
        );
        return item;
      });
    }

    return [];
  }

  _createChangeItem(change) {
    const hasImpact = change.impact && change.impact.length > 0;

    const item = new vscode.TreeItem(
      change.description,
      hasImpact ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );

    item.iconPath = new vscode.ThemeIcon(this._getChangeIcon(change.type));
    item.tooltip = this._buildTooltip(change);
    item.contextValue = 'change';
    item._change = change;

    if (hasImpact) {
      item.description = `${change.impact.length} visual${change.impact.length !== 1 ? 's' : ''} impacted`;
    }

    return item;
  }

  _getChangeIcon(type) {
    const icons = {
      default_page_changed: 'home',
      page_added: 'add',
      page_removed: 'trash',
      filter_added: 'filter',
      filter_removed: 'close',
      filter_changed: 'filter',
      measure_changed: 'edit',
      measure_added: 'add',
      measure_removed: 'trash',
      visual_visibility_changed: 'eye',
      visual_filter_added: 'filter',
      visual_filter_removed: 'close',
      visual_filter_changed: 'filter',
      visual_bookmark_changed: 'bookmark',
      visual_added: 'add',
      visual_removed: 'trash',
      visual_field_changed: 'symbol-field',
      bookmark_changed: 'bookmark',
      calc_item_changed: 'symbol-operator',
      calc_item_added: 'add',
      calc_item_removed: 'trash',
    };
    return icons[type] || 'circle-outline';
  }

  _buildTooltip(change) {
    const parts = [change.description];

    if (change.impact && change.impact.length > 0) {
      parts.push('');
      parts.push(`Impacted visuals (${change.impact.length}):`);
      for (const impact of change.impact) {
        parts.push(`  - ${impact.visualName} on ${impact.pageName}`);
        parts.push(`    ${impact.reason}`);
      }
    }

    if (change.details?.before !== undefined && change.details?.after !== undefined) {
      parts.push('');
      if (typeof change.details.before === 'object') {
        parts.push(`Before: ${JSON.stringify(change.details.before, null, 2).substring(0, 200)}`);
        parts.push(`After: ${JSON.stringify(change.details.after, null, 2).substring(0, 200)}`);
      } else {
        parts.push(`Before: ${String(change.details.before).substring(0, 200)}`);
        parts.push(`After: ${String(change.details.after).substring(0, 200)}`);
      }
    }

    return new vscode.MarkdownString(parts.join('\n'));
  }

  _createInfoItem(message) {
    const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }
}

module.exports = { ChangeTreeProvider };
