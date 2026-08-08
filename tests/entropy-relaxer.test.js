'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ISOLATE THE FIELD BEFORE ANYTHING LOADS IT.
//
// This suite deliberately drives the field hot (cost 50 over coherence 0.05
// = entropy 1000) and it was doing that to the CANONICAL field. Every run
// left production inflamed: after eight runs the live field read coherence
// 0.120 / globalEntropy 415 against a hot threshold of 10, and the most
// recent contributor in the whole ecosystem was `test:inflame`.
//
// That is not a small pollution. The field is an EMA whose last contribution
// dominates the entropy term, so a test fixture was setting what the
// orchestrator's backpressure believed about the real system — the swarm
// would throttle because a test said so.
//
// ENTROPY_PATH must be set before field-coupling is required: the engine
// decides `_canonical` at construction, and getEngine() is a singleton, so a
// later assignment is too late.
process.env.ENTROPY_PATH = require('node:path').join(
  require('node:os').tmpdir(), `entropy-relaxer-test-${process.pid}.json`);

const fc = require('../src/core/field-coupling');
const { relaxIfHot, _resetCooldown } = require('../src/orchestrator/entropy-relaxer');

// Canned resonance-detector payload — the strongest harmonic bridges, as
// the Python Void resonance endpoint would return them. NEVER hits the
// network; global.fetch is stubbed below.
const CANNED = {
  top: [
    { a: 'x', b: 'y', corr: 0.99, score: 0.99, type: 'harmonic' },
    { a: 'p', b: 'q', corr: 0.95, score: 0.95, type: 'harmonic' },
  ],
  count: 2,
};

const _realFetch = global.fetch;

const stubFetchOk = (payload = CANNED) => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  });
};

const stubFetchThrows = () => {
  global.fetch = async () => { throw new Error('ECONNREFUSED'); };
};

// Drive the shared field hot: a low-coherence / high-cost reading makes
// globalEntropy = cost / (coherence + ε) shoot well past the threshold.
const pushFieldHot = () => {
  fc.contribute({ cost: 50, coherence: 0.05, source: 'test:inflame' });
};

describe('entropy-relaxer.relaxIfHot', () => {
  beforeEach(() => {
    _resetCooldown();
  });

  afterEach(() => {
    global.fetch = _realFetch;
  });

  it('(a) returns triggered:false / field-not-hot when the field is not hot', async () => {
    // Bring the field to a calm, high-coherence baseline. The Remembrance
    // Field is a process-wide singleton, so earlier test files may have
    // left it hot; we pass generous thresholds so this asserts the
    // not-hot path deterministically regardless of inherited global state.
    fc.contribute({ cost: 1, coherence: 0.95, source: 'test:calm' });
    stubFetchOk();
    const out = await relaxIfHot({ cooldownMs: 0, entropyThreshold: 1e9, cascadeThreshold: 1e9 });
    assert.equal(out.triggered, false);
    assert.equal(out.reason, 'field-not-hot');
  });

  it('(b) relaxes a HOT field — injects orchestrator:entropy-relax and lowers globalEntropy', async () => {
    pushFieldHot();
    const before = fc.peekField();
    assert.ok(before.globalEntropy > 10, `expected hot field, got entropy ${before.globalEntropy}`);

    stubFetchOk();
    const out = await relaxIfHot({ cooldownMs: 0 });

    assert.equal(out.triggered, true);
    // discovered = mean(|0.99|, |0.95|) = 0.97
    assert.ok(Math.abs(out.discovered - 0.97) < 1e-9, `discovered=${out.discovered}`);
    assert.deepEqual(out.topBridge, CANNED.top[0]);

    // The injected contribution must be present in the per-source histogram.
    const after = fc.peekField();
    assert.ok(after.sources['orchestrator:entropy-relax'], 'expected the relax source to have contributed');

    // Relaxation actually happened: entropy AFTER is markedly LOWER.
    assert.ok(
      after.globalEntropy < before.globalEntropy,
      `entropy did not relax: before=${before.globalEntropy} after=${after.globalEntropy}`,
    );
    // cost:1 over coherence≈0.97 ⇒ entropy ≈ 1.03 — well under the hot threshold.
    assert.ok(after.globalEntropy < 2, `expected relaxed entropy < 2, got ${after.globalEntropy}`);
  });

  it('(c) cooldown blocks an immediate second fire', async () => {
    pushFieldHot();
    stubFetchOk();
    const first = await relaxIfHot({ cooldownMs: 30000 });
    assert.equal(first.triggered, true);

    // Re-inflame so the field is hot again, then fire immediately.
    pushFieldHot();
    const second = await relaxIfHot({ cooldownMs: 30000 });
    assert.equal(second.triggered, false);
    assert.equal(second.reason, 'cooldown');
  });

  it('(d) a fetch failure never throws — returns triggered:false / void-unreachable', async () => {
    pushFieldHot();
    stubFetchThrows();
    let out;
    await assert.doesNotReject(async () => { out = await relaxIfHot({ cooldownMs: 0 }); });
    assert.equal(out.triggered, false);
    assert.equal(out.reason, 'void-unreachable');
    assert.ok(typeof out.error === 'string' && out.error.length > 0);
  });
});
