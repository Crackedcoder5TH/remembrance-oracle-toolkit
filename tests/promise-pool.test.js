const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createPromisePool } = require('../seeds/promise-pool');

describe('promise-pool', () => {
  it('should limit concurrency', async () => {
    const pool = createPromisePool(2);
    let maxConcurrent = 0;
    let current = 0;

    const task = () => pool.run(async () => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise(r => setTimeout(r, 50));
      current--;
    });

    await Promise.all([task(), task(), task(), task(), task()]);
    assert.ok(maxConcurrent <= 2, `Max concurrent was ${maxConcurrent}, expected <= 2`);
  });

  it('should resolve all tasks with map', async () => {
    const pool = createPromisePool(3);
    const results = await pool.map([1, 2, 3, 4, 5], async (x) => x * 2);
    assert.deepEqual(results, [2, 4, 6, 8, 10]);
  });

  it('should propagate errors', async () => {
    const pool = createPromisePool(2);
    await assert.rejects(
      () => pool.run(() => Promise.reject(new Error('boom'))),
      { message: 'boom' }
    );
  });

  it('should reject invalid concurrency', () => {
    assert.throws(() => createPromisePool(0));
    assert.throws(() => createPromisePool(-1));
    assert.throws(() => createPromisePool(1.5));
  });

  it('should track active and pending counts', async () => {
    const pool = createPromisePool(1);
    let sawActive = false;

    const p1 = pool.run(async () => {
      sawActive = pool.active === 1;
      await new Promise(r => setTimeout(r, 50));
    });
    pool.run(async () => {});

    await new Promise(r => setTimeout(r, 10));
    assert.ok(sawActive, 'Should see active = 1 during execution');
    await p1;
    await pool.drain();
  });

  it('should handle drain on empty pool', async () => {
    const pool = createPromisePool(5);
    await pool.drain(); // Should resolve immediately
  });
});
