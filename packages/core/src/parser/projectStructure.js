/**
 * Project Structure Identifier - Pure functions for categorizing PBIP project files.
 * Browser-independent: works with any Map<string, string> of file paths to contents.
 */

export const RELEVANT_EXTENSIONS = new Set(['.tmdl', '.json', '.pbir', '.platform']);

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

/**
 * Find the definition.pbir file in the file map.
 * @param {Map<string, string>} files
 * @returns {string|null} The path to definition.pbir, or null.
 */
export function findDefinitionPbir(files) {
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
export function parseSemanticModelReference(content) {
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
 * Check if a file extension is relevant for PBIP parsing.
 * @param {string} filename
 * @returns {boolean}
 */
export function isRelevantFile(filename) {
  const ext = filename.includes('.') ? '.' + filename.split('.').pop().toLowerCase() : '';
  return RELEVANT_EXTENSIONS.has(ext);
}
