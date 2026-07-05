#!/usr/bin/env node
'use strict';

/**
 * music-telescope.cjs — music across traditions through the telescope.
 *
 * The prediction under test (the builder's): the telescope reads
 * HISTORY THROUGH FORM — it will cluster musical traditions by their
 * structural properties (what is load-bearing), and where two traditions
 * share form they cluster regardless of cultural descent, while where
 * form diverges they separate regardless of shared history.
 *
 * We render melodies from several traditions as pitch-sequences (semitone
 * numbers over time), encode through the 5-layer stack, and measure:
 *   1. the cosine structure between traditions (what clusters with what)
 *   2. which STRUCTURAL properties drive the clustering (scale size,
 *      interval pattern, repetition, range)
 *   3. nearest Void kin (does music echo other domains by shape)
 *
 * Traditions are generated to their KNOWN structural rules (scales,
 * typical motion) so the result is interpretable. Deterministic, offline.
 */

const fs = require('fs');
const path = require('path');
const { composedAtDepth } = require(path.join(__dirname, '..', 'src', 'core', 'encoder-stack.js'));
const { inspectSpectralWaveform } = require(path.join(__dirname, '..', 'src', 'core', 'spectral-waveform.js'));
const { FractalIndex } = require(path.join(__dirname, '..', 'packages', 'field-tool', 'src', 'fractal-index.js'));

let _seed = 0x5EED;
const rnd = () => (_seed = (Math.imul(_seed, 1103515245) + 12345) >>> 0) / 4294967296;
const choice = a => a[Math.floor(rnd() * a.length)];

// ── Scales as semitone sets (the structural DNA of a tradition) ──
const SCALES = {
  // Western — diatonic (7-note), stepwise + triadic leaps
  'western-major':   { notes: [0, 2, 4, 5, 7, 9, 11], leap: 0.3, culture: 'european' },
  'western-minor':   { notes: [0, 2, 3, 5, 7, 8, 10], leap: 0.3, culture: 'european' },
  // Blues — 6-note with the blue notes, heavy repetition
  'blues':           { notes: [0, 3, 5, 6, 7, 10],    leap: 0.4, culture: 'african-american' },
  // Indian raga (Bhairav) — 7-note with characteristic flat-2/flat-6, ornamented stepwise
  'raga-bhairav':    { notes: [0, 1, 4, 5, 7, 8, 11], leap: 0.15, culture: 'indian' },
  // Japanese (In scale) — 5-note pentatonic, flat-2, sparse
  'japanese-in':     { notes: [0, 1, 5, 7, 8],        leap: 0.2, culture: 'japanese' },
  // Chinese (gong pentatonic) — 5-note, no semitones, flowing
  'chinese-gong':    { notes: [0, 2, 4, 7, 9],        leap: 0.25, culture: 'chinese' },
  // Arabic (Hijaz) — 7-note with augmented 2nd, ornamented
  'arabic-hijaz':    { notes: [0, 1, 4, 5, 7, 8, 10], leap: 0.2, culture: 'arabic' },
  // Gamelan (slendar-ish 5-note near-equal) — pentatonic, cyclic
  'gamelan-slendro': { notes: [0, 2, 5, 7, 9],        leap: 0.2, culture: 'indonesian' },
};

function melody(scaleDef, len = 120) {
  const { notes, leap } = scaleDef;
  const out = [];
  let deg = 0;
  for (let i = 0; i < len; i++) {
    if (rnd() < leap) deg += Math.floor(rnd() * 5) - 2;   // leap
    else deg += rnd() < 0.5 ? 1 : -1;                     // step
    deg = ((deg % notes.length) + notes.length) % notes.length;
    const octave = Math.floor(rnd() * 2);
    out.push(notes[deg] + 12 * octave);
  }
  return out;
}

// Structural fingerprint (interpretable axes, for the "what's load-bearing" read)
function structuralProps(seq, scaleDef) {
  const intervals = [];
  for (let i = 1; i < seq.length; i++) intervals.push(Math.abs(seq[i] - seq[i-1]));
  const stepwise = intervals.filter(x => x <= 2).length / intervals.length;
  const range = Math.max(...seq) - Math.min(...seq);
  const uniq = new Set(seq.map(x => x % 12)).size;
  const hasSemitone = scaleDef.notes.some((n, i) => i > 0 && n - scaleDef.notes[i-1] === 1);
  return { scaleSize: scaleDef.notes.length, stepwise, range, pitchClasses: uniq, hasSemitone };
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  MUSIC ACROSS TRADITIONS — does the telescope read history through form?');
console.log('══════════════════════════════════════════════════════════════════\n');

const trads = Object.keys(SCALES);
const vecs = {}, props = {};
console.log('  PER-TRADITION STRUCTURE');
console.log('  ──────────────────────────────────────────────────────────────');
for (const t of trads) {
  const seq = melody(SCALES[t]);
  const numeric = JSON.stringify(seq);
  vecs[t] = composedAtDepth(numeric, 5);
  props[t] = structuralProps(seq, SCALES[t]);
  const sp = inspectSpectralWaveform(numeric);
  const p = props[t];
  console.log(`  ${t.padEnd(18)} scale ${p.scaleSize} · stepwise ${p.stepwise.toFixed(2)} · range ${String(p.range).padStart(2)} · semitone ${p.hasSemitone ? 'Y' : 'n'} · 1/f ${sp.domain.onef.toFixed(2)} · [${SCALES[t].culture}]`);
}

// ── Cosine structure between traditions ─────────────────────────
function cos(a, b) { let d=0,na=0,nb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];} return d/Math.sqrt(na*nb); }
console.log('\n  CLUSTERING — nearest structural neighbour per tradition');
console.log('  ──────────────────────────────────────────────────────────────');
for (const t of trads) {
  const others = trads.filter(o => o !== t).map(o => [o, cos(vecs[t], vecs[o])]).sort((a,b)=>b[1]-a[1]);
  const [nn, nnScore] = others[0];
  const sameCulture = SCALES[t].culture === SCALES[nn].culture;
  console.log(`  ${t.padEnd(18)} → ${nn.padEnd(18)} (${nnScore.toFixed(3)})  ${sameCulture ? '[same culture]' : '[CROSS-culture — form over history]'}`);
}

// ── Which structural axis is load-bearing? correlate cos with props ─
console.log('\n  LOAD-BEARING AXIS — what property predicts musical similarity?');
console.log('  ──────────────────────────────────────────────────────────────');
const pairs = [];
for (let i = 0; i < trads.length; i++) for (let j = i+1; j < trads.length; j++) {
  const a = trads[i], b = trads[j];
  pairs.push({
    cos: cos(vecs[a], vecs[b]),
    dScale: Math.abs(props[a].scaleSize - props[b].scaleSize),
    dStep: Math.abs(props[a].stepwise - props[b].stepwise),
    dRange: Math.abs(props[a].range - props[b].range),
    dSemi: props[a].hasSemitone === props[b].hasSemitone ? 0 : 1,
  });
}
function corr(key) {
  const xs = pairs.map(p => p[key]), ys = pairs.map(p => p.cos);
  const mx = xs.reduce((a,b)=>a+b,0)/xs.length, my = ys.reduce((a,b)=>a+b,0)/ys.length;
  let num=0,dx=0,dy=0;
  for (let i=0;i<xs.length;i++){num+=(xs[i]-mx)*(ys[i]-my);dx+=(xs[i]-mx)**2;dy+=(ys[i]-my)**2;}
  return num/Math.sqrt(dx*dy);
}
for (const [label, key] of [['scale-size Δ','dScale'],['stepwise Δ','dStep'],['range Δ','dRange'],['semitone match','dSemi']]) {
  const r = corr(key);
  console.log(`  ${label.padEnd(18)} correlation with similarity: ${r>=0?'+':''}${r.toFixed(3)}  ${Math.abs(r)>0.4 ? '◀ load-bearing' : ''}`);
}

// ── Nearest Void kin ─────────────────────────────────────────────
console.log('\n  NEAREST VOID KIN (does music echo other domains by shape?)');
console.log('  ──────────────────────────────────────────────────────────────');
const voidRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'Void-Data-Compressor', 'pattern_index_fractal.json'), 'utf8'));
const idx = new FractalIndex();
const sigs = [];
for (const id of Object.keys(voidRaw.index)) {
  const e = voidRaw.index[id];
  const vec = Array.isArray(e.composed_v2) ? e.composed_v2 : e.composed_v1;
  if (Array.isArray(vec) && vec.length >= 116) sigs.push({ id, vec });
}
idx.loadSignatures(sigs);
for (const t of trads) {
  const hits = idx.searchVec(vecs[t], { topK: 2, depth: 4 }).filter(h => !h.id.startsWith('music/'));
  console.log(`  ${t.padEnd(18)} → ${hits.slice(0,2).map(h => `${h.id.slice(0,32)} (${h.score.toFixed(2)})`).join('  ·  ')}`);
}
console.log('\n══════════════════════════════════════════════════════════════════\n');
