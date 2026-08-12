#!/usr/bin/env node
'use strict';

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
const { execSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

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
  const files = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
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
      const diffs = compare(declared, extractAtomicProperties(body));
      if (diffs.length) {
        byFile[rel] = (byFile[rel] || 0) + 1;
        total++;
        for (const x of diffs) perDim[x.dim] = (perDim[x.dim] || 0) + 1;
        detail.push({ file: rel, name, diffs });
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

function main() {
  const argv = process.argv.slice(2);
  const current = censusDrift();

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
