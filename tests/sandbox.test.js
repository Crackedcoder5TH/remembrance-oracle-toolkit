const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sandboxExecute, sandboxJS, sandboxPython } = require('../src/core/sandbox');

describe('sandboxJS', () => {
  it('runs passing JS tests in sandbox', () => {
    const result = sandboxJS(
      'function add(a, b) { return a + b; }',
      'if (add(2, 3) !== 5) throw new Error("FAIL");'
    );
    assert.equal(result.passed, true);
    assert.equal(result.sandboxed, true);
  });

  it('catches failing JS tests', () => {
    const result = sandboxJS(
      'function add(a, b) { return a - b; }',
      'if (add(2, 3) !== 5) throw new Error("FAIL");'
    );
    assert.equal(result.passed, false);
    assert.equal(result.sandboxed, true);
  });

  it('blocks dangerous modules', () => {
    const result = sandboxJS(
      '',
      'const cp = require("child_process"); cp.execSync("whoami");'
    );
    assert.equal(result.passed, false);
    assert.ok(result.output.includes('blocked'));
  });

  it('enforces timeout', () => {
    const result = sandboxJS(
      '',
      'while(true) {}',
      { timeout: 1000 }
    );
    assert.equal(result.passed, false);
    assert.equal(result.timedOut, true);
  });
});

describe('sandboxPython', () => {
  it('runs passing Python tests in sandbox', () => {
    const result = sandboxPython(
      'def add(a, b):\n    return a + b',
      'assert add(2, 3) == 5, "FAIL"'
    );
    assert.equal(result.passed, true);
    assert.equal(result.sandboxed, true);
  });

  it('catches failing Python tests', () => {
    const result = sandboxPython(
      'def add(a, b):\n    return a - b',
      'assert add(2, 3) == 5, "FAIL"'
    );
    assert.equal(result.passed, false);
  });
});

describe('sandboxExecute', () => {
  it('dispatches to JS sandbox', () => {
    const result = sandboxExecute(
      'function x() { return 42; }',
      'if (x() !== 42) throw new Error("FAIL");',
      'javascript'
    );
    assert.equal(result.passed, true);
    assert.equal(result.sandboxed, true);
  });

  it('dispatches to Python sandbox', () => {
    const result = sandboxExecute(
      'def x():\n    return 42',
      'assert x() == 42',
      'python'
    );
    assert.equal(result.passed, true);
  });

  it('returns null for unsupported languages', () => {
    const result = sandboxExecute('code', 'test', 'haskell');
    assert.equal(result.passed, null);
    assert.equal(result.sandboxed, false);
  });
});
