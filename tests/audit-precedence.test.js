const assert = require('assert');

const w1 = detectPrecedenceIssues('const x = Math.round(1 - y - z * 100) / 100;');
assert(w1.length > 0, 'Should detect precedence issue');

assert.deepStrictEqual(detectPrecedenceIssues(null), []);
assert.deepStrictEqual(detectPrecedenceIssues(''), []);

console.log('All operator-precedence-check tests passed');
