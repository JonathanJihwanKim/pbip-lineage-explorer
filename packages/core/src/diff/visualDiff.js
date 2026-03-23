/**
 * Visual Diff — Compares visual configurations between two PBIR snapshots.
 * Handles: visibility changes, bookmark reference changes, field binding changes,
 * visual-level filter changes, visual add/remove.
 */

import { CHANGE_TYPES, CHANGE_SCOPES, createChange } from './changeTypes.js';
import { diffFilters } from './filterDiff.js';

/**
 * Detect visual-level changes between two file maps.
 * @param {Map<string, string>} beforeFiles
 * @param {Map<string, string>} afterFiles
 * @returns {Array} Array of change objects
 */
export function detectVisualChanges(beforeFiles, afterFiles) {
  const changes = [];

  const beforeVisuals = findAllVisualFiles(beforeFiles);
  const afterVisuals = findAllVisualFiles(afterFiles);

  // Detect added visuals
  for (const [visualId, info] of afterVisuals) {
    if (!beforeVisuals.has(visualId)) {
      const config = parseJson(info.content);
      const title = extractVisualTitle(config) || visualId;
      const pageId = info.pageId;
      const pageName = resolvePageName(pageId, afterFiles);

      changes.push(createChange({
        type: CHANGE_TYPES.VISUAL_ADDED,
        scope: CHANGE_SCOPES.VISUAL,
        target: { visualId, visualName: title, pageId, pageName },
        description: `Visual "${title}" added to page "${pageName}"`,
      }));
    }
  }

  // Detect removed visuals
  for (const [visualId, info] of beforeVisuals) {
    if (!afterVisuals.has(visualId)) {
      const config = parseJson(info.content);
      const title = extractVisualTitle(config) || visualId;
      const pageId = info.pageId;
      const pageName = resolvePageName(pageId, beforeFiles);

      changes.push(createChange({
        type: CHANGE_TYPES.VISUAL_REMOVED,
        scope: CHANGE_SCOPES.VISUAL,
        target: { visualId, visualName: title, pageId, pageName },
        description: `Visual "${title}" removed from page "${pageName}"`,
      }));
    }
  }

  // Detect changes to existing visuals
  for (const [visualId, afterInfo] of afterVisuals) {
    const beforeInfo = beforeVisuals.get(visualId);
    if (!beforeInfo) continue;

    // Skip if identical
    if (beforeInfo.content === afterInfo.content) continue;

    const beforeConfig = parseJson(beforeInfo.content);
    const afterConfig = parseJson(afterInfo.content);
    if (!beforeConfig || !afterConfig) continue;

    const title = extractVisualTitle(afterConfig) || extractVisualTitle(beforeConfig) || visualId;
    const pageId = afterInfo.pageId;
    const pageName = resolvePageName(pageId, afterFiles);
    const target = { visualId, visualName: title, pageId, pageName };

    // Detect visibility changes
    changes.push(...detectVisibilityChange(beforeConfig, afterConfig, target));

    // Detect bookmark reference changes
    changes.push(...detectBookmarkRefChange(beforeConfig, afterConfig, target));

    // Detect visual-level filter changes
    changes.push(...detectVisualFilterChanges(beforeConfig, afterConfig, target));

    // Detect field binding changes
    changes.push(...detectFieldBindingChanges(beforeConfig, afterConfig, target));
  }

  return changes;
}

/**
 * Detect isHidden toggle.
 */
function detectVisibilityChange(beforeConfig, afterConfig, target) {
  const beforeHidden = beforeConfig.isHidden === true;
  const afterHidden = afterConfig.isHidden === true;

  if (beforeHidden === afterHidden) return [];

  return [createChange({
    type: CHANGE_TYPES.VISUAL_VISIBILITY_CHANGED,
    scope: CHANGE_SCOPES.VISUAL,
    target,
    description: afterHidden
      ? `Visual "${target.visualName}" was hidden in page "${target.pageName}"`
      : `Visual "${target.visualName}" was unhidden in page "${target.pageName}"`,
    details: { before: { isHidden: beforeHidden }, after: { isHidden: afterHidden } },
  })];
}

/**
 * Detect bookmark reference changes in visual objects.
 * Action buttons store bookmark refs like: Value: "'BookmarkXXX'"
 */
function detectBookmarkRefChange(beforeConfig, afterConfig, target) {
  const beforeRefs = extractBookmarkRefs(beforeConfig);
  const afterRefs = extractBookmarkRefs(afterConfig);

  if (beforeRefs.length === 0 && afterRefs.length === 0) return [];

  // Compare sets
  const beforeSet = new Set(beforeRefs);
  const afterSet = new Set(afterRefs);

  const added = afterRefs.filter(r => !beforeSet.has(r));
  const removed = beforeRefs.filter(r => !afterSet.has(r));

  if (added.length === 0 && removed.length === 0) return [];

  return [createChange({
    type: CHANGE_TYPES.VISUAL_BOOKMARK_CHANGED,
    scope: CHANGE_SCOPES.VISUAL,
    target,
    description: `Button/bookmark reference changed in visual "${target.visualName}" on page "${target.pageName}"`,
    details: { before: beforeRefs, after: afterRefs },
  })];
}

/**
 * Detect visual-level filter config changes.
 */
function detectVisualFilterChanges(beforeConfig, afterConfig, target) {
  const beforeFilters = beforeConfig.filterConfig?.filters || [];
  const afterFilters = afterConfig.filterConfig?.filters || [];

  if (beforeFilters.length === 0 && afterFilters.length === 0) return [];

  return diffFilters(beforeFilters, afterFilters, {
    scope: CHANGE_SCOPES.VISUAL,
    target,
    locationLabel: `visual "${target.visualName}" on page "${target.pageName}"`,
  });
}

/**
 * Detect changes in visual field bindings (prototypeQuery, queryState).
 */
function detectFieldBindingChanges(beforeConfig, afterConfig, target) {
  const beforeFields = extractFieldsSimple(beforeConfig);
  const afterFields = extractFieldsSimple(afterConfig);

  const beforeSet = new Set(beforeFields.map(f => `${f.type}|${f.table}|${f.field}`));
  const afterSet = new Set(afterFields.map(f => `${f.type}|${f.table}|${f.field}`));

  const added = afterFields.filter(f => !beforeSet.has(`${f.type}|${f.table}|${f.field}`));
  const removed = beforeFields.filter(f => !afterSet.has(`${f.type}|${f.table}|${f.field}`));

  if (added.length === 0 && removed.length === 0) return [];

  const parts = [];
  if (added.length > 0) {
    parts.push(`added ${added.map(f => `${f.table}[${f.field}]`).join(', ')}`);
  }
  if (removed.length > 0) {
    parts.push(`removed ${removed.map(f => `${f.table}[${f.field}]`).join(', ')}`);
  }

  return [createChange({
    type: CHANGE_TYPES.VISUAL_FIELD_CHANGED,
    scope: CHANGE_SCOPES.VISUAL,
    target,
    description: `Field bindings changed in visual "${target.visualName}" on page "${target.pageName}": ${parts.join('; ')}`,
    details: { added, removed },
  })];
}

/**
 * Extract a simplified list of field references from a visual config.
 */
function extractFieldsSimple(config) {
  const fields = [];
  const seen = new Set();

  function add(type, table, field) {
    const key = `${type}|${table}|${field}`;
    if (!seen.has(key) && table && field) {
      seen.add(key);
      fields.push({ type, table, field });
    }
  }

  // From prototypeQuery.Select
  const visual = config.visual || config;
  const query = visual.prototypeQuery || visual.query;
  const aliasMap = {};
  if (query?.From) {
    for (const from of query.From) {
      if (from.Name && from.Entity) aliasMap[from.Name] = from.Entity;
    }
  }
  if (query?.Select) {
    for (const item of query.Select) {
      if (item.Column) {
        const entity = item.Column.Expression?.SourceRef?.Entity
          || aliasMap[item.Column.Expression?.SourceRef?.Source] || '';
        add('column', entity, item.Column.Property || '');
      }
      if (item.Measure) {
        const entity = item.Measure.Expression?.SourceRef?.Entity
          || aliasMap[item.Measure.Expression?.SourceRef?.Source] || '';
        add('measure', entity, item.Measure.Property || '');
      }
    }
  }

  // From queryState projections
  const queryState = visual.query?.queryState || visual.queryState;
  if (queryState) {
    for (const roleState of Object.values(queryState)) {
      if (!roleState?.projections) continue;
      for (const proj of roleState.projections) {
        const f = proj?.field;
        if (f?.Column) {
          add('column', f.Column.Expression?.SourceRef?.Entity || '', f.Column.Property || '');
        }
        if (f?.Measure) {
          add('measure', f.Measure.Expression?.SourceRef?.Entity || '', f.Measure.Property || '');
        }
      }
    }
  }

  return fields;
}

/**
 * Extract bookmark references from a visual config (recursive search).
 */
function extractBookmarkRefs(config) {
  const refs = [];
  const bookmarkPattern = /Bookmark[a-fA-F0-9]{20,}/g;
  const json = JSON.stringify(config);
  let match;
  while ((match = bookmarkPattern.exec(json)) !== null) {
    if (!refs.includes(match[0])) refs.push(match[0]);
  }
  return refs;
}

/**
 * Extract visual title from config.
 */
function extractVisualTitle(config) {
  if (!config) return '';
  const visual = config.visual || config;

  if (visual.title) {
    return typeof visual.title === 'string' ? visual.title : (visual.title.text || '');
  }
  // vcObjects title
  if (visual.vcObjects?.title) {
    const arr = visual.vcObjects.title;
    if (Array.isArray(arr) && arr[0]?.properties?.text?.expr?.Literal?.Value) {
      return arr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, '');
    }
  }
  // visualContainerObjects title
  if (visual.visualContainerObjects?.title) {
    const arr = visual.visualContainerObjects.title;
    if (Array.isArray(arr) && arr[0]?.properties?.text?.expr?.Literal?.Value) {
      return arr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, '');
    }
  }
  return config.name || '';
}

/**
 * Find all visual.json files grouped by visual ID.
 * Returns Map<visualId, { content, pageId, path }>
 */
function findAllVisualFiles(files) {
  const visuals = new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.includes('/visuals/') && lower.endsWith('/visual.json')) {
      const parts = path.replace(/\\/g, '/').split('/');
      const visualsIdx = parts.findLastIndex(p => p.toLowerCase() === 'visuals');
      if (visualsIdx !== -1 && visualsIdx + 1 < parts.length) {
        const visualId = parts[visualsIdx + 1];
        const pagesIdx = parts.findIndex(p => p.toLowerCase() === 'pages');
        const pageId = (pagesIdx !== -1 && pagesIdx + 1 < parts.length) ? parts[pagesIdx + 1] : '';
        visuals.set(visualId, { content, pageId, path });
      }
    }
  }
  return visuals;
}

/**
 * Resolve a page ID to its display name.
 */
function resolvePageName(pageId, files) {
  if (!pageId) return 'unknown';
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.endsWith('/page.json') && path.replace(/\\/g, '/').includes(`/${pageId}/`)) {
      try {
        const config = JSON.parse(content);
        return config.displayName || config.name || pageId;
      } catch { /* fall through */ }
    }
  }
  return pageId;
}

/**
 * Parse JSON safely.
 */
function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}
