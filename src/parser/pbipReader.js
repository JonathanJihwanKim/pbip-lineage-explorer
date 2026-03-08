/**
 * PBIP Reader - Uses the File System Access API to read PBIP project files.
 * Supports a two-phase flow: first select a .Report folder, then optionally
 * select the linked semantic model folder.
 */

const RELEVANT_EXTENSIONS = new Set(['.tmdl', '.json', '.pbir', '.platform']);

/**
 * Phase 1: Open a .Report folder and read its contents.
 * Parses definition.pbir to discover the linked semantic model path.
 * @returns {Promise<{reportName: string, reportStructure: object, semanticModelPath: string|null}>}
 */
export async function openReportFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser. Please use a Chromium-based browser.');
  }

  const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  const files = await walkDirectory(dirHandle, '');
  const reportStructure = identifyProjectStructure(files);

  // Find and parse definition.pbir for the semantic model reference
  const pbirPath = findDefinitionPbir(files);
  let semanticModelPath = null;
  if (pbirPath) {
    const pbirContent = files.get(pbirPath);
    semanticModelPath = parseSemanticModelReference(pbirContent);
  }

  return {
    reportName: dirHandle.name,
    reportStructure,
    semanticModelPath,
  };
}

/**
 * Phase 2: Open a semantic model folder and read its TMDL files.
 * @returns {Promise<{modelName: string, modelStructure: object}>}
 */
export async function openSemanticModelFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser. Please use a Chromium-based browser.');
  }

  const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  const files = await walkDirectory(dirHandle, '');
  const modelStructure = identifyProjectStructure(files);

  return {
    modelName: dirHandle.name,
    modelStructure,
  };
}

/**
 * Find the definition.pbir file in the file map.
 * @param {Map<string, string>} files
 * @returns {string|null} The path to definition.pbir, or null.
 */
function findDefinitionPbir(files) {
  for (const [path] of files) {
    if (path.toLowerCase() === 'definition.pbir' ||
        path.toLowerCase().endsWith('/definition.pbir')) {
      return path;
    }
  }
  return null;
}

/**
 * Parse the semantic model reference from definition.pbir content.
 * @param {string} content - The JSON content of definition.pbir.
 * @returns {string|null} The relative path to the semantic model, or null.
 */
function parseSemanticModelReference(content) {
  try {
    const config = JSON.parse(content);
    const byPath = config?.datasetReference?.byPath?.path;
    if (byPath) return byPath;
    return null;
  } catch {
    return null;
  }
}

/**
 * Recursively walk a directory handle and collect file contents.
 * @param {FileSystemDirectoryHandle} dirHandle - The directory to walk.
 * @param {string} [basePath=''] - Current path prefix for relative paths.
 * @returns {Promise<Map<string, string>>} Map of relative path -> file content.
 */
export async function walkDirectory(dirHandle, basePath = '') {
  const files = new Map();

  for await (const [name, handle] of dirHandle.entries()) {
    const relativePath = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === 'directory') {
      // Skip hidden directories and common non-relevant folders
      if (name.startsWith('.') || name === 'node_modules') continue;
      const subFiles = await walkDirectory(handle, relativePath);
      for (const [path, content] of subFiles) {
        files.set(path, content);
      }
    } else if (handle.kind === 'file') {
      const ext = name.includes('.') ? '.' + name.split('.').pop().toLowerCase() : '';
      if (RELEVANT_EXTENSIONS.has(ext)) {
        try {
          const file = await handle.getFile();
          const content = await file.text();
          files.set(relativePath, content);
        } catch (err) {
          console.warn(`Failed to read file: ${relativePath}`, err);
        }
      }
    }
  }

  return files;
}

/**
 * Identify the project type and categorize files.
 * @param {Map<string, string>} files - Map of relative paths to contents.
 * @returns {{ tmdlFiles: Array, visualFiles: Array, pageFiles: Array, relationshipFiles: Array }}
 */
export function identifyProjectStructure(files) {
  const tmdlFiles = [];
  const visualFiles = [];
  const pageFiles = [];
  const relationshipFiles = [];

  for (const [path, content] of files) {
    const lowerPath = path.toLowerCase();

    if (lowerPath.endsWith('.tmdl')) {
      // Relationship files are typically named relationships.tmdl or in a relationships folder
      if (lowerPath.includes('relationship')) {
        relationshipFiles.push({ path, content });
      } else {
        tmdlFiles.push({ path, content });
      }
    } else if (lowerPath.endsWith('.json')) {
      // Visual config files are typically under report/*/visuals/*/visual.json
      if (lowerPath.includes('/visuals/') && lowerPath.endsWith('visual.json')) {
        visualFiles.push({ path, content });
      }
      // Page files: page.json inside report page folders
      else if (lowerPath.endsWith('/page.json') || (lowerPath.includes('/pages/') && lowerPath.endsWith('.json'))) {
        pageFiles.push({ path, content });
      }
      // Also check for report.json or definition files that describe pages
      else if (lowerPath.endsWith('/report.json') || lowerPath.endsWith('/definition.pbir')) {
        pageFiles.push({ path, content });
      }
    } else if (lowerPath.endsWith('.pbir')) {
      pageFiles.push({ path, content });
    }
  }

  return { tmdlFiles, visualFiles, pageFiles, relationshipFiles };
}
