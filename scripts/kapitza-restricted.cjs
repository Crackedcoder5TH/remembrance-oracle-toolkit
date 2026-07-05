#!/usr/bin/env node
'use strict';

/**
 * kapitza-restricted.cjs — completing the Kapitza pendulum.
 *
 * The full-corpus run proved coupling stabilizes RELATIONAL instability
 * (resonance) but not INTRINSIC instability (coherency), and that the
 * 46k library's coverage is so broad that genuine relational orphans
 * are rare (everything found kinship, resonated ~0.91, survived undriven).
 *
 * This run supplies the missing condition: a RESTRICTED anchor corpus —
 * a small, single-domain index. Against it, a pattern from a FOREIGN
 * domain is genuinely orphaned (resonates with nothing) while remaining
 * internally well-formed (coherency passes). That is the relational
 * instability whose CONJUGATE drive is coupling. Prediction: coupling a
 * foreign-but-well-formed pattern to an in-domain anchor lifts its
 * resonance above the gate while retention holds — the pendulum reaches
 * vertical.
 *
 * Resonance here = mean top-K cosine against the RESTRICTED index (not
 * the 46k Void) — that's what makes orphanhood achievable and the drive
 * conjugate. Deterministic, offline.
 */

const fs = require('fs');
const path = require('path');
const { composedAtDepth } = require(path.join(__dirname, '..', 'src', 'core', 'encoder-stack.js'));
const { FractalIndex } = require(path.join(__dirname, '..', 'packages', 'field-tool', 'src', 'fractal-index.js'));

// ── Restricted anchor corpus: ONE narrow domain (JS utility fns) ──
// Small + homogeneous, so a foreign pattern is genuinely orphaned.
const ANCHOR_DOMAIN = [
  `function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }`,
  `function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }`,
  `function memoize(fn) { const c = new Map(); return x => c.has(x) ? c.get(x) : c.set(x, fn(x)).get(x); }`,
  `function range(n) { return Array.from({ length: n }, (_, i) => i); }`,
  `function last(arr) { return arr[arr.length - 1]; }`,
  `function uniq(arr) { return [...new Set(arr)]; }`,
  `function sum(arr) { return arr.reduce((a, b) => a + b, 0); }`,
  `function pipe(...fns) { return x => fns.reduce((v, f) => f(v), x); }`,
];

const idx = new FractalIndex();
idx.loadSignatures(ANCHOR_DOMAIN.map((t, i) => ({ id: 'jsutil:' + i, vec: Array.from(composedAtDepth(t, 5)) })));

// Resonance against the RESTRICTED corpus (mean of top-3 cosines).
function resonance(text) {
  const q = composedAtDepth(text, 5);
  const hits = idx.searchVec(q, { topK: 3, depth: 5 });
  if (!hits.length) return 0;
  return hits.reduce((s, h) => s + h.score, 0) / hits.length;
}
function cos5(a, b) {
  const va = composedAtDepth(a, 5), vb = composedAtDepth(b, 5);
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < va.length; i++) { d += va[i]*vb[i]; na += va[i]*va[i]; nb += vb[i]*vb[i]; }
  return d/Math.sqrt(na*nb);
}

// ── The orphan pendulum: well-formed, but from a FOREIGN domain ──
// A haiku — internally coherent English prose, resonates with JS utils
// near-zero. Internally stable, relationally unstable. The exact case.
// A pure numeric time-series (oscillation) as JSON — L3/L4-dominant,
// zero code/prose shape. Against a JS-utility corpus this is genuinely
// foreign: internally well-formed (valid, structured) but resonating
// with nothing in the anchor domain. The true relational orphan.
const ORPHAN = JSON.stringify(
  Array.from({ length: 80 }, (_, i) => +(50 + 20 * Math.sin(i / 3) + 5 * Math.sin(i / 1.7)).toFixed(3))
);

const RES_GATE = 0.70;       // resonance survival threshold
const RETAIN_FLOOR = 0.50;   // parent must remain present

// Anchor to drive with — the most in-domain, highest internal coherence.
const ANCHOR = ANCHOR_DOMAIN[1]; // debounce — rich, idiomatic

function weave(orphan, anchor, lambda) {
  // Proportional weave. Orphan (one JSON line) is chunked into numeric
  // fragments; anchor is clause-split. Coupling interleaves them.
  const nums = JSON.parse(orphan);
  const chunk = 8;
  const u = [];
  for (let i = 0; i < nums.length; i += chunk) u.push(JSON.stringify(nums.slice(i, i + chunk)));
  const a = anchor.split(/(?<=;|\})\s*/).filter(l => l.trim().length); // clause-split the one-liner
  const out = []; let ui = 0, ai = 0, ea = 0, e = 0;
  const total = u.length + Math.round(a.length * lambda);
  while (e < total && (ui < u.length || ai < a.length)) {
    const take = (e > 0 ? ea / e : 0) < lambda && ai < a.length || ui >= u.length;
    if (take && ai < a.length) { out.push(a[ai++]); ea++; }
    else if (ui < u.length) { out.push(u[ui++]); }
    else if (ai < a.length) { out.push(a[ai++]); ea++; }
    e++;
  }
  return out.join('\n');
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  KAPITZA, RESTRICTED CORPUS — the relational orphan, conjugate drive');
console.log('══════════════════════════════════════════════════════════════════\n');
console.log(`  restricted anchor corpus: ${ANCHOR_DOMAIN.length} JS utility functions`);
console.log(`  orphan (foreign domain, internally well-formed): a haiku\n`);

const orphanRes = resonance(ORPHAN);
console.log('  PENDULUM CHECK (must be relationally unstable, not intrinsically):');
console.log(`    orphan resonance vs restricted corpus: ${orphanRes.toFixed(3)} → ${orphanRes < RES_GATE ? 'ORPHANED (qualifies — resonates with nothing)' : 'not orphaned'}`);

console.log('\n  THE SWEEP — resonance driven by coupling; retention held?');
console.log('  ──────────────────────────────────────────────────────────────');
console.log('    λ      resonance  survives(≥' + RES_GATE + ')  retain(orphan)  META-PATTERN?');
let window = false;
const LAMBDAS = [0, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90, 1.0];
for (const lam of LAMBDAS) {
  const h = lam === 0 ? ORPHAN : lam === 1 ? ANCHOR : weave(ORPHAN, ANCHOR, lam);
  const res = resonance(h);
  const ret = cos5(h, ORPHAN);
  const surv = res >= RES_GATE;
  const meta = surv && ret >= RETAIN_FLOOR && lam > 0 && lam < 1;
  if (meta) window = true;
  console.log(`    ${lam.toFixed(2)}   ${res.toFixed(3)}      ${surv ? ' YES ' : ' no  '}          ${ret.toFixed(3)}          ${meta ? '◀ STABILIZED' : ''}`);
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(window
  ? '  ✓ THE PENDULUM REACHES VERTICAL. A relationally-unstable pattern\n  (well-formed but orphaned) is carried above the resonance gate by\n  coupling to an in-domain anchor, while remaining recognizably itself.\n  Coupling is the CONJUGATE drive for relational instability — Kapitza,\n  confirmed for the degree of freedom the drive actually acts on.'
  : '  The window did not open on this configuration — record and refine.');
console.log('══════════════════════════════════════════════════════════════════\n');
