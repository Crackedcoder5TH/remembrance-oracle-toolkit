const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('responsive-navbar', () => {
  it('starts closed', () => {
    assert.strictEqual(createNavState().isOpen(), false);
  });

  it('toggle opens then closes', () => {
    const nav = createNavState();
    nav.toggle();
    assert.strictEqual(nav.isOpen(), true);
    nav.toggle();
    assert.strictEqual(nav.isOpen(), false);
  });

  it('Escape closes when open', () => {
    const nav = createNavState();
    nav.open();
    assert.strictEqual(nav.handleKeyDown('Escape'), true);
    assert.strictEqual(nav.isOpen(), false);
  });

  it('Escape ignored when closed', () => {
    assert.strictEqual(createNavState().handleKeyDown('Escape'), false);
  });

  it('getAriaLabel reflects state', () => {
    const nav = createNavState();
    assert.strictEqual(nav.getAriaLabel(), 'Open menu');
    nav.open();
    assert.strictEqual(nav.getAriaLabel(), 'Close menu');
  });

  it('buildNavItems marks active item', () => {
    const items = buildNavItems([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], 'a');
    assert.strictEqual(items[0].active, true);
    assert.strictEqual(items[0].ariaCurrent, 'page');
    assert.strictEqual(items[1].active, false);
  });
});
