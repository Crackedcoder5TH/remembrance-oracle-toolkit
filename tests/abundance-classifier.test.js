const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  COMPOSED_DIM,
  DIM,
  EXTRACTION_WEIGHTS,
  ABUNDANCE_WEIGHTS,
  classifySignature,
  classifyAlignment,
  inspectAlignmentMarkers,
} = require('../src/core/abundance-classifier');
const { composedAtDepth } = require('../src/core/encoder-stack');

// ── Synthetic series with known geometry ─────────────────────────

// Monotonic accumulation with heavy tail: one account compounding,
// mass concentrating — the canonical extraction shape.
function extractiveSeries() {
  const vals = [];
  let x = 1;
  for (let i = 0; i < 200; i++) { x *= 1.06; vals.push(x.toFixed(4)); }
  return JSON.stringify(vals.map(Number));
}

// Bounded oscillation around a mean: flow goes out and comes back,
// values diverse, no drift — the canonical circulation shape.
function abundantSeries() {
  const vals = [];
  for (let i = 0; i < 200; i++) {
    vals.push((50 + 20 * Math.sin(i / 3) + 7 * Math.sin(i / 1.7)).toFixed(4));
  }
  return JSON.stringify(vals.map(Number));
}

describe('classifySignature', () => {
  it('rejects vectors that are not depth-4 composed', () => {
    assert.throws(() => classifySignature(new Float64Array(29)));
    assert.throws(() => classifySignature(null));
    assert.throws(() => classifySignature(new Float64Array(58)));
  });

  it('accepts a 116-D vector and returns the full shape', () => {
    const v = composedAtDepth('const x = 1;', 4);
    assert.equal(v.length, COMPOSED_DIM);
    const r = classifySignature(v);
    assert.ok(r.extraction >= 0 && r.extraction <= 1);
    assert.ok(r.abundance >= 0 && r.abundance <= 1);
    assert.ok(r.alignment >= -1 && r.alignment <= 1);
    assert.ok(['abundance-aligned', 'extraction-aligned', 'mixed'].includes(r.label));
    assert.ok(Array.isArray(r.evidence) && r.evidence.length === 12);
  });

  it('is deterministic for the same input', () => {
    const v = composedAtDepth(extractiveSeries(), 4);
    const a = classifySignature(v);
    const b = classifySignature(v);
    assert.deepEqual(a, b);
  });
});

describe('classifyAlignment — geometry separation', () => {
  it('scores monotonic heavy-tail accumulation as more extractive than bounded oscillation', () => {
    const ex = classifyAlignment(extractiveSeries());
    const ab = classifyAlignment(abundantSeries());
    assert.ok(
      ex.alignment < ab.alignment,
      `extractive series (${ex.alignment.toFixed(3)}) should score below oscillating series (${ab.alignment.toFixed(3)})`
    );
  });

  it('gives the extractive series higher extraction than abundance', () => {
    const r = classifyAlignment(extractiveSeries());
    assert.ok(
      r.extraction > r.abundance,
      `expected extraction (${r.extraction.toFixed(3)}) > abundance (${r.abundance.toFixed(3)})`
    );
  });

  it('returns zeros and mixed for empty input', () => {
    const r = classifyAlignment('');
    assert.equal(r.extraction, 0);
    assert.equal(r.abundance, 0);
    assert.equal(r.label, 'mixed');
    assert.equal(r.confidence, 0);
  });
});

describe('classifyAlignment — lexicon tilt', () => {
  it('detects extraction vocabulary as negative tilt', () => {
    const r = classifyAlignment(
      'We hoard the supply, drain the reserve, and exploit the scarcity to extract maximum rent.'
    );
    assert.ok(r.lexiconTilt < 0, `expected negative tilt, got ${r.lexiconTilt}`);
  });

  it('detects abundance vocabulary as positive tilt', () => {
    const r = classifyAlignment(
      'We share the harvest, replenish the commons, and circulate the gift so the field can regenerate and flourish.'
    );
    assert.ok(r.lexiconTilt > 0, `expected positive tilt, got ${r.lexiconTilt}`);
  });

  it('lexicon nudges but geometry decides: tilt shifts alignment by a bounded amount', () => {
    // Same text through both entry points: classifySignature is pure
    // geometry, classifyAlignment adds the lexicon. Their difference
    // is exactly the lexicon contribution, bounded by LEXICON_WEIGHT.
    const text = 'share gift regenerate commons ' + extractiveSeries();
    const geometryOnly = classifySignature(composedAtDepth(text, 4));
    const withLexicon = classifyAlignment(text);
    assert.ok(Math.abs(withLexicon.alignment - geometryOnly.alignment) <= 0.151);
    assert.ok(withLexicon.lexiconTilt > 0);
  });
});

describe('inspectAlignmentMarkers', () => {
  it('exposes named markers matching the weight tables', () => {
    const insp = inspectAlignmentMarkers(abundantSeries());
    assert.deepEqual(Object.keys(insp.extraction).sort(), Object.keys(EXTRACTION_WEIGHTS).sort());
    assert.deepEqual(Object.keys(insp.abundance).sort(), Object.keys(ABUNDANCE_WEIGHTS).sort());
    for (const v of Object.values(insp.extraction)) assert.ok(v >= 0 && v <= 1);
    for (const v of Object.values(insp.abundance)) assert.ok(v >= 0 && v <= 1);
  });

  it('oscillating series shows meaningful cyclicity marker', () => {
    const insp = inspectAlignmentMarkers(abundantSeries());
    assert.ok(insp.abundance.cyclicity > 0.2, `cyclicity ${insp.abundance.cyclicity}`);
    // And far above the accumulating series, which never crosses back.
    const exInsp = inspectAlignmentMarkers(extractiveSeries());
    assert.ok(insp.abundance.cyclicity > exInsp.abundance.cyclicity);
  });

  it('accumulating series shows high monotone or trend marker', () => {
    const insp = inspectAlignmentMarkers(extractiveSeries());
    assert.ok(
      insp.extraction.monotone > 0.5 || insp.extraction.trendStrength > 0.5,
      `monotone=${insp.extraction.monotone} trend=${insp.extraction.trendStrength}`
    );
  });
});

describe('weight tables', () => {
  it('each pole sums to 1 so pole scores are true weighted means', () => {
    const exSum = Object.values(EXTRACTION_WEIGHTS).reduce((s, w) => s + w, 0);
    const abSum = Object.values(ABUNDANCE_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(exSum - 1) < 1e-9, `extraction weights sum ${exSum}`);
    assert.ok(Math.abs(abSum - 1) < 1e-9, `abundance weights sum ${abSum}`);
  });

  it('every DIM index addresses inside the composed vector', () => {
    for (const [name, idx] of Object.entries(DIM)) {
      assert.ok(idx >= 0 && idx < COMPOSED_DIM, `${name}=${idx}`);
    }
  });
});
