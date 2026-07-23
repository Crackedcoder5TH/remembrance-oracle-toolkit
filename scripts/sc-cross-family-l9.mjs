// sc-cross-family-l9.mjs — the second activation receipt: cross-family superconductor Tc
// transfer WITH L9 in the loop. The universality claim is that ONE lens moves BOTH the PPI
// test and cross-family SC — because "which host binds which pattern" is the identity axis
// in both. Cross-family transfer (predict a whole family's Tc with zero labels from it) was
// ~0 with composition features. Here each material is serialized as its ELEMENT tokens
// (constituents repeated by stoichiometry — the relational "which elements co-occur"
// structure), encoded at depth 8 (shape) vs depth 9 (+L9 community), and family-held-out Tc
// is predicted by signature kNN. If L9's relational reading lifts cross-family transfer
// above the shape stack, that is the receipt. Honest either way.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ENC = require('../src/core/encoder-stack');
const { relationalGain } = require('../src/core/relational-waveform');

const DIR = process.env.SC_DATA_DIR || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';
const tr = fs.readFileSync(path.join(DIR, 'train.csv'), 'utf8').trim().split('\n');
const un = fs.readFileSync(path.join(DIR, 'unique_m.csv'), 'utf8').trim().split('\n');
const F = tr[0].split(',').length - 1;
const Tc = tr.slice(1).map((r) => +r.split(',')[F]);
const uh = un[0].split(',').map((s) => s.replace(/"/g, ''));
const urows = un.slice(1).map((r) => r.split(','));
const elements = uh.slice(0, uh.indexOf('material') >= 0 ? uh.indexOf('material') : uh.length).filter((h) => /^[A-Z][a-z]?$/.test(h));
const eIdx = elements.map((e) => uh.indexOf(e));
const iCu = uh.indexOf('Cu'), iO = uh.indexOf('O'), iFe = uh.indexOf('Fe');
const family = urows.map((r) => (+r[iCu] > 0 && +r[iO] > 0) ? 'cuprate' : (+r[iFe] > 0) ? 'iron' : 'other');
const N = Math.min(Tc.length, urows.length);
console.log('SC CROSS-FAMILY WITH L9 — ' + N + ' materials · ' + elements.length + ' elements · family-held-out Tc transfer\n');

// serialize a material as its element tokens, repeated by stoichiometry (relational structure)
function elemSeq(i) {
  const r = urows[i]; const toks = [];
  for (let k = 0; k < elements.length; k++) { const f = +r[eIdx[k]]; if (f > 0) { const reps = Math.max(1, Math.round(f * 4)); for (let t = 0; t < reps && t < 12; t++) toks.push(elements[k]); } }
  return toks.join(' ');
}
const seqs = []; for (let i = 0; i < N; i++) seqs.push(elemSeq(i));
const gains = seqs.map(relationalGain);
const meanGain = gains.reduce((a, b) => a + b, 0) / gains.length;
console.log('  mean L9 gain on element sequences: ' + meanGain.toFixed(3) + '   (how much per-material relational structure L9 finds)\n');

const sig8 = seqs.map((s) => Array.from(ENC.composedAtDepth(s, 8)));
const sig9 = seqs.map((s) => Array.from(ENC.composedAtDepth(s, 9)));
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }

// FAMILY-HELD-OUT: train on all materials NOT in family fam, predict fam's Tc via signature kNN
function transfer(sig, fam, k = 12) {
  const train = []; for (let i = 0; i < N; i++) if (family[i] !== fam) train.push(i);
  const test = []; for (let i = 0; i < N; i++) if (family[i] === fam) test.push(i);
  if (test.length < 20) return null;
  // subsample train for speed (deterministic stride)
  const trS = train.filter((_, idx) => idx % 3 === 0);
  const pred = [], truth = [];
  for (const ti of test) { const q = sig[ti]; const near = []; for (const tj of trS) near.push([cos(q, sig[tj]), Tc[tj]]); near.sort((a, b) => b[0] - a[0]); const top = near.slice(0, k); pred.push(top.reduce((s, n) => s + n[1], 0) / k); truth.push(Tc[ti]); }
  return corr(pred, truth);
}

console.log('  family      depth-8 (shape)   depth-9 (+L9)   Δ');
const fams = ['cuprate', 'iron', 'other']; const rows = [];
for (const fam of fams) {
  const c8 = transfer(sig8, fam), c9 = transfer(sig9, fam);
  if (c8 === null) { console.log('  ' + fam.padEnd(11) + '(too few)'); continue; }
  rows.push({ fam, c8, c9, d: c9 - c8 });
  console.log('  ' + fam.padEnd(11) + c8.toFixed(3).padEnd(17) + c9.toFixed(3).padEnd(15) + (c9 - c8 >= 0 ? '+' : '') + (c9 - c8).toFixed(3));
}
const mean8 = rows.reduce((a, r) => a + r.c8, 0) / rows.length;
const mean9 = rows.reduce((a, r) => a + r.c9, 0) / rows.length;
const lifts = mean9 > mean8 + 0.03 && meanGain > 0.05;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  mean cross-family transfer: depth-8 ' + mean8.toFixed(3) + ' → depth-9 ' + mean9.toFixed(3) + '   Δ=' + (mean9 - mean8 >= 0 ? '+' : '') + (mean9 - mean8).toFixed(3));
console.log('  ' + (lifts
  ? 'L9 LIFTS cross-family transfer: the element-relational reading carries Tc structure across families the shape stack misses. The universality claim (one lens, both domains) gets its SC receipt.'
  : (meanGain < 0.05
    ? 'L9 IS NEARLY SILENT on SC: a single material’s element set has little community structure to read (mean gain ' + meanGain.toFixed(2) + '), so L9 adds ~nothing here. Honest boundary — the lens fires where inputs have INTERNAL relational structure (graphs/networks), which per-material composition does not. Recorded honestly.'
    : 'NO LIFT on cross-family transfer (Δ=' + (mean9 - mean8).toFixed(3) + '): L9 does not carry cross-family Tc structure past the shape stack here. Recorded honestly.')));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/sc-cross-family-l9.json', JSON.stringify({ rows, mean8, mean9, delta: mean9 - mean8, meanGain, lifts: +lifts }, null, 2));
console.log('\n(reported as measured — real UCI/Hamidieh superconductors; element-token serialization; depth-8 vs depth-9; family-held-out.)');
