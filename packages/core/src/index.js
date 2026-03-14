/**
 * @pbip-lineage/core - Core lineage analysis engine for Power BI PBIP projects.
 *
 * Platform-independent: works in Node.js, VS Code, and browsers.
 * Provide a Map<string, string> of file paths to contents, and get back
 * a fully-traced lineage graph.
 */

// Parsers
import { parseTmdlModel, parseExpressions, extractMDataSource, extractRenameColumns } from './parser/tmdlParser.js';
import { parseDaxExpression, extractColumnRefs, extractMeasureRefs, extractTableRefs, extractUseRelationshipRefs } from './parser/daxParser.js';
import { parsePbirReport } from './parser/pbirParser.js';
import { detectEnrichments, applyEnrichments } from './parser/enrichment.js';
import { identifyProjectStructure, findDefinitionPbir, parseSemanticModelReference, isRelevantFile, RELEVANT_EXTENSIONS } from './parser/projectStructure.js';

// Graph
import { buildGraph, computeStats, createNode, createEdge, buildAdjacency } from './graph/graphBuilder.js';
import { traceMeasureLineage, traceVisualLineage } from './graph/lineageTracer.js';
import { analyzeImpact, findOrphans, exportImpactReport } from './graph/impactAnalysis.js';

// Constants
import { NODE_TYPES, EDGE_TYPES, LAYER_COLORS, ENRICHMENT_TYPES } from './utils/constants.js';

// Re-export everything
export {
  // Parsers
  parseTmdlModel, parseExpressions, extractMDataSource, extractRenameColumns,
  parseDaxExpression, extractColumnRefs, extractMeasureRefs, extractTableRefs, extractUseRelationshipRefs,
  parsePbirReport,
  detectEnrichments, applyEnrichments,
  identifyProjectStructure, findDefinitionPbir, parseSemanticModelReference, isRelevantFile, RELEVANT_EXTENSIONS,
  // Graph
  buildGraph, computeStats, createNode, createEdge, buildAdjacency,
  traceMeasureLineage, traceVisualLineage,
  analyzeImpact, findOrphans, exportImpactReport,
  // Constants
  NODE_TYPES, EDGE_TYPES, LAYER_COLORS, ENRICHMENT_TYPES,
};

/**
 * Analyze a PBIP project from pre-parsed file structures.
 * This is the main high-level API that runs the full pipeline:
 * parse model -> parse DAX -> parse report -> detect enrichments -> build graph.
 *
 * @param {object} options
 * @param {object} options.modelStructure - Output of identifyProjectStructure() for the semantic model folder.
 * @param {object} [options.reportStructure] - Output of identifyProjectStructure() for the report folder.
 * @returns {{ graph: object, stats: object, enrichments: object, model: object, report: object }}
 */
export function analyze({ modelStructure, reportStructure }) {
  // Step 1: Parse TMDL model
  const tmdlFiles = modelStructure?.tmdlFiles || [];
  const relationshipFiles = modelStructure?.relationshipFiles || [];
  const expressionFiles = modelStructure?.expressionFiles || [];
  const model = parseTmdlModel(tmdlFiles, relationshipFiles);

  // Step 2: Parse expressions
  const parsedExpressions = { expressions: [], parameters: new Map() };
  for (const { content } of expressionFiles) {
    const result = parseExpressions(content);
    parsedExpressions.expressions.push(...result.expressions);
    for (const [k, v] of result.parameters) parsedExpressions.parameters.set(k, v);
  }
  model.expressions = parsedExpressions.expressions;
  model.parameters = parsedExpressions.parameters;

  // Step 3: Parse DAX for measures and calculated columns
  for (const table of model.tables) {
    for (const measure of (table.measures || [])) {
      if (measure.expression) measure.daxDeps = parseDaxExpression(measure.expression);
    }
    for (const col of (table.calculatedColumns || [])) {
      if (col.expression) col.daxDeps = parseDaxExpression(col.expression);
    }
  }

  // Step 4: Parse report (if provided)
  const report = reportStructure
    ? parsePbirReport(reportStructure.visualFiles || [], reportStructure.pageFiles || [])
    : { visuals: [], pages: [] };

  // Step 5: Detect and apply enrichments
  const enrichments = detectEnrichments(model.tables);
  let graph = buildGraph(model, report, enrichments);
  graph = applyEnrichments(graph, enrichments);

  // Step 6: Compute stats
  const stats = computeStats(graph);

  return { graph, stats, enrichments, model, report };
}

/**
 * Analyze a PBIP project from raw file maps.
 * Convenience wrapper that handles identifyProjectStructure internally.
 *
 * @param {object} options
 * @param {Map<string, string>} options.modelFiles - Map of relative path -> content for the semantic model folder.
 * @param {Map<string, string>} [options.reportFiles] - Map of relative path -> content for the report folder.
 * @returns {{ graph: object, stats: object, enrichments: object, model: object, report: object }}
 */
export function analyzeFromFiles({ modelFiles, reportFiles }) {
  const modelStructure = identifyProjectStructure(modelFiles);
  const reportStructure = reportFiles ? identifyProjectStructure(reportFiles) : null;
  return analyze({ modelStructure, reportStructure });
}
