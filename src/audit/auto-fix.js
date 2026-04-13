'use strict';

/**
 * Auto-fix engine for audit findings.
 *
 * For each rule we have a confident canonical fix, this module produces
 * a Patch — a `{start, end, replacement}` edit against the source byte
 * offsets. Multiple patches are applied right-to-left so earlier offsets
 * remain valid.
 *
 * Only "confident" rules get auto-fixes. Heuristic-heavy rules
 * (concurrency, integration/nullable-deref, security/*) are NOT
 * auto-fixed because a wrong fix can introduce bugs or hide real ones.
 *
 * Supported confident fixes:
 *   state-mutation/sort        → insert `.slice()` before `.sort(`
 *   state-mutation/reverse     → insert `.slice()` before `.reverse(`
 *   state-mutation/object-assign → wrap first arg as `{}, <arg>`
 *   type/division-by-zero      → `a / b` → `(b === 0 ? 0 : a / b)`
 *   type/json-parse-no-try     → wrap in try/catch block
 *   edge-case/switch-no-default → append `default: break;` before closing brace
 *
 * For rules without confident fixes we emit a `suggestion` string in the
 * patch result so the caller can decide what to do.
 */

const fs = require('fs');
const { parseProgram } = require('./parser');

/** A single patch against a source string. */
class Patch {
  constructor(start, end, replacement, note) {
    this.start = start;
    this.end = end;
    this.replacement = replacement;
    this.note = note || '';
  }
}

/**
 * Apply an array of patches to a source string. Patches are sorted by
 * start offset descending so earlier patches remain valid. Overlapping
 * patches are dropped (the first one wins).
 */
function applyPatches(source, patches) {
  if (!patches || patches.length === 0) return { source, applied: 0 };
  // Sort descending by start so applying one doesn't shift offsets
  // for the others that come before.
  const sorted = [...patches].sort((a, b) => b.start - a.start);
  let out = source;
  let applied = 0;
  const used = [];
  for (const p of sorted) {
    if (typeof p.start !== 'number' || typeof p.end !== 'number') continue;
    if (p.end < p.start) continue;
    // Skip overlaps with already-applied patches
    if (used.some(u => rangesOverlap(u.start, u.end, p.start, p.end))) continue;
    out = out.slice(0, p.start) + p.replacement + out.slice(p.end);
    applied++;
    used.push(p);
  }
  return { source: out, applied };
}

function rangesOverlap(a1, a2, b1, b2) {
  return !(a2 <= b1 || b2 <= a1);
}

// ─── Rule-specific patch generators ────────────────────────────────────────

/**
 * Given the parsed program, the source, and a single finding, return
 * an array of Patches (0 or 1) that fix the finding, or null if the
 * rule is not auto-fixable.
 */
function generatePatchFor(finding, source, program) {
  switch (finding.ruleId) {
    case 'state-mutation/sort':
    case 'state-mutation/reverse':
      return patchSliceInsertion(finding, source, program);
    case 'state-mutation/object-assign':
      return patchObjectAssignSpread(finding, source, program);
    case 'type/division-by-zero':
      return patchDivisionGuard(finding, source, program);
    case 'type/json-parse-no-try':
      return patchJsonParseTryCatch(finding, source, program);
    case 'edge-case/switch-no-default':
      return patchSwitchDefault(finding, source, program);
    default:
      return null;
  }
}

/**
 * Fix .sort / .reverse by inserting `.slice()` before the method token.
 * We locate the method-call token on the finding's line via the token
 * stream and the ruleId suffix.
 */
function patchSliceInsertion(finding, source, program) {
  const method = finding.ruleId.split('/')[1]; // 'sort' or 'reverse'
  const tokens = program.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.line !== finding.line) continue;
    if (t.type !== 'identifier' || t.value !== method) continue;
    const prev = tokens[i - 1];
    if (prev?.value !== '.') continue;
    // Insert `.slice()` at prev.start (the position of the `.`), so
    // `x.sort(` becomes `x.slice().sort(`
    return [new Patch(prev.start, prev.start, '.slice()', `copy before .${method}`)];
  }
  return null;
}

/**
 * `Object.assign(target, src)` → `Object.assign({}, target, src)`
 * We find the open paren and insert `{}, ` right after it.
 */
function patchObjectAssignSpread(finding, source, program) {
  const tokens = program.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.line !== finding.line) continue;
    if (t.type !== 'identifier' || t.value !== 'Object') continue;
    if (tokens[i + 1]?.value !== '.') continue;
    if (tokens[i + 2]?.value !== 'assign') continue;
    if (tokens[i + 3]?.value !== '(') continue;
    const openParen = tokens[i + 3];
    // Don't double-fix: if the first arg is already `{}` we're fine.
    if (tokens[i + 4]?.value === '{' && tokens[i + 5]?.value === '}') return null;
    return [new Patch(openParen.end, openParen.end, '{}, ', 'immutable spread')];
  }
  return null;
}

/**
 * `a / b` → `(b === 0 ? 0 : a / b)` using the divisor the finding named.
 * We walk tokens on the finding's line looking for the first `/`
 * operator whose right-hand side is an identifier matching the finding's
 * assumption.
 */
function patchDivisionGuard(finding, source, program) {
  const tokens = program.tokens;
  // Extract divisor name from `"<name> is never zero"` assumption.
  const m = (finding.assumption || '').match(/(\S+) is never zero/);
  if (!m) return null;
  const divisor = m[1];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.line !== finding.line) continue;
    if (t.type !== 'operator' || t.value !== '/') continue;
    const right = tokens[i + 1];
    if (!right || right.type !== 'identifier') continue;
    if (right.value !== divisor.split('.')[0]) continue;
    // Collect the full divisor chain
    let end = i + 2;
    while (tokens[end]?.value === '.' && tokens[end + 1]?.type === 'identifier') end += 2;
    const divisorEnd = tokens[end - 1]?.end || (i + 1);
    // Find the start of the left-hand numerator: walk back through the
    // expression, skipping balanced brackets so we treat a complete
    // `foo.bar(arg1, arg2)` call as one atom. Stop at a token that
    // can't be part of a binary-expression left operand.
    let leftStart = tokens[i - 1]?.start ?? t.start;
    let depth = 0;
    for (let k = i - 1; k >= 0; k--) {
      const tk = tokens[k];
      if (!tk) break;
      // Close brackets: enter a balanced region (walking right-to-left,
      // so a `)` opens depth and `(` closes it).
      if (tk.value === ')' || tk.value === ']' || tk.value === '}') {
        depth++;
        leftStart = tk.start;
        continue;
      }
      if (tk.value === '(' || tk.value === '[' || tk.value === '{') {
        if (depth === 0) break; // unmatched open — stop here
        depth--;
        leftStart = tk.start;
        continue;
      }
      if (depth > 0) {
        // Inside a balanced region — include everything
        leftStart = tk.start;
        continue;
      }
      // Outside brackets: only identifiers, dots, and numbers extend
      // the numerator.
      if (tk.type === 'identifier' || tk.type === 'number' || tk.value === '.') {
        leftStart = tk.start;
        continue;
      }
      break;
    }
    const numerator = source.slice(leftStart, t.start).trim();
    const divisorText = source.slice(right.start, divisorEnd).trim();
    if (!numerator || !divisorText) return null;
    const replacement = `(${divisorText} === 0 ? 0 : ${numerator} / ${divisorText})`;
    return [new Patch(leftStart, divisorEnd, replacement, 'zero-guard')];
  }
  return null;
}

/**
 * Wrap a JSON.parse call in try/catch. We wrap the enclosing statement
 * by finding the nearest `;` or newline and emitting a `try { ... }
 * catch { return null; }` block.
 *
 * For safety we only fix `const x = JSON.parse(y)` and `return
 * JSON.parse(y)` — other shapes are left alone.
 */
function patchJsonParseTryCatch(finding, source, program) {
  const tokens = program.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.line !== finding.line) continue;
    if (t.type !== 'identifier' || t.value !== 'JSON') continue;
    if (tokens[i + 1]?.value !== '.') continue;
    if (tokens[i + 2]?.value !== 'parse') continue;

    // Walk left to find a statement start: `const x =`, `let x =`,
    // `var x =`, `return`, or beginning of expression statement.
    let stmtStart = t.start;
    let stmtKind = 'expr';
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const tk = tokens[j];
      if (!tk) break;
      if (tk.type === 'keyword' && (tk.value === 'const' || tk.value === 'let' || tk.value === 'var')) {
        stmtStart = tk.start;
        stmtKind = 'decl';
        break;
      }
      if (tk.type === 'keyword' && tk.value === 'return') {
        stmtStart = tk.start;
        stmtKind = 'return';
        break;
      }
      if (tk.value === ';' || tk.value === '{' || tk.value === '}') {
        stmtStart = tk.end;
        break;
      }
    }
    // Walk right to find the semicolon ending the statement.
    let stmtEnd = -1;
    let depth = 0;
    for (let j = i; j < tokens.length; j++) {
      const tk = tokens[j];
      if (tk.value === '(' || tk.value === '[' || tk.value === '{') depth++;
      if (tk.value === ')' || tk.value === ']' || tk.value === '}') depth--;
      if (depth === 0 && tk.value === ';') { stmtEnd = tk.end; break; }
    }
    if (stmtEnd < 0) return null;

    const stmtText = source.slice(stmtStart, stmtEnd).trim();
    const fallback = stmtKind === 'return' ? 'return null;' : stmtKind === 'decl' ? stmtText.replace(/=.*/s, '= null;') : '/* noop */';
    const indent = detectIndent(source, stmtStart);
    const replacement = `try { ${stmtText} } catch { ${fallback} }`;
    return [new Patch(stmtStart, stmtEnd, replacement, 'try/catch wrap')];
  }
  return null;
}

function detectIndent(source, offset) {
  // Walk back to the start of the line containing offset, return the
  // leading whitespace on that line.
  let lineStart = offset;
  while (lineStart > 0 && source[lineStart - 1] !== '\n') lineStart--;
  let indent = '';
  for (let i = lineStart; i < offset; i++) {
    if (source[i] === ' ' || source[i] === '\t') indent += source[i];
    else break;
  }
  return indent;
}

/**
 * `switch (x) { case 1: ... }` → add `default: break;` before closing brace.
 */
function patchSwitchDefault(finding, source, program) {
  const tokens = program.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.line !== finding.line) continue;
    if (t.type !== 'keyword' || t.value !== 'switch') continue;
    // Find the switch body open brace
    let j = i + 1;
    let depth = 0;
    while (j < tokens.length) {
      const tk = tokens[j];
      if (tk.value === '(') depth++;
      if (tk.value === ')') { depth--; if (depth === 0) { j++; break; } }
      j++;
    }
    if (tokens[j]?.value !== '{') return null;
    // Find matching close brace
    const bodyOpen = tokens[j];
    depth = 1;
    let k = j + 1;
    while (k < tokens.length && depth > 0) {
      if (tokens[k].value === '{') depth++;
      if (tokens[k].value === '}') { depth--; if (depth === 0) break; }
      k++;
    }
    const bodyClose = tokens[k];
    if (!bodyClose) return null;
    // Insert `default: break;` right before the closing brace.
    const indent = detectIndent(source, bodyClose.start);
    const replacement = `${indent}  default: break;\n${indent}`;
    return [new Patch(bodyClose.start, bodyClose.start, replacement, 'default case')];
  }
  return null;
}

// ─── File-level orchestrator ───────────────────────────────────────────────

/**
 * Auto-fix a single file. Returns
 *   {
 *     fixed: number,
 *     unfixed: finding[],
 *     source: string,   // final source (may equal input)
 *     patches: Patch[],
 *   }
 *
 * If `write` is true, the file is overwritten on disk.
 */
function autoFixFile(filePath, findings, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { fixed: 0, unfixed: findings, source: '', patches: [], error: 'not found' };
  }
  const source = fs.readFileSync(filePath, 'utf-8');
  let program;
  try {
    program = parseProgram(source);
  } catch (e) {
    return { fixed: 0, unfixed: findings, source, patches: [], error: 'parse: ' + e.message };
  }

  const patches = [];
  const unfixed = [];
  for (const f of findings || []) {
    const p = generatePatchFor(f, source, program);
    if (p && p.length > 0) patches.push(...p);
    else unfixed.push(f);
  }

  const { source: nextSource, applied } = applyPatches(source, patches);
  const result = {
    fixed: applied,
    unfixed,
    source: nextSource,
    patches,
  };

  if (options.write && nextSource !== source) {
    fs.writeFileSync(filePath, nextSource, 'utf-8');
  }
  return result;
}

module.exports = {
  Patch,
  applyPatches,
  generatePatchFor,
  autoFixFile,
};
