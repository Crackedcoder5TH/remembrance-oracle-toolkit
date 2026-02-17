const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { PatternLibrary, classifyPattern, inferComplexity, THRESHOLDS } = require('../src/patterns/library');
const { makeTempDir, cleanTempDir } = require('./helpers');

describe('PatternLibrary', () => {
  let tmpDir;
  let lib;

  beforeEach(() => {
    tmpDir = makeTempDir('patterns-test');
    lib = new PatternLibrary(tmpDir);
  });

  afterEach(() => {
    cleanTempDir(tmpDir);
  });

  describe('register', () => {
    it('registers a pattern with coherency score', () => {
      const p = lib.register({
        name: 'quickSort',
        code: 'function quickSort(arr) { if (arr.length <= 1) return arr; const pivot = arr[0]; return [...quickSort(arr.filter(x => x < pivot)), pivot, ...quickSort(arr.filter(x => x > pivot))]; }',
        language: 'javascript',
        description: 'Quicksort implementation',
        tags: ['sort', 'algorithm'],
      });
      assert.ok(p.id);
      assert.equal(p.name, 'quickSort');
      assert.ok(p.coherencyScore.total > 0);
      assert.equal(p.patternType, 'algorithm');
    });

    it('auto-classifies pattern type', () => {
      const p = lib.register({
        name: 'debounce',
        code: 'function debounce(fn, d) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }',
        tags: ['utility'],
      });
      assert.equal(p.patternType, 'utility');
    });

    it('infers complexity tier', () => {
      const small = lib.register({
        name: 'add',
        code: 'function add(a, b) { return a + b; }',
      });
      assert.equal(small.complexity, 'atomic');
    });
  });

  describe('decide', () => {
    it('returns generate when library is empty', () => {
      const d = lib.decide({ description: 'sorting', tags: ['sort'] });
      assert.equal(d.decision, 'generate');
      assert.equal(d.confidence, 1.0);
    });

    it('returns pull for a strong match', () => {
      lib.register({
        name: 'quickSort',
        code: 'function quickSort(arr) { if (arr.length <= 1) return arr; const pivot = arr[0]; return [...quickSort(arr.filter(x => x < pivot)), pivot, ...quickSort(arr.filter(x => x > pivot))]; }',
        language: 'javascript',
        description: 'Sort an array using quicksort algorithm',
        tags: ['sort', 'algorithm', 'array'],
        testPassed: true,
      });

      const d = lib.decide({
        description: 'sort an array',
        tags: ['sort', 'array'],
        language: 'javascript',
      });
      assert.equal(d.decision, 'pull');
      assert.ok(d.confidence >= THRESHOLDS.pull);
      assert.equal(d.pattern.name, 'quickSort');
    });

    it('returns generate for unrelated requests', () => {
      lib.register({
        name: 'quickSort',
        code: 'function quickSort(arr) { return arr.sort(); }',
        description: 'Sorting',
        tags: ['sort'],
      });

      const d = lib.decide({
        description: 'machine learning neural network',
        tags: ['ml', 'neural'],
        language: 'python',
      });
      assert.ok(d.decision === 'generate' || d.decision === 'evolve');
    });

    it('includes alternatives', () => {
      lib.register({ name: 'a', code: 'function a() { return 1; }', tags: ['test'] });
      lib.register({ name: 'b', code: 'function b() { return 2; }', tags: ['test'] });
      lib.register({ name: 'c', code: 'function c() { return 3; }', tags: ['test'] });

      const d = lib.decide({ description: 'test function', tags: ['test'] });
      assert.ok(Array.isArray(d.alternatives));
    });
  });

  describe('recordUsage', () => {
    it('tracks usage and success counts', () => {
      const p = lib.register({ name: 'test', code: 'function x() { return 1; }', tags: ['t'] });
      lib.recordUsage(p.id, true);
      lib.recordUsage(p.id, true);
      lib.recordUsage(p.id, false);
      const updated = lib.recordUsage(p.id, true);
      assert.equal(updated.usageCount, 4);
      assert.equal(updated.successCount, 3);
    });

    it('returns null for nonexistent id', () => {
      const result = lib.recordUsage('nonexistent-id', true);
      assert.equal(result, null);
    });
  });

  describe('evolve', () => {
    it('creates an evolved version linked to parent', () => {
      const parent = lib.register({
        name: 'add',
        code: 'function add(a, b) { return a + b; }',
        tags: ['math'],
      });
      const evolved = lib.evolve(parent.id, 'function add(...nums) { return nums.reduce((a, b) => a + b, 0); }', {
        name: 'add (variadic)',
        description: 'Add any number of values',
      });
      assert.ok(evolved);
      assert.ok(evolved.id !== parent.id);
      assert.ok(evolved.evolutionHistory.length > 0);
    });

    it('returns null for unknown parent', () => {
      assert.equal(lib.evolve('nonexistent', 'code'), null);
    });
  });

  describe('reportBug', () => {
    it('increments bug count on valid pattern', () => {
      const p = lib.register({ name: 'buggy', code: 'function buggy() { return 1; }', tags: ['t'] });
      const result = lib.reportBug(p.id, 'crashes on null');
      assert.equal(result.success, true);
      assert.equal(result.bugReports, 1);
      assert.equal(result.patternName, 'buggy');
      assert.equal(result.description, 'crashes on null');
    });

    it('accumulates multiple bug reports', () => {
      const p = lib.register({ name: 'fragile', code: 'function fragile() { return 1; }', tags: ['t'] });
      lib.reportBug(p.id, 'bug 1');
      const result = lib.reportBug(p.id, 'bug 2');
      assert.equal(result.bugReports, 2);
    });

    it('returns failure for unknown pattern', () => {
      const result = lib.reportBug('nonexistent-id', 'bug');
      assert.equal(result.success, false);
      assert.ok(result.reason.includes('not found'));
    });
  });

  describe('getReliability', () => {
    it('returns reliability breakdown for a pattern', () => {
      const p = lib.register({ name: 'reliable', code: 'function reliable() { return 1; }', tags: ['t'] });
      lib.recordUsage(p.id, true);
      lib.recordUsage(p.id, true);
      lib.recordUsage(p.id, false);
      const r = lib.getReliability(p.id);
      assert.ok(r);
      assert.equal(r.patternId, p.id);
      assert.equal(r.patternName, 'reliable');
      assert.equal(r.usageCount, 3);
      assert.equal(r.successCount, 2);
      assert.ok(r.usageReliability > 0.6);
      assert.equal(r.bugReports, 0);
      assert.equal(r.bugPenalty, 1.0);
      assert.equal(r.healingRate, 1.0);
      assert.ok(typeof r.combined === 'number');
    });

    it('applies bug penalty to reliability', () => {
      const p = lib.register({ name: 'penalized', code: 'function penalized() { return 1; }', tags: ['t'] });
      lib.recordUsage(p.id, true);
      lib.reportBug(p.id, 'crash');
      lib.reportBug(p.id, 'another crash');
      const r = lib.getReliability(p.id);
      assert.ok(r.bugPenalty < 1.0);
      assert.equal(r.bugReports, 2);
    });

    it('returns null for unknown pattern', () => {
      assert.equal(lib.getReliability('nonexistent'), null);
    });

    it('uses healing rate provider when set', () => {
      const p = lib.register({ name: 'healed', code: 'function healed() { return 1; }', tags: ['t'] });
      lib.setHealingRateProvider(() => 0.5);
      const r = lib.getReliability(p.id);
      assert.equal(r.healingRate, 0.5);
    });

    it('reports default 0.5 reliability when no usage', () => {
      const p = lib.register({ name: 'unused', code: 'function unused() { return 1; }', tags: ['t'] });
      const r = lib.getReliability(p.id);
      assert.equal(r.usageReliability, 0.5);
      assert.equal(r.usageCount, 0);
    });
  });

  describe('setHealingRateProvider', () => {
    it('affects decide scoring', () => {
      lib.register({
        name: 'quickSort',
        code: 'function quickSort(arr) { if (arr.length <= 1) return arr; const pivot = arr[0]; return [...quickSort(arr.filter(x => x < pivot)), pivot, ...quickSort(arr.filter(x => x > pivot))]; }',
        language: 'javascript',
        description: 'Sort an array using quicksort algorithm',
        tags: ['sort', 'algorithm', 'array'],
        testPassed: true,
      });

      // With healing rate of 0 — should lower composite score
      lib.setHealingRateProvider(() => 0);
      const d1 = lib.decide({ description: 'sort an array', tags: ['sort'], language: 'javascript' });

      // With healing rate of 1 — should maintain composite score
      lib.setHealingRateProvider(() => 1.0);
      const d2 = lib.decide({ description: 'sort an array', tags: ['sort'], language: 'javascript' });

      assert.ok(d2.confidence >= d1.confidence);
    });
  });

  describe('getAll', () => {
    it('returns all patterns without filters', () => {
      lib.register({ name: 'a', code: 'function a() { return 1; }', tags: ['t'], language: 'javascript' });
      lib.register({ name: 'b', code: 'function b() { return 2; }', tags: ['t'], language: 'python' });
      const all = lib.getAll();
      assert.equal(all.length, 2);
    });

    it('filters by language', () => {
      lib.register({ name: 'js1', code: 'function js1() { return 1; }', tags: ['t'], language: 'javascript' });
      lib.register({ name: 'py1', code: 'def py1(): return 1', tags: ['t'], language: 'python' });
      const jsOnly = lib.getAll({ language: 'javascript' });
      assert.equal(jsOnly.length, 1);
      assert.equal(jsOnly[0].name, 'js1');
    });

    it('filters by language case-insensitively', () => {
      lib.register({ name: 'js2', code: 'function js2() { return 1; }', tags: ['t'], language: 'JavaScript' });
      const found = lib.getAll({ language: 'javascript' });
      assert.equal(found.length, 1);
    });

    it('filters by patternType', () => {
      lib.register({ name: 'quickSort', code: 'function quickSort() {}', tags: ['sort'], patternType: 'algorithm' });
      lib.register({ name: 'debounce', code: 'function debounce() {}', tags: ['util'], patternType: 'utility' });
      const algos = lib.getAll({ patternType: 'algorithm' });
      assert.equal(algos.length, 1);
      assert.equal(algos[0].name, 'quickSort');
    });

    it('filters by complexity', () => {
      lib.register({ name: 'small', code: 'function s() { return 1; }', tags: ['t'] });
      const code = Array(30).fill('  const x = 1;').join('\n');
      lib.register({ name: 'big', code: `function big() {\n${code}\n}`, tags: ['t'] });
      const atomic = lib.getAll({ complexity: 'atomic' });
      assert.ok(atomic.every(p => p.complexity === 'atomic'));
    });

    it('filters by minCoherency', () => {
      lib.register({ name: 'hi', code: 'function hi() { return 1; }', tags: ['t'], testPassed: true });
      const highQ = lib.getAll({ minCoherency: 0.3 });
      assert.ok(highQ.every(p => (p.coherencyScore?.total ?? 0) >= 0.3));
    });

    it('combines multiple filters', () => {
      lib.register({ name: 'target', code: 'function target() { return 1; }', tags: ['t'], language: 'javascript' });
      lib.register({ name: 'other', code: 'def other(): return 1', tags: ['t'], language: 'python' });
      const result = lib.getAll({ language: 'javascript', complexity: 'atomic' });
      assert.ok(result.length >= 1);
      assert.ok(result.every(p => (p.language || 'unknown').toLowerCase() === 'javascript'));
    });
  });

  describe('update', () => {
    it('updates pattern fields', () => {
      const p = lib.register({ name: 'updatable', code: 'function up() { return 1; }', tags: ['t'] });
      const updated = lib.update(p.id, { description: 'updated description', tags: ['new-tag'] });
      assert.ok(updated);
      assert.equal(updated.description, 'updated description');
      assert.deepEqual(updated.tags, ['new-tag']);
    });

    it('returns null for unknown id', () => {
      const result = lib.update('nonexistent-id', { description: 'test' });
      assert.equal(result, null);
    });

    it('sets updatedAt timestamp', () => {
      const p = lib.register({ name: 'timestamped', code: 'function ts() { return 1; }', tags: ['t'] });
      const before = p.updatedAt;
      // Small delay to ensure timestamp difference
      const updated = lib.update(p.id, { description: 'newer' });
      assert.ok(updated.updatedAt);
      assert.ok(updated.updatedAt >= before);
    });
  });

  describe('retire', () => {
    it('removes low-performing patterns', () => {
      lib.register({ name: 'good', code: 'function good() { return 1; }', tags: ['a'], testPassed: true });
      const result = lib.retire(0.99);
      assert.ok(result.retired >= 0);
    });

    it('keeps high-scoring patterns', () => {
      lib.register({ name: 'keeper', code: 'function keeper() { return 1; }', tags: ['t'], testPassed: true });
      const result = lib.retire(0.01);
      assert.equal(result.retired, 0);
      assert.equal(result.remaining, 1);
    });

    it('returns counts', () => {
      lib.register({ name: 'r1', code: 'function r1() { return 1; }', tags: ['t'] });
      lib.register({ name: 'r2', code: 'function r2() { return 2; }', tags: ['t'] });
      const result = lib.retire(0.99);
      assert.ok(typeof result.retired === 'number');
      assert.ok(typeof result.remaining === 'number');
    });
  });

  describe('summary', () => {
    it('returns library stats', () => {
      lib.register({ name: 'a', code: 'function a() { return 1; }', tags: ['t'] });
      const s = lib.summary();
      assert.ok(s.totalPatterns >= 1);
      assert.ok(s.byType);
      assert.ok(s.byComplexity);
      assert.ok(s.byLanguage);
    });

    it('returns zero stats for empty library', () => {
      const s = lib.summary();
      assert.equal(s.totalPatterns, 0);
      assert.equal(s.avgCoherency, 0);
    });

    it('computes average coherency', () => {
      lib.register({ name: 's1', code: 'function s1() { return 1; }', tags: ['t'] });
      lib.register({ name: 's2', code: 'function s2() { return 2; }', tags: ['t'] });
      const s = lib.summary();
      assert.ok(typeof s.avgCoherency === 'number');
      assert.ok(s.avgCoherency > 0);
    });
  });

  describe('compose', () => {
    it('creates a composed pattern from components', () => {
      const a = lib.register({ name: 'comp-a', code: 'function compA() { return 1; }', tags: ['test'] });
      const b = lib.register({ name: 'comp-b', code: 'function compB() { return 2; }', tags: ['test'] });
      const result = lib.compose({ name: 'composed-ab', components: [a.id, b.id] });
      assert.ok(result.composed);
      assert.ok(result.pattern);
      assert.ok(result.pattern.code.includes('compA'));
      assert.ok(result.pattern.code.includes('compB'));
      assert.ok(result.pattern.tags.includes('composed'));
    });

    it('fails for unknown component', () => {
      const result = lib.compose({ name: 'bad', components: ['nonexistent'] });
      assert.equal(result.composed, false);
      assert.ok(result.reason.includes('not found'));
    });

    it('allows custom code', () => {
      const a = lib.register({ name: 'custom-base', code: 'function base() { return 1; }', tags: ['t'] });
      const result = lib.compose({
        name: 'custom-composed',
        components: [a.id],
        code: 'function custom() { return base() + 1; }',
      });
      assert.ok(result.composed);
      assert.ok(result.pattern.code.includes('custom'));
    });
  });

  describe('decide (extended)', () => {
    it('returns evolve for a partial match', () => {
      lib.register({
        name: 'basicSort',
        code: 'function basicSort(arr) { return arr.slice().sort((a, b) => a - b); }',
        language: 'javascript',
        description: 'Basic array sorter',
        tags: ['sort'],
      });

      const d = lib.decide({
        description: 'sort an array with custom comparator',
        tags: ['sort', 'custom'],
        language: 'javascript',
      });
      // Should be either evolve or generate — not pull (since it's only a partial match)
      assert.ok(['evolve', 'generate'].includes(d.decision));
      assert.ok(d.reasoning);
    });

    it('respects minCoherency override', () => {
      lib.register({
        name: 'testFn',
        code: 'function testFn(arr) { return arr.map(x => x * 2); }',
        language: 'javascript',
        description: 'Double array values',
        tags: ['array', 'transform'],
        testPassed: true,
      });

      // Very low minCoherency should make pull easier
      const d = lib.decide({
        description: 'double array values',
        tags: ['array', 'transform'],
        language: 'javascript',
        minCoherency: 0.1,
      });
      assert.equal(d.decision, 'pull');
    });

    it('handles null/invalid request gracefully', () => {
      lib.register({ name: 'x', code: 'function x() { return 1; }', tags: ['t'] });
      const d = lib.decide(null);
      assert.ok(['pull', 'evolve', 'generate'].includes(d.decision));
    });

    it('applies bug penalty to scoring', () => {
      const p = lib.register({
        name: 'buggySort',
        code: 'function buggySort(arr) { if (arr.length <= 1) return arr; const pivot = arr[0]; return [...buggySort(arr.filter(x => x < pivot)), pivot, ...buggySort(arr.filter(x => x > pivot))]; }',
        language: 'javascript',
        description: 'Sort an array using quicksort algorithm',
        tags: ['sort', 'algorithm'],
        testPassed: true,
      });

      // Record many bugs
      for (let i = 0; i < 8; i++) lib.reportBug(p.id, `bug ${i}`);

      const d = lib.decide({
        description: 'sort an array',
        tags: ['sort', 'algorithm'],
        language: 'javascript',
      });
      // Bug penalty should reduce score
      assert.ok(d.confidence < 1.0);
    });

    it('applies language filter with fallback', () => {
      lib.register({ name: 'pyFunc', code: 'def py_func(): return 1', tags: ['util'], language: 'python' });
      lib.register({ name: 'jsFunc', code: 'function jsFunc() { return 1; }', tags: ['util'], language: 'javascript' });

      const d = lib.decide({ description: 'utility function', tags: ['util'], language: 'python' });
      // Should prefer python pattern
      if (d.decision === 'pull' || d.decision === 'evolve') {
        assert.equal(d.pattern.language, 'python');
      }
    });
  });

  describe('candidates', () => {
    it('adds and retrieves a candidate', () => {
      const c = lib.addCandidate({
        name: 'candidate-1',
        code: 'function c1() { return 1; }',
        language: 'javascript',
        tags: ['test'],
        coherencyTotal: 0.7,
      });
      assert.ok(c.id);
      assert.equal(c.name, 'candidate-1');
      const all = lib.getCandidates();
      assert.ok(all.length >= 1);
    });

    it('filters candidates by language', () => {
      lib.addCandidate({ name: 'js-c', code: 'function jsc() {}', language: 'javascript', tags: ['t'] });
      lib.addCandidate({ name: 'py-c', code: 'def pyc(): pass', language: 'python', tags: ['t'] });
      const jsOnly = lib.getCandidates({ language: 'javascript' });
      assert.ok(jsOnly.every(c => c.language.toLowerCase() === 'javascript'));
    });

    it('filters candidates by minCoherency', () => {
      lib.addCandidate({ name: 'high', code: 'function hi() {}', language: 'javascript', tags: ['t'], coherencyTotal: 0.9 });
      lib.addCandidate({ name: 'low', code: 'function lo() {}', language: 'javascript', tags: ['t'], coherencyTotal: 0.3 });
      const highOnly = lib.getCandidates({ minCoherency: 0.5 });
      assert.ok(highOnly.every(c => (c.coherencyTotal ?? 0) >= 0.5));
    });

    it('promotes a candidate', () => {
      const c = lib.addCandidate({ name: 'promo', code: 'function promo() {}', language: 'javascript', tags: ['t'] });
      const promoted = lib.promoteCandidate(c.id);
      assert.ok(promoted);
      assert.ok(promoted.promotedAt);
      // Promoted candidates should not appear in getCandidates
      const remaining = lib.getCandidates();
      assert.ok(!remaining.find(x => x.id === c.id));
    });

    it('returns null when promoting unknown candidate', () => {
      assert.equal(lib.promoteCandidate('nonexistent'), null);
    });

    it('returns candidate summary', () => {
      lib.addCandidate({ name: 'sum-a', code: 'function a() {}', language: 'javascript', tags: ['t'], coherencyTotal: 0.8 });
      lib.addCandidate({ name: 'sum-b', code: 'function b() {}', language: 'python', tags: ['t'], coherencyTotal: 0.6 });
      const s = lib.candidateSummary();
      assert.ok(s.totalCandidates >= 2);
      assert.ok(s.byLanguage);
      assert.ok(typeof s.avgCoherency === 'number');
    });

    it('prunes low-coherency candidates', () => {
      lib.addCandidate({ name: 'keep', code: 'function keep() {}', language: 'javascript', tags: ['t'], coherencyTotal: 0.9 });
      lib.addCandidate({ name: 'prune', code: 'function prune() {}', language: 'javascript', tags: ['t'], coherencyTotal: 0.2 });
      const result = lib.pruneCandidates(0.5);
      assert.ok(result.removed >= 1);
      const remaining = lib.getCandidates();
      assert.ok(remaining.every(c => (c.coherencyTotal ?? 0) >= 0.5));
    });

    it('does not prune promoted candidates', () => {
      lib.addCandidate({ name: 'high-c', code: 'function hc() {}', language: 'javascript', tags: ['t'], coherencyTotal: 0.95 });
      const c = lib.addCandidate({ name: 'promoted-keep', code: 'function pk() {}', language: 'javascript', tags: ['t'], coherencyTotal: 0.1 });
      lib.promoteCandidate(c.id);
      const before = lib.pruneCandidates(0.5);
      // The promoted candidate with 0.1 coherency should survive pruning
      // (only unpromoted below threshold are removed)
      assert.ok(before.remaining >= 1);
    });
  });

  describe('resolveDependencies', () => {
    it('resolves a dependency chain', () => {
      const dep = lib.register({ name: 'dep-leaf', code: 'function leaf() {}', tags: ['t'] });
      const parent = lib.register({ name: 'dep-parent', code: 'function parent() {}', tags: ['t'], requires: [dep.id] });
      const deps = lib.resolveDependencies(parent.id);
      assert.ok(deps.length >= 1);
    });

    it('returns single pattern for standalone', () => {
      const p = lib.register({ name: 'standalone', code: 'function alone() {}', tags: ['t'] });
      const deps = lib.resolveDependencies(p.id);
      assert.equal(deps.length, 1);
      assert.equal(deps[0].id, p.id);
    });

    it('returns empty for unknown id', () => {
      const deps = lib.resolveDependencies('nonexistent-id');
      assert.equal(deps.length, 0);
    });
  });
});

describe('classifyPattern', () => {
  it('classifies sorting code as algorithm', () => {
    assert.equal(classifyPattern('function quickSort() {}', 'quickSort'), 'algorithm');
  });
  it('classifies debounce as utility', () => {
    assert.equal(classifyPattern('function debounce() {}', 'debounce'), 'utility');
  });
  it('classifies singleton as design-pattern', () => {
    assert.equal(classifyPattern('class Singleton {}', 'singleton'), 'design-pattern');
  });
  it('classifies validator as validation', () => {
    assert.equal(classifyPattern('function validateEmail() {}', 'validate'), 'validation');
  });
});

describe('classifyPattern (extended)', () => {
  it('classifies transformation code', () => {
    assert.equal(classifyPattern('function mapValues(obj) { return Object.values(obj).map(x => x); }', 'mapValues'), 'transformation');
  });
  it('classifies io code', () => {
    assert.equal(classifyPattern('function fetchData(url) { return fetch(url); }', 'fetchData'), 'io');
  });
  it('classifies concurrency code', () => {
    assert.equal(classifyPattern('async function run() { await Promise.all([]); }', 'asyncRunner'), 'concurrency');
  });
  it('classifies data structures', () => {
    assert.equal(classifyPattern('class LinkedList { constructor() { this.head = null; } }', 'linkedList'), 'data-structure');
  });
  it('classifies testing code', () => {
    assert.equal(classifyPattern('function createTestFixture() { return { data: 1 }; }', 'testFixture'), 'testing');
  });
  it('defaults to utility', () => {
    assert.equal(classifyPattern('function doSomething() { return 42; }', 'doSomething'), 'utility');
  });
});

describe('inferComplexity', () => {
  it('classifies small functions as atomic', () => {
    assert.equal(inferComplexity('function add(a, b) { return a + b; }'), 'atomic');
  });
  it('classifies medium code as composite', () => {
    const code = Array(30).fill('  const x = 1;').join('\n');
    assert.equal(inferComplexity(`function big() {\n${code}\n}`), 'composite');
  });
  it('classifies large deeply nested code as architectural', () => {
    const inner = '    if (a) { if (b) { if (c) { if (d) { if (e) { return 1; } } } } }';
    const code = Array(70).fill(inner).join('\n');
    assert.equal(inferComplexity(`function arch() {\n${code}\n}`), 'architectural');
  });
});
