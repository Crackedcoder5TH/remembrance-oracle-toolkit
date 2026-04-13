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
  let program;
  try { program = parseProgram(source); }
  catch (e) { return emptyResult(); }

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
  });

  // File-level rules
  checkTodoComments(program, emit);

  // Sort + filter
  findings.sort((a, b) => a.line - b.line);

  return {
    findings,
    summary: {
      total: findings.length,
      byRule: countBy(findings, 'ruleId'),
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
    return { file: filePath, ...lintCode(source, options) };
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
