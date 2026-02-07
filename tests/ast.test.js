const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCode, parseJavaScript, parsePython, astCoherencyBoost } = require('../src/core/parsers/ast');

describe('parseJavaScript', () => {
  it('parses valid JS and extracts functions', () => {
    const result = parseJavaScript('function add(a, b) { return a + b; }\nfunction sub(a, b) { return a - b; }');
    assert.equal(result.valid, true);
    assert.equal(result.functions.length, 2);
    assert.equal(result.functions[0].name, 'add');
    assert.deepEqual(result.functions[0].params, ['a', 'b']);
  });

  it('extracts arrow functions', () => {
    const result = parseJavaScript('const add = (a, b) => a + b;');
    assert.ok(result.functions.some(f => f.name === 'add'));
  });

  it('extracts classes', () => {
    const result = parseJavaScript('class Animal { }\nclass Dog extends Animal { }');
    assert.equal(result.classes.length, 2);
    assert.equal(result.classes[1].extends, 'Animal');
  });

  it('extracts require imports', () => {
    const result = parseJavaScript("const fs = require('fs');\nconst path = require('path');");
    assert.ok(result.imports.includes('fs'));
    assert.ok(result.imports.includes('path'));
  });

  it('extracts exports', () => {
    const result = parseJavaScript('module.exports = { add };');
    assert.ok(result.exports.length > 0);
  });

  it('calculates cyclomatic complexity', () => {
    const code = 'function f(x) { if (x > 0) { for (let i = 0; i < x; i++) { if (i % 2) { } } } }';
    const result = parseJavaScript(code);
    assert.ok(result.complexity.cyclomatic >= 4);
  });

  it('calculates nesting depth', () => {
    const result = parseJavaScript('function f() { if (true) { if (true) { while (true) { } } } }');
    assert.ok(result.complexity.maxDepth >= 4);
  });

  it('reports invalid syntax', () => {
    const result = parseJavaScript('function { broken syntax !!!');
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});

describe('parsePython', () => {
  it('extracts function definitions', () => {
    const result = parsePython('def add(a, b):\n    return a + b\n\ndef sub(a, b):\n    return a - b');
    assert.equal(result.functions.length, 2);
    assert.equal(result.functions[0].name, 'add');
  });

  it('extracts class definitions', () => {
    const result = parsePython('class Animal:\n    pass\n\nclass Dog(Animal):\n    pass');
    assert.equal(result.classes.length, 2);
    assert.equal(result.classes[1].extends, 'Animal');
  });

  it('extracts imports', () => {
    const result = parsePython('import os\nfrom pathlib import Path');
    assert.ok(result.imports.includes('os'));
    assert.ok(result.imports.includes('pathlib'));
  });

  it('calculates complexity', () => {
    const result = parsePython('def f(x):\n    if x > 0:\n        for i in range(x):\n            if i % 2:\n                pass');
    assert.ok(result.complexity.cyclomatic >= 4);
  });
});

describe('parseCode', () => {
  it('dispatches to JS parser', () => {
    const result = parseCode('const x = 1;', 'javascript');
    assert.ok('functions' in result);
  });

  it('dispatches to Python parser', () => {
    const result = parseCode('x = 1', 'python');
    assert.ok('functions' in result);
  });

  it('uses generic parser for unknown languages', () => {
    const result = parseCode('int main() { return 0; }', 'c');
    assert.ok('complexity' in result);
  });
});

describe('astCoherencyBoost', () => {
  it('boosts valid code with structure', () => {
    const { boost } = astCoherencyBoost('function add(a, b) { return a + b; }\nmodule.exports = { add };', 'javascript');
    assert.ok(boost > 0);
  });

  it('penalizes highly complex code', () => {
    const deepCode = 'function f() { ' + 'if (true) { '.repeat(10) + '}'.repeat(10) + ' }';
    const { boost } = astCoherencyBoost(deepCode, 'javascript');
    assert.ok(boost <= 0.05);
  });

  it('stays within -0.1 to 0.1 range', () => {
    const { boost } = astCoherencyBoost('function x() {}', 'javascript');
    assert.ok(boost >= -0.1 && boost <= 0.1);
  });
});
