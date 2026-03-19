const { describe, it } = require('node:test');
const assert = require('assert');
const {
  parseDiffForFunctions,
  inferBrokenAssumptions,
  findCallers,
} = require('../src/audit/cascade-detector');

describe('parseDiffForFunctions', () => {
  it('extracts function names from diff output', () => {
    const diff = `diff --git a/src/utils.js b/src/utils.js
index abc123..def456 100644
--- a/src/utils.js
+++ b/src/utils.js
@@ -10,5 +10,7 @@ function sortItems
 const old = 1;
+function newHelper(data) {
+  return data.filter(Boolean);
+}
`;
    const result = parseDiffForFunctions(diff);
    assert(result.length > 0, 'Should find file changes');
    assert.strictEqual(result[0].file, 'src/utils.js');
    assert(result[0].functions.includes('newHelper'), 'Should extract newHelper function');
  });

  it('returns empty for non-source files', () => {
    const diff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
+# Hello
`;
    const result = parseDiffForFunctions(diff);
    assert.strictEqual(result.length, 0);
  });

  it('handles empty diff', () => {
    assert.deepStrictEqual(parseDiffForFunctions(''), []);
    assert.deepStrictEqual(parseDiffForFunctions(null), []);
  });
});

describe('inferBrokenAssumptions', () => {
  it('detects null-safety assumption from null check addition', () => {
    const changes = [
      'if (result === null) {',
      '  return defaultValue;',
      '}',
    ];
    const assumptions = inferBrokenAssumptions(changes);
    assert(assumptions.some(a => a.type === 'null-safety'));
  });

  it('detects error-handling assumption from try-catch addition', () => {
    const changes = [
      'try {',
      '  const data = parse(input);',
      '} catch (e) {',
      '  return fallback;',
      '}',
    ];
    const assumptions = inferBrokenAssumptions(changes);
    assert(assumptions.some(a => a.type === 'error-handling'));
  });

  it('detects mutation-safety assumption from slice addition', () => {
    const changes = [
      'const sorted = items.slice().sort();',
    ];
    const assumptions = inferBrokenAssumptions(changes);
    assert(assumptions.some(a => a.type === 'mutation-safety'));
  });

  it('detects bounds-check assumption', () => {
    const changes = [
      'if (index >= 0 && index < items.length) {',
    ];
    const assumptions = inferBrokenAssumptions(changes);
    assert(assumptions.some(a => a.type === 'bounds-check'));
  });

  it('detects type-safety assumption from typeof addition', () => {
    const changes = [
      "if (typeof value !== 'string') return;",
    ];
    const assumptions = inferBrokenAssumptions(changes);
    assert(assumptions.some(a => a.type === 'type-safety'));
  });

  it('returns empty for non-assumption-related changes', () => {
    const changes = ['console.log("hello");', 'const x = 1;'];
    const assumptions = inferBrokenAssumptions(changes);
    assert.strictEqual(assumptions.length, 0);
  });
});

describe('findCallers', () => {
  it('finds function calls in a file', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const tmpFile = path.join(os.tmpdir(), 'cascade-test-' + Date.now() + '.js');
    fs.writeFileSync(tmpFile, `
const result = helper(data);
console.log(result);
function helper(x) { return x; }
const other = helper(42);
`);

    try {
      const callers = findCallers('helper', tmpFile);
      assert(callers.length >= 2, `Expected >= 2 callers, got ${callers.length}`);
      assert(callers.some(c => c.code.includes('helper(data)')));
      assert(callers.some(c => c.code.includes('helper(42)')));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns empty for missing file', () => {
    const callers = findCallers('foo', '/nonexistent/file.js');
    assert.deepStrictEqual(callers, []);
  });
});

console.log('All audit-cascade-detector tests passed');
