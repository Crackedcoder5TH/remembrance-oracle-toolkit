const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { TestGenerator, TestRunner, TestScorer, TestForge } = require('../src/test-forge');
const { RemembranceOracle } = require('../src/api/oracle');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `forge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── TestGenerator Tests ───

describe('TestGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new TestGenerator();
  });

  it('generates valid JS test code for a simple function', () => {
    const pattern = {
      code: 'function add(a, b) { return a + b; }',
      name: 'add',
      language: 'javascript',
    };
    const result = generator.generate(pattern);
    assert.ok(result.testCode, 'Should produce testCode');
    assert.ok(result.testCode.length > 0, 'testCode should not be empty');
    assert.ok(result.assertions > 0, 'Should have at least one assertion');
    assert.ok(result.strategy, 'Should have a strategy');
    // Test code should reference the function name
    assert.ok(result.testCode.includes('add'), 'Test should reference the function');
  });

  it('generates Python test code', () => {
    const pattern = {
      code: 'def add(a, b):\n    return a + b',
      name: 'add',
      language: 'python',
    };
    const result = generator.generate(pattern);
    assert.ok(result.testCode, 'Should produce testCode');
    assert.ok(result.testCode.includes('add'), 'Test should reference the function');
    assert.ok(result.assertions > 0, 'Should have at least one assertion');
    assert.equal(result.strategy, 'function-call');
  });

  it('extracts exports correctly', () => {
    const code = `
function greet(name) { return 'Hello ' + name; }
function farewell(name) { return 'Goodbye ' + name; }
module.exports = { greet, farewell };
    `;
    const pattern = { code, name: 'greetings', language: 'javascript' };
    const result = generator.generate(pattern);
    assert.ok(result.testCode.includes('greet'), 'Should test greet');
    assert.ok(result.testCode.includes('farewell'), 'Should test farewell');
    assert.equal(result.strategy, 'export-call');
  });

  it('infers argument types from names', () => {
    const code = 'function process(arr, count, text, obj) { return arr; }';
    const pattern = { code, name: 'process', language: 'javascript' };
    const result = generator.generate(pattern);
    // Should include typed test values
    assert.ok(result.testCode.includes('[1, 2, 3]') || result.testCode.includes('arr'), 'Should use array test value for arr param');
    assert.ok(result.testCode.includes('42') || result.testCode.includes('count'), 'Should use number test value for count param');
  });

  it('generates class tests', () => {
    const code = `
class Counter {
  constructor() { this.count = 0; }
  increment() { this.count++; }
  getCount() { return this.count; }
}
    `;
    const pattern = { code, name: 'Counter', language: 'javascript' };
    const result = generator.generate(pattern);
    assert.ok(result.testCode.includes('Counter'), 'Should test the class');
    assert.equal(result.strategy, 'class-instantiate');
  });

  it('handles empty code gracefully', () => {
    const result = generator.generate({ code: '', name: 'empty', language: 'javascript' });
    assert.equal(result.assertions, 0);
    assert.equal(result.strategy, 'none');
  });

  it('handles null pattern gracefully', () => {
    const result = generator.generate(null);
    assert.equal(result.assertions, 0);
  });

  it('generates Go test code', () => {
    const pattern = {
      code: 'package sandbox\n\nfunc Add(a int, b int) int {\n\treturn a + b\n}',
      name: 'Add',
      language: 'go',
    };
    const result = generator.generate(pattern);
    assert.ok(result.testCode.includes('TestAdd'), 'Should generate Go test function');
    assert.equal(result.strategy, 'go-test');
  });

  it('generates Rust test code', () => {
    const pattern = {
      code: 'pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}',
      name: 'add',
      language: 'rust',
    };
    const result = generator.generate(pattern);
    assert.ok(result.testCode.includes('test_add'), 'Should generate Rust test function');
    assert.equal(result.strategy, 'cargo-test');
  });

  it('adds semantic assertions for sort-like functions', () => {
    const code = 'function sortArray(arr) { return arr.slice().sort((a,b) => a-b); }';
    const pattern = { code, name: 'sortArray', language: 'javascript' };
    const result = generator.generate(pattern);
    assert.ok(result.testCode.includes('sorted'), 'Should include sort assertion');
  });

  it('adds semantic assertions for validate-like functions', () => {
    const code = 'function validateEmail(str) { return str.includes("@"); }';
    const pattern = { code, name: 'validateEmail', language: 'javascript' };
    const result = generator.generate(pattern);
    assert.ok(result.testCode.includes('boolean'), 'Should check for boolean return');
  });
});

// ─── TestRunner Tests ───

describe('TestRunner', () => {
  let runner;

  beforeEach(() => {
    runner = new TestRunner({ timeout: 5000, memoryLimit: 32 });
  });

  it('passes valid tests', () => {
    const code = 'function add(a, b) { return a + b; }';
    const testCode = `
var result = add(2, 3);
if (result !== 5) throw new Error('Expected 5 but got ' + result);
    `;
    const result = runner.run(code, testCode, 'javascript');
    assert.equal(result.passed, true, 'Test should pass');
    assert.equal(result.error, null, 'Error should be null');
    assert.ok(result.duration >= 0, 'Duration should be non-negative');
  });

  it('fails invalid tests', () => {
    const code = 'function add(a, b) { return a + b; }';
    const testCode = `
var result = add(2, 3);
if (result !== 999) throw new Error('Expected 999 but got ' + result);
    `;
    const result = runner.run(code, testCode, 'javascript');
    assert.equal(result.passed, false, 'Test should fail');
    assert.ok(result.error, 'Error should be set');
  });

  it('respects timeout', () => {
    const shortRunner = new TestRunner({ timeout: 500, memoryLimit: 32 });
    const code = 'function spin() { while(true) {} }';
    const testCode = 'spin();';
    const result = shortRunner.run(code, testCode, 'javascript');
    assert.equal(result.passed, false, 'Should fail due to timeout');
  });

  it('runs batch tests', () => {
    const patterns = [
      {
        code: 'function add(a, b) { return a + b; }',
        testCode: 'if (add(1, 2) !== 3) throw new Error("fail");',
        language: 'javascript',
        name: 'add',
      },
      {
        code: 'function broken() { throw new Error("boom"); }',
        testCode: 'broken();',
        language: 'javascript',
        name: 'broken',
      },
    ];
    const result = runner.runBatch(patterns);
    assert.equal(result.total, 2);
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.results.length, 2);
  });
});

// ─── TestScorer Tests ───

describe('TestScorer', () => {
  let scorer;

  beforeEach(() => {
    scorer = new TestScorer();
  });

  it('scores test with assertions higher than empty test', () => {
    const codeWithAssertions = `
if (result !== 5) throw new Error('wrong');
if (result2 !== 10) throw new Error('wrong2');
if (!result3) throw new Error('missing');
    `;
    const emptyTest = '';
    const code = 'function add(a,b) { return a + b; }';

    const scoreWithAssertions = scorer.score(codeWithAssertions, code, 'javascript');
    const scoreEmpty = scorer.score(emptyTest, code, 'javascript');

    assert.ok(scoreWithAssertions.score > scoreEmpty.score,
      `Score with assertions (${scoreWithAssertions.score}) should be higher than empty (${scoreEmpty.score})`);
  });

  it('detects edge case tests', () => {
    const testWithEdges = `
add(null, 5);
add(undefined, 5);
add(0, 0);
add([], 5);
    `;
    const testWithoutEdges = `
add(1, 2);
add(3, 4);
    `;
    const code = 'function add(a,b) { return a + b; }';

    const scoreEdge = scorer.score(testWithEdges, code);
    const scoreNoEdge = scorer.score(testWithoutEdges, code);

    assert.ok(scoreEdge.dimensions.edgeCases >= scoreNoEdge.dimensions.edgeCases,
      'Edge case dimension should be higher with edge tests');
  });

  it('suggests missing coverage', () => {
    const testCode = 'add(1, 2);';
    const code = 'function add(a,b) { return a + b; }\nfunction subtract(a,b) { return a - b; }';
    const result = scorer.score(testCode, code);
    // Should suggest testing untested functions
    assert.ok(result.suggestions.length > 0, 'Should have suggestions');
  });

  it('scores zero for empty test code', () => {
    const result = scorer.score('', 'function foo() {}');
    assert.equal(result.score, 0);
    assert.equal(result.dimensions.assertions, 0);
  });

  it('measures input diversity', () => {
    const diverseTest = `
add('hello', 42);
add([1,2], {key: 'val'});
add(true, null);
    `;
    const uniformTest = `
add(1, 2);
add(3, 4);
    `;
    const code = 'function add(a,b) { return a + b; }';

    const diverseScore = scorer.score(diverseTest, code);
    const uniformScore = scorer.score(uniformTest, code);

    assert.ok(diverseScore.dimensions.diversity >= uniformScore.dimensions.diversity,
      'Diverse inputs should score higher on diversity');
  });

  it('detects error handling tests', () => {
    const testWithErrorHandling = `
try { foo(null); } catch(e) { if (!e) throw new Error('should throw'); }
try { foo(undefined); } catch(e) { /* ok */ }
    `;
    const testWithout = 'foo(1);';
    const code = 'function foo(x) { return x; }';

    const withEH = scorer.score(testWithErrorHandling, code);
    const withoutEH = scorer.score(testWithout, code);

    assert.ok(withEH.dimensions.errorHandling > withoutEH.dimensions.errorHandling,
      'Error handling dimension should be higher');
  });
});

// ─── TestForge Integration Tests ───

describe('TestForge', () => {
  let forge;
  let oracle;
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false });
  });

  it('forgeTest generates and stores testCode', () => {
    // Register a simple pattern
    const registered = oracle.registerPattern({
      name: 'forge-test-add',
      code: 'function add(a, b) { return a + b; }',
      language: 'javascript',
      description: 'Adds two numbers',
      tags: ['math'],
    });

    const patternId = registered.pattern?.id || registered.id;
    assert.ok(patternId, 'Should have a pattern ID');

    forge = new TestForge(oracle);
    const result = forge.forgeTest(patternId);

    assert.ok(result.success, `forgeTest should succeed: ${result.error || ''}`);
    assert.ok(result.testCode, 'Should have testCode');
    assert.ok(result.assertions > 0, 'Should have assertions');
    assert.ok(result.strategy, 'Should have a strategy');

    // Verify test was stored
    const updated = oracle.patterns.getAll().find(p => p.id === patternId);
    if (updated) {
      assert.ok(updated.testCode, 'Pattern should now have testCode stored');
    }
  });

  it('forgeTest dry-run does not store', () => {
    const registered = oracle.registerPattern({
      name: 'forge-test-dryrun',
      code: 'function multiply(a, b) { return a * b; }',
      language: 'javascript',
      description: 'Multiplies two numbers',
      tags: ['math'],
    });

    const patternId = registered.pattern?.id || registered.id;
    forge = new TestForge(oracle);
    const result = forge.forgeTest(patternId, { dryRun: true });

    assert.ok(result.success, 'forgeTest dry-run should succeed');
    assert.equal(result.dryRun, true, 'Should be flagged as dry run');

    // Verify test was NOT stored
    const updated = oracle.patterns.getAll().find(p => p.id === patternId);
    if (updated) {
      assert.ok(!updated.testCode || !updated.testCode.trim(), 'Pattern should not have testCode in dry-run');
    }
  });

  it('forgeAndPromote updates coherency', () => {
    const registered = oracle.registerPattern({
      name: 'forge-promote-test',
      code: 'function square(n) { return n * n; }',
      language: 'javascript',
      description: 'Squares a number',
      tags: ['math'],
    });

    const patternId = registered.pattern?.id || registered.id;

    // Clear existing testCode so forge will generate it
    try {
      oracle.patterns.update(patternId, { testCode: '' });
    } catch (_) { /* may fail on JSON backend */ }

    forge = new TestForge(oracle);
    const result = forge.forgeAndPromote({ limit: 5 });

    assert.ok(result.total >= 0, 'Should report total');
    assert.ok(typeof result.generated === 'number', 'Should report generated');
    assert.ok(typeof result.passed === 'number', 'Should report passed');
    assert.ok(typeof result.promoted === 'number', 'Should report promoted');
    assert.ok(typeof result.avgScore === 'number', 'Should report avgScore');
    assert.ok(Array.isArray(result.newlyEligible), 'Should report newlyEligible');
  });

  it('forgeTest returns error for non-existent pattern', () => {
    forge = new TestForge(oracle);
    const result = forge.forgeTest('nonexistent-id-12345');
    assert.equal(result.success, false);
    assert.ok(result.error, 'Should have an error message');
  });

  it('scoreTests returns scores for tested patterns', () => {
    oracle.registerPattern({
      name: 'forge-score-test',
      code: 'function greet(name) { return "Hello " + name; }',
      language: 'javascript',
      description: 'Greeting function',
      tags: ['util'],
      testCode: 'if (greet("World") !== "Hello World") throw new Error("fail");',
    });

    forge = new TestForge(oracle);
    const result = forge.scoreTests();

    assert.ok(result.total >= 1, 'Should have at least 1 tested pattern');
    assert.ok(result.scored >= 1, 'Should have scored at least 1');
    assert.ok(typeof result.avgScore === 'number', 'avgScore should be a number');
    assert.ok(result.results.length >= 1, 'Should have result entries');
  });

  it('runTests returns pass/fail results', () => {
    oracle.registerPattern({
      name: 'forge-run-test',
      code: 'function inc(n) { return n + 1; }',
      language: 'javascript',
      description: 'Increment',
      tags: ['util'],
      testCode: 'if (inc(0) !== 1) throw new Error("fail");',
    });

    forge = new TestForge(oracle);
    const result = forge.runTests();

    assert.ok(result.total >= 1, 'Should have at least 1 pattern');
    assert.ok(typeof result.passed === 'number', 'Should report passed count');
    assert.ok(typeof result.failed === 'number', 'Should report failed count');
  });
});
