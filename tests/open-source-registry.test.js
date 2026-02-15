const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');
const {
  // Layer 1: Curated registry
  CURATED_REPOS,
  listRegistry,
  searchRegistry,
  getRegistryEntry,

  // Layer 2: Batch import
  batchImport,

  // Layer 3: GitHub search
  discoverReposSync,

  // Layer 4: License checking
  LICENSE_CATEGORIES,
  checkLicense,

  // Layer 5: Provenance tracking
  getProvenance,
  getRepoCommitHash,

  // Layer 6: Deduplication
  codeFingerprint,
  codeSimilarity,
  findDuplicates,
  isDuplicate,

  // Helpers
  extractRepoName,
} = require('../src/ci/open-source-registry');

// ─── Layer 1: Curated Registry ───────────────────────────────────────────────

describe('Layer 1: Curated Registry', () => {
  it('has a non-empty curated list', () => {
    assert.ok(CURATED_REPOS.length > 10, 'Should have at least 10 curated repos');
  });

  it('each entry has required fields', () => {
    for (const repo of CURATED_REPOS) {
      assert.ok(repo.name, `Repo missing name`);
      assert.ok(repo.url, `Repo ${repo.name} missing url`);
      assert.ok(repo.language, `Repo ${repo.name} missing language`);
      assert.ok(Array.isArray(repo.topics), `Repo ${repo.name} topics should be array`);
      assert.ok(repo.license, `Repo ${repo.name} missing license`);
      assert.ok(repo.description, `Repo ${repo.name} missing description`);
    }
  });

  it('lists all repos when no filter', () => {
    const all = listRegistry();
    assert.equal(all.length, CURATED_REPOS.length);
  });

  it('filters by language', () => {
    const jsRepos = listRegistry({ language: 'javascript' });
    assert.ok(jsRepos.length > 0, 'Should find javascript repos');
    assert.ok(jsRepos.every(r => r.language === 'javascript'));
  });

  it('filters by topic', () => {
    const algoRepos = listRegistry({ topic: 'algorithm' });
    assert.ok(algoRepos.length > 0, 'Should find algorithm repos');
    for (const r of algoRepos) {
      const match = r.topics.some(t => t.includes('algorithm')) || r.description.toLowerCase().includes('algorithm');
      assert.ok(match, `Repo ${r.name} should match algorithm topic`);
    }
  });

  it('filters by both language and topic', () => {
    const results = listRegistry({ language: 'python', topic: 'algorithm' });
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.language === 'python'));
  });

  it('returns empty for non-matching filters', () => {
    const results = listRegistry({ language: 'fortran' });
    assert.equal(results.length, 0);
  });

  describe('searchRegistry', () => {
    it('finds repos by keyword', () => {
      const results = searchRegistry('utility functional');
      assert.ok(results.length > 0, 'Should find matches');
      assert.ok(results[0].score > 0, 'Should have positive score');
    });

    it('ranks by relevance score', () => {
      const results = searchRegistry('algorithm data structure sorting');
      for (let i = 1; i < results.length; i++) {
        assert.ok(results[i - 1].score >= results[i].score, 'Should be sorted by score desc');
      }
    });

    it('returns empty for no match', () => {
      const results = searchRegistry('xyznonexistent12345');
      assert.equal(results.length, 0);
    });

    it('respects limit', () => {
      const results = searchRegistry('algorithm', { limit: 3 });
      assert.ok(results.length <= 3);
    });

    it('filters by language', () => {
      const results = searchRegistry('utility', { language: 'go' });
      assert.ok(results.every(r => r.language === 'go'));
    });
  });

  describe('getRegistryEntry', () => {
    it('finds by exact name', () => {
      const entry = getRegistryEntry('lodash');
      assert.ok(entry, 'Should find lodash');
      assert.equal(entry.name, 'lodash');
    });

    it('is case-insensitive', () => {
      const entry = getRegistryEntry('LODASH');
      assert.ok(entry, 'Should find LODASH case-insensitively');
    });

    it('returns null for unknown repo', () => {
      const entry = getRegistryEntry('nonexistent-repo-xyz');
      assert.equal(entry, null);
    });
  });
});

// ─── Layer 2: Batch Import ──────────────────────────────────────────────────

describe('Layer 2: Batch Import', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-batch-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles unknown repo names gracefully', () => {
    const result = batchImport(oracle, ['nonexistent-repo-xyz'], { dryRun: true });
    assert.equal(result.total, 1);
    assert.equal(result.failed, 1);
    assert.ok(result.results[0].reason.includes('Not found'));
  });

  it('skips repos with blocked licenses', () => {
    const result = batchImport(oracle, [{ url: 'https://example.com/repo', license: 'GPL-3.0', name: 'test-repo' }]);
    assert.equal(result.skipped, 1);
    assert.ok(result.results[0].reason.includes('Incompatible license'));
  });

  it('accepts repos with permissive licenses', () => {
    // Can't actually clone in tests, so the harvest will fail — but license check should pass
    const result = batchImport(oracle, [{ url: 'https://example.com/nonexistent', license: 'MIT', name: 'test-mit' }]);
    // Will fail at clone stage, but should NOT be skipped for license
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 1); // fails at clone, not license
  });

  it('returns correct totals', () => {
    const result = batchImport(oracle, ['nonexistent1', 'nonexistent2', 'nonexistent3']);
    assert.equal(result.total, 3);
    assert.equal(result.succeeded + result.failed + result.skipped, 3);
  });

  it('resolves curated repo names to URLs', () => {
    // dry-run with a real repo name — will fail at clone but entry should be resolved
    const result = batchImport(oracle, ['lodash'], { dryRun: false, skipLicenseCheck: true });
    // Will fail at clone (no git in sandbox), but should not say "not found in registry"
    const r = result.results[0];
    assert.ok(r.status === 'success' || r.status === 'failed');
    assert.ok(!r.reason?.includes('Not found'));
  });
});

// ─── Layer 3: GitHub Search ─────────────────────────────────────────────────

describe('Layer 3: GitHub Search (discoverReposSync)', () => {
  it('returns an array (may be empty if no network)', () => {
    const results = discoverReposSync('javascript sorting algorithm', { limit: 3 });
    assert.ok(Array.isArray(results));
  });

  it('returned entries have expected shape', () => {
    const results = discoverReposSync('lodash utility', { limit: 2 });
    if (results.length > 0) {
      const r = results[0];
      assert.ok(typeof r.name === 'string');
      assert.ok(typeof r.url === 'string');
      assert.ok(typeof r.stars === 'number');
      assert.ok(typeof r.language === 'string');
    }
  });

  it('respects limit parameter', () => {
    const results = discoverReposSync('react', { limit: 2 });
    assert.ok(results.length <= 2);
  });
});

// ─── Layer 4: License Checking ──────────────────────────────────────────────

describe('Layer 4: License Checking', () => {
  it('allows MIT', () => {
    const r = checkLicense('MIT');
    assert.ok(r.allowed);
    assert.equal(r.category, 'permissive');
  });

  it('allows Apache-2.0', () => {
    const r = checkLicense('Apache-2.0');
    assert.ok(r.allowed);
    assert.equal(r.category, 'permissive');
  });

  it('allows BSD-3-Clause', () => {
    const r = checkLicense('BSD-3-Clause');
    assert.ok(r.allowed);
  });

  it('allows ISC', () => {
    const r = checkLicense('ISC');
    assert.ok(r.allowed);
  });

  it('allows CC0-1.0', () => {
    const r = checkLicense('CC0-1.0');
    assert.ok(r.allowed);
  });

  it('allows Unlicense', () => {
    const r = checkLicense('Unlicense');
    assert.ok(r.allowed);
  });

  it('allows weak copyleft (LGPL)', () => {
    const r = checkLicense('LGPL-3.0');
    assert.ok(r.allowed);
    assert.equal(r.category, 'weak-copyleft');
  });

  it('allows MPL-2.0', () => {
    const r = checkLicense('MPL-2.0');
    assert.ok(r.allowed);
    assert.equal(r.category, 'weak-copyleft');
  });

  it('blocks GPL-3.0', () => {
    const r = checkLicense('GPL-3.0');
    assert.ok(!r.allowed);
    assert.equal(r.category, 'strong-copyleft');
  });

  it('blocks GPL-2.0', () => {
    const r = checkLicense('GPL-2.0');
    assert.ok(!r.allowed);
  });

  it('blocks AGPL-3.0', () => {
    const r = checkLicense('AGPL-3.0');
    assert.ok(!r.allowed);
  });

  it('blocks unknown license', () => {
    const r = checkLicense('unknown');
    assert.ok(!r.allowed);
    assert.equal(r.category, 'unknown');
  });

  it('blocks empty license', () => {
    const r = checkLicense('');
    assert.ok(!r.allowed);
  });

  it('blocks null license', () => {
    const r = checkLicense(null);
    assert.ok(!r.allowed);
  });

  it('overrides copyleft with allowCopyleft', () => {
    const r = checkLicense('GPL-3.0', { allowCopyleft: true });
    assert.ok(r.allowed);
    assert.ok(r.reason.includes('override'));
  });

  it('recognizes MIT-like strings', () => {
    const r = checkLicense('MIT-style');
    assert.ok(r.allowed);
  });

  it('has all standard SPDX licenses', () => {
    const standard = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'GPL-2.0', 'GPL-3.0', 'LGPL-3.0', 'MPL-2.0', 'AGPL-3.0'];
    for (const lic of standard) {
      assert.ok(LICENSE_CATEGORIES[lic], `Should have ${lic} in categories`);
    }
  });
});

// ─── Layer 5: Provenance Tracking ───────────────────────────────────────────

describe('Layer 5: Provenance Tracking', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-prov-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getProvenance returns empty when no imported patterns', () => {
    const result = getProvenance(oracle);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it('getProvenance filters by source', () => {
    // Register a pattern with source tag
    oracle.registerPattern({
      name: 'prov-test-fn',
      code: 'function provTest(a, b) { return a + b; }',
      language: 'javascript',
      description: 'Test pattern',
      tags: ['source:test-repo', 'license:MIT', 'open-source'],
      testCode: 'if (provTest(1, 2) !== 3) throw new Error("fail");',
    });

    const all = getProvenance(oracle);
    assert.ok(all.length > 0, 'Should find imported patterns');
    assert.equal(all[0].source, 'test-repo');
    assert.equal(all[0].license, 'MIT');

    const filtered = getProvenance(oracle, { source: 'test-repo' });
    assert.ok(filtered.length > 0);

    const noMatch = getProvenance(oracle, { source: 'nonexistent' });
    assert.equal(noMatch.length, 0);
  });

  it('getProvenance filters by license', () => {
    oracle.registerPattern({
      name: 'prov-test-lic',
      code: 'function provLicTest(x) { return x * 2; }',
      language: 'javascript',
      description: 'License test',
      tags: ['source:lic-repo', 'license:Apache-2.0', 'open-source'],
      testCode: 'if (provLicTest(3) !== 6) throw new Error("fail");',
    });

    const mitResults = getProvenance(oracle, { license: 'Apache-2.0' });
    assert.ok(mitResults.length > 0);
  });

  it('extractRepoName extracts from URL', () => {
    assert.equal(extractRepoName('https://github.com/user/repo'), 'repo');
    assert.equal(extractRepoName('https://github.com/user/repo.git'), 'repo');
    assert.equal(extractRepoName('git@github.com:user/my-lib.git'), 'my-lib');
    assert.equal(extractRepoName(null), 'unknown');
    assert.equal(extractRepoName(''), 'unknown');
  });
});

// ─── Layer 6: Deduplication ─────────────────────────────────────────────────

describe('Layer 6: Deduplication', () => {
  describe('codeFingerprint', () => {
    it('produces consistent fingerprints', () => {
      const code = 'function add(a, b) { return a + b; }';
      const fp1 = codeFingerprint(code);
      const fp2 = codeFingerprint(code);
      assert.equal(fp1, fp2, 'Same code should produce same fingerprint');
    });

    it('ignores whitespace differences', () => {
      const code1 = 'function add(a, b) { return a + b; }';
      const code2 = 'function  add( a,  b )  {  return  a  +  b; }';
      assert.equal(codeFingerprint(code1), codeFingerprint(code2));
    });

    it('ignores comments', () => {
      const code1 = 'function add(a, b) { return a + b; }';
      const code2 = '// adds two numbers\nfunction add(a, b) { return a + b; }';
      assert.equal(codeFingerprint(code1), codeFingerprint(code2));
    });

    it('produces different fingerprints for different code', () => {
      const fp1 = codeFingerprint('function add(a, b) { return a + b; }');
      const fp2 = codeFingerprint('function multiply(a, b) { return a * b; }');
      assert.notEqual(fp1, fp2);
    });

    it('handles empty input', () => {
      assert.equal(codeFingerprint(''), '');
      assert.equal(codeFingerprint(null), '');
      assert.equal(codeFingerprint(undefined), '');
    });

    it('is 16 chars hex', () => {
      const fp = codeFingerprint('function test() { return true; }');
      assert.equal(fp.length, 16);
      assert.ok(/^[0-9a-f]+$/.test(fp));
    });
  });

  describe('codeSimilarity', () => {
    it('identical code has similarity 1.0', () => {
      const code = 'function add(a, b) { return a + b; }';
      const sim = codeSimilarity(code, code);
      assert.ok(sim >= 0.99, `Expected ~1.0, got ${sim}`);
    });

    it('similar code has high similarity', () => {
      const code1 = 'function add(a, b) { return a + b; }';
      const code2 = 'function sum(a, b) { return a + b; }';
      const sim = codeSimilarity(code1, code2);
      assert.ok(sim > 0.5, `Expected > 0.5, got ${sim}`);
    });

    it('different code has low similarity', () => {
      const code1 = 'function add(a, b) { return a + b; }';
      const code2 = 'class EventEmitter { constructor() { this.handlers = {}; } on(name, fn) { this.handlers[name] = fn; } }';
      const sim = codeSimilarity(code1, code2);
      assert.ok(sim < 0.5, `Expected < 0.5, got ${sim}`);
    });

    it('handles empty input', () => {
      assert.equal(codeSimilarity('', 'test'), 0);
      assert.equal(codeSimilarity('test', ''), 0);
      assert.equal(codeSimilarity(null, null), 0);
    });
  });

  describe('findDuplicates', () => {
    let tmpDir;
    let oracle;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-dedup-test-'));
      oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds no duplicates in empty library', () => {
      const dupes = findDuplicates(oracle);
      assert.equal(dupes.length, 0);
    });

    it('finds exact duplicates', () => {
      const code = 'function testDup(x) { return x * 2; }';
      oracle.registerPattern({
        name: 'dup-test-1',
        code,
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (testDup(5) !== 10) throw new Error("fail");',
      });
      oracle.registerPattern({
        name: 'dup-test-2',
        code,
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (testDup(5) !== 10) throw new Error("fail");',
      });

      const dupes = findDuplicates(oracle);
      assert.ok(dupes.length > 0, 'Should find at least one duplicate pair');
      assert.equal(dupes[0].type, 'exact');
      assert.equal(dupes[0].similarity, 1.0);
    });

    it('finds near-duplicates above threshold', () => {
      oracle.registerPattern({
        name: 'near-dup-1',
        code: 'function addNumbers(a, b) { return a + b; }',
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (addNumbers(1, 2) !== 3) throw new Error("fail");',
      });
      oracle.registerPattern({
        name: 'near-dup-2',
        code: 'function sumNumbers(a, b) { return a + b; }',
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (sumNumbers(1, 2) !== 3) throw new Error("fail");',
      });

      const dupes = findDuplicates(oracle, { threshold: 0.5 });
      // These are very similar (differ only in function name), should be found
      assert.ok(dupes.length > 0, 'Should find near-duplicate');
    });

    it('sorts by similarity descending', () => {
      oracle.registerPattern({
        name: 'sort-dup-1',
        code: 'function sortTest(arr) { return arr.sort(); }',
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (JSON.stringify(sortTest([3,1,2])) !== "[1,2,3]") throw new Error("fail");',
      });
      oracle.registerPattern({
        name: 'sort-dup-2',
        code: 'function sortTest(arr) { return arr.sort(); }',
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (JSON.stringify(sortTest([3,1,2])) !== "[1,2,3]") throw new Error("fail");',
      });

      const dupes = findDuplicates(oracle);
      for (let i = 1; i < dupes.length; i++) {
        assert.ok(dupes[i - 1].similarity >= dupes[i].similarity);
      }
    });
  });

  describe('isDuplicate', () => {
    let tmpDir;
    let oracle;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-isdup-test-'));
      oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns false for empty library', () => {
      const result = isDuplicate(oracle, 'function foo() { return 1; }');
      assert.ok(!result.duplicate);
    });

    it('detects exact duplicates', () => {
      const code = 'function isDupExact(n) { return n > 0; }';
      oracle.registerPattern({
        name: 'isdup-exact',
        code,
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (isDupExact(1) !== true) throw new Error("fail");',
      });

      const result = isDuplicate(oracle, code);
      assert.ok(result.duplicate);
      assert.equal(result.type, 'exact');
      assert.equal(result.similarity, 1.0);
    });

    it('returns match info', () => {
      const code = 'function isDupInfo(val) { return val !== null; }';
      oracle.registerPattern({
        name: 'isdup-info',
        code,
        language: 'javascript',
        tags: ['test'],
        testCode: 'if (isDupInfo("x") !== true) throw new Error("fail");',
      });

      const result = isDuplicate(oracle, code);
      assert.ok(result.match);
      assert.ok(result.match.id);
      assert.equal(result.match.name, 'isdup-info');
    });
  });
});

// ─── Integration: Schema migration ──────────────────────────────────────────

describe('Schema: Provenance columns', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-schema-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('patterns include provenance fields after migration', () => {
    const result = oracle.registerPattern({
      name: 'schema-test',
      code: 'function schemaTest(x) { return x + 1; }',
      language: 'javascript',
      tags: ['test'],
      testCode: 'if (schemaTest(1) !== 2) throw new Error("fail");',
    });

    assert.ok(result.registered);
    const pattern = oracle.patterns.getAll().find(p => p.name === 'schema-test');
    assert.ok(pattern, 'Pattern should be found');
    // Provenance fields should exist (null by default)
    assert.ok('sourceUrl' in pattern);
    assert.ok('sourceRepo' in pattern);
    assert.ok('sourceLicense' in pattern);
    assert.ok('sourceCommit' in pattern);
    assert.ok('sourceFile' in pattern);
  });

  it('provenance fields can be updated', () => {
    oracle.registerPattern({
      name: 'prov-update-test',
      code: 'function provUpdate(x) { return x * 3; }',
      language: 'javascript',
      tags: ['test'],
      testCode: 'if (provUpdate(2) !== 6) throw new Error("fail");',
    });

    const pattern = oracle.patterns.getAll().find(p => p.name === 'prov-update-test');
    const updated = oracle.patterns.update(pattern.id, {
      sourceUrl: 'https://github.com/test/repo',
      sourceRepo: 'test-repo',
      sourceLicense: 'MIT',
      sourceCommit: 'abc123def456',
    });

    assert.ok(updated);
    assert.equal(updated.sourceUrl, 'https://github.com/test/repo');
    assert.equal(updated.sourceRepo, 'test-repo');
    assert.equal(updated.sourceLicense, 'MIT');
    assert.equal(updated.sourceCommit, 'abc123def456');
  });
});

// ─── Integration: CLI smoke test ────────────────────────────────────────────

describe('CLI: registry commands', () => {
  const { execSync } = require('child_process');
  const CLI = path.resolve(__dirname, '../src/cli.js');

  it('registry help outputs usage', () => {
    const output = execSync(`node ${CLI} registry help`, { encoding: 'utf-8', timeout: 10000 });
    assert.ok(output.includes('Open Source Registry'));
    assert.ok(output.includes('registry list'));
    assert.ok(output.includes('registry search'));
  });

  it('registry list --json returns array', () => {
    const output = execSync(`node ${CLI} registry list --json`, { encoding: 'utf-8', timeout: 10000 });
    const repos = JSON.parse(output);
    assert.ok(Array.isArray(repos));
    assert.ok(repos.length > 0);
  });

  it('registry search works with --json', () => {
    const output = execSync(`node ${CLI} registry search algorithm --json`, { encoding: 'utf-8', timeout: 10000 });
    const results = JSON.parse(output);
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.ok(results[0].score > 0);
  });

  it('registry license MIT --json returns allowed', () => {
    const output = execSync(`node ${CLI} registry license MIT --json`, { encoding: 'utf-8', timeout: 10000 });
    const result = JSON.parse(output);
    assert.ok(result.allowed);
    assert.equal(result.category, 'permissive');
  });

  it('registry license GPL-3.0 --json returns blocked', () => {
    const output = execSync(`node ${CLI} registry license GPL-3.0 --json`, { encoding: 'utf-8', timeout: 10000 });
    const result = JSON.parse(output);
    assert.ok(!result.allowed);
  });
});
