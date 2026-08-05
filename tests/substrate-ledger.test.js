'use strict';
// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state

const test = require('node:test');
const assert = require('node:assert');

const SL = require('../src/core/substrate-ledger');

// ── stamp(): unmeasured is not zero ──────────────────────────────────────
// stamp() used to fall back to `coherence = 0` whenever no reading was
// available. Zero is the strongest possible claim ("perfectly incoherent")
// made from no evidence, and it drags every mean that includes it. Absence
// must be absence.

test('stamp omits coherence entirely when there is no reading', () => {
  const e = SL.stamp({}, { sequence: 1, content: 'some text content here' });
  assert.equal('coherence' in e, false,
    'an unmeasured entry must carry no coherence key, not a fabricated 0');
  assert.ok(e.ledger, 'the time dimension is still stamped');
});

test('stamp omits coherence when the reading is explicitly null (service down)', () => {
  const e = SL.stamp({}, { sequence: 2, content: 'abc def ghi', coherence: null });
  assert.equal('coherence' in e, false);
});

test('stamp records an explicit reading', () => {
  const e = SL.stamp({}, { sequence: 3, content: 'x', coherence: 0.42 });
  assert.equal(e.coherence, 0.42);
});

test('stamp clamps an explicit reading into [0,1]', () => {
  assert.equal(SL.stamp({}, { sequence: 4, coherence: 1.7 }).coherence, 1);
  assert.equal(SL.stamp({}, { sequence: 5, coherence: -3 }).coherence, 0);
});

test('stamp still derives coherence from a genuine numeric series', () => {
  const series = Array.from({ length: 64 }, (_, i) => Math.sin(i / 4));
  const e = SL.stamp({}, { sequence: 6, series });
  assert.equal(typeof e.coherence, 'number');
  assert.ok(e.coherence > 0.8, `a clean sine is coherent, got ${e.coherence}`);
});

test('stamp does not resurrect a stale coherence on re-stamp', () => {
  const e = { coherence: 0.9 };
  SL.stamp(e, { sequence: 7, content: 'no reading available' });
  assert.equal('coherence' in e, false,
    're-stamping without a reading must clear the old one, not keep it');
});

// ── seriesCoherence: what it is valid on ─────────────────────────────────
// It is accurate on a genuine time series and meaningless on a feature
// vector. Both halves are pinned here, because the second is how the
// substrate's ingest reading was wrong for its whole history: it was applied
// to the 29-D fractal vector, whose slots are named heterogeneous features
// (charge, valence, mass, … structurality) rather than consecutive samples.

test('seriesCoherence reads a clean signal high and noise low', () => {
  const sine = Array.from({ length: 232 }, (_, i) => Math.sin(2 * Math.PI * 4 * i / 232));
  assert.ok(SL.seriesCoherence(sine) > 0.9, 'a pure sine is coherent');

  // deterministic pseudo-noise — no seeded RNG needed, and no flakiness
  let s = 7;
  const noise = Array.from({ length: 232 }, () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff - 0.5;
  });
  assert.ok(SL.seriesCoherence(noise) < 0.4, 'white noise is not coherent');
});

test('seriesCoherence is order-dependent — so it must not be used on feature vectors', () => {
  // A fractal vector's slot order is an authoring choice, identical for every
  // file. If a reading survives permuting it, the reading is about the values;
  // if it does not, the reading is about the ordering. This asserts the latter,
  // which is exactly why seriesCoherence(fractal) was not measuring the file.
  const vec = [0.5, 0.0, 0.5, 1.0, 0.7, 0.33, 0.2, 0.611, 0.43, 1.0, 0.5, 0.5,
    0.9, 0.05, 0.02, 0.0, 0.0, 0.11, 0.4, 0.08, 0.02, 0.15, 0.3, 0.2, 0.6, 0.3, 0.1, 0.25, 0.8];
  // NOT reverse(): reversal preserves autocorrelation at every lag and leaves
  // trend r² unchanged (the slope flips sign, r² does not), so seriesCoherence
  // is invariant under it — a reversed vector reads identically and would make
  // this test pass for the wrong reason. A genuine scramble is required.
  const perm = [7, 22, 3, 15, 0, 28, 11, 19, 5, 26, 1, 13, 24, 8, 17, 2,
    20, 9, 27, 4, 14, 25, 6, 18, 10, 21, 16, 12, 23];
  const permuted = perm.map((i) => vec[i]);
  const a = SL.seriesCoherence(vec);
  const b = SL.seriesCoherence(permuted);
  assert.notEqual(a.toFixed(3), b.toFixed(3),
    'reordering the slots changes the reading — it measures order, not content');
});

test('seriesCoherence returns 0 for degenerate input rather than throwing', () => {
  assert.equal(SL.seriesCoherence(null), 0);
  assert.equal(SL.seriesCoherence([]), 0);
  assert.equal(SL.seriesCoherence([1, 2]), 0);
  assert.equal(SL.seriesCoherence([5, 5, 5, 5, 5, 5]), 0, 'a constant has no structure to read');
});

// ── nextSequence: the shared clock ───────────────────────────────────────

test('nextSequence is one past the highest sequence in the index', () => {
  const index = {
    a: { ledger: { sequence: 4 } },
    b: { ledger: { sequence: 11 } },
    c: { /* no ledger — must not break the clock */ },
  };
  assert.equal(SL.nextSequence(index), 12);
});

test('nextSequence starts at 0 on an empty index', () => {
  assert.equal(SL.nextSequence({}), 0);
});
