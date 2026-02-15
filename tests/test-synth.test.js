const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  synthesizeTests,
  extractSignature,
  inferParamType,
  testValuesForType,
  translateTestsToPython,
  jsToPyExpr,
  generateFromSignature,
  synthesizeForCandidates,
} = require('../src/evolution/test-synth');
const { RemembranceOracle } = require('../src/api/oracle');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `synth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Test Synthesizer', () => {
  describe('extractSignature', () => {
    it('extracts JS function signature', () => {
      const sig = extractSignature('function add(a, b) { return a + b; }', 'javascript');
      assert.equal(sig.name, 'add');
      assert.equal(sig.params.length, 2);
      assert.equal(sig.params[0].name, 'a');
      assert.equal(sig.params[1].name, 'b');
    });

    it('extracts Python function signature', () => {
      const sig = extractSignature('def add(a, b):\n    return a + b', 'python');
      assert.equal(sig.name, 'add');
      assert.equal(sig.params.length, 2);
    });

    it('extracts params with defaults', () => {
      const sig = extractSignature('function greet(name = "world") { return "hello " + name; }', 'javascript');
      assert.equal(sig.params[0].name, 'name');
      assert.equal(sig.params[0].default, '"world"');
    });

    it('extracts TS typed params', () => {
      const sig = extractSignature('function add(a: number, b: number) { return a + b; }', 'typescript');
      assert.equal(sig.params[0].name, 'a');
      assert.equal(sig.params[0].type, 'number');
    });

    it('returns null for non-function code', () => {
      const sig = extractSignature('const x = 42;', 'javascript');
      assert.equal(sig, null);
    });
  });

  describe('inferParamType', () => {
    it('infers number from name patterns', () => {
      assert.equal(inferParamType('n', ''), 'number');
      assert.equal(inferParamType('count', ''), 'number');
      assert.equal(inferParamType('index', ''), 'number');
      assert.equal(inferParamType('size', ''), 'number');
    });

    it('infers string from name patterns', () => {
      assert.equal(inferParamType('str', ''), 'string');
      assert.equal(inferParamType('text', ''), 'string');
      assert.equal(inferParamType('name', ''), 'string');
    });

    it('infers array from name patterns', () => {
      assert.equal(inferParamType('arr', ''), 'array');
      assert.equal(inferParamType('items', ''), 'array');
      assert.equal(inferParamType('nums', ''), 'array');
    });

    it('infers function from name patterns', () => {
      assert.equal(inferParamType('fn', ''), 'function');
      assert.equal(inferParamType('callback', ''), 'function');
      assert.equal(inferParamType('predicate', ''), 'function');
    });

    it('infers from code usage', () => {
      assert.equal(inferParamType('x', 'x.length'), 'array');
      assert.equal(inferParamType('x', 'x.split("")'), 'string');
    });
  });

  describe('jsToPyExpr', () => {
    it('converts JSON.stringify', () => {
      assert.equal(jsToPyExpr('JSON.stringify(arr)'), 'arr');
    });

    it('converts .length to len()', () => {
      assert.equal(jsToPyExpr('arr.length'), 'len(arr)');
    });

    it('converts Math builtins', () => {
      assert.equal(jsToPyExpr('Math.max(a, b)'), 'max(a, b)');
      assert.equal(jsToPyExpr('Math.abs(x)'), 'abs(x)');
    });

    it('converts booleans and null', () => {
      assert.equal(jsToPyExpr('true'), 'True');
      assert.equal(jsToPyExpr('false'), 'False');
      assert.equal(jsToPyExpr('null'), 'None');
    });

    it('converts operators', () => {
      assert.equal(jsToPyExpr('a === b'), 'a == b');
      assert.equal(jsToPyExpr('a !== b'), 'a != b');
    });

    it('strips string-wrapped arrays', () => {
      assert.equal(jsToPyExpr("'[1,2,3]'"), '[1,2,3]');
    });
  });

  describe('translateTestsToPython', () => {
    it('translates if (!==) throw to assert ==', () => {
      const js = 'if (add(1, 2) !== 3) throw new Error("fail");';
      const py = translateTestsToPython(js, 'add', 'add');
      assert.ok(py.includes('assert add(1, 2) == 3'));
    });

    it('translates if (===) throw to assert !=', () => {
      const js = 'if (isEmpty("") === false) throw new Error("fail");';
      const py = translateTestsToPython(js, 'isEmpty', 'is_empty');
      assert.ok(py.includes('assert is_empty("")'));
      assert.ok(py.includes('!= False'));
    });

    it('translates if (!expr) throw to assert expr', () => {
      const js = 'if (!isValid("test")) throw new Error("fail");';
      const py = translateTestsToPython(js, 'isValid', 'is_valid');
      assert.ok(py.includes('assert is_valid("test")'));
    });

    it('renames function calls', () => {
      const js = 'if (myFunc(1) !== 2) throw new Error("fail");';
      const py = translateTestsToPython(js, 'myFunc', 'my_func');
      assert.ok(py.includes('my_func(1)'));
      assert.ok(!py.includes('myFunc'));
    });

    it('removes JSON.stringify', () => {
      const js = 'if (JSON.stringify(chunk([1,2,3], 2)) !== "[[1,2],[3]]") throw new Error("fail");';
      const py = translateTestsToPython(js, 'chunk', 'chunk');
      assert.ok(!py.includes('JSON.stringify'));
      assert.ok(py.includes('chunk([1,2,3], 2)'));
    });

    it('converts booleans', () => {
      const js = 'if (check(true) !== false) throw new Error("fail");';
      const py = translateTestsToPython(js, 'check', 'check');
      assert.ok(py.includes('True'));
      assert.ok(py.includes('False'));
    });
  });

  describe('synthesizeTests', () => {
    it('generates tests for simple JS function', () => {
      const code = 'function add(a, b) { return a + b; }';
      const tests = synthesizeTests(code, 'javascript');
      assert.ok(tests.length > 0);
      assert.ok(tests.includes('add('));
    });

    it('generates tests for Python function', () => {
      const code = 'def multiply(n, factor):\n    return n * factor';
      const tests = synthesizeTests(code, 'python');
      assert.ok(tests.length > 0);
      assert.ok(tests.includes('multiply('));
    });

    it('uses parent tests when available', () => {
      const code = 'def add(a, b):\n    return a + b';
      const parentTest = 'if (add(1, 2) !== 3) throw new Error("fail");';
      const tests = synthesizeTests(code, 'python', {
        parentTestCode: parentTest,
        parentFuncName: 'add',
      });
      assert.ok(tests.includes('assert'));
      assert.ok(tests.includes('add(1, 2)'));
      assert.ok(tests.includes('== 3'));
    });

    it('returns empty string for non-function code', () => {
      const tests = synthesizeTests('const x = 42;', 'javascript');
      assert.equal(tests, '');
    });
  });

  describe('synthesizeForCandidates', () => {
    let oracle, tmpDir;

    beforeEach(() => {
      tmpDir = makeTempDir();
      oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, generateVariants: false, autoGrow: false });
    });

    it('synthesizes tests for candidates', () => {
      // Register a parent pattern
      oracle.registerPattern({
        name: 'synth-parent',
        code: 'function synthParent(n) { return n * 2; }',
        testCode: 'if (synthParent(5) !== 10) throw new Error("fail");',
        language: 'javascript',
        description: 'Double',
        tags: ['math'],
        patternType: 'utility',
      });

      // Add a Python candidate without proper test
      oracle.patterns.addCandidate({
        name: 'synth-parent-py',
        code: 'def synth_parent(n):\n    return n * 2',
        language: 'python',
        coherencyTotal: 0.8,
        parentPattern: 'synth-parent',
        generationMethod: 'variant',
      });

      const report = synthesizeForCandidates(oracle);
      assert.equal(report.processed, 1);
      assert.equal(report.synthesized, 1);
    });

    it('preserves existing good tests', () => {
      // Add a candidate that already has longer test code
      oracle.patterns.addCandidate({
        name: 'has-tests',
        code: 'function hasTests(n) { return n + 1; }',
        language: 'javascript',
        coherencyTotal: 0.8,
        testCode: 'if (hasTests(0) !== 1) throw new Error("a");\nif (hasTests(1) !== 2) throw new Error("b");\nif (hasTests(-1) !== 0) throw new Error("c");\nif (hasTests(100) !== 101) throw new Error("d");',
        generationMethod: 'variant',
      });

      const report = synthesizeForCandidates(oracle);
      assert.equal(report.processed, 1);
      // Should keep existing since it's comprehensive
    });

    it('dry run does not modify candidates', () => {
      oracle.patterns.addCandidate({
        name: 'dry-run-test',
        code: 'def dry_test(n):\n    return n + 1',
        language: 'python',
        coherencyTotal: 0.8,
        generationMethod: 'variant',
      });

      const report = synthesizeForCandidates(oracle, { dryRun: true });
      assert.equal(report.processed, 1);
      // Verify candidate still has no test code
      const cand = oracle.candidates()[0];
      assert.equal(cand.testCode, null);
    });
  });
});
