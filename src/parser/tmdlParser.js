/**
 * TMDL Parser - Parses Tabular Model Definition Language files.
 * Extracts tables, columns, measures, relationships, calculated columns,
 * calculated tables, and hierarchies from .tmdl files.
 */

/**
 * Parse all TMDL files from the model directory.
 * @param {Array<{path: string, content: string}>} tmdlFiles - TMDL file entries.
 * @param {Array<{path: string, content: string}>} [relationshipFiles] - Relationship file entries.
 * @returns {{ tables: Array, relationships: Array }}
 */
export function parseTmdlModel(tmdlFiles, relationshipFiles = []) {
  const tables = [];
  const relationships = [];

  for (const { content, path } of tmdlFiles) {
    const parsed = parseTableFile(content, path);
    if (parsed && parsed.name) {
      tables.push(parsed);
    }
  }

  for (const { content } of relationshipFiles) {
    const rels = parseRelationships(content);
    relationships.push(...rels);
  }

  return { tables, relationships };
}

/**
 * Get the indentation level of a line (number of leading tabs or groups of spaces).
 * @param {string} line
 * @returns {number}
 */
function getIndentLevel(line) {
  const match = line.match(/^(\t*)/);
  if (match && match[1].length > 0) {
    return match[1].length;
  }
  // Fall back to spaces (treat 4 spaces or any consistent leading spaces as one level)
  const spaceMatch = line.match(/^( +)/);
  if (spaceMatch) {
    return Math.floor(spaceMatch[1].length / 4) || (spaceMatch[1].length > 0 ? 1 : 0);
  }
  return 0;
}

/**
 * Remove surrounding single quotes from a name if present.
 * @param {string} name
 * @returns {string}
 */
function unquoteName(name) {
  if (name && name.startsWith("'") && name.endsWith("'")) {
    return name.slice(1, -1);
  }
  return name || '';
}

/**
 * Parse a single .tmdl table file.
 * @param {string} content - The raw TMDL file content.
 * @param {string} fileName - The file path (used for context).
 * @returns {{ name: string, columns: Array, measures: Array, calculatedColumns: Array, partitions: Array }}
 */
export function parseTableFile(content, fileName) {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  const result = { name: '', columns: [], measures: [], calculatedColumns: [], partitions: [] };

  // Find the table declaration
  let tableName = '';
  for (const line of lines) {
    const tableMatch = line.match(/^table\s+(.+)$/);
    if (tableMatch) {
      tableName = unquoteName(tableMatch[1].trim());
      break;
    }
  }

  if (!tableName) {
    // Try to derive name from file path
    const pathParts = fileName.replace(/\\/g, '/').split('/');
    const file = pathParts[pathParts.length - 1];
    tableName = file.replace(/\.tmdl$/, '');
  }
  result.name = tableName;

  // Parse blocks at indent level 1 (children of table)
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = getIndentLevel(line);

    if (indent === 1 || (indent === 0 && !trimmed.startsWith('table '))) {
      // Column definition
      const colMatch = trimmed.match(/^column\s+(.+)$/);
      if (colMatch) {
        const col = parseColumnBlock(lines, i, unquoteName(colMatch[1].trim()));
        if (col.expression) {
          result.calculatedColumns.push(col);
        } else {
          result.columns.push(col);
        }
        i++;
        continue;
      }

      // Measure definition: measure 'Name' = EXPRESSION
      const measureMatch = trimmed.match(/^measure\s+(.+?)\s*=\s*(.*)$/);
      if (measureMatch) {
        const measureName = unquoteName(measureMatch[1].trim());
        const firstPart = measureMatch[2].trim();
        const daxExpr = extractDaxExpression(lines, i);
        result.measures.push({
          name: measureName,
          expression: daxExpr || firstPart,
          ...parseMeasureProperties(lines, i),
        });
        i++;
        continue;
      }

      // Partition definition
      const partMatch = trimmed.match(/^partition\s+(.+)$/);
      if (partMatch) {
        const partRaw = partMatch[1].trim();
        const partEqMatch = partRaw.match(/^(.+?)\s*=\s*(.*)$/);
        const partName = unquoteName((partEqMatch ? partEqMatch[1] : partRaw).trim());
        const partType = partEqMatch ? partEqMatch[2].trim().toLowerCase() : '';
        const partition = parsePartitionBlock(lines, i, partName, partType);
        result.partitions.push(partition);
        i++;
        continue;
      }
    }

    i++;
  }

  return result;
}

/**
 * Parse a column block starting at the given line index.
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {string} name
 * @returns {{ name: string, dataType: string, sourceColumn: string, expression: string|null }}
 */
function parseColumnBlock(lines, startIndex, name) {
  const col = { name, dataType: '', sourceColumn: '', expression: null };
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;

    const propMatch = trimmed.match(/^(\w+)\s*[:=]\s*(.+)$/);
    if (propMatch) {
      const key = propMatch[1].toLowerCase();
      const value = propMatch[2].trim();
      if (key === 'datatype') col.dataType = value;
      else if (key === 'sourcecolumn') col.sourceColumn = value;
      else if (key === 'expression') col.expression = value;
    }
    i++;
  }

  return col;
}

/**
 * Parse properties from a measure block (formatString, etc.).
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {object}
 */
function parseMeasureProperties(lines, startIndex) {
  const props = {};
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;

    const propMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
    if (propMatch) {
      const key = propMatch[1];
      props[key] = propMatch[2].trim();
    }
    i++;
  }

  return props;
}

/**
 * Extract DAX expression from a measure or calculated column line.
 * Handles multi-line DAX where continuation lines are indented further.
 * @param {string[]} lines - All lines of the file.
 * @param {number} startIndex - Index of the line containing the = sign.
 * @returns {string} The extracted DAX expression.
 */
export function extractDaxExpression(lines, startIndex) {
  const startLine = lines[startIndex];
  const trimmed = startLine.trim();

  // Extract the part after the = sign
  const eqIndex = trimmed.indexOf('=');
  if (eqIndex === -1) return '';

  const firstPart = trimmed.substring(eqIndex + 1).trim();
  const baseIndent = getIndentLevel(startLine);
  const parts = [firstPart];

  // Collect continuation lines that are indented more deeply
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    const lineTrimmed = line.trim();

    if (!lineTrimmed) { i++; continue; }

    const indent = getIndentLevel(line);
    // Continuation lines are indented more than the measure line
    // but stop at property lines (key: value) at the same or deeper level
    if (indent <= baseIndent) break;

    // Check if this is a property line (formatString:, displayFolder:, etc.)
    if (lineTrimmed.match(/^\w+\s*:/)) break;

    parts.push(lineTrimmed);
    i++;
  }

  return parts.join('\n').trim();
}

/**
 * Parse a partition block starting at the given line index.
 * Extracts mode, source expression, and data source info.
 * @param {string[]} lines
 * @param {number} startIndex
 * @param {string} name
 * @param {string} type - 'm', 'entity', 'calculated', etc.
 * @returns {{ name: string, type: string, mode: string, sourceExpression: string|null }}
 */
function parsePartitionBlock(lines, startIndex, name, type) {
  const partition = { name, type: type || '', mode: '', sourceExpression: null };
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;

    // mode: import / directQuery
    const modeMatch = trimmed.match(/^mode\s*[:=]\s*(.+)$/i);
    if (modeMatch) {
      partition.mode = modeMatch[1].trim().toLowerCase();
      i++;
      continue;
    }

    // source = <M expression>
    const sourceMatch = trimmed.match(/^source\s*=\s*(.*)$/i);
    if (sourceMatch) {
      const firstPart = sourceMatch[1].trim();
      const parts = firstPart ? [firstPart] : [];
      const sourceIndent = getIndentLevel(line);
      let j = i + 1;
      while (j < lines.length) {
        const sLine = lines[j];
        const sTrimmed = sLine.trim();
        if (!sTrimmed) { j++; continue; }
        const sIndent = getIndentLevel(sLine);
        if (sIndent <= sourceIndent) break;
        parts.push(sTrimmed);
        j++;
      }
      partition.sourceExpression = parts.join('\n').trim() || null;
      i = j;
      continue;
    }

    i++;
  }

  return partition;
}

/**
 * Extract data source connection details from an M expression.
 * Lightweight regex-based parser for common Power Query patterns.
 * @param {string} mExpression - The M/Power Query expression text.
 * @returns {{ server: string|null, database: string|null, schema: string|null, sourceTable: string|null, type: string|null }|null}
 */
export function extractMDataSource(mExpression) {
  if (!mExpression) return null;

  const result = { server: null, database: null, schema: null, sourceTable: null, type: null };

  // Sql.Database("server", "database")
  const sqlMatch = mExpression.match(/Sql\.Database\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/i);
  if (sqlMatch) {
    result.type = 'SQL';
    result.server = sqlMatch[1];
    result.database = sqlMatch[2];
  }

  // Fabric / Lakehouse detection
  if (result.server && result.server.includes('.fabric.microsoft.com')) {
    result.type = 'Fabric/Lakehouse';
  }

  // Schema and item: Source{[Schema="dbo",Item="tablename"]}
  const schemaItemMatch = mExpression.match(/\{[^}]*Schema\s*=\s*"([^"]+)"[^}]*Item\s*=\s*"([^"]+)"[^}]*\}/i);
  if (schemaItemMatch) {
    result.schema = schemaItemMatch[1];
    result.sourceTable = schemaItemMatch[2];
  }

  // Fallback: Source{[Name="tablename"]}
  if (!result.sourceTable) {
    const nameMatch = mExpression.match(/\{[^}]*Name\s*=\s*"([^"]+)"[^}]*\}/i);
    if (nameMatch) {
      result.sourceTable = nameMatch[1];
    }
  }

  // Web.Contents("url")
  if (!result.server) {
    const webMatch = mExpression.match(/Web\.Contents\s*\(\s*"([^"]+)"/i);
    if (webMatch) {
      result.type = 'Web';
      result.server = webMatch[1];
    }
  }

  // Excel.Workbook, Csv.Document, File.Contents
  if (!result.type) {
    const fileMatch = mExpression.match(/(Excel\.Workbook|Csv\.Document|File\.Contents)\s*\(/i);
    if (fileMatch) {
      result.type = fileMatch[1].split('.')[0];
    }
  }

  return (result.server || result.database || result.sourceTable) ? result : null;
}

/**
 * Parse a relationships .tmdl file.
 * @param {string} content - The raw TMDL relationship file content.
 * @returns {Array<{ name: string, fromTable: string, fromColumn: string, toTable: string, toColumn: string, crossFilter: string }>}
 */
export function parseRelationships(content) {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  const relationships = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = getIndentLevel(line);

    // Match relationship declaration
    const relMatch = trimmed.match(/^relationship\s+(.+)$/);
    if (relMatch) {
      if (current) relationships.push(current);
      current = {
        name: unquoteName(relMatch[1].trim()),
        fromTable: '',
        fromColumn: '',
        toTable: '',
        toColumn: '',
        crossFilter: 'single',
      };
      continue;
    }

    if (!current) continue;

    // Inline format: FromTable[FromCol] -> ToTable[ToCol]
    const inlineMatch = trimmed.match(/^(\w[\w\s']*)\[(\w[\w\s']*)\]\s*->\s*(\w[\w\s']*)\[(\w[\w\s']*)\]/);
    if (inlineMatch) {
      current.fromTable = unquoteName(inlineMatch[1].trim());
      current.fromColumn = unquoteName(inlineMatch[2].trim());
      current.toTable = unquoteName(inlineMatch[3].trim());
      current.toColumn = unquoteName(inlineMatch[4].trim());
      continue;
    }

    // Property-based format (skip fromColumn/toColumn as they're handled below with dot/bracket parsing)
    const propMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
    if (propMatch && indent > 0) {
      const key = propMatch[1].toLowerCase();
      const value = propMatch[2].trim();

      if (key === 'fromtable') current.fromTable = unquoteName(value);
      else if (key === 'totable') current.toTable = unquoteName(value);
      else if (key === 'crossfilteringbehavior' || key === 'crossfilter') current.crossFilter = value;
      // fromcolumn and tocolumn are handled by the dedicated parsers below
    }

    // TMDL relationship column reference format
    const fromColMatch = trimmed.match(/^fromColumn:\s*(.+)$/i);
    if (fromColMatch) {
      const ref = fromColMatch[1].trim();
      const bracketMatch = ref.match(/^(\w[\w\s']*)\[(\w[\w\s']*)\]/);
      const dotMatch = ref.match(/^(.+)\.(\w+)$/);
      if (bracketMatch) {
        current.fromTable = unquoteName(bracketMatch[1].trim());
        current.fromColumn = unquoteName(bracketMatch[2].trim());
      } else if (dotMatch) {
        current.fromTable = unquoteName(dotMatch[1].trim());
        current.fromColumn = unquoteName(dotMatch[2].trim());
      } else {
        current.fromColumn = unquoteName(ref);
      }
    }

    const toColMatch = trimmed.match(/^toColumn:\s*(.+)$/i);
    if (toColMatch) {
      const ref = toColMatch[1].trim();
      const bracketMatch = ref.match(/^(\w[\w\s']*)\[(\w[\w\s']*)\]/);
      const dotMatch = ref.match(/^(.+)\.(\w+)$/);
      if (bracketMatch) {
        current.toTable = unquoteName(bracketMatch[1].trim());
        current.toColumn = unquoteName(bracketMatch[2].trim());
      } else if (dotMatch) {
        current.toTable = unquoteName(dotMatch[1].trim());
        current.toColumn = unquoteName(dotMatch[2].trim());
      } else {
        current.toColumn = unquoteName(ref);
      }
    }
  }

  if (current) relationships.push(current);

  return relationships;
}
