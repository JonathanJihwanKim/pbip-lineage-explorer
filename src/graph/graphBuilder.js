/**
 * Graph Builder - Constructs the lineage graph data structure.
 * Takes parsed model and report data and produces a node/edge graph
 * suitable for rendering with D3.js.
 */

import { NODE_TYPES, EDGE_TYPES } from '../utils/constants.js';

/**
 * Create a graph node.
 * @param {string} id - Unique node identifier.
 * @param {string} name - Display name.
 * @param {string} type - Node type (from NODE_TYPES).
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {GraphNode}
 */
export function createNode(id, name, type, metadata = {}) {
  return { id, name, type, metadata, enrichment: null };
}

/**
 * Create a graph edge.
 * @param {string} sourceId - Source node ID.
 * @param {string} targetId - Target node ID.
 * @param {string} type - Edge type (from EDGE_TYPES).
 * @returns {GraphEdge}
 */
export function createEdge(sourceId, targetId, type) {
  return { source: sourceId, target: targetId, type };
}

/**
 * Extract column/measure references from a DAX expression.
 * Looks for patterns like [MeasureName] and 'TableName'[ColumnName].
 * @param {string} expression - DAX expression string.
 * @param {string} currentTable - The table containing this measure.
 * @param {Map<string, object>} allNodes - All nodes created so far.
 * @returns {Array<string>} Array of referenced node IDs.
 */
function extractDaxReferences(expression, currentTable, allNodes) {
  if (!expression) return [];

  const refs = [];

  // Match 'TableName'[ColumnOrMeasure] or TableName[ColumnOrMeasure]
  const qualifiedPattern = /'?([^'[\]]+)'?\[([^\]]+)\]/g;
  let match;
  while ((match = qualifiedPattern.exec(expression)) !== null) {
    const table = match[1].trim();
    const field = match[2].trim();
    // Could be a column or measure
    const colId = `column::${table}.${field}`;
    const measureId = `measure::${table}.${field}`;
    if (allNodes.has(measureId)) {
      refs.push(measureId);
    } else if (allNodes.has(colId)) {
      refs.push(colId);
    }
  }

  // Match unqualified [FieldName] (refers to same table)
  const unqualifiedPattern = /(?<!'[^']*)\[([^\]]+)\]/g;
  while ((match = unqualifiedPattern.exec(expression)) !== null) {
    const field = match[1].trim();
    // Skip if already captured by qualified pattern
    const measureId = `measure::${currentTable}.${field}`;
    const colId = `column::${currentTable}.${field}`;
    if (allNodes.has(measureId) && !refs.includes(measureId)) {
      refs.push(measureId);
    } else if (allNodes.has(colId) && !refs.includes(colId)) {
      refs.push(colId);
    }
  }

  return refs;
}

/**
 * Build adjacency lists from edges.
 * @param {Array} edges - Graph edges.
 * @returns {{ upstream: Map<string, string[]>, downstream: Map<string, string[]> }}
 */
function buildAdjacency(edges) {
  const upstream = new Map();
  const downstream = new Map();

  for (const edge of edges) {
    // source depends on target for most edge types,
    // but semantically: source -> target means source references target
    // upstream of source includes target; downstream of target includes source
    if (!upstream.has(edge.source)) upstream.set(edge.source, []);
    upstream.get(edge.source).push(edge.target);

    if (!downstream.has(edge.target)) downstream.set(edge.target, []);
    downstream.get(edge.target).push(edge.source);
  }

  return { upstream, downstream };
}

/**
 * Build the complete lineage graph from parsed data.
 * @param {{ tables: Array, relationships: Array }} parsedModel - Parsed TMDL model.
 * @param {{ pages: Array, visuals: Array }} parsedReport - Parsed PBIR report.
 * @param {{ fieldParameters: Array, calculationGroups: Array }} [enrichments] - Optional enrichments.
 * @returns {{ nodes: Map<string, object>, edges: Array, adjacency: object, stats: object }}
 */
export function buildGraph(parsedModel, parsedReport, enrichments) {
  const nodes = new Map();
  const edges = [];

  // --- Create table, column, and measure nodes ---
  if (parsedModel && parsedModel.tables) {
    for (const table of parsedModel.tables) {
      const tableId = `table::${table.name}`;
      nodes.set(tableId, createNode(tableId, table.name, NODE_TYPES.TABLE, { table: table.name }));

      if (table.columns) {
        for (const col of table.columns) {
          const colId = `column::${table.name}.${col.name}`;
          nodes.set(colId, createNode(colId, col.name, NODE_TYPES.COLUMN, {
            table: table.name,
            dataType: col.dataType,
            sourceColumn: col.sourceColumn,
            expression: col.expression
          }));
          // Column belongs to table
          edges.push(createEdge(colId, tableId, EDGE_TYPES.COLUMN_TO_TABLE));
        }
      }

      if (table.measures) {
        for (const measure of table.measures) {
          const measureId = `measure::${table.name}.${measure.name}`;
          nodes.set(measureId, createNode(measureId, measure.name, NODE_TYPES.MEASURE, {
            table: table.name,
            expression: measure.expression
          }));
        }
      }
    }

    // --- Parse DAX references for measures (second pass, after all nodes exist) ---
    for (const table of parsedModel.tables) {
      if (table.measures) {
        for (const measure of table.measures) {
          const measureId = `measure::${table.name}.${measure.name}`;
          const refs = extractDaxReferences(measure.expression, table.name, nodes);
          for (const refId of refs) {
            if (refId === measureId) continue; // skip self-reference
            const refNode = nodes.get(refId);
            if (refNode) {
              const edgeType = refNode.type === NODE_TYPES.MEASURE
                ? EDGE_TYPES.MEASURE_TO_MEASURE
                : EDGE_TYPES.MEASURE_TO_COLUMN;
              edges.push(createEdge(measureId, refId, edgeType));
            }
          }
        }
      }

      // Also parse calculated column expressions
      if (table.columns) {
        for (const col of table.columns) {
          if (col.expression) {
            const colId = `column::${table.name}.${col.name}`;
            const refs = extractDaxReferences(col.expression, table.name, nodes);
            for (const refId of refs) {
              if (refId === colId) continue;
              if (nodes.has(refId)) {
                edges.push(createEdge(colId, refId, EDGE_TYPES.MEASURE_TO_COLUMN));
              }
            }
          }
        }
      }
    }

    // --- Table relationships ---
    if (parsedModel.relationships) {
      for (const rel of parsedModel.relationships) {
        const fromTable = `table::${rel.fromTable}`;
        const toTable = `table::${rel.toTable}`;
        if (nodes.has(fromTable) && nodes.has(toTable)) {
          edges.push(createEdge(fromTable, toTable, EDGE_TYPES.TABLE_RELATIONSHIP));
        }
      }
    }
  }

  // --- Create page and visual nodes ---
  if (parsedReport) {
    if (parsedReport.pages) {
      for (const page of parsedReport.pages) {
        const pageId = `page::${page.id}`;
        nodes.set(pageId, createNode(pageId, page.name, NODE_TYPES.PAGE, { pageId: page.id }));
      }
    }

    if (parsedReport.visuals) {
      for (const visual of parsedReport.visuals) {
        const visualId = `visual::${visual.pageId}/${visual.id}`;
        nodes.set(visualId, createNode(visualId, visual.title || visual.visualType, NODE_TYPES.VISUAL, {
          visualType: visual.visualType,
          pageId: visual.pageId
        }));

        // Visual belongs to page
        const pageId = `page::${visual.pageId}`;
        if (nodes.has(pageId)) {
          edges.push(createEdge(visualId, pageId, EDGE_TYPES.VISUAL_TO_PAGE));
        }

        // Visual references fields
        if (visual.fields) {
          for (const field of visual.fields) {
            let fieldId;
            if (field.type === 'measure' && field.table && field.measure) {
              fieldId = `measure::${field.table}.${field.measure}`;
            } else if (field.table && field.column) {
              fieldId = `column::${field.table}.${field.column}`;
            }
            if (fieldId && nodes.has(fieldId)) {
              edges.push(createEdge(visualId, fieldId, EDGE_TYPES.VISUAL_TO_FIELD));
            }
          }
        }
      }
    }
  }

  // --- Apply enrichments ---
  if (enrichments) {
    if (enrichments.fieldParameters) {
      for (const fp of enrichments.fieldParameters) {
        const nodeId = `column::${fp.table}.${fp.column}`;
        const node = nodes.get(nodeId);
        if (node) {
          node.enrichment = { type: 'field_parameter', data: fp };
        }
      }
    }
    if (enrichments.calculationGroups) {
      for (const cg of enrichments.calculationGroups) {
        const nodeId = `table::${cg.table}`;
        const node = nodes.get(nodeId);
        if (node) {
          node.enrichment = { type: 'calculation_group', data: cg };
        }
      }
    }
  }

  const adjacency = buildAdjacency(edges);
  const graph = { nodes, edges, adjacency };
  graph.stats = computeStats(graph);

  return graph;
}

/**
 * Compute graph statistics.
 * @param {{ nodes: Map, edges: Array }} graph
 * @returns {{ tables: number, columns: number, measures: number, visuals: number, pages: number, edges: number, orphanedMeasures: number }}
 */
export function computeStats(graph) {
  const counts = { tables: 0, columns: 0, measures: 0, visuals: 0, pages: 0 };

  for (const node of graph.nodes.values()) {
    switch (node.type) {
      case NODE_TYPES.TABLE: counts.tables++; break;
      case NODE_TYPES.COLUMN: counts.columns++; break;
      case NODE_TYPES.MEASURE: counts.measures++; break;
      case NODE_TYPES.VISUAL: counts.visuals++; break;
      case NODE_TYPES.PAGE: counts.pages++; break;
    }
  }

  // Orphaned measures: measures with no downstream path to a visual
  let orphanedMeasures = 0;
  const downstream = graph.adjacency ? graph.adjacency.downstream : new Map();
  for (const node of graph.nodes.values()) {
    if (node.type === NODE_TYPES.MEASURE) {
      if (!downstream.has(node.id) || downstream.get(node.id).length === 0) {
        orphanedMeasures++;
      }
    }
  }

  return {
    tables: counts.tables,
    columns: counts.columns,
    measures: counts.measures,
    visuals: counts.visuals,
    pages: counts.pages,
    edges: graph.edges.length,
    orphanedMeasures
  };
}
