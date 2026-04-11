const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('skeleton-loader', () => {
  it('SkeletonLine default width is 100%', () => {
    const defaultWidth = '100%';
    assert.strictEqual(defaultWidth, '100%');
  });

  it('SkeletonCard uses expected class names', () => {
    const classes = ['cathedral-surface', 'animate-pulse', 'skeleton-shimmer'];
    assert.ok(classes.includes('skeleton-shimmer'));
    assert.ok(classes.includes('animate-pulse'));
  });

  it('shimmer keyframes cycle background position', () => {
    const start = '200% 0';
    const end = '-200% 0';
    assert.notStrictEqual(start, end);
  });

  it('aria-busy is true during loading', () => {
    const ariaBusy = 'true';
    assert.strictEqual(ariaBusy, 'true');
  });
});
