const assert = require('assert');

const code = "if (status === 'would-promote') {\n  report.promoted++;\n  continue;\n}";
const w1 = detectLogicInconsistency(code);
assert(w1.length > 0, 'Should detect counter in dry-run');

assert.deepStrictEqual(detectLogicInconsistency(null), []);

console.log('All logic-inconsistency-check tests passed');
