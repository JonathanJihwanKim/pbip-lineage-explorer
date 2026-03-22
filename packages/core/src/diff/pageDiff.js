/**
 * Page Diff — Detects page-level changes between two PBIR snapshots.
 * Handles: active page change, page add/remove, page filter changes.
 */

import { CHANGE_TYPES, CHANGE_SCOPES, createChange } from './changeTypes.js';
import { diffFilters } from './filterDiff.js';

/**
 * Detect page-level changes between two file maps.
 * @param {Map<string, string>} beforeFiles
 * @param {Map<string, string>} afterFiles
 * @returns {Array} Array of change objects
 */
export function detectPageChanges(beforeFiles, afterFiles) {
  const changes = [];

  changes.push(...detectActivePageChange(beforeFiles, afterFiles));
  changes.push(...detectPageAddRemove(beforeFiles, afterFiles));
  changes.push(...detectPageFilterChanges(beforeFiles, afterFiles));

  return changes;
}

/**
 * Detect if the default active page changed.
 */
function detectActivePageChange(beforeFiles, afterFiles) {
  const changes = [];
  const beforePages = findPagesJson(beforeFiles);
  const afterPages = findPagesJson(afterFiles);

  if (!beforePages || !afterPages) return changes;

  try {
    const beforeConfig = JSON.parse(beforePages);
    const afterConfig = JSON.parse(afterPages);

    if (beforeConfig.activePageName !== afterConfig.activePageName) {
      // Resolve page display names
      const beforePageName = resolvePageDisplayName(beforeConfig.activePageName, beforeFiles);
      const afterPageName = resolvePageDisplayName(afterConfig.activePageName, afterFiles);

      changes.push(createChange({
        type: CHANGE_TYPES.DEFAULT_PAGE_CHANGED,
        scope: CHANGE_SCOPES.REPORT,
        target: { pageId: afterConfig.activePageName, pageName: afterPageName },
        description: `Default page changed from "${beforePageName}" to "${afterPageName}"`,
        details: {
          before: { pageId: beforeConfig.activePageName, pageName: beforePageName },
          after: { pageId: afterConfig.activePageName, pageName: afterPageName },
        },
      }));
    }
  } catch { /* skip if not valid JSON */ }

  return changes;
}

/**
 * Detect pages that were added or removed.
 */
function detectPageAddRemove(beforeFiles, afterFiles) {
  const changes = [];
  const beforePageIds = extractPageIds(beforeFiles);
  const afterPageIds = extractPageIds(afterFiles);

  for (const pageId of afterPageIds) {
    if (!beforePageIds.has(pageId)) {
      const pageName = resolvePageDisplayName(pageId, afterFiles);
      changes.push(createChange({
        type: CHANGE_TYPES.PAGE_ADDED,
        scope: CHANGE_SCOPES.PAGE,
        target: { pageId, pageName },
        description: `Page "${pageName}" was added`,
      }));
    }
  }

  for (const pageId of beforePageIds) {
    if (!afterPageIds.has(pageId)) {
      const pageName = resolvePageDisplayName(pageId, beforeFiles);
      changes.push(createChange({
        type: CHANGE_TYPES.PAGE_REMOVED,
        scope: CHANGE_SCOPES.PAGE,
        target: { pageId, pageName },
        description: `Page "${pageName}" was removed`,
      }));
    }
  }

  return changes;
}

/**
 * Detect filter changes in page.json files (page-level filters).
 */
function detectPageFilterChanges(beforeFiles, afterFiles) {
  const changes = [];

  // Find all page.json files in before and after
  const beforePageFiles = findAllPageJsonFiles(beforeFiles);
  const afterPageFiles = findAllPageJsonFiles(afterFiles);

  // Get all page IDs that exist in either snapshot
  const allPageIds = new Set([...beforePageFiles.keys(), ...afterPageFiles.keys()]);

  for (const pageId of allPageIds) {
    const beforeContent = beforePageFiles.get(pageId);
    const afterContent = afterPageFiles.get(pageId);

    if (!beforeContent && !afterContent) continue;

    try {
      const beforeConfig = beforeContent ? JSON.parse(beforeContent) : {};
      const afterConfig = afterContent ? JSON.parse(afterContent) : {};

      const pageName = afterConfig.displayName || beforeConfig.displayName || pageId;

      const beforeFilters = beforeConfig.filterConfig?.filters || [];
      const afterFilters = afterConfig.filterConfig?.filters || [];

      const filterChanges = diffFilters(beforeFilters, afterFilters, {
        scope: CHANGE_SCOPES.PAGE,
        target: { pageId, pageName },
        locationLabel: `page "${pageName}"`,
      });

      changes.push(...filterChanges);
    } catch { /* skip if not valid JSON */ }
  }

  return changes;
}

/**
 * Find the pages.json file content in a file map.
 */
function findPagesJson(files) {
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.endsWith('/pages/pages.json') || lower === 'definition/pages/pages.json') {
      return content;
    }
  }
  return null;
}

/**
 * Extract set of page IDs from page.json file paths.
 */
function extractPageIds(files) {
  const pageIds = new Set();
  for (const [path] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.endsWith('/page.json')) {
      const parts = path.replace(/\\/g, '/').split('/');
      const pagesIdx = parts.findIndex(p => p.toLowerCase() === 'pages');
      if (pagesIdx !== -1 && pagesIdx + 1 < parts.length) {
        pageIds.add(parts[pagesIdx + 1]);
      }
    }
  }
  return pageIds;
}

/**
 * Find all page.json files grouped by page ID.
 */
function findAllPageJsonFiles(files) {
  const pageFiles = new Map();
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.endsWith('/page.json')) {
      const parts = path.replace(/\\/g, '/').split('/');
      const pagesIdx = parts.findIndex(p => p.toLowerCase() === 'pages');
      if (pagesIdx !== -1 && pagesIdx + 1 < parts.length) {
        const pageId = parts[pagesIdx + 1];
        pageFiles.set(pageId, content);
      }
    }
  }
  return pageFiles;
}

/**
 * Resolve a page ID to its display name by reading its page.json.
 */
function resolvePageDisplayName(pageId, files) {
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
