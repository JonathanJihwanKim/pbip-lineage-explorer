/**
 * Tests for the change detection engine.
 * Uses inline fixtures for unit tests and optionally reads from the sample git repo.
 */

import { describe, it, expect } from 'vitest';
import { detectChanges } from '../../src/diff/changeDetector.js';
import { CHANGE_TYPES } from '../../src/diff/changeTypes.js';

// ───── Unit Tests: Page Changes ─────

describe('Page changes', () => {
  it('detects active page change', () => {
    const before = new Map([
      ['definition/pages/pages.json', JSON.stringify({
        pageOrder: ['Page1', 'Page2'],
        activePageName: 'Page1',
      })],
      ['definition/pages/Page1/page.json', JSON.stringify({
        name: 'Page1', displayName: 'Overview',
      })],
      ['definition/pages/Page2/page.json', JSON.stringify({
        name: 'Page2', displayName: 'Details',
      })],
    ]);

    const after = new Map([
      ['definition/pages/pages.json', JSON.stringify({
        pageOrder: ['Page1', 'Page2'],
        activePageName: 'Page2',
      })],
      ['definition/pages/Page1/page.json', JSON.stringify({
        name: 'Page1', displayName: 'Overview',
      })],
      ['definition/pages/Page2/page.json', JSON.stringify({
        name: 'Page2', displayName: 'Details',
      })],
    ]);

    const result = detectChanges(before, after);
    const pageChange = result.changes.find(c => c.type === CHANGE_TYPES.DEFAULT_PAGE_CHANGED);

    expect(pageChange).toBeDefined();
    expect(pageChange.description).toContain('Overview');
    expect(pageChange.description).toContain('Details');
  });

  it('detects page added', () => {
    const before = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
    ]);

    const after = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page2/page.json', JSON.stringify({ displayName: 'New Page' })],
    ]);

    const result = detectChanges(before, after);
    const added = result.changes.find(c => c.type === CHANGE_TYPES.PAGE_ADDED);

    expect(added).toBeDefined();
    expect(added.description).toContain('New Page');
  });

  it('detects page removed', () => {
    const before = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page2/page.json', JSON.stringify({ displayName: 'Old Page' })],
    ]);

    const after = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
    ]);

    const result = detectChanges(before, after);
    const removed = result.changes.find(c => c.type === CHANGE_TYPES.PAGE_REMOVED);

    expect(removed).toBeDefined();
    expect(removed.description).toContain('Old Page');
  });
});

// ───── Unit Tests: Filter Changes ─────

describe('Filter changes', () => {
  it('detects page filter added', () => {
    const before = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({
        displayName: 'Overview',
        filterConfig: { filters: [] },
      })],
    ]);

    const after = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({
        displayName: 'Overview',
        filterConfig: {
          filters: [{
            name: 'Filter1',
            field: {
              Column: {
                Expression: { SourceRef: { Entity: 'Transaction Type' } },
                Property: 'Type',
              },
            },
            type: 'Categorical',
            filter: {
              Version: 2,
              From: [{ Name: 't', Entity: 'Transaction Type', Type: 0 }],
              Where: [{
                Condition: {
                  In: {
                    Expressions: [],
                    Values: [[{ Literal: { Value: "'Sales'" } }]],
                  },
                },
              }],
            },
          }],
        },
      })],
    ]);

    const result = detectChanges(before, after);
    const filterAdd = result.changes.find(c => c.type === CHANGE_TYPES.FILTER_ADDED);

    expect(filterAdd).toBeDefined();
    expect(filterAdd.description).toContain('Transaction Type');
    expect(filterAdd.description).toContain('Type');
  });

  it('detects report filter value changed', () => {
    const makeReport = (value) => JSON.stringify({
      filterConfig: {
        filters: [{
          name: 'Filter1',
          field: {
            Column: {
              Expression: { SourceRef: { Entity: 'Period' } },
              Property: 'Selection',
            },
          },
          type: 'Categorical',
          filter: {
            Version: 2,
            From: [{ Name: 'p', Entity: 'Period', Type: 0 }],
            Where: [{
              Condition: {
                In: {
                  Expressions: [],
                  Values: [[{ Literal: { Value: `'${value}'` } }]],
                },
              },
            }],
          },
        }],
      },
    });

    const before = new Map([['definition/report.json', makeReport('Last Week')]]);
    const after = new Map([['definition/report.json', makeReport('MTD')]]);

    const result = detectChanges(before, after);
    const filterChange = result.changes.find(c => c.type === CHANGE_TYPES.FILTER_CHANGED);

    expect(filterChange).toBeDefined();
    expect(filterChange.description).toContain('Period');
    expect(filterChange.description).toContain('MTD');
  });

  it('detects filter removed', () => {
    const before = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({
        displayName: 'Overview',
        filterConfig: {
          filters: [{
            name: 'FilterABC',
            field: {
              Column: {
                Expression: { SourceRef: { Entity: 'Status' } },
                Property: 'Active',
              },
            },
            type: 'Categorical',
          }],
        },
      })],
    ]);

    const after = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({
        displayName: 'Overview',
        filterConfig: { filters: [] },
      })],
    ]);

    const result = detectChanges(before, after);
    const removed = result.changes.find(c => c.type === CHANGE_TYPES.FILTER_REMOVED);

    expect(removed).toBeDefined();
    expect(removed.description).toContain('Status');
  });
});

// ───── Unit Tests: Measure Changes ─────

describe('Measure changes', () => {
  it('detects measure expression changed', () => {
    const makeTmdl = (expr) => `table Measure\n\tmeasure 'Total Sales' = ${expr}\n\t\tformatString: #,##0`;

    const before = new Map([['tables/Measure.tmdl', makeTmdl('SUM(Sales[Amount])')]]);
    const after = new Map([['tables/Measure.tmdl', makeTmdl('SUMX(Sales, Sales[Amount] * Sales[Qty])')]]);

    const result = detectChanges(before, after);
    const measureChange = result.changes.find(c => c.type === CHANGE_TYPES.MEASURE_CHANGED);

    expect(measureChange).toBeDefined();
    expect(measureChange.target.measureName).toBe('Total Sales');
    expect(measureChange.description).toContain('Total Sales');
  });

  it('detects measure added', () => {
    const before = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure Sales = SUM(T[A])']]);
    const after = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure Sales = SUM(T[A])\n\tmeasure Profit = SUM(T[P])']]);

    const result = detectChanges(before, after);
    const added = result.changes.find(c => c.type === CHANGE_TYPES.MEASURE_ADDED);

    expect(added).toBeDefined();
    expect(added.target.measureName).toBe('Profit');
  });

  it('detects measure removed', () => {
    const before = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure Sales = SUM(T[A])\n\tmeasure Profit = SUM(T[P])']]);
    const after = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure Sales = SUM(T[A])']]);

    const result = detectChanges(before, after);
    const removed = result.changes.find(c => c.type === CHANGE_TYPES.MEASURE_REMOVED);

    expect(removed).toBeDefined();
    expect(removed.target.measureName).toBe('Profit');
  });

  it('ignores comment-only changes in measures', () => {
    const before = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure Sales = \n\t\t// old comment\n\t\tSUM(T[A])']]);
    const after = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure Sales = \n\t\t// new comment\n\t\tSUM(T[A])']]);

    const result = detectChanges(before, after);
    const measureChange = result.changes.find(c => c.type === CHANGE_TYPES.MEASURE_CHANGED);

    expect(measureChange).toBeUndefined();
  });
});

// ───── Unit Tests: Visual Changes ─────

describe('Visual changes', () => {
  it('detects visual hidden', () => {
    const before = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page1/visuals/vis1/visual.json', JSON.stringify({
        name: 'vis1', position: { x: 0, y: 0 },
      })],
    ]);

    const after = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page1/visuals/vis1/visual.json', JSON.stringify({
        name: 'vis1', position: { x: 0, y: 0 }, isHidden: true,
      })],
    ]);

    const result = detectChanges(before, after);
    const hidden = result.changes.find(c => c.type === CHANGE_TYPES.VISUAL_VISIBILITY_CHANGED);

    expect(hidden).toBeDefined();
    expect(hidden.description).toContain('hidden');
  });

  it('detects visual unhidden', () => {
    const before = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page1/visuals/vis1/visual.json', JSON.stringify({
        name: 'vis1', isHidden: true,
      })],
    ]);

    const after = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page1/visuals/vis1/visual.json', JSON.stringify({
        name: 'vis1',
      })],
    ]);

    const result = detectChanges(before, after);
    const unhidden = result.changes.find(c => c.type === CHANGE_TYPES.VISUAL_VISIBILITY_CHANGED);

    expect(unhidden).toBeDefined();
    expect(unhidden.description).toContain('unhidden');
  });

  it('detects bookmark reference changed in button', () => {
    const makeVisual = (bookmarkId) => JSON.stringify({
      name: 'btnVisual',
      visual: {
        visualType: 'actionButton',
        objects: {
          action: [{
            properties: {
              bookmark: {
                expr: { Literal: { Value: `'${bookmarkId}'` } },
              },
            },
          }],
        },
      },
    });

    const before = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page1/visuals/btn1/visual.json', makeVisual('Bookmarkaabbccdd11223344556677')],
    ]);

    const after = new Map([
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page1/visuals/btn1/visual.json', makeVisual('Bookmarkeeff001122334455667788')],
    ]);

    const result = detectChanges(before, after);
    const bookmarkChange = result.changes.find(c => c.type === CHANGE_TYPES.VISUAL_BOOKMARK_CHANGED);

    expect(bookmarkChange).toBeDefined();
    expect(bookmarkChange.description).toContain('bookmark reference changed');
  });

  it('detects visual-level filter added', () => {
    const before = new Map([
      ['definition/pages/P1/page.json', JSON.stringify({ displayName: 'Page' })],
      ['definition/pages/P1/visuals/v1/visual.json', JSON.stringify({
        name: 'v1',
        filterConfig: { filters: [] },
      })],
    ]);

    const after = new Map([
      ['definition/pages/P1/page.json', JSON.stringify({ displayName: 'Page' })],
      ['definition/pages/P1/visuals/v1/visual.json', JSON.stringify({
        name: 'v1',
        filterConfig: {
          filters: [{
            name: 'VF1',
            field: {
              Column: {
                Expression: { SourceRef: { Entity: 'Business Unit' } },
                Property: 'Full Name',
              },
            },
            type: 'Categorical',
            isHiddenInViewMode: true,
          }],
        },
      })],
    ]);

    const result = detectChanges(before, after);
    const filterAdd = result.changes.find(c => c.type === CHANGE_TYPES.VISUAL_FILTER_ADDED);

    expect(filterAdd).toBeDefined();
    expect(filterAdd.description).toContain('Business Unit');
  });
});

// ───── Unit Tests: Summary ─────

describe('Summary', () => {
  it('produces correct summary counts', () => {
    const before = new Map([
      ['definition/pages/pages.json', JSON.stringify({ activePageName: 'Page1' })],
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page2/page.json', JSON.stringify({ displayName: 'Details' })],
      ['tables/T.tmdl', 'table T\n\tmeasure M1 = SUM(T[A])'],
    ]);

    const after = new Map([
      ['definition/pages/pages.json', JSON.stringify({ activePageName: 'Page2' })],
      ['definition/pages/Page1/page.json', JSON.stringify({ displayName: 'Overview' })],
      ['definition/pages/Page2/page.json', JSON.stringify({ displayName: 'Details' })],
      ['tables/T.tmdl', 'table T\n\tmeasure M1 = SUMX(T, T[A] * T[B])'],
    ]);

    const result = detectChanges(before, after);

    expect(result.summary.totalChanges).toBeGreaterThanOrEqual(2);
    expect(result.summary.byType[CHANGE_TYPES.DEFAULT_PAGE_CHANGED]).toBe(1);
    expect(result.summary.byType[CHANGE_TYPES.MEASURE_CHANGED]).toBe(1);
  });

  it('returns empty results when no changes', () => {
    const files = new Map([
      ['definition/pages/pages.json', JSON.stringify({ activePageName: 'P1' })],
      ['definition/pages/P1/page.json', JSON.stringify({ displayName: 'Page' })],
    ]);

    const result = detectChanges(files, files);
    expect(result.changes).toHaveLength(0);
    expect(result.summary.totalChanges).toBe(0);
  });
});

// ───── Unit Tests: Impact Resolution ─────

describe('Impact resolution', () => {
  it('resolves direct visual impact for measure changes', () => {
    // Build a minimal graph with a measure used by a visual
    const graph = {
      nodes: new Map([
        ['measure::Measure.Total Sales', {
          id: 'measure::Measure.Total Sales', name: 'Total Sales', type: 'measure',
          metadata: { table: 'Measure' },
        }],
        ['visual::Page1/vis1', {
          id: 'visual::Page1/vis1', name: 'Sales Chart', type: 'visual',
          metadata: { pageId: 'Page1' },
        }],
        ['page::Page1', {
          id: 'page::Page1', name: 'Overview', type: 'page',
          metadata: {},
        }],
      ]),
      edges: [],
      adjacency: {
        upstream: new Map([
          ['visual::Page1/vis1', ['measure::Measure.Total Sales']],
        ]),
        downstream: new Map([
          ['measure::Measure.Total Sales', ['visual::Page1/vis1']],
        ]),
      },
    };

    const before = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure \'Total Sales\' = SUM(T[A])']]);
    const after = new Map([['tables/Measure.tmdl', 'table Measure\n\tmeasure \'Total Sales\' = SUMX(T, T[A]*T[B])']]);

    const result = detectChanges(before, after, graph);
    const measureChange = result.changes.find(c => c.type === CHANGE_TYPES.MEASURE_CHANGED);

    expect(measureChange).toBeDefined();
    expect(measureChange.impact).toHaveLength(1);
    expect(measureChange.impact[0].visualName).toBe('Sales Chart');
    expect(measureChange.impact[0].type).toBe('direct');
  });
});

// ───── Unit Tests: Calculation Group Changes ─────

describe('Calculation group changes', () => {
  it('detects calculation item added', () => {
    const before = new Map([['tables/CG.tmdl', [
      "table 'Time Intelligence'",
      '\tcalculationGroup',
      "\t\tcalculationItem YTD = DATESYTD('Date'[Date])",
    ].join('\n')]]);

    const after = new Map([['tables/CG.tmdl', [
      "table 'Time Intelligence'",
      '\tcalculationGroup',
      "\t\tcalculationItem YTD = DATESYTD('Date'[Date])",
      "\t\tcalculationItem MTD = DATESMTD('Date'[Date])",
    ].join('\n')]]);

    const result = detectChanges(before, after);
    const added = result.changes.find(c => c.type === CHANGE_TYPES.CALC_ITEM_ADDED);

    expect(added).toBeDefined();
    expect(added.target.calcItemName).toBe('MTD');
  });
});
