const assert = require('node:assert/strict');
const _dfs = module.exports;

// Verify fix suggestions has enough entries
const _keys = Object.keys(_dfs.FIX_SUGGESTIONS);
assert.ok(_keys.length >= 15, `Should have at least 15 suggestions, got ${_keys.length}`);

// Check SQL-related suggestion exists
const _sqlKey = _keys.find(k => k.toLowerCase().includes('sql'));
assert.ok(_sqlKey, 'Should have SQL-related fix suggestion');
assert.ok(_dfs.FIX_SUGGESTIONS[_sqlKey].includes('parameterized'),
  'SQL fix should suggest parameterized queries');

// Check command-related suggestion exists
const _cmdKey = _keys.find(k => k.toLowerCase().includes('command'));
assert.ok(_cmdKey, 'Should have command-related fix suggestion');

// Check XSS suggestion
const _xssKey = _keys.find(k => k.toLowerCase().includes('xss') || k.toLowerCase().includes('innerhtml'));
assert.ok(_xssKey, 'Should have XSS fix suggestion');

// Verify findPatternLocation
const _code = 'line one\nline two\nconst x = 42;';
const _loc = _dfs.findPatternLocation(_code, /const\s+x/);
assert.equal(_loc.lineNumber, 3, 'Should find on line 3');

const _noLoc = _dfs.findPatternLocation(_code, /foobar/);
assert.equal(_noLoc, null, 'Should return null for non-match');

// Verify buildFixSuggestions returns fresh copy each time
const _s1 = _dfs.buildFixSuggestions();
const _s2 = _dfs.buildFixSuggestions();
assert.notEqual(_s1, _s2, 'Should return new object each call');
assert.deepEqual(_s1, _s2, 'Content should be identical');

console.log('All dynamic fix suggestion tests passed');
