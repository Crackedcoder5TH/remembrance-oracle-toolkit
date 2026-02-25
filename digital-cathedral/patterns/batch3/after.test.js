const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// after is available via oracle sandbox concatenation

describe('after', () => {
  it('should not invoke fn before n calls', () => {
    let result;
    const fn = after(3, () => { result = 'called'; });
    fn();
    fn();
    assert.equal(result, undefined);
  });

  it('should invoke fn on the nth call', () => {
    let result;
    const fn = after(3, () => { result = 'called'; return result; });
    fn();
    fn();
    const ret = fn();
    assert.equal(result, 'called');
    assert.equal(ret, 'called');
  });

  it('should invoke fn on every call after n', () => {
    let count = 0;
    const fn = after(2, () => ++count);
    fn(); // call 1: no-op
    fn(); // call 2: invokes (count=1)
    fn(); // call 3: invokes (count=2)
    fn(); // call 4: invokes (count=3)
    assert.equal(count, 3);
  });

  it('should pass arguments through', () => {
    const fn = after(1, (a, b) => a + b);
    assert.equal(fn(3, 4), 7);
  });

  it('should return undefined before reaching n', () => {
    const fn = after(5, () => 'done');
    assert.equal(fn(), undefined);
    assert.equal(fn(), undefined);
  });
});
