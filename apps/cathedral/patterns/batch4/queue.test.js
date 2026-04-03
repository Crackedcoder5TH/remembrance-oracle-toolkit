const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createQueue', () => {
  it('should enqueue and dequeue in FIFO order', () => {
    const q = createQueue();
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    assert.strictEqual(q.dequeue(), 'a');
    assert.strictEqual(q.dequeue(), 'b');
    assert.strictEqual(q.dequeue(), 'c');
  });

  it('should peek at the front without removing', () => {
    const q = createQueue();
    q.enqueue(10);
    q.enqueue(20);
    assert.strictEqual(q.peek(), 10);
    assert.strictEqual(q.size(), 2);
  });

  it('should track size and isEmpty', () => {
    const q = createQueue();
    assert.strictEqual(q.isEmpty(), true);
    assert.strictEqual(q.size(), 0);
    q.enqueue(1);
    assert.strictEqual(q.isEmpty(), false);
    assert.strictEqual(q.size(), 1);
    q.dequeue();
    assert.strictEqual(q.isEmpty(), true);
  });

  it('should return undefined for dequeue/peek on empty queue', () => {
    const q = createQueue();
    assert.strictEqual(q.dequeue(), undefined);
    assert.strictEqual(q.peek(), undefined);
  });
});
