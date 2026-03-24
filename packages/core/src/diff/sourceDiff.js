/**
 * Source Diff — Compares data source M expressions and named expressions/parameters
 * between two TMDL snapshots.
 *
 * Handles: source expression changes (partition M code), named expression changes,
 * parameter value changes.
 */

import { CHANGE_TYPES, CHANGE_SCOPES, createChange } from './changeTypes.js';
import { parseTmdlModel } from '../parser/tmdlParser.js';
import { identifyProjectStructure } from '../parser/projectStructure.js';

/**
 * Detect source expression, named expression, and parameter changes between two file maps.
 * @param {Map<string, string>} beforeFiles
 * @param {Map<string, string>} afterFiles
 * @returns {Array} Array of change objects
 */
export function detectSourceChanges(beforeFiles, afterFiles) {
  const changes = [];

  const beforeStructure = identifyProjectStructure(beforeFiles);
  const afterStructure = identifyProjectStructure(afterFiles);

  // 1. Detect partition source expression changes
  changes.push(...detectPartitionSourceChanges(beforeStructure, afterStructure));

  // 2. Detect named expression and parameter changes
  changes.push(...detectExpressionFileChanges(beforeStructure, afterStructure));

  return changes;
}

/**
 * Detect changes in partition sourceExpression (M code) between models.
 */
function detectPartitionSourceChanges(beforeStructure, afterStructure) {
  const changes = [];

  const beforeModel = parseModel(beforeStructure);
  const afterModel = parseModel(afterStructure);

  if (!beforeModel || !afterModel) return changes;

  const beforeSources = buildSourceMap(beforeModel.tables);
  const afterSources = buildSourceMap(afterModel.tables);

  for (const [key, afterSource] of afterSources) {
    const beforeSource = beforeSources.get(key);
    if (!beforeSource) continue; // New table/partition — covered by column/table detection

    if (beforeSource.sourceExpression && afterSource.sourceExpression) {
      const beforeNorm = normalizeWhitespace(beforeSource.sourceExpression);
      const afterNorm = normalizeWhitespace(afterSource.sourceExpression);

      if (beforeNorm !== afterNorm) {
        changes.push(createChange({
          type: CHANGE_TYPES.SOURCE_EXPRESSION_CHANGED,
          scope: CHANGE_SCOPES.SOURCE,
          target: { tableName: afterSource.tableName, partitionName: afterSource.partitionName },
          description: `Source expression changed for partition "${afterSource.partitionName}" in table "${afterSource.tableName}"`,
          details: {
            before: { sourceExpression: beforeSource.sourceExpression },
            after: { sourceExpression: afterSource.sourceExpression },
          },
        }));
      }
    }
  }

  return changes;
}

/**
 * Detect changes in expressions.tmdl files (named expressions and parameters).
 */
function detectExpressionFileChanges(beforeStructure, afterStructure) {
  const changes = [];

  const beforeExprs = buildExpressionMap(beforeStructure.expressionFiles || []);
  const afterExprs = buildExpressionMap(afterStructure.expressionFiles || []);

  for (const [name, afterContent] of afterExprs) {
    const beforeContent = beforeExprs.get(name);
    if (beforeContent === undefined) continue; // New expression — skip for now

    if (normalizeWhitespace(beforeContent) !== normalizeWhitespace(afterContent)) {
      // Determine if this looks like a parameter (simple quoted value) or an expression
      const isParameter = isParameterLike(afterContent);
      const changeType = isParameter ? CHANGE_TYPES.PARAMETER_CHANGED : CHANGE_TYPES.EXPRESSION_CHANGED;
      const label = isParameter ? 'Parameter' : 'Expression';

      changes.push(createChange({
        type: changeType,
        scope: CHANGE_SCOPES.EXPRESSION,
        target: { expressionName: name },
        description: `${label} "${name}" changed`,
        details: {
          before: { content: beforeContent },
          after: { content: afterContent },
        },
      }));
    }
  }

  return changes;
}

/**
 * Parse a model from a project structure.
 */
function parseModel(structure) {
  if (!structure.tmdlFiles || structure.tmdlFiles.length === 0) return null;
  return parseTmdlModel(structure.tmdlFiles, structure.relationshipFiles || []);
}

/**
 * Build a map of tableName.partitionName → { tableName, partitionName, sourceExpression }.
 */
function buildSourceMap(tables) {
  const map = new Map();
  for (const table of tables) {
    for (const partition of (table.partitions || [])) {
      if (partition.sourceExpression) {
        const key = `${table.name}.${partition.name}`;
        map.set(key, {
          tableName: table.name,
          partitionName: partition.name,
          sourceExpression: partition.sourceExpression,
        });
      }
    }
  }
  return map;
}

/**
 * Build a map of expression name → raw content by parsing expression files.
 * Uses simple regex extraction to get individual expression blocks.
 */
function buildExpressionMap(expressionFiles) {
  const map = new Map();
  for (const { content } of expressionFiles) {
    const lines = content.split('\n');
    let currentName = null;
    let currentParts = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.replace(/\r$/, '').trim();

      const exprMatch = trimmed.match(/^expression\s+(.+?)\s*=\s*(.*)$/);
      if (exprMatch) {
        // Save previous expression
        if (currentName) {
          map.set(currentName, currentParts.join('\n').trim());
        }
        currentName = unquoteName(exprMatch[1].trim());
        const rest = exprMatch[2].trim();
        currentParts = rest ? [rest] : [];
        continue;
      }

      if (currentName) {
        currentParts.push(line.replace(/\r$/, ''));
      }
    }

    // Save last expression
    if (currentName) {
      map.set(currentName, currentParts.join('\n').trim());
    }
  }
  return map;
}

/**
 * Remove surrounding single quotes from a name if present.
 */
function unquoteName(name) {
  if (name && name.startsWith("'") && name.endsWith("'")) {
    return name.slice(1, -1);
  }
  return name || '';
}

/**
 * Check if content looks like a parameter value (simple literal).
 */
function isParameterLike(content) {
  if (!content) return false;
  const trimmed = content.trim();
  // Simple quoted string, possibly with meta
  if (/^"[^"]*"(\s*meta\s*\[.*\])?\s*$/.test(trimmed)) return true;
  // Numeric literal
  if (/^\d+(\.\d+)?\s*(meta\b|$)/i.test(trimmed)) return true;
  // #datetime or #date parameters
  if (/^#(datetime|date)\s*\(/i.test(trimmed)) return true;
  return false;
}

/**
 * Normalize whitespace for comparison (whitespace-insensitive).
 */
function normalizeWhitespace(str) {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
}
