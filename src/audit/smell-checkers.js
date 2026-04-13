'use strict';

/**
 * Architectural smell detectors — the third category alongside bugs
 * (`audit`) and style (`lint`). Smells are structural: they're not
 * wrong, but they hint at future maintainability problems.
 *
 * Current detectors:
 *
 *   smell/long-function         function body > threshold lines
 *   smell/deep-nesting          block nesting depth > threshold
 *   smell/too-many-params       arity > threshold
 *   smell/god-file              file has > threshold exported symbols
 *   smell/feature-envy          method touches another object > N times
 *                               more than its own
 *
 * Thresholds live in a single object so callers can override them
 * via `oracle smell --threshold long-function=120`.
 */

const fs = require('fs');
const { parseProgram, walkFunctions } = require('./parser');
const { parseComments, isSuppressed } = require('./suppressions');

const DEFAULT_THRESHOLDS = {
  longFunctionLines: 80,
  deepNestingDepth: 5,
  tooManyParams: 5,
  godFileExports: 30,
  featureEnvyRatio: 3.0,
};

function smellCode(source, options = {}) {
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

  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const supp = parseComments(program.comments, program.lines.length);
  const findings = [];
  const emit = (f) => {
    if (isSuppressed(f, supp)) return;
    if (!f.code && f.line && program.lines[f.line - 1]) {
      f.code = program.lines[f.line - 1].trim();
    }
    findings.push(f);
  };

  walkFunctions(program, (fn) => {
    checkLongFunction(fn, thresholds, emit);
    checkDeepNesting(fn, thresholds, emit);
    checkTooManyParams(fn, thresholds, emit);
    checkFeatureEnvy(fn, thresholds, emit);
  });

  checkGodFile(program, thresholds, emit);

  findings.sort((a, b) => a.line - b.line);

  return {
    findings,
    summary: {
      total: findings.length,
      byRule: countBy(findings, 'ruleId'),
    },
  };
}

function emptyResult() { return { findings: [], summary: { total: 0, byRule: {} } }; }
function countBy(arr, key) {
  const out = {};
  for (const x of arr) out[x[key]] = (out[x[key]] || 0) + 1;
  return out;
}

// ─── long function ─────────────────────────────────────────────────────────

function checkLongFunction(fn, thresholds, emit) {
  if (!fn.bodyTokens || fn.bodyTokens.length === 0) return;
  const first = fn.bodyTokens[0];
  const last = fn.bodyTokens[fn.bodyTokens.length - 1];
  if (!first || !last) return;
  const lines = Math.max(1, last.line - first.line + 1);
  if (lines <= thresholds.longFunctionLines) return;
  emit({
    line: fn.line,
    column: fn.column,
    ruleId: 'smell/long-function',
    severity: 'info',
    category: 'smell',
    message: `${fn.name || '<anonymous>'} is ${lines} lines (threshold ${thresholds.longFunctionLines})`,
    suggestion: 'Extract self-contained sections into helper functions',
  });
}

// ─── deep nesting ──────────────────────────────────────────────────────────

function checkDeepNesting(fn, thresholds, emit) {
  if (!fn.bodyTokens) return;
  let depth = 0;
  let maxDepth = 0;
  let maxLine = fn.line;
  for (const t of fn.bodyTokens) {
    if (t.value === '{') {
      depth++;
      if (depth > maxDepth) { maxDepth = depth; maxLine = t.line; }
    } else if (t.value === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  if (maxDepth <= thresholds.deepNestingDepth) return;
  emit({
    line: maxLine,
    column: 1,
    ruleId: 'smell/deep-nesting',
    severity: 'info',
    category: 'smell',
    message: `${fn.name || '<anonymous>'} nests ${maxDepth} levels deep (threshold ${thresholds.deepNestingDepth})`,
    suggestion: 'Flatten with early returns, extract helpers, or use optional chaining',
  });
}

// ─── too many params ───────────────────────────────────────────────────────

function checkTooManyParams(fn, thresholds, emit) {
  const params = fn.params || [];
  if (params.length <= thresholds.tooManyParams) return;
  emit({
    line: fn.line,
    column: fn.column,
    ruleId: 'smell/too-many-params',
    severity: 'info',
    category: 'smell',
    message: `${fn.name || '<anonymous>'} takes ${params.length} parameters (threshold ${thresholds.tooManyParams})`,
    suggestion: 'Bundle related parameters into a single options object',
  });
}

// ─── god file ──────────────────────────────────────────────────────────────

function checkGodFile(program, thresholds, emit) {
  // Count top-level function declarations and top-level consts.
  let exportCount = 0;
  const tokens = program.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'keyword' && t.value === 'export') {
      exportCount++;
      continue;
    }
  }
  // Also count functions declared at top level (common in CJS)
  exportCount += program.functions.filter(f => f.name).length;
  if (exportCount <= thresholds.godFileExports) return;
  emit({
    line: 1,
    column: 1,
    ruleId: 'smell/god-file',
    severity: 'info',
    category: 'smell',
    message: `File exports / declares ${exportCount} top-level symbols (threshold ${thresholds.godFileExports})`,
    suggestion: 'Split the file along responsibility boundaries',
  });
}

// ─── feature envy ──────────────────────────────────────────────────────────

/**
 * A method has feature envy when it touches another object's members
 * more often than its own (`this.*`). We approximate this as:
 *   - count member accesses per "receiver identifier"
 *   - if the top non-this receiver > thresholds.featureEnvyRatio × (this accesses)
 *     then the function is envy of that receiver
 */
function checkFeatureEnvy(fn, thresholds, emit) {
  if (!fn.bodyTokens || fn.bodyTokens.length === 0) return;
  const tokens = fn.bodyTokens;
  const counts = new Map();
  let thisCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'identifier' && t.value !== 'this') continue;
    if (tokens[i + 1]?.value !== '.') continue;
    if (t.value === 'this') { thisCount++; continue; }
    counts.set(t.value, (counts.get(t.value) || 0) + 1);
  }
  if (counts.size === 0) return;
  // Find the top envied receiver
  let top = null; let topCount = 0;
  for (const [name, count] of counts.entries()) {
    if (count > topCount) { top = name; topCount = count; }
  }
  if (!top) return;
  // Need at least a few accesses to avoid false positives on tiny functions
  if (topCount < 4) return;
  const ratio = thisCount === 0 ? Infinity : topCount / thisCount;
  if (ratio < thresholds.featureEnvyRatio) return;
  emit({
    line: fn.line,
    column: fn.column,
    ruleId: 'smell/feature-envy',
    severity: 'info',
    category: 'smell',
    message: `${fn.name || '<anonymous>'} accesses ${top}.* ${topCount} times vs. this.* ${thisCount} times`,
    suggestion: `Consider moving this method onto ${top} or extracting a helper on that object`,
  });
}

// ─── File / batch API ───────────────────────────────────────────────────────

function smellFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, findings: [], summary: { total: 0, byRule: {} }, error: 'not found' };
  }
  try {
    const source = fs.readFileSync(filePath, 'utf-8');
    const { analyzeCached } = require('../core/analyze');
    const env = analyzeCached(source, filePath);
    return { file: filePath, ...smellCode(source, { ...options, program: env.program }) };
  } catch (e) {
    return { file: filePath, findings: [], summary: { total: 0, byRule: {} }, error: e.message };
  }
}

function smellFiles(files, options = {}) {
  const results = [];
  let totalFindings = 0;
  const byRule = {};
  for (const file of files || []) {
    const r = smellFile(file, options);
    if (r.findings && r.findings.length > 0) {
      results.push(r);
      totalFindings += r.findings.length;
      for (const [k, v] of Object.entries(r.summary.byRule)) byRule[k] = (byRule[k] || 0) + v;
    }
  }
  return {
    files: results,
    totalFindings,
    summary: { filesScanned: files ? files.length : 0, filesWithFindings: results.length, byRule },
  };
}

module.exports = {
  smellCode,
  smellFile,
  smellFiles,
  DEFAULT_THRESHOLDS,
};
