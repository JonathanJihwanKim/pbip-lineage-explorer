/**
 * Measure Diff — Compares TMDL measure definitions between two snapshots.
 * Handles: measure expression changes, measure add/remove, calculation group item changes.
 */

import { CHANGE_TYPES, CHANGE_SCOPES, createChange } from './changeTypes.js';
import { parseTmdlModel } from '../parser/tmdlParser.js';
import { identifyProjectStructure } from '../parser/projectStructure.js';

/**
 * Detect measure and calculation item changes between two file maps.
 * @param {Map<string, string>} beforeFiles
 * @param {Map<string, string>} afterFiles
 * @returns {Array} Array of change objects
 */
export function detectMeasureChanges(beforeFiles, afterFiles) {
  const changes = [];

  const beforeModel = parseModelFromFiles(beforeFiles);
  const afterModel = parseModelFromFiles(afterFiles);

  if (!beforeModel || !afterModel) return changes;

  // Build maps of all measures: tableName.measureName → expression
  const beforeMeasures = buildMeasureMap(beforeModel.tables);
  const afterMeasures = buildMeasureMap(afterModel.tables);

  // Detect added measures
  for (const [key, measure] of afterMeasures) {
    if (!beforeMeasures.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.MEASURE_ADDED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { measureName: measure.name, tableName: measure.tableName },
        description: `Measure [${measure.name}] added to table "${measure.tableName}"`,
        details: { after: { expression: measure.expression } },
      }));
    }
  }

  // Detect removed measures
  for (const [key, measure] of beforeMeasures) {
    if (!afterMeasures.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.MEASURE_REMOVED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { measureName: measure.name, tableName: measure.tableName },
        description: `Measure [${measure.name}] removed from table "${measure.tableName}"`,
        details: { before: { expression: measure.expression } },
      }));
    }
  }

  // Detect changed measures
  for (const [key, afterMeasure] of afterMeasures) {
    const beforeMeasure = beforeMeasures.get(key);
    if (!beforeMeasure) continue;

    const beforeExpr = normalizeExpression(beforeMeasure.expression);
    const afterExpr = normalizeExpression(afterMeasure.expression);

    if (beforeExpr !== afterExpr) {
      changes.push(createChange({
        type: CHANGE_TYPES.MEASURE_CHANGED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { measureName: afterMeasure.name, tableName: afterMeasure.tableName },
        description: `Measure [${afterMeasure.name}] expression changed in table "${afterMeasure.tableName}"`,
        details: {
          before: { expression: beforeMeasure.expression },
          after: { expression: afterMeasure.expression },
        },
      }));
    }
  }

  // Detect calculation group item changes
  changes.push(...detectCalcItemChanges(beforeModel.tables, afterModel.tables));

  return changes;
}

/**
 * Detect calculation group item changes.
 */
function detectCalcItemChanges(beforeTables, afterTables) {
  const changes = [];

  const beforeCalcItems = buildCalcItemMap(beforeTables);
  const afterCalcItems = buildCalcItemMap(afterTables);

  for (const [key, item] of afterCalcItems) {
    if (!beforeCalcItems.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.CALC_ITEM_ADDED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { calcGroupName: item.tableName, calcItemName: item.name },
        description: `Calculation item [${item.name}] added to calculation group "${item.tableName}"`,
        details: { after: { expression: item.expression } },
      }));
    }
  }

  for (const [key, item] of beforeCalcItems) {
    if (!afterCalcItems.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.CALC_ITEM_REMOVED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { calcGroupName: item.tableName, calcItemName: item.name },
        description: `Calculation item [${item.name}] removed from calculation group "${item.tableName}"`,
        details: { before: { expression: item.expression } },
      }));
    }
  }

  for (const [key, afterItem] of afterCalcItems) {
    const beforeItem = beforeCalcItems.get(key);
    if (!beforeItem) continue;

    if (normalizeExpression(beforeItem.expression) !== normalizeExpression(afterItem.expression)) {
      changes.push(createChange({
        type: CHANGE_TYPES.CALC_ITEM_CHANGED,
        scope: CHANGE_SCOPES.MEASURE,
        target: { calcGroupName: afterItem.tableName, calcItemName: afterItem.name },
        description: `Calculation item [${afterItem.name}] expression changed in "${afterItem.tableName}"`,
        details: {
          before: { expression: beforeItem.expression },
          after: { expression: afterItem.expression },
        },
      }));
    }
  }

  return changes;
}

/**
 * Parse a model from a file map using the existing parsers.
 */
function parseModelFromFiles(files) {
  const structure = identifyProjectStructure(files);
  if (!structure.tmdlFiles || structure.tmdlFiles.length === 0) return null;

  return parseTmdlModel(structure.tmdlFiles, structure.relationshipFiles || []);
}

/**
 * Build a map of tableName.measureName → { name, tableName, expression }.
 */
function buildMeasureMap(tables) {
  const map = new Map();
  for (const table of tables) {
    for (const measure of (table.measures || [])) {
      const key = `${table.name}.${measure.name}`;
      map.set(key, {
        name: measure.name,
        tableName: table.name,
        expression: measure.expression || '',
      });
    }
  }
  return map;
}

/**
 * Build a map of tableName.calcItemName → { name, tableName, expression }.
 */
function buildCalcItemMap(tables) {
  const map = new Map();
  for (const table of tables) {
    if (!table.calculationGroup || !table.calculationItems) continue;
    for (const item of table.calculationItems) {
      const key = `${table.name}.${item.name}`;
      map.set(key, {
        name: item.name,
        tableName: table.name,
        expression: item.expression || '',
      });
    }
  }
  return map;
}

/**
 * Normalize a DAX expression for comparison.
 * Normalizes whitespace to avoid false positives from formatting changes.
 */
function normalizeExpression(expr) {
  if (!expr) return '';
  return expr
    .replace(/\s+/g, ' ')         // normalize whitespace
    .trim();
}
