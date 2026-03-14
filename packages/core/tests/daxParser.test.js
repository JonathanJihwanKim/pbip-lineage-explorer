import { describe, it, expect } from 'vitest';
import { parseDaxExpression, extractColumnRefs, extractMeasureRefs, extractTableRefs, extractUseRelationshipRefs } from '../src/parser/daxParser.js';

describe('extractColumnRefs', () => {
  it('extracts simple column references', () => {
    const refs = extractColumnRefs('SUM(Sales[Amount])');
    expect(refs).toEqual([{ table: 'Sales', column: 'Amount' }]);
  });

  it('extracts quoted table names', () => {
    const refs = extractColumnRefs("SUM('Fact Sales'[Amount])");
    expect(refs).toEqual([{ table: 'Fact Sales', column: 'Amount' }]);
  });

  it('extracts multiple column references', () => {
    const refs = extractColumnRefs('Sales[Amount] + Sales[Quantity] + Products[Price]');
    expect(refs).toHaveLength(3);
    expect(refs).toContainEqual({ table: 'Sales', column: 'Amount' });
    expect(refs).toContainEqual({ table: 'Sales', column: 'Quantity' });
    expect(refs).toContainEqual({ table: 'Products', column: 'Price' });
  });

  it('deduplicates column references', () => {
    const refs = extractColumnRefs('Sales[Amount] + Sales[Amount]');
    expect(refs).toHaveLength(1);
  });

  it('returns empty for no refs', () => {
    expect(extractColumnRefs('42')).toEqual([]);
    expect(extractColumnRefs('')).toEqual([]);
  });
});

describe('extractMeasureRefs', () => {
  it('extracts standalone measure references', () => {
    const refs = extractMeasureRefs('CALCULATE([Total Sales])');
    expect(refs).toEqual([{ measure: 'Total Sales' }]);
  });

  it('does not include column references as measures', () => {
    const refs = extractMeasureRefs("Sales[Amount] + [Total Sales]");
    // [Amount] is preceded by Sales so should NOT be in measureRefs
    // [Total Sales] is standalone so should be
    expect(refs).toContainEqual({ measure: 'Total Sales' });
    expect(refs).not.toContainEqual({ measure: 'Amount' });
  });

  it('extracts multiple measure refs', () => {
    const refs = extractMeasureRefs('[Metric A] + [Metric B]');
    expect(refs).toHaveLength(2);
  });
});

describe('extractTableRefs', () => {
  it('extracts table from known functions', () => {
    // extractTableRefs only finds tables as first args to TABLE_FUNCTIONS
    // SUM is not a table function, so Sales won't appear from SUM(Sales[Amount])
    // But FILTER(Products, ...) will capture Products
    const refs = extractTableRefs('CALCULATE(SUM(Sales[Amount]), FILTER(Products, Products[Price] > 10))');
    expect(refs).toContain('Products');
  });

  it('extracts quoted table from SUMX', () => {
    const refs = extractTableRefs("SUMX('Fact Sales', 'Fact Sales'[Amount])");
    expect(refs).toContain('Fact Sales');
  });

  it('ignores DAX keywords', () => {
    const refs = extractTableRefs('FILTER(TRUE, Sales[Amount] > 0)');
    expect(refs).not.toContain('TRUE');
  });
});

describe('extractUseRelationshipRefs', () => {
  it('extracts USERELATIONSHIP references', () => {
    const refs = extractUseRelationshipRefs('CALCULATE([Total Sales], USERELATIONSHIP(Sales[OrderDate], DateTable[Date]))');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      fromTable: 'Sales', fromColumn: 'OrderDate',
      toTable: 'DateTable', toColumn: 'Date',
    });
  });

  it('returns empty when no USERELATIONSHIP', () => {
    expect(extractUseRelationshipRefs('SUM(Sales[Amount])')).toEqual([]);
  });
});

describe('parseDaxExpression', () => {
  it('handles null/empty input', () => {
    expect(parseDaxExpression(null)).toEqual({ tableRefs: [], columnRefs: [], measureRefs: [], useRelationshipRefs: [] });
    expect(parseDaxExpression('')).toEqual({ tableRefs: [], columnRefs: [], measureRefs: [], useRelationshipRefs: [] });
  });

  it('parses a complex DAX expression', () => {
    const dax = `
      VAR CurrentYear = CALCULATE([Total Sales], DATESINPERIOD(DateTable[Date], MAX(DateTable[Date]), -1, YEAR))
      VAR PreviousYear = CALCULATE([Total Sales], DATESINPERIOD(DateTable[Date], MAX(DateTable[Date]), -2, YEAR))
      RETURN DIVIDE(CurrentYear - PreviousYear, PreviousYear)
    `;
    const result = parseDaxExpression(dax);
    expect(result.measureRefs).toContainEqual({ measure: 'Total Sales' });
    expect(result.columnRefs).toContainEqual({ table: 'DateTable', column: 'Date' });
    expect(result.tableRefs).toContain('DateTable');
  });

  it('ignores references inside string literals', () => {
    const dax = '"Sales[Amount]" & Sales[Quantity]';
    const result = parseDaxExpression(dax);
    expect(result.columnRefs).toHaveLength(1);
    expect(result.columnRefs[0].column).toBe('Quantity');
  });

  it('ignores references inside comments', () => {
    const dax = '// Sales[Amount]\nSales[Quantity]';
    const result = parseDaxExpression(dax);
    expect(result.columnRefs).toHaveLength(1);
    expect(result.columnRefs[0].column).toBe('Quantity');
  });
});
