/**
 * Enrichment - Detects and tags advanced PBIP patterns.
 * Identifies field parameters, calculation groups, and other
 * enrichment metadata to annotate nodes in the lineage graph.
 */

import { ENRICHMENT_TYPES } from '../utils/constants.js';

/**
 * Detect if a table is a field parameter.
 * Field parameters use NAMEOF in column expressions and typically
 * have a SWITCH(SELECTEDVALUE(...)) measure that maps values to fields.
 * @param {{ name: string, columns: Array, measures: Array }} table
 * @returns {{ isFieldParam: boolean, referencedFields: Array<{name: string, reference: string}>, switchMeasure: string|null }}
 */
export function detectFieldParameter(table) {
  const result = { isFieldParam: false, referencedFields: [], switchMeasure: null };
  if (!table) return result;

  const columns = table.columns || [];
  const measures = table.measures || [];

  // Look for NAMEOF pattern in column expressions
  const nameofPattern = /NAMEOF\s*\(\s*(?:'([^']+)'\s*\[([^\]]+)\]|\[([^\]]+)\])\s*\)/gi;
  const nameofFields = [];

  for (const col of columns) {
    const expr = col.expression || col.daxExpression || '';
    let m;
    nameofPattern.lastIndex = 0;
    while ((m = nameofPattern.exec(expr)) !== null) {
      if (m[1] && m[2]) {
        nameofFields.push({ name: m[2], reference: `'${m[1]}'[${m[2]}]` });
      } else if (m[3]) {
        nameofFields.push({ name: m[3], reference: `[${m[3]}]` });
      }
    }
  }

  if (nameofFields.length === 0) return result;

  result.isFieldParam = true;
  result.referencedFields = nameofFields;

  // Look for SWITCH(SELECTEDVALUE(...)) measure
  for (const measure of measures) {
    const expr = measure.expression || measure.daxExpression || '';
    if (/SWITCH\s*\(\s*SELECTEDVALUE\s*\(/i.test(expr)) {
      result.switchMeasure = measure.name;

      // Extract all branch options from the SWITCH
      // Pattern: number/value , [MeasureRef] or 'Table'[Column]
      const switchBranchPattern = /,\s*(?:\d+|"[^"]*")\s*,\s*(?:'([^']+)'\s*\[([^\]]+)\]|\[([^\]]+)\])/g;
      let branchMatch;
      while ((branchMatch = switchBranchPattern.exec(expr)) !== null) {
        const name = branchMatch[2] || branchMatch[3];
        let reference;
        if (branchMatch[1] && branchMatch[2]) {
          reference = `'${branchMatch[1]}'[${branchMatch[2]}]`;
        } else if (branchMatch[3]) {
          reference = `[${branchMatch[3]}]`;
        }
        // Add if not already found via NAMEOF
        if (name && !result.referencedFields.some(f => f.name === name)) {
          result.referencedFields.push({ name, reference });
        }
      }
      break;
    }
  }

  return result;
}

/**
 * Detect if a table is a calculation group.
 * Calculation groups have calculationGroup in their TMDL properties
 * or use CALCULATIONGROUP() function references.
 * @param {{ name: string, columns: Array, measures: Array, properties?: object, calculationItems?: Array }} table
 * @returns {{ isCalcGroup: boolean, calculationItems: Array<{name: string, expression: string}> }}
 */
export function detectCalculationGroup(table) {
  const result = { isCalcGroup: false, calculationItems: [] };
  if (!table) return result;

  // Check for explicit calculationGroup property in TMDL
  const props = table.properties || {};
  if (props.calculationGroup || table.calculationGroup) {
    result.isCalcGroup = true;
  }

  // Check if any column/measure references CALCULATIONGROUP()
  const allExprs = [
    ...(table.columns || []).map(c => c.expression || c.daxExpression || ''),
    ...(table.measures || []).map(m => m.expression || m.daxExpression || '')
  ];
  for (const expr of allExprs) {
    if (/CALCULATIONGROUP\s*\(/i.test(expr)) {
      result.isCalcGroup = true;
      break;
    }
  }

  // Extract calculation items
  if (table.calculationItems && Array.isArray(table.calculationItems)) {
    result.isCalcGroup = true;
    result.calculationItems = table.calculationItems.map(item => ({
      name: item.name || '',
      expression: item.expression || item.daxExpression || ''
    }));
  }

  return result;
}

/**
 * Analyze parsed model data and detect enrichment patterns.
 * @param {Array} tables - Array of parsed table objects.
 * @param {Array} [measures] - Array of parsed measure objects (optional, may be embedded in tables).
 * @returns {{ fieldParameters: Array, calculationGroups: Array }}
 */
export function detectEnrichments(tables, measures) {
  const fieldParameters = [];
  const calculationGroups = [];

  if (!tables || !Array.isArray(tables)) {
    return { fieldParameters, calculationGroups };
  }

  for (const table of tables) {
    const fpResult = detectFieldParameter(table);
    if (fpResult.isFieldParam) {
      fieldParameters.push({
        tableName: table.name,
        fields: fpResult.referencedFields,
        switchMeasure: fpResult.switchMeasure
      });
    }

    const cgResult = detectCalculationGroup(table);
    if (cgResult.isCalcGroup) {
      calculationGroups.push({
        tableName: table.name,
        items: cgResult.calculationItems
      });
    }
  }

  return { fieldParameters, calculationGroups };
}

/**
 * Apply enrichment metadata to graph nodes.
 * Tags field parameter and calculation group nodes with badges and metadata.
 * @param {{ nodes: Array, edges: Array }} graph - The lineage graph.
 * @param {{ fieldParameters: Array, calculationGroups: Array }} enrichments - Detected enrichments.
 * @returns {{ nodes: Array, edges: Array }} The graph with enrichment metadata applied.
 */
export function applyEnrichments(graph, enrichments) {
  if (!graph || !enrichments) return graph;

  const { fieldParameters = [], calculationGroups = [] } = enrichments;

  // Index enrichments by table name for quick lookup
  const fpMap = new Map();
  for (const fp of fieldParameters) {
    fpMap.set(fp.tableName, fp);
  }
  const cgMap = new Map();
  for (const cg of calculationGroups) {
    cgMap.set(cg.tableName, cg);
  }

  // Tag matching nodes
  for (const node of graph.nodes.values()) {
    const tableName = node.metadata?.table || node.name || node.id;

    if (fpMap.has(tableName)) {
      const fp = fpMap.get(tableName);
      node.metadata = node.metadata || {};
      node.metadata.enrichmentType = ENRICHMENT_TYPES.FIELD_PARAMETER;
      node.metadata.badge = 'FP';
      node.metadata.fieldParameter = {
        fields: fp.fields,
        switchMeasure: fp.switchMeasure
      };
    }

    if (cgMap.has(tableName)) {
      const cg = cgMap.get(tableName);
      node.metadata = node.metadata || {};
      node.metadata.enrichmentType = ENRICHMENT_TYPES.CALCULATION_GROUP;
      node.metadata.badge = 'CG';
      node.metadata.calculationGroup = {
        items: cg.items
      };
    }
  }

  return graph;
}
