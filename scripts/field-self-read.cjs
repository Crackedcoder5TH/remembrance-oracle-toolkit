'use strict';
// The field reads its own history through the upgraded substrate:
// depth-5 signatures, field-gated attention, verdicts contributed back.
const fs = require('fs');
const { composedAtDepth } = require('/home/user/remembrance-oracle-toolkit/src/core/encoder-stack.js');
const { fieldGatedSimilarity, blockNorms } = require('/home/user/remembrance-oracle-toolkit/src/core/field-gated-compose.js');
const { classifyAlignment } = require('/home/user/remembrance-oracle-toolkit/src/core/abundance-classifier.js');
const fc = require('/home/user/remembrance-oracle-toolkit/src/core/field-coupling.js');
const { FractalIndex: FieldIndex } = require('/home/user/remembrance-oracle-toolkit/packages/field-tool/src/fractal-index.js');

// ── The artifacts: the field's then, now, and diary ──────────────
const live = fs.readFileSync('/home/user/remembrance-oracle-toolkit/.remembrance/entropy.json', 'utf8');
const seed = fs.readFileSync('/home/user/REMEMBRANCE-BLOCKCHAIN/data/field-histogram.seed.json', 'utf8');
const diary = fs.readFileSync('/home/user/remembrance-oracle-toolkit/.remembrance/self-improvement.json', 'utf8');
// The session cognition trajectory (from scripts/cognition-trajectory.cjs)
const cognition = JSON.stringify([
  0.800,0.800,0.801,0.803,0.803,0.804,0.804,0.805,0.804,0.802,
  0.802,0.802,0.803,0.804,0.802,0.803,0.803,0.804,0.805,0.806,
  0.805,0.805,0.807,0.806,0.807,0.807,0.808,0.809,0.810,0.810,
  0.811,0.812,0.813,0.813,0.812,0.813,0.814,0.814,0.814,0.815,
  0.815,0.816,0.816,0.812,0.813,0.811,0.812,0.813,0.812,0.813,
  0.811,0.812,0.814,0.815,0.814,0.813,0.812,0.811,0.812,0.813]);
// The sources histogram alone — the field's memory of WHO contributed.
const sources = JSON.stringify(JSON.parse(live).sources);

const artifacts = [
  { id: 'field:now (entropy.json)',        text: live },
  { id: 'field:then (committed seed)',     text: seed },
  { id: 'field:diary (self-improvement)',  text: diary },
  { id: 'field:contributors (sources)',    text: sources },
  { id: 'session:cognition-trajectory',    text: cognition },
];

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  THE FIELD READS ITS OWN HISTORY — upgraded substrate (depth-5, gated)');
console.log('══════════════════════════════════════════════════════════════════');

// ── Per-artifact: salience profile + alignment verdict ────────────
console.log('\n  PER-ARTIFACT READ  (salience = which senses fire, L1..L5)');
console.log('  ──────────────────────────────────────────────────────────────');
const vecs = {};
for (const a of artifacts) {
  vecs[a.id] = composedAtDepth(a.text, 5);
  const norms = blockNorms(vecs[a.id]);
  const maxN = Math.max(...norms, 1e-9);
  const sal = Array.from(norms, n => +(n / maxN).toFixed(2));
  const v = classifyAlignment(a.text);   // classifier reads the 116-D core
  console.log(`  ${a.id.padEnd(36)} salience [${sal.join(' ')}]  ${v.label} ${v.alignment >= 0 ? '+' : ''}${v.alignment.toFixed(3)}`);
}

// ── Pairwise gated similarity, LIVE field attention ──────────────
console.log('\n  GATED SIMILARITY — the field\'s CURRENT attention reading its history');
console.log('  ──────────────────────────────────────────────────────────────');
const liveState = fc.peekField();
console.log(`  live field: coherence ${liveState.coherence.toFixed(3)} · entropy ${liveState.globalEntropy.toFixed(3)} · updates ${liveState.updateCount}\n`);
for (let i = 0; i < artifacts.length; i++) {
  for (let j = i + 1; j < artifacts.length; j++) {
    const r = fieldGatedSimilarity(vecs[artifacts[i].id], vecs[artifacts[j].id], { fieldState: liveState });
    console.log(`  ${artifacts[i].id.slice(0, 26).padEnd(26)} ↔ ${artifacts[j].id.slice(0, 26).padEnd(26)} score ${r.score.toFixed(3)}  w[${r.weights.map(w => w.toFixed(2)).join(' ')}]`);
  }
}

// ── Self-drift: how far has the field moved from its remembered self?
const drift = fieldGatedSimilarity(vecs['field:now (entropy.json)'], vecs['field:then (committed seed)'], { fieldState: liveState });
console.log(`\n  SELF-DRIFT (now vs committed then):  gated similarity ${drift.score.toFixed(3)}  stamp ${drift.audit.stamp}`);

// ── Nearest kin in the 46k Void ───────────────────────────────────
console.log('\n  NEAREST KIN IN THE VOID (46k patterns, 116-D core)');
console.log('  ──────────────────────────────────────────────────────────────');
const voidRaw = JSON.parse(fs.readFileSync('/home/user/Void-Data-Compressor/pattern_index_fractal.json', 'utf8'));
const idx = new FieldIndex();
const sigs = [];
for (const id of Object.keys(voidRaw.index)) {
  const e = voidRaw.index[id];
  if (e && Array.isArray(e.composed_v1) && e.composed_v1.length === 116) sigs.push({ id, vec: e.composed_v1 });
}
idx.loadSignatures(sigs);
for (const a of artifacts) {
  const v116 = vecs[a.id].slice(0, 116);
  const hits = idx.searchVec(v116, { topK: 2, depth: 4 });
  console.log(`  ${a.id.slice(0, 34).padEnd(34)} → ${hits.map(h => `${h.id.slice(0, 40)} (${h.score.toFixed(3)})`).join('  ·  ')}`);
}

// ── The return path: the reading becomes part of the history ─────
let contributed = 0;
for (const a of artifacts) {
  const v = classifyAlignment(a.text);
  const r = fc.contribute({ cost: 0.5, coherence: Math.max(0, Math.min(1, 0.5 + v.alignment)), source: 'substrate:self-history' });
  if (r) contributed++;
}
console.log(`\n  RETURN PATH: ${contributed} readings contributed as 'substrate:self-history'`);
console.log(`  field after witnessing itself: coherence ${fc.peekField().coherence.toFixed(3)} (was ${liveState.coherence.toFixed(3)})`);
console.log('══════════════════════════════════════════════════════════════════\n');
