/**
 * Impact Resolver — Uses the lineage graph to determine downstream impact
 * of changes, including through field parameters and calculation groups.
 */

import { NODE_TYPES, ENRICHMENT_TYPES } from '../utils/constants.js';

/**
 * Resolve the downstream visual impact of a measure change.
 * Traces through direct references, field parameters, and calculation groups.
 *
 * @param {string} measureName - The changed measure name.
 * @param {string} tableName - The table containing the measure.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The lineage graph.
 * @returns {Array<{ type: string, visualId: string, visualName: string, pageId: string, pageName: string, reason: string }>}
 */
export function resolveImpact(measureName, tableName, graph) {
  if (!graph) return [];

  const impacts = [];
  const seen = new Set();

  // Find the measure node
  const measureNodeId = `measure::${tableName}.${measureName}`;
  const measureNode = graph.nodes.get(measureNodeId);
  if (!measureNode) return impacts;

  // 1. Direct visual references: walk downstream to find visuals
  const directVisuals = findDownstreamVisuals(measureNodeId, graph);
  for (const visual of directVisuals) {
    const key = `direct:${visual.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      impacts.push({
        type: 'direct',
        visualId: visual.id,
        visualName: visual.name || visual.id,
        pageId: visual.metadata?.pageId || '',
        pageName: resolvePageNameFromGraph(visual.metadata?.pageId, graph),
        reason: `directly uses measure [${measureName}]`,
      });
    }
  }

  // 2. Field parameter references: check if this measure is referenced by any field parameter
  const fpImpacts = resolveFieldParameterImpact(measureName, tableName, graph);
  for (const impact of fpImpacts) {
    const key = `fp:${impact.visualId}`;
    if (!seen.has(key)) {
      seen.add(key);
      impacts.push(impact);
    }
  }

  // 3. Calculation group references: check if this measure is consumed by visuals
  // that also use a calculation group (calc groups modify how measures are evaluated)
  const cgImpacts = resolveCalcGroupImpact(measureNodeId, graph);
  for (const impact of cgImpacts) {
    const key = `cg:${impact.visualId}`;
    if (!seen.has(key)) {
      seen.add(key);
      impacts.push(impact);
    }
  }

  return impacts;
}

/**
 * Find all visuals downstream of a given node via BFS.
 */
function findDownstreamVisuals(nodeId, graph) {
  const visuals = [];
  const visited = new Set();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    const downstream = graph.adjacency.downstream.get(current) || [];

    for (const neighbor of downstream) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const node = graph.nodes.get(neighbor);
      if (node?.type === NODE_TYPES.VISUAL) {
        visuals.push(node);
      } else {
        queue.push(neighbor);
      }
    }
  }

  return visuals;
}

/**
 * Resolve field parameter impact.
 * If the changed measure is one of the fields referenced by a field parameter,
 * find all visuals using that field parameter table.
 */
function resolveFieldParameterImpact(measureName, tableName, graph) {
  const impacts = [];

  // Search all nodes for field parameter enrichment
  for (const node of graph.nodes.values()) {
    if (node.metadata?.enrichmentType !== ENRICHMENT_TYPES.FIELD_PARAMETER) continue;

    const fpFields = node.metadata?.fieldParameter?.fields || [];
    const fpTableName = node.metadata?.table || node.name;

    // Check if this measure is referenced by this field parameter
    const isReferenced = fpFields.some(field => {
      // Match by reference pattern: 'TableName'[MeasureName]
      if (field.reference) {
        const ref = field.reference;
        if (ref.includes(`'${tableName}'[${measureName}]`)) return true;
        if (ref === `[${measureName}]`) return true;
      }
      return field.name === measureName;
    });

    if (!isReferenced) continue;

    // Find all visuals that use this field parameter table
    const fpTableNodeId = `table::${fpTableName}`;
    const fpVisuals = findDownstreamVisuals(fpTableNodeId, graph);

    for (const visual of fpVisuals) {
      impacts.push({
        type: 'field_parameter',
        visualId: visual.id,
        visualName: visual.name || visual.id,
        pageId: visual.metadata?.pageId || '',
        pageName: resolvePageNameFromGraph(visual.metadata?.pageId, graph),
        reason: `uses field parameter "${fpTableName}" which references [${measureName}]`,
      });
    }
  }

  return impacts;
}

/**
 * Resolve calculation group impact.
 * If the changed measure is used by a visual that also uses a calculation group,
 * flag the visual as impacted through the calculation group.
 */
function resolveCalcGroupImpact(measureNodeId, graph) {
  const impacts = [];

  // Find visuals directly downstream of this measure
  const directVisuals = findDownstreamVisuals(measureNodeId, graph);

  for (const visual of directVisuals) {
    // Check if this visual also references any calculation group table
    const upstream = graph.adjacency.upstream.get(visual.id) || [];

    for (const upId of upstream) {
      const upNode = graph.nodes.get(upId);
      if (upNode?.metadata?.enrichmentType === ENRICHMENT_TYPES.CALCULATION_GROUP) {
        impacts.push({
          type: 'calculation_group',
          visualId: visual.id,
          visualName: visual.name || visual.id,
          pageId: visual.metadata?.pageId || '',
          pageName: resolvePageNameFromGraph(visual.metadata?.pageId, graph),
          reason: `applies calculation group "${upNode.name || upNode.id}" to this measure`,
        });
      }
    }
  }

  return impacts;
}

/**
 * Resolve page display name from the graph.
 */
function resolvePageNameFromGraph(pageId, graph) {
  if (!pageId) return 'unknown';
  const pageNodeId = `page::${pageId}`;
  const pageNode = graph.nodes.get(pageNodeId);
  return pageNode?.name || pageId;
}
