const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { integratePatternIncremental } = require('../src/compression/fractal-library-bridge');
const { structuralFingerprint } = require('../src/compression/fractal');

describe('Lazy Family Detection', () => {
  // Two structurally identical functions with different names
  const codeA = `function calculateSum(arr) {
  let total = 0;
  for (const item of arr) {
    total += item;
  }
  return total;
}`;

  const codeB = `function computeTotal(list) {
  let total = 0;
  for (const item of list) {
    total += item;
  }
  return total;
}`;

  const codeDifferent = `function greet(name) {
  return 'Hello, ' + name + '!';
}`;

  it('should detect that structurally identical code produces same fingerprint', () => {
    const fpA = structuralFingerprint(codeA, 'javascript');
    const fpB = structuralFingerprint(codeB, 'javascript');
    assert.equal(fpA.hash, fpB.hash, 'Same structure should produce same hash');
  });

  it('should detect that different code produces different fingerprint', () => {
    const fpA = structuralFingerprint(codeA, 'javascript');
    const fpC = structuralFingerprint(codeDifferent, 'javascript');
    assert.notEqual(fpA.hash, fpC.hash, 'Different structure should produce different hash');
  });

  it('should join existing family on incremental integration', () => {
    const fp = structuralFingerprint(codeA, 'javascript');

    // Mock store with an existing template
    const store = {
      storeHoloEmbedding() {},
      getTemplate(id) {
        if (id === fp.hash) {
          return { skeleton: fp.skeleton, language: 'javascript', memberCount: 1, avgCoherency: 0.8 };
        }
        return null;
      },
      storeDelta() {},
      storeTemplate() {},
    };

    const result = integratePatternIncremental(
      { id: 'p-new', code: codeB, language: 'javascript', name: 'computeTotal', tags: [] },
      store
    );

    assert.equal(result.familyMatch, fp.hash);
    assert.equal(result.familyCreated, false);
  });

  it('should create a new family when two singletons match (lazy detection)', () => {
    const fp = structuralFingerprint(codeA, 'javascript');
    const storedDeltas = {};
    const storedTemplates = {};

    // Mock store: no templates, but an existing singleton pattern with matching structure
    const store = {
      db: {
        prepare(sql) {
          return {
            all(...args) {
              if (sql.includes('FROM patterns p')) {
                // Return the existing singleton that matches structurally
                return [{
                  id: 'p-existing',
                  code: codeA,
                  language: 'javascript',
                  name: 'calculateSum',
                  coherency_total: 0.85,
                  coherency_json: '{"total": 0.85}',
                }];
              }
              return [];
            },
            get() { return undefined; },
            run() { return { changes: 1 }; },
          };
        },
      },
      storeHoloEmbedding() {},
      getTemplate() { return null; }, // No existing templates
      storeDelta(delta) {
        storedDeltas[delta.patternId] = delta;
      },
      storeTemplate(t) {
        storedTemplates[t.id] = t;
      },
    };

    const result = integratePatternIncremental(
      {
        id: 'p-new',
        code: codeB,
        language: 'javascript',
        name: 'computeTotal',
        tags: [],
        coherencyScore: { total: 0.9 },
      },
      store
    );

    assert.equal(result.familyMatch, fp.hash, 'Should match the fingerprint hash');
    assert.equal(result.familyCreated, true, 'Should create a new family');
    assert.ok(storedTemplates[fp.hash], 'Template should be stored');
    assert.equal(storedTemplates[fp.hash].memberCount, 2);
    assert.ok(storedDeltas['p-new'], 'Delta for new pattern should be stored');
    assert.ok(storedDeltas['p-existing'], 'Delta for existing singleton should be stored');
  });

  it('should not create family when no singleton matches', () => {
    const storedTemplates = {};

    // Mock store: no templates, no matching singletons
    const store = {
      db: {
        prepare(sql) {
          return {
            all() {
              if (sql.includes('FROM patterns p')) {
                // Return a singleton with DIFFERENT structure
                return [{
                  id: 'p-other',
                  code: codeDifferent,
                  language: 'javascript',
                  name: 'greet',
                  coherency_total: 0.7,
                  coherency_json: '{"total": 0.7}',
                }];
              }
              return [];
            },
            get() { return undefined; },
            run() { return { changes: 1 }; },
          };
        },
      },
      storeHoloEmbedding() {},
      getTemplate() { return null; },
      storeDelta() {},
      storeTemplate(t) { storedTemplates[t.id] = t; },
    };

    const result = integratePatternIncremental(
      { id: 'p-new', code: codeA, language: 'javascript', name: 'calculateSum', tags: [] },
      store
    );

    assert.equal(result.familyMatch, null, 'No family match expected');
    assert.equal(result.familyCreated, false, 'No family should be created');
    assert.equal(Object.keys(storedTemplates).length, 0, 'No templates should be stored');
  });

  it('should handle null/empty inputs gracefully', () => {
    const result1 = integratePatternIncremental(null, {});
    assert.equal(result1.embedded, false);

    const result2 = integratePatternIncremental({ id: 'x' }, null);
    assert.equal(result2.embedded, false);

    const result3 = integratePatternIncremental(null, null);
    assert.equal(result3.embedded, false);
  });
});
