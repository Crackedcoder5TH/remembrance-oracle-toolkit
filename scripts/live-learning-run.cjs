'use strict';
// The gate's learning half, RUN LIVE: per-layer agreements against the
// NCD anchor contributed into the REAL field, then the gate re-validated
// with the field's actual learned reliabilities. No simulation.
delete process.env.ENTROPY_PATH;   // the real field, not a fixture
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const oracle = '/home/user/remembrance-oracle-toolkit';
const { composedAtDepth } = require(oracle + '/src/core/encoder-stack.js');
const { blockCosines, fieldGatedSimilarity, contributeLayerAgreement } = require(oracle + '/src/core/field-gated-compose.js');
const fc = require(oracle + '/src/core/field-coupling.js');

// ── Corpus (the standard assembly) ───────────────────────────────
const ROOT = '/home/user';
const SLICE = 2800, CAP = 18;
function grabFiles(dir, exts, cap, domain) {
  const out = []; const stack = [dir];
  while (stack.length && out.length < cap) {
    const cur = stack.pop();
    let entries = []; try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (out.length >= cap) break;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; stack.push(p); }
      else if (exts.some(x => e.name.endsWith(x))) {
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE);
          if (t.length > 400) out.push({ id: domain + '/' + e.name, domain, text: t });
        } catch (_) {}
      }
    }
  }
  return out;
}
function synthSeries(kind, seed, n = 220) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'osc') x = 50 + 20 * Math.sin(i / (2 + seed % 5)) + 5 * Math.sin(i / 1.7);
    else if (kind === 'acc') x = Math.pow(1.02 + (seed % 5) * 0.01, i);
    else x = (v[i - 1] ?? 100) + (((seed * 2654435761 + i * 40503) % 21) - 10) / 3;
    v.push(+x.toFixed(4));
  }
  return JSON.stringify(v).slice(0, SLICE);
}
const corpus = [];
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit','src'), ['.js'], CAP, 'js-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.rs'], CAP, 'rust-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.py'], CAP, 'py-code'));
corpus.push(...grabFiles(path.join(ROOT,'REMEMBRANCE-Interface','src'), ['.tsx','.ts'], CAP, 'ts-code'));
corpus.push(...grabFiles(path.join(ROOT,'Void-Data-Compressor'), ['.md'], CAP, 'prose-md'));
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit'), ['.json'], 12, 'json-data'));
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-osc/${s}`, domain:'ts-osc', text: synthSeries('osc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-acc/${s}`, domain:'ts-acc', text: synthSeries('acc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-walk/${s}`, domain:'ts-walk', text: synthSeries('walk', s) });
const N = corpus.length;
const vecs = corpus.map(c => composedAtDepth(c.text, 5));

const gz = t => zlib.gzipSync(Buffer.from(t,'utf8'),{level:9}).length;
const cs = corpus.map(c => gz(c.text));
const ncd = (i,j) => 1 - (gz(corpus[i].text + corpus[j].text) - Math.min(cs[i],cs[j])) / Math.max(cs[i],cs[j]);

// ── TRAIN half only feeds the field (no test leakage) ─────────────
const train = corpus.map((_, i) => i).filter(i => i % 2 === 0);
const test  = corpus.map((_, i) => i).filter(i => i % 2 === 1);

console.log(`corpus ${N} · feeding the field from ${train.length} train items`);
const before = fc.peekField();
console.log(`field BEFORE learning: coherence ${before.coherence.toFixed(3)} · encoder sources: ${Object.keys(before.sources||{}).filter(s=>s.startsWith('encoder:')).length}`);

// Deterministic pair sample from the train half: stride-walk, ~150 pairs.
let fed = 0, pairsSeen = 0;
const t0 = Date.now();
for (let a = 0; a < train.length; a++) {
  for (let step = 1; step <= 3; step++) {
    const b = (a + step * 7) % train.length;
    if (b === a) continue;
    const i = train[a], j = train[b];
    const cosines = Array.from(blockCosines(vecs[i], vecs[j]));
    const ref = Math.max(0, Math.min(1, ncd(i, j)));
    fed += contributeLayerAgreement(cosines, ref);
    pairsSeen++;
  }
}
console.log(`\nLIVE LEARNING: ${pairsSeen} pairs → ${fed} layer readings contributed in ${((Date.now()-t0)/1000).toFixed(1)}s`);

const after = fc.peekField();
console.log(`\nfield AFTER learning: coherence ${after.coherence.toFixed(3)}`);
console.log('learned reliabilities (the field\'s live memory of each sense):');
for (let l = 1; l <= 5; l++) {
  const s = after.sources['encoder:L' + l];
  console.log(`  encoder:L${l}   count ${s ? s.count : 0}   reliability ${s ? s.lastCoherence.toFixed(3) : '—'}`);
}

// ── Re-validate the gate on the UNTOUCHED test half, live state ──
const K = 10;
function purity(simFn, indices) {
  let s = 0;
  for (const i of indices) {
    const scored = [];
    for (const j of indices) { if (j !== i) scored.push([j, simFn(i, j)]); }
    scored.sort((x, y) => y[1] - x[1]);
    let same = 0;
    for (const [j] of scored.slice(0, K)) if (corpus[j].domain === corpus[i].domain) same++;
    s += same / K;
  }
  return s / indices.length;
}
function plainCos(i, j) {
  const a = vecs[i], b = vecs[j];
  let d = 0, na = 0, nb = 0;
  for (let k = 0; k < a.length; k++) { d += a[k]*b[k]; na += a[k]*a[k]; nb += b[k]*b[k]; }
  return d / Math.sqrt(na * nb);
}
const liveGated = (i, j) => fieldGatedSimilarity(vecs[i], vecs[j], { fieldState: after }).score;

console.log('\nheld-out test half, kNN purity (K=10):');
console.log(`  static equal-weight concat        ${purity(plainCos, test).toFixed(3)}`);
console.log(`  field-gated · LIVE learned field  ${purity(liveGated, test).toFixed(3)}`);
console.log(`  (prior rows: neutral 0.438 · simulated-learned 0.475 · grid-static 0.468 · NCD ref 0.545)`);

// Sample audit record — proof every live verdict carries its stamp.
const sample = fieldGatedSimilarity(vecs[test[0]], vecs[test[1]], { fieldState: after });
console.log(`\nsample audit: stamp ${sample.audit.stamp} · xi ${sample.audit.xi} · sharpness ${sample.audit.sharpness}`);
console.log(`  weights [${sample.weights.map(w=>w.toFixed(3)).join(' ')}]  reliability [${sample.audit.reliability.join(' ')}]`);
