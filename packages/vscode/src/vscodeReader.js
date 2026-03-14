/**
 * VS Code File Reader - Reads PBIP project files using vscode.workspace.fs.
 * Implements the same file-reading pattern as the browser's walkDirectory,
 * producing Map<string, string> of relative paths to file contents.
 */

const vscode = require('vscode');
const { isRelevantFile, identifyProjectStructure, findDefinitionPbir, parseSemanticModelReference } = require('@pbip-lineage/core');

/**
 * Recursively walk a directory and collect relevant file contents.
 * @param {vscode.Uri} dirUri - The directory URI to walk.
 * @param {string} basePath - Current path prefix for relative paths.
 * @returns {Promise<Map<string, string>>}
 */
async function walkDirectory(dirUri, basePath = '') {
  const files = new Map();
  const entries = await vscode.workspace.fs.readDirectory(dirUri);

  for (const [name, type] of entries) {
    const childUri = vscode.Uri.joinPath(dirUri, name);
    const relativePath = basePath ? `${basePath}/${name}` : name;

    if (type === vscode.FileType.Directory) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const subFiles = await walkDirectory(childUri, relativePath);
      for (const [path, content] of subFiles) {
        files.set(path, content);
      }
    } else if (type === vscode.FileType.File) {
      if (isRelevantFile(name)) {
        try {
          const raw = await vscode.workspace.fs.readFile(childUri);
          const content = Buffer.from(raw).toString('utf-8');
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
 * Discover and load a PBIP project from the workspace.
 * Scans workspace folders for .Report and .SemanticModel directories.
 * @returns {Promise<{reportName: string|null, reportStructure: object|null, modelName: string|null, modelStructure: object|null, semanticModelPath: string|null}>}
 */
async function loadProjectFromWorkspace() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return { reportName: null, reportStructure: null, modelName: null, modelStructure: null, semanticModelPath: null };
  }

  // Search in each workspace folder for .Report and .SemanticModel dirs
  for (const folder of workspaceFolders) {
    const rootUri = folder.uri;
    const rootName = folder.name.toLowerCase();

    // Check if the workspace folder itself is a PBIP project root
    // or if it contains .Report/.SemanticModel subfolders
    let reportUri = null;
    let modelUri = null;
    let reportName = null;
    let modelName = null;

    // If the folder is a .Report or .SemanticModel directly
    if (rootName.endsWith('.report')) {
      reportUri = rootUri;
      reportName = folder.name;
    } else if (rootName.endsWith('.semanticmodel')) {
      modelUri = rootUri;
      modelName = folder.name;
    } else {
      // Scan for subfolders
      try {
        const entries = await vscode.workspace.fs.readDirectory(rootUri);
        for (const [name, type] of entries) {
          if (type !== vscode.FileType.Directory) continue;
          const lowerName = name.toLowerCase();
          if (lowerName.endsWith('.report') && !reportUri) {
            reportUri = vscode.Uri.joinPath(rootUri, name);
            reportName = name;
          } else if (lowerName.endsWith('.semanticmodel') && !modelUri) {
            modelUri = vscode.Uri.joinPath(rootUri, name);
            modelName = name;
          }
        }
      } catch {
        continue;
      }
    }

    // Load report structure
    let reportStructure = null;
    let semanticModelPath = null;
    if (reportUri) {
      const reportFiles = await walkDirectory(reportUri, '');
      reportStructure = identifyProjectStructure(reportFiles);
      const pbirPath = findDefinitionPbir(reportFiles);
      if (pbirPath) {
        semanticModelPath = parseSemanticModelReference(reportFiles.get(pbirPath));
      }
    }

    // Load model structure
    let modelStructure = null;
    if (modelUri) {
      const modelFiles = await walkDirectory(modelUri, '');
      modelStructure = identifyProjectStructure(modelFiles);
    }

    // If we found anything, return it
    if (reportStructure || modelStructure) {
      return { reportName, reportStructure, modelName, modelStructure, semanticModelPath };
    }
  }

  return { reportName: null, reportStructure: null, modelName: null, modelStructure: null, semanticModelPath: null };
}

module.exports = { walkDirectory, loadProjectFromWorkspace };
