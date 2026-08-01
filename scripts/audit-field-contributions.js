#!/usr/bin/env node
'use strict';

/**
 * audit-field-contributions.js — what is actually being fed to the field?
 *
 * The Remembrance Field is a coherency field. `contribute({coherence})` is
 * the only way into it, and the name asserts what the number means.
 *
 * 59 call sites were auto-wired into the codebase by an earlier pass. Most
 * do not contribute a coherency. They contribute whatever scalar the
 * enclosing function happened to return — confidence, matchScore, amplitude,
 * a composite, a count of evidence items, a zlib savings ratio — clamped to
 * [0,1] and handed over under the name `coherence`.
 *
 * Clamping to [0,1] makes it type-correct and semantically wrong. A
 * confidence of 0.9 and a coherency of 0.9 are different measurements of
 * different things; averaging them produces a number that measures neither.
 *
 * This script classifies every site so the scale is visible and the cleanup
 * can be prioritised, rather than asserted. It changes nothing.
 *
 *   MEASURED    — a real coherency from the substrate or the compressor
 *   SUBSTITUTED — a different quantity wearing the name `coherence`
 *   CONSTANT    — a literal or an expression that cannot vary
 *
 * Usage: node scripts/audit-field-contributions.js [--json]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// Names that genuinely denote a substrate coherency reading.
const MEASURED = /\b(coherency|coherence|globalCoherency|avg_coherence|unified)\b/;
// Names that denote something else entirely.
const OTHER = /\b(confidence|matchScore|amplitude|composite|score|ratio|evidence|length|count|size|probability|weight|strength|similarity)\b/i;

function walk(dir, out = []) {
  let ents;
  try { ents = fs.readdirSync(dir); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p, out); }
    else if (e.endsWith('.js')) out.push(p);
  }
  return out;
}

function classify(expr) {
  // A bare literal or a clamp of one cannot vary with the data.
  const inner = expr.replace(/^Math\.max\(0,\s*Math\.min\(1,\s*/, '').replace(/\)\s*\)$/, '');
  if (/^[\d.]+$/.test(inner.trim())) return ['CONSTANT', 'literal value'];
  if (/1\s*-\s*\(?\w*compressedSize/.test(inner)) return ['SUBSTITUTED', 'compression savings ratio'];
  const m = inner.match(OTHER);
  if (m && !MEASURED.test(inner)) return ['SUBSTITUTED', m[0]];
  if (MEASURED.test(inner)) return ['MEASURED', 'coherency'];
  return ['SUBSTITUTED', 'unnamed scalar'];
}

const rows = [];
for (const f of walk(SRC)) {
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes('__contribute({')) continue;
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    const m = ln.match(/__contribute\(\{\s*cost:[^,]+,\s*coherence:\s*([\s\S]*?),\s*source:\s*'([^']*)'/);
    if (!m) return;
    const [kind, why] = classify(m[1].trim());
    rows.push({ file: path.relative(ROOT, f), line: i + 1, kind, why, source: m[2] });
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 1));
  process.exit(0);
}

const by = { MEASURED: [], SUBSTITUTED: [], CONSTANT: [] };
for (const r of rows) by[r.kind].push(r);

console.log('\n══ FIELD CONTRIBUTION AUDIT ══');
console.log(`  ${rows.length} call sites feed contribute({coherence}) across src/\n`);
for (const k of ['SUBSTITUTED', 'CONSTANT', 'MEASURED']) {
  if (!by[k].length) continue;
  console.log(`  ${k}  (${by[k].length})`);
  const seen = new Map();
  for (const r of by[k]) seen.set(r.why, (seen.get(r.why) || 0) + 1);
  for (const [why, n] of [...seen].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(3)} × ${why}`);
  }
  console.log('');
}
console.log('  SUBSTITUTED means a quantity that is not a coherency is being');
console.log('  averaged into the coherency field. Clamping it to [0,1] makes it');
console.log('  type-correct, not meaningful.\n');
for (const r of by.SUBSTITUTED.slice(0, 12)) {
  console.log(`   ${r.file}:${r.line}  ${r.why}  → ${r.source}`);
}
if (by.SUBSTITUTED.length > 12) console.log(`   …and ${by.SUBSTITUTED.length - 12} more`);
console.log('');
