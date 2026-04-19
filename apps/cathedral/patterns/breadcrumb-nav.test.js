const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('breadcrumb-nav', () => {
  it('home-only trail when section is home', () => {
    const trail = buildBreadcrumbs('home');
    assert.strictEqual(trail.length, 1);
    assert.strictEqual(trail[0].current, true);
  });

  it('two-level trail for named section', () => {
    const trail = buildBreadcrumbs('archive', { archive: 'News Archive' });
    assert.strictEqual(trail.length, 2);
    assert.strictEqual(trail[1].label, 'News Archive');
    assert.strictEqual(trail[1].current, true);
  });

  it('uses section id as fallback label', () => {
    const trail = buildBreadcrumbs('settings');
    assert.strictEqual(trail[1].label, 'settings');
  });

  it('aria label is Breadcrumb', () => {
    assert.strictEqual(getBreadcrumbAriaLabel(), 'Breadcrumb');
  });
});
