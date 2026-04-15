'use strict';

/**
 * Tests for the read-time grounding check.
 *
 * The grounding check is the second half of the anti-hallucination
 * defense. It parses a file's identifier references, cross-checks
 * each function call against (a) symbols defined in the same file,
 * (b) the JS/Node built-in allowlist, and (c) a caller-supplied set
 * of "known" identifiers (typically from the session ledger). Calls
 * that don't resolve to any of these are reported as candidate
 * fabrications.
 *
 * Test plan:
 *   - Pure functions: identifier extraction, defined-set, called-set
 *   - groundFile() integration: file-not-found, parse-failure, mixed
 *     local/known/unknown, real-world toolkit files
 *   - False-positive guardrails: member access, this.x, builtins,
 *     destructuring, arrow params, import bindings
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  groundFile,
  extractAllIdentifiers,
  extractDefinedIdentifiers,
  extractCalledIdentifiers,
  BUILTINS,
} = require('../src/audit/ground');
const { tokenize } = require('../src/audit/parser');

function makeTempFile(name, content) {
  const p = path.join(os.tmpdir(), `ground-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}

// ── Pure helpers ────────────────────────────────────────────────────────

describe('extractAllIdentifiers', () => {
  it('returns a Set of every identifier in the source', () => {
    const ids = extractAllIdentifiers('function foo(a, b) { return a + b; }');
    assert.ok(ids instanceof Set);
    assert.ok(ids.has('foo'));
    assert.ok(ids.has('a'));
    assert.ok(ids.has('b'));
  });

  it('returns an empty Set on parse failure (degrades gracefully)', () => {
    // Wildly malformed input — tokenizer may or may not throw, but
    // extractAllIdentifiers always returns something iterable.
    const ids = extractAllIdentifiers('}}}{{{[[[');
    assert.ok(ids instanceof Set);
  });
});

describe('extractDefinedIdentifiers', () => {
  it('catches function declarations', () => {
    const tokens = tokenize('function add(a, b) { return a + b; }');
    const defined = extractDefinedIdentifiers(tokens);
    assert.ok(defined.has('add'));
    assert.ok(defined.has('a'));
    assert.ok(defined.has('b'));
  });

  it('catches const / let / var bindings', () => {
    const tokens = tokenize('const x = 1; let y = 2; var z = 3;');
    const defined = extractDefinedIdentifiers(tokens);
    assert.ok(defined.has('x'));
    assert.ok(defined.has('y'));
    assert.ok(defined.has('z'));
  });

  it('catches destructured const bindings', () => {
    const tokens = tokenize('const { foo, bar } = require("baz");');
    const defined = extractDefinedIdentifiers(tokens);
    assert.ok(defined.has('foo'));
    assert.ok(defined.has('bar'));
  });

  it('catches array destructuring', () => {
    const tokens = tokenize('const [first, second] = arr;');
    const defined = extractDefinedIdentifiers(tokens);
    assert.ok(defined.has('first'));
    assert.ok(defined.has('second'));
  });

  it('catches class declarations', () => {
    const tokens = tokenize('class MyService { method() {} }');
    const defined = extractDefinedIdentifiers(tokens);
    assert.ok(defined.has('MyService'));
  });

  it('catches import bindings', () => {
    const tokens = tokenize('import { readFile, writeFile } from "fs";');
    const defined = extractDefinedIdentifiers(tokens);
    assert.ok(defined.has('readFile'));
    assert.ok(defined.has('writeFile'));
  });
});

describe('extractCalledIdentifiers', () => {
  it('finds function calls in call position', () => {
    const tokens = tokenize('foo(); bar(1, 2);');
    const calls = extractCalledIdentifiers(tokens);
    const names = calls.map(c => c.name);
    assert.ok(names.includes('foo'));
    assert.ok(names.includes('bar'));
  });

  it('skips member-access calls', () => {
    const tokens = tokenize('obj.method(); arr.push(1);');
    const calls = extractCalledIdentifiers(tokens);
    const names = calls.map(c => c.name);
    assert.ok(!names.includes('method'), 'method() on obj should NOT be flagged');
    assert.ok(!names.includes('push'), 'push() on arr should NOT be flagged');
  });

  it('records line and column for each call', () => {
    const tokens = tokenize('\n\nfoo();');
    const calls = extractCalledIdentifiers(tokens);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'foo');
    assert.equal(calls[0].line, 3);
  });
});

// ── groundFile integration ───────────────────────────────────────────────

describe('groundFile', () => {
  it('returns error for missing file', () => {
    const r = groundFile('/nonexistent-grounding-test-path.js', new Set());
    assert.equal(r.error, 'not found');
    assert.deepEqual(r.ungrounded, []);
  });

  it('grounds local function calls (defined in the same file)', () => {
    const file = makeTempFile('local.js', `
      function helper(x) { return x * 2; }
      function main() {
        const result = helper(21);
        return result;
      }
    `);
    try {
      const r = groundFile(file, new Set());
      assert.equal(r.ungrounded.length, 0);
      assert.ok(r.grounded >= 1);
    } finally { fs.unlinkSync(file); }
  });

  it('grounds known identifiers from the session ledger', () => {
    const file = makeTempFile('known.js', `
      function main() {
        return externalThing();
      }
    `);
    try {
      // Pretend the agent already read a file containing externalThing
      const known = new Set(['externalThing']);
      const r = groundFile(file, known);
      assert.equal(r.ungrounded.length, 0);
    } finally { fs.unlinkSync(file); }
  });

  it('flags a fabricated function call as ungrounded', () => {
    const file = makeTempFile('fab.js', `
      function main(x) {
        const a = realThing(x);
        const b = totallyMadeUpFunction(a);
        return b;
      }
      function realThing(v) { return v + 1; }
    `);
    try {
      const r = groundFile(file, new Set());
      const names = r.ungrounded.map(u => u.name);
      assert.ok(names.includes('totallyMadeUpFunction'),
        `expected fabrication flagged, got: ${JSON.stringify(names)}`);
      // realThing IS defined locally — should NOT be flagged
      assert.ok(!names.includes('realThing'));
    } finally { fs.unlinkSync(file); }
  });

  it('does not flag JS built-ins like parseInt, Array, JSON', () => {
    const file = makeTempFile('builtins.js', `
      function f(s) {
        const n = parseInt(s, 10);
        const arr = Array.from({ length: 3 });
        const obj = JSON.parse(s);
        return { n, arr, obj };
      }
    `);
    try {
      const r = groundFile(file, new Set());
      const names = r.ungrounded.map(u => u.name);
      assert.ok(!names.includes('parseInt'));
      assert.ok(!names.includes('Array'));
      assert.ok(!names.includes('JSON'));
    } finally { fs.unlinkSync(file); }
  });

  it('does not flag Node globals like require, console, Buffer', () => {
    const file = makeTempFile('node.js', `
      const fs = require('fs');
      console.log(Buffer.from('hi'));
      setTimeout(() => {}, 100);
    `);
    try {
      const r = groundFile(file, new Set());
      const names = r.ungrounded.map(u => u.name);
      assert.ok(!names.includes('require'));
      assert.ok(!names.includes('setTimeout'));
    } finally { fs.unlinkSync(file); }
  });

  it('does not flag Buffer (built-in)', () => {
    assert.ok(BUILTINS.has('Buffer'));
  });

  it('flags an unknown identifier even when surrounded by known ones', () => {
    const file = makeTempFile('mixed.js', `
      function f(s) {
        const a = parseInt(s, 10);
        const b = nonexistentHelper(a);
        return JSON.stringify(b);
      }
    `);
    try {
      const r = groundFile(file, new Set());
      const names = r.ungrounded.map(u => u.name);
      assert.ok(names.includes('nonexistentHelper'));
      assert.ok(!names.includes('parseInt'));
      assert.ok(!names.includes('JSON'));
    } finally { fs.unlinkSync(file); }
  });

  it('returns groundedRate in [0, 1]', () => {
    const file = makeTempFile('rate.js', `
      function f() { return parseInt('1', 10); }
    `);
    try {
      const r = groundFile(file, new Set());
      assert.ok(r.summary.groundedRate >= 0 && r.summary.groundedRate <= 1);
    } finally { fs.unlinkSync(file); }
  });

  it('handles parse failures gracefully', () => {
    const file = makeTempFile('broken.js', '}}}{{{[[[');
    try {
      const r = groundFile(file, new Set());
      // Either an error string OR a degenerate-but-valid result
      assert.ok(r.error || typeof r.totalCalls === 'number');
    } finally { fs.unlinkSync(file); }
  });

  it('grounds itself: ground.js has no fabricated calls', () => {
    // Self-test: the grounding module should pass its own check when
    // given the union of identifiers from its own dependencies.
    const parserFile = path.join(__dirname, '..', 'src', 'audit', 'parser.js');
    if (!fs.existsSync(parserFile)) return; // skip if missing
    const parserIds = extractAllIdentifiers(fs.readFileSync(parserFile, 'utf-8'));
    const groundJs = path.join(__dirname, '..', 'src', 'audit', 'ground.js');
    const r = groundFile(groundJs, parserIds);
    // ground.js uses only local symbols + parser's tokenize + built-ins.
    assert.equal(r.ungrounded.length, 0,
      `ground.js must self-ground, got ungrounded: ${JSON.stringify(r.ungrounded.map(u => u.name))}`);
  });
});
