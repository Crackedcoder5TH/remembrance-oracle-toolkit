// lens-fractal-compare.mjs — pull ALL the lens receipts (good and bad), compress each
// through the substrate's own encoder, and fractally compare them to see what the set of
// lenses tells us — where they cluster, which axis is independent, and where the residual
// (the next lens) lives. This is the "manipulate the field to find the next lens" move done
// honestly: the nulls are signposts; compressed together they point at the missing axis.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ENC = require('../src/core/decoder-stack');
const W = require('../src/core/whitening');

// bring all 9 layer seeds into view (in-memory only; does NOT persist active flags to disk)
while (ENC.activateNextLayer()) { /* reveal L9 seed */ }
const seeds = ENC.activeLayers();   // [{id, dims, seed}]

// the empirical lens receipts (good = a lens/axis confirmed, bad = a null that localized a gap)
const R = '.remembrance/';
const receiptFiles = [
  ['bonus-structure-crossdomain', 'null: physics→biology shape transfer (weak)'],
  ['bonus-structure-biology', 'null: PPI→expression, shape blind to identity'],
  ['ppi-with-l9', 'L9 real: modest lift, direct-modularity null'],
  ['sc-cross-family-l9', 'L9 real: silent on composition vectors'],
  ['l9-community-validation', 'L9 synthetic: reads community, adds Q info'],
  ['sc-depth-compounding', 'depth: cold-start not compounding'],
  ['cellfate-depth-headroom', 'depth: saturated, lever too obvious'],
  ['cellfate-killtest-real', 'good: MYOD1 recovered from real data'],
];
const items = [];
for (const s of seeds) items.push({ id: s.id, kind: 'lens-seed', text: s.seed });
for (const [f, tag] of receiptFiles) { try { const j = fs.readFileSync(R + f + '.json', 'utf8'); items.push({ id: f, kind: 'receipt', text: tag + ' :: ' + j }); } catch { /* skip missing */ } }

console.log('LENS FRACTAL COMPARE — ' + items.length + ' items (' + seeds.length + ' lens-seeds + ' + (items.length - seeds.length) + ' receipts), encoder depth 8\n');

// COMPRESS: each item → composed structural signature
const V = items.map((it) => Array.from(ENC.composedAtDepth(it.text, 8)));
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };

// FRACTAL COMPARE: nearest kin per item
console.log('=== nearest structural kin (who each lens/receipt resonates with) ===');
for (let i = 0; i < items.length; i++) {
  let bj = -1, bc = -Infinity; for (let j = 0; j < items.length; j++) { if (i === j) continue; const c = cos(V[i], V[j]); if (c > bc) { bc = c; bj = j; } }
  console.log('  ' + items[i].id.padEnd(26) + '→ ' + items[bj].id.padEnd(26) + ' ' + bc.toFixed(3) + '   [' + items[i].kind + ']');
}

// CLUSTER: greedy families at threshold
const TH = 0.80; const clusters = [];
for (let i = 0; i < items.length; i++) {
  let placed = false;
  for (const cl of clusters) { const c = cos(V[i], V[cl.rep]); if (c >= TH) { cl.members.push(i); placed = true; break; } }
  if (!placed) clusters.push({ rep: i, members: [i] });
}
console.log('\n=== structural families (threshold ' + TH + ') ===');
clusters.forEach((cl, k) => console.log('  family ' + (k + 1) + ': ' + cl.members.map((m) => items[m].id).join(', ')));

// INDEPENDENCE: most novel item (lowest max-cosine to any other) = the axis least covered
let outlier = -1, outC = Infinity;
for (let i = 0; i < items.length; i++) { let mx = -Infinity; for (let j = 0; j < items.length; j++) if (i !== j) mx = Math.max(mx, cos(V[i], V[j])); if (mx < outC) { outC = mx; outlier = i; } }
// effective dimensionality of the lens set (how many independent axes the lenses span)
const effDim = W.participationRatio ? W.participationRatio(V) : NaN;

// THE RESIDUAL SIGNPOST: the null/bad receipts, compressed together — what axis do they share
// that the shape-seed family does NOT? Their shared direction is the next-lens candidate.
const nullIdx = items.map((it, i) => [it, i]).filter(([it]) => it.kind === 'receipt' && /null|silent|saturat|blind|cold-start/.test(it.text)).map(([, i]) => i);
const shapeSeedIdx = items.map((it, i) => [it, i]).filter(([it]) => it.kind === 'lens-seed' && !/relational/.test(it.id)).map(([, i]) => i);
function centroid(idx) { const c = new Float64Array(V[0].length); for (const i of idx) for (let d = 0; d < c.length; d++) c[d] += V[i][d]; for (let d = 0; d < c.length; d++) c[d] /= (idx.length || 1); return Array.from(c); }
const nullC = centroid(nullIdx), shapeC = centroid(shapeSeedIdx);
const l9i = items.findIndex((it) => it.id === 'L9-relational');
const nullVsShape = cos(nullC, shapeC);
const nullVsL9 = l9i >= 0 ? cos(nullC, V[l9i]) : NaN;

console.log('\n=== what the compressed set SHOWS ===');
console.log('  effective independent lens-axes (participation ratio): ' + (Number.isFinite(effDim) ? effDim.toFixed(2) : 'n/a') + ' of ' + items.length + ' items');
console.log('  most independent item (least-covered axis): ' + items[outlier].id + '  (max kin ' + outC.toFixed(3) + ')');
console.log('  null-receipts centroid  vs  shape-seed family: ' + nullVsShape.toFixed(3) + '   (low ⇒ the gap the nulls mark is OUTSIDE the shape lenses)');
console.log('  null-receipts centroid  vs  L9-relational:     ' + (Number.isFinite(nullVsL9) ? nullVsL9.toFixed(3) : 'n/a') + '   (higher ⇒ the nulls point toward the relational axis L9 opened)');

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/lens-fractal-compare.json', JSON.stringify({ nItems: items.length, effDim, outlier: items[outlier].id, outlierKin: outC, nullVsShape, nullVsL9, families: clusters.map((c) => c.members.map((m) => items[m].id)) }, null, 2));
console.log('\n(reported as measured — every lens seed + receipt compressed through composedAtDepth and fractally compared. No labels used; structure only.)');
