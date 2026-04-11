const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('color-blind-palette', function() {
  it('getPalette returns default palette for "default"', function() {
    const p = getPalette('default');
    assert.equal(p.primary, '#00A8A8');
    assert.equal(p.danger, '#E63946');
    assert.equal(p.bg, '#F0F2F5');
  });

  it('getPalette returns deuteranopia palette', function() {
    const p = getPalette('deuteranopia');
    assert.equal(p.primary, '#0077BB');
    assert.equal(p.danger, '#EE7733');
  });

  it('getPalette returns protanopia palette', function() {
    const p = getPalette('protanopia');
    assert.equal(p.primary, '#3366CC');
    assert.equal(p.danger, '#DDAA33');
  });

  it('getPalette returns tritanopia palette', function() {
    const p = getPalette('tritanopia');
    assert.equal(p.primary, '#009988');
    assert.equal(p.danger, '#CC3311');
  });

  it('getPalette returns default for unknown name', function() {
    const p = getPalette('unknown');
    assert.equal(p.primary, '#00A8A8');
  });

  it('cyclePalette cycles from default to deuteranopia', function() {
    const next = cyclePalette('default');
    assert.equal(next, 'deuteranopia');
  });

  it('cyclePalette cycles from tritanopia back to default', function() {
    const next = cyclePalette('tritanopia');
    assert.equal(next, 'default');
  });

  it('cyclePalette handles unknown current by cycling to deuteranopia', function() {
    const next = cyclePalette('nonexistent');
    assert.equal(next, 'default');
  });

  it('listPalettes returns all 4 palette names', function() {
    const names = listPalettes();
    assert.equal(names.length, 4);
    assert.ok(names.includes('default'));
    assert.ok(names.includes('deuteranopia'));
    assert.ok(names.includes('protanopia'));
    assert.ok(names.includes('tritanopia'));
  });

  it('PALETTES object has all 4 keys', function() {
    assert.equal(Object.keys(PALETTES).length, 4);
  });
});
