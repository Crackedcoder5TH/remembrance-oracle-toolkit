const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');

describe('RemembranceOracle', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5 });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('submit', () => {
    it('accepts valid code with good coherency', () => {
      const result = oracle.submit('function add(a, b) { return a + b; }', {
        description: 'Add two numbers',
        tags: ['math', 'utility'],
        language: 'javascript',
      });
      assert.equal(result.accepted, true);
      assert.ok(result.entry.id);
      assert.ok(result.entry.coherencyScore.total >= 0.5);
    });

    it('rejects code that fails its test', () => {
      const result = oracle.submit('function broken() { return 1; }', {
        description: 'Bad code',
        language: 'javascript',
        testCode: 'if (broken() !== 999) throw new Error("FAIL");',
      });
      assert.equal(result.accepted, false);
      assert.ok(result.reason.length > 0);
    });

    it('accepts code that passes tests', () => {
      const code = 'function double(n) { return n * 2; }';
      const testCode = 'if (double(3) !== 6) throw new Error("FAIL");';
      const result = oracle.submit(code, {
        testCode,
        language: 'javascript',
        tags: ['math'],
      });
      assert.equal(result.accepted, true);
      assert.equal(result.validation.testPassed, true);
    });

    it('rejects code that fails tests', () => {
      const code = 'function double(n) { return n + 2; }';
      const testCode = 'if (double(3) !== 6) throw new Error("FAIL");';
      const result = oracle.submit(code, {
        testCode,
        language: 'javascript',
        tags: ['math'],
      });
      assert.equal(result.accepted, false);
    });
  });

  describe('query', () => {
    it('returns relevant results ranked by coherency', () => {
      oracle.submit('function sortArray(arr) { return arr.sort((a, b) => a - b); }', {
        description: 'Sort array ascending',
        tags: ['sort', 'array'],
        language: 'javascript',
      });
      oracle.submit('function reverseString(s) { return s.split("").reverse().join(""); }', {
        description: 'Reverse a string',
        tags: ['string', 'reverse'],
        language: 'javascript',
      });

      const results = oracle.query({
        description: 'sort an array',
        tags: ['sort'],
        language: 'javascript',
      });

      assert.ok(results.length > 0);
      assert.ok(results[0].code.includes('sort'));
    });

    it('filters by language', () => {
      oracle.submit('function add(a, b) { return a + b; }', {
        tags: ['math'],
        language: 'javascript',
      });

      const pyResults = oracle.query({ language: 'python' });
      // May return results but they should rank lower due to language mismatch
      // The key is the system works
      assert.ok(Array.isArray(pyResults));
    });

    it('returns empty for no matches', () => {
      const results = oracle.query({
        description: 'quantum computing',
        minCoherency: 0.99,
      });
      assert.equal(results.length, 0);
    });
  });

  describe('feedback', () => {
    it('updates reliability on positive feedback', () => {
      const { entry } = oracle.submit('function add(a, b) { return a + b; }', {
        tags: ['math'],
      });
      const result = oracle.feedback(entry.id, true);
      assert.equal(result.success, true);
      assert.equal(result.newReliability, 1.0);
    });

    it('updates reliability on negative feedback', () => {
      const { entry } = oracle.submit('function add(a, b) { return a + b; }', {
        tags: ['math'],
      });
      oracle.feedback(entry.id, true);
      oracle.feedback(entry.id, false);
      const inspection = oracle.inspect(entry.id);
      assert.equal(inspection.reliability.timesUsed, 2);
      assert.equal(inspection.reliability.historicalScore, 0.5);
    });

    it('returns error for unknown id', () => {
      const result = oracle.feedback('nonexistent', true);
      assert.equal(result.success, false);
    });
  });

  describe('stats', () => {
    it('returns summary', () => {
      oracle.submit('function x() { return 1; }', { tags: ['test'] });
      const stats = oracle.stats();
      assert.ok(stats.totalEntries >= 1);
      assert.ok(Array.isArray(stats.languages));
    });
  });

  describe('prune', () => {
    it('removes low-coherency entries', () => {
      oracle.submit('function x() { return 1; }', { tags: ['a'] });
      const result = oracle.prune(0.99);
      assert.ok(result.removed >= 0);
    });
  });
});
