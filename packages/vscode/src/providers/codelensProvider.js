/**
 * CodeLens Provider - Shows dependency info above measure definitions in .tmdl files.
 */

const vscode = require('vscode');

class TmdlCodeLensProvider {
  constructor() {
    this._graph = null;
    this._orphanIds = new Set();
    this._onDidChangeCodeLenses = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  }

  setGraph(graph, orphanIds = new Set()) {
    this._graph = graph;
    this._orphanIds = orphanIds;
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document) {
    if (!this._graph) return [];

    const lenses = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Find measure definitions: lines starting with "measure " (with optional indent)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\s*measure\s+(?:'([^']+)'|(\S+))\s*=/);
      if (!match) continue;

      const measureName = match[1] || match[2];
      // Find the table name from the file (look for "table " definition above)
      const tableName = this._findTableName(lines, i);
      const measureId = tableName ? `measure::${tableName}::${measureName}` : null;

      if (!measureId) continue;

      const node = this._graph.nodes.get(measureId);
      if (!node) continue;

      const range = new vscode.Range(i, 0, i, line.length);

      // Count dependencies and consumers
      const deps = this._countDeps(measureId);
      const consumers = this._countConsumers(measureId);
      const isOrphan = this._orphanIds.has(measureId);

      let title = `$(graph) ${deps} deps | ${consumers} consumers`;
      if (isOrphan) {
        title += ' | $(warning) orphan';
      }

      lenses.push(new vscode.CodeLens(range, {
        title,
        command: 'pbipLineage.traceMeasure',
        arguments: [measureId],
        tooltip: `Click to trace lineage for ${measureName}`,
      }));
    }

    return lenses;
  }

  _findTableName(lines, measureLineIdx) {
    // Walk backwards from the measure line to find the table definition
    for (let i = measureLineIdx - 1; i >= 0; i--) {
      const match = lines[i].match(/^\s*table\s+(?:'([^']+)'|(\S+))/);
      if (match) return match[1] || match[2];
    }
    return null;
  }

  _countDeps(nodeId) {
    let count = 0;
    for (const edge of this._graph.edges) {
      if (edge.source === nodeId) count++;
    }
    return count;
  }

  _countConsumers(nodeId) {
    let count = 0;
    for (const edge of this._graph.edges) {
      if (edge.target === nodeId) count++;
    }
    return count;
  }
}

module.exports = { TmdlCodeLensProvider };
