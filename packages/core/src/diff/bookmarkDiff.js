/**
 * Bookmark Diff — Compares bookmark states between two PBIR snapshots.
 * Handles: default button selection changes (via bookmark active section changes),
 * bookmark add/remove, bookmark filter overrides.
 */

import { CHANGE_TYPES, CHANGE_SCOPES, createChange } from './changeTypes.js';

/**
 * Detect bookmark-level changes between two file maps.
 * @param {Map<string, string>} beforeFiles
 * @param {Map<string, string>} afterFiles
 * @returns {Array} Array of change objects
 */
export function detectBookmarkChanges(beforeFiles, afterFiles) {
  const changes = [];

  const beforeBookmarks = findAllBookmarkFiles(beforeFiles);
  const afterBookmarks = findAllBookmarkFiles(afterFiles);

  // Detect added/removed bookmarks
  for (const [id, info] of afterBookmarks) {
    if (!beforeBookmarks.has(id)) {
      const config = parseJson(info.content);
      const name = config?.displayName || id;
      changes.push(createChange({
        type: CHANGE_TYPES.BOOKMARK_CHANGED,
        scope: CHANGE_SCOPES.BOOKMARK,
        target: { bookmarkId: id, bookmarkName: name },
        description: `Bookmark "${name}" was added`,
        details: { after: summarizeBookmark(config) },
      }));
    }
  }

  for (const [id, info] of beforeBookmarks) {
    if (!afterBookmarks.has(id)) {
      const config = parseJson(info.content);
      const name = config?.displayName || id;
      changes.push(createChange({
        type: CHANGE_TYPES.BOOKMARK_CHANGED,
        scope: CHANGE_SCOPES.BOOKMARK,
        target: { bookmarkId: id, bookmarkName: name },
        description: `Bookmark "${name}" was removed`,
        details: { before: summarizeBookmark(config) },
      }));
    }
  }

  // Detect changes to existing bookmarks
  for (const [id, afterInfo] of afterBookmarks) {
    const beforeInfo = beforeBookmarks.get(id);
    if (!beforeInfo || beforeInfo.content === afterInfo.content) continue;

    const beforeConfig = parseJson(beforeInfo.content);
    const afterConfig = parseJson(afterInfo.content);
    if (!beforeConfig || !afterConfig) continue;

    const name = afterConfig.displayName || beforeConfig.displayName || id;
    const beforeSummary = summarizeBookmark(beforeConfig);
    const afterSummary = summarizeBookmark(afterConfig);

    if (JSON.stringify(beforeSummary) !== JSON.stringify(afterSummary)) {
      // Build a specific description
      const descParts = [];

      if (beforeSummary.activeSection !== afterSummary.activeSection) {
        descParts.push(`active section changed`);
      }

      if (JSON.stringify(beforeSummary.targetVisuals) !== JSON.stringify(afterSummary.targetVisuals)) {
        descParts.push(`target visuals changed`);
      }

      if (JSON.stringify(beforeSummary.filterOverrides) !== JSON.stringify(afterSummary.filterOverrides)) {
        descParts.push(`filter overrides changed`);
      }

      const description = descParts.length > 0
        ? `Bookmark "${name}" changed: ${descParts.join(', ')}`
        : `Bookmark "${name}" was modified`;

      changes.push(createChange({
        type: CHANGE_TYPES.BOOKMARK_CHANGED,
        scope: CHANGE_SCOPES.BOOKMARK,
        target: { bookmarkId: id, bookmarkName: name },
        description,
        details: { before: beforeSummary, after: afterSummary },
      }));
    }
  }

  return changes;
}

/**
 * Summarize a bookmark for comparison.
 */
function summarizeBookmark(config) {
  if (!config) return {};

  const summary = {
    displayName: config.displayName || '',
    activeSection: config.explorationState?.activeSection || '',
    targetVisuals: config.options?.targetVisualNames || [],
    applyOnlyToTargets: config.options?.applyOnlyToTargetVisuals || false,
    filterOverrides: [],
  };

  // Extract filter overrides from explorationState
  const filters = config.explorationState?.filters;
  if (filters) {
    if (filters.byName) {
      for (const [name, state] of Object.entries(filters.byName)) {
        summary.filterOverrides.push({ name, type: 'byName', ...state });
      }
    }
    if (filters.byExpr) {
      for (const entry of (Array.isArray(filters.byExpr) ? filters.byExpr : [])) {
        summary.filterOverrides.push({ type: 'byExpr', ...entry });
      }
    }
  }

  return summary;
}

/**
 * Find all bookmark.json files grouped by bookmark ID.
 */
function findAllBookmarkFiles(files) {
  const bookmarks = new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.endsWith('.bookmark.json')) {
      // Extract bookmark ID from filename: {BookmarkId}.bookmark.json
      const parts = path.replace(/\\/g, '/').split('/');
      const fileName = parts[parts.length - 1];
      const bookmarkId = fileName.replace('.bookmark.json', '');
      bookmarks.set(bookmarkId, { content, path });
    }
  }
  return bookmarks;
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
