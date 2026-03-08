/**
 * Search Panel - Handles search input, filtering, and result display
 * in the left sidebar.
 */

import { NODE_COLORS, NODE_LABELS } from '../utils/constants.js';

let _callbacks = {};
let _graph = null;
let _debounceTimer = null;

/**
 * Initialize the search panel with event listeners.
 * @param {object} options
 * @param {function} options.onSearch - Called when a search result is clicked (nodeId).
 * @param {function} options.onFilter - Called when filters change.
 * @param {function} options.onOrphanToggle - Called when orphan toggle changes.
 * @param {{ nodes: Array, edges: Array }} options.graphData - The lineage graph.
 */
export function initSearchPanel(options = {}) {
  _callbacks = options;
  _graph = options.graphData || null;

  const searchInput = document.getElementById('search-input');
  const filterType = document.getElementById('filter-type');
  const filterTable = document.getElementById('filter-table');
  const filterOrphans = document.getElementById('filter-orphans');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        const query = searchInput.value.trim();
        if (!_graph) return;
        const filters = getActiveFilters();
        const results = searchNodes(query, _graph, filters);
        renderSearchResults(results, _graph);
      }, 300);
    });
  }

  if (filterType) {
    filterType.addEventListener('change', handleFilterChange);
  }
  if (filterTable) {
    filterTable.addEventListener('change', handleFilterChange);
  }
  if (filterOrphans) {
    filterOrphans.addEventListener('change', () => {
      if (_callbacks.onOrphanToggle) {
        _callbacks.onOrphanToggle(filterOrphans.checked);
      }
      handleFilterChange();
    });
  }
}

function getActiveFilters() {
  const filterType = document.getElementById('filter-type');
  const filterTable = document.getElementById('filter-table');
  const filterOrphans = document.getElementById('filter-orphans');
  return {
    type: filterType ? filterType.value : '',
    table: filterTable ? filterTable.value : '',
    orphansOnly: filterOrphans ? filterOrphans.checked : false,
  };
}

function handleFilterChange() {
  const filters = getActiveFilters();
  if (_callbacks.onFilter) {
    _callbacks.onFilter(filters);
  }
  // Re-run search with current query
  const searchInput = document.getElementById('search-input');
  const query = searchInput ? searchInput.value.trim() : '';
  if (_graph) {
    const results = searchNodes(query, _graph, filters);
    renderSearchResults(results, _graph);
  }
}

/**
 * Perform a search across graph nodes.
 * @param {string} query - The search query.
 * @param {{ nodes: Array, edges: Array }} graph - The graph.
 * @param {object} filters - Active filters { type, table, orphansOnly }.
 * @returns {Array<string>} Matching node IDs.
 */
export function searchNodes(query, graph, filters = {}) {
  if (!graph || !graph.nodes) return [];

  const connectedNodeIds = new Set();
  if (filters.orphansOnly && graph.edges) {
    for (const edge of graph.edges) {
      const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      connectedNodeIds.add(srcId);
      connectedNodeIds.add(tgtId);
    }
  }

  const lowerQuery = (query || '').toLowerCase();
  const nodes = graph.nodes instanceof Map ? Array.from(graph.nodes.values()) : (graph.nodes || []);

  return nodes
    .filter(node => {
      // Text match
      if (lowerQuery && !(node.name || '').toLowerCase().includes(lowerQuery) &&
          !(node.id || '').toLowerCase().includes(lowerQuery)) {
        return false;
      }
      // Type filter
      if (filters.type && node.type !== filters.type) {
        return false;
      }
      // Table filter
      if (filters.table) {
        const tableName = node.metadata?.table || (node.type === 'table' ? node.name : '');
        if (tableName !== filters.table) return false;
      }
      // Orphan filter
      if (filters.orphansOnly && connectedNodeIds.has(node.id)) {
        return false;
      }
      return true;
    })
    .map(node => node.id);
}

/**
 * Render search results in the results container.
 * @param {Array<string>} resultIds - Matching node IDs.
 * @param {{ nodes: Array }} graph - The graph for lookups.
 */
export function renderSearchResults(resultIds, graph) {
  const container = document.getElementById('search-results');
  if (!container) return;

  container.innerHTML = '';

  if (!resultIds || resultIds.length === 0) {
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.trim() : '';
    if (query || getActiveFilters().type || getActiveFilters().table || getActiveFilters().orphansOnly) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 8px 0;">No results found</div>';
    }
    return;
  }

  const nodeMap = graph.nodes instanceof Map ? graph.nodes : new Map();
  if (!(graph.nodes instanceof Map) && Array.isArray(graph.nodes)) {
    for (const n of graph.nodes) nodeMap.set(n.id, n);
  }

  // Limit displayed results
  const maxResults = 50;
  const displayed = resultIds.slice(0, maxResults);

  for (const nodeId of displayed) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.dataset.nodeId = nodeId;

    const badge = document.createElement('span');
    badge.className = 'type-badge';
    badge.style.background = NODE_COLORS[node.type] || '#757575';
    badge.textContent = (NODE_LABELS[node.type] || node.type || '').substring(0, 3).toUpperCase();

    const nameSpan = document.createElement('span');
    nameSpan.textContent = node.name || node.id;
    nameSpan.style.flex = '1';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';

    item.appendChild(badge);
    item.appendChild(nameSpan);

    // Show parent info for columns/measures
    if (node.metadata?.table) {
      const parentSpan = document.createElement('span');
      parentSpan.style.fontSize = '11px';
      parentSpan.style.color = 'var(--text-muted)';
      parentSpan.textContent = node.metadata.tableName;
      item.appendChild(parentSpan);
    }

    item.addEventListener('click', () => {
      if (_callbacks.onSearch) {
        _callbacks.onSearch(nodeId);
      }
    });

    container.appendChild(item);
  }

  if (resultIds.length > maxResults) {
    const more = document.createElement('div');
    more.style.cssText = 'color: var(--text-muted); font-size: 12px; padding: 8px 0; text-align: center;';
    more.textContent = `... and ${resultIds.length - maxResults} more results`;
    container.appendChild(more);
  }
}

/**
 * Update filter dropdowns from graph data.
 * @param {{ nodes: Array, edges: Array }} graph
 */
export function updateFilters(graph) {
  _graph = graph;
  if (!graph || !graph.nodes) return;

  const filterTable = document.getElementById('filter-table');
  if (filterTable) {
    const tables = new Set();
    const nodeIter = graph.nodes instanceof Map ? graph.nodes.values() : (graph.nodes || []);
    for (const node of nodeIter) {
      if (node.type === 'table') {
        tables.add(node.name || node.id);
      }
    }
    const currentVal = filterTable.value;
    filterTable.innerHTML = '<option value="">All tables</option>';
    for (const name of [...tables].sort()) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      filterTable.appendChild(opt);
    }
    filterTable.value = currentVal;
  }
}

/**
 * Clear search input and results.
 */
export function clearSearch() {
  const searchInput = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  if (searchInput) searchInput.value = '';
  if (resultsContainer) resultsContainer.innerHTML = '';
}
