// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const assert = require('assert');
const { detectLogicInconsistency } = require('../src/patterns/audit-patterns/logic-inconsistency-check');

const code = "if (status === 'would-promote') {\n  report.promoted++;\n  continue;\n}";
const w1 = detectLogicInconsistency(code);
assert(w1.length > 0, 'Should detect counter in dry-run');

assert.deepStrictEqual(detectLogicInconsistency(null), []);

console.log('All logic-inconsistency-check tests passed');
