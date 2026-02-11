const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('clamp', () => {
  it('returns the value when within range', () => {
    assert.equal(clamp(5, 1, 10), 5);
  });

  it('clamps to min when value is below range', () => {
    assert.equal(clamp(-3, 0, 10), 0);
  });

  it('clamps to max when value is above range', () => {
    assert.equal(clamp(15, 0, 10), 10);
  });

  it('returns min when value equals min', () => {
    assert.equal(clamp(0, 0, 10), 0);
  });

  it('returns max when value equals max', () => {
    assert.equal(clamp(10, 0, 10), 10);
  });

  it('throws when min is greater than max', () => {
    assert.throws(() => clamp(5, 10, 0), RangeError);
  });
});
