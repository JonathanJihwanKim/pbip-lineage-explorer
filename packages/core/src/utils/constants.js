export const NODE_TYPES = {
  TABLE: 'table',
  COLUMN: 'column',
  MEASURE: 'measure',
  VISUAL: 'visual',
  PAGE: 'page',
  SOURCE: 'source',
  EXPRESSION: 'expression',
};

export const NODE_COLORS = {
  table: '#4285f4',
  column: '#9c27b0',
  measure: '#ff9800',
  visual: '#4caf50',
  page: '#00bcd4',
  source: '#757575',
  expression: '#795548',
};

export const NODE_LABELS = {
  table: 'Table',
  column: 'Column',
  measure: 'Measure',
  visual: 'Visual',
  page: 'Page',
  source: 'Source',
  expression: 'Expression',
};

export const EDGE_COLORS = {
  visual_to_field: '#4caf50',
  visual_to_page: '#00bcd4',
  measure_to_measure: '#ff9800',
  measure_to_column: '#ce93d8',
  measure_to_userelationship: '#ff5722',
  column_to_table: '#64b5f6',
  calc_column_to_column: '#ba68c8',
  calc_column_to_measure: '#ffb74d',
  table_relationship: '#546e7a',
  table_to_source: '#90a4ae',
  table_to_expression: '#8d6e63',
  expression_to_source: '#a1887f',
  field_param_to_field: '#e91e63',
  column_to_source_column: '#78909c',
};

export const EDGE_TYPES = {
  VISUAL_TO_FIELD: 'visual_to_field',
  MEASURE_TO_MEASURE: 'measure_to_measure',
  MEASURE_TO_COLUMN: 'measure_to_column',
  COLUMN_TO_TABLE: 'column_to_table',
  TABLE_RELATIONSHIP: 'table_relationship',
  VISUAL_TO_PAGE: 'visual_to_page',
  FIELD_PARAM_TO_FIELD: 'field_param_to_field',
  TABLE_TO_SOURCE: 'table_to_source',
  CALC_COLUMN_TO_COLUMN: 'calc_column_to_column',
  CALC_COLUMN_TO_MEASURE: 'calc_column_to_measure',
  MEASURE_TO_USERELATIONSHIP: 'measure_to_userelationship',
  TABLE_TO_EXPRESSION: 'table_to_expression',
  EXPRESSION_TO_SOURCE: 'expression_to_source',
  COLUMN_TO_SOURCE_COLUMN: 'column_to_source_column',
};

export const ENRICHMENT_TYPES = {
  FIELD_PARAMETER: 'field_parameter',
  CALCULATION_GROUP: 'calculation_group'
};

/** Colors for the 6-layer lineage tree visualization */
export const LAYER_COLORS = {
  visual: '#4caf50',
  measure: '#ff9800',
  subMeasure: '#ffb74d',
  table: '#4285f4',
  column: '#9c27b0',
  expression: '#795548',
  source: '#607d8b',
  hub: '#546e7a',
};

/** Labels for the 6 lineage layers */
export const LAYER_LABELS = {
  1: 'Report Visual',
  2: 'DAX Measure',
  3: 'DAX Sub-Measure',
  4: 'PBI Table & Column',
  5: 'Power Query',
  6: 'Source Connection',
};
