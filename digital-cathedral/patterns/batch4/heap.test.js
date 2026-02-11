const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createMinHeap', () => {
  it('should extract elements in ascending order', () => {
    const heap = createMinHeap();
    heap.insert(5);
    heap.insert(3);
    heap.insert(8);
    heap.insert(1);
    heap.insert(4);
    assert.strictEqual(heap.extractMin(), 1);
    assert.strictEqual(heap.extractMin(), 3);
    assert.strictEqual(heap.extractMin(), 4);
    assert.strictEqual(heap.extractMin(), 5);
    assert.strictEqual(heap.extractMin(), 8);
  });

  it('should peek at minimum without removing', () => {
    const heap = createMinHeap();
    heap.insert(10);
    heap.insert(5);
    heap.insert(20);
    assert.strictEqual(heap.peek(), 5);
    assert.strictEqual(heap.size(), 3);
  });

  it('should track size correctly', () => {
    const heap = createMinHeap();
    assert.strictEqual(heap.size(), 0);
    heap.insert(1);
    heap.insert(2);
    assert.strictEqual(heap.size(), 2);
    heap.extractMin();
    assert.strictEqual(heap.size(), 1);
  });

  it('should return undefined for extractMin/peek on empty heap', () => {
    const heap = createMinHeap();
    assert.strictEqual(heap.extractMin(), undefined);
    assert.strictEqual(heap.peek(), undefined);
  });
});
