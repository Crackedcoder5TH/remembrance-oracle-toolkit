const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createPriorityQueue', () => {
  it('should dequeue items in priority order', () => {
    const pq = createPriorityQueue();
    pq.enqueue('low', 10);
    pq.enqueue('high', 1);
    pq.enqueue('medium', 5);
    assert.strictEqual(pq.dequeue(), 'high');
    assert.strictEqual(pq.dequeue(), 'medium');
    assert.strictEqual(pq.dequeue(), 'low');
  });

  it('should peek at highest priority item', () => {
    const pq = createPriorityQueue();
    pq.enqueue('a', 3);
    pq.enqueue('b', 1);
    pq.enqueue('c', 2);
    assert.strictEqual(pq.peek(), 'b');
    assert.strictEqual(pq.size(), 3);
  });

  it('should track size correctly', () => {
    const pq = createPriorityQueue();
    assert.strictEqual(pq.size(), 0);
    pq.enqueue('x', 1);
    pq.enqueue('y', 2);
    assert.strictEqual(pq.size(), 2);
    pq.dequeue();
    assert.strictEqual(pq.size(), 1);
  });

  it('should return undefined for dequeue/peek on empty queue', () => {
    const pq = createPriorityQueue();
    assert.strictEqual(pq.dequeue(), undefined);
    assert.strictEqual(pq.peek(), undefined);
  });

  it('should handle items with equal priority', () => {
    const pq = createPriorityQueue();
    pq.enqueue('first', 1);
    pq.enqueue('second', 1);
    const result1 = pq.dequeue();
    const result2 = pq.dequeue();
    assert.strictEqual(
      (result1 === 'first' && result2 === 'second') ||
      (result1 === 'second' && result2 === 'first'),
      true
    );
  });
});
