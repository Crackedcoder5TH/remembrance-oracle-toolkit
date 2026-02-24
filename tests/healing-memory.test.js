const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let SQLiteStore;
try {
  ({ SQLiteStore } = require('../src/store/sqlite'));
} catch {
  SQLiteStore = null;
}

const skipSQLite = !SQLiteStore || !(() => { try { require('node:sqlite'); return true; } catch { return false; } })();

describe('Healing Memory — healed_variants table', { skip: skipSQLite && 'SQLite not available' }, () => {
  let tmpDir, store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healing-memory-'));
    store = new SQLiteStore(tmpDir);

    // Seed a pattern to serve as parent
    store._insertPattern({
      name: 'test-pattern',
      code: 'function test() { return 1; }',
      language: 'javascript',
      coherencyScore: { total: 0.7 },
      tags: ['test'],
    });
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores a healed variant and retrieves it', () => {
    const parent = store.getAllPatterns()[0];
    const variant = store.addHealedVariant({
      parentPatternId: parent.id,
      healedCode: 'function test() { return 1; /* healed */ }',
      originalCoherency: 0.7,
      healedCoherency: 0.85,
      healingLoops: 2,
      healingStrategy: 'simplify',
      healingSummary: 'Simplified the test function',
      whisper: 'The code found clarity.',
    });

    assert.ok(variant.id, 'should have an id');
    assert.equal(variant.parentPatternId, parent.id);
    assert.equal(variant.healedCoherency, 0.85);
    assert.equal(variant.originalCoherency, 0.7);
    assert.ok(variant.coherencyDelta > 0.14 && variant.coherencyDelta < 0.16, 'delta should be ~0.15');
    assert.equal(variant.healingLoops, 2);
    assert.equal(variant.healingStrategy, 'simplify');
    assert.ok(variant.healedAt);
  });

  it('retrieves all healed variants ordered by coherency', () => {
    const parent = store.getAllPatterns()[0];
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'v1', originalCoherency: 0.7, healedCoherency: 0.8 });
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'v2', originalCoherency: 0.7, healedCoherency: 0.95 });
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'v3', originalCoherency: 0.7, healedCoherency: 0.85 });

    const variants = store.getHealedVariants(parent.id);
    assert.equal(variants.length, 3);
    assert.equal(variants[0].healedCoherency, 0.95, 'best first');
    assert.equal(variants[1].healedCoherency, 0.85);
    assert.equal(variants[2].healedCoherency, 0.8);
  });

  it('getBestHealedVariant returns highest coherency', () => {
    const parent = store.getAllPatterns()[0];
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'low', originalCoherency: 0.7, healedCoherency: 0.75 });
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'high', originalCoherency: 0.7, healedCoherency: 0.92 });

    const best = store.getBestHealedVariant(parent.id);
    assert.ok(best);
    assert.equal(best.healedCode, 'high');
    assert.equal(best.healedCoherency, 0.92);
  });

  it('getBestHealedVariant returns null for pattern with no variants', () => {
    const best = store.getBestHealedVariant('nonexistent-id');
    assert.equal(best, null);
  });

  it('getHealingLineage returns full ancestry', () => {
    const parent = store.getAllPatterns()[0];
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'v1', originalCoherency: 0.7, healedCoherency: 0.8, healingLoops: 1 });
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'v2', originalCoherency: 0.7, healedCoherency: 0.9, healingLoops: 2 });

    const lineage = store.getHealingLineage(parent.id);
    assert.equal(lineage.patternId, parent.id);
    assert.equal(lineage.patternName, 'test-pattern');
    assert.equal(lineage.healingCount, 2);
    assert.equal(lineage.variants.length, 2);
    assert.equal(lineage.bestCoherency, 0.9);
    assert.ok(lineage.totalImprovement > 0.19, 'total improvement should be ~0.2');
  });

  it('audit log records healed variant addition', () => {
    const parent = store.getAllPatterns()[0];
    store.addHealedVariant({ parentPatternId: parent.id, healedCode: 'audited', originalCoherency: 0.7, healedCoherency: 0.85 });

    const log = store.getAuditLog({ table: 'healed_variants', limit: 1 });
    assert.equal(log.length, 1);
    assert.equal(log[0].action, 'add');
    assert.equal(log[0].detail.parentPatternId, parent.id);
  });
});

describe('Healing Memory — healing_stats table', { skip: skipSQLite && 'SQLite not available' }, () => {
  let tmpDir, store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healing-stats-'));
    store = new SQLiteStore(tmpDir);

    store._insertPattern({
      name: 'stats-pattern',
      code: 'function stats() {}',
      language: 'javascript',
      coherencyScore: { total: 0.6 },
      tags: ['test'],
    });
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records healing attempts', () => {
    const pattern = store.getAllPatterns()[0];
    store.recordHealingAttempt({ patternId: pattern.id, succeeded: true, coherencyBefore: 0.6, coherencyAfter: 0.8, healingLoops: 2 });
    store.recordHealingAttempt({ patternId: pattern.id, succeeded: true, coherencyBefore: 0.8, coherencyAfter: 0.9, healingLoops: 1 });
    store.recordHealingAttempt({ patternId: pattern.id, succeeded: false, coherencyBefore: 0.6, coherencyAfter: 0.55 });

    const stats = store.getPatternHealingStats(pattern.id);
    assert.equal(stats.attempts, 3);
    assert.equal(stats.successes, 2);
    assert.ok(stats.rate > 0.66 && stats.rate < 0.67, 'rate should be ~0.667');
    assert.equal(stats.peakCoherency, 0.9);
  });

  it('getHealingSuccessRate returns optimistic default for unknown patterns', () => {
    assert.equal(store.getHealingSuccessRate('nonexistent'), 1.0);
  });

  it('getHealingSuccessRate returns correct rate', () => {
    const pattern = store.getAllPatterns()[0];
    store.recordHealingAttempt({ patternId: pattern.id, succeeded: true });
    store.recordHealingAttempt({ patternId: pattern.id, succeeded: false });
    assert.equal(store.getHealingSuccessRate(pattern.id), 0.5);
  });

  it('getAllHealingStats returns aggregate across patterns', () => {
    const p = store.getAllPatterns()[0];
    store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.6, coherencyAfter: 0.8 });

    store._insertPattern({ name: 'other-pattern', code: 'x', language: 'javascript', coherencyScore: { total: 0.5 } });
    const p2 = store.getAllPatterns().find(x => x.name === 'other-pattern');
    store.recordHealingAttempt({ patternId: p2.id, succeeded: true, coherencyBefore: 0.5, coherencyAfter: 0.7 });

    const allStats = store.getAllHealingStats();
    assert.equal(allStats.patterns, 2);
    assert.equal(allStats.totalAttempts, 2);
    assert.equal(allStats.totalSuccesses, 2);
    assert.equal(allStats.details.length, 2);
  });

  it('queryHealingImprovement finds patterns above threshold', () => {
    const p = store.getAllPatterns()[0];
    store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.5, coherencyAfter: 0.8 }); // delta 0.3
    store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.6, coherencyAfter: 0.7 }); // delta 0.1

    const improved = store.queryHealingImprovement(0.2);
    assert.equal(improved.length, 1, 'should find the pattern with delta >= 0.2');
    assert.equal(improved[0].id, p.id);
    assert.ok(improved[0].bestDelta >= 0.3, 'bestDelta should be 0.3');
  });

  it('queryHealingImprovement returns empty for low threshold', () => {
    const p = store.getAllPatterns()[0];
    store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.6, coherencyAfter: 0.65 });

    const improved = store.queryHealingImprovement(0.2);
    assert.equal(improved.length, 0, 'delta 0.05 is below 0.2 threshold');
  });
});

describe('Healing Memory — composite boost formula', { skip: skipSQLite && 'SQLite not available' }, () => {
  let tmpDir, store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healing-boost-'));
    store = new SQLiteStore(tmpDir);

    store._insertPattern({
      name: 'boost-pattern',
      code: 'function boost() {}',
      language: 'javascript',
      coherencyScore: { total: 0.7 },
    });
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 1.0 for patterns with no healing history', () => {
    assert.equal(store.getHealingCompositeBoost('unknown'), 1.0);
  });

  it('returns base success rate for patterns with no improvement', () => {
    const p = store.getAllPatterns()[0];
    store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.7, coherencyAfter: 0.7 }); // zero delta
    const boost = store.getHealingCompositeBoost(p.id);
    assert.equal(boost, 1.0, 'success rate 1.0 * (1 + 0) = 1.0');
  });

  it('battle-tested pattern gets a boost above base rate', () => {
    const p = store.getAllPatterns()[0];
    // 10 successful heals with positive improvement
    for (let i = 0; i < 10; i++) {
      store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.6, coherencyAfter: 0.8 });
    }
    const boost = store.getHealingCompositeBoost(p.id);
    assert.ok(boost > 1.0, `battle-tested boost should be > 1.0, got ${boost}`);
    assert.ok(boost <= 1.5, `boost should be capped at 1.5, got ${boost}`);
  });

  it('failed healings reduce the boost', () => {
    const p = store.getAllPatterns()[0];
    store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.6, coherencyAfter: 0.8 });
    store.recordHealingAttempt({ patternId: p.id, succeeded: false, coherencyBefore: 0.6, coherencyAfter: 0.5 });
    const boost = store.getHealingCompositeBoost(p.id);
    assert.ok(boost < 1.0, `50% success rate should yield boost < 1.0, got ${boost}`);
  });

  it('boost is capped at 1.5', () => {
    const p = store.getAllPatterns()[0];
    // 100 successful heals with large improvement
    for (let i = 0; i < 100; i++) {
      store.recordHealingAttempt({ patternId: p.id, succeeded: true, coherencyBefore: 0.3, coherencyAfter: 0.95 });
    }
    const boost = store.getHealingCompositeBoost(p.id);
    assert.ok(boost <= 1.5, `boost should never exceed 1.5, got ${boost}`);
  });
});

describe('Healing Memory — resolve() integration', () => {
  let tmpDir, oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healing-resolve-'));
    const { RemembranceOracle } = require('../src/api/oracle');
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });

    oracle.registerPattern({
      name: 'map-values',
      code: `function mapValues(obj, fn) {
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = fn(obj[key], key);
  }
  return result;
}`,
      language: 'javascript',
      description: 'Map over object values',
      tags: ['object', 'transform', 'utility'],
      testCode: `
const r = mapValues({ a: 1, b: 2 }, v => v * 2);
if (r.a !== 2 || r.b !== 4) throw new Error('fail');`,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes healedVariantId in response when variant is stored', () => {
    const result = oracle.resolve({ description: 'map over object values', tags: ['object', 'transform'] });
    // healedVariantId may be null if coherency didn't improve, but the field must exist
    assert.ok('healedVariantId' in result, 'response should include healedVariantId field');
  });

  it('records healing stats persistently', () => {
    oracle.resolve({ description: 'map over object values', tags: ['object'] });

    const stats = oracle.healingStats();
    assert.ok(stats.totalAttempts >= 1, 'should have at least 1 healing attempt recorded');
  });

  it('fractal loop: second resolve can start from healed variant', () => {
    // First heal
    const r1 = oracle.resolve({ description: 'map over object values', tags: ['object'] });
    // Second heal — should start from best healed variant if one was stored
    const r2 = oracle.resolve({ description: 'map over object values', tags: ['object'] });

    // Both should succeed
    assert.ok(r1.healedCode);
    assert.ok(r2.healedCode);
    assert.ok(r1.decision === 'pull' || r1.decision === 'evolve');
    assert.ok(r2.decision === 'pull' || r2.decision === 'evolve');
  });
});
