const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  VersionManager,
  semanticDiff,
  extractFunctions,
} = require('../src/core/versioning');

// ─── Shared test code snippets ──────────────────────────────────────────────

const jsCodeA = `function add(a, b) { return a + b; }
function sub(a, b) { return a - b; }`;

const jsCodeB = `function add(a, b, c) { return a + b + c; }
function sub(a, b) { return a - b; }
function mul(a, b) { return a * b; }`;

// ─── VersionManager (in-memory) ─────────────────────────────────────────────

describe('VersionManager (in-memory)', () => {
  it('saveSnapshot returns version 1 for first snapshot', () => {
    const vm = new VersionManager();
    const snap = vm.saveSnapshot('pattern-a', 'const x = 1;');
    assert.equal(snap.version, 1);
    assert.equal(snap.patternId, 'pattern-a');
    assert.equal(snap.code, 'const x = 1;');
    assert.ok(snap.timestamp);
  });

  it('saveSnapshot auto-increments versions', () => {
    const vm = new VersionManager();
    const snap1 = vm.saveSnapshot('pattern-a', 'v1 code');
    const snap2 = vm.saveSnapshot('pattern-a', 'v2 code');
    const snap3 = vm.saveSnapshot('pattern-a', 'v3 code');
    assert.equal(snap1.version, 1);
    assert.equal(snap2.version, 2);
    assert.equal(snap3.version, 3);
  });

  it('getHistory returns versions newest first', () => {
    const vm = new VersionManager();
    vm.saveSnapshot('p1', 'code-v1');
    vm.saveSnapshot('p1', 'code-v2');
    vm.saveSnapshot('p1', 'code-v3');
    const history = vm.getHistory('p1');
    assert.equal(history.length, 3);
    assert.equal(history[0].version, 3);
    assert.equal(history[1].version, 2);
    assert.equal(history[2].version, 1);
  });

  it('getVersion returns specific version', () => {
    const vm = new VersionManager();
    vm.saveSnapshot('p1', 'code-v1', { author: 'alice' });
    vm.saveSnapshot('p1', 'code-v2', { author: 'bob' });
    const snap = vm.getVersion('p1', 1);
    assert.equal(snap.version, 1);
    assert.equal(snap.code, 'code-v1');
    assert.deepEqual(snap.metadata, { author: 'alice' });
  });

  it('getVersion returns null for nonexistent version', () => {
    const vm = new VersionManager();
    vm.saveSnapshot('p1', 'code-v1');
    const result = vm.getVersion('p1', 99);
    assert.equal(result, null);
  });

  it('getLatestVersion returns 0 for unknown pattern', () => {
    const vm = new VersionManager();
    assert.equal(vm.getLatestVersion('nonexistent'), 0);
  });

  it('rollback returns code from specific version', () => {
    const vm = new VersionManager();
    vm.saveSnapshot('p1', 'original code');
    vm.saveSnapshot('p1', 'updated code');
    vm.saveSnapshot('p1', 'latest code');
    const code = vm.rollback('p1', 1);
    assert.equal(code, 'original code');
  });

  it('rollback returns null for nonexistent version', () => {
    const vm = new VersionManager();
    vm.saveSnapshot('p1', 'some code');
    const result = vm.rollback('p1', 42);
    assert.equal(result, null);
  });
});

// ─── extractFunctions ───────────────────────────────────────────────────────

describe('extractFunctions', () => {
  it('extracts JS function declarations', () => {
    const code = `function greet(name) {
  return 'Hello ' + name;
}
function farewell(name) {
  return 'Bye ' + name;
}`;
    const funcs = extractFunctions(code, 'javascript');
    assert.equal(funcs.length, 2);
    assert.equal(funcs[0].name, 'greet');
    assert.equal(funcs[0].signature, 'greet(name)');
    assert.equal(funcs[0].startLine, 1);
    assert.equal(funcs[1].name, 'farewell');
    assert.equal(funcs[1].signature, 'farewell(name)');
  });

  it('extracts JS arrow functions (const name = () =>)', () => {
    const code = `const double = (n) => {
  return n * 2;
};
const triple = (n) => {
  return n * 3;
};`;
    const funcs = extractFunctions(code, 'js');
    assert.equal(funcs.length, 2);
    assert.equal(funcs[0].name, 'double');
    assert.equal(funcs[0].signature, 'double(n)');
    assert.equal(funcs[1].name, 'triple');
  });

  it('extracts JS methods', () => {
    const code = `class Calculator {
  add(a, b) {
    return a + b;
  }
  subtract(a, b) {
    return a - b;
  }
}`;
    const funcs = extractFunctions(code, 'javascript');
    const names = funcs.map(f => f.name);
    assert.ok(names.includes('add'), 'should extract add method');
    assert.ok(names.includes('subtract'), 'should extract subtract method');
  });

  it('extracts Python functions (def name())', () => {
    const code = `def greet(name):
    return f"Hello {name}"

def farewell(name):
    return f"Bye {name}"`;
    const funcs = extractFunctions(code, 'python');
    assert.equal(funcs.length, 2);
    assert.equal(funcs[0].name, 'greet');
    assert.equal(funcs[0].signature, 'greet(name)');
    assert.equal(funcs[1].name, 'farewell');
    assert.equal(funcs[1].signature, 'farewell(name)');
  });

  it('extracts Go functions (func name())', () => {
    const code = `func Add(a int, b int) int {
	return a + b
}
func Sub(a int, b int) int {
	return a - b
}`;
    const funcs = extractFunctions(code, 'go');
    assert.equal(funcs.length, 2);
    assert.equal(funcs[0].name, 'Add');
    assert.equal(funcs[0].signature, 'Add(a int, b int)');
    assert.equal(funcs[1].name, 'Sub');
  });

  it('extracts Rust functions (pub fn name())', () => {
    const code = `pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
fn multiply(a: i32, b: i32) -> i32 {
    a * b
}`;
    const funcs = extractFunctions(code, 'rust');
    assert.equal(funcs.length, 2);
    assert.equal(funcs[0].name, 'add');
    assert.equal(funcs[0].signature, 'add(a: i32, b: i32)');
    assert.equal(funcs[1].name, 'multiply');
  });

  it('returns empty for no functions', () => {
    const code = `// just a comment
const x = 42;`;
    const funcs = extractFunctions(code, 'javascript');
    assert.equal(funcs.length, 0);
  });
});

// ─── semanticDiff ───────────────────────────────────────────────────────────

describe('semanticDiff', () => {
  it('identical code has similarity 1.0 and changeType cosmetic', () => {
    const code = `function add(a, b) { return a + b; }`;
    const result = semanticDiff(code, code, 'javascript');
    assert.equal(result.similarity, 1.0);
    assert.equal(result.changeType, 'cosmetic');
    assert.equal(result.summary.unchanged, 1);
    assert.equal(result.summary.added, 0);
    assert.equal(result.summary.removed, 0);
    assert.equal(result.summary.modified, 0);
  });

  it('adding a function shows function-added structural change', () => {
    const result = semanticDiff(jsCodeA, jsCodeB, 'javascript');
    const addedChanges = result.structuralChanges.filter(c => c.type === 'function-added');
    assert.ok(addedChanges.length > 0, 'should have function-added structural change');
    const addedFunc = result.functions.find(f => f.name === 'mul');
    assert.ok(addedFunc, 'mul function should be in functions list');
    assert.equal(addedFunc.change, 'added');
    assert.equal(result.summary.added, 1);
  });

  it('removing a function shows function-removed structural change', () => {
    const result = semanticDiff(jsCodeB, jsCodeA, 'javascript');
    const removedChanges = result.structuralChanges.filter(c => c.type === 'function-removed');
    assert.ok(removedChanges.length > 0, 'should have function-removed structural change');
    const removedFunc = result.functions.find(f => f.name === 'mul');
    assert.ok(removedFunc, 'mul function should be in functions list');
    assert.equal(removedFunc.change, 'removed');
    assert.equal(result.summary.removed, 1);
  });

  it('modifying function body shows body-changed structural change', () => {
    const codeOld = `function compute(x) {
  return x * 2;
}`;
    const codeNew = `function compute(x) {
  return x * 2 + 1;
}`;
    const result = semanticDiff(codeOld, codeNew, 'javascript');
    const bodyChanges = result.structuralChanges.filter(c => c.type === 'body-changed');
    assert.ok(bodyChanges.length > 0, 'should have body-changed structural change');
    const modifiedFunc = result.functions.find(f => f.name === 'compute');
    assert.equal(modifiedFunc.change, 'modified');
    assert.equal(modifiedFunc.bodyChanged, true);
  });

  it('changing signature shows signature-changed structural change', () => {
    const result = semanticDiff(jsCodeA, jsCodeB, 'javascript');
    const sigChanges = result.structuralChanges.filter(c => c.type === 'signature-changed');
    assert.ok(sigChanges.length > 0, 'should have signature-changed structural change');
    const addFunc = result.functions.find(f => f.name === 'add');
    assert.ok(addFunc, 'add function should be in functions list');
    assert.equal(addFunc.change, 'modified');
    assert.equal(addFunc.oldSignature, 'add(a, b)');
    assert.equal(addFunc.newSignature, 'add(a, b, c)');
  });

  it('completely different code has changeType rewrite', () => {
    const codeA = `function alpha() { return 1; }`;
    const codeB = `def totally_different_python_function(xyz):
    import os
    import sys
    result = xyz ** 3
    return result`;
    const result = semanticDiff(codeA, codeB, 'javascript');
    assert.equal(result.changeType, 'rewrite');
    assert.ok(result.similarity < 0.3, `similarity ${result.similarity} should be < 0.3`);
  });

  it('lineDiff contains added, removed, and same entries', () => {
    const result = semanticDiff(jsCodeA, jsCodeB, 'javascript');
    const types = new Set(result.lineDiff.map(d => d.type));
    assert.ok(types.has('added'), 'lineDiff should contain added entries');
    assert.ok(types.has('removed'), 'lineDiff should contain removed entries');
    assert.ok(types.has('same'), 'lineDiff should contain same entries');
  });
});
