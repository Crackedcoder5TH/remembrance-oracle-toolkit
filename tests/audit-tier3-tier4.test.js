'use strict';

/**
 * Tests for Tier 3 (feedback loop + ergonomics) and Tier 4 (structural)
 * audit features.
 *
 * Coverage:
 *   - Baseline: build, diff, regressed/improved files
 *   - Auto-fix: each confident rule produces a working patch
 *   - Feedback: record + calibrate
 *   - Explain: every rule has a well-formed entry
 *   - Smell: long functions, deep nesting, too many params, feature envy
 *   - Bayesian prior: matches known-buggy fingerprints
 *   - Rich summary: aggregates everything without crashing
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { auditCode } = require('../src/audit/ast-checkers');

// ─── Baseline ──────────────────────────────────────────────────────────────

describe('audit baseline', () => {
  const { buildBaseline, diffAgainstBaseline, fingerprint } = require('../src/audit/baseline');

  it('fingerprints a finding deterministically', () => {
    const f = { ruleId: 'type/division-by-zero', line: 10, code: 'return a / b;' };
    const a = fingerprint(f, 'x.js');
    const b = fingerprint(f, 'x.js');
    assert.equal(a, b);
    assert.notEqual(a, fingerprint({ ...f, code: 'other' }, 'x.js'));
  });

  it('marks every current finding as NEW when no baseline exists', () => {
    const current = { 'x.js': [{ ruleId: 'type/division-by-zero', line: 1, code: 'a / b', severity: 'medium' }] };
    const r = diffAgainstBaseline(null, current, '/');
    assert.equal(r.new.length, 1);
    assert.equal(r.fixed.length, 0);
  });

  it('identifies new, persisted, and fixed findings', () => {
    const baseline = buildBaseline({
      'x.js': [
        { ruleId: 'type/division-by-zero', line: 1, code: 'a / b', severity: 'medium' },
        { ruleId: 'state-mutation/sort',    line: 5, code: 'data.sort()', severity: 'high' },
      ],
    }, '/');

    const current = {
      'x.js': [
        { ruleId: 'type/division-by-zero', line: 1, code: 'a / b', severity: 'medium' }, // persisted
        { ruleId: 'integration/nullable-deref', line: 10, code: 'u.email', severity: 'high' }, // new
      ],
    };

    const diff = diffAgainstBaseline(baseline, current, '/');
    assert.equal(diff.persisted.length, 1);
    assert.equal(diff.new.length, 1);
    assert.equal(diff.fixed.length, 1);
    assert.equal(diff.fixed[0].ruleId, 'state-mutation/sort');
  });
});

// ─── Auto-fix ──────────────────────────────────────────────────────────────

describe('audit auto-fix', () => {
  const { generatePatchFor, applyPatches } = require('../src/audit/auto-fix');
  const { parseProgram } = require('../src/audit/parser');

  function fix(src) {
    const r = auditCode(src);
    const program = parseProgram(src);
    const patches = [];
    for (const f of r.findings) {
      const p = generatePatchFor(f, src, program);
      if (p) patches.push(...p);
    }
    return applyPatches(src, patches);
  }

  it('inserts .slice() before .sort()', () => {
    const { source, applied } = fix('function f(a) { return a.sort(); }');
    assert.equal(applied, 1);
    assert.ok(source.includes('.slice().sort()'));
  });

  it('inserts .slice() before .reverse()', () => {
    const { source, applied } = fix('function f(a) { return a.reverse(); }');
    assert.equal(applied, 1);
    assert.ok(source.includes('.slice().reverse()'));
  });

  it('wraps Object.assign first arg in {}', () => {
    const { source, applied } = fix('function f(x) { return Object.assign(x, { a: 1 }); }');
    assert.equal(applied, 1);
    assert.ok(source.includes('Object.assign({}, x'));
  });

  it('wraps division in a zero-guard', () => {
    const { source, applied } = fix('function avg(arr, count) { return arr.reduce((s,x)=>s+x,0) / count; }');
    assert.equal(applied, 1);
    assert.ok(source.includes('count === 0 ? 0 :'));
    // The reduce call should be fully inside the guard, not split
    assert.ok(source.includes('arr.reduce((s,x)=>s+x,0) / count'));
  });

  it('appends default: break to a switch without default', () => {
    const src = 'function f(x) { switch (x) { case 1: return 1; case 2: return 2; } }';
    const { source, applied } = fix(src);
    assert.equal(applied, 1);
    assert.ok(source.includes('default: break'));
  });

  it('leaves rules without confident fixes untouched', () => {
    const src = 'function a(x) { if (!x) return null; return { v: 1 }; }\nfunction b() { const r = a(1); return r.v; }';
    const { applied } = fix(src);
    // integration/nullable-deref has no auto-fix → 0 applied
    assert.equal(applied, 0);
  });
});

// ─── Feedback + calibration ────────────────────────────────────────────────

describe('audit feedback', () => {
  const {
    loadStore, saveStore, recordFeedback, confidenceFor, calibrateSeverity,
    calibrateFindings, MIN_OBSERVATIONS,
  } = require('../src/audit/feedback');

  let repoRoot;
  before(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-feedback-'));
  });
  after(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('records and persists fix/dismiss events', () => {
    recordFeedback(repoRoot, 'fix', 'type/division-by-zero');
    recordFeedback(repoRoot, 'fix', 'type/division-by-zero');
    recordFeedback(repoRoot, 'dismiss', 'type/division-by-zero');
    const store = loadStore(path.join(repoRoot, '.remembrance', 'audit-feedback.json'));
    assert.equal(store.rules['type/division-by-zero'].fixed, 2);
    assert.equal(store.rules['type/division-by-zero'].dismissed, 1);
  });

  it('returns confidence = 1.0 for rules below the min observation threshold', () => {
    const store = { rules: { 'new-rule': { fixed: 1, dismissed: 0 } } };
    assert.equal(confidenceFor(store, 'new-rule'), 1.0);
  });

  it('downgrades severity based on confidence', () => {
    assert.equal(calibrateSeverity('high', 0.9), 'high');
    assert.equal(calibrateSeverity('high', 0.5), 'medium');
    assert.equal(calibrateSeverity('high', 0.2), 'low');
  });

  it('calibrateFindings drops findings with confidence < 0.25', () => {
    // Build a store with a noisy rule
    const noisyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-noisy-'));
    try {
      for (let i = 0; i < 10; i++) recordFeedback(noisyRoot, 'dismiss', 'noise/fake');
      const findings = [{ ruleId: 'noise/fake', bugClass: 'noise', severity: 'high', line: 1, file: 'x.js' }];
      const out = calibrateFindings(findings, noisyRoot);
      assert.equal(out.length, 0);
    } finally {
      fs.rmSync(noisyRoot, { recursive: true, force: true });
    }
  });
});

// ─── Explain ───────────────────────────────────────────────────────────────

describe('audit explain', () => {
  const { EXPLANATIONS, explain, listRules } = require('../src/audit/explain');

  it('has a well-formed entry for every known rule', () => {
    for (const [ruleId, info] of Object.entries(EXPLANATIONS)) {
      assert.ok(info.summary, `${ruleId} missing summary`);
      assert.ok(info.why, `${ruleId} missing why`);
      assert.ok(info.bad, `${ruleId} missing bad example`);
      assert.ok(info.good, `${ruleId} missing good example`);
      assert.ok(['bug', 'style', 'smell'].includes(info.category), `${ruleId} bad category ${info.category}`);
    }
  });

  it('returns null for unknown rules', () => {
    assert.equal(explain('does-not-exist'), null);
  });

  it('lists rules filtered by category', () => {
    const bugs = listRules('bug');
    const styles = listRules('style');
    const smells = listRules('smell');
    assert.ok(bugs.length > 0);
    assert.ok(styles.length > 0);
    assert.ok(smells.length > 0);
    assert.ok(bugs.every(r => r.category === 'bug'));
  });
});

// ─── Smells ────────────────────────────────────────────────────────────────

describe('audit smell', () => {
  const { smellCode } = require('../src/audit/smell-checkers');

  it('flags functions longer than threshold', () => {
    const body = 'console.log(1);\n'.repeat(100);
    const src = 'function long() {\n' + body + '}';
    const r = smellCode(src, { thresholds: { longFunctionLines: 50 } });
    assert.ok(r.findings.some(f => f.ruleId === 'smell/long-function'));
  });

  it('flags deeply nested blocks', () => {
    const src = 'function nest(x) { if (x) { if (x.a) { if (x.a.b) { if (x.a.b.c) { if (x.a.b.c.d) { return 1; } } } } } }';
    const r = smellCode(src, { thresholds: { deepNestingDepth: 3 } });
    assert.ok(r.findings.some(f => f.ruleId === 'smell/deep-nesting'));
  });

  it('flags too many parameters', () => {
    const src = 'function draw(x, y, w, h, color, stroke, fill) { return 1; }';
    const r = smellCode(src, { thresholds: { tooManyParams: 5 } });
    assert.ok(r.findings.some(f => f.ruleId === 'smell/too-many-params'));
  });

  it('flags feature envy', () => {
    const src = `function compute(order, customer) {
      const a = customer.tier.discount;
      const b = customer.tier.ratio;
      const c = customer.address.zip;
      const d = customer.preferences.theme;
      return a + b + c + d;
    }`;
    const r = smellCode(src);
    assert.ok(r.findings.some(f => f.ruleId === 'smell/feature-envy'));
  });
});

// ─── Bayesian prior ────────────────────────────────────────────────────────

describe('audit bayesian prior', () => {
  const { scorePrior, loadPrior, similarity } = require('../src/audit/bayesian-prior');

  it('loads seed prior file', () => {
    const prior = loadPrior();
    assert.ok(prior);
    assert.ok(Array.isArray(prior.patterns));
    assert.ok(prior.patterns.length >= 5);
  });

  it('computes similarity between fingerprints', () => {
    assert.equal(similarity(null, null), 0);
    assert.equal(similarity({ hash: 'abc' }, { hash: 'abc' }), 1);
    assert.ok(similarity({ skeleton: 'function foo bar' }, { skeleton: 'function foo bar baz' }) > 0);
  });

  it('returns an array (possibly empty) for a source string', () => {
    const src = 'function f(x) { return x + 1; }';
    const found = scorePrior(src, 'x.js');
    assert.ok(Array.isArray(found));
  });
});

// ─── Rich summary ──────────────────────────────────────────────────────────

describe('audit rich summary', () => {
  const { buildSummary } = require('../src/audit/rich-summary');

  it('aggregates an empty input without crashing', () => {
    const r = buildSummary({ findings: [] });
    assert.equal(r.totals.findings, 0);
    assert.equal(r.totals.bugs, 0);
  });

  it('categorizes bugs vs. style vs. smells', () => {
    const findings = [
      { bugClass: 'type', ruleId: 'type/division-by-zero', severity: 'medium', file: 'a.js' },
      { bugClass: 'integration', ruleId: 'integration/nullable-deref', severity: 'high', file: 'a.js' },
    ];
    const lint = [{ ruleId: 'lint/parameter-validation', severity: 'info', file: 'b.js' }];
    const smell = [{ ruleId: 'smell/long-function', severity: 'info', file: 'c.js' }];
    const r = buildSummary({ findings, lintFindings: lint, smellFindings: smell });
    assert.equal(r.totals.bugs, 2);
    assert.equal(r.totals.styleHints, 1);
    assert.equal(r.totals.smells, 1);
    assert.ok(r.breakdown.topBugClasses.length > 0);
  });

  it('tracks worst files by count', () => {
    const findings = [
      { ruleId: 'r1', bugClass: 'type', file: 'a.js' },
      { ruleId: 'r2', bugClass: 'type', file: 'a.js' },
      { ruleId: 'r3', bugClass: 'type', file: 'b.js' },
    ];
    const r = buildSummary({ findings });
    assert.equal(r.worstFiles[0].file, 'a.js');
    assert.equal(r.worstFiles[0].count, 2);
  });
});
