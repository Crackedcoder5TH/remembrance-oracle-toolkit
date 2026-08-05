// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const assert = require('assert');
const { detectWrongPropertyAccess } = require('../src/patterns/audit-patterns/wrong-property-access');

const w1 = detectWrongPropertyAccess('if (!reflection.improved) return null;');
assert(w1.length > 0, 'Should flag .improved on reflection');

assert.deepStrictEqual(detectWrongPropertyAccess(null), []);

console.log('All wrong-property-access tests passed');
