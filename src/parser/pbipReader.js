/**
 * PBIP Reader - Browser-specific file reading using the File System Access API.
 * Uses @pbip-lineage/core for project structure identification.
 */

import { identifyProjectStructure, findDefinitionPbir, parseSemanticModelReference, isRelevantFile } from '@pbip-lineage/core';

/**
 * Check if the File System Access API is available.
 */
export function hasFileSystemAccess() {
  return typeof window !== 'undefined' && !!window.showDirectoryPicker;
}

/**
 * Open a PBIP project root folder and auto-discover .Report + .SemanticModel subfolders.
 * Uses File System Access API on supported browsers, falls back to file input on others.
 * @returns {Promise<{reportName: string, reportStructure: object, semanticModelPath: string|null, modelName: string|null, modelStructure: object|null}>}
 */
export async function openProjectFolder() {
  if (!hasFileSystemAccess()) {
    // Fallback: use <input webkitdirectory> for Firefox/Safari
    return openProjectFromFileInput();
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

  if (reportEntries.length > 1) {
    return { multipleReports: reportEntries, modelCandidates };
  }

  return await loadSelectedReport(reportEntries[0].handle, modelCandidates);
}

/**
 * Handle the case where the user selected a .Report folder directly.
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
 */
async function handleDirectSemanticModelFolder(modelHandle) {
  throw new Error(
    'Please select the folder that contains your .Report and .SemanticModel folders, not the .SemanticModel folder directly.'
  );
}

/**
 * Load a specific report + resolve its linked semantic model.
 * @param {FileSystemDirectoryHandle} reportHandle
 * @param {Array<{name: string, handle: FileSystemDirectoryHandle}>} modelCandidates
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
 * Recursively walk a directory handle and collect file contents.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} [basePath='']
 * @returns {Promise<Map<string, string>>}
 */
export async function walkDirectory(dirHandle, basePath = '') {
  const files = new Map();

  for await (const [name, handle] of dirHandle.entries()) {
    const relativePath = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === 'directory') {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const subFiles = await walkDirectory(handle, relativePath);
      for (const [path, content] of subFiles) {
        files.set(path, content);
      }
    } else if (handle.kind === 'file') {
      if (isRelevantFile(name)) {
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

// --- Cross-browser fallback using <input webkitdirectory> ---

/**
 * Open project using a hidden <input webkitdirectory> file input.
 * Works in Firefox, Safari, and all Chromium browsers.
 * @returns {Promise<object>}
 */
function openProjectFromFileInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';

    input.addEventListener('change', async () => {
      try {
        if (!input.files || input.files.length === 0) {
          reject(new DOMException('No folder selected', 'AbortError'));
          return;
        }
        const result = await processFileList(input.files);
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        input.remove();
      }
    });

    input.addEventListener('cancel', () => {
      input.remove();
      reject(new DOMException('User cancelled', 'AbortError'));
    });

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Process a FileList from webkitdirectory input into project structure.
 * Files have webkitRelativePath like "MyProject/MyProject.Report/definition/pages/..."
 * @param {FileList} fileList
 * @returns {Promise<object>}
 */
async function processFileList(fileList) {
  // Read all relevant files into a map keyed by relative path
  const allFiles = new Map();
  const rootParts = new Set();

  for (const file of fileList) {
    const relPath = file.webkitRelativePath;
    if (!relPath) continue;

    // Track the root folder name
    const parts = relPath.split('/');
    if (parts.length > 0) rootParts.add(parts[0]);

    // Only read relevant extensions
    const fileName = parts[parts.length - 1];
    if (isRelevantFile(fileName)) {
      try {
        const content = await file.text();
        allFiles.set(relPath, content);
      } catch (err) {
        console.warn(`Failed to read file: ${relPath}`, err);
      }
    }
  }

  // Find .Report and .SemanticModel folders
  const reportFolders = [];
  const modelFolders = [];

  // Get all unique second-level folder names
  const secondLevel = new Set();
  for (const [path] of allFiles) {
    const parts = path.split('/');
    if (parts.length >= 2) secondLevel.add(parts[1]);
  }

  // Also check the root folder itself
  const rootName = [...rootParts][0] || '';

  for (const folderName of secondLevel) {
    const lower = folderName.toLowerCase();
    if (lower.endsWith('.report')) reportFolders.push(folderName);
    else if (lower.endsWith('.semanticmodel')) modelFolders.push(folderName);
  }

  // Also check if root is itself a .Report or .SemanticModel
  if (rootName.toLowerCase().endsWith('.report')) {
    return processAsReport(rootName, allFiles, rootName);
  }
  if (rootName.toLowerCase().endsWith('.semanticmodel')) {
    throw new Error('Please select the folder that contains your .Report and .SemanticModel folders.');
  }

  if (reportFolders.length === 0) {
    throw new Error(
      'No .Report folder found in the selected directory.\n' +
      'Please select the folder that contains your .Report and .SemanticModel subfolders.'
    );
  }

  // For now, use the first report and first model (multi-report picker could be added later)
  const reportFolder = reportFolders[0];
  const modelFolder = modelFolders[0] || null;

  // Extract report files (strip the root/reportFolder prefix)
  const reportPrefix = `${rootName}/${reportFolder}/`;
  const reportFiles = new Map();
  for (const [path, content] of allFiles) {
    if (path.startsWith(reportPrefix)) {
      reportFiles.set(path.slice(reportPrefix.length), content);
    }
  }
  const reportStructure = identifyProjectStructure(reportFiles);

  // Find semantic model reference
  const pbirPath = findDefinitionPbir(reportFiles);
  let semanticModelPath = null;
  if (pbirPath) {
    semanticModelPath = parseSemanticModelReference(reportFiles.get(pbirPath));
  }

  // Extract model files
  let modelStructure = null;
  let modelName = null;
  if (modelFolder) {
    const modelPrefix = `${rootName}/${modelFolder}/`;
    const modelFiles = new Map();
    for (const [path, content] of allFiles) {
      if (path.startsWith(modelPrefix)) {
        modelFiles.set(path.slice(modelPrefix.length), content);
      }
    }
    modelStructure = identifyProjectStructure(modelFiles);
    modelName = modelFolder;
  }

  return {
    reportName: reportFolder,
    reportStructure,
    semanticModelPath,
    modelName,
    modelStructure,
  };
}

/**
 * Process files when the root folder is itself a .Report folder.
 */
function processAsReport(reportName, allFiles, rootName) {
  const prefix = `${rootName}/`;
  const reportFiles = new Map();
  for (const [path, content] of allFiles) {
    if (path.startsWith(prefix)) {
      reportFiles.set(path.slice(prefix.length), content);
    }
  }
  const reportStructure = identifyProjectStructure(reportFiles);
  const pbirPath = findDefinitionPbir(reportFiles);
  let semanticModelPath = null;
  if (pbirPath) {
    semanticModelPath = parseSemanticModelReference(reportFiles.get(pbirPath));
  }
  return {
    reportName,
    reportStructure,
    semanticModelPath,
    modelName: null,
    modelStructure: null,
  };
}
