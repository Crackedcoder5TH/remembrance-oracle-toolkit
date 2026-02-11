const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('share-buttons', () => {
  it('builds X share URL with encoded text', () => {
    const url = buildShareUrl('x', 'hello world');
    assert.ok(url.startsWith('https://x.com/intent/tweet?text='));
    assert.ok(url.includes('hello%20world'));
  });

  it('builds Twitter alias URL', () => {
    const url = buildShareUrl('twitter', 'test');
    assert.ok(url.includes('x.com'));
  });

  it('builds LinkedIn share URL', () => {
    const url = buildShareUrl('linkedin', 'https://example.com');
    assert.ok(url.startsWith('https://www.linkedin.com/sharing'));
  });

  it('builds email share URL', () => {
    const url = buildShareUrl('email', 'check this out');
    assert.ok(url.startsWith('mailto:'));
  });

  it('returns empty string for unknown platform', () => {
    assert.strictEqual(buildShareUrl('mastodon', 'test'), '');
  });
});
