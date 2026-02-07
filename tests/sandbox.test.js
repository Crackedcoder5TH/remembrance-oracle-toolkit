const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sandboxExecute, sandboxJS, sandboxPython, sandboxGo, sandboxRust } = require('../src/core/sandbox');

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

  it('dispatches to Go sandbox', () => {
    const result = sandboxExecute(
      `package sandbox

func Add(a, b int) int { return a + b }`,
      `package sandbox

import "testing"

func TestAdd(t *testing.T) {
	if Add(2, 3) != 5 { t.Fatal("FAIL") }
}`,
      'go'
    );
    assert.equal(result.passed, true);
    assert.equal(result.sandboxed, true);
  });

  it('dispatches to Rust sandbox', () => {
    const result = sandboxExecute(
      'pub fn add(a: i32, b: i32) -> i32 { a + b }',
      `    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }`,
      'rust'
    );
    assert.equal(result.passed, true);
    assert.equal(result.sandboxed, true);
  });

  it('returns null for unsupported languages', () => {
    const result = sandboxExecute('code', 'test', 'haskell');
    assert.equal(result.passed, null);
    assert.equal(result.sandboxed, false);
  });
});

describe('sandboxGo', () => {
  it('runs passing Go tests', () => {
    const result = sandboxGo(
      `package sandbox

func Multiply(a, b int) int { return a * b }`,
      `package sandbox

import "testing"

func TestMultiply(t *testing.T) {
	if Multiply(3, 4) != 12 { t.Fatal("FAIL") }
	if Multiply(0, 5) != 0 { t.Fatal("zero") }
}`,
    );
    assert.equal(result.passed, true);
    assert.equal(result.sandboxed, true);
  });

  it('catches failing Go tests', () => {
    const result = sandboxGo(
      `package sandbox

func Multiply(a, b int) int { return a - b }`,
      `package sandbox

import "testing"

func TestMultiply(t *testing.T) {
	if Multiply(3, 4) != 12 { t.Fatal("FAIL") }
}`,
    );
    assert.equal(result.passed, false);
    assert.equal(result.sandboxed, true);
  });
});

describe('sandboxRust', () => {
  it('runs passing Rust tests', () => {
    const result = sandboxRust(
      'pub fn multiply(a: i32, b: i32) -> i32 { a * b }',
      `    use super::*;

    #[test]
    fn test_multiply() {
        assert_eq!(multiply(3, 4), 12);
        assert_eq!(multiply(0, 5), 0);
    }`,
    );
    assert.equal(result.passed, true);
    assert.equal(result.sandboxed, true);
  });

  it('catches failing Rust tests', () => {
    const result = sandboxRust(
      'pub fn multiply(a: i32, b: i32) -> i32 { a - b }',
      `    use super::*;

    #[test]
    fn test_multiply() {
        assert_eq!(multiply(3, 4), 12);
    }`,
    );
    assert.equal(result.passed, false);
    assert.equal(result.sandboxed, true);
  });
});
