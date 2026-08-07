#!/usr/bin/env node
'use strict';
// @oracle-infrastructure — developer tooling — CLI/analysis helpers, not substrate elements; writes are build artifacts and internal-state maintenance

/**
 * unwire-substituted-couplings.js — remove field contributions that are not
 * coherency readings.
 *
 * ROOT CAUSE
 * ----------
 * scripts/wire-field-couplings.js auto-instrumented 67 functions. It chose
 * what to contribute with this list:
 *
 *   const NUMERIC_FIELDS = [
 *     'score', 'coherency', 'coherence', 'confidence', 'reliability',
 *     'quality', 'composite', 'total', 'agreement', 'density', 'ratio',
 *     'similarity', 'unified', 'matchScore',
 *   ];
 *
 * Any return field with one of those NAMES became `coherence:`. Two of the
 * fourteen are coherency. The rest are different measurements of different
 * things — a confidence, a match score, a density, a count — clamped into
 * [0,1] and averaged into a coherency field. The clamp made every one of
 * them type-correct, which is why nothing ever failed.
 *
 * scripts/check-field-couplings.js validated these blocks, but it checks
 * STRUCTURE — require path resolves, math cannot produce NaN, the block sits
 * after the __retVal assignment. It never asked what the number MEANS. A
 * structural contract cannot catch a semantic substitution.
 *
 * WHAT THIS DOES
 * --------------
 * Reclassifies every site and deletes the blocks whose contributed quantity
 * is not a coherency, brace-matched so the whole try/catch goes rather than
 * a dangling line. Sites that contribute a genuine coherency are untouched.
 *
 * Safety checked before writing anything: no test asserts on a contribution
 * source, and every field consumer reads the aggregate through peekField()
 * rather than a per-source value — so removing a source changes the field's
 * VALUE but breaks no contract. The value it removes was never a coherency,
 * so the resulting number is smaller and true rather than larger and mixed.
 *
 * Usage:
 *   node scripts/unwire-substituted-couplings.js            # dry run
 *   node scripts/unwire-substituted-couplings.js --apply    # write
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Syntax-check in-process rather than spawning `node --check <file>`.
// The covenant gate flagged the spawn as dynamic execution and it was right
// to: a path from a directory walk crossing a process boundary is a surface
// that does not need to exist. vm.Script compiles without running, which is
// exactly the check wanted, with no child process and no injection surface.
function syntaxOk(source, filename) {
  try { new vm.Script(source, { filename }); return true; } catch { return false; }
}

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

// Case-insensitive and NOT word-bounded on the left: the real readings are
// written camelCase — newCoherency, coherencyScore, substrateCoherence,
// avgCoherence. \bcoherency\b matched none of them, so a genuine
// coherency aggregation read as an unnamed scalar and was queued for
// deletion. Same spelling-over-substance failure this cleanup exists for.
const MEASURED = /(coherenc|unified)/i;
const OTHER = /\b(confidence|matchScore|amplitude|composite|score|ratio|evidence|length|count|size|probability|weight|strength|similarity|density|agreement|total|reliability|quality)\b/i;

/**
 * Classify what a contribution actually carries.
 *
 * `context` is the ~20 lines preceding the call. It is not optional. An
 * expression like `__c / __n` names nothing, but two lines above sits
 * `__c += __u.coherencyScore` — so the contribution IS a coherency and
 * judging the expression alone would delete a real reading. The first
 * version of this function did exactly that, which is the same
 * name-shape-matching that produced the bug it is here to clean up.
 */
function classify(expr, context = '') {
  const inner = expr.replace(/^Math\.max\(0,\s*Math\.min\(1,\s*/, '').replace(/\)\s*\)$/, '');
  if (/^[\d.]+$/.test(inner.trim())) return ['CONSTANT', 'literal value'];
  if (/1\s*-\s*\(?\w*compressedSize/.test(inner)) return ['SUBSTITUTED', 'compression savings ratio'];
  if (MEASURED.test(inner)) return ['MEASURED', 'coherency'];

  // The expression names nothing recognisable — resolve its local variables.
  const locals = [...new Set((inner.match(/[A-Za-z_$][\w$]*/g) || []))]
    .filter((v) => !['Math', 'max', 'min', 'Number', 'reduce', 'length'].includes(v));
  for (const v of locals) {
    const re = new RegExp(`\\b${v.replace(/[$]/g, '\\$')}\\s*(?:=|\\+=)([^;\\n]+)`, 'g');
    let m;
    while ((m = re.exec(context)) !== null) {
      if (MEASURED.test(m[1])) return ['MEASURED', 'coherency (via ' + v + ')'];
      const o = m[1].match(OTHER);
      if (o) return ['SUBSTITUTED', o[0] + ' (via ' + v + ')'];
    }
  }
  const m2 = inner.match(OTHER);
  if (m2) return ['SUBSTITUTED', m2[0]];
  return ['SUBSTITUTED', 'unnamed scalar'];
}

// Canonical walker (ECOSYSTEM §7). The old path-regex /node_modules|\.git/
// also matched '.github', so the skip set names all three; hidden dirs
// outside it were walked, so skipHidden stays off.
const { walkFiles } = require('../src/core/walk-files');
const walk = (dir) => walkFiles(dir, { skipDirs: new Set(['node_modules', '.git', '.github']), extensions: ['.js'], skipHidden: false });

/**
 * Locate the enclosing auto-wired try/catch for a __contribute line.
 *
 * The wirer emitted two shapes (one declaring __lre_p1/__lre_p2, one
 * declaring __lre_enginePaths), so we anchor on the outer `try` that owns a
 * `__lre_` declaration rather than on any fixed text, then brace-match
 * forward. Anchoring on the marker comment would miss the 8 blocks that
 * carry no marker.
 */
function blockBounds(lines, contribIdx) {
  let start = -1;
  for (let i = contribIdx; i >= 0 && i > contribIdx - 12; i--) {
    if (/^\s*try\s*\{\s*$/.test(lines[i]) && /__lre_/.test(lines[i + 1] || '')) { start = i; break; }
  }
  if (start < 0) return null;
  // Absorb a preceding marker comment so no orphan header is left behind.
  if (start > 0 && /LRE field-coupling \(auto-wired\)/.test(lines[start - 1])) start -= 1;

  let depth = 0, seen = false, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { depth++; seen = true; }
      else if (ch === '}') depth--;
    }
    if (seen && depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  // The block ends with the outer `} catch (_) { ... }` — take that line too.
  if (/^\s*\}\s*catch\s*\(_\)\s*\{/.test(lines[end + 1] || '')) end += 1;
  return { start, end };
}

const CONTRIB = /__contribute\(\{\s*cost:[^,]+,\s*coherence:\s*([\s\S]*?),\s*source:\s*'([^']*)'/;

let removed = 0, kept = 0, files = 0;
const log = [];

for (const f of walk(SRC)) {
  let src = fs.readFileSync(f, 'utf8');
  if (!src.includes('__contribute({')) continue;
  let lines = src.split('\n');
  let changed = false;

  // Work backwards so earlier indices stay valid as we splice.
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(CONTRIB);
    if (!m) continue;
    const ctx = lines.slice(Math.max(0, i - 20), i).join('\n');
    const [kind, why] = classify(m[1].trim(), ctx);
    if (kind === 'MEASURED') { kept++; continue; }
    const b = blockBounds(lines, i);
    if (!b) { log.push(`  ! could not bound block at ${path.relative(ROOT, f)}:${i + 1} — LEFT IN PLACE`); continue; }
    const indent = (lines[b.start].match(/^\s*/) || [''])[0];
    lines.splice(b.start, b.end - b.start + 1,
      `${indent}// field contribution removed: contributed ${why}, not a coherency.`,
      `${indent}// Auto-wired by scripts/wire-field-couplings.js, whose NUMERIC_FIELDS`,
      `${indent}// list treated any numeric-looking return field as a coherence signal.`);
    removed++;
    changed = true;
    log.push(`  - ${path.relative(ROOT, f)}:${b.start + 1}  ${why}  → ${m[2]}`);
  }

  if (changed) {
    files++;
    if (APPLY) {
      const next = lines.join('\n');
      if (!syntaxOk(next, f)) {
        console.error(`SYNTAX BROKEN in ${f} — not written, original left intact`);
        process.exit(1);
      }
      fs.writeFileSync(f, next);
    }
  }
}

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — substituted contributions`);
console.log(`  removed: ${removed}   kept (measured): ${kept}   files touched: ${files}\n`);
for (const l of log.slice(0, 50)) console.log(l);
if (log.length > 50) console.log(`  …and ${log.length - 50} more`);
if (!APPLY) console.log('\n  re-run with --apply to write.\n');
