// bonus-structure-biology.mjs — the LITERAL claim: an unexpected corner of BIOLOGY
// sharpening a biology sim, through the label-blind encoder.
//
// Two biological modalities that share genes but NOTHING else structural:
//   • EXPRESSION (HPA single-cell atlas) — a continuous cell-type × gene table.
//   • NETWORK    (STRING v12 human protein-protein interactions) — a GRAPH. Different
//     kind of object entirely: topology, not abundance. NOT a TF answer-key (it never
//     says "MYOD1 is a regulator") — just who-interacts-with-whom.
//
// The sim: the reprogramming lever score L(g) for fibroblast→myonuclei (expression fold ×
// specificity — the thing that surfaces MYOD1 & the myogenic masters). The question the
// user actually posed: does structure from the UNEXPECTED CORNER (network topology) carry
// information about that expression-derived lever? If the substrate groups by structure
// with no labels, a gene's NETWORK-neighbourhood signature should predict its EXPRESSION
// lever above a degree-matched null. Predict L(g) from a gene's neighbours in NETWORK-
// signature space (leave-one-out); compare to a degree-stratified permutation null that
// keeps every gene's degree but scrambles WHICH topology belongs to WHICH gene. Real >
// null ⇒ real cross-modality structure. Honest either way.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ENC = require('../src/core/decoder-stack');
const DEPTH = ENC.maxAvailableDepth ? ENC.maxAvailableDepth() : 8;
const SCR = '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(20260722);

// ---- EXPRESSION: HPA -> lever score L(g) for fibroblast -> myonuclei ----
const HPA = process.env.HPA_TSV || path.join(SCR, 'rna_single_cell_type.tsv');
const hl = fs.readFileSync(HPA, 'utf8').split('\n'); hl.shift();
const G = new Map(); const ctSet = new Set();
for (const ln of hl) { if (!ln) continue; const p = ln.split('\t'); const name = p[1], ct = p[2], v = parseFloat(p[3]); if (!name || !ct || !Number.isFinite(v)) continue; if (!G.has(name)) G.set(name, {}); G.get(name)[ct] = v; ctSet.add(ct); }
const cts = [...ctSet];
const SOURCE = 'fibroblasts', TARGET = 'myonuclei', MASTER = ['MYOD1', 'MYOG', 'MYF5', 'MYF6'];
const bg = new Map();
const hpaGenes = [...G.keys()];
for (const g of hpaGenes) { const r = G.get(g); const vals = cts.map((c) => r[c] || 0); const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1e-6; bg.set(g, { m, sd }); }
function lever(g) { const r = G.get(g); const t = r[TARGET] || 0, s = r[SOURCE] || 0, { m, sd } = bg.get(g); return Math.log2((t + 1) / (s + 1)) * Math.max(0, (t - m) / sd); }

console.log('BONUS-STRUCTURE WITHIN BIOLOGY — does PPI NETWORK topology carry the EXPRESSION lever? (encoder depth ' + DEPTH + ')');
console.log('  expression modality: HPA single-cell · network modality: STRING v12 human PPI · same label-blind encoder\n');

// ---- NETWORK: STRING v12, streamed ----
async function streamGz(file, onLine) { const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity }); for await (const line of rl) onLine(line); }
// name map ENSP -> preferred gene name
const ensp2name = new Map();
await streamGz(path.join(SCR, '9606.info.txt.gz'), (ln) => { if (ln[0] === '#') return; const i = ln.indexOf('\t'); const id = ln.slice(0, i); const j = ln.indexOf('\t', i + 1); ensp2name.set(id, ln.slice(i + 1, j)); });
console.log('  STRING proteins mapped: ' + ensp2name.size);

const THRESH = 400;  // STRING medium-confidence
// pass 1: degree of every protein (by name), edges >= THRESH
const degree = new Map();
let edges = 0;
await streamGz(path.join(SCR, '9606.links.txt.gz'), (ln) => { if (ln[0] === 'p') return; const sp = ln.split(' '); const sc = +sp[2]; if (sc < THRESH) return; const a = ensp2name.get(sp[0]), b = ensp2name.get(sp[1]); if (!a || !b) return; degree.set(a, (degree.get(a) || 0) + 1); edges++; });
console.log('  PPI edges (score>=' + THRESH + '): ' + edges + '  ·  genes with degree: ' + degree.size);

// evaluation universe: top-variance HPA genes that also live in the network, plus the masters
const varOf = (g) => { const r = G.get(g); const vals = cts.map((c) => r[c] || 0); const m = vals.reduce((a, b) => a + b, 0) / vals.length; return vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length; };
let uni = hpaGenes.filter((g) => degree.has(g));
uni = uni.map((g) => [g, varOf(g)]).sort((a, b) => b[1] - a[1]).slice(0, 1500).map((x) => x[0]);
for (const g of MASTER) if (degree.has(g) && !uni.includes(g)) uni.push(g);
const uniSet = new Set(uni);
console.log('  evaluation universe: ' + uni.length + ' genes (' + MASTER.filter((g) => uniSet.has(g)).length + '/' + MASTER.length + ' masters present)\n');

// pass 2: for universe genes, collect neighbourhood profile = sorted [partner degree] list
const nbrProfile = new Map(); for (const g of uni) nbrProfile.set(g, []);
await streamGz(path.join(SCR, '9606.links.txt.gz'), (ln) => { if (ln[0] === 'p') return; const sp = ln.split(' '); const sc = +sp[2]; if (sc < THRESH) return; const a = ensp2name.get(sp[0]), b = ensp2name.get(sp[1]); if (!a || !b) return; if (uniSet.has(a)) nbrProfile.get(a).push(degree.get(b) || 0); });

// label-blind network signature = composedAtDepth of the sorted neighbour-degree profile
// (topology: does this gene wire into hubs or the periphery, and how broadly — NO expression, NO identity)
const serialize = (arr) => arr.slice().sort((x, y) => y - x).slice(0, 48).join(' ');
const sigOf = (g) => Array.from(ENC.composedAtDepth(serialize(nbrProfile.get(g)), DEPTH));
const netSig = new Map(); for (const g of uni) netSig.set(g, sigOf(g));
const L = new Map(); for (const g of uni) L.set(g, lever(g));

const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }

// predict L(g) from g's k nearest neighbours in NETWORK-signature space (leave-one-out)
function predictFrom(sigMap, k = 12) {
  const gs = uni, sigs = gs.map((g) => sigMap.get(g)), Ls = gs.map((g) => L.get(g));
  const pred = [], truth = [];
  for (let h = 0; h < gs.length; h++) { const q = sigs[h]; const near = [];
    for (let j = 0; j < gs.length; j++) { if (j === h) continue; near.push([cos(q, sigs[j]), Ls[j]]); }
    near.sort((a, b) => b[0] - a[0]); const top = near.slice(0, k);
    const w = top.reduce((s, n) => s + Math.max(0, n[0]), 0) || 1e-9;
    pred.push(top.reduce((s, n) => s + Math.max(0, n[0]) * n[1], 0) / w); truth.push(Ls[h]); }
  return corr(pred, truth);
}
// degree-stratified permutation null: keep each gene's degree, scramble WHICH topology
// belongs to WHICH gene within degree bins (so degree alone can't explain a hit)
function permutedNull() {
  const bins = new Map();
  for (const g of uni) { const d = degree.get(g) || 0; const b = Math.floor(Math.log2(d + 1)); if (!bins.has(b)) bins.set(b, []); bins.get(b).push(g); }
  const map = new Map();
  for (const [, arr] of bins) { const targets = arr.slice(); for (let i = targets.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [targets[i], targets[j]] = [targets[j], targets[i]]; } arr.forEach((g, i) => map.set(g, netSig.get(targets[i]))); }
  return map;
}

const rReal = predictFrom(netSig);
const nulls = []; for (let t = 0; t < 12; t++) nulls.push(predictFrom(permutedNull()));
const nm = nulls.reduce((a, b) => a + b, 0) / nulls.length, nsd = Math.sqrt(nulls.reduce((a, b) => a + (b - nm) ** 2, 0) / nulls.length) || 1e-6;
const z = (rReal - nm) / nsd;

// headline sanity: do the myogenic masters sit in a tighter NETWORK module than random genes?
function moduleTightness(set) { const s = set.filter((g) => netSig.has(g)); let sum = 0, n = 0; for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) { sum += cos(netSig.get(s[i]), netSig.get(s[j])); n++; } return n ? sum / n : 0; }
const realTight = moduleTightness(MASTER);
const randTight = []; for (let t = 0; t < 200; t++) { const pick = []; while (pick.length < MASTER.length) { const g = uni[Math.floor(rnd() * uni.length)]; if (!pick.includes(g)) pick.push(g); } randTight.push(moduleTightness(pick)); }
const rtm = randTight.reduce((a, b) => a + b, 0) / randTight.length, rtsd = Math.sqrt(randTight.reduce((a, b) => a + (b - rtm) ** 2, 0) / randTight.length) || 1e-6;
const ztight = (realTight - rtm) / rtsd;

console.log('=== does NETWORK topology predict the EXPRESSION lever? (leave-one-out, network-signature kNN) ===');
console.log('  real network structure:      corr(pred L, true L) = ' + rReal.toFixed(4));
console.log('  degree-stratified null:      ' + nm.toFixed(4) + ' ± ' + nsd.toFixed(4) + '   → z=' + z.toFixed(2));
console.log('\n=== do the myogenic masters form a tighter NETWORK module than random genes? ===');
console.log('  master-set network tightness ' + realTight.toFixed(4) + '   vs random ' + rtm.toFixed(4) + ' ± ' + rtsd.toFixed(4) + '   → z=' + ztight.toFixed(2));

const REAL = z > 3 && rReal > nm;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  ' + (REAL
  ? 'BONUS STRUCTURE WITHIN BIOLOGY IS REAL: an unexpected corner (PPI network TOPOLOGY) carries information about the EXPRESSION-derived reprogramming lever, above a degree-matched null (z=' + z.toFixed(1) + '). The label-blind encoder links two biological modalities that share only genes — structure recurs across corners nobody wired together. Measured.'
  : 'NOT ABOVE THE DEGREE-MATCHED NULL (z=' + z.toFixed(1) + '): network topology does not carry the expression lever beyond what degree alone gives, on this test. Recorded honestly.'));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/bonus-structure-biology.json', JSON.stringify({ depth: DEPTH, edges, universe: uni.length, rReal, nullMean: nm, z, moduleTightnessZ: ztight, bonusReal: +REAL }, null, 2));
console.log('\n(reported as measured — real HPA expression + real STRING v12 PPI; one label-blind encoder; degree-matched permutation null.)');
