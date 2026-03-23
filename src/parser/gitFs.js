/**
 * Git FS Adapter — Bridges the File System Access API to the fs interface
 * that isomorphic-git requires. Read-only adapter for accessing .git directory.
 */

/**
 * Create an fs adapter for isomorphic-git using a FileSystemDirectoryHandle.
 * @param {FileSystemDirectoryHandle} rootHandle - Handle to the repo root directory.
 * @returns {object} An fs-compatible object for isomorphic-git.
 */
export function createGitFs(rootHandle) {
  // Cache directory handles to avoid repeated traversal
  const handleCache = new Map();

  /**
   * Navigate to a directory handle given a path relative to root.
   * @param {string} dirPath
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async function getDirectoryHandle(dirPath) {
    if (!dirPath || dirPath === '/' || dirPath === '.') return rootHandle;

    if (handleCache.has(dirPath)) return handleCache.get(dirPath);

    const parts = dirPath.split('/').filter(Boolean);
    let current = rootHandle;

    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    handleCache.set(dirPath, current);
    return current;
  }

  /**
   * Get a file handle at the given path.
   * @param {string} filePath
   * @returns {Promise<FileSystemFileHandle>}
   */
  async function getFileHandle(filePath) {
    const parts = filePath.split('/').filter(Boolean);
    const fileName = parts.pop();
    const dirPath = parts.join('/');
    const dirHandle = await getDirectoryHandle(dirPath);
    return dirHandle.getFileHandle(fileName);
  }

  /**
   * Normalize path — strip leading slash, handle '.' or empty.
   */
  function normalizePath(filepath) {
    if (!filepath) return '';
    // isomorphic-git uses the dir param as prefix, strip leading slashes
    let p = filepath.replace(/\\/g, '/');
    p = p.replace(/^\/+/, '');
    if (p === '.') return '';
    return p;
  }

  const promises = {
    async readFile(filepath, opts) {
      const p = normalizePath(filepath);
      try {
        const fh = await getFileHandle(p);
        const file = await fh.getFile();

        if (opts?.encoding === 'utf8' || opts?.encoding === 'utf-8') {
          return await file.text();
        }
        const buffer = await file.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (err) {
        const error = new Error(`ENOENT: no such file '${p}'`);
        error.code = 'ENOENT';
        throw error;
      }
    },

    async readdir(filepath) {
      const p = normalizePath(filepath);
      try {
        const dirHandle = await getDirectoryHandle(p);
        const entries = [];
        for await (const [name] of dirHandle.entries()) {
          entries.push(name);
        }
        return entries;
      } catch (err) {
        const error = new Error(`ENOENT: no such directory '${p}'`);
        error.code = 'ENOENT';
        throw error;
      }
    },

    async stat(filepath) {
      const p = normalizePath(filepath);
      return statPath(p);
    },

    async lstat(filepath) {
      const p = normalizePath(filepath);
      return statPath(p);
    },

    // Write operations — read-only adapter, stub them
    async writeFile() { throw new Error('Read-only filesystem'); },
    async mkdir() { throw new Error('Read-only filesystem'); },
    async rmdir() { throw new Error('Read-only filesystem'); },
    async unlink() { throw new Error('Read-only filesystem'); },
    async symlink() { throw new Error('Read-only filesystem'); },
    async readlink() { throw readlinkError(); },
    async chmod() { /* no-op */ },
  };

  async function statPath(p) {
    if (!p) {
      return createStat('dir', 0);
    }

    // Try as directory first
    try {
      await getDirectoryHandle(p);
      return createStat('dir', 0);
    } catch { /* not a directory */ }

    // Try as file
    try {
      const fh = await getFileHandle(p);
      const file = await fh.getFile();
      return createStat('file', file.size);
    } catch {
      const error = new Error(`ENOENT: no such file or directory '${p}'`);
      error.code = 'ENOENT';
      throw error;
    }
  }

  function createStat(type, size) {
    return {
      type,
      size,
      isFile: () => type === 'file',
      isDirectory: () => type === 'dir',
      isSymbolicLink: () => false,
      mode: type === 'file' ? 0o100644 : 0o040000,
      mtimeMs: Date.now(),
    };
  }

  function readlinkError() {
    const err = new Error('ENOENT: readlink not supported');
    err.code = 'ENOENT';
    return err;
  }

  return { promises };
}

/**
 * Check if a .git directory exists in the given directory handle.
 * @param {FileSystemDirectoryHandle} rootHandle
 * @returns {Promise<boolean>}
 */
export async function hasGitDirectory(rootHandle) {
  try {
    await rootHandle.getDirectoryHandle('.git');
    return true;
  } catch {
    return false;
  }
}
