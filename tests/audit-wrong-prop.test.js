const assert = require('assert');

const w1 = detectWrongPropertyAccess('if (!reflection.improved) return null;');
assert(w1.length > 0, 'Should flag .improved on reflection');

assert.deepStrictEqual(detectWrongPropertyAccess(null), []);

console.log('All wrong-property-access tests passed');
