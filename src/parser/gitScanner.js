/**
 * Git Scanner — Scans recent git commits for PBIR/TMDL changes using isomorphic-git.
 * Works entirely in the browser via the File System Access API.
 */

// isomorphic-git assumes Buffer is globally available (Node.js).
// Polyfill it for the browser before importing isomorphic-git.
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

import git from 'isomorphic-git';
import { createGitFs, hasGitDirectory } from './gitFs.js';
import { detectChanges } from '@pbip-lineage/core';

const RELEVANT_EXTENSIONS = ['.json', '.tmdl', '.pbir'];

/**
 * Scan recent commits and detect all changes.
 * @param {FileSystemDirectoryHandle} rootHandle - Handle to the repo root.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} [graph] - Lineage graph for impact resolution.
 * @param {number} [maxCommits=10] - Maximum commits to scan.
 * @returns {Promise<{ scanResults: Array, flatChanges: Array, measureChangeCounts: Map }>}
 */
export async function scanGitHistory(rootHandle, graph = null, maxCommits = 10) {
  if (!await hasGitDirectory(rootHandle)) {
    return { scanResults: [], flatChanges: [], measureChangeCounts: new Map() };
  }

  const fs = createGitFs(rootHandle);
  const dir = '/';
  const scanResults = [];

  try {
    // Get recent commits
    const commits = await git.log({ fs, dir, depth: maxCommits + 1 });

    if (commits.length < 2) {
      return { scanResults: [], flatChanges: [], measureChangeCounts: new Map() };
    }

    // Compare consecutive commit pairs
    for (let i = 0; i < commits.length - 1; i++) {
      const toCommit = commits[i];
      const fromCommit = commits[i + 1];

      try {
        // Get changed files between these two commits
        const changedFiles = await getChangedFilesBetween(fs, dir, fromCommit.oid, toCommit.oid);

        // Filter to relevant files only
        const relevantFiles = changedFiles.filter(f => {
          const lower = f.toLowerCase();
          if (lower.includes('.pbi/')) return false;
          if (lower.includes('cache.abf')) return false;
          return RELEVANT_EXTENSIONS.some(ext => lower.endsWith(ext));
        });

        if (relevantFiles.length === 0) continue;

        // Build before/after file maps
        const [beforeFiles, afterFiles] = await Promise.all([
          buildFileMapFromCommit(fs, dir, fromCommit.oid, relevantFiles),
          buildFileMapFromCommit(fs, dir, toCommit.oid, relevantFiles),
        ]);
        // Run change detection
        const { changes, summary } = detectChanges(beforeFiles, afterFiles, graph);

        if (changes.length > 0) {
          scanResults.push({
            fromCommit: {
              hash: fromCommit.oid,
              message: fromCommit.commit.message.split('\n')[0],
              date: new Date(fromCommit.commit.committer.timestamp * 1000).toISOString(),
            },
            toCommit: {
              hash: toCommit.oid,
              message: toCommit.commit.message.split('\n')[0],
              date: new Date(toCommit.commit.committer.timestamp * 1000).toISOString(),
            },
            changes,
            summary,
          });
        }
      } catch (err) {
        console.warn(`Failed to compare commits ${fromCommit.oid.substring(0, 7)}..${toCommit.oid.substring(0, 7)}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('Git history scan failed:', err.message);
  }

  // Build flat change list and measure change counts
  const flatChanges = [];
  const measureChangeCounts = new Map();

  for (const result of scanResults) {
    for (const change of result.changes) {
      flatChanges.push({
        ...change,
        commitHash: result.toCommit.hash.substring(0, 7),
        commitMessage: result.toCommit.message,
        commitDate: result.toCommit.date,
      });

      // Track per-measure change counts
      if (change.target?.measureName) {
        const key = change.target.measureName;
        measureChangeCounts.set(key, (measureChangeCounts.get(key) || 0) + 1);
      }
    }
  }

  return { scanResults, flatChanges, measureChangeCounts };
}

/**
 * Get list of changed files between two commits by comparing their trees.
 */
async function getChangedFilesBetween(fs, dir, fromOid, toOid) {
  const changedFiles = [];

  try {
    await git.walk({
      fs, dir,
      trees: [git.TREE({ ref: fromOid }), git.TREE({ ref: toOid })],
      map: async (filepath, [A, B]) => {
        if (filepath === '.') return;

        // Skip non-relevant files early
        const lower = filepath.toLowerCase();
        if (!RELEVANT_EXTENSIONS.some(ext => lower.endsWith(ext))) return;
        if (lower.includes('.pbi/')) return;

        const typeA = A ? await A.type() : null;
        const typeB = B ? await B.type() : null;

        // Only compare files (not directories)
        if (typeA === 'blob' || typeB === 'blob') {
          const oidA = A ? await A.oid() : null;
          const oidB = B ? await B.oid() : null;

          if (oidA !== oidB) {
            changedFiles.push(filepath);
          }
        }
      },
    });
  } catch (err) {
    console.warn('Failed to walk trees:', err.message);
  }

  return changedFiles;
}

/**
 * Build a file map from a specific commit.
 * @param {object} fs - Git fs adapter.
 * @param {string} dir - Repo root.
 * @param {string} oid - Commit hash.
 * @param {string[]} filePaths - Files to read.
 * @returns {Promise<Map<string, string>>}
 */
async function buildFileMapFromCommit(fs, dir, oid, filePaths) {
  const fileMap = new Map();

  for (const filepath of filePaths) {
    try {
      const { blob } = await git.readBlob({ fs, dir, oid, filepath });
      const content = new TextDecoder().decode(blob);
      fileMap.set(filepath, content);
    } catch {
      // File doesn't exist at this commit — skip
    }
  }

  return fileMap;
}
