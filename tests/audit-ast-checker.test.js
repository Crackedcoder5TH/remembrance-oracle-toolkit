'use strict';

/**
 * Tests for the new AST-based audit checker.
 *
 * The main goal: prove that the regex-era false positives are gone AND
 * that real bugs still fire. Each test targets a specific symptom from
 * the last session's bug hunt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { auditCode } = require('../src/audit/ast-checkers');
const { tokenize, parseProgram } = require('../src/audit/parser');
const { lintCode } = require('../src/audit/lint-checkers');
const { parseComments, isSuppressed, loadIgnoreFile } = require('../src/audit/suppressions');
const { buildScope, analyzeCondition } = require('../src/audit/scope');
const { computeTainted } = require('../src/audit/taint');
const { inferNullability } = require('../src/audit/type-inference');
const { buildCallGraph, findNullDerefCascades } = require('../src/audit/call-graph');

// ─── Tokenizer — regex vs. division ─────────────────────────────────────────

describe('parser.tokenize: regex literal handling', () => {
  it('recognizes /covenant/i as a regex, not division', () => {
    const src = 'const m = /covenant/i.test(path);';
    const toks = tokenize(src);
    const regexTok = toks.find(t => t.type === 'regex');
    assert.ok(regexTok, 'should emit a regex token');
    assert.equal(regexTok.value.flags, 'i');
  });

  it('recognizes /\\bTODO\\b/gi as a regex with gi flags', () => {
    const src = 'const r = /\\bTODO\\b/gi;';
    const toks = tokenize(src);
    const regexTok = toks.find(t => t.type === 'regex');
    assert.ok(regexTok);
    assert.equal(regexTok.value.flags, 'gi');
  });

  it('treats a / b as division, not a regex', () => {
    const src = 'const x = a / b;';
    const toks = tokenize(src);
    const divOp = toks.find(t => t.type === 'operator' && t.value === '/');
    const regex = toks.find(t => t.type === 'regex');
    assert.ok(divOp, 'should emit a division operator');
    assert.ok(!regex, 'should NOT emit a regex token for division');
  });

  it('tracks line and column on every token', () => {
    const src = 'function foo() {\n  return 1;\n}';
    const toks = tokenize(src);
    const foo = toks.find(t => t.value === 'foo');
    const ret = toks.find(t => t.value === 'return');
    assert.equal(foo.line, 1);
    assert.equal(ret.line, 2);
  });
});

// ─── False-positive eliminations from last session ─────────────────────────

describe('ast-checkers: regex-era false positives', () => {
  it('does not flag /covenant/i.test(path)', () => {
    const src = `
      function isExempt(p) {
        if (/covenant/i.test(p)) return true;
        return false;
      }
    `;
    assert.equal(auditCode(src).findings.length, 0);
  });

  it('does not flag template-literal PRAGMA as shell injection', () => {
    const src = `
      function init(db) {
        db.exec(\`PRAGMA journal_mode = WAL\`);
        db.exec(\`CREATE TABLE IF NOT EXISTS foo (id TEXT)\`);
      }
    `;
    assert.equal(auditCode(src).findings.length, 0);
  });

  it('does not flag already-guarded null deref inside if block', () => {
    const src = `
      function doStuff(map, key) {
        const byId = map.get(key);
        if (byId) {
          const score = byId.coherencyScore;
          return score;
        }
        return null;
      }
    `;
    const findings = auditCode(src).findings;
    // No integration/nullable-deref finding on byId
    assert.equal(findings.filter(f => f.bugClass === 'integration').length, 0);
  });

  it('does not flag early-exit guard-clause pattern', () => {
    const src = `
      function fetchAndUse() {
        const data = callExternal();
        if (!data) return null;
        return { value: data.coherence, count: data.items };
      }
      function callExternal() {
        if (Math.random() < 0.5) return null;
        return { coherence: 1, items: [] };
      }
    `;
    const findings = auditCode(src).findings;
    assert.equal(findings.filter(f => f.bugClass === 'integration').length, 0);
  });

  it('does not flag JSON content inside a string literal', () => {
    const src = `
      function emitSql() {
        const sample = "SELECT * FROM users WHERE id = 1";
        return sample;
      }
    `;
    assert.equal(auditCode(src).findings.length, 0);
  });

  it('does not flag regex flag suffix as division by zero', () => {
    const src = `
      function clean(s) {
        return s.replace(/foo/gi, '').replace(/bar/i, '');
      }
    `;
    assert.equal(auditCode(src).findings.length, 0);
  });
});

// ─── Real bugs still fire ───────────────────────────────────────────────────

describe('ast-checkers: real bug detection', () => {
  it('flags .sort() mutation without copy', () => {
    const src = `
      function getSorted(data) {
        return data.sort((a, b) => a - b);
      }
    `;
    const findings = auditCode(src).findings;
    assert.ok(findings.some(f => f.ruleId === 'state-mutation/sort'));
  });

  it('does not flag data.slice().sort() — copy-then-sort is safe', () => {
    const src = `
      function getSorted(data) {
        return data.slice().sort((a, b) => a - b);
      }
    `;
    const findings = auditCode(src).findings;
    assert.equal(findings.filter(f => f.bugClass === 'state-mutation').length, 0);
  });

  it('flags division by non-guarded variable', () => {
    const src = `
      function avg(arr, count) {
        return arr.reduce((s, x) => s + x, 0) / count;
      }
    `;
    const findings = auditCode(src).findings;
    assert.ok(findings.some(f => f.ruleId === 'type/division-by-zero'));
  });

  it('does not flag division by a || 1 guarded divisor', () => {
    const src = `
      function avg(arr, count) {
        return arr.reduce((s, x) => s + x, 0) / (count || 1);
      }
    `;
    const findings = auditCode(src).findings;
    assert.equal(findings.filter(f => f.ruleId === 'type/division-by-zero').length, 0);
  });

  it('flags eval(req.body.code) via taint tracking', () => {
    const src = `
      function runUserCode(req) {
        const code = req.body.code;
        eval(code);
      }
    `;
    const findings = auditCode(src).findings;
    assert.ok(findings.some(f => f.ruleId === 'security/eval'));
  });

  it('flags db.query with interpolated req.body input', () => {
    const src = `
      function search(req) {
        const name = req.body.name;
        db.query(\`SELECT * FROM users WHERE name='\${name}'\`);
      }
    `;
    const findings = auditCode(src).findings;
    assert.ok(findings.some(f => f.ruleId === 'security/sql-query'));
  });

  it('flags nullable-return deref without guard', () => {
    const src = `
      function findPattern(id) {
        if (!id) return null;
        return { name: 'x' };
      }
      function getName(id) {
        const p = findPattern(id);
        return p.name;
      }
    `;
    const findings = auditCode(src).findings;
    assert.ok(findings.some(f => f.ruleId === 'integration/nullable-deref'));
  });
});

// ─── Suppression directives ────────────────────────────────────────────────

describe('suppressions', () => {
  it('suppresses the next line with oracle-ignore-next-line', () => {
    const src = `
      function calc(a, b) {
        // oracle-ignore-next-line: type
        return a / b;
      }
    `;
    assert.equal(auditCode(src).findings.length, 0);
  });

  it('suppresses only the specified rule', () => {
    const src = `
      function messy(data) {
        // oracle-ignore-next-line: type
        return data.sort().map((x, i) => x / i);
      }
    `;
    const findings = auditCode(src).findings;
    // state-mutation/sort should still fire because we suppressed only 'type'
    assert.ok(findings.some(f => f.bugClass === 'state-mutation'));
    assert.equal(findings.filter(f => f.bugClass === 'type').length, 0);
  });

  it('suppresses the whole file with oracle-ignore-file', () => {
    const src = `
      // oracle-ignore-file: security
      function bad(req) {
        eval(req.body.code);
      }
    `;
    assert.equal(auditCode(src).findings.length, 0);
  });
});

// ─── .oracle-ignore file ────────────────────────────────────────────────────

describe('loadIgnoreFile', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  it('matches glob patterns', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-ignore-test-'));
    fs.writeFileSync(path.join(dir, '.oracle-ignore'), 'tests/**\n!tests/important.js\ndist/*\n');
    const matcher = loadIgnoreFile(dir);
    assert.equal(matcher.shouldIgnore(path.join(dir, 'tests/foo.test.js')), true);
    assert.equal(matcher.shouldIgnore(path.join(dir, 'tests/important.js')), false);
    assert.equal(matcher.shouldIgnore(path.join(dir, 'dist/bundle.js')), true);
    assert.equal(matcher.shouldIgnore(path.join(dir, 'src/lib.js')), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ─── Scope analysis ─────────────────────────────────────────────────────────

describe('scope analysis', () => {
  it('narrows x after if (x)', () => {
    const src = `
      function foo() {
        const x = maybe();
        if (x) {
          x.y;
        }
      }
    `;
    const p = parseProgram(src);
    const fn = p.functions[0];
    const scope = buildScope(fn.bodyTokens);
    // Find the x.y access inside the if block
    let foundInsideGuard = false;
    for (let i = 0; i < fn.bodyTokens.length; i++) {
      const t = fn.bodyTokens[i];
      if (t.type === 'identifier' && t.value === 'x' && fn.bodyTokens[i + 1]?.value === '.') {
        if (scope.nonNullAt(i).has('x')) foundInsideGuard = true;
      }
    }
    assert.ok(foundInsideGuard, 'x should be non-null inside the if (x) block');
  });

  it('promotes x to non-null after if (!x) return', () => {
    const src = `
      function foo() {
        const x = maybe();
        if (!x) return;
        const y = x.value;
      }
    `;
    const p = parseProgram(src);
    const fn = p.functions[0];
    const scope = buildScope(fn.bodyTokens);
    // Find x.value access — x should be in non-null set
    let promoted = false;
    for (let i = 0; i < fn.bodyTokens.length; i++) {
      const t = fn.bodyTokens[i];
      if (t.type === 'identifier' && t.value === 'x' && fn.bodyTokens[i + 1]?.value === '.') {
        if (scope.nonNullAt(i).has('x')) promoted = true;
      }
    }
    assert.ok(promoted, 'x should be promoted to non-null after early-exit guard');
  });
});

// ─── Condition analyzer ────────────────────────────────────────────────────

describe('analyzeCondition', () => {
  it('recognizes if (x != null)', () => {
    const { tokenize } = require('../src/audit/parser');
    const toks = tokenize('x != null');
    const r = analyzeCondition(toks);
    assert.deepEqual(r.trueBranch, ['x']);
  });

  it('recognizes if (!x) as negated', () => {
    const { tokenize } = require('../src/audit/parser');
    const toks = tokenize('!x');
    const r = analyzeCondition(toks);
    assert.deepEqual(r.negated, ['x']);
  });
});

// ─── Taint tracking ────────────────────────────────────────────────────────

describe('taint tracking', () => {
  it('treats function parameters as tainted', () => {
    const src = `function foo(req) { return req; }`;
    const p = parseProgram(src);
    const tainted = computeTainted(p.functions[0]);
    assert.ok(tainted.has('req'));
  });

  it('propagates taint through const assignment', () => {
    const src = `function foo(req) { const name = req.body.name; return name; }`;
    const p = parseProgram(src);
    const tainted = computeTainted(p.functions[0]);
    assert.ok(tainted.has('name'));
  });

  it('removes taint through parseInt sanitizer', () => {
    const src = `
      function f(req) {
        const raw = req.body.age;
        const n = parseInt(raw, 10);
        db.exec(\`SELECT * FROM users WHERE age = \${n}\`);
      }
    `;
    const findings = auditCode(src).findings;
    assert.equal(findings.filter(f => f.bugClass === 'security').length, 0);
  });
});

// ─── Nullable return inference ─────────────────────────────────────────────

describe('inferNullability', () => {
  it('marks functions that return null as nullable', () => {
    const src = `
      function a() { return null; }
      function b() { return 1; }
      function c() { if (x) return null; return 1; }
    `;
    const p = parseProgram(src);
    const info = inferNullability(p);
    assert.equal(info.functions.get('a').nullable, true);
    assert.equal(info.functions.get('b').nullable, false);
    assert.equal(info.functions.get('c').nullable, true);
  });

  it('marks empty-body functions as nullable (implicit undefined)', () => {
    const src = `function empty() {}`;
    const p = parseProgram(src);
    const info = inferNullability(p);
    assert.equal(info.functions.get('empty').nullable, true);
  });
});

// ─── Call-graph ────────────────────────────────────────────────────────────

describe('call-graph', () => {
  it('records definitions and calls', () => {
    const src = `
      function a() { return b(); }
      function b() { return 1; }
    `;
    const program = parseProgram(src);
    const graph = buildCallGraph([{ file: 'x.js', program }]);
    assert.ok(graph.defs.has('a'));
    assert.ok(graph.defs.has('b'));
    assert.ok(graph.calls.has('b'));
  });
});

// ─── Lint command (style checks) ───────────────────────────────────────────

describe('lint-checkers', () => {
  it('flags parseInt without radix as a warning', () => {
    const src = `
      function parse(x) {
        return parseInt(x);
      }
    `;
    const findings = lintCode(src).findings;
    assert.ok(findings.some(f => f.ruleId === 'lint/parseInt-no-radix'));
  });

  it('does not flag parseInt with radix', () => {
    const src = `
      function parse(x) {
        return parseInt(x, 10);
      }
    `;
    const findings = lintCode(src).findings;
    assert.equal(findings.filter(f => f.ruleId === 'lint/parseInt-no-radix').length, 0);
  });

  it('flags TODO comments', () => {
    const src = `
      // TODO: finish this
      function foo() {}
    `;
    const findings = lintCode(src).findings;
    assert.ok(findings.some(f => f.ruleId === 'lint/todo-comment'));
  });

  it('does not emit parameter-validation findings from audit check', () => {
    // Parameter validation moved to lint — audit should not fire it.
    const src = `
      function publicFn(a, b) {
        return a + b;
      }
    `;
    const audit = auditCode(src).findings;
    assert.equal(audit.filter(f => /parameter-validation/.test(f.ruleId || '')).length, 0);
    const lint = lintCode(src).findings;
    assert.ok(lint.some(f => f.ruleId === 'lint/parameter-validation'));
  });
});
