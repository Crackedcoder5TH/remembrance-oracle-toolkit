const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { discoverPatterns, autoSeed, extractFunctionNames, extractImports, detectLanguage } = require('../src/ci/auto-seed');

describe('detectLanguage', () => {
  it('detects javascript', () => {
    assert.equal(detectLanguage('foo.js'), 'javascript');
  });

  it('detects typescript', () => {
    assert.equal(detectLanguage('bar.ts'), 'typescript');
  });

  it('detects python', () => {
    assert.equal(detectLanguage('baz.py'), 'python');
  });

  it('detects go', () => {
    assert.equal(detectLanguage('main.go'), 'go');
  });

  it('detects rust', () => {
    assert.equal(detectLanguage('lib.rs'), 'rust');
  });

  it('returns null for unknown', () => {
    assert.equal(detectLanguage('readme.md'), null);
  });
});

describe('extractFunctionNames', () => {
  it('extracts JS function declarations', () => {
    const code = 'function add(a, b) { return a + b; }\nfunction sub(a, b) { return a - b; }';
    const fns = extractFunctionNames(code, 'javascript');
    assert.ok(fns.includes('add'));
    assert.ok(fns.includes('sub'));
  });

  it('extracts JS const arrow functions', () => {
    const code = 'const multiply = (a, b) => a * b;';
    const fns = extractFunctionNames(code, 'javascript');
    assert.ok(fns.includes('multiply'));
  });

  it('extracts Python functions', () => {
    const code = 'def hello():\n    print("hello")\n\ndef world():\n    pass';
    const fns = extractFunctionNames(code, 'python');
    assert.ok(fns.includes('hello'));
    assert.ok(fns.includes('world'));
  });

  it('extracts Go exported functions', () => {
    const code = 'func Add(a, b int) int { return a + b }\nfunc helper() {}';
    const fns = extractFunctionNames(code, 'go');
    assert.ok(fns.includes('Add'));
    // helper is not exported (lowercase)
  });

  it('extracts Rust pub functions', () => {
    const code = 'pub fn calculate(x: i32) -> i32 { x * 2 }';
    const fns = extractFunctionNames(code, 'rust');
    assert.ok(fns.includes('calculate'));
  });

  it('filters out test keywords', () => {
    const code = 'function add() {}\nfunction describe() {}';
    const fns = extractFunctionNames(code, 'javascript');
    assert.ok(fns.includes('add'));
    assert.ok(!fns.includes('describe'));
  });
});

describe('extractImports', () => {
  it('extracts require statements', () => {
    const code = "const foo = require('./foo');\nconst bar = require('./bar');";
    const imports = extractImports(code, 'javascript');
    assert.ok(imports.includes('./foo'));
    assert.ok(imports.includes('./bar'));
  });

  it('extracts import statements', () => {
    const code = "import { add } from './math';";
    const imports = extractImports(code, 'javascript');
    assert.ok(imports.includes('./math'));
  });

  it('ignores non-relative imports', () => {
    const code = "const fs = require('fs');\nconst foo = require('./foo');";
    const imports = extractImports(code, 'javascript');
    assert.ok(!imports.includes('fs'));
    assert.ok(imports.includes('./foo'));
  });

  it('extracts python relative imports', () => {
    const code = 'from .module import func';
    const imports = extractImports(code, 'python');
    assert.ok(imports.length > 0);
  });
});

describe('discoverPatterns', () => {
  it('discovers patterns from this project', () => {
    const baseDir = path.join(__dirname, '..');
    const discovered = discoverPatterns(baseDir, { language: 'javascript' });
    // Should find at least some source files with tests
    assert.ok(Array.isArray(discovered));
    // The project itself has test files that import source files
    if (discovered.length > 0) {
      const first = discovered[0];
      assert.ok(first.sourceFile);
      assert.ok(first.testFile);
      assert.ok(first.language);
      assert.ok(first.code);
      assert.ok(Array.isArray(first.functions));
    }
  });
});

describe('autoSeed', () => {
  it('dry run returns discovered patterns without registering', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    const baseDir = path.join(__dirname, '..');
    const result = autoSeed(oracle, baseDir, { dryRun: true, language: 'javascript' });
    assert.ok(typeof result.discovered === 'number');
    assert.ok(Array.isArray(result.patterns));
    assert.equal(result.registered, 0);
  });
});
