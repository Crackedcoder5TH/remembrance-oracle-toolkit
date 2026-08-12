#!/usr/bin/env node
'use strict';
// @oracle-infrastructure — developer tooling — CLI/analysis helpers, not substrate elements; writes are build artifacts and internal-state maintenance

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
// Case-insensitive and NOT word-bounded on the left: the real readings are
// written camelCase — newCoherency, coherencyScore, substrateCoherence,
// avgCoherence. \bcoherency\b matched none of them, so a genuine
// coherency aggregation read as an unnamed scalar and was queued for
// deletion. Same spelling-over-substance failure this cleanup exists for.
const MEASURED = /(coherenc|unified)/i;
// Names that denote something else entirely.
const OTHER = /\b(confidence|matchScore|amplitude|composite|score|ratio|evidence|length|count|size|probability|weight|strength|similarity|density|agreement|total|reliability|quality)\b/i;

// Canonical walker (ECOSYSTEM §7). The old path-regex /node_modules|\.git/
// also matched '.github', so the skip set names all three; hidden dirs
// outside it were walked, so skipHidden stays off.
const { walkFiles } = require('../src/core/walk-files');
const walk = (dir) => walkFiles(dir, { skipDirs: new Set(['node_modules', '.git', '.github']), extensions: ['.js'], skipHidden: false });

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
    const vEsc = v.replace(/[$]/g, '\\$');
    // Three binding forms, same judgment: plain assignment, loop-of
    // (for (const c of coherences) — the conduit shape the field organs
    // use post no-averaging), and push-population (adj.push(expr)).
    // Only the first was resolved before, so a genuine reading iterated
    // through a loop variable read as an unnamed scalar.
    const res = [
      new RegExp(`\\b${vEsc}\\s*(?:=|\\+=)([^;\\n]+)`, 'g'),
      new RegExp(`for\\s*\\(\\s*(?:const|let|var)\\s+${vEsc}\\s+of\\s+([^)]+)\\)`, 'g'),
      new RegExp(`\\b${vEsc}\\.push\\(([^;\\n]+)`, 'g'),
    ];
    for (const re of res) {
      let m;
      while ((m = re.exec(context)) !== null) {
        if (MEASURED.test(m[1])) return ['MEASURED', 'coherency (via ' + v + ')'];
        const o = m[1].match(OTHER);
        if (o) return ['SUBSTITUTED', o[0] + ' (via ' + v + ')'];
      }
    }
  }
  const m2 = inner.match(OTHER);
  if (m2) return ['SUBSTITUTED', m2[0]];
  return ['SUBSTITUTED', 'unnamed scalar'];
}


const rows = [];
// Blank comment spans (newlines preserved so line numbers hold) before
// scanning. Without this, an explanatory comment DESCRIBING an old
// contribute site counts as a live write site — three of the first
// grandfathered "sites" were exactly that: documentation of already-fixed
// bugs in entangle.js and living-remembrance.js. The census reads code,
// not prose about code. Tokenizer-backed, same instrument as the covenant
// scanners; on tokenize failure the raw text is scanned (best-effort,
// never silently narrower than before).
let _tokenizeFn = null;
try { ({ tokenize: _tokenizeFn } = require('../src/audit/parser')); } catch (_) { /* raw fallback */ }
function stripCommentSpans(text) {
  if (!_tokenizeFn) return text;
  try {
    let out = text;
    for (const t of _tokenizeFn(text)) {
      if (t.type !== 'comment') continue;
      const span = out.slice(t.start, t.end).replace(/[^\n]/g, ' ');
      out = out.slice(0, t.start) + span + out.slice(t.end);
    }
    return out;
  } catch (_) { return text; }
}

for (const f of walk(SRC)) {
  const src = stripCommentSpans(fs.readFileSync(f, 'utf8'));
  // Match BOTH the auto-wired `__contribute({` and hand-written
  // `contribute({`. Seeing only the auto-wired form meant a
  // hand-written substitution could never be caught — the audit was
  // blind to exactly the contributions a human would add by hand.
  if (!/\b_?_?contribute\(\{/.test(src)) continue;
  const lines = src.split('\n');
  // Key-order-independent, multi-line-tolerant matcher. The first version
  // required the literal order `cost:, coherence:, source:` on ONE line —
  // so a hand-written site with `{ coherence: x, cost: 1 }`, or a call
  // formatted across lines, was invisible to the audit and therefore to
  // the field-source ratchet riding on it. A census with a spelling
  // requirement is not a census. The window joins the call's next 8 lines
  // and each field is extracted independently of its position.
  const siteRe = /\b_?_?contribute\(\{/g;
  let sm;
  while ((sm = siteRe.exec(src)) !== null) {
    const i = src.slice(0, sm.index).split('\n').length - 1;
    const window = lines.slice(i, i + 8).join('\n');
    const local = window.slice(window.indexOf('contribute({'));
    // Balanced extraction: the coherence expression ends at the first
    // comma or closing brace at paren/bracket depth 0 — a truncating
    // regex here turns Math.max(0, Math.min(1, x.coherence)) into
    // "Math.max(0" and misclassifies a real reading as an unnamed scalar.
    const kAt = local.search(/\bcoherence\s*:/);
    if (kAt < 0) continue;
    let p = local.indexOf(':', kAt) + 1;
    let depth = 0, expr = '';
    for (; p < local.length; p++) {
      const ch = local[p];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0) break;
      expr += ch;
    }
    const coh = [null, expr];
    if (!expr.trim()) continue;
    const srcM = local.match(/\bsource\s*:\s*(?:'([^']*)'|`([^`]*)`|"([^"]*)")/);
    const sourceName = srcM ? (srcM[1] || srcM[2] || srcM[3] || '(dynamic)') : '(unlabeled)';
    const ctx = lines.slice(Math.max(0, i - 20), i).join('\n');
    const [kind, why] = classify(coh[1].trim(), ctx);
    rows.push({ file: path.relative(ROOT, f), line: i + 1, kind, why, source: sourceName });
  }
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
