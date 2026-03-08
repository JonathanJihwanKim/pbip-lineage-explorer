export const NODE_TYPES = {
  TABLE: 'table',
  COLUMN: 'column',
  MEASURE: 'measure',
  VISUAL: 'visual',
  PAGE: 'page',
  SOURCE: 'source'
};

export const NODE_COLORS = {
  table: '#4285f4',
  column: '#9c27b0',
  measure: '#ff9800',
  visual: '#4caf50',
  page: '#00bcd4',
  source: '#757575'
};

export const NODE_LABELS = {
  table: 'Table',
  column: 'Column',
  measure: 'Measure',
  visual: 'Visual',
  page: 'Page',
  source: 'Source'
};

export const EDGE_TYPES = {
  VISUAL_TO_FIELD: 'visual_to_field',
  MEASURE_TO_MEASURE: 'measure_to_measure',
  MEASURE_TO_COLUMN: 'measure_to_column',
  COLUMN_TO_TABLE: 'column_to_table',
  TABLE_RELATIONSHIP: 'table_relationship',
  VISUAL_TO_PAGE: 'visual_to_page',
  FIELD_PARAM_TO_FIELD: 'field_param_to_field',
  TABLE_TO_SOURCE: 'table_to_source'
};

export const ENRICHMENT_TYPES = {
  FIELD_PARAMETER: 'field_parameter',
  CALCULATION_GROUP: 'calculation_group'
};

export const LAYOUT_TYPES = {
  FORCE: 'force',
  TREE: 'tree'
};
