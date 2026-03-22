/**
 * Commit Scanner — Scans recent git commits for PBIR/TMDL changes,
 * builds before/after file maps, and runs the change detector.
 */

const { getRecentCommits, getChangedFiles, buildFileMap, isGitRepo, getRepoRoot } = require('./gitHistory');
const { detectChanges } = require('@pbip-lineage/core');

/**
 * Scan recent commits and detect all changes.
 * @param {string} workspacePath - The workspace directory path.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} [graph] - Lineage graph for impact resolution.
 * @param {number} [maxCommits=10] - Maximum number of commits to scan.
 * @returns {Promise<Array<{ fromCommit: object, toCommit: object, changes: Array, summary: object }>>}
 */
async function scanRecentChanges(workspacePath, graph = null, maxCommits = 10) {
  if (!await isGitRepo(workspacePath)) {
    return [];
  }

  const repoRoot = await getRepoRoot(workspacePath);
  const results = [];

  // Get recent commits that touched relevant files
  const commits = await getRecentCommits(repoRoot, maxCommits + 1, [
    '*.tmdl', '*.json', '*.pbir',
  ]);

  if (commits.length < 2) return results;

  // Compare consecutive commit pairs
  for (let i = 0; i < commits.length - 1; i++) {
    const toCommit = commits[i];     // newer
    const fromCommit = commits[i + 1]; // older

    try {
      const changedFiles = await getChangedFiles(repoRoot, fromCommit.hash, toCommit.hash);

      // Filter to only relevant files
      const relevantChanged = changedFiles.filter(p => {
        const lower = p.toLowerCase();
        if (lower.includes('.pbi/')) return false;
        if (lower.includes('cache.abf')) return false;
        return lower.endsWith('.json') || lower.endsWith('.tmdl') || lower.endsWith('.pbir');
      });

      if (relevantChanged.length === 0) continue;

      // Build file maps for before and after states
      const [beforeFiles, afterFiles] = await Promise.all([
        buildFileMap(repoRoot, fromCommit.hash, relevantChanged),
        buildFileMap(repoRoot, toCommit.hash, relevantChanged),
      ]);

      // Run change detection
      const { changes, summary } = detectChanges(beforeFiles, afterFiles, graph);

      if (changes.length > 0) {
        results.push({
          fromCommit,
          toCommit,
          changes,
          summary,
        });
      }
    } catch (err) {
      console.warn(`Failed to scan commits ${fromCommit.hash}..${toCommit.hash}:`, err.message);
    }
  }

  return results;
}

/**
 * Get a flat list of all changes across recent commits, annotated with commit info.
 * @param {string} workspacePath
 * @param {object} [graph]
 * @param {number} [maxCommits]
 * @returns {Promise<Array<object>>}
 */
async function getAllRecentChanges(workspacePath, graph = null, maxCommits = 10) {
  const scanResults = await scanRecentChanges(workspacePath, graph, maxCommits);
  const allChanges = [];

  for (const result of scanResults) {
    for (const change of result.changes) {
      allChanges.push({
        ...change,
        commitHash: result.toCommit.hash.substring(0, 7),
        commitMessage: result.toCommit.message,
        commitDate: result.toCommit.date,
      });
    }
  }

  return allChanges;
}

/**
 * Get changes grouped by page.
 * @param {Array} changes - Flat list of changes from getAllRecentChanges.
 * @returns {Map<string, Array>} Map of pageName → changes
 */
function groupChangesByPage(changes) {
  const grouped = new Map();

  for (const change of changes) {
    const pageName = change.target?.pageName || change.target?.pageId || '_report';
    if (!grouped.has(pageName)) grouped.set(pageName, []);
    grouped.get(pageName).push(change);
  }

  return grouped;
}

/**
 * Get changes grouped by scope (page, visual, measure, report).
 * @param {Array} changes
 * @returns {Map<string, Array>}
 */
function groupChangesByScope(changes) {
  const grouped = new Map();

  for (const change of changes) {
    const scope = change.scope || 'other';
    if (!grouped.has(scope)) grouped.set(scope, []);
    grouped.get(scope).push(change);
  }

  return grouped;
}

module.exports = {
  scanRecentChanges,
  getAllRecentChanges,
  groupChangesByPage,
  groupChangesByScope,
};
