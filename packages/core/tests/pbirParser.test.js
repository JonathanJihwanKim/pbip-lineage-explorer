import { describe, it, expect } from 'vitest';
import { extractFieldReferences } from '../src/parser/pbirParser.js';

describe('extractFieldReferences – button visual Fx expressions (issue #6)', () => {
  it('detects a measure referenced via Fx in a button Text property', () => {
    const visualConfig = {
      objects: {
        text: [
          {
            properties: {
              text: {
                expr: {
                  Measure: {
                    Expression: { SourceRef: { Entity: 'Measures' } },
                    Property: 'Logged In User Name',
                  },
                },
              },
            },
          },
        ],
      },
    };

    const fields = extractFieldReferences(visualConfig, null);
    const measureRefs = fields.filter(f => f.type === 'measure');

    expect(measureRefs.length).toBeGreaterThan(0);
    const ref = measureRefs.find(f => f.measure === 'Logged In User Name');
    expect(ref).toBeDefined();
    expect(ref.table).toBe('Measures');
  });

  it('does not affect extraction of measures in prototypeQuery.Select', () => {
    const visualConfig = {
      prototypeQuery: {
        Select: [
          {
            Measure: {
              Expression: { SourceRef: { Source: 's' } },
              Property: 'Total Sales',
            },
            Name: 'Sales.Total Sales',
          },
        ],
        From: [{ Name: 's', Entity: 'Sales', Type: 0 }],
      },
    };

    const fields = extractFieldReferences(visualConfig, null);
    const measureRefs = fields.filter(f => f.type === 'measure');
    expect(measureRefs.length).toBeGreaterThan(0);
  });

  it('detects both an objects Fx measure and a prototypeQuery measure in the same visual', () => {
    const visualConfig = {
      prototypeQuery: {
        Select: [
          {
            Measure: {
              Expression: { SourceRef: { Source: 's' } },
              Property: 'Total Sales',
            },
            Name: 'Sales.Total Sales',
          },
        ],
        From: [{ Name: 's', Entity: 'Sales', Type: 0 }],
      },
      objects: {
        text: [
          {
            properties: {
              text: {
                expr: {
                  Measure: {
                    Expression: { SourceRef: { Entity: 'Measures' } },
                    Property: 'Dynamic Label',
                  },
                },
              },
            },
          },
        ],
      },
    };

    const fields = extractFieldReferences(visualConfig, null);
    const measureNames = fields.filter(f => f.type === 'measure').map(f => f.measure);
    expect(measureNames).toContain('Total Sales');
    expect(measureNames).toContain('Dynamic Label');
  });
});
