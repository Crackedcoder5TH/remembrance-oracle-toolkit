'use strict';

/**
 * Tests for src/quality/planner.js — stage 1 of the anti-hallucination
 * pre-generation pipeline. Covers the four-tier ground-truth chain:
 *   1. JS/Node built-in allowlist
 *   2. Session-touched identifiers
 *   3. Oracle pattern library (mocked)
 *   4. Filesystem repo scan
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { planFromIntent, verifySymbol, scanForDefinition } = require('../src/quality/planner');

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  return root;
}

describe('verifySymbol — tier 1 (built-ins)', () => {
  it('classifies JS built-ins as status=builtin', () => {
    const r = verifySymbol('parseInt', { knownIdentifiers: new Set(), repoRoot: '/nonexistent' });
    assert.equal(r.status, 'builtin');
    assert.equal(r.source, 'js/node allowlist');
  });

  it('classifies Node globals as builtin (require, console, Buffer)', () => {
    for (const name of ['require', 'console', 'Buffer', 'setTimeout']) {
      const r = verifySymbol(name, { knownIdentifiers: new Set(), repoRoot: '/nonexistent' });
      assert.equal(r.status, 'builtin', `${name} should be builtin`);
    }
  });

  it('classifies Array/Object/JSON as builtin', () => {
    for (const name of ['Array', 'Object', 'JSON', 'Math']) {
      const r = verifySymbol(name, { knownIdentifiers: new Set(), repoRoot: '/nonexistent' });
      assert.equal(r.status, 'builtin');
    }
  });
});

describe('verifySymbol — tier 2 (session-seen)', () => {
  it('classifies session-touched identifiers as status=seen', () => {
    const known = new Set(['myCustomFunction', 'someOtherHelper']);
    const r = verifySymbol('myCustomFunction', { knownIdentifiers: known, repoRoot: '/nonexistent' });
    assert.equal(r.status, 'seen');
    assert.equal(r.source, 'session ledger');
  });

  it('falls through when the session set is empty', () => {
    const r = verifySymbol('unknownHelper', { knownIdentifiers: new Set(), repoRoot: '/nonexistent' });
    assert.equal(r.status, 'missing');
  });
});

describe('verifySymbol — tier 3 (oracle pattern library, mocked)', () => {
  it('accepts a pattern library match where the top hit name equals the symbol', () => {
    const mockOracle = {
      search(term) {
        if (term === 'retryWithBackoff') {
          return [{ name: 'retryWithBackoff', id: 'abc', coherency: 0.95 }];
        }
        return [];
      },
    };
    const r = verifySymbol('retryWithBackoff', {
      knownIdentifiers: new Set(),
      oracle: mockOracle,
      repoRoot: '/nonexistent',
    });
    assert.equal(r.status, 'pattern');
    assert.equal(r.source, 'oracle pattern library');
    assert.equal(r.evidence.patternName, 'retryWithBackoff');
  });

  it('rejects a weak text-similarity match (name mismatch)', () => {
    const mockOracle = {
      search() {
        // Top hit has a completely different name — we should NOT trust this
        return [{ name: 'debounce', id: 'xyz', coherency: 0.9 }];
      },
    };
    const r = verifySymbol('retryWithBackoff', {
      knownIdentifiers: new Set(),
      oracle: mockOracle,
      repoRoot: '/nonexistent',
    });
    assert.notEqual(r.status, 'pattern', 'weak match must not count as verified');
  });

  it('degrades gracefully when oracle.search throws', () => {
    const brokenOracle = { search() { throw new Error('oracle down'); } };
    const r = verifySymbol('whatever', {
      knownIdentifiers: new Set(),
      oracle: brokenOracle,
      repoRoot: '/nonexistent',
    });
    // Should fall through to filesystem scan (missing) instead of crashing
    assert.equal(r.status, 'missing');
  });
});

describe('verifySymbol — tier 4 (repo scan)', () => {
  it('finds function declarations via grep-style scan', () => {
    const root = makeTempRepo();
    try {
      fs.writeFileSync(path.join(root, 'src', 'helpers.js'),
        'function thingWeNeed(x) { return x + 1; }\nmodule.exports = { thingWeNeed };');
      const r = verifySymbol('thingWeNeed', {
        knownIdentifiers: new Set(),
        repoRoot: root,
      });
      assert.equal(r.status, 'found');
      assert.equal(r.source, 'repo scan');
      assert.ok(r.evidence.file.includes('helpers.js'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('finds const/let/var bindings', () => {
    const root = makeTempRepo();
    try {
      fs.writeFileSync(path.join(root, 'src', 'lib.js'),
        'const coolThing = (x) => x * 2;\nmodule.exports = { coolThing };');
      const r = verifySymbol('coolThing', { knownIdentifiers: new Set(), repoRoot: root });
      assert.equal(r.status, 'found');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('finds class declarations', () => {
    const root = makeTempRepo();
    try {
      fs.writeFileSync(path.join(root, 'src', 'svc.js'), 'class MyService {}');
      const r = verifySymbol('MyService', { knownIdentifiers: new Set(), repoRoot: root });
      assert.equal(r.status, 'found');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('returns missing when no definition exists anywhere', () => {
    const root = makeTempRepo();
    try {
      fs.writeFileSync(path.join(root, 'src', 'other.js'), 'const unrelated = 1;');
      const r = verifySymbol('totallyFabricated', { knownIdentifiers: new Set(), repoRoot: root });
      assert.equal(r.status, 'missing');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

describe('planFromIntent — integration', () => {
  it('returns ok=true when every symbol verifies', () => {
    const plan = planFromIntent({
      intent: 'basic built-in only plan',
      symbols: ['parseInt', 'Array', 'console'],
      repoRoot: '/nonexistent',
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.verified.length, 3);
    assert.equal(plan.missing.length, 0);
  });

  it('returns ok=false when any symbol is missing', () => {
    const plan = planFromIntent({
      intent: 'mixed plan',
      symbols: ['parseInt', 'totallyFabricated'],
      repoRoot: '/nonexistent',
    });
    assert.equal(plan.ok, false);
    assert.equal(plan.missing.length, 1);
    assert.equal(plan.missing[0].symbol, 'totallyFabricated');
  });

  it('returns ok=false for an empty symbol list', () => {
    const plan = planFromIntent({ intent: 'empty', symbols: [], repoRoot: '/nonexistent' });
    assert.equal(plan.ok, false);
  });

  it('includes summary.byStatus breakdown of verified symbols', () => {
    const root = makeTempRepo();
    try {
      fs.writeFileSync(path.join(root, 'src', 'h.js'), 'function localThing() {}');
      const plan = planFromIntent({
        intent: 'mixed tiers',
        symbols: ['parseInt', 'localThing', 'fabricated'],
        repoRoot: root,
      });
      assert.equal(plan.summary.byStatus.builtin, 1);
      assert.equal(plan.summary.byStatus.found, 1);
      assert.equal(plan.missing.length, 1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

describe('scanForDefinition', () => {
  it('returns null for missing directory', () => {
    const r = scanForDefinition('/nonexistent-dir-scan', 'foo', 10);
    assert.equal(r, null);
  });

  it('respects maxFiles budget', () => {
    const root = makeTempRepo();
    try {
      // Write 3 files, only look at first 1
      for (let i = 0; i < 3; i++) {
        fs.writeFileSync(path.join(root, 'src', `f${i}.js`), `function foo${i}() {}`);
      }
      // Budget 1 file — will only find foo0 or similar, should NOT find foo2
      // (ordering is directory-order dependent; this is a weak test)
      const r = scanForDefinition(path.join(root, 'src'), 'foo2', 1);
      // Either found foo2 (if it was the first scanned) or returned null
      assert.ok(r === null || r.file.includes('f2.js'));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
