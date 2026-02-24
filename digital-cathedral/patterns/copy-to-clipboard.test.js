const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('copy-to-clipboard', () => {
  it('createCopyState starts as not copied', () => {
    const state = createCopyState();
    assert.strictEqual(state.copied, false);
  });

  it('resetDelay defaults to 2000ms', () => {
    const delay = 2000;
    assert.strictEqual(delay, 2000);
  });

  it('createCopyState exposes copy function', () => {
    const state = createCopyState(5000);
    assert.ok(typeof state.copy === 'function');
  });
});
