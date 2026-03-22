/**
 * Filter Diff — Compares filter configurations across page, report, and visual levels.
 * Handles: filter add/remove/change with entity/property extraction.
 */

import { CHANGE_TYPES, CHANGE_SCOPES, createChange } from './changeTypes.js';

/**
 * Diff two filter arrays and return structured changes.
 * @param {Array} beforeFilters - Filters from the "before" snapshot.
 * @param {Array} afterFilters - Filters from the "after" snapshot.
 * @param {object} context - { scope, target, locationLabel }
 * @returns {Array} Array of change objects
 */
export function diffFilters(beforeFilters, afterFilters, context) {
  const changes = [];
  const { scope, target, locationLabel } = context;

  // Index filters by their name (unique identifier)
  const beforeMap = new Map();
  for (const f of beforeFilters) {
    if (f.name) beforeMap.set(f.name, f);
  }

  const afterMap = new Map();
  for (const f of afterFilters) {
    if (f.name) afterMap.set(f.name, f);
  }

  // Detect added filters
  for (const [name, filter] of afterMap) {
    if (!beforeMap.has(name)) {
      const filterDesc = describeFilter(filter);
      const changeType = scope === CHANGE_SCOPES.VISUAL
        ? CHANGE_TYPES.VISUAL_FILTER_ADDED
        : CHANGE_TYPES.FILTER_ADDED;

      changes.push(createChange({
        type: changeType,
        scope,
        target: { ...target, filterName: name },
        description: `Added filter on ${filterDesc} to ${locationLabel}`,
        details: { after: summarizeFilter(filter) },
      }));
    }
  }

  // Detect removed filters
  for (const [name, filter] of beforeMap) {
    if (!afterMap.has(name)) {
      const filterDesc = describeFilter(filter);
      const changeType = scope === CHANGE_SCOPES.VISUAL
        ? CHANGE_TYPES.VISUAL_FILTER_REMOVED
        : CHANGE_TYPES.FILTER_REMOVED;

      changes.push(createChange({
        type: changeType,
        scope,
        target: { ...target, filterName: name },
        description: `Removed filter on ${filterDesc} from ${locationLabel}`,
        details: { before: summarizeFilter(filter) },
      }));
    }
  }

  // Detect changed filters
  for (const [name, afterFilter] of afterMap) {
    const beforeFilter = beforeMap.get(name);
    if (!beforeFilter) continue;

    const beforeSummary = summarizeFilter(beforeFilter);
    const afterSummary = summarizeFilter(afterFilter);

    if (JSON.stringify(beforeSummary) !== JSON.stringify(afterSummary)) {
      const filterDesc = describeFilter(afterFilter);
      const changeType = scope === CHANGE_SCOPES.VISUAL
        ? CHANGE_TYPES.VISUAL_FILTER_CHANGED
        : CHANGE_TYPES.FILTER_CHANGED;

      // Build a more specific description
      let description = `Changed filter on ${filterDesc} in ${locationLabel}`;
      const valueDiff = describeValueChange(beforeFilter, afterFilter);
      if (valueDiff) description += `: ${valueDiff}`;

      changes.push(createChange({
        type: changeType,
        scope,
        target: { ...target, filterName: name },
        description,
        details: { before: beforeSummary, after: afterSummary },
      }));
    }
  }

  return changes;
}

/**
 * Detect report-level filter changes from report.json.
 * @param {Map<string, string>} beforeFiles
 * @param {Map<string, string>} afterFiles
 * @returns {Array} Array of change objects
 */
export function detectReportFilterChanges(beforeFiles, afterFiles) {
  const beforeReport = findReportJson(beforeFiles);
  const afterReport = findReportJson(afterFiles);

  if (!beforeReport && !afterReport) return [];

  try {
    const beforeConfig = beforeReport ? JSON.parse(beforeReport) : {};
    const afterConfig = afterReport ? JSON.parse(afterReport) : {};

    const beforeFilters = extractReportFilters(beforeConfig);
    const afterFilters = extractReportFilters(afterConfig);

    return diffFilters(beforeFilters, afterFilters, {
      scope: CHANGE_SCOPES.REPORT,
      target: {},
      locationLabel: 'filters on all pages',
    });
  } catch {
    return [];
  }
}

/**
 * Extract filters from report.json config.
 * Report filters can be in filterConfig.filters or in the legacy format.
 */
function extractReportFilters(config) {
  if (config.filterConfig?.filters) return config.filterConfig.filters;

  // Legacy format: filters are embedded in a different structure
  // Collect from the full object if filterConfig is not present
  const filters = [];
  if (config.filters && Array.isArray(config.filters)) {
    return config.filters;
  }

  // Report-level filters in PBIR are sometimes in a nested structure
  return filters;
}

/**
 * Describe a filter in human-readable form (entity name + property).
 */
function describeFilter(filter) {
  const field = filter.field;
  if (!field) return `"${filter.name || 'unknown'}"`;

  // Extract entity and property from the filter's field definition
  let entity = '';
  let property = '';

  if (field.Column) {
    entity = field.Column.Expression?.SourceRef?.Entity || '';
    property = field.Column.Property || '';
  } else if (field.Measure) {
    entity = field.Measure.Expression?.SourceRef?.Entity || '';
    property = field.Measure.Property || '';
  }

  if (entity && property) return `${entity}[${property}]`;
  if (entity) return entity;
  if (property) return property;
  return `"${filter.name || 'unknown'}"`;
}

/**
 * Summarize a filter for comparison. Extracts the meaningful parts
 * while ignoring internal IDs and metadata.
 */
function summarizeFilter(filter) {
  const summary = {
    entity: '',
    property: '',
    type: filter.type || '',
    isHiddenInViewMode: filter.isHiddenInViewMode || false,
  };

  const field = filter.field;
  if (field?.Column) {
    summary.entity = field.Column.Expression?.SourceRef?.Entity || '';
    summary.property = field.Column.Property || '';
  } else if (field?.Measure) {
    summary.entity = field.Measure.Expression?.SourceRef?.Entity || '';
    summary.property = field.Measure.Property || '';
  }

  // Extract selected values from the filter condition
  summary.values = extractFilterValues(filter);

  return summary;
}

/**
 * Extract the selected/applied values from a filter's Where clause.
 */
function extractFilterValues(filter) {
  const values = [];

  const where = filter.filter?.Where;
  if (!Array.isArray(where)) return values;

  for (const clause of where) {
    const inExpr = clause.Condition?.In;
    if (inExpr?.Values) {
      for (const valArr of inExpr.Values) {
        for (const val of valArr) {
          if (val.Literal?.Value) {
            // Strip surrounding quotes
            values.push(val.Literal.Value.replace(/^'|'$/g, ''));
          }
        }
      }
    }

    // Handle Not/In patterns
    const notExpr = clause.Condition?.Not?.Expression?.In;
    if (notExpr?.Values) {
      for (const valArr of notExpr.Values) {
        for (const val of valArr) {
          if (val.Literal?.Value) {
            values.push('NOT: ' + val.Literal.Value.replace(/^'|'$/g, ''));
          }
        }
      }
    }

    // Handle comparison conditions (greater than, less than, etc.)
    const comparison = clause.Condition?.Comparison || clause.Condition?.comparison;
    if (comparison) {
      const op = comparison.ComparisonKind ?? '';
      const right = comparison.Right?.Literal?.Value;
      if (right !== undefined) {
        values.push(`${op} ${String(right).replace(/^'|'$/g, '')}`);
      }
    }
  }

  return values;
}

/**
 * Describe what changed in the filter values between before and after.
 */
function describeValueChange(beforeFilter, afterFilter) {
  const beforeValues = extractFilterValues(beforeFilter);
  const afterValues = extractFilterValues(afterFilter);

  if (beforeValues.length === 0 && afterValues.length === 0) return '';

  const added = afterValues.filter(v => !beforeValues.includes(v));
  const removed = beforeValues.filter(v => !afterValues.includes(v));

  const parts = [];
  if (added.length > 0) parts.push(`selected ${added.map(v => `"${v}"`).join(', ')}`);
  if (removed.length > 0) parts.push(`deselected ${removed.map(v => `"${v}"`).join(', ')}`);

  return parts.join('; ');
}

/**
 * Find report.json content in a file map.
 */
function findReportJson(files) {
  for (const [path, content] of files) {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.endsWith('/report.json') || lower === 'definition/report.json') {
      return content;
    }
  }
  return null;
}
