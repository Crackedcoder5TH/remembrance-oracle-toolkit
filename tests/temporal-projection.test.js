const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  IDENTITY_ALIGNMENT,
  ALIGNMENT_CLAMP,
  parseTimestamp,
  cadenceToMs,
  isTimeAligned,
  classifyWaveform,
  projectForward,
  projectionConfidence,
  gateProjection,
  pearson,
  computeRetrocausalAlignment,
} = require('../src/atomic/temporal-projection');

const { reflectionScore } = require('../src/core/reflection-serf');

// ─── Helpers ────────────────────────────────────────────────────

function sineWave(n, periods = 4, phase = 0) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(2 * Math.PI * periods * (i / n) + phase);
  }
  return out;
}
function trendWave(n, slope = 0.01, intercept = 0) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = intercept + slope * i;
  return out;
}
function flatNoise(n, mean = 0.5, jitter = 0.01) {
  // Deterministic LCG — avoids the periodic structure of Math.sin.
  const out = new Array(n);
  let x = 0.371234;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    out[i] = mean + ((x / 233280) - 0.5) * 2 * jitter;
  }
  return out;
}

const NOW = Date.parse('2026-04-23T00:00:00Z');
const MS = { d: 86_400_000, h: 3_600_000, min: 60_000, s: 1_000 };

function ledger({ startISO, endISO, cadence }) {
  return { observed_start: startISO, observed_end: endISO, cadence };
}

// ─── Helper validation ─────────────────────────────────────────

describe('parseTimestamp', () => {
  it('parses ISO-8601 strings', () => {
    assert.equal(parseTimestamp('2026-04-23T00:00:00Z'), Date.parse('2026-04-23T00:00:00Z'));
  });
  it('passes through finite numbers', () => {
    assert.equal(parseTimestamp(1234567890), 1234567890);
  });
  it('returns null for null / undefined / garbage', () => {
    assert.equal(parseTimestamp(null), null);
    assert.equal(parseTimestamp(undefined), null);
    assert.equal(parseTimestamp('not a date'), null);
    assert.equal(parseTimestamp({}), null);
  });
});

describe('cadenceToMs', () => {
  it('parses common units', () => {
    assert.equal(cadenceToMs('15min'), 15 * MS.min);
    assert.equal(cadenceToMs('1h'), MS.h);
    assert.equal(cadenceToMs('1d'), MS.d);
    assert.equal(cadenceToMs('100kyr'), 100 * 31_557_600_000_000);
  });
  it('returns null for "variable" and unknown', () => {
    assert.equal(cadenceToMs('variable'), null);
    assert.equal(cadenceToMs('1eon'), null);
    assert.equal(cadenceToMs(null), null);
  });
});

describe('isTimeAligned', () => {
  it('is true when all three ledger fields are present', () => {
    const p = { ledger: ledger({ startISO: '2026-01-01T00:00:00Z', endISO: '2026-04-01T00:00:00Z', cadence: '1d' }) };
    assert.equal(isTimeAligned(p), true);
  });
  it('is false when any field is missing', () => {
    assert.equal(isTimeAligned({ ledger: { observed_start: 'x', observed_end: 'y' } }), false);
    assert.equal(isTimeAligned({ ledger: { observed_start: 'x', cadence: '1d' } }), false);
    assert.equal(isTimeAligned({ ledger: { observed_end: 'y', cadence: '1d' } }), false);
  });
  it('is false for missing ledger', () => {
    assert.equal(isTimeAligned({}), false);
    assert.equal(isTimeAligned(null), false);
  });
});

// ─── Classification ────────────────────────────────────────────

describe('classifyWaveform', () => {
  it('detects periodic signals', () => {
    assert.equal(classifyWaveform(sineWave(64, 4)), 'periodic');
  });
  it('detects monotonic trends', () => {
    assert.equal(classifyWaveform(trendWave(64, 0.01)), 'trend');
  });
  it('detects distributions (flat-ish around a mean)', () => {
    assert.equal(classifyWaveform(flatNoise(64, 0.5, 0.01)), 'distribution');
  });
  it('returns unknown for too-short or NaN-tainted arrays', () => {
    assert.equal(classifyWaveform([1, 2, 3]), 'unknown');
    assert.equal(classifyWaveform([1, NaN, 3, 4, 5, 6, 7, 8]), 'unknown');
  });
});

// ─── Projection ────────────────────────────────────────────────

describe('projectForward', () => {
  it('returns the stored waveform when ledger is missing', () => {
    const w = sineWave(64, 4);
    const out = projectForward({ waveform: w }, NOW);
    assert.deepEqual(out, w);
  });

  it('returns the stored waveform when observed_end >= tNow', () => {
    const w = sineWave(64, 4);
    const p = { waveform: w, ledger: ledger({
      startISO: '2026-04-22T00:00:00Z',
      endISO:   '2026-04-25T00:00:00Z', // future
      cadence: '1h',
    })};
    const out = projectForward(p, NOW);
    assert.deepEqual(out, w);
  });

  it('shifts a periodic waveform by the right number of samples', () => {
    const w = sineWave(64, 4);
    const observedEnd = NOW - 8 * MS.h;
    const p = { waveform: w, ledger: {
      observed_start: new Date(NOW - 64 * MS.h).toISOString(),
      observed_end: new Date(observedEnd).toISOString(),
      cadence: '1h',
    }};
    const out = projectForward(p, NOW);
    assert.equal(out.length, w.length);
    assert.notDeepEqual(out, w); // should have shifted
  });

  it('extrapolates a trend by adding slope * stepsAhead', () => {
    const w = trendWave(64, 0.01, 0);
    const observedEnd = NOW - 10 * MS.h;
    const p = { waveform: w, ledger: {
      observed_start: new Date(NOW - 64 * MS.h).toISOString(),
      observed_end: new Date(observedEnd).toISOString(),
      cadence: '1h',
    }};
    const out = projectForward(p, NOW);
    assert.equal(out.length, w.length);
    // the projected mean should be greater than the historical mean (positive slope)
    const om = w.reduce((s, v) => s + v, 0) / w.length;
    const pm = out.reduce((s, v) => s + v, 0) / out.length;
    assert.ok(pm > om, `Expected projected mean ${pm} > original ${om}`);
  });

  it('is a no-op for distribution shape (zero-order hold)', () => {
    const w = flatNoise(64, 0.5, 0.01);
    const p = { waveform: w, ledger: {
      observed_start: new Date(NOW - 64 * MS.h).toISOString(),
      observed_end:   new Date(NOW - 8 * MS.h).toISOString(),
      cadence: '1h',
    }};
    const out = projectForward(p, NOW);
    assert.deepEqual(out, w);
  });
});

// ─── Confidence ────────────────────────────────────────────────

describe('projectionConfidence', () => {
  it('is 0 when ledger missing', () => {
    assert.equal(projectionConfidence({ waveform: sineWave(64, 4) }, NOW), 0);
  });
  it('is 0 when observed_end >= tNow', () => {
    const p = { waveform: sineWave(64, 4), ledger: {
      observed_start: '2026-04-20T00:00:00Z',
      observed_end:   new Date(NOW + MS.d).toISOString(),
      cadence: '1h',
    }};
    assert.equal(projectionConfidence(p, NOW), 0);
  });
  it('decays smoothly toward zero as horizon approaches', () => {
    const w = sineWave(64, 4);
    const observedStart = NOW - 10 * MS.h;
    const observedEnd = NOW - 1 * MS.h;
    const p = { waveform: w, ledger: {
      observed_start: new Date(observedStart).toISOString(),
      observed_end: new Date(observedEnd).toISOString(),
      cadence: '1h',
    }};
    const c1 = projectionConfidence(p, observedEnd + 5 * MS.h);
    const c2 = projectionConfidence(p, observedEnd + 50 * MS.h);
    assert.ok(c1 > c2, `Expected confidence to decay: ${c1} vs ${c2}`);
    assert.ok(c1 > 0 && c1 <= 1);
    assert.ok(c2 >= 0);
  });
});

// ─── Covenant gate ─────────────────────────────────────────────

describe('gateProjection', () => {
  it('rejects empty / mismatched length', () => {
    assert.equal(gateProjection([], [1, 2, 3]), false);
    assert.equal(gateProjection([1, 2], [1, 2, 3]), false);
  });
  it('rejects NaN / Inf in projection', () => {
    assert.equal(gateProjection([1, NaN, 3], [1, 2, 3]), false);
    assert.equal(gateProjection([1, Infinity, 3], [1, 2, 3]), false);
  });
  it('rejects projection mean far from original mean (>4σ)', () => {
    const original = [0.4, 0.5, 0.6, 0.45, 0.55];
    const original_std = Math.sqrt(original.reduce((s, v) => s + (v - 0.5) ** 2, 0) / original.length);
    const wayOff = original.map(v => v + 100 * original_std);
    assert.equal(gateProjection(wayOff, original), false);
  });
  it('passes a reasonable projection', () => {
    const original = sineWave(32, 2);
    const projected = sineWave(32, 2, 0.5); // phase-shifted, same shape
    assert.equal(gateProjection(projected, original), true);
  });
  it('allows anything when original has zero variance (flat)', () => {
    const flat = new Array(32).fill(0.5);
    assert.equal(gateProjection(flat.map(v => v + 0.1), flat), true);
  });
});

// ─── Pearson sanity ────────────────────────────────────────────

describe('pearson', () => {
  it('is 1 for identical', () => {
    const w = sineWave(32, 3);
    assert.equal(pearson(w, w), 1);
  });
  it('is 0 for null/mismatch', () => {
    assert.equal(pearson(null, [1, 2, 3]), 0);
    assert.equal(pearson([1, 2], [1, 2, 3]), 0);
    assert.equal(pearson([], []), 0);
  });
});

// ─── computeRetrocausalAlignment ───────────────────────────────

describe('computeRetrocausalAlignment', () => {
  it('returns IDENTITY (1.0) when candidate has no ledger', () => {
    const cand = { code: 'foo', waveform: sineWave(32, 3) };
    const prev = { code: 'bar', waveform: sineWave(32, 3) };
    assert.equal(computeRetrocausalAlignment(cand, prev), IDENTITY_ALIGNMENT);
  });

  it('returns IDENTITY when ledger incomplete', () => {
    const cand = {
      waveform: sineWave(32, 3),
      ledger: { observed_start: '2026-01-01T00:00:00Z' },
    };
    assert.equal(computeRetrocausalAlignment(cand, {}, { tNow: NOW }), IDENTITY_ALIGNMENT);
  });

  it('returns IDENTITY when observed_end is in the future', () => {
    const cand = {
      waveform: sineWave(32, 3),
      ledger: {
        observed_start: new Date(NOW - MS.d).toISOString(),
        observed_end: new Date(NOW + MS.d).toISOString(),
        cadence: '1h',
      },
    };
    assert.equal(computeRetrocausalAlignment(cand, {}, { tNow: NOW }), IDENTITY_ALIGNMENT);
  });

  it('returns a value within ALIGNMENT_CLAMP for a healthy projection', () => {
    const w = sineWave(64, 4);
    const cand = {
      waveform: w,
      ledger: {
        observed_start: new Date(NOW - 64 * MS.h).toISOString(),
        observed_end:   new Date(NOW - 8 * MS.h).toISOString(),
        cadence: '1h',
      },
    };
    const prev = { waveform: sineWave(64, 4, 0.2) };
    const a = computeRetrocausalAlignment(cand, prev, { tNow: NOW });
    assert.ok(a >= ALIGNMENT_CLAMP[0] && a <= ALIGNMENT_CLAMP[1],
      `Expected within clamp, got ${a}`);
  });

  it('never throws for malformed inputs', () => {
    assert.doesNotThrow(() => computeRetrocausalAlignment(null, null));
    assert.doesNotThrow(() => computeRetrocausalAlignment({}, null));
    assert.doesNotThrow(() => computeRetrocausalAlignment(
      { waveform: 'not an array', ledger: { observed_start: 'x', observed_end: 'y', cadence: '1d' } },
      null,
    ));
  });
});

// ─── Identity regression on reflection-serf ────────────────────

describe('reflectionScore time-aware identity regression', () => {
  it('default callers (timeAwareMode unset) get identical scores to before', () => {
    const cand = { code: 'const x = 1;', coherence: 0.8 };
    const prev = { code: 'var x = 1;', coherence: 0.7 };
    const scoreNoFlag = reflectionScore(cand, prev, {});
    const scoreFalseFlag = reflectionScore(cand, prev, { timeAwareMode: false });
    assert.equal(scoreNoFlag, scoreFalseFlag);
  });

  it('timeAwareMode=true on candidate without ledger leaves score unchanged', () => {
    const cand = { code: 'const x = 1;', coherence: 0.8 };
    const prev = { code: 'var x = 1;', coherence: 0.7 };
    const scoreNoFlag = reflectionScore(cand, prev, {});
    const scoreAware = reflectionScore(cand, prev, { timeAwareMode: true, tNow: NOW });
    assert.equal(scoreNoFlag, scoreAware);
  });
});
