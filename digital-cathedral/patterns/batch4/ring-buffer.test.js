const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createRingBuffer', () => {
  it('should push and retrieve elements', () => {
    const rb = createRingBuffer(3);
    rb.push('a');
    rb.push('b');
    assert.strictEqual(rb.get(0), 'a');
    assert.strictEqual(rb.get(1), 'b');
    assert.strictEqual(rb.size(), 2);
  });

  it('should overwrite oldest elements when full', () => {
    const rb = createRingBuffer(3);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    rb.push(4); // overwrites 1
    assert.deepStrictEqual(rb.toArray(), [2, 3, 4]);
  });

  it('should report isFull correctly', () => {
    const rb = createRingBuffer(2);
    assert.strictEqual(rb.isFull(), false);
    rb.push('x');
    rb.push('y');
    assert.strictEqual(rb.isFull(), true);
  });

  it('should return undefined for out-of-range get', () => {
    const rb = createRingBuffer(3);
    rb.push(1);
    assert.strictEqual(rb.get(-1), undefined);
    assert.strictEqual(rb.get(5), undefined);
  });

  it('should handle wrapping multiple times', () => {
    const rb = createRingBuffer(2);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    rb.push(4);
    rb.push(5);
    assert.deepStrictEqual(rb.toArray(), [4, 5]);
    assert.strictEqual(rb.size(), 2);
  });
});
