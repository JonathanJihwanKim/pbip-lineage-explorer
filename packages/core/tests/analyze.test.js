import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  identifyProjectStructure,
  analyze,
  findOrphans,
  traceMeasureLineage,
  traceVisualLineage,
  extractMDataSource,
  createNode,
  createEdge,
  buildAdjacency,
  NODE_TYPES,
  EDGE_TYPES,
} from '../src/index.js';

/**
 * Integration test: load the sample PBIP project and run full analysis.
 */
describe('analyze (integration)', () => {
  let modelFiles;
  let reportFiles;

  beforeAll(() => {
    // Read sample PBIP files from disk
    const sampleRoot = join(__dirname, '../../../public/sample-pbip');
    modelFiles = readFilesRecursive(join(sampleRoot, 'definition'), '');
    reportFiles = readFilesRecursive(join(sampleRoot, 'report/definition'), '');
  });

  it('parses the sample project without errors', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);

    const result = analyze({ modelStructure, reportStructure });

    expect(result.graph).toBeDefined();
    expect(result.graph.nodes).toBeInstanceOf(Map);
    expect(result.graph.edges).toBeInstanceOf(Array);
    expect(result.stats).toBeDefined();
  });

  it('finds measures in the graph', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);
    const { graph } = analyze({ modelStructure, reportStructure });

    const measures = [...graph.nodes.values()].filter(n => n.type === 'measure');
    expect(measures.length).toBeGreaterThan(0);

    // Check specific known measures from the sample
    const totalSales = measures.find(m => m.name === 'Total Sales');
    expect(totalSales).toBeDefined();
  });

  it('finds tables and columns', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const { graph } = analyze({ modelStructure });

    const tables = [...graph.nodes.values()].filter(n => n.type === 'table');
    const columns = [...graph.nodes.values()].filter(n => n.type === 'column');

    expect(tables.length).toBeGreaterThan(0);
    expect(columns.length).toBeGreaterThan(0);

    // Sales table should exist
    const salesTable = tables.find(t => t.name === 'Sales');
    expect(salesTable).toBeDefined();
  });

  it('detects orphan measures', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);
    const { graph } = analyze({ modelStructure, reportStructure });

    const orphanIds = findOrphans(graph);
    // findOrphans returns an array of node IDs (strings)
    expect(Array.isArray(orphanIds)).toBe(true);
    // All orphan IDs should resolve to measure nodes
    for (const id of orphanIds) {
      const node = graph.nodes.get(id);
      expect(node).toBeDefined();
      expect(node.type).toBe('measure');
    }
  });

  it('traces measure lineage', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);
    const { graph } = analyze({ modelStructure, reportStructure });

    // Find Total Sales measure
    const totalSales = [...graph.nodes.values()].find(n => n.name === 'Total Sales' && n.type === 'measure');
    expect(totalSales).toBeDefined();

    const lineage = traceMeasureLineage(totalSales.id, graph);
    expect(lineage).toBeDefined();
    expect(lineage.measureChain).toBeDefined();
    expect(lineage.measureChain.name).toBe('Total Sales');
  });

  it('computes stats correctly', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);
    const { stats } = analyze({ modelStructure, reportStructure });

    expect(stats.tables).toBeGreaterThan(0);
    expect(stats.measures).toBeGreaterThan(0);
    expect(stats.columns).toBeGreaterThan(0);
  });

  it('captures field parameter display names', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);
    const { graph } = analyze({ modelStructure, reportStructure });

    // The Sales Metrics FP table should have display names
    const fpTable = graph.nodes.get("table::Sales Metrics");
    expect(fpTable).toBeDefined();
    expect(fpTable.enrichment?.type).toBe('field_parameter');

    // Check that fpDisplayNames are stored on the table metadata
    const displayNames = fpTable.metadata?.fpDisplayNames;
    expect(displayNames).toBeDefined();
    expect(displayNames["measure::Sales.Total Sales"]).toBe("sales_kpi_01");
    expect(displayNames["measure::Sales.Avg Sales"]).toBe("sales_kpi_02");
    expect(displayNames["measure::Sales.Total Quantity"]).toBe("sales_kpi_03");
  });

  it('includes description in measure metadata', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const { graph } = analyze({ modelStructure });

    // All measure nodes should have description field in metadata (even if empty)
    const measures = [...graph.nodes.values()].filter(n => n.type === 'measure');
    for (const m of measures) {
      expect(m.metadata).toHaveProperty('description');
    }
  });

  it('resolves source table and columns via named expressions', () => {
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);
    const { graph } = analyze({ modelStructure, reportStructure });

    // Sales table should have data source metadata from expressions.tmdl
    const salesTable = graph.nodes.get('table::Sales');
    expect(salesTable).toBeDefined();
    expect(salesTable.metadata.dataSource).toBeDefined();
    expect(salesTable.metadata.dataSource.sourceTable).toBe('fact_sales');
    expect(salesTable.metadata.dataSource.schema).toBe('dbo');

    // Amount column should have source column info resolved
    const amountCol = graph.nodes.get('column::Sales.Amount');
    expect(amountCol).toBeDefined();
    expect(amountCol.metadata.sourceColumn).toBe('Amount');
    expect(amountCol.metadata.sourceTablePath).toBe('mydb.dbo.fact_sales');

    // Columns should have rename info from the expression's Table.RenameColumns
    expect(amountCol.metadata.originalSourceColumn).toBe('sale_amount');
    expect(amountCol.metadata.wasRenamed).toBe(true);
    expect(amountCol.metadata.sourceTableFull).toBe('mydb.dbo.fact_sales.sale_amount');

    // Trace lineage and verify source table appears in output
    const totalSales = [...graph.nodes.values()].find(n => n.name === 'Total Sales' && n.type === 'measure');
    const lineage = traceMeasureLineage(totalSales.id, graph);
    expect(lineage.sourceTable.length).toBeGreaterThan(0);

    const amountRow = lineage.sourceTable.find(r => r.pbiColumn === 'Amount');
    expect(amountRow).toBeDefined();
    expect(amountRow.sourceTable).toContain('fact_sales');
    expect(amountRow.originalSourceColumn).toBe('sale_amount');
    expect(amountRow.renamed).toBe(true);
  });
});

describe('traceVisualLineage – calculation groups', () => {
  let graph;

  beforeAll(() => {
    const sampleRoot = join(__dirname, '../../../public/sample-pbip');
    const modelFiles = readFilesRecursive(join(sampleRoot, 'definition'), '');
    const reportFiles = readFilesRecursive(join(sampleRoot, 'report/definition'), '');
    const modelStructure = identifyProjectStructure(modelFiles);
    const reportStructure = identifyProjectStructure(reportFiles);
    ({ graph } = analyze({ modelStructure, reportStructure }));
  });

  it('traceVisualLineage returns a calculationGroups array', () => {
    // Pick any visual node
    const anyVisual = [...graph.nodes.values()].find(n => n.type === 'visual');
    expect(anyVisual).toBeDefined();

    const result = traceVisualLineage(anyVisual.id, graph);
    expect(result).toBeDefined();
    expect(Array.isArray(result.calculationGroups)).toBe(true);
  });

  it('visual referencing TimeCalcGroup has calculationGroups with tableName and items', () => {
    // visual5 references TimeCalcGroup.Name column
    const visual5 = [...graph.nodes.values()].find(
      n => n.type === 'visual' && (n.name === 'visual5' || n.metadata?.title === 'YoY Growth Trend')
    );
    expect(visual5).toBeDefined();

    const result = traceVisualLineage(visual5.id, graph);
    expect(result.calculationGroups.length).toBeGreaterThan(0);

    const tcg = result.calculationGroups.find(cg => cg.tableName === 'TimeCalcGroup');
    expect(tcg).toBeDefined();
    expect(tcg.tableName).toBe('TimeCalcGroup');
    expect(Array.isArray(tcg.items)).toBe(true);
    expect(tcg.items.length).toBeGreaterThan(0);
  });

  it('each CG item has name and expression', () => {
    const visual5 = [...graph.nodes.values()].find(
      n => n.type === 'visual' && (n.name === 'visual5' || n.metadata?.title === 'YoY Growth Trend')
    );
    const result = traceVisualLineage(visual5.id, graph);
    const tcg = result.calculationGroups.find(cg => cg.tableName === 'TimeCalcGroup');

    for (const item of tcg.items) {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('expression');
      expect(typeof item.name).toBe('string');
      expect(typeof item.expression).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.expression.length).toBeGreaterThan(0);
    }

    // Verify specific CG items from TimeCalcGroup
    const itemNames = tcg.items.map(i => i.name);
    expect(itemNames).toContain('YTD');
    expect(itemNames).toContain('QTD');
    expect(itemNames).toContain('MTD');
  });

  it('visual without CG reference returns empty calculationGroups array', () => {
    // visual1 (Sales by Category) does not reference any CG
    const visual1 = [...graph.nodes.values()].find(
      n => n.type === 'visual' && (n.name === 'visual1' || n.metadata?.title === 'Sales by Category')
    );
    expect(visual1).toBeDefined();

    const result = traceVisualLineage(visual1.id, graph);
    expect(result.calculationGroups).toEqual([]);
  });
});

describe('traceMeasureLineage – DAG traversal & multi-parent attribution', () => {
  // Build a minimal in-memory graph that exercises:
  //   - A DAG where two parent measures share a sub-measure (memo path)
  //   - A measure chain with distinct leaf columns under different branches
  //   - A column referenced by multiple parent measures (daxReferences array)
  //
  //   Root ──> A ──┐
  //        ──> B ──┴──> Shared ──> Data[X]
  //        ──> C ─────────────────> Data[Y]
  //        ──> D ─────────────────> Data[Z]
  function buildDagGraph() {
    const nodes = new Map();
    const edges = [];

    // Table + columns
    nodes.set('table::Data', createNode('table::Data', 'Data', NODE_TYPES.TABLE, {}));
    for (const c of ['X', 'Y', 'Z']) {
      nodes.set(`column::Data.${c}`, createNode(`column::Data.${c}`, c, NODE_TYPES.COLUMN, {
        table: 'Data',
        sourceColumn: c.toLowerCase(),
        sourceTableFull: `db.Data.${c.toLowerCase()}`,
        sourceTablePath: 'db.Data',
      }));
    }

    // Measures
    for (const m of ['Root', 'A', 'B', 'C', 'D', 'Shared']) {
      nodes.set(`measure::Data.${m}`, createNode(`measure::Data.${m}`, m, NODE_TYPES.MEASURE, {
        table: 'Data',
        expression: `[${m}] dummy expression`,
      }));
    }

    // Edges: Root -> A, B, C, D
    for (const child of ['A', 'B', 'C', 'D']) {
      edges.push(createEdge('measure::Data.Root', `measure::Data.${child}`, EDGE_TYPES.MEASURE_TO_MEASURE));
    }
    // A -> Shared, B -> Shared (DAG)
    edges.push(createEdge('measure::Data.A', 'measure::Data.Shared', EDGE_TYPES.MEASURE_TO_MEASURE));
    edges.push(createEdge('measure::Data.B', 'measure::Data.Shared', EDGE_TYPES.MEASURE_TO_MEASURE));
    // Shared -> X, C -> Y, D -> Z
    edges.push(createEdge('measure::Data.Shared', 'column::Data.X', EDGE_TYPES.MEASURE_TO_COLUMN));
    edges.push(createEdge('measure::Data.C', 'column::Data.Y', EDGE_TYPES.MEASURE_TO_COLUMN));
    edges.push(createEdge('measure::Data.D', 'column::Data.Z', EDGE_TYPES.MEASURE_TO_COLUMN));

    const adjacency = buildAdjacency(edges);
    return { nodes, edges, adjacency };
  }

  it('collects source columns reachable from ALL referenced measures (not just the first branch)', () => {
    const graph = buildDagGraph();
    const lineage = traceMeasureLineage('measure::Data.Root', graph);

    expect(lineage).not.toBeNull();
    const pbiCols = lineage.sourceTable.map(r => r.pbiColumn).sort();
    // All three leaf columns must appear, regardless of branch order.
    expect(pbiCols).toEqual(['X', 'Y', 'Z']);
  });

  it('preserves every parent measure that references a shared column in daxReferences', () => {
    const graph = buildDagGraph();
    const lineage = traceMeasureLineage('measure::Data.Root', graph);

    const xRow = lineage.sourceTable.find(r => r.pbiColumn === 'X');
    expect(xRow).toBeDefined();
    // X is referenced by measure `Shared`, which is reached via both A and B.
    // buildSourceTable attributes columns to their immediate parent in the chain,
    // so `Shared` should appear. Because Shared's memoized subtree is reused when
    // visited via B, the direct parent for X is always `Shared` — but the
    // row must carry at least one ancestor, and the array form must be present.
    expect(Array.isArray(xRow.daxReferences)).toBe(true);
    expect(xRow.daxReferences.length).toBeGreaterThan(0);
    expect(xRow.daxReferences).toContain('Shared');
    // Legacy alias still populated for any old consumer.
    expect(xRow.daxReference).toBe(xRow.daxReferences[0]);
  });

  it('merges multiple direct parents into a single row when they reference the same column', () => {
    // Direct-parent case: Root itself references column Q, AND child measure E also references Q.
    // Here A shares a column with the root via two paths with different direct parents.
    const nodes = new Map();
    const edges = [];
    nodes.set('table::T', createNode('table::T', 'T', NODE_TYPES.TABLE, {}));
    nodes.set('column::T.Q', createNode('column::T.Q', 'Q', NODE_TYPES.COLUMN, {
      table: 'T', sourceColumn: 'q', sourceTableFull: 'db.T.q', sourceTablePath: 'db.T',
    }));
    for (const m of ['Top', 'M1', 'M2']) {
      nodes.set(`measure::T.${m}`, createNode(`measure::T.${m}`, m, NODE_TYPES.MEASURE, { table: 'T', expression: '' }));
    }
    edges.push(createEdge('measure::T.Top', 'measure::T.M1', EDGE_TYPES.MEASURE_TO_MEASURE));
    edges.push(createEdge('measure::T.Top', 'measure::T.M2', EDGE_TYPES.MEASURE_TO_MEASURE));
    edges.push(createEdge('measure::T.M1', 'column::T.Q', EDGE_TYPES.MEASURE_TO_COLUMN));
    edges.push(createEdge('measure::T.M2', 'column::T.Q', EDGE_TYPES.MEASURE_TO_COLUMN));

    const graph = { nodes, edges, adjacency: buildAdjacency(edges) };
    const lineage = traceMeasureLineage('measure::T.Top', graph);

    expect(lineage.sourceTable.length).toBe(1);
    const qRow = lineage.sourceTable[0];
    expect(qRow.pbiColumn).toBe('Q');
    // Both M1 and M2 reference Q — both must be captured in daxReferences.
    expect(qRow.daxReferences.sort()).toEqual(['M1', 'M2']);
  });

  it('flags true cycles without losing unrelated branches', () => {
    const nodes = new Map();
    const edges = [];
    nodes.set('table::T', createNode('table::T', 'T', NODE_TYPES.TABLE, {}));
    nodes.set('column::T.K', createNode('column::T.K', 'K', NODE_TYPES.COLUMN, {
      table: 'T', sourceColumn: 'k', sourceTableFull: 'db.T.k', sourceTablePath: 'db.T',
    }));
    for (const m of ['Cy1', 'Cy2', 'Leaf']) {
      nodes.set(`measure::T.${m}`, createNode(`measure::T.${m}`, m, NODE_TYPES.MEASURE, { table: 'T', expression: '' }));
    }
    // Real cycle: Cy1 -> Cy2 -> Cy1
    edges.push(createEdge('measure::T.Cy1', 'measure::T.Cy2', EDGE_TYPES.MEASURE_TO_MEASURE));
    edges.push(createEdge('measure::T.Cy2', 'measure::T.Cy1', EDGE_TYPES.MEASURE_TO_MEASURE));
    // Unrelated branch Cy1 -> Leaf -> K
    edges.push(createEdge('measure::T.Cy1', 'measure::T.Leaf', EDGE_TYPES.MEASURE_TO_MEASURE));
    edges.push(createEdge('measure::T.Leaf', 'column::T.K', EDGE_TYPES.MEASURE_TO_COLUMN));

    const graph = { nodes, edges, adjacency: buildAdjacency(edges) };
    const lineage = traceMeasureLineage('measure::T.Cy1', graph);

    // The real cycle is reported as "(circular reference)" but the Leaf branch must still yield column K.
    const kRow = lineage.sourceTable.find(r => r.pbiColumn === 'K');
    expect(kRow).toBeDefined();
    expect(kRow.sourceColumn).toBe('k');
  });
});

describe('extractMDataSource', () => {
  it('handles concatenated SQL in Value.NativeQuery', () => {
    const mExpr = `let
    Source = Value.NativeQuery(GoogleBigQuery.Database([BillingProject=_BillingProject]), "SELECT * FROM \`" & _BillingProject & ".report_business_units.business_unit_cur_func_dim\` ('" & _ReportId & "')", null, [EnableFolding=true])
in
    Source`;
    const ds = extractMDataSource(mExpr);
    expect(ds.sourceTable).toBe('business_unit_cur_func_dim');
    expect(ds.database).toBe('report_business_units');
  });
});

/**
 * Recursively read files from a directory into a Map<string, string>.
 */
function readFilesRecursive(dirPath, basePath) {
  const files = new Map();
  let entries;
  try {
    entries = readdirSync(dirPath);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const relativePath = basePath ? `${basePath}/${entry}` : entry;
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      const subFiles = readFilesRecursive(fullPath, relativePath);
      for (const [path, content] of subFiles) {
        files.set(path, content);
      }
    } else if (stat.isFile()) {
      const ext = entry.includes('.') ? '.' + entry.split('.').pop().toLowerCase() : '';
      if (['.tmdl', '.json', '.pbir', '.platform'].includes(ext)) {
        files.set(relativePath, readFileSync(fullPath, 'utf-8'));
      }
    }
  }

  return files;
}
