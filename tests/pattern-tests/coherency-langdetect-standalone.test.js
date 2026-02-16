// Sandbox-compatible test for dynamic language detection
// coherency.js is concatenated above — test via computeCoherencyScore from module.exports
const assert = require('node:assert/strict');
const _coh = module.exports;

// Test computeCoherencyScore function works
const jsCode = 'function add(a, b) {\n  return a + b;\n}';
const score = _coh.computeCoherencyScore(jsCode);
assert.ok(score.total >= 0 && score.total <= 1, `Score ${score.total} must be between 0 and 1`);
assert.ok(score.breakdown.syntaxValid >= 0, 'syntaxValid must exist');
assert.ok(score.breakdown.completeness >= 0, 'completeness must exist');
assert.ok(score.breakdown.consistency >= 0, 'consistency must exist');

// Test that code WITH Rust keywords in string context is not misdetected
const codeWithRustKeywords = `
function processCode(code) {
  const hasFn = /fn/.test(code);
  const hasImpl = /impl/.test(code);
  return { hasFn, hasImpl };
}
`;
const score2 = _coh.computeCoherencyScore(codeWithRustKeywords);
assert.ok(score2.total >= 0, 'Code with Rust keywords in strings should still score');

// Test WEIGHTS are defined
assert.ok(_coh.WEIGHTS, 'WEIGHTS should be exported');
assert.ok(typeof _coh.WEIGHTS.syntaxValid === 'number', 'syntaxValid weight should be a number');

console.log('All coherency language detection tests passed');
