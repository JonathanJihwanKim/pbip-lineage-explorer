/**
 * Graph Builder - Constructs the lineage graph data structure.
 * Takes parsed model and report data and produces a node/edge graph
 * suitable for rendering with D3.js.
 */

import { NODE_TYPES, EDGE_TYPES } from '../utils/constants.js';
import { extractMDataSource, extractRenameColumns, extractNestedJoins } from '../parser/tmdlParser.js';
import { extractUseRelationshipRefs } from '../parser/daxParser.js';

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

  // Match 'Table Name'[Field] (quoted) or TableName[Field] (bare identifier, no word-char/dot before it)
  const qualifiedPattern = /'([^']+)'\[([^\]]+)\]|(?<![\w.])(\w+(?:\s+\w+)*)\[([^\]]+)\]/g;
  let match;
  while ((match = qualifiedPattern.exec(expression)) !== null) {
    const table = (match[1] || match[3]).trim();
    const field = (match[2] || match[4]).trim();
    // Could be a column or measure
    const colId = `column::${table}.${field}`;
    const measureId = `measure::${table}.${field}`;
    if (allNodes.has(measureId)) {
      refs.push(measureId);
    } else if (allNodes.has(colId)) {
      refs.push(colId);
    }
  }

  // Match unqualified [FieldName] (refers to same table first, then any table)
  const unqualifiedPattern = /(?<![\w'])\[([^\]]+)\]/g;
  while ((match = unqualifiedPattern.exec(expression)) !== null) {
    const field = match[1].trim();
    // Skip if already captured by qualified pattern
    const measureId = `measure::${currentTable}.${field}`;
    const colId = `column::${currentTable}.${field}`;
    if (allNodes.has(measureId) && !refs.includes(measureId)) {
      refs.push(measureId);
    } else if (allNodes.has(colId) && !refs.includes(colId)) {
      refs.push(colId);
    } else {
      // Search ALL tables for matching measures (DAX allows cross-table unqualified refs).
      // Link every candidate — if a short name is ambiguous across tables, the user
      // should see the ambiguity in the lineage tree, not have branches silently dropped.
      let found = false;
      for (const [nodeId, node] of allNodes) {
        if (node.type === 'measure' && node.name === field && nodeId !== `measure::${currentTable}.${field}`) {
          if (!refs.includes(nodeId)) {
            refs.push(nodeId);
            found = true;
          }
        }
      }
      // If no measure found, search for column across tables
      if (!found) {
        for (const [nodeId, node] of allNodes) {
          if (node.type === 'column' && node.name === field && nodeId !== `column::${currentTable}.${field}`) {
            if (!refs.includes(nodeId)) {
              refs.push(nodeId);
            }
          }
        }
      }
    }
  }

  return refs;
}

/**
 * Build adjacency lists from edges.
 * @param {Array} edges - Graph edges.
 * @returns {{ upstream: Map<string, string[]>, downstream: Map<string, string[]> }}
 */
export function buildAdjacency(edges) {
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
            expression: col.expression,
            isHidden: col.isHidden || false
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
            expression: measure.expression,
            description: measure.description || '',
            isHidden: measure.isHidden || false
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

          // Extract USERELATIONSHIP references — both columns are part of lineage
          const urRefs = extractUseRelationshipRefs(measure.expression || '');
          for (const ur of urRefs) {
            const fromColId = `column::${ur.fromTable}.${ur.fromColumn}`;
            const toColId = `column::${ur.toTable}.${ur.toColumn}`;
            if (nodes.has(fromColId)) {
              edges.push(createEdge(measureId, fromColId, EDGE_TYPES.MEASURE_TO_USERELATIONSHIP));
            }
            if (nodes.has(toColId)) {
              edges.push(createEdge(measureId, toColId, EDGE_TYPES.MEASURE_TO_USERELATIONSHIP));
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
                const refNode = nodes.get(refId);
                const edgeType = refNode.type === NODE_TYPES.MEASURE
                  ? EDGE_TYPES.CALC_COLUMN_TO_MEASURE
                  : EDGE_TYPES.CALC_COLUMN_TO_COLUMN;
                edges.push(createEdge(colId, refId, edgeType));
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

    // --- Build parameter map for PQ expression substitution ---
    const pqParameters = parsedModel.parameters || new Map();

    /**
     * Substitute known PQ parameters in an M expression string.
     * Replaces parameter identifiers (not in quotes) with their resolved values.
     */
    function resolveParameters(mExpr) {
      if (!mExpr || pqParameters.size === 0) return mExpr;
      let resolved = mExpr;
      for (const [paramName, paramValue] of pqParameters) {
        // Replace parameter name as a standalone identifier (not inside quotes)
        const paramRegex = new RegExp(`(?<![\\w"'])\\b${paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?![\\w"'])`, 'g');
        resolved = resolved.replace(paramRegex, `"${paramValue}"`);
      }
      return resolved;
    }

    // --- Create expression nodes from expressions.tmdl ---
    const expressionMap = new Map();
    if (parsedModel.expressions) {
      for (const expr of parsedModel.expressions) {
        if (expr.kind === 'expression') {
          const exprId = `expression::${expr.name}`;
          nodes.set(exprId, createNode(exprId, expr.name, NODE_TYPES.EXPRESSION, {
            mExpression: expr.mExpression,
          }));
          // Only add non-parameter expressions to the map used for partition linking
          expressionMap.set(expr.name, expr);

          // Try to extract data source from the expression
          const resolvedExpr = resolveParameters(expr.mExpression);
          const ds = extractMDataSource(resolvedExpr);
          if (ds) {
            const sourceKey = ds.database
              ? `${(ds.server || '').toLowerCase()}/${ds.database}`
              : (ds.server || '').toLowerCase();
            if (sourceKey) {
              const sourceId = `source::${sourceKey}`;
              if (!nodes.has(sourceId)) {
                const displayName = ds.database || ds.server || sourceKey;
                nodes.set(sourceId, createNode(sourceId, displayName, NODE_TYPES.SOURCE, {
                  server: ds.server,
                  database: ds.database,
                  sourceType: ds.type
                }));
              }
              edges.push(createEdge(exprId, sourceId, EDGE_TYPES.EXPRESSION_TO_SOURCE));
            }
            // Store source info on the expression node
            const exprNode = nodes.get(exprId);
            if (exprNode) {
              exprNode.metadata.dataSource = ds;
            }
          }
        }
      }
    }

    // --- Create source nodes from partition M expressions ---
    const sourceNodeCache = new Map();
    for (const table of parsedModel.tables) {
      // Collect source expressions: from partitions, or from refreshPolicy
      const sourceExpressions = [];
      for (const partition of (table.partitions || [])) {
        if (partition.sourceExpression) {
          sourceExpressions.push(partition);
        }
      }
      // Fallback to refreshPolicy source if no partition source found
      if (sourceExpressions.length === 0 && table.refreshPolicySource) {
        sourceExpressions.push({ sourceExpression: table.refreshPolicySource, mode: 'import' });
      }

      for (const partition of sourceExpressions) {
        if (!partition.sourceExpression) continue;
        const resolvedExpr = resolveParameters(partition.sourceExpression);
        const ds = extractMDataSource(resolvedExpr);

        // Check if partition references a named expression from expressions.tmdl
        // Could be a simple reference like "expr_name" or M code like "let Source = expr_name in ..."
        const trimmedSource = partition.sourceExpression.trim();
        let linkedExprName = null;
        let linkedExpr = null;

        // Pattern 1: Entire source is a single expression name
        const simpleRefMatch = trimmedSource.match(/^(\w+)$/);
        if (simpleRefMatch && expressionMap.has(simpleRefMatch[1])) {
          linkedExprName = simpleRefMatch[1];
          linkedExpr = expressionMap.get(linkedExprName);
        }

        // Pattern 2: M code references a known expression (e.g., let Source = expr_name)
        // Prefer expressions used in Source= assignment; skip parameter expressions
        if (!linkedExpr) {
          let fallbackExprName = null;
          let fallbackExpr = null;
          for (const [exprName, exprObj] of expressionMap) {
            // Skip parameter-kind expressions (RangeStart, RangeEnd, etc.)
            if (exprObj.kind === 'parameter') continue;
            // Match as a standalone identifier (not inside quotes)
            const escaped = exprName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const refRegex = new RegExp('(?<!["\'\'\\w])' + escaped + '(?!["\'\'\\w])');
            if (refRegex.test(trimmedSource)) {
              // Prefer Source= or := assignment pattern
              const assignRegex = new RegExp('(?:Source\\s*=|:=)\\s*' + escaped + '\\b');
              if (assignRegex.test(trimmedSource)) {
                linkedExprName = exprName;
                linkedExpr = exprObj;
                break;
              }
              // Keep as fallback if no assignment match yet
              if (!fallbackExprName) {
                fallbackExprName = exprName;
                fallbackExpr = exprObj;
              }
            }
          }
          if (!linkedExpr && fallbackExprName) {
            linkedExprName = fallbackExprName;
            linkedExpr = fallbackExpr;
          }
        }

        // If no direct data source, try to resolve from the linked expression
        let effectiveDs = ds;
        let effectiveExpr = resolvedExpr;
        if (!effectiveDs && linkedExpr) {
          effectiveExpr = resolveParameters(linkedExpr.mExpression);
          effectiveDs = extractMDataSource(effectiveExpr);
        }

        if (effectiveDs) {
          // Build deduplicated source key
          const sourceKey = effectiveDs.database
            ? `${(effectiveDs.server || '').toLowerCase()}/${effectiveDs.database}`
            : (effectiveDs.server || '').toLowerCase();
          if (sourceKey) {
            const sourceId = `source::${sourceKey}`;
            if (!sourceNodeCache.has(sourceId)) {
              const displayName = effectiveDs.database || effectiveDs.server || sourceKey;
              nodes.set(sourceId, createNode(sourceId, displayName, NODE_TYPES.SOURCE, {
                server: effectiveDs.server,
                database: effectiveDs.database,
                sourceType: effectiveDs.type
              }));
              sourceNodeCache.set(sourceId, true);
            }

            // Edge: table -> source
            const tableId = `table::${table.name}`;
            edges.push(createEdge(tableId, sourceId, EDGE_TYPES.TABLE_TO_SOURCE));

            // Store source metadata on the table node
            const tableNode = nodes.get(tableId);
            if (tableNode) {
              tableNode.metadata.dataSource = {
                server: effectiveDs.server,
                database: effectiveDs.database,
                schema: effectiveDs.schema,
                sourceTable: effectiveDs.sourceTable,
                sourceType: effectiveDs.type,
                mode: partition.mode
              };

              // Extract column rename mappings from the M expression
              // Try from partition source first, then from the linked expression
              let renameMap = extractRenameColumns(resolvedExpr);
              if (renameMap.size === 0 && effectiveExpr !== resolvedExpr) {
                renameMap = extractRenameColumns(effectiveExpr);
              }
              if (renameMap.size > 0) {
                tableNode.metadata.renameMap = Object.fromEntries(renameMap);
              }
            }
          }
        }

        // Create TABLE_TO_EXPRESSION edge for named expression references
        if (linkedExprName && linkedExpr) {
          const exprId = `expression::${linkedExprName}`;
          if (nodes.has(exprId)) {
            edges.push(createEdge(`table::${table.name}`, exprId, EDGE_TYPES.TABLE_TO_EXPRESSION));
          }
        }

        // Create TABLE_TO_TABLE_JOIN edges for M-level joins — these are real lineage:
        // the right-hand table's rows flow into this table's result set.
        // Only emit when the target resolves to a known user-table node (skip step refs).
        const joinSources = [resolvedExpr];
        if (effectiveExpr && effectiveExpr !== resolvedExpr) joinSources.push(effectiveExpr);
        const seenJoins = new Set();
        for (const expr of joinSources) {
          for (const joinedName of extractNestedJoins(expr)) {
            const targetId = `table::${joinedName}`;
            if (!seenJoins.has(targetId) && nodes.has(targetId) && targetId !== `table::${table.name}`) {
              edges.push(createEdge(`table::${table.name}`, targetId, EDGE_TYPES.TABLE_TO_TABLE_JOIN));
              seenJoins.add(targetId);
            }
          }
        }
      }
    }
  }

  // --- Column-level source mapping ---
  // For each column, determine the original source column name using rename maps
  if (parsedModel && parsedModel.tables) {
    for (const table of parsedModel.tables) {
      const tableId = `table::${table.name}`;
      const tableNode = nodes.get(tableId);

      // Get data source from the table directly, or from a linked expression node
      let ds = tableNode?.metadata?.dataSource;
      let renameMap = tableNode?.metadata?.renameMap || {};

      if (!ds || Object.keys(renameMap).length === 0) {
        // Check if table links to an expression node that has data source info or rename maps
        const tableUp = (function buildAdj() {
          const up = [];
          for (const edge of edges) {
            if (edge.source === tableId && (edge.type === EDGE_TYPES.TABLE_TO_EXPRESSION || edge.type === EDGE_TYPES.TABLE_TO_SOURCE)) {
              up.push(edge.target);
            }
          }
          return up;
        })();
        for (const upId of tableUp) {
          const upNode = nodes.get(upId);
          if (!ds && upNode?.metadata?.dataSource) {
            ds = upNode.metadata.dataSource;
          }
          // Also extract rename map from expression M code if not already found
          if (Object.keys(renameMap).length === 0 && upNode?.type === 'expression' && upNode.metadata?.mExpression) {
            const exprRenames = extractRenameColumns(upNode.metadata.mExpression);
            if (exprRenames.size > 0) {
              renameMap = Object.fromEntries(exprRenames);
            }
          }
        }
      }

      if (!ds) continue;

      for (const col of (table.columns || [])) {
        const colId = `column::${table.name}.${col.name}`;
        const colNode = nodes.get(colId);
        if (!colNode) continue;

        // Determine the original source column name
        const sourceCol = col.sourceColumn || col.name;
        // Check if sourceColumn was renamed from an original name
        const originalCol = renameMap[sourceCol] || sourceCol;

        colNode.metadata.sourceColumn = sourceCol;
        colNode.metadata.originalSourceColumn = originalCol;
        colNode.metadata.wasRenamed = originalCol !== sourceCol;
        // Store the full source path if available
        if (ds.sourceTable) {
          const fullTable = ds.schema
            ? `${ds.schema}.${ds.sourceTable}`
            : ds.sourceTable;
          const fullTableWithDb = ds.database
            ? `${ds.database}.${fullTable}`
            : fullTable;
          colNode.metadata.sourceTableFull = `${fullTableWithDb}.${originalCol}`;
          colNode.metadata.sourceTablePath = fullTableWithDb;
        }
      }
    }
  }

  // --- Create page and visual nodes ---
  if (parsedReport) {
    if (parsedReport.pages) {
      for (const page of parsedReport.pages) {
        const pageId = `page::${page.id}`;
        nodes.set(pageId, createNode(pageId, page.name, NODE_TYPES.PAGE, {
          pageId: page.id,
          width: page.width || 1280,
          height: page.height || 720,
          ordinal: page.order ?? 0,
        }));
      }
    }

    if (parsedReport.visuals) {
      for (const visual of parsedReport.visuals) {
        const visualId = `visual::${visual.pageId}/${visual.id}`;
        nodes.set(visualId, createNode(visualId, visual.title || visual.visualType, NODE_TYPES.VISUAL, {
          visualType: visual.visualType,
          pageId: visual.pageId,
          title: visual.title || '',
          position: visual.position || null,
          isHidden: visual.isHidden || false,
          parentGroupName: visual.parentGroupName || null,
        }));

        // Visual belongs to page
        const pageId = `page::${visual.pageId}`;
        if (nodes.has(pageId)) {
          edges.push(createEdge(visualId, pageId, EDGE_TYPES.VISUAL_TO_PAGE));
        }

        // Store page name on visual metadata for display
        const pageNode = nodes.get(pageId);
        if (pageNode) {
          const vNode = nodes.get(visualId);
          if (vNode) vNode.metadata.pageName = pageNode.name;
        }

        // Visual references fields
        if (visual.fields) {
          for (const field of visual.fields) {
            let fieldId;
            if (field.type === 'fieldParameter' && field.table) {
              // Field parameter reference — link visual to the FP table
              const fpTableId = `table::${field.table}`;
              if (nodes.has(fpTableId)) {
                edges.push(createEdge(visualId, fpTableId, EDGE_TYPES.VISUAL_TO_FIELD));
              }
              continue; // Don't create placeholder for FP tables
            } else if (field.type === 'measure' && field.table && field.measure) {
              fieldId = `measure::${field.table}.${field.measure}`;
            } else if (field.table && field.column) {
              fieldId = `column::${field.table}.${field.column}`;
            }
            if (fieldId) {
              // Create placeholder node if the field doesn't exist (no semantic model loaded)
              if (!nodes.has(fieldId)) {
                const placeholderName = field.measure || field.column || 'unknown';
                const placeholderType = field.type === 'measure' ? NODE_TYPES.MEASURE : NODE_TYPES.COLUMN;
                nodes.set(fieldId, createNode(fieldId, placeholderName, placeholderType, {
                  table: field.table,
                  placeholder: true
                }));
                // Also create placeholder table node if needed
                const tableId = `table::${field.table}`;
                if (field.table && !nodes.has(tableId)) {
                  nodes.set(tableId, createNode(tableId, field.table, NODE_TYPES.TABLE, {
                    table: field.table,
                    placeholder: true
                  }));
                }
                if (field.table && placeholderType === NODE_TYPES.COLUMN) {
                  edges.push(createEdge(fieldId, tableId, EDGE_TYPES.COLUMN_TO_TABLE));
                }
              }
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
        // Apply enrichment to the field parameter table node
        const tableId = `table::${fp.tableName}`;
        const tableNode = nodes.get(tableId);
        if (tableNode) {
          tableNode.enrichment = { type: 'field_parameter', data: fp };
        }

        // Create edges from field parameter table to each referenced field
        // and store display name mapping on the FP table node
        const refPattern = /'([^']+)'\[([^\]]+)\]/;
        const fpDisplayNames = {};
        for (const field of (fp.fields || [])) {
          const refMatch = field.reference?.match(refPattern);
          if (!refMatch) continue;
          const refTable = refMatch[1];
          const refField = refMatch[2];
          const colId = `column::${refTable}.${refField}`;
          const measureId = `measure::${refTable}.${refField}`;
          const targetId = nodes.has(measureId) ? measureId : (nodes.has(colId) ? colId : null);
          if (targetId) {
            edges.push(createEdge(tableId, targetId, EDGE_TYPES.FIELD_PARAM_TO_FIELD));
            if (field.displayName) {
              fpDisplayNames[targetId] = field.displayName;
            }
          }
        }
        if (tableNode && Object.keys(fpDisplayNames).length > 0) {
          tableNode.metadata.fpDisplayNames = fpDisplayNames;
        }
      }
    }
    if (enrichments.calculationGroups) {
      for (const cg of enrichments.calculationGroups) {
        const nodeId = `table::${cg.tableName}`;
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
  const counts = { tables: 0, columns: 0, measures: 0, visuals: 0, pages: 0, sources: 0, expressions: 0 };

  for (const node of graph.nodes.values()) {
    switch (node.type) {
      case NODE_TYPES.TABLE: counts.tables++; break;
      case NODE_TYPES.COLUMN: counts.columns++; break;
      case NODE_TYPES.MEASURE: counts.measures++; break;
      case NODE_TYPES.VISUAL: counts.visuals++; break;
      case NODE_TYPES.PAGE: counts.pages++; break;
      case NODE_TYPES.SOURCE: counts.sources++; break;
      case NODE_TYPES.EXPRESSION: counts.expressions++; break;
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
    sources: counts.sources,
    edges: graph.edges.length,
    orphanedMeasures
  };
}
