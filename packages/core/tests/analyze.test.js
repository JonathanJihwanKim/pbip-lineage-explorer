import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { identifyProjectStructure, analyze, findOrphans, traceMeasureLineage, extractMDataSource } from '../src/index.js';

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
