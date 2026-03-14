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
  const measureChain = buildMeasureChain(measureNodeId, graph, new Set());
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
    let bindingType = 'direct';
    let fieldParameterTable = '';
    const upNeighbors = graph.adjacency.upstream.get(nodeId) || [];
    for (const upId of upNeighbors) {
      const upNode = graph.nodes.get(upId);
      if (upNode && (upNode.enrichment?.type === 'field_parameter' || upNode.metadata?.isFieldParameter)) {
        bindingType = 'fieldParameter';
        fieldParameterTable = upNode.metadata?.table || upNode.name;
        break;
      }
    }

    visuals.push({
      page: pageName,
      visualType: node.metadata?.visualType || node.name,
      title: node.metadata?.title || node.name,
      id: node.id,
      metricDisplayName: measureNode.name,
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
  for (const upId of upNeighbors) {
    const upNode = graph.nodes.get(upId);
    if (!upNode) continue;
    if (upNode.type === 'table' && upNode.enrichment?.type === 'field_parameter') {
      referencedFpTableIds.add(upId);
    } else if (upNode.type === 'column') {
      const parentTableId = `table::${upNode.metadata?.table || ''}`;
      const parentTable = graph.nodes.get(parentTableId);
      if (parentTable?.enrichment?.type === 'field_parameter') {
        referencedFpTableIds.add(parentTableId);
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

  // Trace lineage for direct measures
  const measures = Array.from(directMeasureIds).map(measureId => {
    const node = graph.nodes.get(measureId);
    return {
      measureId,
      measureName: node?.name || measureId,
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
        lineage: traceMeasureLineage(measureId, graph),
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
  };
}

/**
 * Section 2: Build the DAX measure dependency chain recursively.
 * Returns a tree: { id, name, table, expression, children: [...], columns: [...] }
 */
function buildMeasureChain(measureNodeId, graph, visited) {
  if (visited.has(measureNodeId)) {
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
  visited.add(measureNodeId);

  const node = graph.nodes.get(measureNodeId);
  if (!node) return null;

  const result = {
    id: measureNodeId,
    name: node.name,
    table: node.metadata?.table || '',
    expression: node.metadata?.expression || '',
    children: [],  // sub-measures
    columns: [],   // leaf column references
  };

  // Walk upstream edges from this measure
  const upNeighbors = graph.adjacency.upstream.get(measureNodeId) || [];
  for (const upId of upNeighbors) {
    const upNode = graph.nodes.get(upId);
    if (!upNode) continue;

    if (upNode.type === 'measure') {
      const child = buildMeasureChain(upId, graph, visited);
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
      });
    }
  }

  return result;
}

/**
 * Section 3: Build the source lineage table — one row per leaf column.
 * Traces each column to its data source.
 */
function buildSourceTable(measureChain, graph) {
  const rows = [];
  const seen = new Set();

  function collectColumns(chain, parentMeasure) {
    if (!chain) return;

    for (const col of chain.columns) {
      if (seen.has(col.id)) continue;
      seen.add(col.id);

      // Find the table node
      const tableNodeId = `table::${col.table}`;
      const tableNode = graph.nodes.get(tableNodeId);

      // Find PQ expression for this table
      let pqExpression = '';
      let srcTable = col.sourceTablePath || '';
      let srcColumn = col.sourceTableFull || col.sourceColumn || col.name;

      if (tableNode) {
        // Walk upstream from table to find expression/source
        const tableUp = graph.adjacency.upstream.get(tableNodeId) || [];
        for (const upId of tableUp) {
          const upNode = graph.nodes.get(upId);
          if (upNode && upNode.type === 'expression') {
            pqExpression = upNode.name;
            if (upNode.metadata?.dataSource?.sourceTable) {
              srcTable = srcTable || `${upNode.metadata.dataSource.database || ''}.${upNode.metadata.dataSource.sourceTable}`;
            }
          } else if (upNode && upNode.type === 'source') {
            if (!srcTable && upNode.metadata?.database) {
              srcTable = `${upNode.metadata.database}.*`;
            }
          }
        }
      }

      rows.push({
        daxReference: `${parentMeasure || chain.name}`,
        pbiTable: col.table,
        pbiColumn: col.name,
        sourceColumn: col.sourceColumn || col.name,
        originalSourceColumn: col.originalSourceColumn || '',
        pqExpression,
        sourceTable: srcTable,
        sourceColumnFull: srcColumn,
        renamed: col.wasRenamed,
        renameChain: col.wasRenamed
          ? { sourceName: col.originalSourceColumn || '', pqName: col.sourceColumn || '', pbiName: col.name }
          : null,
      });
    }

    for (const child of chain.children) {
      collectColumns(child, chain.name);
    }
  }

  collectColumns(measureChain, '');
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
      if (source?.pqExpression) colLine += ` -> PQ: ${source.pqExpression}`;
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
