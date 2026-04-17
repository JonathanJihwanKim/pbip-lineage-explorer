/**
 * Shared data helpers for page layout views — used by the full canvas and
 * the sidebar thumbnail preview. Centralises visual collection, group-offset
 * resolution, and the shared type/category/escape utilities.
 */

/**
 * Collect and resolve all visuals on a given page node.
 * Returns the raw list (all types, including hidden and group wrappers)
 * plus derived geometry: pageW, pageH, and contentMaxY (bounding box bottom).
 * @param {object} pageNode
 * @param {object} graph
 * @returns {{ pageW: number, pageH: number, contentMaxY: number, visuals: Array }}
 */
export function collectPageVisuals(pageNode, graph) {
  const pageW = pageNode.metadata.width || 1280;
  const pageH = pageNode.metadata.height || 720;
  const pageId = pageNode.metadata.pageId;

  const visuals = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'visual') continue;
    if (node.metadata.pageId !== pageId) continue;

    let measureCount = 0;
    let columnCount = 0;
    const measures = [];
    const columns = [];
    const fpTables = [];
    const fpMeasures = [];
    const upstream = graph.adjacency.upstream.get(node.id) || [];

    for (const upId of upstream) {
      const upNode = graph.nodes.get(upId);
      if (!upNode) continue;
      if (upNode.type === 'measure') {
        measureCount++;
        measures.push(upNode.name);
      } else if (upNode.type === 'column') {
        columnCount++;
        columns.push(`${upNode.metadata?.table || ''}.${upNode.name}`);
      } else if (upNode.type === 'table' && upNode.enrichment?.type === 'field_parameter') {
        fpTables.push(upNode.name);
        const fpUp = graph.adjacency.upstream.get(upNode.id) || [];
        for (const fpUpId of fpUp) {
          const fpUpNode = graph.nodes.get(fpUpId);
          if (!fpUpNode) continue;
          if (fpUpNode.type === 'measure') {
            fpMeasures.push(fpUpNode.name);
          } else if (fpUpNode.type === 'column') {
            columns.push(`${fpUpNode.metadata?.table || ''}.${fpUpNode.name}`);
            columnCount++;
          }
        }
      }
    }

    visuals.push({
      id: node.id,
      title: node.metadata.title || node.name || '',
      type: node.metadata.visualType || 'unknown',
      position: node.metadata.position ? { ...node.metadata.position } : null,
      isHidden: node.metadata.isHidden || false,
      parentGroupName: node.metadata.parentGroupName || null,
      measureCount: measureCount + fpMeasures.length,
      columnCount,
      measures,
      fpMeasures,
      fpTables,
      columns,
    });
  }

  // Resolve group-relative positions: children store coordinates relative to
  // their parent group. Groups can be nested, so we walk the chain recursively.
  const groupMap = new Map();
  for (const v of visuals) {
    if (v.type === 'group') {
      const groupName = v.id.split('/').pop();
      groupMap.set(groupName, { position: v.position, parentGroupName: v.parentGroupName });
    }
  }

  function getGroupAbsoluteOffset(groupName, visited = new Set()) {
    if (!groupName || visited.has(groupName)) return { x: 0, y: 0 };
    visited.add(groupName);
    const group = groupMap.get(groupName);
    if (!group || !group.position) return { x: 0, y: 0 };
    const parentOffset = getGroupAbsoluteOffset(group.parentGroupName, visited);
    return {
      x: (group.position.x || 0) + parentOffset.x,
      y: (group.position.y || 0) + parentOffset.y,
    };
  }

  for (const v of visuals) {
    if (v.parentGroupName && v.position) {
      const offset = getGroupAbsoluteOffset(v.parentGroupName);
      v.position = {
        ...v.position,
        x: (v.position.x || 0) + offset.x,
        y: (v.position.y || 0) + offset.y,
      };
    }
  }

  // contentMaxY: the farthest bottom edge of any non-group positioned visual.
  // Exceeds pageH on scrollable pages — used to size the canvas correctly.
  let contentMaxY = pageH;
  for (const v of visuals) {
    if (v.position && v.type !== 'group') {
      const bottom = (v.position.y || 0) + (v.position.height || 0);
      if (bottom > contentMaxY) contentMaxY = bottom;
    }
  }

  return { pageW, pageH, contentMaxY, visuals };
}

export function shortType(type) {
  if (!type) return '?';
  const map = {
    barChart: 'Bar', columnChart: 'Col', lineChart: 'Line', areaChart: 'Area',
    pieChart: 'Pie', donutChart: 'Donut', card: 'Card', multiRowCard: 'mCard',
    tableEx: 'Table', matrix: 'Matrix', slicer: 'Slicer', map: 'Map',
    filledMap: 'Map', scatterChart: 'Scatter', waterfallChart: 'Waterfall',
    funnel: 'Funnel', gauge: 'Gauge', kpi: 'KPI', treemap: 'Tree',
    image: 'Img', textbox: 'Text', shape: 'Shape', actionButton: 'Btn',
    pivotTable: 'Pivot', clusteredColumnChart: 'CCol', clusteredBarChart: 'CBar',
    stackedColumnChart: 'SCol', stackedBarChart: 'SBar',
    hundredPercentStackedColumnChart: '%Col', hundredPercentStackedBarChart: '%Bar',
    lineClusteredColumnComboChart: 'Combo', decompositionTreeVisual: 'DTree',
    ribbonChart: 'Ribn', cardVisual: 'nCard',
  };
  return map[type] || type.substring(0, 5);
}

export function typeCategory(type) {
  const charts = new Set([
    'barChart', 'columnChart', 'lineChart', 'areaChart', 'pieChart', 'donutChart',
    'scatterChart', 'waterfallChart', 'funnel', 'ribbonChart', 'treemap',
    'clusteredColumnChart', 'clusteredBarChart', 'stackedColumnChart', 'stackedBarChart',
    'hundredPercentStackedColumnChart', 'hundredPercentStackedBarChart',
    'lineClusteredColumnComboChart', 'decompositionTreeVisual',
  ]);
  const tables = new Set(['tableEx', 'matrix', 'pivotTable']);
  const cards = new Set(['card', 'multiRowCard', 'kpi', 'gauge', 'cardVisual']);
  const filters = new Set(['slicer']);
  if (charts.has(type)) return 'chart';
  if (tables.has(type)) return 'table';
  if (cards.has(type)) return 'card';
  if (filters.has(type)) return 'filter';
  return 'other';
}

export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
