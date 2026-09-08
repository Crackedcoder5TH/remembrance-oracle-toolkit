#!/usr/bin/env node
'use strict';
// @oracle-infrastructure — static Git argv and gate-owned baseline writes only.

/**
 * atomic-drift-ratchet — a function's declared identity must not drift
 * further from the one the substrate computes for it.
 *
 * Every public function in src/ carries a hand-written `atomicProperties`
 * block: its 13-dimension identity in the periodic table. The substrate
 * also OWNS an extractor — extractAtomicProperties — that computes those
 * same 13 dimensions from the function body. Nothing had ever compared
 * the two.
 *
 * Measured 2026-08-11 over 1,628 resolvable declarations: 1,057 agreed on
 * every dimension, 571 (35.1%) disagreed on at least one. The largest
 * disagreements are functions whose declaration reads like a generic
 * default while the body says otherwise — admin/atomic.js's 379-line
 * registration organ declares `mass: medium, spin: even, valence: 2` and
 * computes `heavy / odd / 8`. Where they disagree, the computed value is
 * usually the honest one; the declaration was written once and never
 * re-measured.
 *
 * THE INVARIANT (per-file counts, like the size ratchet)
 *   - a file's drifted-function count can only fall
 *   - a NEW file whose declarations disagree with its bodies blocks
 *   - the healing move is to re-measure and correct the DECLARATION,
 *     never to loosen the comparison
 *
 *   node scripts/atomic-drift-ratchet.js                 check
 *   node scripts/atomic-drift-ratchet.js --json          verdict
 *   node scripts/atomic-drift-ratchet.js --report        per-dimension detail
 *   node scripts/atomic-drift-ratchet.js --save-baseline accept counts
 *
 * WHY A RATCHET AND NOT AN EQUALITY GATE. Three of the thirteen dimensions
 * — harmPotential, alignment, intention — are covenant dimensions that a
 * declaration may legitimately assert about intent rather than structure,
 * and `domain` is explicitly evolvable. Demanding exact equality today
 * would also mean rewriting 571 declarations in one pass, which is a
 * change nobody could review. So the gate freezes the disagreement where
 * it stands and lets it only shrink. Counts only; nothing here touches
 * the coherence channel.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');
const { refuseIfLoosening } = require('./lib/ratchet-law');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, '.atomic-drift-baseline.json');

const DIMS = ['charge', 'valence', 'mass', 'spin', 'phase', 'reactivity',
  'electronegativity', 'group', 'period', 'harmPotential', 'alignment',
  'intention', 'domain'];

const _writeBaseline = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

/** Balanced {...} at or after token i → [startOffset, endOffset]. */
function braceSpan(ex, i) {
  let j = i;
  while (j < ex.length && ex[j].value !== '{') j++;
  if (j >= ex.length) return null;
  let d = 0;
  for (let k = j; k < ex.length; k++) {
    if (ex[k].value === '{') d++;
    else if (ex[k].value === '}') { d--; if (d === 0) return [ex[j].start, ex[k].end]; }
  }
  return null;
}
braceSpan.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Index just past a balanced (...) at or after i.
 *
 * A parameter list can hold an object default — `function f(opts = {}) {`
 * — so scanning for the first '{' after the name lands on that default
 * instead of the body. The first draft of this census did exactly that and
 * read ecosystem-sweep#runSweep's body as the two characters "{}", which
 * made every dimension of a 17-line function look like drift. The
 * parameter list has to be stepped over, not scanned through.
 */
function skipParams(ex, i) {
  let j = i;
  while (j < ex.length && ex[j].value !== '(') {
    if (ex[j].value === '{') return j;      // no parameter list here
    j++;
  }
  if (j >= ex.length) return -1;
  let d = 0;
  for (let k = j; k < ex.length; k++) {
    if (ex[k].value === '(') d++;
    else if (ex[k].value === ')') { d--; if (d === 0) return k + 1; }
  }
  return -1;
}
skipParams.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Source of NAME's body: `function NAME(p) {...}` or `NAME = (p) => {...}`. */
function functionBody(ex, code, name) {
  for (let i = 0; i < ex.length - 1; i++) {
    const t = ex[i];
    const isFnDecl = t.type === 'keyword' && t.value === 'function' &&
      ex[i + 1] && ex[i + 1].value === name;
    const isAssigned = t.type === 'identifier' && t.value === name &&
      ex[i + 1] && (ex[i + 1].value === '=' || ex[i + 1].value === ':') &&
      !(ex[i - 1] && ex[i - 1].value === '.');   // skip `NAME.atomicProperties =`
    if (!isFnDecl && !isAssigned) continue;
    const after = skipParams(ex, isFnDecl ? i + 2 : i + 2);
    if (after < 0) continue;
    const sp = braceSpan(ex, after);
    if (sp) return code.slice(sp[0], sp[1]);
  }
  return null;
}
functionBody.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Which declared dimensions disagree with the computed ones. */
function compare(declared, computed) {
  const out = [];
  for (const d of DIMS) {
    const a = declared[d];
    if (a === undefined) continue;                 // undeclared → not compared
    const b = computed[d];
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > 1e-9) out.push({ dim: d, declared: a, computed: b });
    } else if (a !== b) out.push({ dim: d, declared: a, computed: b });
  }
  return out;
}
compare.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 2, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

/** Census src/: per-file count of functions whose declaration drifted. */
function censusDrift() {
  const { tokenize } = require('../src/audit/parser');
  const { extractAtomicProperties } = require('../src/atomic/property-extractor');
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f.endsWith('.js'));

  const byFile = {};
  const unparseable = [];
  const perDim = {};
  const detail = [];
  let total = 0, compared = 0, unresolved = 0;

  for (const rel of files) {
    let code;
    try { code = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    let toks;
    try { toks = tokenize(code); } catch { toks = null; }
    // A census cannot vouch for a file it cannot read (silent-catch, trap 28).
    if (!toks) { unparseable.push(rel); continue; }
    const ex = toks.filter((t) => t.type !== 'comment');

    for (let i = 0; i < ex.length - 3; i++) {
      if (!(ex[i].type === 'identifier' && ex[i + 1].value === '.' &&
            ex[i + 2].value === 'atomicProperties' && ex[i + 3].value === '=')) continue;
      const name = ex[i].value;
      const sp = braceSpan(ex, i + 4);
      if (!sp) { unresolved++; continue; }
      let declared;
      try { declared = JSON.parse(toJson(code.slice(sp[0], sp[1]))); }
      catch { unresolved++; continue; }
      const body = functionBody(ex, code, name);
      if (!body) { unresolved++; continue; }

      compared++;
      const computed = extractAtomicProperties(body);
      const diffs = compare(declared, computed);
      if (diffs.length) {
        byFile[rel] = (byFile[rel] || 0) + 1;
        total++;
        for (const x of diffs) perDim[x.dim] = (perDim[x.dim] || 0) + 1;
        // the literal's span in the file, so --sync can rewrite exactly it
        detail.push({ file: rel, name, diffs, computed, span: sp });
      }
    }
  }
  return { byFile, total, compared, unresolved, unparseable, perDim, detail };
}
censusDrift.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

/**
 * Object literal → JSON, without eval.
 *
 * The declarations are literal data — bare keys, single quotes, a trailing
 * comma. Reading them with eval would hand arbitrary source to the
 * interpreter inside a security gate, which is the shape the covenant
 * scanner exists to refuse. Quote the keys, swap the quotes, drop the
 * trailing commas, then JSON.parse.
 */
function toJson(src) {
  return src
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/'([^'\\]*)'/g, '"$1"')
    .replace(/,(\s*[}\]])/g, '$1');
}
toJson.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 11, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'transform',
};

function loadBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return null; }
}
loadBaseline.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** One canonical declaration literal from a computed identity (the DIMS, in order). */
function literalOf(computed) {
  return '{ ' + DIMS.map((d) => `${d}: ${JSON.stringify(computed[d])}`).join(', ') + ' }';
}
literalOf.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * AUTOMATIC GROWTH. Declarations are the code's self-knowledge, and the
 * extractor is what measures it — so a declaration is never typed by hand:
 *   --sync   rewrite every drifted declaration to what the extractor computes
 *            over the function's own body (the identity this gate holds it to)
 *   --grow   add a declaration to every top-level `function NAME(` in src/
 *            that has none, computed the same way — more signatures, so the
 *            census sees more of the code
 * Every write goes through the covenant gate. Sizes are the size ratchet's
 * business: a monolith that cannot carry its own signatures is the owner's
 * decomposition, not this script's silence.
 */
function syncAndGrow(current, doSync, doGrow) {
  const { tokenize } = require('../src/audit/parser');
  const { extractAtomicProperties } = require('../src/atomic/property-extractor');
  const touched = new Map();   // rel → code
  const load = (rel) => touched.has(rel) ? touched.get(rel) : fs.readFileSync(path.join(ROOT, rel), 'utf8');
  let synced = 0, grown = 0;
  if (doSync) {
    const byFile = {};
    for (const d of current.detail) (byFile[d.file] = byFile[d.file] || []).push(d);
    for (const [rel, items] of Object.entries(byFile)) {
      let code = load(rel);
      for (const d of items.sort((a, b) => b.span[0] - a.span[0])) {   // from the end, so spans stay valid
        code = code.slice(0, d.span[0]) + literalOf(d.computed) + code.slice(d.span[1]);
        synced++;
      }
      touched.set(rel, code);
    }
  }
  if (doGrow) {
    const files = execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.js'));
    for (const rel of files) {
      let code = load(rel);
      const declared = new Set([...code.matchAll(/^\s*([A-Za-z_$][\w$]*)\.atomicProperties\s*=/gm)].map((m) => m[1]));
      const adds = [];
      const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
      let m;
      while ((m = re.exec(code)) !== null) {
        const name = m[1];
        if (declared.has(name)) continue;
        // the function's closing brace at column 0 — the house layout for top-level functions
        const close = code.indexOf('\n}\n', m.index);
        if (close < 0) continue;
        adds.push({ name, at: close + 3, start: m.index });
      }
      if (!adds.length) continue;
      let toks;
      try { toks = tokenize(code).filter((t) => t.type !== 'comment'); } catch { continue; }
      for (const a of adds.sort((x, y) => y.at - x.at)) {
        const body = functionBody(toks, code, a.name);
        if (!body) continue;
        code = code.slice(0, a.at) + `${a.name}.atomicProperties = ${literalOf(extractAtomicProperties(body))};\n` + code.slice(a.at);
        grown++;
      }
      touched.set(rel, code);
    }
  }
  for (const [rel, code] of touched) _writeBaseline(_sealedGate(), path.join(ROOT, rel), code);
  return { synced, grown, files: touched.size };
}
syncAndGrow.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 0, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  const current = censusDrift();

  if (argv.includes('--sync') || argv.includes('--grow')) {
    const r = syncAndGrow(current, argv.includes('--sync'), argv.includes('--grow'));
    console.log(`[atomic-drift] ${r.synced} declaration(s) synced to the computed identity, ${r.grown} added, ${r.files} file(s) written — re-run to see the census, then --save-baseline to ratchet down`);
    return 0;
  }

  if (argv.includes('--report')) {
    console.log('== declared vs computed atomic identity ==');
    console.log(`  compared:   ${current.compared}`);
    console.log(`  agreeing:   ${current.compared - current.total}`);
    console.log(`  drifted:    ${current.total}` +
      (current.compared ? `  (${((current.total / current.compared) * 100).toFixed(1)}%)` : ''));
    console.log(`  unresolved: ${current.unresolved}  (no body found / not a literal)`);
    console.log('\n  drift by dimension:');
    Object.entries(current.perDim).sort((a, b) => b[1] - a[1])
      .forEach(([d, n]) => console.log(`    ${String(n).padStart(5)}  ${d}`));
    return 0;
  }

  if (argv.includes('--save-baseline')) {
    const prev = loadBaseline();
    // THE LAW: drift only shrinks. New or grown drift and unreadable files are DEBT.
    if (prev) {
      const debt = [];
      for (const [f, n] of Object.entries(current.byFile)) {
        const base = prev.byFile[f];
        if (base === undefined) debt.push(`NEW drifting file: ${f} (${n})`);
        else if (n > base) debt.push(`GREW: ${f} ${base} -> ${n}`);
      }
      for (const f of current.unparseable || []) debt.push(`UNPARSEABLE: ${f}`);
      if (refuseIfLoosening('atomic-drift', debt, argv)) return 1;
    }
    const data = JSON.stringify({
      note: 'atomic-drift baseline — functions whose declared atomicProperties disagree with extractAtomicProperties over their own body, per file. Shrink-only: re-measure and correct the DECLARATION, never loosen the comparison.',
      savedAt: new Date().toISOString(),
      total: current.total,
      compared: current.compared,
      byFile: current.byFile,
    }, null, 1) + '\n';
    _writeBaseline(_sealedGate(), BASELINE_PATH, data);
    console.log(`[atomic-drift] baseline saved: ${prev ? prev.total : 'none'} -> ${current.total} drifted of ${current.compared} compared, in ${Object.keys(current.byFile).length} files`);
    return 0;
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error('[atomic-drift] no baseline — run --save-baseline first');
    return 1;
  }

  const grown = [], fresh = [];
  for (const [f, n] of Object.entries(current.byFile)) {
    const base = baseline.byFile[f];
    if (base === undefined) fresh.push({ f, n });
    else if (n > base) grown.push({ f, n, base });
  }
  const unparseable = current.unparseable || [];
  const ok = !grown.length && !fresh.length && unparseable.length === 0;

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      ok, total: current.total, compared: current.compared,
      baseline: baseline.total, fresh, grown, unparseable,
    }, null, 1));
    return ok ? 0 : 1;
  }
  if (ok) {
    console.log(`[atomic-drift] ✓ holds — ${current.total} of ${current.compared} declarations drift from their computed identity (baseline ${baseline.total})`);
    if (current.total < baseline.total) console.log('  the drift shrank — run --save-baseline to ratchet down');
    return 0;
  }
  if (unparseable.length) {
    console.error('[atomic-drift] ✗ BLOCKED — files the tokenizer cannot read:');
    for (const f of unparseable) console.error(`  UNPARSEABLE: ${f}`);
  }
  if (grown.length || fresh.length) {
    console.error('[atomic-drift] ✗ BLOCKED — a declaration drifted further from its own body:');
    for (const g of fresh) console.error(`  NEW drifting file: ${g.f} (${g.n})`);
    for (const g of grown) console.error(`  ${g.f}: ${g.base} -> ${g.n}`);
    console.error('  run --report to see which dimensions disagree, then correct the DECLARATION to what the extractor measures.');
  }
  return 1;
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

if (require.main === module) process.exit(main());
module.exports = { censusDrift, compare, toJson };
