import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/graphBuilder.js';

/**
 * Helper: build a graph from a minimal parsedModel (tables only, no report).
 */
function buildMinimalGraph(tables) {
  const parsedModel = { tables, relationships: [] };
  const parsedReport = { pages: [], visuals: [] };
  return buildGraph(parsedModel, parsedReport, null);
}

describe('buildGraph – DAX unqualified measure extraction', () => {

  it('captures unqualified measure refs that appear after quoted table names', () => {
    // Reproduces the Picking Quality bug:
    // [Number of Orders with Exception] appears AFTER 'Business Unit'[...]
    const tables = [
      {
        name: 'Measure',
        columns: [],
        measures: [
          { name: 'Number of Completed Orders', expression: 'SUM(Fact[order_count])' },
          { name: 'Number of Orders with Exception', expression: 'SUM(Fact[exception_count])' },
          {
            name: 'Picking Quality',
            expression: `DIVIDE(
              CALCULATE( [Number of Completed Orders],
                FILTER ( 'Business Unit', 'Business Unit'[Business Unit Type] = "STO" )
              ) - CALCULATE( [Number of Orders with Exception],
                FILTER ( 'Business Unit', 'Business Unit'[Business Unit Type] = "STO" )
              ),
              CALCULATE( [Number of Completed Orders],
                FILTER ( 'Business Unit', 'Business Unit'[Business Unit Type] = "STO" )
              )
            )`
          }
        ]
      },
      {
        name: 'Business Unit',
        columns: [{ name: 'Business Unit Type', dataType: 'string' }],
        measures: []
      },
      {
        name: 'Fact',
        columns: [
          { name: 'order_count', dataType: 'int64' },
          { name: 'exception_count', dataType: 'int64' }
        ],
        measures: []
      }
    ];

    const graph = buildMinimalGraph(tables);

    const pickingQualityEdges = graph.edges.filter(
      e => e.source === 'measure::Measure.Picking Quality'
        && e.type === 'measure_to_measure'
    );
    const targets = pickingQualityEdges.map(e => e.target);

    expect(targets).toContain('measure::Measure.Number of Completed Orders');
    expect(targets).toContain('measure::Measure.Number of Orders with Exception');
  });

  it('still excludes qualified column refs from unqualified matches', () => {
    const tables = [
      {
        name: 'Sales',
        columns: [{ name: 'Amount', dataType: 'decimal' }],
        measures: [
          { name: 'Total', expression: "SUM('Sales'[Amount])" }
        ]
      }
    ];

    const graph = buildMinimalGraph(tables);
    const totalEdges = graph.edges.filter(
      e => e.source === 'measure::Sales.Total'
    );

    // Should have exactly one edge to column::Sales.Amount (from qualified pattern)
    const colEdges = totalEdges.filter(e => e.target === 'column::Sales.Amount');
    expect(colEdges).toHaveLength(1);
  });

  it('captures multiple unqualified refs interleaved with qualified refs', () => {
    const tables = [
      {
        name: 'M',
        columns: [],
        measures: [
          { name: 'A', expression: '1' },
          { name: 'B', expression: '2' },
          {
            name: 'C',
            expression: "CALCULATE([A], FILTER('Dim', 'Dim'[X] = 1)) + [B]"
          }
        ]
      },
      {
        name: 'Dim',
        columns: [{ name: 'X', dataType: 'int64' }],
        measures: []
      }
    ];

    const graph = buildMinimalGraph(tables);
    const cEdges = graph.edges.filter(
      e => e.source === 'measure::M.C' && e.type === 'measure_to_measure'
    );
    const targets = cEdges.map(e => e.target);

    expect(targets).toContain('measure::M.A');
    expect(targets).toContain('measure::M.B');
  });

  it('captures measure refs after KEEPFILTERS with quoted table', () => {
    const tables = [
      {
        name: 'Measure',
        columns: [],
        measures: [
          { name: 'Number of Completed Orders', expression: 'SUM(Fact[cnt])' },
          { name: 'Customer Order Quality Deviation', expression: 'SUM(Fact[dev])' },
          {
            name: 'First Time Right',
            expression: "CALCULATE( DIVIDE( [Number of Completed Orders] - [Customer Order Quality Deviation], [Number of Completed Orders] ), KEEPFILTERS( 'Business Unit'[Business Unit Type] = \"STO\" ) )"
          }
        ]
      },
      {
        name: 'Business Unit',
        columns: [{ name: 'Business Unit Type', dataType: 'string' }],
        measures: []
      },
      {
        name: 'Fact',
        columns: [
          { name: 'cnt', dataType: 'int64' },
          { name: 'dev', dataType: 'int64' }
        ],
        measures: []
      }
    ];

    const graph = buildMinimalGraph(tables);
    const ftrEdges = graph.edges.filter(
      e => e.source === 'measure::Measure.First Time Right'
        && e.type === 'measure_to_measure'
    );
    const targets = ftrEdges.map(e => e.target);

    expect(targets).toContain('measure::Measure.Number of Completed Orders');
    expect(targets).toContain('measure::Measure.Customer Order Quality Deviation');
  });
});
