#!/usr/bin/env node
'use strict';

/**
 * wire-field-couplings — additive, safe auto-wirer.
 *
 * Companion to scripts/check-field-couplings.js. The original auto-wire
 * tool that produced ~60 instrumentation blocks shipped four classes
 * of bugs (mislabels, wrong require depth, contributes buried in
 * early-return guards, coherence on string fields). Those have been
 * patched by hand on disk. This script is the canonical replacement:
 *
 *   - It NEVER modifies an existing field-coupling block.
 *     (Hand fixes are sacred; the checker enforces them.)
 *   - It ADDS a contribute to any function that looks scoring-shaped
 *     (returns a numeric `score`/`coherency`/`confidence`/etc. on a
 *     `__retVal` object) and has none yet.
 *   - It uses the correct require depth (mechanically computed).
 *   - It uses the correct source label (= enclosing function name).
 *   - It places the contribute right before the function's main
 *     return, never inside an early-return guard.
 *   - It uses a guarded numeric coherence expression.
 *
 * Usage:
 *   node scripts/wire-field-couplings.js --dry-run    # list what would be added
 *   node scripts/wire-field-couplings.js              # actually apply
 *   node scripts/wire-field-couplings.js --verify     # re-run checker after
 *
 * The script is deliberately conservative — it skips any file where
 * the heuristics can't be confident. False negatives are fine; false
 * positives (instrumenting the wrong function) would be regressions.
 */

const fs = require('fs');
const path = require('path');
const { check } = require('./check-field-couplings');

const HUB = path.resolve(__dirname, '..');
const SRC = path.join(HUB, 'src');
const CANONICAL_FIELD_COUPLING = path.join(SRC, 'core', 'field-coupling');

// Numeric-shaped __retVal fields the auto-wirer can use as a coherence
// signal. Functions whose return doesn't have one of these are skipped.
const NUMERIC_FIELDS = [
  'score', 'coherency', 'coherence', 'confidence', 'reliability',
  'quality', 'composite', 'total', 'agreement', 'density', 'ratio',
  'similarity', 'unified', 'matchScore',
];

function* walkJsFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkJsFiles(full);
    else if (e.isFile() && e.name.endsWith('.js')) yield full;
  }
}

function correctRequirePath(filePath) {
  const fileDir = path.dirname(filePath);
  let rel = path.relative(fileDir, CANONICAL_FIELD_COUPLING);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

// Find functions that:
//  - declare `const __retVal = { ... }` with a known numeric field
//  - return __retVal at the function's main exit
//  - don't already have a field-coupling block following the assignment
function findInstrumentationCandidates(src, file) {
  const out = [];

  // Iterate plausible function declarations
  const fnPatterns = [
    /\n\s*(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
    /\n\s+(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g,
  ];

  const allFns = [];
  for (const re of fnPatterns) {
    for (const m of src.matchAll(re)) {
      const name = m[1];
      if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else'].includes(name)) continue;
      allFns.push({ pos: m.index, name });
    }
  }
  allFns.sort((a, b) => a.pos - b.pos);

  for (let i = 0; i < allFns.length; i++) {
    const fn = allFns[i];
    const end = i + 1 < allFns.length ? allFns[i + 1].pos : src.length;
    const body = src.slice(fn.pos, end);

    // Skip if a contribute already exists in this function body
    if (/LRE field-coupling|__contribute\(/.test(body)) continue;

    // Find __retVal = { ... } with a numeric field
    const retM = body.match(/const\s+__retVal\s*=\s*\{([^}]+)\}/);
    if (!retM) continue;
    const retLiteral = retM[1];

    let chosenField = null;
    for (const f of NUMERIC_FIELDS) {
      const fieldRe = new RegExp(`\\b${f}\\s*:`);
      if (fieldRe.test(retLiteral)) { chosenField = f; break; }
    }
    if (!chosenField) continue;

    // Find the `return __retVal;` after the __retVal assignment
    const retValPosInBody = retM.index;
    const after = body.slice(retValPosInBody + retM[0].length);
    const returnM = after.match(/(\s*)return\s+__retVal\s*;/);
    if (!returnM) continue;

    // Absolute positions in src
    const retAssignAbsEnd = fn.pos + retValPosInBody + retM[0].length;
    const returnAbsStart = retAssignAbsEnd + returnM.index;

    out.push({
      fnName: fn.name,
      fnPos: fn.pos,
      retAssignEnd: retAssignAbsEnd,
      returnStart: returnAbsStart,
      indent: returnM[1].replace(/\n/g, ''),
      field: chosenField,
    });
  }
  return out;
}

function buildContributeBlock(filePath, fnName, fileBase, field, indent) {
  const requirePath = correctRequirePath(filePath);
  // For path.join arg, strip leading `./`
  const joinArg = requirePath.startsWith('./') ? requirePath.slice(2) : requirePath;
  const moduleLabel = path.basename(filePath, '.js');
  const source = `oracle:${moduleLabel}:${fnName}`;
  return [
    `${indent}// ── LRE field-coupling (wired by scripts/wire-field-couplings.js) ──`,
    `${indent}try {`,
    `${indent}  const __lre_enginePaths = ['${requirePath}',`,
    `${indent}    require('path').join(__dirname, '${joinArg}')];`,
    `${indent}  for (const __p of __lre_enginePaths) {`,
    `${indent}    try {`,
    `${indent}      const { contribute: __contribute } = require(__p);`,
    `${indent}      __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, Number(__retVal.${field}) || 0)), source: '${source}' });`,
    `${indent}      break;`,
    `${indent}    } catch (_) { /* try next */ }`,
    `${indent}  }`,
    `${indent}} catch (_) { /* best-effort */ }`,
    ``,
  ].join('\n');
}

function wire({ dryRun }) {
  const planned = [];

  for (const file of walkJsFiles(SRC)) {
    let src = fs.readFileSync(file, 'utf-8');
    const candidates = findInstrumentationCandidates(src, file);
    if (candidates.length === 0) continue;
    const rel = path.relative(HUB, file);

    // Apply edits in reverse so positions don't shift
    let modified = false;
    candidates.sort((a, b) => b.returnStart - a.returnStart);
    for (const c of candidates) {
      const block = buildContributeBlock(file, c.fnName, rel, c.field, c.indent);
      planned.push({ file: rel, fnName: c.fnName, field: c.field });
      if (!dryRun) {
        src = src.slice(0, c.returnStart) + block + src.slice(c.returnStart);
        modified = true;
      }
    }
    if (modified && !dryRun) fs.writeFileSync(file, src);
  }

  return planned;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const verify = argv.includes('--verify');

  const planned = wire({ dryRun });

  if (planned.length === 0) {
    console.log(dryRun ? '✓ no additions needed (dry-run)' : '✓ no additions needed');
  } else {
    console.log((dryRun ? '[dry-run] would add ' : 'added ') + planned.length + ' contribute block(s):');
    for (const p of planned) console.log(`  ${p.file}  →  oracle:${path.basename(p.file, '.js')}:${p.fnName}  (coherence ← __retVal.${p.field})`);
  }

  if (verify) {
    console.log('\n--- contract recheck ---');
    const violations = check();
    if (violations.length === 0) console.log('✓ 0 violations');
    else {
      console.log(`✗ ${violations.length} violation(s)`);
      for (const v of violations) console.log(`  [${v.rule}] ${v.file} — ${v.source}`);
      process.exit(1);
    }
  }
}

module.exports = { wire };
