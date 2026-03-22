/**
 * Change type constants and factory functions for the change detection system.
 */

export const CHANGE_TYPES = {
  DEFAULT_PAGE_CHANGED: 'default_page_changed',
  PAGE_ADDED: 'page_added',
  PAGE_REMOVED: 'page_removed',
  FILTER_ADDED: 'filter_added',
  FILTER_REMOVED: 'filter_removed',
  FILTER_CHANGED: 'filter_changed',
  MEASURE_CHANGED: 'measure_changed',
  MEASURE_ADDED: 'measure_added',
  MEASURE_REMOVED: 'measure_removed',
  VISUAL_VISIBILITY_CHANGED: 'visual_visibility_changed',
  VISUAL_FILTER_ADDED: 'visual_filter_added',
  VISUAL_FILTER_REMOVED: 'visual_filter_removed',
  VISUAL_FILTER_CHANGED: 'visual_filter_changed',
  VISUAL_BOOKMARK_CHANGED: 'visual_bookmark_changed',
  VISUAL_ADDED: 'visual_added',
  VISUAL_REMOVED: 'visual_removed',
  VISUAL_FIELD_CHANGED: 'visual_field_changed',
  BOOKMARK_CHANGED: 'bookmark_changed',
  CALC_ITEM_CHANGED: 'calc_item_changed',
  CALC_ITEM_ADDED: 'calc_item_added',
  CALC_ITEM_REMOVED: 'calc_item_removed',
};

export const CHANGE_SCOPES = {
  PAGE: 'page',
  REPORT: 'report',
  VISUAL: 'visual',
  MEASURE: 'measure',
  BOOKMARK: 'bookmark',
};

/**
 * Create a structured change object.
 * @param {object} opts
 * @returns {object}
 */
export function createChange({ type, scope, target, description, impact = [], details = {} }) {
  return { type, scope, target, description, impact, details };
}
