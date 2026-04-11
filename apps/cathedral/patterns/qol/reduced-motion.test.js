const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('reduced-motion', function() {
  it('prefersReducedMotion returns a boolean', function() {
    const result = prefersReducedMotion();
    assert.equal(typeof result, 'boolean');
  });

  it('prefersReducedMotion returns false when window is undefined', function() {
    const result = prefersReducedMotion();
    assert.equal(result, false);
  });

  it('getAnimationDuration returns a number', function() {
    const result = getAnimationDuration(400, 50);
    assert.equal(typeof result, 'number');
  });

  it('getAnimationDuration returns normalMs when no window', function() {
    const result = getAnimationDuration(500, 100);
    assert.equal(result, 500);
  });

  it('getAnimationDuration uses defaults when args omitted', function() {
    const result = getAnimationDuration();
    assert.equal(result, 300);
  });

  it('safeTransition returns a string', function() {
    const result = safeTransition('opacity', 300);
    assert.equal(typeof result, 'string');
  });

  it('safeTransition formats correctly when motion is allowed', function() {
    const result = safeTransition('opacity', 300);
    assert.equal(result, 'opacity 300ms ease');
  });

  it('safeTransition uses default duration when omitted', function() {
    const result = safeTransition('transform');
    assert.equal(result, 'transform 200ms ease');
  });
});
