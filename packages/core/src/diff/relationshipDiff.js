/**
 * Relationship Diff — Compares relationship definitions between two TMDL snapshots.
 * Handles: relationship add/remove/change (crossFilteringBehavior).
 */

import { CHANGE_TYPES, CHANGE_SCOPES, createChange } from './changeTypes.js';
import { parseTmdlModel } from '../parser/tmdlParser.js';
import { identifyProjectStructure } from '../parser/projectStructure.js';

/**
 * Detect relationship changes between two file maps.
 * @param {Map<string, string>} beforeFiles
 * @param {Map<string, string>} afterFiles
 * @returns {Array} Array of change objects
 */
export function detectRelationshipChanges(beforeFiles, afterFiles) {
  const changes = [];

  const beforeModel = parseModelFromFiles(beforeFiles);
  const afterModel = parseModelFromFiles(afterFiles);

  if (!beforeModel || !afterModel) return changes;

  const beforeRels = buildRelationshipMap(beforeModel.relationships || []);
  const afterRels = buildRelationshipMap(afterModel.relationships || []);

  // Detect added relationships
  for (const [key, rel] of afterRels) {
    if (!beforeRels.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.RELATIONSHIP_ADDED,
        scope: CHANGE_SCOPES.RELATIONSHIP,
        target: { fromTable: rel.fromTable, fromColumn: rel.fromColumn, toTable: rel.toTable, toColumn: rel.toColumn },
        description: `Relationship added: ${rel.fromTable}[${rel.fromColumn}] -> ${rel.toTable}[${rel.toColumn}]`,
        details: { after: { crossFilter: rel.crossFilter } },
      }));
    }
  }

  // Detect removed relationships
  for (const [key, rel] of beforeRels) {
    if (!afterRels.has(key)) {
      changes.push(createChange({
        type: CHANGE_TYPES.RELATIONSHIP_REMOVED,
        scope: CHANGE_SCOPES.RELATIONSHIP,
        target: { fromTable: rel.fromTable, fromColumn: rel.fromColumn, toTable: rel.toTable, toColumn: rel.toColumn },
        description: `Relationship removed: ${rel.fromTable}[${rel.fromColumn}] -> ${rel.toTable}[${rel.toColumn}]`,
        details: { before: { crossFilter: rel.crossFilter } },
      }));
    }
  }

  // Detect changed relationships (crossFilteringBehavior)
  for (const [key, afterRel] of afterRels) {
    const beforeRel = beforeRels.get(key);
    if (!beforeRel) continue;

    if (beforeRel.crossFilter !== afterRel.crossFilter) {
      changes.push(createChange({
        type: CHANGE_TYPES.RELATIONSHIP_CHANGED,
        scope: CHANGE_SCOPES.RELATIONSHIP,
        target: { fromTable: afterRel.fromTable, fromColumn: afterRel.fromColumn, toTable: afterRel.toTable, toColumn: afterRel.toColumn },
        description: `Relationship ${afterRel.fromTable}[${afterRel.fromColumn}] -> ${afterRel.toTable}[${afterRel.toColumn}] cross-filter changed from "${beforeRel.crossFilter}" to "${afterRel.crossFilter}"`,
        details: {
          before: { crossFilter: beforeRel.crossFilter },
          after: { crossFilter: afterRel.crossFilter },
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
  if (!structure.tmdlFiles || structure.tmdlFiles.length === 0) {
    // Still try to parse relationships if relationship files exist
    if (!structure.relationshipFiles || structure.relationshipFiles.length === 0) return null;
  }

  return parseTmdlModel(structure.tmdlFiles || [], structure.relationshipFiles || []);
}

/**
 * Build a map of relationship key → relationship object.
 * Key: fromTable.fromColumn->toTable.toColumn
 */
function buildRelationshipMap(relationships) {
  const map = new Map();
  for (const rel of relationships) {
    const key = `${rel.fromTable}.${rel.fromColumn}->${rel.toTable}.${rel.toColumn}`;
    map.set(key, rel);
  }
  return map;
}
