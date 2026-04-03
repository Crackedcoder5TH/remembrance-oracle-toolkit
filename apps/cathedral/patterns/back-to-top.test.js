const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('back-to-top', () => {
  it('starts not visible', () => {
    const btt = createBackToTop();
    assert.strictEqual(btt.visible, false);
  });

  it('accepts custom threshold and throttle', () => {
    const btt = createBackToTop(500, 200);
    assert.ok(typeof btt.checkVisibility === 'function');
    assert.ok(typeof btt.scrollToTop === 'function');
  });

  it('checkVisibility returns false in non-browser env', () => {
    const btt = createBackToTop(0);
    assert.strictEqual(btt.checkVisibility(), false);
  });
});
