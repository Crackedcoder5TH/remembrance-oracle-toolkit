const { describe, it } = require('node:test');
const assert = require('node:assert');
const { evictLowestPriority } = require('/tmp/debug-fix-queue-eviction.js');

describe('queue eviction on full', () => {
  it('evicts lowest priority when incoming is higher', () => {
    const pending = [{ id: '1', priority: 1 }, { id: '2', priority: 2 }, { id: '3', priority: 4 }];
    const evicted = evictLowestPriority(pending, 3);
    assert.strictEqual(evicted.id, '3');
    assert.strictEqual(pending.length, 2);
  });

  it('returns null when incoming is lower priority', () => {
    const pending = [{ id: '1', priority: 1 }, { id: '2', priority: 2 }];
    const evicted = evictLowestPriority(pending, 3);
    assert.strictEqual(evicted, null);
    assert.strictEqual(pending.length, 2);
  });

  it('handles empty queue', () => {
    assert.strictEqual(evictLowestPriority([], 1), null);
  });
});
