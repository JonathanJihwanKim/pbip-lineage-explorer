/**
 * Impact Analysis - Traces upstream and downstream dependencies for a given node.
 * Provides the data needed for the detail panel to show what depends on
 * a selected object and what it depends on.
 */

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
