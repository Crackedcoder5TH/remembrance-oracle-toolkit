const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('whisper-selector', () => {
  it('getTier maps values correctly', () => {
    assert.strictEqual(getTier(1), 'low');
    assert.strictEqual(getTier(3), 'low');
    assert.strictEqual(getTier(5), 'mid');
    assert.strictEqual(getTier(7), 'mid');
    assert.strictEqual(getTier(10), 'high');
  });

  it('pickFromPool returns item from pool', () => {
    const pool = ['a', 'b', 'c'];
    assert.ok(pool.includes(pickFromPool(pool)));
  });

  it('pickFromPool avoids excluded item', () => {
    const results = new Set();
    for (let i = 0; i < 50; i++) results.add(pickFromPool(['a', 'b'], 'a'));
    assert.ok(results.has('b'));
  });

  it('pickFromPool returns empty for empty pool', () => {
    assert.strictEqual(pickFromPool([]), '');
    assert.strictEqual(pickFromPool(null), '');
  });

  it('pickWhisper selects from correct tier', () => {
    const pools = { low: ['dim'], mid: ['forming'], high: ['bright'] };
    assert.strictEqual(pickWhisper(1, pools), 'dim');
    assert.strictEqual(pickWhisper(5, pools), 'forming');
    assert.strictEqual(pickWhisper(10, pools), 'bright');
  });
});
