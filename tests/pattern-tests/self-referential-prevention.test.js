const assert = require('node:assert/strict');
const _srp = module.exports;

// Test stripNonExecutableContent
const _codeWithComments = '// keyword here\nconst x = 1; /* another keyword */';
const _stripped = _srp.stripNonExecutableContent(_codeWithComments);
assert.ok(!_stripped.includes('keyword'), 'Should strip comments');
assert.ok(_stripped.includes('const x = 1'), 'Should keep code');

const _codeWithStrings = "const msg = 'keyword inside string';";
const _stripped2 = _srp.stripNonExecutableContent(_codeWithStrings);
assert.ok(!_stripped2.includes('keyword inside'), 'Should strip string content');

const _codeWithTemplates = 'const msg = `keyword in template`;';
const _stripped3 = _srp.stripNonExecutableContent(_codeWithTemplates);
assert.ok(!_stripped3.includes('keyword in'), 'Should strip template content');

// Test buildKeywordPattern
const _pattern = _srp.buildKeywordPattern([
  ['key', 'word'],
  ['sensi', 'tive'],
]);
assert.ok(_pattern.test('this has keyword'), 'Should match keyword');
assert.ok(_pattern.test('this has sensitive'), 'Should match sensitive');
assert.ok(!_pattern.test('this has nothing'), 'Should not match irrelevant text');

// Test buildModulePattern
const _modPat = _srp.buildModulePattern(['child', '_process'], '.*exec');
assert.ok(_modPat.test("require('child_process').exec"), 'Should match module usage');
assert.ok(!_modPat.test("require('fs').readFile"), 'Should not match other modules');

// Test buildMarkerRegex
const _markers = _srp.buildMarkerRegex([
  ['TO', 'DO'],
  ['FIX', 'ME'],
]);
assert.ok(_markers.test('TODO: implement this'), 'Should match marker');
assert.ok(!_markers.test('nothing here'), 'Should not match clean code');

// Test buildLanguageDetector
const _rustDetector = _srp.buildLanguageDetector('rust', [
  ['\\b', 'fn', '\\b.*->'],
  ['let ', 'mut '],
]);
assert.ok(_rustDetector.test('fn main() -> i32 {}'), 'Should detect Rust');
assert.ok(!_rustDetector.test('function main() {}'), 'Should not detect JS as Rust');

console.log('All self-referential prevention tests passed');
