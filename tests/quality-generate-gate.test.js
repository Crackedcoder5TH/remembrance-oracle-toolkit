'use strict';

/**
 * Tests for src/quality/generate-gate.js — stage 2 of the anti-
 * hallucination pre-generation pipeline. The gate takes a verified
 * plan + a draft source and accepts the draft only when every call
 * site resolves to a plan symbol, a local definition, or a built-in.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { checkAgainstPlan } = require('../src/quality/generate-gate');

function writeDraft(name, content) {
  const p = path.join(os.tmpdir(), `gate-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}

describe('checkAgainstPlan — basic acceptance', () => {
  it('accepts a draft whose calls are all built-ins', () => {
    const draft = writeDraft('builtin.js', `
      const n = parseInt("42", 10);
      console.log(n);
    `);
    try {
      const r = checkAgainstPlan({
        plan: { intent: 't', verified: [], symbols: [] },
        draftPath: draft,
      });
      assert.equal(r.ok, true);
      assert.equal(r.violations.length, 0);
    } finally { fs.unlinkSync(draft); }
  });

  it('accepts a draft whose calls are all locally defined', () => {
    const draft = writeDraft('local.js', `
      function helper(x) { return x + 1; }
      function main() { return helper(5); }
    `);
    try {
      const r = checkAgainstPlan({
        plan: { intent: 't', verified: [], symbols: [] },
        draftPath: draft,
      });
      assert.equal(r.ok, true);
    } finally { fs.unlinkSync(draft); }
  });

  it('accepts a draft whose calls are all in the plan', () => {
    const draft = writeDraft('planned.js', `
      async function go() {
        return await retryWithBackoff(fn);
      }
    `);
    try {
      const r = checkAgainstPlan({
        plan: {
          intent: 'retry',
          verified: [{ symbol: 'retryWithBackoff', status: 'found' }],
        },
        draftPath: draft,
      });
      assert.equal(r.ok, true);
      assert.ok(r.grounded.some(g => g.name === 'retryWithBackoff' && g.source === 'plan'));
    } finally { fs.unlinkSync(draft); }
  });
});

describe('checkAgainstPlan — rejection', () => {
  it('rejects a draft with a fabricated call', () => {
    const draft = writeDraft('fab.js', `
      function go() {
        return totallyMadeUp(42);
      }
    `);
    try {
      const r = checkAgainstPlan({
        plan: { intent: 't', verified: [], symbols: [] },
        draftPath: draft,
      });
      assert.equal(r.ok, false);
      assert.equal(r.violations.length, 1);
      assert.equal(r.violations[0].name, 'totallyMadeUp');
    } finally { fs.unlinkSync(draft); }
  });

  it('reports line numbers for violations', () => {
    const draft = writeDraft('lines.js', `
function a() {}

function b() {
  fabricated();
}
`);
    try {
      const r = checkAgainstPlan({
        plan: { verified: [{ symbol: 'a' }] },
        draftPath: draft,
      });
      assert.equal(r.violations.length, 1);
      assert.ok(r.violations[0].line >= 4, `expected line >= 4, got ${r.violations[0].line}`);
    } finally { fs.unlinkSync(draft); }
  });

  it('counts mixed grounded + violations correctly', () => {
    const draft = writeDraft('mixed.js', `
      function local(x) { return x; }
      function go() {
        const a = local(1);
        const b = parseInt("2", 10);
        const c = fabricated(a, b);
        return c;
      }
    `);
    try {
      const r = checkAgainstPlan({
        plan: { verified: [] },
        draftPath: draft,
      });
      assert.equal(r.summary.totalCalls, 3);
      assert.equal(r.summary.grounded, 2);
      assert.equal(r.summary.violations, 1);
      assert.equal(r.violations[0].name, 'fabricated');
    } finally { fs.unlinkSync(draft); }
  });
});

describe('checkAgainstPlan — extraAllowlist', () => {
  it('permits symbols explicitly passed via extraAllowlist', () => {
    const draft = writeDraft('allow.js', `
      function go() {
        return parentScopeImport(42);
      }
    `);
    try {
      const r = checkAgainstPlan({
        plan: { verified: [] },
        draftPath: draft,
        extraAllowlist: ['parentScopeImport'],
      });
      assert.equal(r.ok, true);
      assert.ok(r.grounded.some(g => g.source === 'allowlist'));
    } finally { fs.unlinkSync(draft); }
  });
});

describe('checkAgainstPlan — input modes', () => {
  it('accepts inline draftCode instead of a file', () => {
    const r = checkAgainstPlan({
      plan: { verified: [] },
      draftCode: 'const n = parseInt("1", 10);',
    });
    assert.equal(r.ok, true);
  });

  it('returns an error result for missing file', () => {
    const r = checkAgainstPlan({
      plan: { verified: [] },
      draftPath: '/nonexistent-gate-draft-path.js',
    });
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });

  it('returns an error when neither draftPath nor draftCode is given', () => {
    const r = checkAgainstPlan({ plan: { verified: [] } });
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });
});

describe('checkAgainstPlan — fallback to bare symbols list', () => {
  it('uses plan.symbols when plan.verified is missing', () => {
    const r = checkAgainstPlan({
      plan: { symbols: ['allowedOne'] },
      draftCode: 'function go() { return allowedOne(); }',
    });
    assert.equal(r.ok, true);
  });
});
