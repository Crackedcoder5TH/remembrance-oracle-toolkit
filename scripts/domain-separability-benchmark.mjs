// domain-separability-benchmark.mjs — a pure information measurement, no interpretation.
//
// Question: in the instrument's resonance space, are patterns from different
// domains locally distinguishable, or mixed? Measured by k-nearest-neighbour
// domain purity (fraction of a pattern's k nearest neighbours from its OWN
// domain). Control: LABEL-SHUFFLE — same patterns, random fake-domain labels.
// This keeps the geometry (the cone) and measures baseline mixing. Genuine
// domain structure = real purity − fake purity. Reported as measured.
//
// WHAT WAS WRONG (fixed 2026-09-06). This read `composed_v1` (116-D, depth 4)
// out of pattern_index_fractal.json and grouped by the first name segment. On
// 2026-08-04 the substrate was merged into one store: the 45,547 patterns
// moved to Void's npz store at the canonical 232-D and the index became the
// witnessed repo FILES. Nobody re-pointed this tool, so it measured
// "oracle vs void" (two repo namespaces, 116-D leftovers) and reported the
// number as domain separability. Contracts C-60/C-61 read that number.
//
// NOW. The canonical substrate: every store row through src/core/store-export
// (the same loader the library uses), at the canonical width. Domains are
// PROVENANCE — the store's source stems (the file family each pattern came
// from), never the `domains` column, which resonance itself wrote (trap:
// scoring against a label the pipeline produced). Mixed/unlabelled families
// (learned_*, substrate_flat, field, l2) are not domains and are excluded.
//
// Three spaces, one run, so before/after is one measurement:
//   raw       — cosine on the composed vectors (the cone)
//   global    — one 232×232 ZCA fitted on the balanced set (the old tool's transform)
//   canonical — the per-layer reference every resonance path now applies
//               (src/core/whitening-reference.js: eight 29×29 ZCAs fitted on the
//               whole store + index, cached by store sha)
// The contracts parse the CANONICAL line ("genuine domain structure : N pts").
//
//   node scripts/domain-separability-benchmark.mjs
//   node scripts/domain-separability-benchmark.mjs --cohort noise,random_walk,…   (generated-vs-collected)
import { createRequire } from 'node:module';
const require = createRequire(new URL('.', import.meta.url).pathname + '../');
const W = require('./src/core/whitening');
const REF = require('./src/core/whitening-reference');
const { loadStore } = require('./src/core/store-export');

const NOT_A_DOMAIN = /^(learned_|substrate_flat$|field$|l2$)/;
const PER = 100;
const K = 10;

const argv = process.argv.slice(2);
const COHORT = argv.includes('--cohort')
  ? (argv[argv.indexOf('--cohort') + 1] || 'noise').toLowerCase().split(',') : null;
const FOCUS = COHORT ? 'generated' : null;

const store = loadStore();
if (store.error) { console.error('no canonical substrate on this host: ' + store.error); process.exit(2); }
const { rows, width, data, stems } = store;
const row = (i) => data.subarray(i * width, (i + 1) * width);

let items = [];   // {vec, dom}
let domains;
if (COHORT) {
  const isGen = (s) => COHORT.some((t) => String(s).toLowerCase().includes(t));
  const gen = [], others = [];
  for (let i = 0; i < rows; i++) (isGen(stems[i]) ? gen : others).push(i);
  const MIN_COHORT = 20;   // a cohort of one has no neighbourhood to be pure in
  if (gen.length < MIN_COHORT) {
    console.log('cohort mode: ' + gen.length + ' generated pattern(s) match (' + COHORT.join(',') + ') in ' + rows + ' store rows — the cohort is ABSENT from this substrate (need ≥ ' + MIN_COHORT + '); nothing to measure');
    console.log('genuine generated-cohort structure : NaN pts (cohort absent — re-ingest the generated cohorts through the pipeline)');
    process.exit(0);
  }
  const OTHERN = Math.min(others.length, Math.max(2000, gen.length * 40));
  const step = Math.max(1, Math.floor(others.length / OTHERN));
  for (const i of gen) items.push({ vec: row(i), dom: 'generated' });
  for (let j = 0; j < others.length && items.length < gen.length + OTHERN; j += step) items.push({ vec: row(others[j]), dom: 'collected' });
  domains = ['generated', 'collected'];
  console.log('cohort mode: ' + gen.length + ' generated + ' + (items.length - gen.length) + ' collected = ' + items.length + ' patterns (terms: ' + COHORT.join(',') + ')\n');
} else {
  const byDom = {};
  for (let i = 0; i < rows; i++) {
    const s = String(stems[i] || '');
    if (!s || NOT_A_DOMAIN.test(s)) continue;
    (byDom[s] = byDom[s] || []).push(i);
  }
  domains = Object.keys(byDom).filter((d) => byDom[d].length >= PER).sort((a, b) => byDom[b].length - byDom[a].length).slice(0, 8);
  for (const d of domains) {
    const s = byDom[d]; const step = Math.max(1, Math.floor(s.length / PER)); let c = 0;
    for (let i = 0; i < s.length && c < PER; i += step) { items.push({ vec: row(s[i]), dom: d }); c++; }
  }
  console.log('canonical substrate: ' + rows + ' store rows × ' + width + '-D · domains by PROVENANCE (source stem), ' + PER + ' each');
  console.log('balanced: ' + domains.length + ' domains × ' + PER + ' = ' + items.length + ' patterns (' + domains.join(', ') + ')\n');
}

const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };

// kNN purity of a vector set under a label array
function purity(vs, labels, focus) {
  const n = vs.length; let hit = 0, tot = 0;
  for (let i = 0; i < n; i++) {
    if (focus && labels[i] !== focus) continue;
    const sims = [];
    for (let j = 0; j < n; j++) if (j !== i) sims.push([cos(vs[i], vs[j]), j]);
    sims.sort((a, b) => b[0] - a[0]);
    for (let m = 0; m < K; m++) { tot++; if (labels[sims[m][1]] === labels[i]) hit++; }
  }
  return tot ? hit / tot : 0;
}

const realLabels = items.map((x) => x.dom);
let s = 3; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const fakeLabels = realLabels.slice(); for (let i = fakeLabels.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [fakeLabels[i], fakeLabels[j]] = [fakeLabels[j], fakeLabels[i]]; }
const chance = FOCUS ? items.filter((x) => x.dom === FOCUS).length / items.length : 1 / domains.length;

const raw = items.map((x) => Array.from(x.vec));
const Wm = W.fitWhitening(raw, { epsilon: 1e-3 });
const global = raw.map((v) => Array.from(W.applyWhitening(v, Wm)));
const ref = REF.reference();
const canonical = ref ? raw.map((v) => Array.from(REF.whitenComposed(v, ref))) : null;

const spaces = [['raw cone', raw], ['global ZCA (232×232, balanced fit)', global]];
if (canonical) spaces.push(['canonical per-layer reference', canonical]);
const LBL = FOCUS ? 'GENERATED-cohort' : 'domain';
console.log('=== MEASUREMENT: kNN ' + LBL + ' purity (k=' + K + ') · chance ' + (chance * 100).toFixed(1) + '% ===');
const results = {};
// The VALUES, not only the ordering: mean cosine within a domain vs across
// domains. The cone shows here — raw cosines sit near 1 for both, so every
// threshold (0.5 "resonant", 0.7 "harmonic", the goggles' CONSONANT band)
// fires on everything; kNN ordering can survive that, the values cannot.
function gap(vs) {
  let same = 0, ns = 0, cross = 0, nc = 0;
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    const c = cos(vs[i], vs[j]);
    if (realLabels[i] === realLabels[j]) { same += c; ns++; } else { cross += c; nc++; }
  }
  return { same: ns ? same / ns : 0, cross: nc ? cross / nc : 0 };
}
for (const [name, vs] of spaces) {
  const realP = purity(vs, realLabels, FOCUS), fakeP = purity(vs, fakeLabels, FOCUS);
  const g = gap(vs);
  results[name] = { realP, fakeP, gap: g };
  console.log('  ' + name.padEnd(38) + 'real ' + (realP * 100).toFixed(1).padStart(5) + '%   shuffle-null ' + (fakeP * 100).toFixed(1).padStart(5) + '%   margin ' + ((realP - fakeP) * 100).toFixed(1).padStart(5) + ' pts'
    + '   · mean cosine within ' + g.same.toFixed(3) + ' / across ' + g.cross.toFixed(3) + ' (gap ' + (g.same - g.cross).toFixed(3) + ')');
}
if (ref) {
  const st = REF.status();
  const pr = st.pr ? ' · participation ratio raw ' + st.pr.raw.toFixed(1) + ' → whitened ' + st.pr.whitened.toFixed(1) + ' of ' + st.width : '';
  console.log('  reference: ' + st.layers + ' layers × 29-D, fitted on ' + st.fitted.rows + ' rows (' + st.fitted.store + ' store + ' + st.fitted.index + ' index)' + pr);
} else {
  console.log('  reference: NONE on this host (' + REF.status().why + ') — the canonical line below is the raw cone');
}
const can = results['canonical per-layer reference'] || results['raw cone'];
console.log('\ngenuine ' + LBL + ' structure : ' + ((can.realP - can.fakeP) * 100).toFixed(1) + ' pts above the cone-keeping null'
  + (canonical ? ' (canonical per-layer whitened space)' : ' (RAW — no reference)'));
console.log('\n=== what the instrument measures (as it presents) ===');
const own = FOCUS ? 'also ' + FOCUS : 'from its own domain';
console.log('  A pattern\'s ' + K + ' nearest neighbours by resonance are ' + own + ' ' + (can.realP * 100).toFixed(0) + '% of the time,');
console.log('  vs ' + (can.fakeP * 100).toFixed(0) + '% when the label is shuffled out. (No interpretation beyond the measurement.)');
