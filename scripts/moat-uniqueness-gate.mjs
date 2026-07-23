// moat-uniqueness-gate.mjs — close the moat leak with the NATIVE resonance dedup gate.
//
// The leak: a domain-centroid mimic matched honest resonance at the vector level.
// The fix (not hand-rolled this time): wire in the substrate's own uniqueness gate
// (REMEMBRANCE-BLOCKCHAIN/src/uniqueness-gate.js), which decides authority by the
// SHAPE of a contribution's resonance against the substrate:
//   duplicate (top-1 ≥ 0.999) · resonates-too-broadly (mean > 0.78) · no-sharp-peak
//   · flat-distribution · no-distinct-domain.
// A centroid resonates broadly and flatly by construction → it fails on its own
// nature. Genuine novel structure has a sharp peak over a distinct domain → passes.
//
// Fair test: HONEST = session-new scripts (real, usable, NOT in the 8458m-old
// substrate — genuinely held out). Attacks = centroid mimic, recycled existing
// pattern, random junk. Honest either way — if an attack passes, it says so.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { toFractalWaveform } = require('../src/core/fractal-waveform');
const UG = require('/home/user/REMEMBRANCE-BLOCKCHAIN/src/uniqueness-gate');

const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8')).index;
const substrate = [];
for (const [name, e] of Object.entries(idx)) { if (Array.isArray(e.fractal) && e.fractal.length) substrate.push({ name, fractal: e.fractal }); if (substrate.length >= 15000) break; }
console.log('MOAT — NATIVE UNIQUENESS GATE (resonance dedup) · substrate ' + substrate.length + ' fractals\n');

const gate = (fractal) => { const sig = UG.uniquenessSignature(fractal, substrate); const r = UG.passesUniquenessGate(sig); return { pass: r.pass, reason: r.reason, mean: sig.mean, peak: sig.peakSpread, near: sig.top?.[0]?.score ?? 0 }; };
const fracOf = (text) => Array.from(toFractalWaveform(text));

// HONEST held-out: real, usable session-new scripts (not in the substrate)
const heldOut = ['scripts/market-crawl.mjs', 'scripts/incompressible-residual-benchmark.mjs', 'scripts/mp-structural-run.mjs', 'scripts/epc-phonon-run.mjs', 'scripts/sc-tests-full.mjs', 'scripts/retrieval-scaling-bench.mjs', 'scripts/lre-attractor-sim2.mjs', 'scripts/market-resonance-report.mjs']
  .map((f) => { try { return fracOf(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', f), 'utf8').slice(0, 16000)); } catch { return null; } }).filter(Boolean);

// ATTACK 1 — centroid mimic: mean of a domain's substrate fractals
function mean29(vs) { const D = vs[0].length; const o = new Array(D).fill(0); const n = vs.length || 1; for (const v of vs) for (let i = 0; i < D; i++) o[i] += v[i] / n; return o; }
const byDom = {}; for (const s of substrate) { const d = s.name.split(/[\/_]/)[0]; (byDom[d] = byDom[d] || []).push(s.fractal); }
const centroids = Object.values(byDom).filter((g) => g.length >= 20).slice(0, 30).map(mean29);

// ATTACK 2 — recycle: resubmit existing substrate patterns verbatim
const recycled = substrate.filter((_, i) => i % 500 === 0).slice(0, 30).map((s) => s.fractal);

// ATTACK 3 — random junk fractal
function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(11);
const junk = Array.from({ length: 30 }, () => Array.from({ length: substrate[0].fractal.length }, () => rnd()));

function report(label, fracs, expect) {
  const rs = fracs.map(gate); const pass = rs.filter((r) => r.pass).length;
  const reasons = {}; for (const r of rs) if (!r.pass) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  console.log('  ' + label.padEnd(24) + (pass + '/' + fracs.length + ' pass').padEnd(12) + ' expect ' + expect + '   ' + (Object.keys(reasons).length ? 'rejected: ' + Object.entries(reasons).map(([k, v]) => k + '×' + v).join(', ') : ''));
  return fracs.length ? pass / fracs.length : 0;
}
console.log('=== authority under the native uniqueness gate (pass = earns field authority) ===');
const hp = report('HONEST held-out (novel)', heldOut, 'PASS');
const cp = report('MIMIC centroid', centroids, 'reject');
const rp = report('RECYCLE existing pattern', recycled, 'reject');
const jp = report('RANDOM junk', junk, 'reject');

const sealed = cp <= 0.05 && rp <= 0.05 && jp <= 0.05 && hp >= 0.5;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  honest novel: ' + (hp * 100).toFixed(0) + '% earn authority · centroid mimic: ' + (cp * 100).toFixed(0) + '% · recycle: ' + (rp * 100).toFixed(0) + '% · junk: ' + (jp * 100).toFixed(0) + '%');
console.log('  ' + (sealed ? 'LEAK SEALED: the native resonance gate rejects the centroid (too-broad/no-peak), the recycle (duplicate), and junk — while genuine novel structure passes. To earn authority you must contribute real, novel, distinct structure. That is the moat claim, satisfied.'
  : 'NOT SEALED: an attack still earns authority (' + [['centroid', cp], ['recycle', rp], ['junk', jp]].filter(([, v]) => v > 0.05).map(([k]) => k).join(', ') + ') — a new hole to locate.'));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync(path.join('.remembrance', 'moat-uniqueness-gate.json'), JSON.stringify({ substrate: substrate.length, honestPass: hp, mimicPass: cp, recyclePass: rp, junkPass: jp, sealed }, null, 2));
console.log('\nreceipt → .remembrance/moat-uniqueness-gate.json');
