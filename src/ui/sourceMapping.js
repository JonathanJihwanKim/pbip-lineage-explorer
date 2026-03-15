/**
 * Source Column Mapping - Dedicated view for data engineers.
 * Shows a flat, searchable, sortable table mapping:
 * DAX Measure -> PBI Table -> PBI Column -> Source Column -> Source Table -> Data Source Type
 */

let _graph = null;
let _rows = [];
let _sortCol = null;
let _sortDir = 'asc';

/**
 * Build the full source mapping from the graph.
 * Iterates all column nodes and finds which measures reference them.
 */
export function populateSourceMapping(graph) {
  _graph = graph;
  _rows = [];

  const columnNodes = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'column') columnNodes.push(node);
  }

  for (const col of columnNodes) {
    const tableId = `table::${col.metadata?.table || ''}`;
    const tableNode = graph.nodes.get(tableId);
    const ds = tableNode?.metadata?.dataSource;

    // Find measures that reference this column (downstream = nodes that depend on this column)
    const downstreamIds = graph.adjacency.downstream.get(col.id) || [];
    const referencingMeasures = [];
    for (const dId of downstreamIds) {
      const dNode = graph.nodes.get(dId);
      if (dNode?.type === 'measure') referencingMeasures.push(dNode.name);
    }

    const measureNames = referencingMeasures.length > 0
      ? referencingMeasures.join(', ')
      : '(none)';

    // Determine source info
    const sourceColumn = col.metadata?.originalSourceColumn || col.metadata?.sourceColumn || col.name;
    const sourceTable = col.metadata?.sourceTablePath || ds?.sourceTable || '';
    const sourceType = ds?.sourceType || '';
    const wasRenamed = col.metadata?.wasRenamed || false;

    _rows.push({
      daxMeasure: measureNames,
      pbiTable: col.metadata?.table || '',
      pbiColumn: col.name,
      sourceColumn,
      sourceTable,
      sourceType,
      wasRenamed,
    });
  }

  // Sort by table then column
  _rows.sort((a, b) => {
    const cmp = a.pbiTable.localeCompare(b.pbiTable);
    return cmp !== 0 ? cmp : a.pbiColumn.localeCompare(b.pbiColumn);
  });
}

/**
 * Render the source mapping into the container.
 */
export function renderSourceMapping(container) {
  if (!container) return;

  let html = '';

  // Header
  html += '<div class="source-map-header">';
  html += '<h2>Source Column Mapping</h2>';
  html += '<div class="source-map-actions">';
  html += '<button class="btn-export" id="btn-copy-source-map" title="Copy as text">Copy</button>';
  html += '<button class="btn-export" id="btn-export-csv" title="Export as CSV">Export CSV</button>';
  html += '</div>';
  html += '</div>';

  // Search
  html += '<input type="text" class="source-map-search" id="source-map-search" placeholder="Search across all columns..." autocomplete="off" />';
  html += `<div class="source-map-count" id="source-map-count">${_rows.length} columns</div>`;

  // Table
  html += renderTable(_rows);

  html += `<div class="sponsor-footer">Built with <span class="sponsor-heart">\u2665</span> by Jihwan Kim \u00b7 <a href="https://github.com/sponsors/JonathanJihwanKim" target="_blank" rel="noopener">Sponsor</a></div>`;

  container.innerHTML = html;

  // Bind events
  const search = container.querySelector('#source-map-search');
  if (search) {
    let debounce = null;
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => filterAndRender(container, search.value), 200);
    });
  }

  bindTableEvents(container);
  bindExportEvents(container);
}

function renderTable(rows) {
  const headers = [
    { key: 'daxMeasure', label: 'DAX Measure' },
    { key: 'pbiTable', label: 'PBI Table' },
    { key: 'pbiColumn', label: 'PBI Column' },
    { key: 'sourceColumn', label: 'Source Column' },
    { key: 'sourceTable', label: 'Source Table' },
    { key: 'sourceType', label: 'Source Type' },
  ];

  let html = '<div class="trace-table-wrapper"><table class="trace-table" id="source-map-table">';
  html += '<thead><tr>';
  for (const h of headers) {
    const cls = _sortCol === h.key ? (_sortDir === 'asc' ? 'asc' : 'desc') : '';
    html += `<th class="sortable-header ${cls}" data-sort="${h.key}">${h.label}</th>`;
  }
  html += '</tr></thead>';
  html += '<tbody>';

  if (rows.length === 0) {
    html += '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No columns found</td></tr>';
  }

  for (const row of rows) {
    const rowClass = row.wasRenamed ? ' class="renamed-row"' : '';
    html += `<tr${rowClass}>`;
    html += `<td>${esc(row.daxMeasure)}</td>`;
    html += `<td>${esc(row.pbiTable)}</td>`;
    html += `<td>${esc(row.pbiColumn)}</td>`;
    html += `<td${row.wasRenamed ? ' class="renamed-cell"' : ''}>${esc(row.sourceColumn)}</td>`;
    html += `<td>${esc(row.sourceTable)}</td>`;
    html += `<td>${esc(row.sourceType)}</td>`;
    html += `</tr>`;
  }

  html += '</tbody></table></div>';
  return html;
}

function filterAndRender(container, query) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? _rows.filter(r =>
        r.daxMeasure.toLowerCase().includes(q) ||
        r.pbiTable.toLowerCase().includes(q) ||
        r.pbiColumn.toLowerCase().includes(q) ||
        r.sourceColumn.toLowerCase().includes(q) ||
        r.sourceTable.toLowerCase().includes(q) ||
        r.sourceType.toLowerCase().includes(q)
      )
    : _rows;

  const tableWrapper = container.querySelector('.trace-table-wrapper');
  if (tableWrapper) {
    tableWrapper.outerHTML = renderTable(filtered);
    bindTableEvents(container);
  }

  const count = container.querySelector('#source-map-count');
  if (count) count.textContent = `${filtered.length} of ${_rows.length} columns`;
}

function bindTableEvents(container) {
  container.querySelectorAll('.sortable-header').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (_sortCol === key) {
        _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _sortCol = key;
        _sortDir = 'asc';
      }
      _rows.sort((a, b) => {
        const av = a[key] || '';
        const bv = b[key] || '';
        return _sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });

      const search = container.querySelector('#source-map-search');
      filterAndRender(container, search?.value || '');
    });
  });
}

function bindExportEvents(container) {
  const btnCopy = container.querySelector('#btn-copy-source-map');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const text = copySourceMappingText();
      navigator.clipboard.writeText(text).then(() => {
        btnCopy.textContent = 'Copied!';
        setTimeout(() => { btnCopy.textContent = 'Copy'; }, 1500);
      }).catch(() => {});
    });
  }

  const btnCsv = container.querySelector('#btn-export-csv');
  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      exportSourceMappingCSV();
    });
  }
}

/**
 * Export source mapping as CSV.
 */
export function exportSourceMappingCSV() {
  const headers = ['DAX Measure', 'PBI Table', 'PBI Column', 'Source Column', 'Source Table', 'Source Type'];
  const csvRows = [headers.join(',')];
  for (const row of _rows) {
    csvRows.push([
      csvEscape(row.daxMeasure),
      csvEscape(row.pbiTable),
      csvEscape(row.pbiColumn),
      csvEscape(row.sourceColumn),
      csvEscape(row.sourceTable),
      csvEscape(row.sourceType),
    ].join(','));
  }
  csvRows.push('');
  csvRows.push('"Generated by PBIP Lineage Explorer — free & open source | https://github.com/JonathanJihwanKim/pbip-lineage-explorer"');
  csvRows.push('"Sponsor: https://github.com/sponsors/JonathanJihwanKim"');

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'source-column-mapping.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy source mapping as text.
 */
export function copySourceMappingText() {
  const lines = ['Source Column Mapping', '='.repeat(40), ''];
  for (const row of _rows) {
    lines.push(`${row.pbiTable}[${row.pbiColumn}] -> ${row.sourceColumn} (${row.sourceTable || 'unknown source'})`);
    if (row.daxMeasure && row.daxMeasure !== '(none)') {
      lines.push(`  Used by: ${row.daxMeasure}`);
    }
  }
  lines.push('');
  lines.push('Generated by PBIP Lineage Explorer — free & open source');
  lines.push('https://github.com/JonathanJihwanKim/pbip-lineage-explorer');
  lines.push('Sponsor: https://github.com/sponsors/JonathanJihwanKim');
  return lines.join('\n');
}

function csvEscape(str) {
  if (!str) return '';
  const s = String(str);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
