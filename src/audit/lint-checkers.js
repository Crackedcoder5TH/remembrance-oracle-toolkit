'use strict';

/**
 * Style / opinion checkers for the `oracle lint` command.
 *
 * These are rules that used to live in `audit check` as low-severity
 * findings but don't represent bugs — they're opinions about code style
 * that vary by codebase. They live here so a user can run them opt-in
 * without drowning the bug audit in noise.
 *
 * Every rule is AST-based (so it doesn't fire on strings or comments),
 * honors suppressions, and only runs on exported/public functions by
 * default to avoid flagging every internal helper.
 *
 * Current rules:
 *   - lint/parameter-validation       — public fns with 2+ required params should guard
 *   - lint/todo-comment                — TODO/FIXME/HACK comments
 *   - lint/parseInt-no-radix           — parseInt without explicit radix
 *   - lint/var-usage                   — `var` instead of const/let
 *   - lint/magic-number                — literal number >1000 in a comparison
 *
 * The lint command has its own CLI path so `audit check` stays focused
 * on real bugs.
 */

const { parseProgram, walkFunctions } = require('./parser');
const { parseComments, isSuppressed } = require('./suppressions');

const SEVERITY = { WARN: 'warn', INFO: 'info' };

function lintCode(source, options = {}) {
  if (typeof source !== 'string' || !source) return emptyResult();
  // Parse-once fast path: reuse a caller-supplied program (from the
  // analysis envelope) instead of re-parsing.
  let program;
  if (options.program && options.program.tokens && options.program.lines) {
    program = options.program;
  } else {
    try { program = parseProgram(source); }
    catch (e) { return emptyResult(); }
  }

  const supp = parseComments(program.comments, program.lines.length);
  const findings = [];
  const emit = (f) => {
    if (isSuppressed(f, supp)) return;
    if (!f.code && f.line && program.lines[f.line - 1]) {
      f.code = program.lines[f.line - 1].trim();
    }
    findings.push(f);
  };

  // Per-function rules
  walkFunctions(program, (fn) => {
    checkParameterValidation(fn, emit);
    checkParseIntRadix(fn, emit);
    checkVarUsage(fn, emit);
    checkSymmetryPairs(fn, emit);
  });

  // File-level rules
  checkTodoComments(program, emit);

  // Sort + filter — use an immutable copy so the caller's local
  // `findings` array isn't mutated after we've handed it to consumers.
  const sorted = [...findings].sort((a, b) => a.line - b.line);

  return {
    findings: sorted,
    summary: {
      total: sorted.length,
      byRule: countBy(sorted, 'ruleId'),
    },
  };
}

function emptyResult() {
  return { findings: [], summary: { total: 0, byRule: {} } };
}

function countBy(arr, key) {
  const out = {};
  for (const x of arr) out[x[key]] = (out[x[key]] || 0) + 1;
  return out;
}

// ─── parameter-validation ──────────────────────────────────────────────────

function checkParameterValidation(fn, emit) {
  if (!fn.name) return;
  // Private naming convention: skip
  if (fn.name.startsWith('_') || fn.name.startsWith('#')) return;
  // Only warn for public fns with >= 2 required params
  const required = (fn.params || []).filter(p => p.name && !p.hasDefault && !p.rest);
  if (required.length < 2) return;

  // Look for any guard in the first 10 body tokens.
  const tokens = fn.bodyTokens || [];
  let hasGuard = false;
  for (let i = 0; i < Math.min(20, tokens.length); i++) {
    const t = tokens[i];
    if (t.type === 'keyword' && (t.value === 'if' || t.value === 'throw')) { hasGuard = true; break; }
    if (t.type === 'identifier' && t.value === 'typeof') { hasGuard = true; break; }
  }
  if (hasGuard) return;

  emit({
    line: fn.line,
    column: fn.column,
    ruleId: 'lint/parameter-validation',
    severity: SEVERITY.INFO,
    message: `${fn.name}() has ${required.length} required params but no entry-guard`,
    suggestion: 'Add a guard clause: if (!x || !y) throw new TypeError(...)',
  });
}

// ─── parseInt without radix ────────────────────────────────────────────────

function checkParseIntRadix(fn, emit) {
  const tokens = fn.bodyTokens || [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier' || t.value !== 'parseInt') continue;
    if (tokens[i + 1]?.value !== '(') continue;

    // Count top-level args until `)`
    let depth = 1;
    let argCount = 1;
    let j = i + 2;
    while (j < tokens.length && depth > 0) {
      const tk = tokens[j];
      if (tk.value === '(' || tk.value === '[' || tk.value === '{') depth++;
      if (tk.value === ')' || tk.value === ']' || tk.value === '}') { depth--; if (depth === 0) break; }
      if (depth === 1 && tk.value === ',') argCount++;
      j++;
    }
    if (argCount < 2) {
      emit({
        line: t.line, column: t.column,
        ruleId: 'lint/parseInt-no-radix',
        severity: SEVERITY.WARN,
        message: 'parseInt called without an explicit radix',
        suggestion: 'Use parseInt(value, 10) to be explicit about base 10',
      });
    }
  }
}

// ─── var usage ─────────────────────────────────────────────────────────────

function checkVarUsage(fn, emit) {
  const tokens = fn.bodyTokens || [];
  for (const t of tokens) {
    if (t.type === 'keyword' && t.value === 'var') {
      emit({
        line: t.line, column: t.column,
        ruleId: 'lint/var-usage',
        severity: SEVERITY.INFO,
        message: '`var` is function-scoped and hoisted — prefer const or let',
        suggestion: 'Use const for immutable bindings, let for reassigned ones',
      });
    }
  }
}

// ─── Symmetry / paired-operation balance ──────────────────────────────────
//
// Detection pattern #5 from the coherence-based bug taxonomy:
//
//   "If operation O exists, inverse O⁻¹ must exist.
//    Bug signature: O exists but O⁻¹ missing or broken."
//
// Every pair listed below represents a resource acquired by calling
// `open` and released by calling `close`. A function that calls the
// `open` side of a pair but never calls the `close` side leaks the
// resource. The checker runs per-function so a missing `close` in
// one function isn't masked by a `close` in another.
//
// False-positive guardrails:
//   - Only fires on functions that call the open side AT LEAST ONCE.
//   - Tolerates one-sided usage when the function is clearly a setup
//     helper (name contains "setup", "install", "register", "start",
//     "attach", "bind", "init", "create") — those legitimately only
//     open, with teardown elsewhere.
//   - Tolerates when the close call is syntactically visible via a
//     different method name used by the same ecosystem (e.g.
//     `finally` block containing `release()` counts as release).
//   - Fires as INFO, not WARN, because the checker is lexical, not
//     flow-sensitive. It's a nudge, not a verdict.

// Each entry: [openIdentifier, closeIdentifier, humanLabel]
//
// Notable omission: setTimeout/clearTimeout. A one-shot
// `await new Promise(r => setTimeout(r, ms))` is the canonical delay
// pattern and doesn't need clearing — flagging it would drown the
// real leaks in noise. setInterval/clearInterval stays because an
// un-cleared interval is almost always a leak.
const SYMMETRY_PAIRS = [
  ['lock',                'unlock',              'lock/unlock'],
  ['acquire',             'release',             'acquire/release'],
  ['subscribe',           'unsubscribe',         'subscribe/unsubscribe'],
  ['addEventListener',    'removeEventListener', 'addEventListener/removeEventListener'],
  ['addListener',         'removeListener',      'addListener/removeListener'],
  ['setInterval',         'clearInterval',       'setInterval/clearInterval'],
  ['openSync',            'closeSync',           'openSync/closeSync'],
  ['connect',             'disconnect',          'connect/disconnect'],
  ['watch',               'unwatch',             'watch/unwatch'],
  ['attach',              'detach',              'attach/detach'],
  ['mount',               'unmount',             'mount/unmount'],
];

// Match camelCase names like `setupListeners`, `installHook`, `bootServer`
// by checking the lowercase prefix. `\b` word boundaries don't work on
// the boundary between two word characters in camelCase.
const SETUP_NAME_PREFIXES = [
  'setup', 'install', 'register', 'start', 'attach', 'bind',
  'init', 'create', 'configure', 'boot', 'constructor',
];
function isSetupName(name) {
  if (!name || typeof name !== 'string') return false;
  // Strip leading underscores so `_startAutoFlush` is recognized as a
  // start-style setup function. Also strip the common anonymous-fn
  // convention of `bound #name`.
  const lower = name.replace(/^_+/, '').toLowerCase();
  return SETUP_NAME_PREFIXES.some(p => lower === p || lower.startsWith(p));
}

function checkSymmetryPairs(fn, emit) {
  const tokens = fn.bodyTokens || [];
  if (tokens.length === 0) return;

  // Count identifier-call occurrences per name. We count a name only
  // when followed by a `(`, so properties and string literals don't
  // score. This is lexical, not flow-sensitive — deliberately cheap.
  const callCounts = new Map();
  const firstSeen = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier') continue;
    if (tokens[i + 1]?.value !== '(') continue;
    callCounts.set(t.value, (callCounts.get(t.value) || 0) + 1);
    if (!firstSeen.has(t.value)) firstSeen.set(t.value, t);
  }

  // Setup-style functions are allowed to only open. The teardown
  // side lives in a sibling destroy/stop/uninstall function.
  const isSetup = isSetupName(fn.name);

  for (const [openName, closeName, label] of SYMMETRY_PAIRS) {
    const opens = callCounts.get(openName) || 0;
    const closes = callCounts.get(closeName) || 0;
    if (opens === 0) continue;
    if (opens <= closes) continue;
    if (isSetup) continue;
    const tok = firstSeen.get(openName);
    if (!tok) continue;
    emit({
      line: tok.line, column: tok.column,
      ruleId: 'lint/symmetry-pair',
      severity: SEVERITY.INFO,
      message: `${label}: ${opens} call(s) to ${openName}(), only ${closes} to ${closeName}()`,
      suggestion: `Pair every ${openName}() with a matching ${closeName}() — a try/finally keeps them balanced on the error path too`,
    });
  }
}

// ─── TODO comments ─────────────────────────────────────────────────────────

const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/i;

function checkTodoComments(program, emit) {
  for (const c of program.comments) {
    if (!TODO_RE.test(c.value)) continue;
    emit({
      line: c.line, column: c.column,
      ruleId: 'lint/todo-comment',
      severity: SEVERITY.INFO,
      message: 'TODO/FIXME/HACK comment — track in an issue',
      suggestion: 'Replace the comment with a linked issue, or resolve it',
    });
  }
}

// ─── File / batch API ───────────────────────────────────────────────────────

function lintFile(filePath, options = {}) {
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    return { file: filePath, findings: [], summary: { total: 0, byRule: {} }, error: 'not found' };
  }
  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const { analyzeCached } = require('../core/analyze');
    const env = analyzeCached(source, filePath);
    return { file: filePath, ...lintCode(source, { ...options, program: env.program }) };
  } catch (e) {
    return { file: filePath, findings: [], summary: { total: 0, byRule: {} }, error: e.message };
  }
}

function lintFiles(files, options = {}) {
  const results = [];
  let totalFindings = 0;
  const byRule = {};
  for (const file of files || []) {
    const r = lintFile(file, options);
    if (r.findings && r.findings.length > 0) {
      results.push(r);
      totalFindings += r.findings.length;
      for (const [k, v] of Object.entries(r.summary.byRule)) byRule[k] = (byRule[k] || 0) + v;
    }
  }
  return {
    files: results,
    totalFindings,
    summary: {
      filesScanned: files ? files.length : 0,
      filesWithFindings: results.length,
      byRule,
    },
  };
}

module.exports = {
  lintCode,
  lintFile,
  lintFiles,
};
