const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  blockCount, blockNorms, blockCosines, fieldStamp,
  gateWeights, fieldGatedSimilarity, FALLBACK,
} = require('../src/core/field-gated-compose');
const { composedAtDepth } = require('../src/core/encoder-stack');

const CODE = 'function retry(fn, n) { for (let i = 0; i < n; i++) { try { return fn(); } catch (e) {} } }';
const SERIES = JSON.stringify(Array.from({ length: 120 }, (_, i) => +(50 + 20 * Math.sin(i / 3)).toFixed(3)));

describe('block primitives', () => {
  it('counts and slices blocks correctly at depth 5', () => {
    const v = composedAtDepth(CODE, 5);
    assert.equal(v.length, 145);
    assert.equal(blockCount(v), 5);
    assert.equal(blockNorms(v).length, 5);
  });
  it('block cosines are bounded and self-similarity is 1 on signal blocks', () => {
    const v = composedAtDepth(CODE, 5);
    const c = blockCosines(v, v);
    for (const x of c) assert.ok(x >= -1 && x <= 1.0000001);
    assert.ok(c[0] > 0.999, 'L1 self-cosine ≈ 1');
  });
});

describe('gateWeights — the attention gate', () => {
  const A = composedAtDepth(CODE, 5);
  const B = composedAtDepth(SERIES, 5);

  it('weights are a distribution: sum to 1, every weight ≥ floor share', () => {
    const { weights } = gateWeights(A, B, { fieldState: null });
    const sum = weights.reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    // With n floored terms normalized, each weight ≥ floor / (n·(floor+1))
    const minShare = FALLBACK.floor / (weights.length * (FALLBACK.floor + 1));
    for (const w of weights) assert.ok(w >= minShare, `weight ${w} below irreversibility floor`);
  });

  it('is deterministic given an explicit field state', () => {
    const s = { coherence: 0.8, globalEntropy: 1.0, updateCount: 42, sources: {} };
    const a = gateWeights(A, B, { fieldState: s });
    const b = gateWeights(A, B, { fieldState: s });
    assert.deepEqual(Array.from(a.weights), Array.from(b.weights));
    assert.equal(a.audit.stamp, b.audit.stamp);
  });

  it('detached field degrades to floored near-equal weights, never throws', () => {
    const { weights, audit } = gateWeights(A, A, { fieldState: null });
    assert.equal(audit.stamp, 'field:detached');
    for (const w of weights) assert.ok(w > 0);
  });

  it('field reliability shifts attention: a trusted layer gains weight', () => {
    // Reliability moved OUT of the sources histogram and into its own store.
    // It used to be written with contribute({ coherence: agreement }), i.e.
    // an agreement score entering the coherency field under the name
    // `coherence` — the same substitution that put 41 wrong contributions
    // into this field. Layer attention must be able to learn without moving
    // an equation term, so it now lives in state.layerReliability.
    const neutral = { coherence: 0.5, updateCount: 1, sources: {}, layerReliability: {} };
    const trustsL2 = { coherence: 0.5, updateCount: 1, sources: {}, layerReliability: {
      L2: 0.95,
      L3: 0.05,
    } };
    const w0 = gateWeights(A, B, { fieldState: neutral }).weights;
    const w1 = gateWeights(A, B, { fieldState: trustsL2 }).weights;
    assert.ok(w1[1] > w0[1], 'trusted L2 gains weight');
    assert.ok(w1[2] < w0[2], 'distrusted L3 loses weight');
  });

  it('global coherence modulates sharpness (confident field concentrates)', () => {
    const low = gateWeights(A, B, { fieldState: { coherence: 0.1, updateCount: 1, sources: {} } });
    const high = gateWeights(A, B, { fieldState: { coherence: 0.9, updateCount: 1, sources: {} } });
    assert.ok(high.audit.sharpness > low.audit.sharpness);
    const spread = w => Math.max(...w) - Math.min(...w);
    assert.ok(spread(Array.from(high.weights)) >= spread(Array.from(low.weights)) - 1e-9,
      'confident field concentrates attention at least as much');
  });
});

describe('fieldGatedSimilarity — the living reading', () => {
  const A = composedAtDepth(CODE, 5);
  const B = composedAtDepth(SERIES, 5);
  it('returns bounded score + full audit record', () => {
    const r = fieldGatedSimilarity(A, B, { fieldState: { coherence: 0.7, updateCount: 5, sources: {} } });
    assert.ok(r.score >= -1 && r.score <= 1);
    assert.equal(r.layers.length, 5);
    assert.equal(r.weights.length, 5);
    assert.ok(typeof r.audit.stamp === 'string' && r.audit.stamp.length > 0);
  });
  it('self-similarity outranks cross-domain similarity', () => {
    const s = { coherence: 0.6, updateCount: 3, sources: {} };
    const self = fieldGatedSimilarity(A, composedAtDepth(CODE + ' ', 5), { fieldState: s }).score;
    const cross = fieldGatedSimilarity(A, B, { fieldState: s }).score;
    assert.ok(self > cross, `self ${self.toFixed(3)} should beat cross ${cross.toFixed(3)}`);
  });
});
