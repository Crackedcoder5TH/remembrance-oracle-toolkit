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

  describe('retire', () => {
    it('removes low-performing patterns', () => {
      lib.register({ name: 'good', code: 'function good() { return 1; }', tags: ['a'], testPassed: true });
      const result = lib.retire(0.99);
      assert.ok(result.retired >= 0);
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

describe('inferComplexity', () => {
  it('classifies small functions as atomic', () => {
    assert.equal(inferComplexity('function add(a, b) { return a + b; }'), 'atomic');
  });
  it('classifies medium code as composite', () => {
    const code = Array(30).fill('  const x = 1;').join('\n');
    assert.equal(inferComplexity(`function big() {\n${code}\n}`), 'composite');
  });
});
