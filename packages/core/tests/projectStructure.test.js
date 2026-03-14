import { describe, it, expect } from 'vitest';
import { identifyProjectStructure, findDefinitionPbir, parseSemanticModelReference, isRelevantFile } from '../src/parser/projectStructure.js';

describe('isRelevantFile', () => {
  it('accepts .tmdl files', () => {
    expect(isRelevantFile('Sales.tmdl')).toBe(true);
  });

  it('accepts .json files', () => {
    expect(isRelevantFile('visual.json')).toBe(true);
  });

  it('accepts .pbir files', () => {
    expect(isRelevantFile('definition.pbir')).toBe(true);
  });

  it('rejects other files', () => {
    expect(isRelevantFile('readme.md')).toBe(false);
    expect(isRelevantFile('script.js')).toBe(false);
    expect(isRelevantFile('data.csv')).toBe(false);
  });
});

describe('identifyProjectStructure', () => {
  it('categorizes TMDL files', () => {
    const files = new Map([
      ['tables/Sales.tmdl', 'table Sales\n  column Amount'],
      ['tables/Products.tmdl', 'table Products\n  column Name'],
    ]);
    const result = identifyProjectStructure(files);
    expect(result.tmdlFiles).toHaveLength(2);
    expect(result.tmdlFiles[0].path).toBe('tables/Sales.tmdl');
  });

  it('categorizes relationship files', () => {
    const files = new Map([
      ['relationships.tmdl', 'relationship ...'],
    ]);
    const result = identifyProjectStructure(files);
    expect(result.relationshipFiles).toHaveLength(1);
    expect(result.tmdlFiles).toHaveLength(0);
  });

  it('categorizes expression files', () => {
    const files = new Map([
      ['expressions.tmdl', 'expression ...'],
    ]);
    const result = identifyProjectStructure(files);
    expect(result.expressionFiles).toHaveLength(1);
  });

  it('categorizes visual files', () => {
    const files = new Map([
      ['pages/page1/visuals/v1/visual.json', '{}'],
    ]);
    const result = identifyProjectStructure(files);
    expect(result.visualFiles).toHaveLength(1);
  });

  it('categorizes page files', () => {
    const files = new Map([
      ['pages/page1/page.json', '{}'],
    ]);
    const result = identifyProjectStructure(files);
    expect(result.pageFiles).toHaveLength(1);
  });

  it('handles empty file map', () => {
    const result = identifyProjectStructure(new Map());
    expect(result.tmdlFiles).toHaveLength(0);
    expect(result.visualFiles).toHaveLength(0);
  });
});

describe('findDefinitionPbir', () => {
  it('finds definition.pbir at root', () => {
    const files = new Map([['definition.pbir', '{}']]);
    expect(findDefinitionPbir(files)).toBe('definition.pbir');
  });

  it('finds definition.pbir in subdirectory', () => {
    const files = new Map([['report/definition.pbir', '{}']]);
    expect(findDefinitionPbir(files)).toBe('report/definition.pbir');
  });

  it('returns null when not found', () => {
    const files = new Map([['tables/Sales.tmdl', 'table Sales']]);
    expect(findDefinitionPbir(files)).toBeNull();
  });
});

describe('parseSemanticModelReference', () => {
  it('parses byPath reference', () => {
    const content = JSON.stringify({
      datasetReference: { byPath: { path: '../MyProject.SemanticModel/' } }
    });
    expect(parseSemanticModelReference(content)).toBe('../MyProject.SemanticModel/');
  });

  it('returns null for invalid JSON', () => {
    expect(parseSemanticModelReference('not json')).toBeNull();
  });

  it('returns null for missing path', () => {
    expect(parseSemanticModelReference('{}')).toBeNull();
  });
});
