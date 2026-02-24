const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// throttle is available via oracle sandbox concatenation

describe('throttle', () => {
  it('should invoke fn immediately on first call', () => {
    let count = 0;
    const fn = throttle(() => ++count, 1000);
    fn();
    assert.equal(count, 1);
  });

  it('should not invoke fn again within the wait period', () => {
    let count = 0;
    const fn = throttle(() => ++count, 1000);
    fn();
    fn();
    fn();
    assert.equal(count, 1);
  });

  it('should invoke fn again after wait period elapses', async () => {
    let count = 0;
    const fn = throttle(() => ++count, 50);
    fn();
    assert.equal(count, 1);
    await new Promise((r) => setTimeout(r, 60));
    fn();
    assert.equal(count, 2);
  });

  it('should pass arguments to the function', () => {
    let captured;
    const fn = throttle((a, b) => { captured = [a, b]; }, 1000);
    fn('x', 'y');
    assert.deepEqual(captured, ['x', 'y']);
  });

  it('should return the result of fn', () => {
    const fn = throttle((x) => x * 2, 1000);
    assert.equal(fn(5), 10);
    // Second call within window returns last result
    assert.equal(fn(99), 10);
  });
});
