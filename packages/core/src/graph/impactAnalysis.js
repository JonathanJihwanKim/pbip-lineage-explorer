/**
 * Impact Analysis - Traces upstream and downstream dependencies for a given node.
 * Provides the data needed for the detail panel to show what depends on
 * a selected object and what it depends on.
 */

import { buildAdjacency } from './graphBuilder.js';

/**
 * BFS traversal to collect all reachable nodes in a given direction.
 * @param {string} startId - Starting node ID.
 * @param {Map<string, string[]>} adjacencyMap - Adjacency list (upstream or downstream).
 * @returns {Set<string>} Set of reachable node IDs (excluding start).
 */
function bfsTraverse(startId, adjacencyMap) {
  const visited = new Set();
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adjacencyMap.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && neighbor !== startId) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

/**
 * Get all transitive upstream dependencies of a node (BFS).
 * @param {string} nodeId - The node ID.
 * @param {{ upstream: Map, downstream: Map }} adjacency - Adjacency lists.
 * @returns {Set<string>} Set of upstream node IDs.
 */
export function getUpstream(nodeId, adjacency) {
  return bfsTraverse(nodeId, adjacency.upstream);
}

/**
 * Get all transitive downstream dependents of a node (BFS).
 * @param {string} nodeId - The node ID.
 * @param {{ upstream: Map, downstream: Map }} adjacency - Adjacency lists.
 * @returns {Set<string>} Set of downstream node IDs.
 */
export function getDownstream(nodeId, adjacency) {
  return bfsTraverse(nodeId, adjacency.downstream);
}

/**
 * Get only immediate (direct) neighbors of a node.
 * @param {string} nodeId - The node ID.
 * @param {{ upstream: Map, downstream: Map }} adjacency - Adjacency lists.
 * @returns {{ upstream: string[], downstream: string[] }}
 */
export function getDirectDependencies(nodeId, adjacency) {
  return {
    upstream: adjacency.upstream.get(nodeId) || [],
    downstream: adjacency.downstream.get(nodeId) || []
  };
}

/**
 * Perform full impact analysis for a given node.
 * @param {string} nodeId - The selected node ID.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The full lineage graph.
 * @returns {{ upstream: Set<string>, downstream: Set<string>, node: object }}
 */
export function analyzeImpact(nodeId, graph) {
  const node = graph.nodes.get(nodeId) || null;
  const upstream = getUpstream(nodeId, graph.adjacency);
  const downstream = getDownstream(nodeId, graph.adjacency);

  return { upstream, downstream, node };
}

/**
 * Find measures not referenced by any visual (no downstream path to a visual node).
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The graph.
 * @returns {Array<string>} Array of orphan measure node IDs.
 */
export function findOrphans(graph) {
  const orphans = [];

  for (const node of graph.nodes.values()) {
    if (node.type === 'measure') {
      const downstream = getDownstream(node.id, graph.adjacency);
      const reachesVisual = [...downstream].some(id => {
        const n = graph.nodes.get(id);
        return n && n.type === 'visual';
      });
      if (!reachesVisual) {
        orphans.push(node.id);
      }
    }
  }

  return orphans;
}

/**
 * Extract a subgraph containing only the upstream and downstream nodes
 * of a given node, suitable for rendering in focus mode.
 * @param {string} nodeId - The focal node ID.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The full graph.
 * @returns {{ nodes: Map, edges: Array, adjacency: object }}
 */
export function extractSubgraph(nodeId, graph) {
  const upstream = getUpstream(nodeId, graph.adjacency);
  const downstream = getDownstream(nodeId, graph.adjacency);

  const subgraphIds = new Set([nodeId, ...upstream, ...downstream]);

  // Build nodes map
  const nodes = new Map();
  for (const id of subgraphIds) {
    const node = graph.nodes.get(id);
    if (node) nodes.set(id, node);
  }

  // Filter edges to only those within the subgraph
  const edges = graph.edges.filter(e => {
    const srcId = typeof e.source === 'string' ? e.source : e.source.id;
    const tgtId = typeof e.target === 'string' ? e.target : e.target.id;
    return subgraphIds.has(srcId) && subgraphIds.has(tgtId);
  });

  const adjacency = buildAdjacency(edges);

  return { nodes, edges, adjacency };
}

/**
 * Compute depth map for upstream and downstream nodes via BFS from a focal node.
 * @param {string} nodeId - The focal node ID.
 * @param {{ upstream: Map, downstream: Map }} adjacency - Full graph adjacency.
 * @returns {Map<string, { direction: string, depth: number }>}
 */
export function computeDepthMap(nodeId, adjacency) {
  const depthMap = new Map();
  depthMap.set(nodeId, { direction: 'self', depth: 0 });

  // BFS upstream
  const upQueue = [{ id: nodeId, depth: 0 }];
  const upVisited = new Set([nodeId]);
  while (upQueue.length > 0) {
    const { id, depth } = upQueue.shift();
    const neighbors = adjacency.upstream.get(id) || [];
    for (const neighbor of neighbors) {
      if (!upVisited.has(neighbor)) {
        upVisited.add(neighbor);
        depthMap.set(neighbor, { direction: 'upstream', depth: depth + 1 });
        upQueue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  // BFS downstream
  const downQueue = [{ id: nodeId, depth: 0 }];
  const downVisited = new Set([nodeId]);
  while (downQueue.length > 0) {
    const { id, depth } = downQueue.shift();
    const neighbors = adjacency.downstream.get(id) || [];
    for (const neighbor of neighbors) {
      if (!downVisited.has(neighbor)) {
        downVisited.add(neighbor);
        depthMap.set(neighbor, { direction: 'downstream', depth: depth + 1 });
        downQueue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  return depthMap;
}

/**
 * Export an impact report for a node in the specified format.
 * @param {string} nodeId - The node ID.
 * @param {{ nodes: Map, edges: Array, adjacency: object }} graph - The graph.
 * @param {'json'|'markdown'} format - Output format.
 * @returns {string|object} The formatted report.
 */
export function exportImpactReport(nodeId, graph, format = 'json') {
  const { upstream, downstream, node } = analyzeImpact(nodeId, graph);

  const upstreamNodes = [...upstream].map(id => {
    const n = graph.nodes.get(id);
    return n ? { id: n.id, name: n.name, type: n.type } : { id };
  });

  const downstreamNodes = [...downstream].map(id => {
    const n = graph.nodes.get(id);
    return n ? { id: n.id, name: n.name, type: n.type } : { id };
  });

  if (format === 'markdown') {
    const lines = [];
    lines.push(`# Impact Report: ${node ? node.name : nodeId}`);
    lines.push('');
    if (node) {
      lines.push(`- **Type**: ${node.type}`);
      lines.push(`- **ID**: ${node.id}`);
      lines.push('');
    }

    lines.push(`## Upstream Dependencies (${upstreamNodes.length})`);
    lines.push('');
    if (upstreamNodes.length === 0) {
      lines.push('_None_');
    } else {
      for (const n of upstreamNodes) {
        lines.push(`- \`${n.type || 'unknown'}\` **${n.name || n.id}**`);
      }
    }
    lines.push('');

    lines.push(`## Downstream Dependents (${downstreamNodes.length})`);
    lines.push('');
    if (downstreamNodes.length === 0) {
      lines.push('_None_');
    } else {
      for (const n of downstreamNodes) {
        lines.push(`- \`${n.type || 'unknown'}\` **${n.name || n.id}**`);
      }
    }

    return lines.join('\n');
  }

  // JSON format
  return {
    node: node ? { id: node.id, name: node.name, type: node.type, metadata: node.metadata } : null,
    upstream: upstreamNodes,
    downstream: downstreamNodes,
    summary: {
      upstreamCount: upstreamNodes.length,
      downstreamCount: downstreamNodes.length
    }
  };
}
