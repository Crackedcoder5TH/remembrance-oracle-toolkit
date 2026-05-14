'use strict';

/**
 * Call-graph construction for cascade detection.
 *
 * Walks a set of parsed programs and builds a map of
 *   { defs: Map<name, DefLocation[]>, calls: Map<name, CallSite[]> }
 *
 * `defs` is "where functions are defined" (cross-file aware).
 * `calls` is "where each function is called from" (cross-file aware).
 *
 * Cascade detection then asks:
 *   "For every function whose signature or nullability changed between two
 *    commits, find every caller and check whether that caller relies on the
 *    old assumption."
 *
 * The primary questions we answer:
 *   - If fn used to return non-null and now returns nullable, which callers
 *     dereference the result without a null-check?
 *   - If fn used to take N params and now takes M, which callers pass the
 *     wrong arity?
 *   - If fn used to be sync and now is async, which callers forgot to await?
 *
 * For this first release we implement the first (nullable cascade). The
 * arity and async-becomes-sync cascades have scaffolding hooks.
 */

const { parseProgram, walkFunctions } = require('./parser');

/**
 * Build a call-graph from an array of parsed programs.
 *
 * @param {Array<{file: string, program: object}>} parsed
 * @returns {{ defs: Map, calls: Map }}
 */
function buildCallGraph(parsed) {
  const defs = new Map();   // name → [{ file, line, arity, async, node }]
  const calls = new Map();  // name → [{ file, line, args, resultVar?, fn }]

  for (const { file, program } of parsed) {
    walkFunctions(program, (fn) => {
      if (!fn.name) return;
      const arr = defs.get(fn.name) || [];
      arr.push({
        file,
        line: fn.line,
        arity: (fn.params || []).length,
        async: !!fn.async,
        node: fn,
      });
      defs.set(fn.name, arr);

      // Scan this function's body for outbound calls
      collectCalls(fn, file, calls);
    });

    // Also scan top-level non-function code for calls
    collectTopLevelCalls(program, file, calls);
  }

  return { defs, calls };
}

/**
 * Collect call sites from a function body. We track plain identifier calls
 * (fn(...)) and short member calls (this.fn(...), obj.fn(...)).
 */
function collectCalls(fn, file, calls) {
  const tokens = fn.bodyTokens || [];
  scanTokensForCalls(tokens, file, calls, fn);
}

function collectTopLevelCalls(program, file, calls) {
  // We don't have a top-level token array on the program, but the raw
  // tokens are on `program.tokens`. Scan whole file for calls not already
  // covered by function bodies (those are handled above).
  scanTokensForCalls(program.tokens, file, calls, null);
}

function scanTokensForCalls(tokens, file, calls, enclosingFn) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;
    const next = tokens[i + 1];
    if (!next || next.value !== '(') continue;

    // Skip declarations: `function foo(` or `class Foo { foo(`.
    const prev = tokens[i - 1];
    if (prev && (prev.value === 'function' || prev.value === 'class')) continue;

    // Skip member property name: `obj.foo(` — handled as a separate bucket
    // so that `foo()` at top level and `obj.foo()` don't collide.
    let name = t.value;
    const isMember = prev && prev.value === '.';

    // Collect args so we can track "result of fn(...)" assignments
    const args = extractArgs(tokens, i + 1);
    const resultVar = findResultBinding(tokens, i);

    const key = isMember ? `.${name}` : name;
    const arr = calls.get(key) || [];
    arr.push({
      file,
      line: t.line,
      column: t.column,
      args,
      resultVar,
      enclosing: enclosingFn ? enclosingFn.name : null,
    });
    calls.set(key, arr);
  }
}

function findResultBinding(tokens, callIdx) {
  // Walk left looking for: `const x = foo(` or `let x = foo(`
  for (let j = callIdx - 1; j >= Math.max(0, callIdx - 6); j--) {
    const t = tokens[j];
    if (!t) continue;
    if (t.value === '=' && tokens[j - 1]?.type === 'identifier') {
      const decl = tokens[j - 2];
      if (decl?.type === 'keyword' && (decl.value === 'const' || decl.value === 'let' || decl.value === 'var')) {
        return tokens[j - 1].value;
      }
      // Plain assignment without declaration
      return tokens[j - 1].value;
    }
    if (t.value === ';' || t.value === '{' || t.value === '}') break;
  }
  return null;
}

function extractArgs(tokens, openIdx) {
  if (tokens[openIdx]?.value !== '(') return [];
  const args = [];
  let depth = 1;
  let current = [];
  let i = openIdx + 1;
  while (i < tokens.length && depth > 0) {
    const t = tokens[i];
    if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
    if (t.value === ')' || t.value === ']' || t.value === '}') { depth--; if (depth === 0) break; }
    if (depth === 1 && t.value === ',') { args.push(current); current = []; }
    else current.push(t);
    i++;
  }
  if (current.length) args.push(current);
  return args;
}

// ─── Cascade checks ──────────────────────────────────────────────────────────

/**
 * Given a call-graph and a nullability map, find all callers who don't
 * null-check the result of a nullable function.
 *
 * @param {object} graph - { defs, calls }
 * @param {Map<name,{nullable,...}>} nullability
 * @returns {Array<finding>}
 */
function findNullDerefCascades(graph, nullability, parsedByFile) {
  const findings = [];

  for (const [name, info] of nullability.entries()) {
    if (!info.nullable) continue;
    const sites = graph.calls.get(name) || [];
    for (const site of sites) {
      if (!site.resultVar) continue;
      // Look up this call site's surrounding tokens to check for null-guarding
      const file = parsedByFile.get(site.file);
      if (!file) continue;
      const tokens = file.tokens;
      const callTokenIdx = findTokenByLineCol(tokens, site.line, site.column);
      if (callTokenIdx < 0) continue;

      if (!hasNullGuardAfter(tokens, callTokenIdx, site.resultVar, 20)) {
        findings.push({
          file: site.file,
          line: site.line,
          column: site.column,
          bugClass: 'integration',
          ruleId: 'integration/nullable-return',
          assumption: `${name}() always returns a value`,
          reality: `${name}() can return null — callers must check before dereferencing`,
          severity: 'high',
          suggestion: `Add: if (!${site.resultVar}) { /* handle */ } or use ${site.resultVar}?.prop`,
          code: `const ${site.resultVar} = ${name}(...)`,
        });
      }
    }
  }

  return findings;
}

function findTokenByLineCol(tokens, line, col) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.line === line && t.column === col) return i;
    if (t.line > line) return -1;
  }
  return -1;
}

/**
 * Check if `varName` is null-guarded somewhere within `window` tokens
 * after `callIdx`. Accepts many shapes:
 *   if (!varName) ...
 *   if (varName == null) ...
 *   if (varName === null) ...
 *   if (varName) { use varName }
 *   varName?.prop
 *   varName ?? fallback
 *   varName && varName.prop
 */
function hasNullGuardAfter(tokens, callIdx, varName, window) {
  const end = Math.min(tokens.length, callIdx + window);
  for (let i = callIdx; i < end; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier' || t.value !== varName) continue;
    const next = tokens[i + 1];
    const prev = tokens[i - 1];

    // Optional chaining: foo?.bar
    if (next?.value === '?.') return true;

    // Nullish coalescing: foo ?? x
    if (next?.value === '??') return true;

    // Logical AND chain: if (foo && foo.x) — we count any `&&` after
    if (next?.value === '&&') return true;

    // Inside an if condition: `if (varName` or `if (!varName` or `if (varName !=`
    if (prev?.value === '(' && tokens[i - 2]?.value === 'if') return true;
    if (prev?.value === '!' && tokens[i - 2]?.value === '(' && tokens[i - 3]?.value === 'if') return true;

    // Comparison to null/undefined
    if (['==', '===', '!=', '!=='].includes(next?.value) &&
        (tokens[i + 2]?.value === 'null' || tokens[i + 2]?.value === 'undefined')) {
      return true;
    }
  }
  return false;
}

/**
 * Given two call graphs (before/after), diff the function signatures and
 * return cascade findings where a caller no longer matches the new shape.
 */
function diffCallGraphs(before, after) {
  const findings = [];
  for (const [name, afterDefs] of after.defs.entries()) {
    const beforeDefs = before.defs.get(name);
    if (!beforeDefs) continue; // new function, no cascade
    const b = beforeDefs[0];
    const a = afterDefs[0];

    // Arity change
    if (a.arity !== b.arity) {
      const callers = after.calls.get(name) || [];
      for (const c of callers) {
        if (c.args.length !== a.arity) {
          findings.push({
            file: c.file,
            line: c.line,
            column: c.column,
            bugClass: 'integration',
            ruleId: 'integration/arity-mismatch',
            assumption: `${name}() takes ${c.args.length} arguments`,
            reality: `${name}() signature changed — now takes ${a.arity} arguments (was ${b.arity})`,
            severity: 'high',
            suggestion: `Update the call site to match the new signature`,
            code: `${name}(...${c.args.length} args...)`,
          });
        }
      }
    }

    // Async transition
    if (a.async !== b.async) {
      const callers = after.calls.get(name) || [];
      for (const c of callers) {
        findings.push({
          file: c.file,
          line: c.line,
          column: c.column,
          bugClass: 'integration',
          ruleId: 'integration/async-transition',
          assumption: `${name}() ${b.async ? 'was async' : 'was sync'}`,
          reality: `${name}() is now ${a.async ? 'async' : 'sync'} — caller needs to ${a.async ? 'await' : 'stop awaiting'}`,
          severity: 'high',
          suggestion: a.async ? `Add await: const x = await ${name}(...)` : `Remove await: const x = ${name}(...)`,
          code: `${name}(...)`,
        });
      }
    }
  }
  return findings;
}

module.exports = {
  buildCallGraph,
  findNullDerefCascades,
  diffCallGraphs,
  hasNullGuardAfter,
};

// ── Atomic self-description (batch-generated) ────────────────────
buildCallGraph.atomicProperties = {
  charge: 1, valence: 0, mass: 'heavy', spin: 'odd', phase: 'solid',
  reactivity: 'low', electronegativity: 0, group: 8, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
findNullDerefCascades.atomicProperties = {
  charge: 0, valence: 0, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 3, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
diffCallGraphs.atomicProperties = {
  charge: 1, valence: 0, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'low', electronegativity: 0, group: 3, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
hasNullGuardAfter.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'quality',
};
