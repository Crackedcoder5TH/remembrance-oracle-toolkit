const { describe, it } = require('node:test');
const assert = require('assert');
const {
  checkResolvedCode,
  enhanceResolveWithBugClasses,
  classifyDebugFix,
  BUG_CLASS_SIGNATURES,
} = require('../src/audit/resolve-hook');
const { BUG_CLASSES } = require('../src/audit/static-checkers');

describe('checkResolvedCode', () => {
  it('detects .sort() without .slice()', () => {
    const code = 'const sorted = items.sort((a, b) => a - b);';
    const warnings = checkResolvedCode(code);
    assert(warnings.some(w => w.bugClass === BUG_CLASSES.STATE_MUTATION));
  });

  it('does not flag .sort() with .slice()', () => {
    const code = 'const sorted = items.slice().sort((a, b) => a - b);';
    const warnings = checkResolvedCode(code);
    assert(!warnings.some(w => w.name.includes('.sort()')));
  });

  it('detects timing-unsafe secret comparison', () => {
    const code = "if (password === storedHash) { grant(); }";
    const warnings = checkResolvedCode(code);
    assert(warnings.some(w => w.bugClass === BUG_CLASSES.SECURITY));
  });

  it('detects unchecked JSON.parse', () => {
    const code = 'const data = JSON.parse(input);';
    const warnings = checkResolvedCode(code);
    assert(warnings.some(w => w.bugClass === BUG_CLASSES.TYPE));
  });

  it('does not flag JSON.parse in try-catch context', () => {
    const code = 'try { const data = JSON.parse(input); } catch (e) {}';
    const warnings = checkResolvedCode(code);
    assert(!warnings.some(w => w.name.includes('JSON.parse')));
  });

  it('detects switch without default', () => {
    const code = "switch (x) { case 1: break; case 2: break; }";
    const warnings = checkResolvedCode(code);
    assert(warnings.some(w => w.bugClass === BUG_CLASSES.EDGE_CASE));
  });

  it('does not flag switch with default', () => {
    const code = "switch (x) { case 1: break; default: break; }";
    const warnings = checkResolvedCode(code);
    assert(!warnings.some(w => w.name.includes('Switch')));
  });

  it('returns empty for safe code', () => {
    const code = 'const x = 1 + 2;';
    assert.deepStrictEqual(checkResolvedCode(code), []);
  });

  it('handles null/undefined gracefully', () => {
    assert.deepStrictEqual(checkResolvedCode(null), []);
    assert.deepStrictEqual(checkResolvedCode(undefined), []);
    assert.deepStrictEqual(checkResolvedCode(''), []);
  });

  it('filters by bug class', () => {
    const code = `
const sorted = items.sort();
const data = JSON.parse(input);
`;
    const warnings = checkResolvedCode(code, { bugClasses: [BUG_CLASSES.STATE_MUTATION] });
    assert(warnings.every(w => w.bugClass === BUG_CLASSES.STATE_MUTATION));
  });
});

describe('enhanceResolveWithBugClasses', () => {
  it('adds bugClassWarnings to resolve result', () => {
    const result = {
      decision: 'pull',
      confidence: 0.8,
      healedCode: 'const sorted = items.sort();',
      pattern: { language: 'javascript' },
    };
    const enhanced = enhanceResolveWithBugClasses(result, null);
    assert(enhanced.bugClassWarnings, 'Should have bugClassWarnings');
    assert(enhanced.bugClassWarnings.length > 0);
  });

  it('does not modify result for safe code', () => {
    const result = {
      decision: 'pull',
      confidence: 0.8,
      healedCode: 'const x = 1;',
      pattern: { language: 'javascript' },
    };
    const enhanced = enhanceResolveWithBugClasses(result, null);
    assert(!enhanced.bugClassWarnings, 'Should not add warnings for safe code');
  });

  it('suggests evolve for security-class warnings on pull', () => {
    const result = {
      decision: 'pull',
      confidence: 0.8,
      healedCode: "if (password === 'secret') { grant(); }",
      pattern: { language: 'javascript' },
    };
    const enhanced = enhanceResolveWithBugClasses(result, null);
    assert(enhanced.bugClassOverride, 'Should suggest override');
    assert.strictEqual(enhanced.bugClassOverride.newDecision, 'evolve');
  });

  it('handles null resolve result gracefully', () => {
    assert.strictEqual(enhanceResolveWithBugClasses(null, null), null);
    assert.strictEqual(enhanceResolveWithBugClasses(undefined, null), undefined);
  });

  it('handles missing healedCode gracefully', () => {
    const result = { decision: 'generate', confidence: 0 };
    assert.strictEqual(enhanceResolveWithBugClasses(result, null), result);
  });
});

describe('classifyDebugFix', () => {
  it('classifies state mutation fixes', () => {
    const fix = { errorMessage: 'Array was mutated in-place', fixCode: '.slice().sort()' };
    assert.strictEqual(classifyDebugFix(fix), BUG_CLASSES.STATE_MUTATION);
  });

  it('classifies security fixes', () => {
    const fix = { errorMessage: 'Timing attack on secret', fixCode: 'timingSafeEqual()' };
    assert.strictEqual(classifyDebugFix(fix), BUG_CLASSES.SECURITY);
  });

  it('classifies concurrency fixes', () => {
    const fix = { errorMessage: 'Deadlock in worker pool', fixCode: 'mutex.acquire()' };
    assert.strictEqual(classifyDebugFix(fix), BUG_CLASSES.CONCURRENCY);
  });

  it('classifies type fixes', () => {
    const fix = { errorMessage: 'NaN from division', fixCode: 'zero guard' };
    assert.strictEqual(classifyDebugFix(fix), BUG_CLASSES.TYPE);
  });

  it('classifies integration fixes', () => {
    const fix = { errorMessage: 'return null crash', fixCode: 'null check' };
    assert.strictEqual(classifyDebugFix(fix), BUG_CLASSES.INTEGRATION);
  });

  it('classifies edge case fixes', () => {
    const fix = { errorMessage: 'Missing default case in switch', fixCode: 'default handler' };
    assert.strictEqual(classifyDebugFix(fix), BUG_CLASSES.EDGE_CASE);
  });

  it('returns null for unclassifiable', () => {
    assert.strictEqual(classifyDebugFix({ errorMessage: 'xyz', fixCode: 'abc' }), null);
  });

  it('handles null gracefully', () => {
    assert.strictEqual(classifyDebugFix(null), null);
  });
});

console.log('All audit-resolve-hook tests passed');
