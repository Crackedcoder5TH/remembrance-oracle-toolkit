const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  wireEventFieldBridge,
  _coherenceFor,
  _costFor,
} = require('../src/core/event-field-bridge');
const { peekField } = require('../src/core/field-coupling');

function fakeOracle() {
  const listeners = [];
  return {
    on: (l) => { listeners.push(l); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; },
    _emit: (e) => { for (const l of [...listeners]) l(e); },
  };
}

describe('event-field-bridge — coherence mapping', () => {
  it('maps positive outcomes to high coherence', () => {
    assert.ok(_coherenceFor({ type: 'pattern_registered', coherency: 0.9 }) >= 0.85);
    assert.ok(_coherenceFor({ type: 'auto_promote', coherency: 0.9 }) >= 0.85);
    assert.ok(_coherenceFor({ type: 'entangled' }) >= 0.8);
  });

  it('maps failure events to low coherence', () => {
    assert.ok(_coherenceFor({ type: 'auto_heal_failed' }) <= 0.2);
    assert.ok(_coherenceFor({ type: 'rejection_captured' }) <= 0.2);
    assert.ok(_coherenceFor({ type: 'regressions_detected' }) <= 0.25);
  });

  it('clamps payload values to [0, 1]', () => {
    assert.equal(_coherenceFor({ type: 'auto_heal', newCoherency: 1.5 }), 1);
    assert.equal(_coherenceFor({ type: 'auto_heal', newCoherency: -0.5 }), 0);
    assert.equal(_coherenceFor({ type: 'auto_heal', newCoherency: NaN }), 0.5);
  });

  it('returns null for unknown event types (caller decides)', () => {
    assert.equal(_coherenceFor({ type: 'this-event-does-not-exist' }), null);
  });

  it('returns null for malformed events', () => {
    assert.equal(_coherenceFor(null), null);
    assert.equal(_coherenceFor({}), null);
    assert.equal(_coherenceFor({ type: 123 }), null);
  });
});

describe('event-field-bridge — cost extraction', () => {
  it('uses count/spawned/totalDecohered/etc from payload', () => {
    assert.equal(_costFor({ type: 'cascade_spawn', spawned: 3 }), 3);
    assert.equal(_costFor({ type: 'decoherence_sweep', totalDecohered: 7 }), 7);
    assert.equal(_costFor({ type: 'field_reexcited', reexcited: 5 }), 5);
    assert.equal(_costFor({ type: 'harvest_complete', harvested: 12 }), 12);
  });

  it('defaults to 1 when no batch hint is present', () => {
    assert.equal(_costFor({ type: 'feedback' }), 1);
    assert.equal(_costFor(null), 1);
  });
});

describe('event-field-bridge — wiring', () => {
  beforeEach(() => {
    // Defensive: each test gets a fresh fake oracle, but field-coupling
    // is process-wide. That's fine — we observe deltas.
  });

  it('contributes one field observation per known emit', () => {
    const oracle = fakeOracle();
    wireEventFieldBridge(oracle);

    const before = peekField();
    if (!before) return; // field unavailable — best-effort path
    const beforeCount = before.sources?.['event:pattern_registered']?.count || 0;

    oracle._emit({ type: 'pattern_registered', coherency: 0.88 });

    const after = peekField();
    const afterCount = after.sources?.['event:pattern_registered']?.count || 0;
    assert.equal(afterCount, beforeCount + 1);
  });

  it('skips unknown event types instead of mislabeling them', () => {
    const oracle = fakeOracle();
    wireEventFieldBridge(oracle);

    const before = peekField();
    if (!before) return;
    const beforeKeys = new Set(Object.keys(before.sources || {}));

    oracle._emit({ type: 'totally-unknown-event' });

    const after = peekField();
    const afterKeys = new Set(Object.keys(after.sources || {}));
    assert.ok(!afterKeys.has('event:totally-unknown-event'),
      'unknown event types must not enter the histogram');
    // Also: no new event:* key beyond what was already there
    const newEventKeys = [...afterKeys].filter(k => k.startsWith('event:') && !beforeKeys.has(k));
    assert.deepEqual(newEventKeys, [],
      `expected no new event:* keys, got ${JSON.stringify(newEventKeys)}`);
  });

  it('is idempotent — second wire does not double-subscribe', () => {
    const oracle = fakeOracle();
    wireEventFieldBridge(oracle);
    wireEventFieldBridge(oracle);

    const before = peekField();
    if (!before) return;
    const beforeCount = before.sources?.['event:auto_promote']?.count || 0;

    oracle._emit({ type: 'auto_promote', coherency: 0.9 });

    const after = peekField();
    const afterCount = after.sources?.['event:auto_promote']?.count || 0;
    assert.equal(afterCount, beforeCount + 1, 'should contribute exactly once');
  });

  it('returns a no-op unsubscribe when oracle is missing .on', () => {
    const off = wireEventFieldBridge({});
    assert.equal(typeof off, 'function');
    off(); // must not throw
  });
});
