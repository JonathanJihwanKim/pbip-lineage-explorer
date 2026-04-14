/**
 * Lineage Tracer - Computes structured lineage data for a selected measure.
 * Returns the 4-section output matching the instruction document format:
 *   1. Visuals containing the measure
 *   2. DAX measure dependency chain
 *   3. Source lineage table (column-level)
 *   4. Compact lineage summary trees
 */

import { analyzeImpact } from './impactAnalysis.js';
import { EDGE_TYPES } from '../utils/constants.js';

/**
 * Trace the full lineage for a measure node.
 * @param {string} measureNodeId - The measure node ID (e.g. "measure::Table.Name").
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The full lineage graph.
 * @returns {{ visuals: Array, measureChain: object, sourceTable: Array, summaryTrees: Array }}
 */
export function traceMeasureLineage(measureNodeId, graph) {
  const measureNode = graph.nodes.get(measureNodeId);
  if (!measureNode) return null;

  const impact = analyzeImpact(measureNodeId, graph);

  const visuals = traceVisuals(measureNode, impact, graph);
  const measureChain = buildMeasureChain(measureNodeId, graph);
  const sourceTable = buildSourceTable(measureChain, graph);
  const summaryTrees = buildSummaryTrees(measureNode, visuals, measureChain, sourceTable, graph);

  return { visuals, measureChain, sourceTable, summaryTrees };
}

/**
 * Section 1: Find all visuals that contain this measure (downstream).
 */
function traceVisuals(measureNode, impact, graph) {
  const visuals = [];

  for (const nodeId of impact.downstream) {
    const node = graph.nodes.get(nodeId);
    if (!node || node.type !== 'visual') continue;

    // Find the page for this visual
    let pageName = node.metadata?.pageName || '';
    if (!pageName) {
      // Edge is visual→page, so page is in upstream
      const upNeighborsForPage = graph.adjacency.upstream.get(nodeId) || [];
      for (const nId of upNeighborsForPage) {
        const n = graph.nodes.get(nId);
        if (n && n.type === 'page') {
          pageName = n.name;
          break;
        }
      }
    }

    // Determine binding type (direct measure vs field parameter)
    // and look up field parameter display name
    let bindingType = 'direct';
    let fieldParameterTable = '';
    let fpDisplayName = '';
    const upNeighbors = graph.adjacency.upstream.get(nodeId) || [];
    for (const upId of upNeighbors) {
      const upNode = graph.nodes.get(upId);
      if (upNode && (upNode.enrichment?.type === 'field_parameter' || upNode.metadata?.isFieldParameter)) {
        bindingType = 'fieldParameter';
        fieldParameterTable = upNode.metadata?.table || upNode.name;
        // Look up display name for this measure in the FP table
        const displayNames = upNode.metadata?.fpDisplayNames;
        if (displayNames && displayNames[measureNode.id]) {
          fpDisplayName = displayNames[measureNode.id];
        }
        break;
      }
    }

    visuals.push({
      page: pageName,
      visualType: node.metadata?.visualType || node.name,
      title: node.metadata?.title || node.name,
      id: node.id,
      metricDisplayName: fpDisplayName || measureNode.name,
      metricDaxName: `${measureNode.metadata?.table || ''}.${measureNode.name}`,
      bindingType,
      fieldParameterTable,
    });
  }

  // Sort by page name then visual title
  visuals.sort((a, b) => (a.page + a.title).localeCompare(b.page + b.title));
  return visuals;
}

/**
 * Trace lineage starting from a visual node.
 * Finds all measures the visual references (direct and via field parameters),
 * then traces each measure's lineage.
 *
 * @param {string} visualNodeId
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph
 * @returns {{ visual: object, measures: Array, fieldParameterMeasures: Array }}
 */
export function traceVisualLineage(visualNodeId, graph) {
  const visualNode = graph.nodes.get(visualNodeId);
  if (!visualNode) return null;

  // Determine page name
  let pageName = visualNode.metadata?.pageName || '';
  if (!pageName) {
    // Edge is visual→page, so page is in upstream
    const upNeighborsForPage = graph.adjacency.upstream.get(visualNodeId) || [];
    for (const nId of upNeighborsForPage) {
      const n = graph.nodes.get(nId);
      if (n && n.type === 'page') { pageName = n.name; break; }
    }
  }

  const directMeasureIds = new Set();
  const fieldParamMeasureIds = new Set();

  const upNeighbors = graph.adjacency.upstream.get(visualNodeId) || [];
  for (const upId of upNeighbors) {
    const upNode = graph.nodes.get(upId);
    if (!upNode) continue;

    if (upNode.type === 'measure') {
      directMeasureIds.add(upId);
    } else if (upNode.type === 'column') {
      // Check if this column's parent table is a field parameter
      const parentTableId = `table::${upNode.metadata?.table || ''}`;
      const parentTable = graph.nodes.get(parentTableId);
      const isFieldParam = parentTable?.enrichment?.type === 'field_parameter' ||
        upNode.enrichment?.type === 'field_parameter' ||
        upNode.metadata?.isFieldParameter;

      if (isFieldParam && parentTableId) {
        // Resolve all measures from the FP table via FIELD_PARAM_TO_FIELD edges
        const fpUp = graph.adjacency.upstream.get(parentTableId) || [];
        for (const fpId of fpUp) {
          const fpNode = graph.nodes.get(fpId);
          if (fpNode?.type === 'measure') fieldParamMeasureIds.add(fpId);
        }
      } else {
        // Walk upstream to find referenced measures
        const colUp = graph.adjacency.upstream.get(upId) || [];
        for (const cId of colUp) {
          const cNode = graph.nodes.get(cId);
          if (cNode?.type === 'measure') directMeasureIds.add(cId);
        }
      }
    } else if (upNode.type === 'table') {
      // Direct table reference (e.g., field parameter table from pbirParser)
      const isFieldParam = upNode.enrichment?.type === 'field_parameter';
      if (isFieldParam) {
        const fpUp = graph.adjacency.upstream.get(upId) || [];
        for (const fpId of fpUp) {
          const fpNode = graph.nodes.get(fpId);
          if (fpNode?.type === 'measure') fieldParamMeasureIds.add(fpId);
        }
      }
    }
  }

  // Also collect FP table IDs that the visual references (directly or via columns)
  const referencedFpTableIds = new Set();
  const referencedCgTableIds = new Set();
  for (const upId of upNeighbors) {
    const upNode = graph.nodes.get(upId);
    if (!upNode) continue;
    if (upNode.type === 'table') {
      if (upNode.enrichment?.type === 'field_parameter') {
        referencedFpTableIds.add(upId);
      }
      if (upNode.metadata?.enrichmentType === 'calculation_group' || upNode.enrichment?.type === 'calculation_group') {
        referencedCgTableIds.add(upId);
      }
    } else if (upNode.type === 'column') {
      const parentTableId = `table::${upNode.metadata?.table || ''}`;
      const parentTable = graph.nodes.get(parentTableId);
      if (parentTable?.enrichment?.type === 'field_parameter') {
        referencedFpTableIds.add(parentTableId);
      }
      if (parentTable?.metadata?.enrichmentType === 'calculation_group' || upNode.metadata?.enrichmentType === 'calculation_group') {
        referencedCgTableIds.add(parentTableId);
      }
    }
  }
  // Scan FIELD_PARAM_TO_FIELD edges for any referenced FP tables
  for (const edge of graph.edges) {
    if (edge.type === EDGE_TYPES.FIELD_PARAM_TO_FIELD && referencedFpTableIds.has(edge.source)) {
      const targetNode = graph.nodes.get(edge.target);
      if (targetNode?.type === 'measure') fieldParamMeasureIds.add(edge.target);
    }
  }

  // Build FP display name map from all referenced FP tables
  const fpDisplayNameMap = new Map();
  for (const fpTableId of referencedFpTableIds) {
    const fpTable = graph.nodes.get(fpTableId);
    const displayNames = fpTable?.metadata?.fpDisplayNames;
    if (displayNames) {
      for (const [measureId, displayName] of Object.entries(displayNames)) {
        fpDisplayNameMap.set(measureId, displayName);
      }
    }
  }

  // Trace lineage for direct measures
  const measures = Array.from(directMeasureIds).map(measureId => {
    const node = graph.nodes.get(measureId);
    return {
      measureId,
      measureName: node?.name || measureId,
      fpDisplayName: fpDisplayNameMap.get(measureId) || '',
      lineage: traceMeasureLineage(measureId, graph),
    };
  });

  // Also trace lineage for field parameter measures (they are real measures too)
  const fpMeasures = Array.from(fieldParamMeasureIds)
    .filter(id => !directMeasureIds.has(id)) // avoid duplicates
    .map(measureId => {
      const node = graph.nodes.get(measureId);
      return {
        measureId,
        measureName: node?.name || measureId,
        fpDisplayName: fpDisplayNameMap.get(measureId) || '',
        lineage: traceMeasureLineage(measureId, graph),
      };
    });

  // Build calculation groups info from referenced CG tables
  const calculationGroups = Array.from(referencedCgTableIds).map(cgTableId => {
    const cgNode = graph.nodes.get(cgTableId);
    const items = cgNode?.metadata?.calculationGroup?.items || [];
    return {
      tableName: cgNode?.name || cgTableId.replace('table::', ''),
      items,
    };
  });

  return {
    visual: {
      id: visualNodeId,
      title: visualNode.metadata?.title || visualNode.name || '',
      type: visualNode.metadata?.visualType || visualNode.name || 'visual',
      page: pageName,
      objectId: visualNodeId.split('/').pop() || visualNodeId,
    },
    measures,
    fpMeasures,
    fieldParameterMeasures: Array.from(fieldParamMeasureIds).map(id => {
      const n = graph.nodes.get(id);
      return { id, name: n?.name || id, table: n?.metadata?.table || '' };
    }),
    calculationGroups,
  };
}

/**
 * Section 2: Build the DAX measure dependency chain recursively.
 * Returns a tree: { id, name, table, expression, children: [...], columns: [...] }
 *
 * Cycle detection uses a per-path `ancestors` Set (only true cycles are flagged).
 * A `memo` Map lets shared sub-measures in a DAG reuse a fully computed subtree
 * instead of being truncated as "circular" on the second visit.
 */
function buildMeasureChain(measureNodeId, graph, ancestors = new Set(), memo = new Map()) {
  if (ancestors.has(measureNodeId)) {
    const node = graph.nodes.get(measureNodeId);
    return {
      id: measureNodeId,
      name: node?.name || measureNodeId,
      table: node?.metadata?.table || '',
      expression: '(circular reference)',
      children: [],
      columns: [],
    };
  }
  if (memo.has(measureNodeId)) return memo.get(measureNodeId);

  const node = graph.nodes.get(measureNodeId);
  if (!node) return null;

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(measureNodeId);

  const result = {
    id: measureNodeId,
    name: node.name,
    table: node.metadata?.table || '',
    expression: node.metadata?.expression || '',
    description: node.metadata?.description || '',
    children: [],  // sub-measures
    columns: [],   // leaf column references
    useRelationships: [], // USERELATIONSHIP references
  };

  // Collect USERELATIONSHIP edges for this measure
  for (const edge of graph.edges) {
    if (edge.type === EDGE_TYPES.MEASURE_TO_USERELATIONSHIP && edge.source === measureNodeId) {
      const colNode = graph.nodes.get(edge.target);
      if (colNode) {
        result.useRelationships.push({
          column: colNode.name,
          table: colNode.metadata?.table || '',
        });
      }
    }
  }
  // Also check for table_relationship edges to find cross-filter direction
  if (result.useRelationships.length > 0) {
    const relTables = new Set(result.useRelationships.map(ur => ur.table));
    for (const edge of graph.edges) {
      if (edge.type === 'table_relationship') {
        const srcNode = graph.nodes.get(edge.source);
        const tgtNode = graph.nodes.get(edge.target);
        if (srcNode && tgtNode && relTables.has(srcNode.name) && relTables.has(tgtNode.name)) {
          result.useRelationships.crossFilter = edge.metadata?.crossFilter || 'single';
          result.useRelationships.fromTable = srcNode.name;
          result.useRelationships.toTable = tgtNode.name;
        }
      }
    }
  }

  // Walk upstream edges from this measure
  const upNeighbors = graph.adjacency.upstream.get(measureNodeId) || [];
  for (const upId of upNeighbors) {
    const upNode = graph.nodes.get(upId);
    if (!upNode) continue;

    if (upNode.type === 'measure') {
      const child = buildMeasureChain(upId, graph, nextAncestors, memo);
      if (child) result.children.push(child);
    } else if (upNode.type === 'column') {
      result.columns.push({
        id: upId,
        name: upNode.name,
        table: upNode.metadata?.table || '',
        dataType: upNode.metadata?.dataType || '',
        sourceColumn: upNode.metadata?.sourceColumn || '',
        originalSourceColumn: upNode.metadata?.originalSourceColumn || '',
        wasRenamed: upNode.metadata?.wasRenamed || false,
        sourceTableFull: upNode.metadata?.sourceTableFull || '',
        sourceTablePath: upNode.metadata?.sourceTablePath || '',
        isHidden: upNode.metadata?.isHidden || false,
      });
    }
  }

  memo.set(measureNodeId, result);
  return result;
}

/**
 * Section 3: Build the source lineage table — one row per leaf column.
 * Traces each column to its data source.
 *
 * Columns are deduped by node id, but every parent measure that references a
 * given column is preserved in `row.daxReferences` so the UI can attribute the
 * column to all measures that use it. `row.daxReference` is kept as a legacy
 * alias (first parent) for any external consumer.
 */
function buildSourceTable(measureChain, graph) {
  const rows = [];
  const indexByCol = new Map();

  function collectColumns(chain) {
    if (!chain) return;

    for (const col of chain.columns) {
      const parent = chain.name;

      const existingIdx = indexByCol.get(col.id);
      if (existingIdx !== undefined) {
        const existing = rows[existingIdx];
        if (parent && !existing.daxReferences.includes(parent)) {
          existing.daxReferences.push(parent);
        }
        continue;
      }

      // Find the table node
      const tableNodeId = `table::${col.table}`;
      const tableNode = graph.nodes.get(tableNodeId);

      let srcTable = col.sourceTablePath || '';
      let srcColumn = col.sourceTableFull || col.sourceColumn || col.name;

      if (tableNode) {
        // Walk upstream from table to find expression/source
        const tableUp = graph.adjacency.upstream.get(tableNodeId) || [];
        for (const upId of tableUp) {
          const upNode = graph.nodes.get(upId);
          if (upNode && upNode.type === 'expression') {
            if (upNode.metadata?.dataSource?.sourceTable && !srcTable) {
              const exprDs = upNode.metadata.dataSource;
              const exprFullTable = exprDs.schema
                ? `${exprDs.schema}.${exprDs.sourceTable}`
                : exprDs.sourceTable;
              srcTable = exprDs.database
                ? `${exprDs.database}.${exprFullTable}`
                : exprFullTable;
            }
          } else if (upNode && upNode.type === 'source') {
            if (!srcTable && upNode.metadata?.database) {
              srcTable = `${upNode.metadata.database}.*`;
            }
          }
        }
      }

      // If srcColumn only has the column name (no table path), prepend source table
      if (srcTable && srcColumn && !srcColumn.includes('.')) {
        srcColumn = `${srcTable}.${srcColumn}`;
      }

      // Determine storage mode (Import/DirectQuery)
      const mode = tableNode?.metadata?.dataSource?.mode || '';

      const daxReferences = parent ? [parent] : [];

      rows.push({
        daxReferences,
        daxReference: daxReferences[0] || '', // legacy alias (first parent)
        pbiTable: col.table,
        pbiColumn: col.name,
        dataType: col.dataType || '',
        isHidden: col.isHidden || false,
        sourceColumn: col.sourceColumn || col.name,
        originalSourceColumn: col.originalSourceColumn || '',
        sourceTable: srcTable,
        sourceColumnFull: srcColumn,
        renamed: col.wasRenamed,
        renameChain: col.wasRenamed
          ? { sourceName: col.originalSourceColumn || '', pqName: col.sourceColumn || '', pbiName: col.name }
          : null,
        mode,
      });
      indexByCol.set(col.id, rows.length - 1);
    }

    for (const child of chain.children) {
      collectColumns(child);
    }
  }

  collectColumns(measureChain);
  return rows;
}

/**
 * Section 4: Build compact summary trees — one per visual.
 */
function buildSummaryTrees(measureNode, visuals, measureChain, sourceTable, graph) {
  // Build a column→source lookup from sourceTable
  const colSourceMap = new Map();
  for (const row of sourceTable) {
    const key = `${row.pbiTable}.${row.pbiColumn}`;
    colSourceMap.set(key, row);
  }

  function buildChainSummary(chain, indent) {
    const prefix = '  '.repeat(indent);
    const lines = [];

    const daxShort = chain.expression
      ? chain.expression.split('\n')[0].substring(0, 80) + (chain.expression.length > 80 ? '...' : '')
      : '';
    lines.push(`${prefix}[${chain.name}] = ${daxShort}`);

    for (const child of chain.children) {
      lines.push(...buildChainSummary(child, indent + 2));
    }

    for (const col of chain.columns) {
      const key = `${col.table}.${col.name}`;
      const source = colSourceMap.get(key);
      let colLine = `${prefix}    ${col.table}[${col.name}]`;
      if (source?.sourceTable) colLine += ` -> Source: ${source.sourceTable}.${source.sourceColumnFull}`;
      if (source?.renamed) colLine += ' (renamed)';
      lines.push(colLine);
    }

    return lines;
  }

  return visuals.map(v => {
    const lines = [];
    lines.push(`Visual: ${v.visualType} "${v.title}" (${v.id.split('/').pop() || v.id})`);
    lines.push(`  Metric Display Name: ${v.metricDisplayName}`);
    lines.push(`  Metric DAX Name: ${v.metricDaxName}`);
    lines.push(...buildChainSummary(measureChain, 1));
    return lines.join('\n');
  });
}
