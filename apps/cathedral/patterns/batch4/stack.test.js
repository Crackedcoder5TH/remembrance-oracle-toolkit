const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createStack', () => {
  it('should push and pop in LIFO order', () => {
    const stack = createStack();
    stack.push(1);
    stack.push(2);
    stack.push(3);
    assert.strictEqual(stack.pop(), 3);
    assert.strictEqual(stack.pop(), 2);
    assert.strictEqual(stack.pop(), 1);
  });

  it('should peek without removing', () => {
    const stack = createStack();
    stack.push('a');
    stack.push('b');
    assert.strictEqual(stack.peek(), 'b');
    assert.strictEqual(stack.size(), 2);
  });

  it('should report isEmpty correctly', () => {
    const stack = createStack();
    assert.strictEqual(stack.isEmpty(), true);
    stack.push(1);
    assert.strictEqual(stack.isEmpty(), false);
    stack.pop();
    assert.strictEqual(stack.isEmpty(), true);
  });

  it('should return undefined for pop/peek on empty stack', () => {
    const stack = createStack();
    assert.strictEqual(stack.pop(), undefined);
    assert.strictEqual(stack.peek(), undefined);
  });

  it('should track size correctly', () => {
    const stack = createStack();
    assert.strictEqual(stack.size(), 0);
    stack.push(1);
    stack.push(2);
    assert.strictEqual(stack.size(), 2);
    stack.pop();
    assert.strictEqual(stack.size(), 1);
  });
});
