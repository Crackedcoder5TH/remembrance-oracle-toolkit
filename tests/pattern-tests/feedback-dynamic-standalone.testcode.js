// Sandbox-compatible test for dynamic FIX_SUGGESTIONS construction
const assert = require('node:assert/strict');
const _fb = module.exports;

// Verify FIX_SUGGESTIONS has enough entries
const keys = Object.keys(_fb.FIX_SUGGESTIONS);
assert.ok(keys.length > 10, `Should have at least 10 fix suggestions, got ${keys.length}`);

// Check SQL injection suggestion exists
const sqlKey = keys.find(k => k.toLowerCase().includes('sql'));
assert.ok(sqlKey, 'Should have SQL-related fix suggestion');
assert.ok(_fb.FIX_SUGGESTIONS[sqlKey].includes('parameterized') || _fb.FIX_SUGGESTIONS[sqlKey].includes('query'),
  'SQL fix should suggest parameterized queries');

// Check command injection suggestion exists
const cmdKey = keys.find(k => k.toLowerCase().includes('command'));
assert.ok(cmdKey, 'Should have command-related fix suggestion');

// Verify findPatternLocation works
const testCode = 'line1\nline2\nconst x = 42;';
const loc = _fb.findPatternLocation(testCode, /const\s+x/);
assert.equal(loc.lineNumber, 3, 'Should find pattern on line 3');

// Verify null for non-matching pattern
const noLoc = _fb.findPatternLocation(testCode, /foobar/);
assert.equal(noLoc, null, 'Should return null for non-matching pattern');

// Verify covenantFeedback returns empty for sealed result
const emptyFb = _fb.covenantFeedback('const x = 1;', { sealed: true, violations: [] });
assert.deepEqual(emptyFb, [], 'Sealed result should produce no feedback');

console.log('All feedback dynamic construction tests passed');
