const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createCircuitBreaker } = require('../seeds/circuit-breaker');

describe('circuit-breaker', () => {
  it('should allow calls in CLOSED state', () => {
    const cb = createCircuitBreaker({ threshold: 3 });
    const result = cb.exec(() => 42);
    assert.equal(result, 42);
    assert.equal(cb.status().state, 'CLOSED');
  });

  it('should open after threshold failures', () => {
    const cb = createCircuitBreaker({ threshold: 3, cooldownMs: 60000 });
    for (let i = 0; i < 3; i++) {
      assert.throws(() => cb.exec(() => { throw new Error('fail'); }));
    }
    assert.equal(cb.status().state, 'OPEN');
    assert.throws(() => cb.exec(() => 42), /Circuit OPEN/);
  });

  it('should recover after cooldown', () => {
    const cb = createCircuitBreaker({ threshold: 2, cooldownMs: 1 });
    assert.throws(() => cb.exec(() => { throw new Error('f1'); }));
    assert.throws(() => cb.exec(() => { throw new Error('f2'); }));
    assert.equal(cb.status().state, 'OPEN');

    // Wait for cooldown to expire
    const start = Date.now();
    while (Date.now() - start < 5) { /* busy wait */ }

    const result = cb.exec(() => 'recovered');
    assert.equal(result, 'recovered');
    assert.equal(cb.status().state, 'CLOSED');
  });

  it('should reset state', () => {
    const cb = createCircuitBreaker({ threshold: 2 });
    assert.throws(() => cb.exec(() => { throw new Error('fail'); }));
    assert.throws(() => cb.exec(() => { throw new Error('fail'); }));
    assert.equal(cb.status().state, 'OPEN');
    cb.reset();
    assert.equal(cb.status().state, 'CLOSED');
    assert.equal(cb.status().failures, 0);
  });

  it('should call onStateChange', () => {
    const transitions = [];
    const cb = createCircuitBreaker({
      threshold: 2,
      onStateChange: (t) => transitions.push(t),
    });
    assert.throws(() => cb.exec(() => { throw new Error('f'); }));
    assert.throws(() => cb.exec(() => { throw new Error('f'); }));
    assert.ok(transitions.some(t => t.to === 'OPEN'));
  });

  it('should handle async functions', async () => {
    const cb = createCircuitBreaker({ threshold: 3 });
    const result = await cb.exec(async () => 'async-ok');
    assert.equal(result, 'async-ok');
  });

  it('should track successes', () => {
    const cb = createCircuitBreaker();
    cb.exec(() => 1);
    cb.exec(() => 2);
    assert.equal(cb.status().successes, 2);
  });
});
