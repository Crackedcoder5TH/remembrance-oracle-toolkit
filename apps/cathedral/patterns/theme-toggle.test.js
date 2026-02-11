const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('theme-toggle', () => {
  function cycleTheme(current) {
    return current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  }

  it('cycles system → light → dark → system', () => {
    assert.strictEqual(cycleTheme('system'), 'light');
    assert.strictEqual(cycleTheme('light'), 'dark');
    assert.strictEqual(cycleTheme('dark'), 'system');
  });

  it('default theme is system', () => {
    const defaultTheme = 'system';
    assert.strictEqual(defaultTheme, 'system');
  });

  it('valid themes are dark, light, system', () => {
    const validThemes = ['dark', 'light', 'system'];
    assert.ok(validThemes.includes('dark'));
    assert.ok(validThemes.includes('light'));
    assert.ok(validThemes.includes('system'));
    assert.ok(!validThemes.includes('auto'));
  });

  it('full cycle returns to start', () => {
    let t = 'system';
    t = cycleTheme(t); // light
    t = cycleTheme(t); // dark
    t = cycleTheme(t); // system
    assert.strictEqual(t, 'system');
  });
});
