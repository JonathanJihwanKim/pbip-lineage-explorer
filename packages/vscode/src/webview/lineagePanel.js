/**
 * Lineage Webview Panel - Renders lineage trace results in a webview panel.
 */

const vscode = require('vscode');

const TYPE_COLORS = {
  visual: '#4caf50',
  measure: '#ff9800',
  column: '#9c27b0',
  table: '#4285f4',
  source: '#757575',
  expression: '#795548',
  page: '#00bcd4',
};

let currentPanel = null;

/**
 * Show lineage for a measure in a webview panel.
 */
function showLineagePanel(context, measureId, graph, lineage) {
  const node = graph.nodes.get(measureId);
  if (!node) return;

  const column = vscode.ViewColumn.Beside;

  if (currentPanel) {
    currentPanel.reveal(column);
  } else {
    currentPanel = vscode.window.createWebviewPanel(
      'pbipLineage',
      'PBIP Lineage',
      column,
      { enableScripts: false, retainContextWhenHidden: true }
    );
    currentPanel.onDidDispose(() => { currentPanel = null; });
  }

  currentPanel.title = `Lineage: ${node.name}`;
  currentPanel.webview.html = buildLineageHtml(node, graph, lineage);
}

function buildLineageHtml(node, graph, lineage) {
  const sections = [];

  // Header
  sections.push(`
    <div class="header">
      <h1>${esc(node.name)}</h1>
      <span class="badge" style="background: ${TYPE_COLORS.measure}">${esc(node.metadata?.table || 'Measure')}</span>
    </div>
  `);

  // DAX Expression
  if (node.metadata?.expression) {
    sections.push(`
      <div class="section">
        <h2>DAX Expression</h2>
        <pre class="dax">${esc(node.metadata.expression)}</pre>
      </div>
    `);
  }

  // Consuming visuals (lineage.visuals is an array of {id, name, page, visualType, ...})
  if (lineage.visuals && lineage.visuals.length > 0) {
    sections.push(`
      <div class="section">
        <h2>Consuming Visuals (${lineage.visuals.length})</h2>
        ${lineage.visuals.map(v => `
          <div class="dep-item">
            <span class="dot" style="background: ${TYPE_COLORS.visual}"></span>
            <strong>${esc(v.name || v.id)}</strong>
            ${v.page ? `<span class="meta">${esc(v.page)}</span>` : ''}
            ${v.visualType ? `<span class="meta type">${esc(v.visualType)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `);
  }

  // Measure chain (lineage.measureChain is a tree: { name, table, expression, children: [], columns: [] })
  if (lineage.measureChain) {
    const chain = lineage.measureChain;

    // Sub-measure dependencies (recursive tree)
    if (chain.children && chain.children.length > 0) {
      sections.push(`
        <div class="section">
          <h2>Measure Dependencies</h2>
          ${renderMeasureTree(chain.children, 0)}
        </div>
      `);
    }

    // Direct column dependencies from root measure
    if (chain.columns && chain.columns.length > 0) {
      sections.push(`
        <div class="section">
          <h2>Column Dependencies</h2>
          ${chain.columns.map(col => `
            <div class="dep-item">
              <span class="dot" style="background: ${TYPE_COLORS.column}"></span>
              <strong>${esc(col.name)}</strong>
              <span class="meta">${esc(col.table || '')}</span>
              ${col.sourceColumn ? `<span class="meta source">source: ${esc(col.sourceColumn)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      `);
    }
  }

  // Source table (lineage.sourceTable is an array of { column, table, sourceColumn, renameChain, dataSource })
  if (lineage.sourceTable && lineage.sourceTable.length > 0) {
    sections.push(`
      <div class="section">
        <h2>Source Column Mapping (${lineage.sourceTable.length})</h2>
        <table class="source-table">
          <thead><tr><th>PBI Column</th><th>Table</th><th>Source Column</th><th>Data Source</th></tr></thead>
          <tbody>
          ${lineage.sourceTable.map(row => `
            <tr>
              <td>${esc(row.column || '')}</td>
              <td>${esc(row.table || '')}</td>
              <td>${esc(row.sourceColumn || row.column || '')}</td>
              <td>${esc(row.dataSource || '')}</td>
            </tr>
          `).join('')}
          </tbody>
        </table>
      </div>
    `);
  }

  // Sponsor footer
  sections.push(`
    <div class="sponsor">
      <a href="https://github.com/sponsors/JonathanJihwanKim">Sponsor PBIP Lineage Explorer</a>
      &mdash; free &amp; open source, built by Jihwan Kim (Microsoft MVP)
    </div>
  `);

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px;
    line-height: 1.6;
  }
  .header { margin-bottom: 20px; }
  .header h1 { margin: 0 0 8px 0; font-size: 1.4em; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    color: white; font-size: 0.8em; font-weight: 600;
  }
  .section { margin-bottom: 20px; }
  .section h2 {
    font-size: 1.1em; margin: 0 0 8px 0; padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .dep-item {
    padding: 4px 0; display: flex; align-items: center;
    flex-wrap: wrap; gap: 8px;
  }
  .dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .meta {
    font-size: 0.85em; color: var(--vscode-descriptionForeground);
  }
  .meta.source { font-style: italic; }
  .meta.type { opacity: 0.7; }
  pre.dax {
    background: var(--vscode-textBlockQuote-background);
    padding: 12px; border-radius: 4px; overflow-x: auto;
    font-size: 0.9em; white-space: pre-wrap; word-wrap: break-word;
  }
  pre.dax-small {
    background: var(--vscode-textBlockQuote-background);
    padding: 6px 10px; border-radius: 4px; overflow-x: auto;
    font-size: 0.8em; margin: 4px 0 0 0;
    white-space: pre-wrap; word-wrap: break-word;
  }
  .tree-indent { padding-left: 20px; border-left: 2px solid var(--vscode-widget-border); margin-left: 4px; }
  .source-table {
    width: 100%; border-collapse: collapse; font-size: 0.9em;
  }
  .source-table th, .source-table td {
    text-align: left; padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .source-table th {
    font-weight: 600; color: var(--vscode-descriptionForeground);
  }
  .sponsor {
    margin-top: 32px; padding-top: 16px;
    border-top: 1px solid var(--vscode-widget-border);
    font-size: 0.85em; color: var(--vscode-descriptionForeground);
  }
  .sponsor a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  .sponsor a:hover { text-decoration: underline; }
</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>`;
}

/**
 * Recursively render the measure dependency tree.
 */
function renderMeasureTree(children, depth) {
  if (!children || children.length === 0) return '';

  return children.map(dep => `
    <div class="${depth > 0 ? 'tree-indent' : ''}">
      <div class="dep-item">
        <span class="dot" style="background: ${depth === 0 ? TYPE_COLORS.measure : '#ffb74d'}"></span>
        <strong>${esc(dep.name)}</strong>
        <span class="meta">${esc(dep.table || '')}</span>
      </div>
      ${dep.expression && dep.expression !== '(circular reference)' ? `<pre class="dax-small">${esc(dep.expression)}</pre>` : ''}
      ${dep.expression === '(circular reference)' ? '<span class="meta" style="color: #ff5252;">circular reference</span>' : ''}
      ${dep.columns && dep.columns.length > 0 ? dep.columns.map(col => `
        <div class="dep-item" style="padding-left: 20px;">
          <span class="dot" style="background: ${TYPE_COLORS.column}"></span>
          ${esc(col.name)} <span class="meta">${esc(col.table || '')}</span>
        </div>
      `).join('') : ''}
      ${renderMeasureTree(dep.children, depth + 1)}
    </div>
  `).join('');
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { showLineagePanel };
