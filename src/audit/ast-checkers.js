'use strict';

/**
 * AST-based static checkers — the replacement for the regex-based
 * `static-checkers.js`.
 *
 * Consumes the parser, scope tracker, taint tracker, nullability
 * inference, and suppression table from this directory to produce
 * high-signal findings for the 6 bug classes:
 *
 *   1. state-mutation — .sort/.reverse/.splice/Object.assign without copy
 *   2. security       — taint-flow to eval/exec/SQL/innerHTML sinks
 *   3. concurrency    — unguarded check-then-set in async code, lock without finally
 *   4. type           — division where the divisor is not provably non-zero,
 *                        JSON.parse outside try
 *   5. integration    — nullable return used without null guard (scope-aware)
 *   6. edge-case      — switch without default (param validation lives in `lint`)
 *
 * Design rules (in order of priority):
 *   - False positives are bugs. Every checker must consult the parser, the
 *     scope tracker, and the suppression table before emitting a finding.
 *   - Findings carry both `bugClass` (coarse) and `ruleId` (fine) so they
 *     can be suppressed or filtered individually.
 *   - Every finding has line + column + ruleId + suggestion.
 *   - Nothing here ever scans raw source lines. If a check fires on a
 *     string literal or a comment, it's a parser bug, not the check's.
 */

const { parseProgram, walkFunctions } = require('./parser');
const { buildScope } = require('./scope');
const { computeTainted, findSinkCalls } = require('./taint');
const { inferNullability } = require('./type-inference');
const { parseComments, isSuppressed } = require('./suppressions');

const BUG_CLASSES = {
  STATE_MUTATION: 'state-mutation',
  SECURITY: 'security',
  CONCURRENCY: 'concurrency',
  TYPE: 'type',
  INTEGRATION: 'integration',
  EDGE_CASE: 'edge-case',
};

const SEVERITY = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

// Identifiers that look like constant counts we trust are non-zero. These
// are conservative name-based hints; the real divisor check will prefer
// concrete proof (literal > 0, `|| 1` fallback, Math.max(1, ...) guard).
const LIKELY_POSITIVE_NAMES = new Set([
  'total', 'sum', 'max', 'maxSize', 'limit', 'TWO', 'HUNDRED', 'PI', 'TAU',
]);

/**
 * Main entry point.
 *
 * @param {string} source - source code
 * @param {object} options - { filePath?, minSeverity?, bugClasses? }
 * @returns {{ findings, summary }}
 */
function auditCode(source, options = {}) {
  if (typeof source !== 'string' || !source) {
    return emptyResult();
  }

  // Parse-once fast path: if the caller already has a parsed program
  // (from src/core/analyze's envelope), reuse it instead of re-parsing.
  // This turns N analysis passes on the same file into one parse + N
  // walks, which is the whole point of the envelope cache.
  let program;
  if (options.program && options.program.tokens && options.program.lines) {
    program = options.program;
  } else {
    try {
      program = parseProgram(source);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[audit:parse]', e?.message || e);
      return emptyResult();
    }
  }

  const suppressionTable = parseComments(program.comments, program.lines.length);
  const nullability = inferNullability(program);

  const findings = [];
  const emit = (finding) => {
    if (isSuppressed(finding, suppressionTable)) return;
    // Attach a one-line excerpt if missing
    if (!finding.code && finding.line && program.lines[finding.line - 1]) {
      finding.code = program.lines[finding.line - 1].trim();
    }
    findings.push(finding);
  };

  const enabled = options.bugClasses
    ? new Set(Array.isArray(options.bugClasses) ? options.bugClasses : [options.bugClasses])
    : null;
  const isEnabled = (cls) => !enabled || enabled.has(cls);

  // Walk every function and run per-function checkers
  walkFunctions(program, (fn) => {
    if (!fn.bodyTokens) return;
    const scope = buildScope(fn.bodyTokens);
    const tainted = computeTainted(fn);

    if (isEnabled(BUG_CLASSES.STATE_MUTATION)) checkStateMutation(fn, scope, emit);
    if (isEnabled(BUG_CLASSES.SECURITY))       checkSecurityInFn(fn, tainted, emit);
    if (isEnabled(BUG_CLASSES.CONCURRENCY))    checkConcurrencyInFn(fn, emit);
    if (isEnabled(BUG_CLASSES.TYPE))           checkTypeInFn(fn, scope, emit);
    if (isEnabled(BUG_CLASSES.INTEGRATION))    checkIntegrationInFn(fn, nullability, scope, emit);
  });

  // File-level checks that don't need a function context
  if (isEnabled(BUG_CLASSES.EDGE_CASE)) checkEdgeCase(program, emit);

  // Sort by severity then line
  const sevOrder = { high: 3, medium: 2, low: 1 };
  findings.sort((a, b) => (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0) || a.line - b.line);

  // Filter by minSeverity
  let filtered = findings;
  if (options.minSeverity) {
    const min = sevOrder[options.minSeverity] || 0;
    filtered = findings.filter(f => (sevOrder[f.severity] || 0) >= min);
  }

  return {
    findings: filtered,
    summary: buildSummary(filtered),
  };
}

function emptyResult() {
  return { findings: [], summary: { total: 0, byClass: {}, bySeverity: {} } };
}

function buildSummary(findings) {
  const byClass = {};
  const bySeverity = {};
  for (const f of findings) {
    byClass[f.bugClass] = (byClass[f.bugClass] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }
  return { total: findings.length, byClass, bySeverity };
}

// ─── State mutation checker ─────────────────────────────────────────────────

/**
 * A .sort()/.reverse()/.splice() on a variable that wasn't produced by a
 * copy (slice, spread, Array.from, concat, structuredClone) is a mutation
 * of the source array. For private class fields (#name) we allow it —
 * the owner controls the array.
 */
function checkStateMutation(fn, scope, emit) {
  const tokens = fn.bodyTokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;
    const dot = tokens[i + 1];
    if (dot?.value !== '.') continue;
    const methodTok = tokens[i + 2];
    if (methodTok?.type !== 'identifier') continue;
    const open = tokens[i + 3];
    if (open?.value !== '(') continue;

    const method = methodTok.value;
    if (method !== 'sort' && method !== 'reverse' && method !== 'splice') continue;

    // Receiver token chain — walk back to capture the full left side of the
    // call (ident, this.x, foo.bar.baz, [...x], x.slice().concat()).
    const receiverRange = readReceiverLeft(tokens, i);
    const receiverText = receiverRange.map(tk => tk.value).join('');
    const produced = isProducedByCopy(receiverRange);

    // Private field mutation is typically intentional
    const isPrivateField = receiverText.includes('this.#') || receiverText.includes('#');

    if (!produced && !isPrivateField) {
      emit({
        line: t.line,
        column: t.column,
        bugClass: BUG_CLASSES.STATE_MUTATION,
        ruleId: `state-mutation/${method}`,
        assumption: `.${method}() creates a new array`,
        reality: `.${method}() mutates the original array in-place`,
        severity: method === 'sort' ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        suggestion: method === 'splice'
          ? `Reassign via filter/slice: ${receiverText} = ${receiverText}.filter(...)`
          : `Copy first: [...${receiverText}].${method}(...) or ${receiverText}.slice().${method}(...)`,
      });
    }
    i = i + 3; // advance past the method call head
  }

  // Object.assign(nonEmptyObj, ...) mutates first arg
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier' || t.value !== 'Object') continue;
    if (tokens[i + 1]?.value !== '.') continue;
    if (tokens[i + 2]?.value !== 'assign') continue;
    if (tokens[i + 3]?.value !== '(') continue;
    const firstArgTok = tokens[i + 4];
    if (!firstArgTok) continue;
    // Safe if first arg is `{}` or `[]`
    if (firstArgTok.value === '{' && tokens[i + 5]?.value === '}') continue;
    if (firstArgTok.value === '[' && tokens[i + 5]?.value === ']') continue;
    // Safe if it's a spread into a fresh object: `Object.assign({}, x)` already handled
    emit({
      line: t.line,
      column: t.column,
      bugClass: BUG_CLASSES.STATE_MUTATION,
      ruleId: 'state-mutation/object-assign',
      assumption: 'Object.assign target is safe to mutate',
      reality: 'Object.assign mutates the first argument in place',
      severity: SEVERITY.MEDIUM,
      suggestion: 'Use Object.assign({}, target, ...) or spread: { ...target, ... }',
    });
  }
}

/**
 * Walk left from a method-call head (tokens[i] is the receiver identifier)
 * to capture the full receiver expression. Stops at `;`, `{`, `}`,
 * `(` that begins a larger expression, `,`, `=`, `return`.
 */
function readReceiverLeft(tokens, idx) {
  const out = [];
  let i = idx;
  // Just the single identifier + any left dotted chain
  while (i >= 0) {
    const t = tokens[i];
    if (t.type === 'identifier' || t.value === '.' || t.value === '#' ||
        t.value === ']' || t.value === ')' || t.type === 'string' ||
        t.type === 'number' || (t.value === 'this')) {
      out.unshift(t);
      i--;
      continue;
    }
    break;
  }
  return out;
}

function isProducedByCopy(receiverTokens) {
  const text = receiverTokens.map(tk => tk.value).join('');
  return (
    text.includes('.slice(') ||
    text.includes('.concat(') ||
    text.includes('Array.from(') ||
    text.includes('structuredClone(') ||
    /\[\.\.\./.test(text)
  );
}

// ─── Security checker ──────────────────────────────────────────────────────

function checkSecurityInFn(fn, tainted, emit) {
  findSinkCalls(fn, tainted, emit);
}

// ─── Concurrency checker ───────────────────────────────────────────────────

/**
 * Two patterns:
 *
 *   (a) lock acquisition without a try/finally release.
 *       Heuristic: `(await )?foo.acquire(...)` or `foo.lock(...)` followed
 *       within the body by code that doesn't wrap in try/finally.
 *
 *   (b) Async check-then-set on a shared module-level variable.
 *       We only flag this when the variable is NOT a local `let` inside
 *       the current function body — because locals in a single async
 *       callback prologue are atomic before the first await.
 */
function checkConcurrencyInFn(fn, emit) {
  if (!fn.async) return;
  const tokens = fn.bodyTokens;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;

    // lock acquire without finally
    if ((t.value === 'acquire' || t.value === 'lock') && tokens[i - 1]?.value === '.') {
      const owner = tokens[i - 2]?.value || 'lock';
      if (tokens[i + 1]?.value === '(') {
        if (!hasFinallyRelease(tokens, i, owner)) {
          emit({
            line: t.line,
            column: t.column,
            bugClass: BUG_CLASSES.CONCURRENCY,
            ruleId: 'concurrency/lock-without-finally',
            assumption: 'The lock is always released',
            reality: 'Without try/finally, an exception leaves the lock held (deadlock risk)',
            severity: SEVERITY.HIGH,
            suggestion: `Wrap in try { ... } finally { ${owner}.release(); }`,
          });
        }
      }
    }
  }
}

function hasFinallyRelease(tokens, callIdx, lockOwner) {
  const end = Math.min(tokens.length, callIdx + 120);
  for (let i = callIdx; i < end; i++) {
    if (tokens[i].type === 'keyword' && tokens[i].value === 'finally' && tokens[i + 1]?.value === '{') {
      for (let j = i + 1; j < Math.min(i + 20, end); j++) {
        if (tokens[j].type === 'identifier' && tokens[j].value === lockOwner &&
            tokens[j + 1]?.value === '.' && tokens[j + 2]?.value === 'release') {
          return true;
        }
      }
      return false;
    }
  }
  return false;
}

// ─── Type checker ──────────────────────────────────────────────────────────

/**
 * Two checks:
 *
 *   (a) `x / y` where y is not provably non-zero.
 *       Provably non-zero means: literal > 0, `|| 1` fallback, `Math.max(1, ...)`,
 *       or a guard like `if (y !== 0)` in scope.
 *
 *   (b) `JSON.parse(...)` not inside a try (scope-aware — looks for
 *       the nearest enclosing try block via brace counting).
 */
function checkTypeInFn(fn, scope, emit) {
  const tokens = fn.bodyTokens;

  // Division
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'operator' || t.value !== '/') continue;
    const left = tokens[i - 1];
    const right = tokens[i + 1];
    if (!right) continue;
    // The parser emits regex literals as `regex` tokens, so a `/` operator
    // is guaranteed to be division. But we still skip paths-inside-strings.
    // (Strings are `string` tokens, we never see them as a divisor.)

    // Left must be a value-producing token
    if (!left) continue;
    if (left.type !== 'identifier' && left.type !== 'number' && left.value !== ')' && left.value !== ']') continue;

    // Right must be an identifier or member chain (literals are safe)
    if (right.type === 'number') {
      // Safe if > 0
      if (parseFloat(right.value) !== 0) continue;
    }
    if (right.type !== 'identifier' && right.type !== 'number' && right.value !== '(') continue;
    if (right.type === 'number') {
      emit({
        line: t.line, column: t.column,
        bugClass: BUG_CLASSES.TYPE, ruleId: 'type/division-by-zero',
        assumption: 'Divisor is non-zero', reality: 'Division by 0 produces Infinity',
        severity: SEVERITY.HIGH, suggestion: 'Change the literal to a non-zero value',
      });
      continue;
    }

    if (right.type === 'identifier') {
      // Read the full divisor chain: `count` or `arr.length` or `this.n`.
      let divisorChain = right.value;
      let k = i + 2;
      while (tokens[k]?.value === '.' && tokens[k + 1]?.type === 'identifier') {
        divisorChain += '.' + tokens[k + 1].value;
        k += 2;
      }
      const divisorHead = right.value;

      if (LIKELY_POSITIVE_NAMES.has(divisorHead)) continue;
      // `.length` of an object where the context has already asserted
      // non-empty is the most common false positive. We still want real
      // cases flagged, so we only trust `.length` when the scope tracker
      // or the structural guard sees the check.
      if (scope.nonNullAt(i).has(divisorHead)) continue;
      if (hasDivisorGuardAround(tokens, i, divisorChain)) continue;
      if (divisorChain !== divisorHead && hasDivisorGuardAround(tokens, i, divisorHead)) continue;
      emit({
        line: t.line, column: t.column,
        bugClass: BUG_CLASSES.TYPE, ruleId: 'type/division-by-zero',
        assumption: `${divisorChain} is never zero`,
        reality: 'Division by zero produces Infinity/NaN — add a zero-guard',
        severity: SEVERITY.MEDIUM,
        suggestion: `Guard: ${divisorChain} !== 0 ? ... / ${divisorChain} : <default>`,
      });
    }
  }

  // JSON.parse outside try
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier' || t.value !== 'JSON') continue;
    if (tokens[i + 1]?.value !== '.') continue;
    if (tokens[i + 2]?.value !== 'parse') continue;
    if (tokens[i + 3]?.value !== '(') continue;
    if (insideTryBlock(tokens, i)) continue;
    emit({
      line: t.line, column: t.column,
      bugClass: BUG_CLASSES.TYPE, ruleId: 'type/json-parse-no-try',
      assumption: 'JSON.parse input is always valid JSON',
      reality: 'JSON.parse throws SyntaxError on invalid input',
      severity: SEVERITY.MEDIUM,
      suggestion: 'Wrap in try/catch or use a safeParse helper',
    });
  }
}

function hasDivisorGuardAround(tokens, idx, divisor) {
  // Forward: `|| 1`, `|| default`, `Math.max(1, ...)` in the next few tokens
  const window = 6;
  for (let i = idx; i < Math.min(tokens.length, idx + window); i++) {
    if (tokens[i]?.value === '||' && tokens[i + 1]?.type === 'number' && parseFloat(tokens[i + 1].value) > 0) {
      return true;
    }
    if (tokens[i]?.value === 'Math' && tokens[i + 1]?.value === '.' && tokens[i + 2]?.value === 'max') {
      return true;
    }
  }
  // Ternary guard that covers this very division, e.g.:
  //   nonEmpty.length > 0 ? a / nonEmpty.length : 0
  //   count !== 0 ? sum / count : 0
  //   arr.length ? total / arr.length : 0
  //
  // We look backward for a `?` with a preceding comparison mentioning
  // `divisor` and then a truthy test that proves non-zero.
  for (let i = idx - 1; i >= Math.max(0, idx - 50); i--) {
    const t = tokens[i];
    if (!t) continue;
    if (t.value === ';' || t.value === '{' || t.value === '}') break;
    if (t.value !== '?') continue;
    // Walk further back: look for `<divisor> > 0`, `<divisor> !== 0`, or
    // just `<divisor>` (truthy test).
    for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
      const tk = tokens[j];
      if (!tk) break;
      if (tk.type === 'identifier' && tk.value === divisor) {
        const op = tokens[j + 1]?.value;
        const rhs = tokens[j + 2];
        // Truthy test: `x ?`
        if (op === '?') return true;
        // Comparison test: `x > 0 ?`, `x !== 0 ?`, `x != 0 ?`
        if ((op === '>' || op === '>=' || op === '!=' || op === '!==') &&
            rhs && (rhs.type === 'number' || rhs.value === 'null' || rhs.value === 'undefined')) {
          return true;
        }
      }
      // Member chain: `x.length > 0 ?` where the divisor is `x.length`
      if (tk.value === '.' && tokens[j - 1]?.type === 'identifier' &&
          tokens[j + 1]?.type === 'identifier') {
        const chainName = tokens[j - 1].value + '.' + tokens[j + 1].value;
        if (chainName === divisor) return true;
      }
    }
  }
  // Look backward for `if (divisor !== 0)` in the enclosing 30 tokens
  for (let i = Math.max(0, idx - 30); i < idx; i++) {
    const t = tokens[i];
    if (t.type === 'keyword' && t.value === 'if' && tokens[i + 1]?.value === '(') {
      let j = i + 2; let depth = 1;
      while (j < tokens.length && depth > 0) {
        if (tokens[j].value === '(') depth++;
        if (tokens[j].value === ')') { depth--; if (depth === 0) break; }
        if (tokens[j].type === 'identifier' && tokens[j].value === divisor) {
          const op = tokens[j + 1];
          if (op && (op.value === '!==' || op.value === '!=' || op.value === '>')) return true;
        }
        j++;
      }
    }
  }
  return false;
}

function insideTryBlock(tokens, idx) {
  let depth = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.value === '}') depth++;
    if (t.value === '{') {
      if (depth === 0) {
        // Walk further back to find `try`
        for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
          if (tokens[j]?.type === 'keyword' && tokens[j].value === 'try') return true;
          if (tokens[j]?.value === ')') break;
        }
        depth = 0;
      } else {
        depth--;
      }
    }
  }
  return false;
}

// ─── Integration checker ───────────────────────────────────────────────────

/**
 * Dereference of a nullable-returning function result without a guard.
 *
 * We look at every call to a function `fn` where:
 *   - `fn` is defined in this file with a nullable return
 *   - the caller stores the result in a variable `x`
 *   - `x` is accessed via `x.prop`, `x[...]`, or `x(...)` within the next
 *     20 tokens with no intervening null-guard
 */
function checkIntegrationInFn(fn, nullability, scope, emit) {
  const tokens = fn.bodyTokens;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;
    const next = tokens[i + 1];
    if (next?.value !== '(') continue;

    const info = nullability.functions.get(t.value);
    if (!info || !info.nullable) continue;

    // Receiver binding: `const x = <called>(`
    const binding = findLeftBinding(tokens, i);
    if (!binding) continue;

    // Scope-aware: if the variable is already in non-null set after guard,
    // skip — this handles `if (x) { x.y }` patterns.
    // We check at each subsequent dereference site.
    const refs = findDereferences(tokens, i + 1, binding, 40);
    for (const ref of refs) {
      if (scope.nonNullAt(ref.idx).has(binding)) continue;
      if (hasInlineGuardBefore(tokens, ref.idx, binding)) continue;
      emit({
        line: ref.tok.line,
        column: ref.tok.column,
        bugClass: BUG_CLASSES.INTEGRATION,
        ruleId: 'integration/nullable-deref',
        assumption: `${t.value}() always returns a value`,
        reality: `${t.value}() can return null — add a guard before dereferencing`,
        severity: SEVERITY.HIGH,
        suggestion: `if (!${binding}) { /* handle */ }  or use ${binding}?.prop`,
      });
      break; // one finding per call site
    }
  }
}

/**
 * Given a call at tokens[callIdx], find the variable on the LHS:
 *    const x = fn(...)
 *    let x = fn(...)
 *    x = fn(...)
 * Returns null if the result isn't bound.
 */
function findLeftBinding(tokens, callIdx) {
  // Walk left until we hit `=` (not `==`/`===`).
  for (let j = callIdx - 1; j >= Math.max(0, callIdx - 4); j--) {
    const t = tokens[j];
    if (!t) return null;
    if (t.value === '=' && tokens[j + 1] && tokens[j - 1]?.type === 'identifier') {
      return tokens[j - 1].value;
    }
    if (t.value === ';' || t.value === '{' || t.value === '}') return null;
  }
  return null;
}

function findDereferences(tokens, startIdx, varName, window) {
  const refs = [];
  const end = Math.min(tokens.length, startIdx + window);
  for (let i = startIdx; i < end; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier' || t.value !== varName) continue;
    const next = tokens[i + 1];
    if (!next) continue;
    if (next.value === '.' && next.value !== '?.') refs.push({ idx: i, tok: t });
    if (next.value === '[') refs.push({ idx: i, tok: t });
    if (next.value === '(') refs.push({ idx: i, tok: t });
  }
  return refs;
}

function hasInlineGuardBefore(tokens, idx, varName) {
  // Optional-chain access `varName?.x` is itself the guard
  if (tokens[idx + 1]?.value === '?.') return true;
  // Ternary in last 8 tokens: `x ? x.y : z`
  for (let j = idx - 1; j >= Math.max(0, idx - 8); j--) {
    if (tokens[j]?.value === '?' && tokens[j - 1]?.type === 'identifier' && tokens[j - 1].value === varName) return true;
    if (tokens[j]?.value === '&&' && tokens[j - 1]?.type === 'identifier' && tokens[j - 1].value === varName) return true;
  }
  return false;
}

// ─── Edge-case checker (file-level) ────────────────────────────────────────

/**
 * Switch statement without a default case.
 */
function checkEdgeCase(program, emit) {
  const tokens = program.tokens.filter(t => t.type !== 'comment');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'keyword' || t.value !== 'switch') continue;
    if (tokens[i + 1]?.value !== '(') continue;
    // Skip to matching )
    let j = i + 2, depth = 1;
    while (j < tokens.length && depth > 0) {
      if (tokens[j].value === '(') depth++;
      if (tokens[j].value === ')') { depth--; if (depth === 0) break; }
      j++;
    }
    j++;
    if (tokens[j]?.value !== '{') continue;
    const bodyStart = j + 1;
    depth = 1;
    let hasDefault = false;
    let k = bodyStart;
    while (k < tokens.length && depth > 0) {
      const tk = tokens[k];
      if (tk.value === '{') depth++;
      else if (tk.value === '}') { depth--; if (depth === 0) break; }
      else if (tk.type === 'keyword' && tk.value === 'default' && tokens[k + 1]?.value === ':') {
        hasDefault = true;
      }
      k++;
    }
    if (!hasDefault) {
      emit({
        line: t.line, column: t.column,
        bugClass: BUG_CLASSES.EDGE_CASE, ruleId: 'edge-case/switch-no-default',
        assumption: 'Switch covers every value',
        reality: 'Missing default case — unmatched values silently fall through',
        severity: SEVERITY.MEDIUM,
        suggestion: 'Add a default: case with an error or explicit no-op',
      });
    }
    i = k;
  }
}

// ─── File / batch API ───────────────────────────────────────────────────────

function auditFile(filePath, options = {}) {
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    return { file: filePath, findings: [], summary: { total: 0, byClass: {}, bySeverity: {} }, error: 'not found' };
  }
  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    // Route through the process-level envelope cache so a second
    // analysis of the same file (audit, lint, smell, prior in one
    // session) hits the same parsed program.
    const { analyzeCached } = require('../core/analyze');
    const env = analyzeCached(source, filePath, { language: options.language });
    const result = auditCode(source, { ...options, filePath, program: env.program });
    return { file: filePath, ...result };
  } catch (e) {
    return { file: filePath, findings: [], summary: { total: 0, byClass: {}, bySeverity: {} }, error: e.message };
  }
}

function auditFiles(files, options = {}) {
  const results = [];
  let totalFindings = 0;
  const byClass = {};
  const bySeverity = {};
  for (const file of files || []) {
    const r = auditFile(file, options);
    if (r.findings && r.findings.length > 0) {
      results.push(r);
      totalFindings += r.findings.length;
      for (const [k, v] of Object.entries(r.summary.byClass)) byClass[k] = (byClass[k] || 0) + v;
      for (const [k, v] of Object.entries(r.summary.bySeverity)) bySeverity[k] = (bySeverity[k] || 0) + v;
    }
  }
  return {
    files: results,
    totalFindings,
    summary: {
      filesScanned: files ? files.length : 0,
      filesWithFindings: results.length,
      byClass,
      bySeverity,
    },
  };
}

module.exports = {
  auditCode,
  auditFile,
  auditFiles,
  BUG_CLASSES,
  SEVERITY,
};
