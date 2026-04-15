'use strict';

/**
 * Tests for the batch risk scanner. Uses a temp directory with a
 * known mix of clean and complex files to verify:
 *   - The scanner finds all eligible files
 *   - The sort order is descending by probability
 *   - Risk level counts are accurate
 *   - Excluded directories are actually skipped
 *   - Non-source files (.md, .json, binary) are ignored
 *   - Empty/missing-directory edge cases are graceful
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { scanDirectory, DEFAULT_EXTENSIONS, DEFAULT_EXCLUDES } = require('../src/quality/risk-scanner');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'risk-scan-'));
}

function write(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

// A tiny, structurally clean function — should score LOW.
const CLEAN_CODE = `
'use strict';
function add(a, b) {
  return a + b;
}
module.exports = { add };
`;

// A high-cyclomatic function that should push into MEDIUM or HIGH.
const COMPLEX_CODE = (() => {
  const branches = Array.from({ length: 20 }, (_, i) => `  if (x === ${i}) return ${i};`).join('\n');
  return `'use strict';
function classify(x) {
${branches}
  if (x < 0) return -1;
  if (x > 100) return 101;
  return 0;
}
module.exports = { classify };
`;
})();

describe('quality/risk-scanner — scanDirectory', () => {
  let root;
  beforeEach(() => { root = makeTempDir(); });
  afterEach(() => { if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true }); });

  it('returns empty-report shape when directory does not exist', () => {
    const r = scanDirectory(path.join(root, 'nope'));
    assert.deepEqual(r.files, []);
    assert.equal(r.stats.total, 0);
    assert.match(r.error, /directory not found/);
  });

  it('returns empty-stats report when directory has no source files', () => {
    write(root, 'README.md', '# docs');
    write(root, 'config.json', '{}');
    const r = scanDirectory(root);
    assert.equal(r.stats.total, 0);
    assert.equal(r.files.length, 0);
    assert.equal(r.stats.byRisk.HIGH, 0);
    assert.equal(r.stats.byRisk.MEDIUM, 0);
    assert.equal(r.stats.byRisk.LOW, 0);
  });

  it('finds .js and .ts files but ignores .md/.json/.png', () => {
    write(root, 'src/add.js', CLEAN_CODE);
    write(root, 'src/sub.ts', CLEAN_CODE);
    write(root, 'docs/readme.md', '# ignore me');
    write(root, 'package.json', '{}');
    write(root, 'logo.png', 'binary');
    const r = scanDirectory(root);
    assert.equal(r.stats.total, 2);
    const files = r.files.map(f => f.file).sort();
    assert.deepEqual(files, [path.join('src', 'add.js'), path.join('src', 'sub.ts')]);
  });

  it('sorts results by probability descending', () => {
    write(root, 'clean.js', CLEAN_CODE);
    write(root, 'complex.js', COMPLEX_CODE);
    const r = scanDirectory(root);
    assert.equal(r.files.length, 2);
    assert.ok(r.files[0].probability >= r.files[1].probability);
    // complex.js should come first.
    assert.equal(r.files[0].file, 'complex.js');
  });

  it('counts files per risk level correctly', () => {
    write(root, 'a.js', CLEAN_CODE);
    write(root, 'b.js', CLEAN_CODE);
    write(root, 'c.js', COMPLEX_CODE);
    const r = scanDirectory(root);
    assert.equal(r.stats.total, 3);
    const sumCounts = r.stats.byRisk.HIGH + r.stats.byRisk.MEDIUM + r.stats.byRisk.LOW;
    assert.equal(sumCounts, 3);
    // At least one file is LOW (the clean ones).
    assert.ok(r.stats.byRisk.LOW >= 1);
  });

  it('excludes node_modules, .git, dist, .remembrance', () => {
    write(root, 'src/good.js', CLEAN_CODE);
    write(root, 'node_modules/bad.js', COMPLEX_CODE);
    write(root, 'dist/built.js', COMPLEX_CODE);
    write(root, '.git/hooks/pre.js', COMPLEX_CODE);
    write(root, '.remembrance/cache.js', COMPLEX_CODE);
    const r = scanDirectory(root);
    // Only src/good.js should be scanned.
    assert.equal(r.stats.total, 1);
    assert.equal(r.files[0].file, path.join('src', 'good.js'));
  });

  it('allows custom excludes via options', () => {
    write(root, 'src/a.js', CLEAN_CODE);
    write(root, 'vendor/b.js', CLEAN_CODE);
    const r = scanDirectory(root, { excludes: new Set(['vendor']) });
    const files = r.files.map(f => f.file);
    assert.ok(files.includes(path.join('src', 'a.js')));
    assert.ok(!files.includes(path.join('vendor', 'b.js')));
  });

  it('computes mean and median probability', () => {
    write(root, 'a.js', CLEAN_CODE);
    write(root, 'b.js', COMPLEX_CODE);
    const r = scanDirectory(root);
    assert.equal(typeof r.stats.meanProbability, 'number');
    assert.equal(typeof r.stats.medianProbability, 'number');
    assert.ok(r.stats.meanProbability >= 0 && r.stats.meanProbability <= 1);
    assert.ok(r.stats.medianProbability >= 0 && r.stats.medianProbability <= 1);
  });

  it('populates stats.top with the worst offenders up to topN', () => {
    for (let i = 0; i < 5; i++) write(root, `clean${i}.js`, CLEAN_CODE);
    for (let i = 0; i < 3; i++) write(root, `cx${i}.js`, COMPLEX_CODE);
    const r = scanDirectory(root, { topN: 3 });
    assert.equal(r.stats.top.length, 3);
    // All top entries should have probability >= the rest.
    const topMin = Math.min(...r.stats.top.map(f => f.probability));
    const restMax = Math.max(...r.files.slice(3).map(f => f.probability));
    assert.ok(topMin >= restMax, `top min ${topMin} should be >= rest max ${restMax}`);
  });

  it('skips files larger than maxBytes', () => {
    const big = 'x'.repeat(200);
    write(root, 'small.js', CLEAN_CODE);
    write(root, 'big.js', big);
    const r = scanDirectory(root, { maxBytes: 100 });
    assert.equal(r.stats.total, 1);
    assert.equal(r.files[0].file, 'small.js');
  });

  it('calls onFile callback for progress reporting', () => {
    write(root, 'a.js', CLEAN_CODE);
    write(root, 'b.js', CLEAN_CODE);
    const seen = [];
    scanDirectory(root, { onFile: (file, idx, total) => seen.push({ idx, total }) });
    assert.equal(seen.length, 2);
    assert.equal(seen[0].total, 2);
    assert.equal(seen[1].idx, 2);
  });

  it('defaults export the expected constants', () => {
    assert.ok(DEFAULT_EXTENSIONS.has('.js'));
    assert.ok(DEFAULT_EXTENSIONS.has('.ts'));
    assert.ok(DEFAULT_EXCLUDES.has('node_modules'));
    assert.ok(DEFAULT_EXCLUDES.has('.git'));
    assert.ok(DEFAULT_EXCLUDES.has('digital-cathedral'));
  });
});
