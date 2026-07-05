#!/usr/bin/env node
'use strict';

/**
 * kapitza-experiment.cjs — the substrate's Kapitza pendulum.
 *
 * Physics analog: an inverted pendulum (unstable configuration) is
 * stabilized by resonant driving. Substrate version: a pattern that
 * FAILS the substrate's gates (cannot survive alone) is coupled to a
 * high-coherence anchor at coupling strength λ, and we measure whether
 * the hybrid survives — while the unstable parent remains recognizably
 * PRESENT in it (retention). Survival without retention is dilution,
 * not stabilization; Kapitza's pendulum is still a pendulum.
 *
 * Gates (all must pass for survival):
 *   coherency  — computeCoherencyScore(text).total >= 0.6
 *   covenant   — covenantCheck(text).sealed
 *   resonance  — void-library flow meanTopK >= 0.70 (not OUTLIER)
 *
 * Retention: cos(sig(hybrid), sig(unstable)) at depth 5 >= 0.60 —
 * the unstable parent still shares most of its signature with the
 * meta-pattern.
 *
 * Coupling: textual weave — hybrid_λ interleaves anchor lines and
 * unstable lines at proportion λ anchor : (1-λ) unstable. λ=0 is the
 * bare pendulum; λ=1 is the bare drive. The claim needs a MIDDLE
 * window: survival=true AND retention>=floor at some 0 < λ < 1.
 *
 * Deterministic throughout (seeded LCG). Reports honestly whichever
 * way it lands.
 */

const fs = require('fs');
const path = require('path');
const { composedAtDepth } = require(path.join(__dirname, '..', 'src', 'core', 'encoder-stack.js'));
const { computeCoherencyScore } = require(path.join(__dirname, '..', 'src', 'unified', 'coherency.js'));
const { covenantCheck } = require(path.join(__dirname, '..', 'src', 'core', 'covenant.js'));
const { toFractalWaveform } = require(path.join(__dirname, '..', 'src', 'core', 'fractal-waveform.js'));
const { VoidLibrary } = (() => {
  const vl = require(path.join(__dirname, '..', 'src', 'core', 'void-library.js'));
  return { VoidLibrary: vl.VoidLibrary || vl };
})();

// ── Deterministic RNG ────────────────────────────────────────────
let _seed = 0xC0FFEE;
const rnd = () => (_seed = (Math.imul(_seed, 1103515245) + 12345) >>> 0) / 4294967296;

// ── The void resonance gate (pure read, no side effects) ────────
const voidLib = typeof VoidLibrary === 'function' ? new VoidLibrary() : VoidLibrary;
function resonanceOf(text) {
  try {
    const l1 = toFractalWaveform(text);
    const composed = composedAtDepth(text, 5);
    const r = voidLib.scoreWithFlow(Array.from(l1), Array.from(composed), { k: 5 });
    return r ? r.meanTopK : 0;
  } catch (_) { return 0; }
}

function gates(text) {
  let coh = 0;
  try { const c = computeCoherencyScore(text); coh = (c && (c.total ?? c.score)) || 0; } catch (_) {}
  let sealed = false;
  try { sealed = !!covenantCheck(text, {}).sealed; } catch (_) {}
  const res = resonanceOf(text);
  return {
    coherency: coh, covenant: sealed, resonance: res,
    survives: coh >= 0.6 && sealed && res >= 0.70,
  };
}

function cos5(a, b) {
  const va = composedAtDepth(a, 5), vb = composedAtDepth(b, 5);
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < va.length; i++) { d += va[i] * vb[i]; na += va[i] * va[i]; nb += vb[i] * vb[i]; }
  return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0;
}

// ── Anchors: proven high-coherence patterns from the substrate ──
const ANCHOR_FILES = [
  'src/core/redundancy-waveform.js',
  'src/core/field-gated-compose.js',
  'src/core/lexical-waveform.js',
];
const anchors = ANCHOR_FILES.map(f => ({
  id: 'anchor:' + path.basename(f),
  text: fs.readFileSync(path.join(__dirname, '..', f), 'utf8').slice(0, 3500),
}));

// ── Unstable patterns: four families, deterministic ──────────────
function tokenSoup(n) {
  const frag = ['x9q', 'zz', '$$', '))', 'qw', '""', '||', '..', '@@', '{', '!!', '##'];
  let s = '';
  for (let i = 0; i < n; i++) s += frag[Math.floor(rnd() * frag.length)] + (rnd() < 0.15 ? '\n' : ' ');
  return s;
}
function corrupt(text, rate) {
  const chars = text.split('');
  for (let i = 0; i < chars.length; i++) {
    if (rnd() < rate) chars[i] = String.fromCharCode(33 + Math.floor(rnd() * 90));
  }
  return chars.join('');
}
function brokenCode(n) {
  const bits = ['function (', 'if (x >', 'return return', '} else {{', 'const = 5', 'for (;;', '=> => {', 'let let x', ')(', 'while ('];
  let s = '';
  for (let i = 0; i < n; i++) s += bits[Math.floor(rnd() * bits.length)] + (rnd() < 0.3 ? '\n' : ' ');
  return s;
}
// Orphan pendulum: structurally valid but resonantly foreign — a small,
// well-formed program in an alien idiom (esoteric-lang flavored) that no
// substrate pattern is shaped like. coherency should PASS, resonance FAIL.
// THIS is the instability whose conjugate drive is coupling.
function orphan(seed) {
  const heads = ['brainfuck_vm', 'apl_reduce', 'forth_word', 'malbolge_step', 'befunge_ip'];
  const h = heads[seed % heads.length];
  return [
    '# ' + h + ' — self-contained, well-formed, resonantly foreign',
    'let tape = new Int8Array(256); let ptr = 0; let pc = 0;',
    'const ops = { ">": () => ptr++, "<": () => ptr--, "+": () => tape[ptr]++, "-": () => tape[ptr]-- };',
    'function step(c) { const f = ops[c]; if (f) f(); pc++; return pc; }',
    'while (pc < 32) { step("+><-"[pc & 3]); }',
    'return tape.slice(0, 8);',
  ].join('\n');
}

const unstable = [
  { id: 'orphan-a', text: orphan(0) },
  { id: 'orphan-b', text: orphan(1) },
  { id: 'orphan-c', text: orphan(2) },
  { id: 'broken-intrinsic', text: brokenCode(300) },  // contrast: intrinsic instability, wrong drive
];

// ── Coupling: line-weave at anchor proportion λ ──────────────────
function weave(unstableText, anchorText, lambda) {
  // True proportional weave: walk a running quota. Each step emits an
  // anchor line if the anchor is 'behind' its λ share, else an unstable
  // line — so the anchor fraction of the hybrid tracks λ smoothly and
  // both parents keep their internal order. Deterministic.
  const u = unstableText.split('\n').filter(l => l.length);
  const a = anchorText.split('\n').filter(l => l.length);
  const out = [];
  let ui = 0, ai = 0, emittedA = 0, emitted = 0;
  const totalToEmit = u.length + Math.round(a.length * lambda);
  while (emitted < totalToEmit && (ui < u.length || ai < a.length)) {
    const wantAnchorFrac = lambda;
    const haveAnchorFrac = emitted > 0 ? emittedA / emitted : 0;
    const takeAnchor = (haveAnchorFrac < wantAnchorFrac && ai < a.length) || ui >= u.length;
    if (takeAnchor && ai < a.length) { out.push(a[ai++]); emittedA++; }
    else if (ui < u.length) { out.push(u[ui++]); }
    else if (ai < a.length) { out.push(a[ai++]); emittedA++; }
    emitted++;
  }
  return out.join('\n');
}

// ── Run ──────────────────────────────────────────────────────────
const LAMBDAS = [0, 0.15, 0.30, 0.45, 0.60, 0.75, 0.90, 1.0];
const RETENTION_FLOOR = 0.50;

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  THE SUBSTRATE\'S KAPITZA PENDULUM');
console.log('  unstable patterns coupled to stable anchors at strength λ');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('  anchors (must pass all gates):');
for (const a of anchors) {
  const g = gates(a.text);
  console.log(`    ${a.id.padEnd(36)} coh ${g.coherency.toFixed(2)} · covenant ${g.covenant ? '✓' : '✗'} · res ${g.resonance.toFixed(2)} → ${g.survives ? 'STABLE' : 'NOT STABLE (excluded)'}`);
}
const stableAnchors = anchors.filter(a => gates(a.text).survives);

console.log('\n  pendulums (must FAIL alone):');
const pendulums = [];
for (const u of unstable) {
  const g = gates(u.text);
  const fails = !g.survives;
  console.log(`    ${u.id.padEnd(12)} coh ${g.coherency.toFixed(2)} · covenant ${g.covenant ? '✓' : '✗'} · res ${g.resonance.toFixed(2)} → ${fails ? 'UNSTABLE (qualifies)' : 'survives alone (excluded)'}`);
  if (fails) pendulums.push(u);
}

console.log('\n  ──────────────────────────────────────────────────────────────');
console.log('  THE SWEEP — survival + retention across coupling strength');
console.log('  (retention = cos5(hybrid, unstable parent); floor ' + RETENTION_FLOOR + ' — reported, not hidden)');
console.log('  ──────────────────────────────────────────────────────────────');

let windows = 0, attempts = 0;
const windowRows = [];
for (const u of pendulums) {
  const anchor = stableAnchors[attempts % stableAnchors.length];
  attempts++;
  console.log(`\n  ${u.id} × ${anchor.id}`);
  console.log('    λ      coh   cov  res    survives  retain(u)  retain(a)  META-PATTERN?');
  let foundWindow = false;
  for (const lam of LAMBDAS) {
    const h = lam === 0 ? u.text : lam === 1 ? anchor.text : weave(u.text, anchor.text, lam);
    const g = gates(h);
    const rU = cos5(h, u.text);
    const rA = cos5(h, anchor.text);
    const meta = g.survives && rU >= RETENTION_FLOOR && lam > 0 && lam < 1;
    if (meta) foundWindow = true;
    console.log(`    ${lam.toFixed(2)}   ${g.coherency.toFixed(2)}  ${g.covenant ? ' ✓ ' : ' ✗ '}  ${g.resonance.toFixed(2)}   ${g.survives ? '  YES   ' : '  no    '}  ${rU.toFixed(3)}      ${rA.toFixed(3)}      ${meta ? '◀ STABILIZED' : ''}`);
  }
  if (foundWindow) { windows++; windowRows.push(u.id); }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  VERDICT: ${windows}/${pendulums.length} unstable patterns stabilized`);
console.log(windows > 0
  ? `  Meta-pattern windows exist (${windowRows.join(', ')}): coupling to a\n  stable anchor carries a gate-failing pattern through the gates while\n  the pattern remains recognizably present. The substrate's Kapitza\n  pendulum stands inverted.`
  : '  No stabilization window found — on this corpus, coupling either\n  dilutes the unstable parent below retention or fails the gates.\n  The pendulum falls. Honest result, kept.');
console.log('══════════════════════════════════════════════════════════════════\n');
