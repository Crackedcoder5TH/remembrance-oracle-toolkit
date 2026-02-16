// Sandbox-compatible test — functions from code file are already in scope via concatenation
const assert = require('node:assert/strict');

// Access exports from the concatenated code above
const _cp = module.exports;

assert.equal(_cp.COVENANT_PRINCIPLES.length, 15, 'Should have 15 principles');

for (const p of _cp.COVENANT_PRINCIPLES) {
  assert.ok(typeof p.id === 'number', `Principle ${p.name} missing id`);
  assert.ok(typeof p.name === 'string', `Principle ${p.id} missing name`);
  assert.ok(typeof p.seal === 'string', `Principle ${p.id} missing seal`);
}

// Verify dynamic patterns detect actual harmful code
const harmful = 'while (true) { fork(); }';
const matches = _cp.HARM_PATTERNS.filter(hp => hp.pattern.test(harmful));
assert.ok(matches.length > 0, 'Should detect fork in infinite loop');

// Verify stripNonExecutableContent removes comments
const codeWithComment = '// this has a keyword\nconst x = 1;';
const stripped = _cp.stripNonExecutableContent(codeWithComment);
assert.ok(!stripped.includes('keyword'), 'Should strip comment content');
assert.ok(stripped.includes('const x = 1'), 'Should keep executable code');

// Verify stripNonExecutableContent removes string bodies
const codeWithString = "const msg = 'sensitive keyword here';";
const stripped2 = _cp.stripNonExecutableContent(codeWithString);
assert.ok(!stripped2.includes('sensitive keyword'), 'Should strip string body');

// Verify deep security patterns exist for all languages
assert.ok(_cp.DEEP_SECURITY_PATTERNS.javascript.length > 0);
assert.ok(_cp.DEEP_SECURITY_PATTERNS.python.length > 0);
assert.ok(_cp.DEEP_SECURITY_PATTERNS.go.length > 0);
assert.deepEqual(_cp.DEEP_SECURITY_PATTERNS.typescript, _cp.DEEP_SECURITY_PATTERNS.javascript);

console.log('All covenant-patterns tests passed');
