// cellfate-killtest-real.mjs — the per-domain kill-test for cell-fate on REAL data.
//
// Ground truth: fibroblast → skeletal muscle is reprogrammed by MYOD1 (Weintraub 1989 —
// the founding single-factor reprogramming experiment). So the falsifiable claim is:
// the LRE minimum-intervention tipping direction, computed from REAL scRNA-seq-derived
// cell-type expression (Human Protein Atlas, 155 cell types), must surface the myogenic
// master TFs (MYOD1, MYOG, MYF5, MYF6) at the TOP for the muscle target — and NOT for
// random targets. If it buries them, or lights them up for any target, it is falsified.
// Pre-registered null: the same myogenic set's enrichment across random source→target
// pairs. Honest either way.
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.HPA_TSV || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad/rna_single_cell_type.tsv';
const lines = fs.readFileSync(DATA, 'utf8').split('\n'); lines.shift();
// geneName -> { cellType -> nCPM } ; also collect all cell types
const G = new Map(); const cellTypes = new Set();
for (const ln of lines) { if (!ln) continue; const p = ln.split('\t'); const name = p[1], ct = p[2], v = parseFloat(p[3]); if (!name || !ct || !Number.isFinite(v)) continue; if (!G.has(name)) G.set(name, {}); G.get(name)[ct] = v; cellTypes.add(ct); }
const genes = [...G.keys()]; const cts = [...cellTypes];
console.log('CELL-FATE KILL-TEST ON REAL DATA (HPA scRNA-seq, ' + genes.length + ' genes × ' + cts.length + ' cell types)\n');

const SOURCE = 'fibroblasts', TARGET = 'myonuclei';
const MASTER = ['MYOD1', 'MYOG', 'MYF5', 'MYF6'];   // the myogenic master TFs — the known levers

// background mean/std per gene across all cell types (for target-specificity)
const bg = new Map();
for (const g of genes) { const vals = cts.map((c) => G.get(g)[c] || 0); const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1e-6; bg.set(g, { m, sd }); }

// LRE tipping direction source→target: genes that are UP in target vs source AND
// SPECIFIC to the target (a low-abundance master TF that is off everywhere except the
// target scores high — that is the minimum-intervention lever, not a bulk effector).
function tippingRanked(src, tgt) {
  const scored = genes.map((g) => { const t = G.get(g)[tgt] || 0, s = G.get(g)[src] || 0, { m, sd } = bg.get(g);
    const fold = Math.log2((t + 1) / (s + 1));          // up in target vs source
    const spec = (t - m) / sd;                           // distinctive to the target (specificity)
    return { g, score: fold * Math.max(0, spec) };
  }).sort((a, b) => b.score - a.score);
  return scored;
}
const rankOf = (ranked, set) => set.map((g) => { const i = ranked.findIndex((r) => r.g === g); return { g, rank: i < 0 ? Infinity : i + 1, pct: i < 0 ? 0 : 100 * (1 - i / ranked.length) }; });
// enrichment = mean top-percentile of the master set (higher = more concentrated at top)
const enrich = (ranked) => rankOf(ranked, MASTER).reduce((a, r) => a + r.pct, 0) / MASTER.length;

// REAL pair
const real = tippingRanked(SOURCE, TARGET);
const realRanks = rankOf(real, MASTER);
console.log('=== fibroblast → myonuclei (muscle) — where do the myogenic master TFs land? ===');
for (const r of realRanks) console.log('  ' + r.g.padEnd(6) + ' rank ' + (r.rank === Infinity ? 'absent' : String(r.rank).padStart(5)) + ' / ' + genes.length + '   (top ' + r.pct.toFixed(1) + '%)');
const realEnrich = enrich(real);
console.log('  master-set mean top-percentile: ' + realEnrich.toFixed(1) + '%');

// NULL: same master set's enrichment for fibroblast → RANDOM other target
function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(7);
const others = cts.filter((c) => c !== TARGET && c !== SOURCE && !/myo|muscle|cardio/i.test(c));
const nullE = [];
for (let k = 0; k < 40; k++) { const tgt = others[Math.floor(rnd() * others.length)]; nullE.push(enrich(tippingRanked(SOURCE, tgt))); }
const nm = nullE.reduce((a, b) => a + b, 0) / nullE.length, nsd = Math.sqrt(nullE.reduce((a, b) => a + (b - nm) ** 2, 0) / nullE.length) || 1e-6;
const z = (realEnrich - nm) / nsd, p = (nullE.filter((v) => v >= realEnrich).length + 1) / (nullE.length + 1);

console.log('\n=== NULL: same myogenic set for fibroblast → 40 random non-muscle targets ===');
console.log('  null mean top-percentile ' + nm.toFixed(1) + '%   real ' + realEnrich.toFixed(1) + '%   z=' + z.toFixed(2) + '   p=' + p.toFixed(3));

const hit = realEnrich > 95 && z > 3 && realRanks.filter((r) => r.pct > 99).length >= 2;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  ' + (hit ? 'RECOVERED: the LRE tipping direction from REAL expression surfaces the myogenic master TFs (incl. MYOD1 — the single-factor reprogrammer) at the very top for the muscle target, far above the random-target null. The known real reprogramming lever is recovered from data. Cell-fate passes its kill-test.'
  : 'NOT RECOVERED: the myogenic levers are not top-and-specific above the null (' + realEnrich.toFixed(0) + '% vs null ' + nm.toFixed(0) + '%, z=' + z.toFixed(1) + '). Falsified for this domain — a real miss, recorded.'));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/cellfate-killtest-real.json', JSON.stringify({ source: SOURCE, target: TARGET, realEnrich, nullMean: nm, z, p, myod1Rank: realRanks[0].rank, recovered: +hit }, null, 2));
console.log('\nreceipt → .remembrance/cellfate-killtest-real.json');
