// ppi-with-l9.mjs — the activation receipt: re-run the STRING-PPI -> HPA-expression
// bonus-structure test WITH L9 in the loop, on the real starved data.
//
// The original test (bonus-structure-biology.mjs) got a clean null (z=-0.6): network
// topology carried NO signal about the expression lever past a degree-matched null —
// because it serialized a gene's neighbourhood as a sorted DEGREE profile (shape), which
// throws away the community structure. That null localized the missing lens; L9 is that
// lens. This re-runs the SAME real test with a community-preserving serialization (a 2-hop
// neighbourhood WALK — PPI-adjacent nodes land adjacent in the token sequence, so L9's
// co-occurrence graph reconstructs the gene's local subgraph) and asks the decisive
// question: does adding L9 (depth 9) recover expression-lever signal that the shape stack
// (depth 8) cannot, above the degree-matched permutation null? Honest either way — this is
// the case the whole thread turns on, so no fudging the bar.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ENC = require('../src/core/decoder-stack');
const { communityQ } = require('../src/core/relational-waveform');
const SCR = '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(20260722);

// ── EXPRESSION lever L(g), fibroblast -> myonuclei (same as the kill-test) ──
const HPA = process.env.HPA_TSV || path.join(SCR, 'rna_single_cell_type.tsv');
const hl = fs.readFileSync(HPA, 'utf8').split('\n'); hl.shift();
const G = new Map(); const ctSet = new Set();
for (const ln of hl) { if (!ln) continue; const p = ln.split('\t'); const name = p[1], ct = p[2], v = parseFloat(p[3]); if (!name || !ct || !Number.isFinite(v)) continue; if (!G.has(name)) G.set(name, {}); G.get(name)[ct] = v; ctSet.add(ct); }
const cts = [...ctSet];
const SOURCE = 'fibroblasts', TARGET = 'myonuclei', MASTER = ['MYOD1', 'MYOG', 'MYF5', 'MYF6'];
const hpaGenes = [...G.keys()]; const bg = new Map();
for (const g of hpaGenes) { const r = G.get(g); const vals = cts.map((c) => r[c] || 0); const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1e-6; bg.set(g, { m, sd }); }
const lever = (g) => { const r = G.get(g); const t = r[TARGET] || 0, s = r[SOURCE] || 0, { m, sd } = bg.get(g); return Math.log2((t + 1) / (s + 1)) * Math.max(0, (t - m) / sd); };

console.log('PPI-WITH-L9 — activation receipt on real starved data (STRING v12 + HPA)\n');
async function streamGz(file, onLine) { const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity }); for await (const line of rl) onLine(line); }
const ensp2name = new Map();
await streamGz(path.join(SCR, '9606.info.txt.gz'), (ln) => { if (ln[0] === '#') return; const i = ln.indexOf('\t'); const id = ln.slice(0, i); const j = ln.indexOf('\t', i + 1); ensp2name.set(id, ln.slice(i + 1, j)); });

// build capped adjacency (top-K partners by score) + degree, for the whole human network
const THRESH = 400, KCAP = 16;
const partners = new Map();       // name -> [[partner, score], ...]
const degree = new Map();
await streamGz(path.join(SCR, '9606.links.txt.gz'), (ln) => { if (ln[0] === 'p') return; const sp = ln.split(' '); const sc = +sp[2]; if (sc < THRESH) return; const a = ensp2name.get(sp[0]), b = ensp2name.get(sp[1]); if (!a || !b) return; degree.set(a, (degree.get(a) || 0) + 1); if (!partners.has(a)) partners.set(a, []); const arr = partners.get(a); arr.push([b, sc]); });
for (const [, arr] of partners) { arr.sort((x, y) => y[1] - x[1]); if (arr.length > KCAP) arr.length = KCAP; }
console.log('  network: ' + degree.size + ' genes, top-' + KCAP + ' partners each (score>=' + THRESH + ')');

// universe: top-variance HPA genes present in the network + masters
const varOf = (g) => { const r = G.get(g); const vals = cts.map((c) => r[c] || 0); const m = vals.reduce((a, b) => a + b, 0) / vals.length; return vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length; };
let uni = hpaGenes.filter((g) => partners.has(g));
uni = uni.map((g) => [g, varOf(g)]).sort((a, b) => b[1] - a[1]).slice(0, 1500).map((x) => x[0]);
for (const g of MASTER) if (partners.has(g) && !uni.includes(g)) uni.push(g);
console.log('  universe: ' + uni.length + ' genes (' + MASTER.filter((g) => uni.includes(g)).length + '/' + MASTER.length + ' masters)\n');

// ── community-preserving serialization: a 2-hop neighbourhood WALK ──
// g visits each top partner n; from n we emit n's own top partners. PPI-adjacent nodes are
// adjacent in the sequence, so the co-occurrence graph L9 builds ≈ g's local subgraph, and
// its modularity ≈ how modular g's neighbourhood is (functional-complex genes score high).
function walkSeq(g) {
  const out = []; const nb = partners.get(g) || [];
  for (const [n] of nb) {
    out.push(g, n);
    const nn = partners.get(n) || [];
    for (let k = 0; k < Math.min(6, nn.length); k++) out.push(n, nn[k][0]);
  }
  return out.join(' ');
}
const seq = new Map(); for (const g of uni) seq.set(g, walkSeq(g));
const sig8 = new Map(), sig9 = new Map(), Qof = new Map();
for (const g of uni) { const s = seq.get(g); sig8.set(g, Array.from(ENC.composedAtDepth(s, 8))); sig9.set(g, Array.from(ENC.composedAtDepth(s, 9))); Qof.set(g, communityQ(s)); }
const L = new Map(); for (const g of uni) L.set(g, lever(g));

const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }

// predict L(g) from g's k nearest neighbours in signature space (leave-one-out)
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
// degree-stratified permutation null (keep each gene's degree, scramble which topology is whose)
function permuted(sigMap) {
  const bins = new Map();
  for (const g of uni) { const d = degree.get(g) || 0; const b = Math.floor(Math.log2(d + 1)); if (!bins.has(b)) bins.set(b, []); bins.get(b).push(g); }
  const map = new Map();
  for (const [, arr] of bins) { const t = arr.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } arr.forEach((g, i) => map.set(g, sigMap.get(t[i]))); }
  return map;
}
function zOf(sigMap) {
  const real = predictFrom(sigMap);
  const nl = []; for (let t = 0; t < 12; t++) nl.push(predictFrom(permuted(sigMap)));
  const nm = nl.reduce((a, b) => a + b, 0) / nl.length, nsd = Math.sqrt(nl.reduce((a, b) => a + (b - nm) ** 2, 0) / nl.length) || 1e-6;
  return { real, nm, z: (real - nm) / nsd };
}

const r8 = zOf(sig8), r9 = zOf(sig9);
// direct readout: does neighbourhood modularity Q itself track the expression lever?
const qArr = uni.map((g) => Qof.get(g)), lArr = uni.map((g) => L.get(g));
const qL = corr(qArr, lArr);
// masters' neighbourhood modularity vs the field
const mQ = MASTER.filter((g) => Qof.has(g)).map((g) => Qof.get(g));
const fieldQ = uni.map((g) => Qof.get(g)); const fqm = fieldQ.reduce((a, b) => a + b, 0) / fieldQ.length, fqs = Math.sqrt(fieldQ.reduce((a, b) => a + (b - fqm) ** 2, 0) / fieldQ.length) || 1e-6;
const mQz = (mQ.reduce((a, b) => a + b, 0) / mQ.length - fqm) / fqs;

console.log('=== predict the EXPRESSION lever from network signature (leave-one-out kNN, degree-null) ===');
console.log('  DEPTH 8 (shape only)   corr(pred L, true L) = ' + r8.real.toFixed(4) + '   vs null ' + r8.nm.toFixed(4) + '   z=' + r8.z.toFixed(2));
console.log('  DEPTH 9 (+L9 community) corr = ' + r9.real.toFixed(4) + '   vs null ' + r9.nm.toFixed(4) + '   z=' + r9.z.toFixed(2));
console.log('\n=== direct readout: neighbourhood modularity Q(g) vs expression lever L(g) ===');
console.log('  corr(Q, L) = ' + qL.toFixed(4) + '   ·   masters’ neighbourhood modularity z vs field = ' + mQz.toFixed(2));

const flips = r9.z > 3 && r9.z > r8.z + 2;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  ' + (flips
  ? 'ACTIVATION RECEIPT: with L9 in the loop and a community-preserving serialization, network topology now carries the expression lever above the degree-matched null (depth-9 z=' + r9.z.toFixed(1) + ' vs depth-8 z=' + r8.z.toFixed(1) + ') — the lens the PPI null asked for flips its own null. The identity/community axis is real on real biological data.'
  : 'NO FLIP on real data (depth-8 z=' + r8.z.toFixed(1) + ' → depth-9 z=' + r9.z.toFixed(1) + '): L9 does not recover expression-lever signal from PPI topology past the degree-null here. The synthetic community read is real, but it does not transfer to THIS real cross-modality task. Recorded honestly — a real null on the receipt that matters most.'));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/ppi-with-l9.json', JSON.stringify({ depth8: r8, depth9: r9, corrQL: qL, mastersModularityZ: mQz, flips: +flips }, null, 2));
console.log('\n(reported as measured — real STRING v12 PPI + HPA expression; L9 community-preserving walk serialization; degree-matched null.)');
