// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const assert = require('assert');
const { detectPrecedenceIssues } = require('../src/patterns/audit-patterns/operator-precedence-check');

const w1 = detectPrecedenceIssues('const x = Math.round(1 - y - z * 100) / 100;');
assert(w1.length > 0, 'Should detect precedence issue');

assert.deepStrictEqual(detectPrecedenceIssues(null), []);
assert.deepStrictEqual(detectPrecedenceIssues(''), []);

console.log('All operator-precedence-check tests passed');
