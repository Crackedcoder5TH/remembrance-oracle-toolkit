const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { codeToWaveform, waveformCosine } = require('../src/core/code-to-waveform');

describe('waveformCosine — canonical comparison primitive', () => {
  it('returns 1 for a waveform against itself', () => {
    const w = Array.from(codeToWaveform('function f() { return 1; }'));
    assert.ok(Math.abs(waveformCosine(w, w) - 1) < 1e-9);
  });

  it('returns a value in [-1, 1] for distinct waveforms', () => {
    const a = Array.from(codeToWaveform('alpha beta gamma'));
    const b = Array.from(codeToWaveform('completely different content here'));
    const sim = waveformCosine(a, b);
    assert.ok(sim >= -1 && sim <= 1);
  });

  it('returns 0 for empty input', () => {
    assert.equal(waveformCosine([], [1, 2, 3]), 0);
    assert.equal(waveformCosine(null, [1, 2, 3]), 0);
  });

  it('similar text yields higher cosine than dissimilar text', () => {
    const base = Array.from(codeToWaveform('the quick brown fox jumps'));
    const near = Array.from(codeToWaveform('the quick brown fox leaps'));
    const far = Array.from(codeToWaveform('9182 7364 5texture zzz'));
    assert.ok(waveformCosine(base, near) > waveformCosine(base, far));
  });
});

describe('field-memory — compression + recall', () => {
  let fm;
  beforeEach(() => {
    // Fresh require each test so the module's lazy store/cache reset cleanly.
    delete require.cache[require.resolve('../src/core/field-memory')];
    fm = require('../src/core/field-memory');
    fm._resetCaches();
  });

  it('exposes a sane NOVELTY_THRESHOLD and SNAPSHOT_EVERY', () => {
    assert.ok(fm.NOVELTY_THRESHOLD > 0.5 && fm.NOVELTY_THRESHOLD < 1);
    assert.ok(fm.SNAPSHOT_EVERY >= 1);
  });

  it('recordObservation returns a result shape (or null if store unavailable)', () => {
    const r = fm.recordObservation({ source: 'test:probe', coherence: 0.8, cost: 1 });
    // Best-effort: null when the canonical store can't open in this env.
    if (r === null) return;
    assert.ok(typeof r.stored === 'boolean');
    assert.ok(typeof r.digest === 'string');
  });

  it('drops a redundant observation (same source + coherence bucket)', () => {
    const first = fm.recordObservation({ source: 'test:dedup', coherence: 0.81, cost: 1 });
    if (first === null) return; // store unavailable — skip
    // Same source, coherence in the same 2-decimal bucket → identical text →
    // identical waveform → similarity gate drops it.
    const second = fm.recordObservation({ source: 'test:dedup', coherence: 0.811, cost: 1 });
    assert.equal(second.stored, false, 'redundant observation must be dropped by the compressor');
  });

  it('ignores malformed observations', () => {
    assert.equal(fm.recordObservation(null), null);
    assert.equal(fm.recordObservation({ coherence: 0.5 }), null); // no source
  });

  it('recall returns a familiarity verdict shape', () => {
    const state = {
      updateCount: 10, coherence: 0.7, cascadeFactor: 2, globalEntropy: 1,
      sources: { 'a:b': { count: 3, lastCoherence: 0.9 } },
    };
    const r = fm.recall(state);
    if (r === null) return; // store unavailable — skip
    assert.ok(typeof r.familiar === 'boolean');
    assert.ok(typeof r.similarity === 'number');
    assert.ok(typeof r.snapshotCount === 'number');
  });

  it('snapshot encodes a field state without throwing', () => {
    const state = {
      updateCount: 42, coherence: 0.65, cascadeFactor: 3.1, globalEntropy: 1.5,
      sources: {
        'covenant': { count: 100, lastCoherence: 0.999 },
        'reflect': { count: 20, lastCoherence: 0.88 },
      },
    };
    const r = fm.snapshot(state);
    if (r === null) return; // store unavailable — skip
    assert.ok(typeof r.stored === 'boolean');
  });

  it('maybeSnapshot does not throw on null state', () => {
    assert.doesNotThrow(() => fm.maybeSnapshot(null));
  });
});
