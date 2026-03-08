/**
 * DAX Parser - Lightweight parser for DAX expressions.
 * Extracts references to measures, columns, and tables from DAX formulas
 * to build dependency edges in the lineage graph.
 */

/** DAX functions that take a table as their first argument. */
const TABLE_FUNCTIONS = [
  'CALCULATE', 'CALCULATETABLE', 'FILTER', 'SUMX', 'AVERAGEX',
  'COUNTX', 'MAXX', 'MINX', 'RANKX', 'ADDCOLUMNS', 'SELECTCOLUMNS',
  'RELATEDTABLE', 'ALL', 'ALLEXCEPT', 'VALUES', 'DISTINCT',
  'TOPN', 'GENERATE'
];

/**
 * Strip string literals, line comments, and block comments from DAX
 * so we don't pick up false references inside them.
 * @param {string} dax
 * @returns {string} DAX with strings/comments replaced by whitespace.
 */
function stripStringsAndComments(dax) {
  // Order matters: block comments, line comments, then double-quoted strings
  return dax.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\r\n]*/g, ' ')
    .replace(/"(?:[^"\\]|"")*"/g, ' ');
}

/**
 * Extract column references from a DAX expression.
 * Matches patterns like 'Table Name'[Column] or TableName[Column].
 * @param {string} dax - The DAX expression.
 * @returns {Array<{table: string, column: string}>} Array of table-column pairs.
 */
export function extractColumnRefs(dax) {
  const clean = stripStringsAndComments(dax);
  const pattern = /(?:'([^']+)'|([A-Za-z_]\w*))\[([^\]]+)\]/g;
  const refs = [];
  const seen = new Set();
  let m;
  while ((m = pattern.exec(clean)) !== null) {
    const table = m[1] || m[2];
    const column = m[3];
    const key = `${table}[${column}]`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ table, column });
    }
  }
  return refs;
}

/**
 * Extract measure references from a DAX expression.
 * Matches standalone [MeasureName] references not preceded by a table name.
 * @param {string} dax - The DAX expression.
 * @returns {Array<{measure: string}>} Array of referenced measure objects.
 */
export function extractMeasureRefs(dax) {
  const clean = stripStringsAndComments(dax);
  const pattern = /(?<![\w'])\[([^\]]+)\]/g;
  const refs = [];
  const seen = new Set();
  let m;
  while ((m = pattern.exec(clean)) !== null) {
    const measure = m[1];
    if (!seen.has(measure)) {
      seen.add(measure);
      refs.push({ measure });
    }
  }
  return refs;
}

/**
 * Extract table references from a DAX expression.
 * Finds table names used as first arguments to known DAX iterator/table functions.
 * @param {string} dax - The DAX expression.
 * @returns {string[]} Array of referenced table names (deduplicated).
 */
export function extractTableRefs(dax) {
  const clean = stripStringsAndComments(dax);
  const funcList = TABLE_FUNCTIONS.join('|');
  // Match: FUNCNAME ( 'Table Name' or FUNCNAME ( TableName
  const pattern = new RegExp(
    `(?:${funcList})\\s*\\(\\s*(?:'([^']+)'|([A-Za-z_]\\w*))`,
    'gi'
  );
  const refs = [];
  const seen = new Set();
  let m;
  while ((m = pattern.exec(clean)) !== null) {
    const table = m[1] || m[2];
    // Filter out common DAX keywords/functions that could be misidentified
    if (table && !seen.has(table) && !isDAXKeyword(table)) {
      seen.add(table);
      refs.push(table);
    }
  }
  return refs;
}

/**
 * Check if a name is a DAX keyword/function rather than a table name.
 */
function isDAXKeyword(name) {
  const keywords = new Set([
    'TRUE', 'FALSE', 'BLANK', 'NOT', 'AND', 'OR', 'IN',
    'VAR', 'RETURN', 'IF', 'SWITCH', 'SELECTEDVALUE'
  ]);
  return keywords.has(name.toUpperCase());
}

/**
 * Parse a DAX expression and extract all referenced objects.
 * @param {string} daxExpression - The DAX formula text.
 * @returns {{ tableRefs: string[], columnRefs: Array<{table: string, column: string}>, measureRefs: Array<{measure: string, table?: string}> }}
 */
export function parseDaxExpression(daxExpression) {
  if (!daxExpression || typeof daxExpression !== 'string') {
    return { tableRefs: [], columnRefs: [], measureRefs: [] };
  }

  const columnRefs = extractColumnRefs(daxExpression);
  const measureRefs = extractMeasureRefs(daxExpression);
  const tableRefs = extractTableRefs(daxExpression);

  // Also add tables from column refs that aren't already in tableRefs
  const tableSet = new Set(tableRefs);
  for (const col of columnRefs) {
    if (!tableSet.has(col.table)) {
      tableSet.add(col.table);
      tableRefs.push(col.table);
    }
  }

  return { tableRefs, columnRefs, measureRefs };
}
