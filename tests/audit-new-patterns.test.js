/**
 * Tests for new audit bug-detection patterns from deep codebase audit.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { detectFalsyZeroCoercion } = require('../src/patterns/audit-patterns/falsy-zero-coercion');
const { detectShellInjection } = require('../src/patterns/audit-patterns/shell-injection-detection');
const { detectCacheMutation } = require('../src/patterns/audit-patterns/cache-mutation-detection');
const { detectSecurityScanBypass } = require('../src/patterns/audit-patterns/security-scan-bypass');
const { detectLoopQuery } = require('../src/patterns/audit-patterns/loop-query-detection');

describe('Falsy Zero Coercion Detection', () => {
  it('detects parseInt || default', () => {
    const code = `const version = parseInt(args.version) || undefined;`;
    const w = detectFalsyZeroCoercion(code);
    assert.ok(w.length > 0, 'Should detect parseInt || default');
  });

  it('detects parseFloat || default', () => {
    const code = `const threshold = parseFloat(args.threshold) || 0.85;`;
    const w = detectFalsyZeroCoercion(code);
    assert.ok(w.length > 0, 'Should detect parseFloat || default');
  });

  it('detects coherency || null', () => {
    const code = `coherencyBefore: context.coherencyBefore || null,`;
    const w = detectFalsyZeroCoercion(code);
    assert.ok(w.length > 0, 'Should detect coherency || null');
  });

  it('does not flag ?? usage', () => {
    const code = `const version = args.version ?? undefined;`;
    const w = detectFalsyZeroCoercion(code);
    assert.equal(w.length, 0, 'Should not flag nullish coalescing');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectFalsyZeroCoercion(null), []);
    assert.deepStrictEqual(detectFalsyZeroCoercion(''), []);
  });
});

describe('Shell Injection Detection', () => {
  it('detects execSync with template literal interpolation', () => {
    const code = 'execSync(`git diff ${range}`);';
    const w = detectShellInjection(code);
    assert.ok(w.length > 0, 'Should detect interpolated execSync');
  });

  it('detects execSync with string concatenation', () => {
    const code = 'execSync("git " + cmd + " " + arg);';
    const w = detectShellInjection(code);
    assert.ok(w.length > 0, 'Should detect concatenated execSync');
  });

  it('does not flag execFileSync', () => {
    const code = `execFileSync('git', ['diff', range]);`;
    const w = detectShellInjection(code);
    assert.equal(w.length, 0, 'Should not flag safe execFileSync');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectShellInjection(null), []);
  });
});

describe('Cache Mutation Detection', () => {
  it('detects pattern mutation in loop', () => {
    const code = `pattern.code = healedCode;`;
    const w = detectCacheMutation(code);
    assert.ok(w.length > 0, 'Should detect pattern mutation');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectCacheMutation(null), []);
  });
});

describe('Security Scan Bypass Detection', () => {
  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectSecurityScanBypass(null), []);
  });

  it('returns empty for safe code', () => {
    const code = `function calculate(x) { return x * 2; }`;
    assert.deepStrictEqual(detectSecurityScanBypass(code), []);
  });

  it('detects raw code matching in security function', () => {
    const code = [
      'function securityCheck(code) {',
      '  if (/eval/.test(code)) {',
      '    return { risk: "high" };',
      '  }',
      '}',
    ].join('\n');
    const w = detectSecurityScanBypass(code);
    assert.ok(w.length > 0, 'Should detect raw code matching without stripping');
  });

  it('does not flag when strip is called first', () => {
    const code = [
      'function securityScan(code) {',
      '  const stripped = stripStringsAndComments(code);',
      '  if (/eval/.test(stripped)) {',
      '    return { risk: "high" };',
      '  }',
      '}',
    ].join('\n');
    const w = detectSecurityScanBypass(code);
    assert.strictEqual(w.length, 0, 'Should not flag when strip is called');
  });

  it('detects const-based validator function names', () => {
    const code = [
      'const validateInput = function(code) {',
      '  if (/eval/.test(code)) return false;',
      '}',
    ].join('\n');
    const w = detectSecurityScanBypass(code);
    assert.ok(w.length > 0, 'Should detect const-based validator');
  });
});

describe('Loop Query Detection', () => {
  it('detects getAll inside for loop', () => {
    const code = [
      'for (const d of deltas) {',
      '  const patterns = store.getAllPatterns();',
      '  const p = patterns.find(x => x.id === d.id);',
      '}',
    ].join('\n');
    const w = detectLoopQuery(code);
    assert.ok(w.length > 0, 'Should detect query in loop');
  });

  it('does not flag query outside loop', () => {
    const code = [
      'const patterns = store.getAllPatterns();',
      'for (const d of deltas) {',
      '  const p = map.get(d.id);',
      '}',
    ].join('\n');
    const w = detectLoopQuery(code);
    assert.equal(w.length, 0, 'Should not flag query outside loop');
  });

  it('detects query in while loop', () => {
    const code = [
      'while (hasMore) {',
      '  const data = store.getAllItems();',
      '  process(data);',
      '}',
    ].join('\n');
    const w = detectLoopQuery(code);
    assert.ok(w.length > 0, 'Should detect query in while loop');
  });

  it('returns empty for null input', () => {
    assert.deepStrictEqual(detectLoopQuery(null), []);
  });

  it('returns empty for empty string', () => {
    assert.deepStrictEqual(detectLoopQuery(''), []);
  });
});
