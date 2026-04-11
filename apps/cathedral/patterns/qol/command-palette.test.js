const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createCommandPalette', function() {
  function makeCommands() {
    let called = false;
    return {
      commands: [
        { id: 'open', label: 'Open File', tags: ['file', 'open'], action: function() { called = true; } },
        { id: 'save', label: 'Save File', tags: ['file', 'save'], action: function() {} },
        { id: 'theme', label: 'Toggle Theme', tags: ['ui', 'dark'], action: function() {} },
      ],
      wasCalled: function() { return called; },
    };
  }

  it('search returns all items when query is empty', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const results = palette.search('');
    assert.equal(results.length, 3);
  });

  it('search filters by label', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const results = palette.search('toggle');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'theme');
  });

  it('search filters by tags', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const results = palette.search('dark');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'theme');
  });

  it('search is case-insensitive', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const results = palette.search('SAVE');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'save');
  });

  it('execute returns true and calls action for valid id', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const result = palette.execute('open');
    assert.equal(result, true);
    assert.equal(data.wasCalled(), true);
  });

  it('execute returns false for unknown id', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const result = palette.execute('nonexistent');
    assert.equal(result, false);
  });

  it('getById returns the item for a valid id', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const item = palette.getById('save');
    assert.ok(item);
    assert.equal(item.label, 'Save File');
  });

  it('getById returns null for unknown id', function() {
    const data = makeCommands();
    const palette = createCommandPalette(data.commands);
    const item = palette.getById('missing');
    assert.equal(item, null);
  });

  it('handles empty commands array', function() {
    const palette = createCommandPalette([]);
    assert.equal(palette.search('anything').length, 0);
    assert.equal(palette.execute('x'), false);
    assert.equal(palette.getById('x'), null);
  });
});
