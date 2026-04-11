const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// compose is available via isolated sandbox concatenation

describe('compose', () => {
  it('should compose functions right to left', () => {
    const add1 = (x) => x + 1;
    const double = (x) => x * 2;
    const result = compose(add1, double)(5);
    assert.equal(result, 11); // (5*2)+1 = 11
  });

  it('should return identity for no functions', () => {
    const result = compose()(42);
    assert.equal(result, 42);
  });

  it('should work with a single function', () => {
    const square = (x) => x * x;
    const result = compose(square)(4);
    assert.equal(result, 16);
  });

  it('should pass multiple args to the rightmost function', () => {
    const add = (a, b) => a + b;
    const double = (x) => x * 2;
    const result = compose(double, add)(3, 4);
    assert.equal(result, 14); // (3+4)*2 = 14
  });

  it('should be the reverse of pipe', () => {
    const add1 = (x) => x + 1;
    const double = (x) => x * 2;
    const sub3 = (x) => x - 3;
    const composed = compose(sub3, double, add1)(5);
    assert.equal(composed, 9); // sub3(double(add1(5))) = (5+1)*2-3 = 9
  });
});
