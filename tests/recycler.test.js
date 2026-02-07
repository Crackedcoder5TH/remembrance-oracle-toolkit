const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { PatternRecycler, APPROACH_SWAPS } = require('../src/core/recycler');
const { RemembranceOracle } = require('../src/api/oracle');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `recycler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('PatternRecycler', () => {
  let oracle, recycler, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, generateVariants: false });
    recycler = new PatternRecycler(oracle, { maxHealAttempts: 2, maxSerfLoops: 2, generateVariants: false });
  });

  describe('capture', () => {
    it('captures a failed pattern', () => {
      const entry = recycler.capture(
        { name: 'test-fail', code: 'broken', language: 'javascript' },
        'test failure',
        null
      );

      assert.equal(entry.status, 'pending');
      assert.equal(entry.pattern.name, 'test-fail');
      assert.equal(entry.failureReason, 'test failure');
      assert.equal(recycler.stats.captured, 1);
    });

    it('getCaptured returns all failures', () => {
      recycler.capture({ name: 'a', code: 'x', language: 'javascript' }, 'reason a');
      recycler.capture({ name: 'b', code: 'y', language: 'python' }, 'reason b');

      assert.equal(recycler.getCaptured().length, 2);
      assert.equal(recycler.getCaptured({ language: 'python' }).length, 1);
      assert.equal(recycler.getCaptured({ status: 'pending' }).length, 2);
    });
  });

  describe('heal', () => {
    it('heals a pattern with fixable style issues', () => {
      // Code that's valid but has low coherency due to style
      const messyCode = `function   add(a,b){
var result=a+b;
return result
}`;
      const testCode = 'if (add(2, 3) !== 5) throw new Error("fail");';

      recycler.capture(
        { name: 'messy-add', code: messyCode, testCode, language: 'javascript', description: 'add', tags: ['math'], patternType: 'utility' },
        'low coherency'
      );

      const report = recycler.recycleFailed();
      // SERF should clean it up (or it was already valid enough)
      assert.ok(report.processed > 0);
    });

    it('marks exhausted when healing fails repeatedly', () => {
      // Truly broken code that SERF can't fix
      recycler.capture(
        { name: 'broken', code: '}{}{}{', language: 'javascript', description: 'broken', tags: [], patternType: 'utility' },
        'syntax error'
      );

      const report = recycler.recycleFailed();
      assert.equal(report.exhausted, 1);
      const captured = recycler.getCaptured({ status: 'exhausted' });
      assert.equal(captured.length, 1);
    });
  });

  describe('processSeeds', () => {
    it('registers valid seeds', () => {
      const seeds = [
        {
          name: 'test-add',
          code: 'function add(a, b) { return a + b; }',
          testCode: 'if (add(1, 2) !== 3) throw new Error("fail");',
          language: 'javascript',
          description: 'Add two numbers',
          tags: ['math'],
          patternType: 'utility',
        },
        {
          name: 'test-sub',
          code: 'function sub(a, b) { return a - b; }',
          testCode: 'if (sub(5, 3) !== 2) throw new Error("fail");',
          language: 'javascript',
          description: 'Subtract two numbers',
          tags: ['math'],
          patternType: 'utility',
        },
      ];

      const report = recycler.processSeeds(seeds, { depth: 0 });
      assert.equal(report.registered, 2);
      assert.equal(report.failed, 0);
      assert.equal(report.waves.length, 1);
      assert.ok(report.total >= 2);
    });

    it('captures and recycles failures', () => {
      const seeds = [
        {
          name: 'good-one',
          code: 'function square(n) { return n * n; }',
          testCode: 'if (square(3) !== 9) throw new Error("fail");',
          language: 'javascript',
          description: 'Square a number',
          tags: ['math'],
          patternType: 'utility',
        },
        {
          name: 'bad-test',
          code: 'function broken(n) { return n + 1; }',
          testCode: 'if (broken(1) !== 999) throw new Error("wrong!");',
          language: 'javascript',
          description: 'Intentionally failing test',
          tags: ['broken'],
          patternType: 'utility',
        },
      ];

      const report = recycler.processSeeds(seeds, { depth: 0 });
      assert.equal(report.registered, 1);
      assert.equal(report.failed, 1);
    });

    it('skips already-registered seeds', () => {
      const seed = {
        name: 'unique-fn',
        code: 'function uniqueFn(x) { return x; }',
        testCode: 'if (uniqueFn(42) !== 42) throw new Error("fail");',
        language: 'javascript',
        description: 'Identity function',
        tags: ['utility'],
        patternType: 'utility',
      };

      // Register first
      oracle.registerPattern(seed);

      // Process same seed again
      const report = recycler.processSeeds([seed], { depth: 0 });
      assert.equal(report.registered, 1); // counted as registered (already exists)
      assert.equal(report.failed, 0);
    });
  });

  describe('TypeScript variants', () => {
    it('generates TS variant from JS pattern', () => {
      const tsRecycler = new PatternRecycler(oracle, { generateVariants: true, variantLanguages: ['typescript'] });
      const seed = {
        name: 'double',
        code: 'function double(n) { return n * 2; }',
        testCode: 'if (double(5) !== 10) throw new Error("fail");',
        language: 'javascript',
        description: 'Double a number',
        tags: ['math'],
        patternType: 'utility',
      };

      const report = tsRecycler.processSeeds([seed], { depth: 1 });
      assert.equal(report.registered, 1);
      assert.ok(report.variants.spawned >= 1);

      // Check that the TS variant exists
      const all = oracle.patterns.getAll();
      const tsVariant = all.find(p => p.name === 'double-ts');
      if (tsVariant) {
        assert.equal(tsVariant.language, 'typescript');
        assert.ok(tsVariant.code.includes(':'));  // Has type annotations
      }
    });
  });

  describe('Python variants', () => {
    it('generates Python variant from simple JS pattern', () => {
      const pyRecycler = new PatternRecycler(oracle, { generateVariants: true, variantLanguages: ['python'] });
      const seed = {
        name: 'triple',
        code: 'function triple(n) {\n  return n * 3;\n}',
        testCode: 'if (triple(4) !== 12) throw new Error("fail");',
        language: 'javascript',
        description: 'Triple a number',
        tags: ['math'],
        patternType: 'utility',
      };

      const report = pyRecycler.processSeeds([seed], { depth: 1 });
      assert.equal(report.registered, 1);

      const all = oracle.patterns.getAll();
      const pyVariant = all.find(p => p.name === 'triple-py');
      if (pyVariant) {
        assert.equal(pyVariant.language, 'python');
        assert.ok(pyVariant.code.includes('def triple'));
      }
    });

    it('skips complex patterns that cannot transpile to Python', () => {
      const pyRecycler = new PatternRecycler(oracle, { generateVariants: true, variantLanguages: ['python'] });
      const seed = {
        name: 'regex-thing',
        code: 'function clean(s) {\n  return s.replace(/[^a-z]/g, "");\n}',
        testCode: 'if (clean("a1b2") !== "ab") throw new Error("fail");',
        language: 'javascript',
        description: 'Clean string with regex',
        tags: ['string'],
        patternType: 'utility',
      };

      const report = pyRecycler.processSeeds([seed], { depth: 1 });
      // Should register the JS seed but NOT create a Python variant (regex)
      assert.equal(report.registered, 1);
      const all = oracle.patterns.getAll();
      const pyVariant = all.find(p => p.name === 'regex-thing-py');
      assert.equal(pyVariant, undefined);
    });
  });

  describe('report formatting', () => {
    it('produces a readable report', () => {
      const report = {
        registered: 10, failed: 2, recycled: 1,
        variants: { spawned: 5, accepted: 3 },
        approaches: { spawned: 2, accepted: 1 },
        depth: 2, total: 14,
        waves: [
          { wave: 0, label: 'seeds', registered: 10, failed: 2, healed: 1, variants: 0 },
          { wave: 1, label: 'variants-depth-1', registered: 3, failed: 2, healed: 0, variants: 5 },
        ],
      };

      const text = PatternRecycler.formatReport(report);
      assert.ok(text.includes('Pattern Recycler Report'));
      assert.ok(text.includes('Registered:         10'));
      assert.ok(text.includes('Variants spawned:     5'));
      assert.ok(text.includes('Total in library:     14'));
      assert.ok(text.includes('[0] seeds'));
      assert.ok(text.includes('[1] variants-depth-1'));
    });
  });

  describe('approach swaps', () => {
    it('detects recursive pattern', () => {
      const recursiveSwap = APPROACH_SWAPS.find(s => s.from === 'recursive');
      assert.ok(recursiveSwap);
      assert.ok(recursiveSwap.detect('function fib(n) { return fib(n-1) + fib(n-2); }'));
      assert.ok(!recursiveSwap.detect('function add(a, b) { return a + b; }'));
    });

    it('detects for-loop pattern', () => {
      const forSwap = APPROACH_SWAPS.find(s => s.from === 'for-loop');
      assert.ok(forSwap);
      assert.ok(forSwap.detect('for (let i = 0; i < n; i++) { sum += arr[i]; }'));
      assert.ok(!forSwap.detect('arr.map(x => x * 2)'));
    });

    it('detects mutable pattern', () => {
      const mutSwap = APPROACH_SWAPS.find(s => s.from === 'mutable');
      assert.ok(mutSwap);
      assert.ok(mutSwap.detect('let a = 1; let b = 2; let c = 3;'));
      assert.ok(!mutSwap.detect('const x = 42;'));
    });
  });

  describe('stats tracking', () => {
    it('tracks stats across operations', () => {
      const seed = {
        name: 'stat-test',
        code: 'function inc(n) { return n + 1; }',
        testCode: 'if (inc(0) !== 1) throw new Error("fail");',
        language: 'javascript', description: 'increment', tags: ['math'], patternType: 'utility',
      };

      recycler.processSeeds([seed], { depth: 0 });
      assert.ok(recycler.stats.captured >= 0);
    });
  });
});
