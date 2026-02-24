const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createPriorityQueue } = require('../seeds/priority-queue');

describe('priority-queue', () => {
  it('should dequeue lowest priority first (min-heap)', () => {
    const pq = createPriorityQueue();
    pq.push({ value: 'c', priority: 3 });
    pq.push({ value: 'a', priority: 1 });
    pq.push({ value: 'b', priority: 2 });

    assert.equal(pq.pop().value, 'a');
    assert.equal(pq.pop().value, 'b');
    assert.equal(pq.pop().value, 'c');
  });

  it('should support max-heap via comparator', () => {
    const pq = createPriorityQueue((a, b) => b.priority - a.priority);
    pq.push({ value: 'low', priority: 1 });
    pq.push({ value: 'high', priority: 10 });
    pq.push({ value: 'mid', priority: 5 });

    assert.equal(pq.pop().value, 'high');
    assert.equal(pq.pop().value, 'mid');
    assert.equal(pq.pop().value, 'low');
  });

  it('should peek without removing', () => {
    const pq = createPriorityQueue();
    pq.push({ value: 'x', priority: 5 });
    pq.push({ value: 'y', priority: 1 });

    assert.equal(pq.peek().value, 'y');
    assert.equal(pq.size, 2);
  });

  it('should handle empty queue', () => {
    const pq = createPriorityQueue();
    assert.equal(pq.pop(), undefined);
    assert.equal(pq.peek(), undefined);
    assert.ok(pq.isEmpty());
  });

  it('should track size correctly', () => {
    const pq = createPriorityQueue();
    assert.equal(pq.size, 0);
    pq.push({ priority: 1 });
    pq.push({ priority: 2 });
    assert.equal(pq.size, 2);
    pq.pop();
    assert.equal(pq.size, 1);
  });

  it('should handle many items', () => {
    const pq = createPriorityQueue();
    const items = Array.from({ length: 100 }, (_, i) => ({ priority: 100 - i }));
    items.forEach(item => pq.push(item));

    let prev = -Infinity;
    while (!pq.isEmpty()) {
      const item = pq.pop();
      assert.ok(item.priority >= prev, `Out of order: ${item.priority} < ${prev}`);
      prev = item.priority;
    }
  });

  it('should return sorted array', () => {
    const pq = createPriorityQueue();
    pq.push({ priority: 3 });
    pq.push({ priority: 1 });
    pq.push({ priority: 2 });
    const arr = pq.toArray();
    assert.deepEqual(arr.map(x => x.priority), [1, 2, 3]);
  });

  it('should handle duplicate priorities', () => {
    const pq = createPriorityQueue();
    pq.push({ value: 'a', priority: 1 });
    pq.push({ value: 'b', priority: 1 });
    pq.push({ value: 'c', priority: 1 });
    assert.equal(pq.size, 3);
    pq.pop(); pq.pop(); pq.pop();
    assert.ok(pq.isEmpty());
  });
});
