/**
 * PBIR Parser - Parses Power BI Report (PBIR) visual configuration files.
 * Extracts pages, visuals, and their field bindings to connect visuals
 * to model objects (measures, columns).
 */

/**
 * Parse all PBIR report files and extract pages and visuals.
 * @param {Array<{path: string, content: string}>} visualFiles - Visual JSON file entries.
 * @param {Array<{path: string, content: string}>} pageFiles - Page JSON file entries.
 * @returns {{ pages: Array, visuals: Array }}
 */
export function parsePbirReport(visualFiles, pageFiles) {
  const pages = [];
  const visuals = [];

  // Parse page definitions
  for (const { path, content } of pageFiles) {
    try {
      const config = JSON.parse(content);
      const pageFolderId = extractPageIdFromPath(path);
      const pageName = extractPageName(path, config);
      pages.push({
        id: pageFolderId || pageName,
        name: pageName,
        displayName: config.displayName || config.name || pageName,
        order: config.ordinal ?? config.order ?? pages.length,
        width: config.width || config.defaultSize?.width || 1280,
        height: config.height || config.defaultSize?.height || 720,
        path,
      });
    } catch (err) {
      // Non-JSON page file or parse error — derive name from path
      const pageName = extractPageName(path, null);
      const pageFolderId2 = extractPageIdFromPath(path);
      if (pageName) {
        pages.push({
          id: pageFolderId2 || pageName,
          name: pageName,
          displayName: pageName,
          order: pages.length,
          path,
        });
      }
    }
  }

  // Parse visual configs
  for (const { path, content } of visualFiles) {
    try {
      const config = JSON.parse(content);
      const pageId = extractPageIdFromPath(path);
      const parsed = parseVisualConfig(config, pageId);
      parsed.path = path;
      visuals.push(parsed);
    } catch (err) {
      console.warn(`Failed to parse visual config: ${path}`, err);
    }
  }

  return { pages, visuals };
}

/**
 * Extract the page name from a file path or config object.
 * @param {string} path
 * @param {object|null} config
 * @returns {string}
 */
function extractPageName(path, config) {
  if (config && (config.displayName || config.name)) {
    return config.displayName || config.name;
  }
  // Derive from path: .../pages/PageName/page.json or .../SomePage/...
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const pageIdx = parts.findIndex(p => p.toLowerCase() === 'pages');
  if (pageIdx !== -1 && pageIdx + 1 < parts.length) {
    return parts[pageIdx + 1];
  }
  // Fallback: use parent directory name
  const jsonIdx = parts.length - 1;
  return parts[Math.max(0, jsonIdx - 1)];
}

/**
 * Extract page identifier from a visual's file path.
 * Expected pattern: .../pages/<pageId>/visuals/<visualId>/visual.json
 * @param {string} path
 * @returns {string}
 */
function extractPageIdFromPath(path) {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const pagesIdx = parts.findIndex(p => p.toLowerCase() === 'pages');
  if (pagesIdx !== -1 && pagesIdx + 1 < parts.length) {
    return parts[pagesIdx + 1];
  }
  return '';
}



/**
 * Parse a single visual configuration JSON file.
 * @param {object} config - The parsed JSON config for a visual.
 * @param {string} pageName - The page this visual belongs to.
 * @returns {{ id: string, type: string, page: string, title: string, fields: Array }}
 */
export function parseVisualConfig(config, pageName) {
  const visual = config.visual || config;

  const id = visual.id || config.id || config.name || '';
  // Detect group visuals via the visualGroup property
  const isGroup = !!config.visualGroup;
  const visualType = isGroup ? 'group' : (visual.visualType || visual.type || config.visualType || 'unknown');

  // Extract title from various possible locations
  let title = '';
  if (visual.title) {
    title = typeof visual.title === 'string' ? visual.title : (visual.title.text || '');
  }
  if (!title && visual.objects?.title?.properties?.text) {
    const textProp = visual.objects.title.properties.text;
    if (typeof textProp === 'string') title = textProp;
    else if (textProp.expr?.Literal?.Value) title = textProp.expr.Literal.Value.replace(/^'|'$/g, '');
  }
  if (!title && visual.vcObjects?.title) {
    const titleArr = visual.vcObjects.title;
    if (Array.isArray(titleArr) && titleArr[0]?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, '');
    } else if (titleArr?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr.properties.text.expr.Literal.Value.replace(/^'|'$/g, '');
    }
  }
  // PBIR format: visualContainerObjects.title
  if (!title && visual.visualContainerObjects?.title) {
    const titleArr = visual.visualContainerObjects.title;
    if (Array.isArray(titleArr) && titleArr[0]?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr[0].properties.text.expr.Literal.Value.replace(/^'|'$/g, '');
    } else if (titleArr?.properties?.text?.expr?.Literal?.Value) {
      title = titleArr.properties.text.expr.Literal.Value.replace(/^'|'$/g, '');
    }
  }

  const fields = extractFieldReferences(visual, config);

  // Extract hidden state
  const isHidden = config.isHidden === true || visual.isHidden === true;

  // parentGroupName is stored directly in the visual config JSON
  const parentGroupName = config.parentGroupName || null;

  // For group visuals, extract the display name
  if (isGroup && !title && config.visualGroup?.displayName) {
    title = config.visualGroup.displayName;
  }

  return {
    id,
    type: visualType,
    visualType,
    page: pageName,
    pageId: pageName,
    title,
    fields,
    position: config.position || null,
    isHidden,
    parentGroupName,
  };
}

/**
 * Extract field references from a visual's data bindings and query.
 * @param {object} visualConfig - The visual configuration object.
 * @returns {Array<{ type: string, table: string, column: string|null, measure: string|null, role: string }>}
 */
export function extractFieldReferences(visualConfig, fullConfig) {
  const fields = [];
  const seen = new Set();

  function addField(field) {
    const key = `${field.type}|${field.table}|${field.column || ''}|${field.measure || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      fields.push(field);
    }
  }

  // 1. Extract from prototypeQuery.Select (traditional PBI format)
  const query = visualConfig.prototypeQuery || visualConfig.query;
  const sourceAliasMap = {};
  if (query?.From) {
    for (const from of query.From) {
      if (from.Name && from.Entity) {
        sourceAliasMap[from.Name] = from.Entity;
      }
    }
  }
  if (query?.Select) {
    for (const selectItem of query.Select) {
      const ref = extractFromSelectItem(selectItem, sourceAliasMap);
      if (ref) addField(ref);
    }
  }

  // 2. Extract from PBIR queryState projections
  // PBIR format: visual.query.queryState.<DataRole>.projections[].field
  // Each field is { Column: { Expression: { SourceRef: { Entity } }, Property } }
  // or { Measure: { Expression: { SourceRef: { Entity } }, Property } }
  const queryState = visualConfig.query?.queryState || visualConfig.queryState;
  if (queryState) {
    for (const [role, roleState] of Object.entries(queryState)) {
      if (!roleState || typeof roleState !== 'object') continue;

      // Extract from projections
      const projections = roleState.projections;
      if (Array.isArray(projections)) {
        for (const proj of projections) {
          const ref = extractFromPbirProjection(proj, role);
          if (ref) addField(ref);
        }
      }

      // Extract field parameters
      const fieldParams = roleState.fieldParameters;
      if (Array.isArray(fieldParams)) {
        for (const fp of fieldParams) {
          const paramExpr = fp.parameterExpr || fp.ParameterExpr;
          if (!paramExpr) continue;
          const col = paramExpr.Column || paramExpr.column;
          if (!col) continue;
          const sourceRef = col.Expression?.SourceRef || col.expression?.sourceRef;
          const entity = sourceRef?.Entity || sourceRef?.entity || '';
          if (entity) {
            addField({ type: 'fieldParameter', table: entity, column: null, measure: null, role });
          }
        }
      }
    }
  }

  // 3. Extract from dataRoleBindings / columnBindings (older format)
  const bindings = visualConfig.dataRoleBindings || visualConfig.columnBindings;
  if (bindings) {
    for (const [role, binding] of Object.entries(bindings)) {
      const items = Array.isArray(binding) ? binding : (binding.items || binding.bindings || [binding]);
      for (const item of items) {
        const ref = extractFromBinding(item, role);
        if (ref) addField(ref);
      }
    }
  }

  // 4. Extract from filterConfig.filters (PBIR format — at top-level config)
  const filterConfig = fullConfig?.filterConfig?.filters || visualConfig.filterConfig?.filters || [];
  for (const filter of filterConfig) {
    if (filter.field) {
      const ref = extractFromPbirField(filter.field, 'filter');
      if (ref) addField(ref);
    }
  }

  // 5. Deep search for SourceRef patterns in vcObjects, objects, projections, dataTransforms
  deepSearchForRefs(visualConfig.vcObjects, addField);
  deepSearchForRefs(visualConfig.visualContainerObjects, addField);
  deepSearchForRefs(visualConfig.dataTransforms, addField);

  return fields;
}

/**
 * Extract a field reference from a PBIR queryState projection item.
 * PBIR format: { field: { Measure: { Expression: { SourceRef: { Entity } }, Property } } }
 * or { field: { Column: { Expression: { SourceRef: { Entity } }, Property } } }
 */
function extractFromPbirProjection(proj, role) {
  const field = proj?.field;
  if (!field) return null;
  return extractFromPbirField(field, role);
}

/**
 * Extract a field reference from a PBIR field object.
 * Handles both Measure and Column patterns with direct Entity references.
 */
function extractFromPbirField(field, role) {
  if (!field) return null;

  // Measure reference
  if (field.Measure) {
    const entity = field.Measure.Expression?.SourceRef?.Entity || '';
    const property = field.Measure.Property || '';
    if (entity || property) {
      return { type: 'measure', table: entity, column: null, measure: property, role: role || '' };
    }
  }

  // Column reference
  if (field.Column) {
    const entity = field.Column.Expression?.SourceRef?.Entity || '';
    const property = field.Column.Property || '';
    if (entity || property) {
      return { type: 'column', table: entity, column: property, measure: null, role: role || '' };
    }
  }

  // Aggregation wrapping a column
  if (field.Aggregation) {
    const expr = field.Aggregation.Expression;
    if (expr?.Column) {
      const entity = expr.Column.Expression?.SourceRef?.Entity || '';
      const property = expr.Column.Property || '';
      if (entity || property) {
        return { type: 'column', table: entity, column: property, measure: null, role: role || '' };
      }
    }
  }

  return null;
}

/**
 * Extract field parameter table references from a visual's queryState.
 * When a visual uses a field parameter, the queryState contains a fieldParameters
 * block under data roles (Values, Rows, Columns, etc.) that references the
 * field parameter table via parameterExpr.Column.Expression.SourceRef.Entity.
 * @param {object} queryState - The visual's queryState object.
 * @param {function} addField - Callback to add found field references.
 * @param {object} sourceAliasMap - Map of source aliases to entity names.
 */
function extractFieldParameterRefs(queryState, addField, sourceAliasMap) {
  if (!queryState || typeof queryState !== 'object') return;

  // Walk each data role (Values, Rows, Columns, etc.)
  for (const [role, roleState] of Object.entries(queryState)) {
    if (!roleState || typeof roleState !== 'object') continue;

    // Check for fieldParameters array
    const fieldParams = roleState.fieldParameters;
    if (!Array.isArray(fieldParams)) continue;

    for (const fp of fieldParams) {
      // Extract the field parameter table name from parameterExpr
      const paramExpr = fp.parameterExpr || fp.ParameterExpr;
      if (!paramExpr) continue;

      const col = paramExpr.Column || paramExpr.column;
      if (!col) continue;

      const sourceRef = col.Expression?.SourceRef || col.expression?.sourceRef;
      if (!sourceRef) continue;

      const entity = sourceRef.Entity || sourceRef.entity ||
        (sourceRef.Source && sourceAliasMap[sourceRef.Source]) || '';

      if (entity) {
        addField({
          type: 'fieldParameter',
          table: entity,
          column: null,
          measure: null,
          role: role,
        });
      }
    }
  }
}

/**
 * Extract a field reference from a prototypeQuery Select item.
 * @param {object} selectItem
 * @returns {{ type: string, table: string, column: string|null, measure: string|null, role: string }|null}
 */
function extractFromSelectItem(selectItem, sourceAliasMap = {}) {
  function resolveEntity(sourceRef) {
    if (!sourceRef) return '';
    // Direct Entity reference
    if (sourceRef.Entity) return sourceRef.Entity;
    // Alias-based: resolve Source alias to Entity name
    if (sourceRef.Source && sourceAliasMap[sourceRef.Source]) {
      return sourceAliasMap[sourceRef.Source];
    }
    return sourceRef.Source || '';
  }

  // Column reference
  if (selectItem.Column) {
    const col = selectItem.Column;
    const entity = resolveEntity(col.Expression?.SourceRef);
    const property = col.Property || col.Name || '';
    if (entity || property) {
      return {
        type: 'column',
        table: entity,
        column: property,
        measure: null,
        role: selectItem.Name || '',
      };
    }
  }

  // Measure reference
  if (selectItem.Measure) {
    const meas = selectItem.Measure;
    const entity = resolveEntity(meas.Expression?.SourceRef);
    const property = meas.Property || meas.Name || '';
    if (entity || property) {
      return {
        type: 'measure',
        table: entity,
        column: null,
        measure: property,
        role: selectItem.Name || '',
      };
    }
  }

  // Aggregation wrapping a column
  if (selectItem.Aggregation) {
    const agg = selectItem.Aggregation;
    const expr = agg.Expression;
    if (expr?.Column) {
      const entity = resolveEntity(expr.Column.Expression?.SourceRef);
      const property = expr.Column.Property || '';
      if (entity || property) {
        return {
          type: 'column',
          table: entity,
          column: property,
          measure: null,
          role: selectItem.Name || '',
        };
      }
    }
  }

  return null;
}

/**
 * Extract a field reference from a data role binding item.
 * @param {object} item
 * @param {string} role
 * @returns {{ type: string, table: string, column: string|null, measure: string|null, role: string }|null}
 */
function extractFromBinding(item, role) {
  if (!item || typeof item !== 'object') return null;

  // Direct table/column/measure properties
  if (item.table && (item.column || item.measure)) {
    return {
      type: item.measure ? 'measure' : 'column',
      table: item.table,
      column: item.column || null,
      measure: item.measure || null,
      role,
    };
  }

  // Nested expression format
  const expr = item.Expression || item.expression || item;
  if (expr?.SourceRef?.Entity) {
    return {
      type: item.measure || item.Measure ? 'measure' : 'column',
      table: expr.SourceRef.Entity,
      column: item.Property || item.column || null,
      measure: item.Property || item.measure || null,
      role,
    };
  }

  return null;
}

/**
 * Recursively search an object for SourceRef/Entity/Property patterns.
 * @param {*} obj
 * @param {function} addField - Callback to add found field references.
 * @param {number} [depth=0]
 */
function deepSearchForRefs(obj, addField, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 15) return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepSearchForRefs(item, addField, depth + 1);
    }
    return;
  }

  // Check if this object has SourceRef with Entity
  if (obj.SourceRef?.Entity && obj.Property) {
    // Determine type from context
    addField({
      type: 'column', // default; caller context may override
      table: obj.SourceRef.Entity,
      column: obj.Property,
      measure: null,
      role: '',
    });
  }

  // Check Column/Measure wrapper
  if (obj.Column?.Expression?.SourceRef?.Entity) {
    addField({
      type: 'column',
      table: obj.Column.Expression.SourceRef.Entity,
      column: obj.Column.Property || '',
      measure: null,
      role: obj.Name || '',
    });
  }
  if (obj.Measure?.Expression?.SourceRef?.Entity) {
    addField({
      type: 'measure',
      table: obj.Measure.Expression.SourceRef.Entity,
      column: null,
      measure: obj.Measure.Property || '',
      role: obj.Name || '',
    });
  }

  // Recurse into child properties
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      deepSearchForRefs(value, addField, depth + 1);
    }
  }
}
