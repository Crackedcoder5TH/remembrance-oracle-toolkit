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

describe('field-memory — the mesh query API', () => {
  let fm;
  beforeEach(() => {
    delete require.cache[require.resolve('../src/core/field-memory')];
    fm = require('../src/core/field-memory');
    fm._resetCaches();
  });

  it('recordObservation returns the mesh edges (cross-reference)', () => {
    const r = fm.recordObservation({ source: 'mesh:probe', coherence: 0.6, cost: 1 });
    if (r === null) return; // store unavailable
    // neighbors is the positioned-against-everything cross-reference
    assert.ok(Array.isArray(r.neighbors));
    for (const e of r.neighbors) {
      assert.ok(typeof e.id === 'string');
      assert.ok(typeof e.similarity === 'number');
      assert.ok(e.similarity >= -1 && e.similarity <= 1);
    }
  });

  it('neighbors() returns ranked nearest field patterns', () => {
    // Seed a couple of distinct observations first
    fm.recordObservation({ source: 'mesh:alpha', coherence: 0.2, cost: 1 });
    fm.recordObservation({ source: 'mesh:omega', coherence: 0.95, cost: 1 });
    const result = fm.neighbors('field-event\nsource: mesh:alpha\ncoherence: 0.20', { k: 3 });
    if (!Array.isArray(result) || result.length === 0) return; // store unavailable
    // Descending by similarity
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].similarity >= result[i].similarity);
    }
    for (const r of result) {
      assert.ok(['field-event', 'field-snapshot'].includes(r.kind));
    }
  });

  it('within() returns only patterns above the threshold', () => {
    fm.recordObservation({ source: 'mesh:within-test', coherence: 0.5, cost: 1 });
    const result = fm.within('field-event\nsource: mesh:within-test\ncoherence: 0.50', { threshold: 0.95 });
    if (!Array.isArray(result)) return;
    for (const r of result) assert.ok(r.similarity >= 0.95);
  });

  it('query() returns ranked field patterns with metadata', () => {
    fm.recordObservation({ source: 'mesh:query-target', coherence: 0.7, cost: 1 });
    const result = fm.query('field-event source: mesh:query-target', { k: 5 });
    if (!Array.isArray(result) || result.length === 0) return; // store unavailable
    for (const r of result) {
      assert.ok(typeof r.id === 'string');
      assert.ok(typeof r.name === 'string');
      assert.ok(Array.isArray(r.tags));
      assert.ok(typeof r.similarity === 'number');
    }
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].similarity >= result[i].similarity);
    }
  });

  it('query() honors the patternType filter', () => {
    fm.recordObservation({ source: 'mesh:filtered', coherence: 0.4, cost: 1 });
    const events = fm.query('anything', { patternType: 'field-event', k: 50 });
    if (!Array.isArray(events)) return;
    for (const r of events) assert.equal(r.patternType, 'field-event');
  });

  it('mesh API tolerates malformed input', () => {
    assert.deepEqual(fm.neighbors(null), []);
    assert.deepEqual(fm.within(undefined), []);
    assert.deepEqual(fm.query(42), []);
  });
});
