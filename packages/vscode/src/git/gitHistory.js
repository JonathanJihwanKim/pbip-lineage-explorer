/**
 * Git History — Runs git commands to access commit history and file contents.
 * Uses child_process.execFile for safe, non-shell git command execution.
 */

const { execFile } = require('child_process');

/**
 * Run a git command and return its stdout.
 * @param {string} cwd - Working directory.
 * @param {string[]} args - Git arguments.
 * @returns {Promise<string>}
 */
function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Get the list of recent commits that touched relevant files.
 * @param {string} cwd - Repo root.
 * @param {number} [limit=10] - Max commits to return.
 * @param {string[]} [paths] - Optional paths to filter by (e.g., ['*.tmdl', '*.json']).
 * @returns {Promise<Array<{ hash: string, message: string, date: string }>>}
 */
async function getRecentCommits(cwd, limit = 10, paths = []) {
  const args = ['log', `--max-count=${limit}`, '--format=%H|%s|%ai'];
  if (paths.length > 0) {
    args.push('--');
    args.push(...paths);
  }

  const output = await runGit(cwd, args);
  return output.trim().split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, message, date] = line.split('|');
      return { hash, message, date };
    });
}

/**
 * Get the list of files changed between two commits.
 * @param {string} cwd - Repo root.
 * @param {string} fromHash - Older commit.
 * @param {string} toHash - Newer commit.
 * @returns {Promise<string[]>} Array of changed file paths (repo-relative).
 */
async function getChangedFiles(cwd, fromHash, toHash) {
  const output = await runGit(cwd, ['diff', '--name-only', fromHash, toHash]);
  return output.trim().split('\n').filter(Boolean);
}

/**
 * Get the content of a file at a specific commit.
 * @param {string} cwd - Repo root.
 * @param {string} hash - Commit hash.
 * @param {string} filePath - File path relative to repo root.
 * @returns {Promise<string|null>} File content, or null if file doesn't exist at that commit.
 */
async function getFileAtCommit(cwd, hash, filePath) {
  try {
    return await runGit(cwd, ['show', `${hash}:${filePath}`]);
  } catch {
    return null; // File doesn't exist at this commit
  }
}

/**
 * Build a file map (Map<path, content>) for a set of files at a specific commit.
 * Only includes files with relevant extensions (.json, .tmdl, .pbir).
 * @param {string} cwd - Repo root.
 * @param {string} hash - Commit hash.
 * @param {string[]} filePaths - Files to load.
 * @returns {Promise<Map<string, string>>}
 */
async function buildFileMap(cwd, hash, filePaths) {
  const map = new Map();
  const relevantExts = ['.json', '.tmdl', '.pbir'];

  const relevantFiles = filePaths.filter(p => {
    const lower = p.toLowerCase();
    // Skip cache files and local settings
    if (lower.includes('.pbi/')) return false;
    if (lower.includes('cache.abf')) return false;
    return relevantExts.some(ext => lower.endsWith(ext));
  });

  // Load files in parallel batches of 20
  for (let i = 0; i < relevantFiles.length; i += 20) {
    const batch = relevantFiles.slice(i, i + 20);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const content = await getFileAtCommit(cwd, hash, filePath);
        return { filePath, content };
      })
    );

    for (const { filePath, content } of results) {
      if (content !== null) {
        map.set(filePath, content);
      }
    }
  }

  return map;
}

/**
 * Check if the current workspace directory is a git repository.
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
async function isGitRepo(cwd) {
  try {
    await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the git repository root directory.
 * @param {string} cwd
 * @returns {Promise<string>}
 */
async function getRepoRoot(cwd) {
  const output = await runGit(cwd, ['rev-parse', '--show-toplevel']);
  return output.trim();
}

module.exports = {
  getRecentCommits,
  getChangedFiles,
  getFileAtCommit,
  buildFileMap,
  isGitRepo,
  getRepoRoot,
};
