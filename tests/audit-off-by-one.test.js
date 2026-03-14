const assert = require('assert');

const w1 = detectOffByOne('for (let i = 0; i <= arr.length; i++) { arr[i]; }');
assert(w1.length > 0, 'Should detect <= length bound');

const w2 = detectOffByOne('for (let i = 0; i < arr.length; i++) { arr[i]; }');
assert(w2.length === 0, 'Should not flag correct bounds');

assert.deepStrictEqual(detectOffByOne(null), []);

console.log('All off-by-one-detection tests passed');
