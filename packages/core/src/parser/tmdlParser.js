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

      // refreshPolicy block (for incremental refresh tables)
      if (trimmed === 'refreshPolicy') {
        const rpSource = parseRefreshPolicyBlock(lines, i);
        if (rpSource) {
          result.refreshPolicySource = rpSource;
        }
        i++;
        continue;
      }

      // calculationGroup block — also scan nested calculationItem children
      if (trimmed === 'calculationGroup') {
        result.calculationGroup = true;
        if (!result.calculationItems) result.calculationItems = [];
        const cgIndent = indent;
        let j = i + 1;
        while (j < lines.length) {
          const cgLine = lines[j];
          const cgTrimmed = cgLine.trim();
          if (!cgTrimmed) { j++; continue; }
          const cgLineIndent = getIndentLevel(cgLine);
          if (cgLineIndent <= cgIndent) break;
          const nestedCiMatch = cgTrimmed.match(/^calculationItem\s+(.+?)\s*=\s*(.*)$/);
          if (nestedCiMatch) {
            const ciName = unquoteName(nestedCiMatch[1].trim());
            const ciExpr = extractDaxExpression(lines, j);
            result.calculationItems.push({
              name: ciName,
              expression: ciExpr || nestedCiMatch[2].trim(),
            });
          }
          j++;
        }
        i = j;
        continue;
      }

      // calculationItem at same indent level as calculationGroup
      const ciMatch = trimmed.match(/^calculationItem\s+(.+?)\s*=\s*(.*)$/);
      if (ciMatch) {
        if (!result.calculationItems) result.calculationItems = [];
        const ciName = unquoteName(ciMatch[1].trim());
        const ciExpr = extractDaxExpression(lines, i);
        result.calculationItems.push({
          name: ciName,
          expression: ciExpr || ciMatch[2].trim(),
        });
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
  const col = { name, dataType: '', sourceColumn: '', expression: null, isHidden: false };
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;

    if (trimmed === 'isHidden') {
      col.isHidden = true;
      i++;
      continue;
    }

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

    if (trimmed === 'isHidden') {
      props.isHidden = true;
      i++;
      continue;
    }

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
 * Extract column rename mappings from a Power Query M expression.
 * Parses Table.RenameColumns(source, {{"OldName", "NewName"}, ...}).
 * @param {string} mExpression - The M/Power Query expression text.
 * @returns {Map<string, string>} Map of newName -> oldName (PBI column -> source column).
 */
export function extractRenameColumns(mExpression) {
  const renameMap = new Map();
  if (!mExpression) return renameMap;

  // Match Table.RenameColumns(..., { {"old", "new"}, {"old2", "new2"} })
  const renameBlockMatch = mExpression.match(/Table\.RenameColumns\s*\([^,]+,\s*\{([\s\S]*?)\}\s*\)/i);
  if (!renameBlockMatch) return renameMap;

  const block = renameBlockMatch[1];
  // Match individual pairs: {"OldName", "NewName"}
  const pairPattern = /\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = pairPattern.exec(block)) !== null) {
    const oldName = m[1];
    const newName = m[2];
    renameMap.set(newName, oldName); // PBI column name -> source column name
  }

  return renameMap;
}

/**
 * Parse a refreshPolicy block to extract sourceExpression.
 * Used by incremental refresh tables where source M expression
 * lives inside refreshPolicy rather than a partition block.
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {string|null} The M source expression, or null.
 */
function parseRefreshPolicyBlock(lines, startIndex) {
  const baseIndent = getIndentLevel(lines[startIndex]);
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    const indent = getIndentLevel(line);
    if (indent <= baseIndent) break;

    // Look for sourceExpression
    const sourceMatch = trimmed.match(/^sourceExpression\s*[:=]\s*(.*)$/i);
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
      return parts.join('\n').trim() || null;
    }

    i++;
  }

  return null;
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

  // Strip M block comments /* ... */ to avoid matching commented-out code
  const cleanExpr = mExpression.replace(/\/\*[\s\S]*?\*\//g, '');

  // Sql.Database("server", "database")
  const sqlMatch = cleanExpr.match(/Sql\.Database\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/i);
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
  const schemaItemMatch = cleanExpr.match(/\{[^}]*Schema\s*=\s*"([^"]+)"[^}]*Item\s*=\s*"([^"]+)"[^}]*\}/i);
  if (schemaItemMatch) {
    result.schema = schemaItemMatch[1];
    result.sourceTable = schemaItemMatch[2];
  }

  // Fallback: Source{[Name="tablename"]} (only for non-BigQuery)
  if (!result.sourceTable && !/GoogleBigQuery/i.test(cleanExpr)) {
    const nameMatch = cleanExpr.match(/\{[^}]*Name\s*=\s*"([^"]+)"[^}]*\}/i);
    if (nameMatch) {
      result.sourceTable = nameMatch[1];
    }
  }

  // GoogleBigQuery.Database detection
  const bqMatch = cleanExpr.match(/GoogleBigQuery\.Database\s*\(\s*(?:"([^"]*)"|\[([^\]]*)\]|(\w+))/i);
  if (bqMatch && !result.type) {
    result.type = 'BigQuery';
    result.server = bqMatch[1] || bqMatch[2] || bqMatch[3] || null;
  }

  // Value.NativeQuery — extract table from SQL string (prioritize over schema navigation)
  if (/Value\.NativeQuery/i.test(cleanExpr)) {
    // First try: single quoted SQL string
    const nativeQueryMatch = cleanExpr.match(/Value\.NativeQuery\s*\([^,]*,\s*"([\s\S]*?)"\s*[,)]/i);
    if (nativeQueryMatch) {
      const sql = nativeQueryMatch[1];
      const fromMatch = sql.match(/FROM\s+`?([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2})`?/i);
      if (fromMatch) {
        const parts = fromMatch[1].split('.');
        if (parts.length === 3) {
          result.server = result.server || parts[0];
          result.database = parts[1];
          result.sourceTable = parts[2];
        } else if (parts.length === 2) {
          result.database = parts[0];
          result.sourceTable = parts[1];
        }
      }
    }

    // Fallback: concatenated SQL string with & operators
    // Pattern: "SELECT * FROM `" & param & ".dataset.table`"
    if (!result.sourceTable) {
      const tableInBackticks = cleanExpr.match(/\.([A-Za-z_][A-Za-z0-9_]+)\.([A-Za-z_][A-Za-z0-9_]+)`/);
      if (tableInBackticks) {
        result.database = result.database || tableInBackticks[1];
        result.sourceTable = tableInBackticks[2];
      }
    }

    if (!result.type && (result.database || result.sourceTable)) {
      result.type = 'BigQuery';
    }
  }

  // BigQuery schema navigation (only when Value.NativeQuery didn't find a table)
  if (bqMatch && !result.sourceTable) {
    const nameMatches = [...cleanExpr.matchAll(/\{\s*\[(?:[^[\]]*,\s*)?Name\s*=\s*"([^"]+)"[^\]]*\]\s*\}/gi)];
    if (nameMatches.length >= 3) {
      result.server = result.server || nameMatches[0][1];
      result.database = nameMatches[nameMatches.length - 2][1];
      result.sourceTable = nameMatches[nameMatches.length - 1][1];
    } else if (nameMatches.length === 2) {
      result.database = nameMatches[0][1];
      result.sourceTable = nameMatches[1][1];
    } else if (nameMatches.length === 1) {
      result.sourceTable = nameMatches[0][1];
    }

    // Also check Schema/Item pattern for BigQuery
    const bqSchemaItem = cleanExpr.match(/\{[^}]*Schema\s*=\s*"([^"]+)"[^}]*Item\s*=\s*"([^"]+)"[^}]*\}/i);
    if (bqSchemaItem) {
      result.database = bqSchemaItem[1];
      result.sourceTable = bqSchemaItem[2];
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
 * Parse an expressions.tmdl file.
 * Extracts named Power Query expressions and parameter values.
 * @param {string} content - The raw TMDL expressions file content.
 * @returns {{ expressions: Array<{name: string, mExpression: string, kind: string}>, parameters: Map<string, string> }}
 */
export function parseExpressions(content) {
  const lines = content.split('\n').map(l => l.replace(/\r$/, ''));
  const expressions = [];
  const parameters = new Map();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Match expression declaration: expression <name> = m  OR  expression <name> = "value"
    const exprMatch = trimmed.match(/^expression\s+(.+?)\s*=\s*(.*)$/);
    if (exprMatch) {
      const name = unquoteName(exprMatch[1].trim());
      const firstPart = exprMatch[2].trim();

      // Check if it's a simple literal parameter (e.g., expression _Dataset = "my_dataset" meta [...])
      const literalMatch = firstPart.match(/^"([^"]*)"(\s*meta\s*\[.*\])?\s*$/);
      if (literalMatch) {
        parameters.set(name, literalMatch[1]);
        expressions.push({ name, mExpression: literalMatch[1], kind: 'parameter' });
        i++;
        continue;
      }

      // Otherwise it's an M expression block (e.g., expression name = m\n  let\n  ...)
      const baseIndent = getIndentLevel(line);
      const parts = [];
      // firstPart may be 'm' or empty or start of expression
      if (firstPart && firstPart !== 'm') {
        parts.push(firstPart);
      }

      let j = i + 1;
      while (j < lines.length) {
        const eLine = lines[j];
        const eTrimmed = eLine.trim();
        if (!eTrimmed) { j++; continue; }

        const eIndent = getIndentLevel(eLine);
        if (eIndent <= baseIndent) {
          // Check if it's a property line (like annotation, lineageTag, etc.)
          const propMatch = eTrimmed.match(/^(\w+)\s*[:=]/);
          if (propMatch && eIndent === baseIndent + 1) {
            // Skip properties, keep reading
            j++;
            continue;
          }
          break;
        }

        // Skip known property lines
        if (eTrimmed.match(/^(annotation|lineageTag|queryGroup|description)\s*[:=]/i)) {
          j++;
          continue;
        }

        parts.push(eTrimmed);
        j++;
      }

      const mExpression = parts.join('\n').trim();

      // Detect parameter-like expressions (IsParameterQuery, #datetime, #date, numeric literals)
      const isParameterExpr = /IsParameterQuery\s*=\s*true/i.test(mExpression)
        || /^#datetime\s*\(/i.test(mExpression)
        || /^#date\s*\(/i.test(mExpression)
        || /^\d+(\.\d+)?\s*(meta\b|$)/i.test(mExpression);

      const exprKind = (!mExpression || isParameterExpr) ? 'parameter' : 'expression';
      expressions.push({ name, mExpression, kind: exprKind });

      // If it's a parameter with a quoted string value, store as parameter for resolution
      if (isParameterExpr) {
        const quotedVal = mExpression.match(/^"([^"]*)"/);
        if (quotedVal) {
          parameters.set(name, quotedVal[1]);
        }
      } else if (!mExpression.includes('\n') && mExpression.startsWith('"') && mExpression.endsWith('"')) {
        parameters.set(name, mExpression.slice(1, -1));
      }

      i = j;
      continue;
    }

    i++;
  }

  return { expressions, parameters };
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
