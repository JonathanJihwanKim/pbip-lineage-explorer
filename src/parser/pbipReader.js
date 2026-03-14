/**
 * PBIP Reader - Uses the File System Access API to read PBIP project files.
 * Primary flow: select the PBIP project root folder, auto-discover .Report
 * and .SemanticModel subfolders.
 */

const RELEVANT_EXTENSIONS = new Set(['.tmdl', '.json', '.pbir', '.platform']);

/**
 * Open a PBIP project root folder and auto-discover .Report + .SemanticModel subfolders.
 * @returns {Promise<{reportName: string, reportStructure: object, semanticModelPath: string|null, modelName: string|null, modelStructure: object|null}>}
 */
export async function openProjectFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API is not supported in this browser. Please use a Chromium-based browser.');
  }

  const rootHandle = await window.showDirectoryPicker({ mode: 'read' });
  const rootName = rootHandle.name.toLowerCase();

  // Smart detection: did the user select a .Report or .SemanticModel folder directly?
  if (rootName.endsWith('.report')) {
    return await handleDirectReportFolder(rootHandle);
  }
  if (rootName.endsWith('.semanticmodel')) {
    return await handleDirectSemanticModelFolder(rootHandle);
  }

  // Default: treat as project root — discover .Report and .SemanticModel subfolders
  return await handleProjectRoot(rootHandle);
}

/**
 * Handle the case where the user selected the project root folder.
 * Scans for .Report and .SemanticModel subfolders.
 * If multiple .Report folders exist, returns them for the UI to show a picker.
 */
async function handleProjectRoot(rootHandle) {
  const reportEntries = [];
  const modelCandidates = [];

  for await (const [name, handle] of rootHandle.entries()) {
    if (handle.kind !== 'directory') continue;
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith('.report')) {
      reportEntries.push({ name, handle });
    } else if (lowerName.endsWith('.semanticmodel')) {
      modelCandidates.push({ name, handle });
    }
  }

  if (reportEntries.length === 0) {
    throw new Error(
      'No .Report folder found in the selected directory.\n' +
      'Please select the folder that contains your .Report and .SemanticModel subfolders.'
    );
  }

  // Multiple reports: return the list for the UI to show a picker
  if (reportEntries.length > 1) {
    return {
      multipleReports: reportEntries,
      modelCandidates,
    };
  }

  // Single report: load it directly
  return await loadSelectedReport(reportEntries[0].handle, modelCandidates);
}

/**
 * Handle the case where the user selected a .Report folder directly.
 * Loads report-only mode (no semantic model — browser cannot access sibling folders).
 */
async function handleDirectReportFolder(reportHandle) {
  const { reportStructure, semanticModelPath } = await readReportFolder(reportHandle);

  return {
    reportName: reportHandle.name,
    reportStructure,
    semanticModelPath,
    modelName: null,
    modelStructure: null,
  };
}

/**
 * Handle the case where the user selected a .SemanticModel folder directly.
 * Cannot proceed without a report, so throws a helpful error.
 */
async function handleDirectSemanticModelFolder(modelHandle) {
  throw new Error(
    'Please select the folder that contains your .Report and .SemanticModel folders, not the .SemanticModel folder directly.'
  );
}

/**
 * Load a specific report + resolve its linked semantic model.
 * Used after the user picks a report from the multi-report picker, or for single-report auto-load.
 * @param {FileSystemDirectoryHandle} reportHandle - The selected .Report folder handle.
 * @param {Array<{name: string, handle: FileSystemDirectoryHandle}>} modelCandidates - Available .SemanticModel folders.
 * @returns {Promise<{reportName: string, reportStructure: object, semanticModelPath: string|null, modelName: string|null, modelStructure: object|null}>}
 */
export async function loadSelectedReport(reportHandle, modelCandidates = []) {
  const { reportStructure, semanticModelPath } = await readReportFolder(reportHandle);

  const { modelStructure, modelName } = await resolveSemanticModel(
    modelCandidates, semanticModelPath
  );

  return {
    reportName: reportHandle.name,
    reportStructure,
    semanticModelPath,
    modelName,
    modelStructure,
  };
}

/**
 * Open a directory picker to load a semantic model folder.
 * @returns {Promise<{modelName: string, modelStructure: object}|null>} Parsed model, or null if cancelled.
 */
export async function loadSemanticModelFolder() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    const files = await walkDirectory(dirHandle, '');
    const modelStructure = identifyProjectStructure(files);
    return { modelName: dirHandle.name, modelStructure };
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * Read and parse a report folder's contents.
 */
async function readReportFolder(reportHandle) {
  const reportFiles = await walkDirectory(reportHandle, '');
  const reportStructure = identifyProjectStructure(reportFiles);

  const pbirPath = findDefinitionPbir(reportFiles);
  let semanticModelPath = null;
  if (pbirPath) {
    semanticModelPath = parseSemanticModelReference(reportFiles.get(pbirPath));
  }

  return { reportStructure, semanticModelPath };
}

/**
 * Resolve which .SemanticModel folder to use from candidates.
 */
async function resolveSemanticModel(modelCandidates, semanticModelPath) {
  let modelStructure = null;
  let modelName = null;

  if (modelCandidates.length > 0) {
    let matched = modelCandidates[0];

    if (semanticModelPath && modelCandidates.length > 1) {
      const hintName = semanticModelPath.replace(/^\.\.\//, '').replace(/\/$/, '').toLowerCase();
      const found = modelCandidates.find(c => c.name.toLowerCase() === hintName);
      if (found) matched = found;
    }

    const modelFiles = await walkDirectory(matched.handle, '');
    modelStructure = identifyProjectStructure(modelFiles);
    modelName = matched.name;
  }

  return { modelStructure, modelName };
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
 * @returns {{ tmdlFiles: Array, visualFiles: Array, pageFiles: Array, relationshipFiles: Array, expressionFiles: Array }}
 */
export function identifyProjectStructure(files) {
  const tmdlFiles = [];
  const visualFiles = [];
  const pageFiles = [];
  const relationshipFiles = [];
  const expressionFiles = [];

  for (const [path, content] of files) {
    const lowerPath = path.toLowerCase();

    if (lowerPath.endsWith('.tmdl')) {
      // Relationship files are typically named relationships.tmdl or in a relationships folder
      if (lowerPath.includes('relationship')) {
        relationshipFiles.push({ path, content });
      } else if (lowerPath.endsWith('/expressions.tmdl') || lowerPath === 'expressions.tmdl' ||
                 lowerPath.endsWith('\\expressions.tmdl')) {
        expressionFiles.push({ path, content });
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

  return { tmdlFiles, visualFiles, pageFiles, relationshipFiles, expressionFiles };
}
