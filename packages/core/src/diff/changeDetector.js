/**
 * Change Detector — Main orchestrator for detecting changes between two PBIR/TMDL snapshots.
 *
 * Takes two file maps (before and after) and an optional lineage graph,
 * produces a structured change report with human-readable descriptions
 * and downstream impact analysis.
 */

import { detectPageChanges } from './pageDiff.js';
import { detectReportFilterChanges } from './filterDiff.js';
import { detectMeasureChanges } from './measureDiff.js';
import { detectVisualChanges } from './visualDiff.js';
import { detectBookmarkChanges } from './bookmarkDiff.js';
import { detectRelationshipChanges } from './relationshipDiff.js';
import { detectSourceChanges } from './sourceDiff.js';
import { resolveImpact, resolveCalcItemImpact } from './impactResolver.js';
import { CHANGE_TYPES } from './changeTypes.js';

/**
 * Detect all changes between two file snapshots.
 *
 * @param {Map<string, string>} beforeFiles - File map from the earlier commit.
 * @param {Map<string, string>} afterFiles - File map from the later commit.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} [graph] - Lineage graph from "after" state (for impact resolution).
 * @returns {{ changes: Array, summary: object }}
 */
export function detectChanges(beforeFiles, afterFiles, graph = null) {
  const allChanges = [];

  // Separate report files from model files
  const beforeReport = filterReportFiles(beforeFiles);
  const afterReport = filterReportFiles(afterFiles);
  const beforeModel = filterModelFiles(beforeFiles);
  const afterModel = filterModelFiles(afterFiles);

  // 1. Page-level changes (active page, page add/remove, page filters)
  allChanges.push(...detectPageChanges(beforeReport, afterReport));

  // 2. Report-level filter changes
  allChanges.push(...detectReportFilterChanges(beforeReport, afterReport));

  // 3. Visual-level changes (visibility, bookmarks, filters, field bindings)
  allChanges.push(...detectVisualChanges(beforeReport, afterReport));

  // 4. Bookmark changes
  allChanges.push(...detectBookmarkChanges(beforeReport, afterReport));

  // 5. Measure, calculation group, and column changes
  allChanges.push(...detectMeasureChanges(beforeModel, afterModel));

  // 6. Relationship changes
  allChanges.push(...detectRelationshipChanges(beforeModel, afterModel));

  // 7. Source expression, named expression, and parameter changes
  allChanges.push(...detectSourceChanges(beforeModel, afterModel));

  // 8. Resolve impact for measure and calc item changes using the lineage graph
  if (graph) {
    for (const change of allChanges) {
      if (change.type === CHANGE_TYPES.MEASURE_CHANGED ||
          change.type === CHANGE_TYPES.MEASURE_ADDED ||
          change.type === CHANGE_TYPES.MEASURE_REMOVED) {
        const { measureName, tableName } = change.target;
        if (measureName && tableName) {
          change.impact = resolveImpact(measureName, tableName, graph);
        }
      } else if (change.type === CHANGE_TYPES.CALC_ITEM_CHANGED ||
                 change.type === CHANGE_TYPES.CALC_ITEM_ADDED ||
                 change.type === CHANGE_TYPES.CALC_ITEM_REMOVED) {
        const { calcGroupName } = change.target;
        if (calcGroupName) {
          change.impact = resolveCalcItemImpact(calcGroupName, graph);
        }
      }
    }
  }

  // Build summary
  const summary = buildSummary(allChanges);

  return { changes: allChanges, summary };
}

/**
 * Build a summary of all changes.
 */
function buildSummary(changes) {
  const byType = {};
  const byScope = {};

  for (const change of changes) {
    byType[change.type] = (byType[change.type] || 0) + 1;
    byScope[change.scope] = (byScope[change.scope] || 0) + 1;
  }

  return {
    totalChanges: changes.length,
    byType,
    byScope,
  };
}

/**
 * Filter a combined file map to only report files (.Report folder).
 * Handles both combined maps and already-separated maps.
 */
function filterReportFiles(files) {
  const filtered = new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    // Include if it's a report file OR if it's already a report-relative path
    if (lower.includes('.report/') ||
        lower.includes('/definition/pages/') ||
        lower.includes('/definition/bookmarks/') ||
        lower.endsWith('/report.json') ||
        lower.endsWith('/pages.json') ||
        lower.endsWith('/page.json') ||
        lower.endsWith('/visual.json') ||
        lower.endsWith('.bookmark.json') ||
        lower.endsWith('.pbir')) {
      filtered.set(path, content);
    }
  }
  // If nothing matched the .report/ pattern, the files might already be report-relative
  if (filtered.size === 0) return files;
  return filtered;
}

/**
 * Filter a combined file map to only model files (.SemanticModel folder).
 */
function filterModelFiles(files) {
  const filtered = new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.includes('.semanticmodel/') || lower.endsWith('.tmdl')) {
      filtered.set(path, content);
    }
  }
  if (filtered.size === 0) return files;
  return filtered;
}
