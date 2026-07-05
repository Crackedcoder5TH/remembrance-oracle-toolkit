#!/usr/bin/env node
'use strict';

/**
 * dna-telescope.cjs — point the substrate at DNA.
 *
 * DNA is a discrete symbolic code (A/C/G/T) that provably stores and
 * executes structure. It is the cleanest test of whether the telescope
 * reads BIOLOGICAL information the way it reads code and time-series.
 *
 * We encode several DNA sequence families through the full 5-layer
 * stack, then ask two things:
 *   1. WITHIN DNA: do functionally-different sequence types (coding,
 *      repetitive/satellite, regulatory-ish, random control) separate
 *      in signature space? (does the telescope SEE DNA structure)
 *   2. ACROSS DOMAINS: what in the 46k Void library does each DNA
 *      family most resemble? (what does DNA's information-shape echo)
 *
 * Sequences are deterministic and generated to KNOWN structure so the
 * result is interpretable — no live genome fetch (offline, reproducible).
 * The point is not biological accuracy; it is: does information-shape
 * track function.
 */

const fs = require('fs');
const path = require('path');
const { composedAtDepth } = require(path.join(__dirname, '..', 'src', 'core', 'encoder-stack.js'));
const { classifyAlignment } = require(path.join(__dirname, '..', 'src', 'core', 'abundance-classifier.js'));
const { inspectSpectralWaveform } = require(path.join(__dirname, '..', 'src', 'core', 'spectral-waveform.js'));
const { FractalIndex } = require(path.join(__dirname, '..', 'packages', 'field-tool', 'src', 'fractal-index.js'));

let _seed = 0xDA1234;   // (DNA wanted to be hex; only A-F allowed)
const rnd = () => (_seed = (Math.imul(_seed, 1103515245) + 12345) >>> 0) / 4294967296;
const BASES = ['A', 'C', 'G', 'T'];
const pick = w => { let r = rnd(); for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return BASES[i]; } return BASES[3]; };

// ── DNA family generators (known structure) ─────────────────────
function randomDNA(n) { let s = ''; for (let i = 0; i < n; i++) s += BASES[Math.floor(rnd() * 4)]; return s; }
function codingDNA(n) {
  // codon-structured: repeating 3-periodicity, GC-biased 3rd position —
  // the real hallmark of protein-coding DNA (used by gene finders).
  const codons = ['ATG', 'GAA', 'CTG', 'GCC', 'AAG', 'GAT', 'TTC', 'CAG', 'GGA', 'ACC'];
  let s = ''; for (let i = 0; i < n / 3; i++) s += codons[Math.floor(rnd() * codons.length)]; return s;
}
function satelliteDNA(n, unit) {
  // tandem repeat — highly redundant, like centromeric satellite DNA.
  const motif = randomDNA(unit); let s = ''; while (s.length < n) s += motif; return s.slice(0, n);
}
function gcRich(n) { let s = ''; for (let i = 0; i < n; i++) s += pick([0.1, 0.4, 0.4, 0.1]); return s; }
function atRich(n) { let s = ''; for (let i = 0; i < n; i++) s += pick([0.4, 0.1, 0.1, 0.4]); return s; }

// numeric embedding: map bases to a 2-bit-ish numeric stream so L3/L4
// (numerical/spectral) have signal — the same JSON-of-numbers convention
// the substrate's own cascade/* patterns use. Purine/pyrimidine + weak/strong.
function toNumericStream(seq) {
  const map = { A: 0, C: 1, G: 2, T: 3 };
  return JSON.stringify(Array.from(seq, b => map[b] ?? 0));
}

const families = [
  { id: 'dna:random',    seq: randomDNA(600) },
  { id: 'dna:coding',    seq: codingDNA(600) },
  { id: 'dna:satellite-6', seq: satelliteDNA(600, 6) },
  { id: 'dna:satellite-3', seq: satelliteDNA(600, 3) },
  { id: 'dna:gc-rich',   seq: gcRich(600) },
  { id: 'dna:at-rich',   seq: atRich(600) },
];

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  DNA THROUGH THE TELESCOPE — does information-shape track function?');
console.log('══════════════════════════════════════════════════════════════════\n');

// Encode each family two ways: raw letters (L1/L2 read it as text) and
// numeric stream (L3/L4 read the sequence dynamics). Compose both, average.
const vecs = {};
console.log('  PER-FAMILY READ  (alignment + spectral character of the numeric stream)');
console.log('  ──────────────────────────────────────────────────────────────');
for (const f of families) {
  const vText = composedAtDepth(f.seq, 5);
  const vNum = composedAtDepth(toNumericStream(f.seq), 5);
  const v = new Float64Array(vText.length);
  for (let i = 0; i < v.length; i++) v[i] = (vText[i] + vNum[i]) / 2;
  vecs[f.id] = v;
  const align = classifyAlignment(toNumericStream(f.seq));
  const sp = inspectSpectralWaveform(toNumericStream(f.seq));
  console.log(`  ${f.id.padEnd(18)} ${align.label.padEnd(18)} align ${align.alignment >= 0 ? '+' : ''}${align.alignment.toFixed(3)} · 1/f ${sp.domain.onef.toFixed(2)} · spectralEntropy ${sp.summary.spectralEntropy.toFixed(2)} · flatness ${sp.shape.flatness.toFixed(2)}`);
}

// ── WITHIN-DNA separation: cosine matrix ────────────────────────
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; } return d/Math.sqrt(na*nb); }
console.log('\n  WITHIN-DNA SEPARATION  (cosine between families — does function separate?)');
console.log('  ──────────────────────────────────────────────────────────────');
const ids = families.map(f => f.id);
process.stdout.write('  '.padEnd(20));
for (const b of ids) process.stdout.write(b.replace('dna:', '').slice(0, 8).padStart(9));
console.log();
for (const a of ids) {
  process.stdout.write('  ' + a.replace('dna:', '').padEnd(18));
  for (const b of ids) process.stdout.write(cos(vecs[a], vecs[b]).toFixed(2).padStart(9));
  console.log();
}

// ── ACROSS-DOMAIN: nearest Void kin ─────────────────────────────
console.log('\n  NEAREST KIN IN THE 46k VOID  (what does DNA\'s shape echo?)');
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
for (const f of families) {
  const hits = idx.searchVec(vecs[f.id], { topK: 3, depth: 4 });
  console.log(`  ${f.id.padEnd(18)} → ${hits.map(h => `${h.id.slice(0, 34)} (${h.score.toFixed(2)})`).join('  ·  ')}`);
}
console.log('\n══════════════════════════════════════════════════════════════════\n');
