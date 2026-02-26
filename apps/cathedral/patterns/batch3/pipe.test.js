const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// pipe is available via isolated sandbox concatenation

describe('pipe', () => {
  it('should compose functions left to right', () => {
    const add1 = (x) => x + 1;
    const double = (x) => x * 2;
    const result = pipe(add1, double)(5);
    assert.equal(result, 12); // (5+1)*2 = 12
  });

  it('should return identity for no functions', () => {
    const result = pipe()(42);
    assert.equal(result, 42);
  });

  it('should work with a single function', () => {
    const square = (x) => x * x;
    const result = pipe(square)(4);
    assert.equal(result, 16);
  });

  it('should pass multiple args to the first function', () => {
    const add = (a, b) => a + b;
    const double = (x) => x * 2;
    const result = pipe(add, double)(3, 4);
    assert.equal(result, 14); // (3+4)*2 = 14
  });

  it('should chain multiple transformations', () => {
    const result = pipe(
      (s) => s.trim(),
      (s) => s.toLowerCase(),
      (s) => s.replace(/\s+/g, '-')
    )('  Hello World  ');
    assert.equal(result, 'hello-world');
  });
});
