// domain-separability-benchmark.mjs — a pure information measurement, no interpretation.
// Question: in the instrument's own WHITENED resonance space, are patterns from different
// domains locally distinguishable, or mixed? Measured by k-nearest-neighbour domain purity
// (fraction of a pattern's k nearest neighbours from its OWN domain).
// Control (the correct one): LABEL-SHUFFLE — same patterns, random fake-domain labels. This
// keeps the encoder geometry/cone and measures the baseline mixing. Genuine domain structure
// = real purity - fake purity. Reported as measured; no meaning assigned.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('.', import.meta.url).pathname + '../');
const W = require('./src/core/whitening');
const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(VOID + '/pattern_index_fractal.json', 'utf8')).index;
const DIM = 116;

// --cohort <substr,...> : instead of grouping by name-prefix domain, label every
// pattern generated (name matches a term) vs collected, and measure whether the
// GENERATED cohort separates in the SAME whitened space + shuffle-null. This is the
// de-saturated answer the raw resonance-cluster (the cone, everything ~0.99) can't give.
const argv = process.argv.slice(2);
const COHORT = argv.includes('--cohort')
  ? (argv[argv.indexOf('--cohort') + 1] || 'noise').toLowerCase().split(',') : null;
const FOCUS = COHORT ? 'generated' : null;

let items = [];   // {vec, dom}
let domains;
if (COHORT) {
  const allNames = Object.keys(idx).filter(n => Array.isArray(idx[n].composed_v1) && idx[n].composed_v1.length === DIM);
  const isGen = (n) => COHORT.some(t => n.toLowerCase().includes(t));
  const gen = allNames.filter(isGen);
  const others = allNames.filter(n => !isGen(n));
  // all generated + a strided sample of collected, capped so the cohort is fully
  // represented but does not itself dominate the whitening geometry.
  const OTHERN = Math.min(others.length, Math.max(2000, gen.length * 40));
  const step = Math.max(1, Math.floor(others.length / OTHERN));
  for (const n of gen) items.push({ vec: idx[n].composed_v1, dom: 'generated' });
  for (let i = 0; i < others.length && items.length < gen.length + OTHERN; i += step)
    items.push({ vec: idx[others[i]].composed_v1, dom: 'collected' });
  domains = ['generated', 'collected'];
  console.log('cohort mode: ' + gen.length + ' generated + ' + (items.length - gen.length)
    + ' collected = ' + items.length + ' patterns (terms: ' + COHORT.join(',') + ')\n');
} else {
  const byDom = {};
  for (const n of Object.keys(idx)) { const v = idx[n].composed_v1; if (!Array.isArray(v) || v.length !== DIM) continue;
    const d = n.split(/[\/_]/)[0].toLowerCase(); (byDom[d] = byDom[d] || []).push(v); }
  domains = Object.keys(byDom).filter(d => byDom[d].length >= 300).sort((a, b) => byDom[b].length - byDom[a].length).slice(0, 8);

  // balanced sample so no domain dominates the geometry
  const PER = 300;
  for (const d of domains) { const s = byDom[d]; const step = Math.max(1, Math.floor(s.length / PER)); let c = 0;
    for (let i = 0; i < s.length && c < PER; i += step) { items.push({ vec: s[i], dom: d }); c++; } }
  console.log('balanced: ' + domains.length + ' domains x ' + PER + ' = ' + items.length + ' patterns (' + domains.join(', ') + ')\n');
}

// global whitening (the fixed representation), fit on the balanced set
const Wm = W.fitWhitening(items.map(x => x.vec), { epsilon: 1e-3 });
const wv = items.map(x => Array.from(W.applyWhitening(x.vec, Wm)));
const D2 = wv[0].length;
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < D2; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; }

// kNN domain purity given a label array
function purity(labels, k = 10, focus = null) {
  const n = wv.length; let hit = 0, tot = 0;
  for (let i = 0; i < n; i++) {
    if (focus && labels[i] !== focus) continue;   // score only the focus cohort's neighbourhoods
    const sims = [];
    for (let j = 0; j < n; j++) if (j !== i) sims.push([cos(wv[i], wv[j]), j]);
    sims.sort((a, b) => b[0] - a[0]);
    for (let m = 0; m < k; m++) { tot++; if (labels[sims[m][1]] === labels[i]) hit++; }
  }
  return tot ? hit / tot : 0;
}

const realLabels = items.map(x => x.dom);
const realP = purity(realLabels, 10, FOCUS);
// label-shuffle null: keep geometry, randomize domain identity
let s = 3; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const fakeLabels = realLabels.slice(); for (let i = fakeLabels.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [fakeLabels[i], fakeLabels[j]] = [fakeLabels[j], fakeLabels[i]]; }
const fakeP = purity(fakeLabels, 10, FOCUS);
const chance = FOCUS ? items.filter(x => x.dom === FOCUS).length / items.length : 1 / domains.length;

const LBL = FOCUS ? 'GENERATED-cohort' : 'domain';
console.log('=== MEASUREMENT: kNN ' + LBL + ' purity (k=10) in the whitened resonance space ===');
console.log('  chance (random)          : ' + (chance * 100).toFixed(1) + '%');
console.log('  LABEL-SHUFFLE null        : ' + (fakeP * 100).toFixed(1) + '%   (geometry kept, domain identity destroyed)');
console.log('  REAL domain labels        : ' + (realP * 100).toFixed(1) + '%');
console.log('  genuine domain structure  : ' + ((realP - fakeP) * 100).toFixed(1) + ' pts above the cone-keeping null');
console.log('\n=== what the instrument measures (as it presents) ===');
const own = FOCUS ? 'also ' + FOCUS : 'from its own domain';
const what = FOCUS ? 'the ' + FOCUS + ' cohort' : 'these domains';
console.log('  A pattern\'s ' + 10 + ' nearest neighbours by resonance are ' + own + ' ' + (realP * 100).toFixed(0) + '% of the time,');
console.log('  vs ' + (fakeP * 100).toFixed(0) + '% when the label is shuffled out. The instrument locally separates ' + what);
console.log('  by ' + ((realP - fakeP) * 100).toFixed(0) + ' points in information space. (No interpretation beyond the measurement.)');
