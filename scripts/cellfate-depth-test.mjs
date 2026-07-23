// cellfate-depth-test.mjs — does accuracy IN a domain improve as the domain gains DEPTH?
//
// The claim: the substrate's accumulated structure is free background that sharpens a
// specific sim. Test on real cell-fate data: the reprogramming lever MYOD1 is a LOW-
// abundance master TF — it only stands out as THE lever when the rest of the expression
// atlas is present as background to reveal its muscle-specificity. So MYOD1 recovery
// (fibroblast→myonuclei) should SHARPEN as more cell-type depth is added to the
// background. We sweep background depth K and measure the recovery z-score vs a null.
// Honest either way — if depth does not help, it says so.
import fs from 'node:fs';
import path from 'node:path';
const DATA = process.env.HPA_TSV || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad/rna_single_cell_type.tsv';
const lines = fs.readFileSync(DATA, 'utf8').split('\n'); lines.shift();
const G = new Map(); const cellTypes = new Set();
for (const ln of lines) { if (!ln) continue; const p = ln.split('\t'); const name = p[1], ct = p[2], v = parseFloat(p[3]); if (!name || !ct || !Number.isFinite(v)) continue; if (!G.has(name)) G.set(name, {}); G.get(name)[ct] = v; cellTypes.add(ct); }
const genes = [...G.keys()]; const allCts = [...cellTypes];
const SOURCE = 'fibroblasts', TARGET = 'myonuclei', MASTER = ['MYOD1', 'MYOG', 'MYF6'];
console.log('CELL-FATE DEPTH TEST — does MYOD1 recovery sharpen as background depth grows? (' + genes.length + ' genes, ' + allCts.length + ' cell types)\n');

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(99);
function sample(arr, k, exclude) { const pool = arr.filter((c) => !exclude.includes(c)); const a = pool.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); }

// tipping direction with background specificity computed over a GIVEN set of cell types
function enrichment(src, tgt, bgCts) {
  const scored = genes.map((g) => { const rec = G.get(g); const t = rec[tgt] || 0, s = rec[src] || 0;
    let m = 0, n = 0; for (const c of bgCts) { m += rec[c] || 0; n++; } m /= (n || 1);
    let sd = 0; for (const c of bgCts) sd += ((rec[c] || 0) - m) ** 2; sd = Math.sqrt(sd / (n || 1)) || 1e-6;
    const fold = Math.log2((t + 1) / (s + 1)); const spec = (t - m) / sd; return { g, score: fold * Math.max(0, spec) };
  }).sort((a, b) => b.score - a.score);
  const pctOf = (g) => { const i = scored.findIndex((r) => r.g === g); return i < 0 ? 0 : 100 * (1 - i / scored.length); };
  return { masterPct: MASTER.reduce((a, g) => a + pctOf(g), 0) / MASTER.length, myod1Pct: pctOf('MYOD1') };
}

console.log('  background depth   MYOD1 percentile   master-set enrich   z vs random-target null');
console.log('  (cell types used)                                        (does the lever get sharper?)');
const others = allCts.filter((c) => c !== TARGET && c !== SOURCE && !/myo|muscle|cardio/i.test(c));
const rows = [];
for (const K of [3, 8, 20, 50, allCts.length]) {
  const bg = K >= allCts.length ? allCts : sample(allCts, K, [SOURCE, TARGET]).concat([SOURCE, TARGET]);
  const real = enrichment(SOURCE, TARGET, bg);
  // null: same background depth, random non-muscle targets
  const nulls = []; for (let k = 0; k < 20; k++) nulls.push(enrichment(SOURCE, others[Math.floor(rnd() * others.length)], bg).masterPct);
  const nm = nulls.reduce((a, b) => a + b, 0) / nulls.length; const nsd = Math.sqrt(nulls.reduce((a, b) => a + (b - nm) ** 2, 0) / nulls.length) || 1e-6;
  const z = (real.masterPct - nm) / nsd;
  rows.push({ K: bg.length, myod1: real.myod1Pct, master: real.masterPct, z });
  console.log('  ' + String(bg.length).padEnd(18) + ('top ' + real.myod1Pct.toFixed(1) + '%').padEnd(19) + (real.masterPct.toFixed(1) + '%').padEnd(20) + 'z=' + z.toFixed(2));
}
const improves = rows[rows.length - 1].z > rows[0].z && rows[rows.length - 1].myod1 >= rows[0].myod1;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  MYOD1 percentile: ' + rows[0].myod1.toFixed(0) + '% (depth ' + rows[0].K + ') → ' + rows[rows.length - 1].myod1.toFixed(0) + '% (depth ' + rows[rows.length - 1].K + ')');
console.log('  recovery z-score: ' + rows[0].z.toFixed(1) + ' → ' + rows[rows.length - 1].z.toFixed(1));
console.log('  ' + (improves ? 'DEPTH HELPS: the reprogramming lever gets sharper as the domain gains background depth — the accumulated structure is free information that reveals the specific lever. The depth-compounding claim is MEASURED here.'
  : 'depth does not sharpen recovery here — the claim is not supported on this test.'));
fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/cellfate-depth-test.json', JSON.stringify({ zLow: rows[0].z, zHigh: rows[rows.length - 1].z, myod1Low: rows[0].myod1, myod1High: rows[rows.length - 1].myod1, depthHelps: +improves }, null, 2));
console.log('\n(reported as measured — real HPA scRNA-seq data. Depth = number of background cell types.)');
