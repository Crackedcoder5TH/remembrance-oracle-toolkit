const { describe, it } = require('node:test');
const assert = require('assert');
const {
  crossReference,
  crossReferenceSummary,
  BUG_CLASS_TO_DEBUG_CATEGORIES,
  scoreRelevance,
  extractKeywords,
} = require('../src/audit/cross-reference');
const { BUG_CLASSES } = require('../src/audit/static-checkers');

describe('crossReference', () => {
  it('returns findings unchanged when no oracle provided', () => {
    const findings = [
      { line: 1, bugClass: BUG_CLASSES.STATE_MUTATION, assumption: '.sort() mutates', reality: 'yes', severity: 'high', suggestion: 'use .slice().sort()' },
    ];
    const result = crossReference(findings, null);
    assert.deepStrictEqual(result, findings);
  });

  it('returns empty array for null/empty findings', () => {
    assert.deepStrictEqual(crossReference(null, null), []);
    assert.deepStrictEqual(crossReference([], null), []);
  });

  it('enriches findings with relatedFixes from mock oracle', () => {
    const mockOracle = {
      debugPatterns: (query) => {
        if (query.category === 'logic' || query.category === 'data') {
          return [{
            id: 'dbg-1',
            fixCode: '.slice().sort()',
            fixDescription: 'Copy before sorting to avoid mutation',
            errorMessage: 'Array was mutated in-place',
            amplitude: 0.8,
            timesApplied: 5,
            errorCategory: 'logic',
          }];
        }
        return [];
      },
    };

    const findings = [{
      line: 10,
      bugClass: BUG_CLASSES.STATE_MUTATION,
      assumption: '.sort() does not mutate the original array',
      reality: '.sort() mutates in-place',
      severity: 'high',
      suggestion: 'Use .slice().sort() to avoid mutation',
    }];

    const result = crossReference(findings, mockOracle);
    assert(result[0].relatedFixes, 'Should have relatedFixes');
    assert(result[0].relatedFixes.length > 0, 'Should find at least one fix');
    assert.strictEqual(result[0].relatedFixes[0].patternId, 'dbg-1');
  });

  it('limits fixes per finding to maxFixesPerFinding', () => {
    const mockOracle = {
      debugPatterns: () => Array.from({ length: 10 }, (_, i) => ({
        id: `dbg-${i}`,
        fixCode: 'fix',
        fixDescription: 'fix mutation',
        errorMessage: 'mutate sort in-place',
        amplitude: 0.9 - i * 0.05,
        timesApplied: 5,
        errorCategory: 'logic',
      })),
    };

    const findings = [{
      line: 1,
      bugClass: BUG_CLASSES.STATE_MUTATION,
      assumption: '.sort() mutates',
      reality: 'yes',
      severity: 'high',
      suggestion: 'copy first',
    }];

    const result = crossReference(findings, mockOracle, { maxFixesPerFinding: 2 });
    assert(result[0].relatedFixes.length <= 2);
  });

  it('filters by minAmplitude', () => {
    const mockOracle = {
      debugPatterns: () => [{
        id: 'dbg-low',
        fixCode: 'fix',
        fixDescription: 'weak fix',
        errorMessage: 'error',
        amplitude: 0.2,
        timesApplied: 1,
        errorCategory: 'logic',
      }],
    };

    const findings = [{
      line: 1,
      bugClass: BUG_CLASSES.STATE_MUTATION,
      assumption: 'test',
      reality: 'test',
      severity: 'high',
      suggestion: 'test',
    }];

    const result = crossReference(findings, mockOracle, { minAmplitude: 0.5 });
    assert(!result[0].relatedFixes, 'Should not include low-amplitude fixes');
  });
});

describe('crossReferenceSummary', () => {
  it('returns zero summary for empty findings', () => {
    const summary = crossReferenceSummary([]);
    assert.strictEqual(summary.totalFindings, 0);
    assert.strictEqual(summary.withFixes, 0);
  });

  it('counts findings with and without fixes', () => {
    const findings = [
      { bugClass: 'type', line: 1, assumption: 'x', relatedFixes: [{ fixCode: 'y' }] },
      { bugClass: 'security', line: 2, assumption: 'z' },
    ];
    const summary = crossReferenceSummary(findings);
    assert.strictEqual(summary.totalFindings, 2);
    assert.strictEqual(summary.withFixes, 1);
    assert.strictEqual(summary.actionable.length, 1);
  });

  it('computes coverage by bug class', () => {
    const findings = [
      { bugClass: 'type', line: 1, assumption: 'a', relatedFixes: [{ fixCode: 'b' }] },
      { bugClass: 'type', line: 2, assumption: 'c' },
      { bugClass: 'security', line: 3, assumption: 'd', relatedFixes: [{ fixCode: 'e' }] },
    ];
    const summary = crossReferenceSummary(findings);
    assert.strictEqual(summary.coverage.type.total, 2);
    assert.strictEqual(summary.coverage.type.withFix, 1);
    assert.strictEqual(summary.coverage.security.total, 1);
    assert.strictEqual(summary.coverage.security.withFix, 1);
  });
});

describe('scoreRelevance', () => {
  it('scores higher for category + keyword matches', () => {
    const finding = {
      bugClass: BUG_CLASSES.STATE_MUTATION,
      assumption: '.sort() mutates the array',
      reality: 'yes',
      suggestion: 'Use .slice().sort()',
    };
    const mapping = BUG_CLASS_TO_DEBUG_CATEGORIES[BUG_CLASSES.STATE_MUTATION];

    const goodPattern = {
      errorCategory: 'logic',
      errorMessage: 'Array was mutated in-place during sort',
      fixDescription: 'Copy array before sorting',
      fixCode: '.slice().sort()',
    };

    const weakPattern = {
      errorCategory: 'runtime',
      errorMessage: 'timeout error',
      fixDescription: 'increase timeout',
      fixCode: 'setTimeout(fn, 5000)',
    };

    const goodScore = scoreRelevance(finding, goodPattern, mapping);
    const weakScore = scoreRelevance(finding, weakPattern, mapping);
    assert(goodScore > weakScore, `Good score (${goodScore}) should be > weak score (${weakScore})`);
  });
});

describe('extractKeywords', () => {
  it('extracts words longer than 3 chars', () => {
    const keywords = extractKeywords('.sort() mutates array', 'Use .slice().sort()');
    assert(keywords.includes('sort'));
    assert(keywords.includes('mutates'));
    assert(!keywords.includes('Use'));
  });

  it('handles null/undefined', () => {
    assert(Array.isArray(extractKeywords(null, null)));
    assert(Array.isArray(extractKeywords(undefined, undefined)));
  });
});

describe('BUG_CLASS_TO_DEBUG_CATEGORIES', () => {
  it('has mappings for all 6 bug classes', () => {
    for (const cls of Object.values(BUG_CLASSES)) {
      assert(BUG_CLASS_TO_DEBUG_CATEGORIES[cls], `Missing mapping for ${cls}`);
      assert(BUG_CLASS_TO_DEBUG_CATEGORIES[cls].categories.length > 0, `Empty categories for ${cls}`);
      assert(BUG_CLASS_TO_DEBUG_CATEGORIES[cls].keywords.length > 0, `Empty keywords for ${cls}`);
    }
  });
});

console.log('All audit-cross-reference tests passed');
