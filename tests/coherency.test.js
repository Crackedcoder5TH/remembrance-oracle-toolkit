const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeCoherencyScore,
  scoreSyntax,
  scoreCompleteness,
  scoreConsistency,
  detectLanguage,
  checkBalancedBraces,
} = require('../src/core/coherency');

describe('checkBalancedBraces', () => {
  it('returns true for balanced braces', () => {
    assert.equal(checkBalancedBraces('function f() { return [1, 2]; }'), true);
  });

  it('returns false for unbalanced braces', () => {
    assert.equal(checkBalancedBraces('function f() { return [1, 2;'), false);
  });

  it('handles empty string', () => {
    assert.equal(checkBalancedBraces(''), true);
  });
});

describe('detectLanguage', () => {
  it('detects javascript', () => {
    assert.equal(detectLanguage('const x = () => { return 1; }'), 'javascript');
  });

  it('detects python', () => {
    assert.equal(detectLanguage('def hello():\n    print("hi")'), 'python');
  });

  it('detects rust', () => {
    assert.equal(detectLanguage('fn main() -> i32 { let mut x = 5; }'), 'rust');
  });

  it('returns unknown for ambiguous code', () => {
    assert.equal(detectLanguage('x = 1'), 'unknown');
  });
});

describe('scoreSyntax', () => {
  it('scores valid JS as 1.0', () => {
    assert.equal(scoreSyntax('var x = 1 + 2;', 'javascript'), 1.0);
  });

  it('scores broken JS lower', () => {
    const score = scoreSyntax('function { broken', 'javascript');
    assert.ok(score < 0.5);
  });
});

describe('scoreCompleteness', () => {
  it('scores complete code as 1.0', () => {
    assert.equal(scoreCompleteness('function add(a, b) { return a + b; }'), 1.0);
  });

  it('penalizes TODO markers', () => {
    const score = scoreCompleteness('function add(a, b) { // TODO: implement\n}');
    assert.ok(score < 1.0);
  });

  it('penalizes placeholder patterns', () => {
    const score = scoreCompleteness('function add(a, b) { ... }');
    assert.ok(score < 0.8);
  });
});

describe('scoreConsistency', () => {
  it('scores consistent code well', () => {
    const code = 'function getData() {\n  const myResult = fetchData();\n  return myResult;\n}';
    assert.ok(scoreConsistency(code) >= 0.8);
  });
});

describe('computeCoherencyScore', () => {
  it('produces a score between 0 and 1', () => {
    const result = computeCoherencyScore('function add(a, b) { return a + b; }');
    assert.ok(result.total >= 0 && result.total <= 1);
  });

  it('scores proven code higher', () => {
    const code = 'function add(a, b) { return a + b; }';
    const withTest = computeCoherencyScore(code, { testPassed: true });
    const withoutTest = computeCoherencyScore(code, { testPassed: false });
    assert.ok(withTest.total > withoutTest.total);
  });

  it('includes breakdown', () => {
    const result = computeCoherencyScore('const x = 1;');
    assert.ok(result.breakdown);
    assert.ok('syntaxValid' in result.breakdown);
    assert.ok('completeness' in result.breakdown);
    assert.ok('consistency' in result.breakdown);
    assert.ok('testProof' in result.breakdown);
  });
});
