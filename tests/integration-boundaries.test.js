const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTempDir, cleanTempDir, createTestOracle } = require('./helpers');

// ─── SQLite Store: Atomic incrementDecisions ─────────────────────────────────

describe('Integration — Atomic incrementDecisions', () => {
  let store, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir('int-atomic');
    const { SQLiteStore } = require('../src/store/sqlite');
    store = new SQLiteStore(tmpDir);
  });

  afterEach(() => {
    try { store.close(); } catch {}
    cleanTempDir(tmpDir);
  });

  it('incrementDecisions is atomic and returns correct value', () => {
    assert.strictEqual(store.incrementDecisions(), 1);
    assert.strictEqual(store.incrementDecisions(), 2);
    assert.strictEqual(store.incrementDecisions(), 3);
    assert.strictEqual(store.getMeta('decisions'), '3');
  });

  it('incrementDecisions works when decisions meta does not exist yet', () => {
    // Delete the decisions meta to simulate fresh state
    store.db.prepare("DELETE FROM meta WHERE key = 'decisions'").run();
    const result = store.incrementDecisions();
    assert.strictEqual(result, 1);
  });
});

// ─── SQLite Store: Optimistic Lock Retry ─────────────────────────────────────

describe('Integration — Optimistic Lock Retry', () => {
  let store, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir('int-lock');
    const { SQLiteStore } = require('../src/store/sqlite');
    store = new SQLiteStore(tmpDir);
  });

  afterEach(() => {
    try { store.close(); } catch {}
    cleanTempDir(tmpDir);
  });

  it('recordEntryUsage returns updated entry after success', () => {
    const entry = store.addEntry({
      code: 'function lock1() { return 1; }',
      language: 'javascript',
      coherencyScore: { total: 0.8 },
    });
    const updated = store.recordEntryUsage(entry.id, true);
    assert.ok(updated);
    assert.strictEqual(updated.reliability.timesUsed, 1);
    assert.strictEqual(updated.reliability.timesSucceeded, 1);
    assert.strictEqual(updated.reliability.historicalScore, 1.0);
  });

  it('recordPatternUsage returns updated pattern after success', () => {
    const pattern = store.addPattern({
      name: 'lock-test', code: 'function lockP() {}',
      language: 'javascript', coherencyScore: { total: 0.8 },
    });
    const updated = store.recordPatternUsage(pattern.id, true);
    assert.ok(updated);
    assert.strictEqual(updated.usageCount, 1);
    assert.strictEqual(updated.successCount, 1);
  });

  it('recordEntryUsage handles rapid successive calls', () => {
    const entry = store.addEntry({
      code: 'function rapid() { return 42; }',
      language: 'javascript',
      coherencyScore: { total: 0.9 },
    });
    // Rapid successive calls — each should see the previous update
    store.recordEntryUsage(entry.id, true);
    store.recordEntryUsage(entry.id, false);
    const final = store.recordEntryUsage(entry.id, true);
    assert.ok(final);
    assert.strictEqual(final.reliability.timesUsed, 3);
    assert.strictEqual(final.reliability.timesSucceeded, 2);
  });
});

// ─── SyncQueue: Safe Iteration ───────────────────────────────────────────────

describe('Integration — SyncQueue Safe Iteration', () => {
  it('drain does not skip entries when modifying status during iteration', async () => {
    const { SyncQueue } = require('../src/store/sync-queue');
    const tmpDir = makeTempDir('int-queue');
    const queue = new SyncQueue({ queueDir: tmpDir });

    // Enqueue 3 operations
    queue.enqueue({ type: 'push', scope: 'personal' });
    queue.enqueue({ type: 'push', scope: 'personal' });
    queue.enqueue({ type: 'push', scope: 'personal' });

    assert.strictEqual(queue.pending().length, 3);

    // All succeed
    const result = await queue.drain(async () => {});
    assert.strictEqual(result.drained, 3);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.remaining, 0);

    cleanTempDir(tmpDir);
  });

  it('drain handles partial failure correctly', async () => {
    const { SyncQueue } = require('../src/store/sync-queue');
    const tmpDir = makeTempDir('int-queue-fail');
    const queue = new SyncQueue({ queueDir: tmpDir });

    queue.enqueue({ type: 'push', scope: 'personal', id: 'a' });
    queue.enqueue({ type: 'push', scope: 'personal', id: 'b' });

    let callCount = 0;
    const result = await queue.drain(async (op) => {
      callCount++;
      if (op.id === 'b') throw new Error('network error');
    });

    // First op should drain, second should have retried
    assert.ok(result.drained >= 1);
    assert.ok(callCount >= 2); // At least one retry

    cleanTempDir(tmpDir);
  });
});

// ─── History Store: Shared Instance Lifecycle ────────────────────────────────

describe('Integration — VerifiedHistoryStore Shared Instance', () => {
  it('creates new instance after previous one is closed', () => {
    const { VerifiedHistoryStore } = require('../src/store/history');
    const tmpDir = makeTempDir('int-shared');

    // Create first instance
    const store1 = new VerifiedHistoryStore(tmpDir);
    assert.strictEqual(store1.backend, 'sqlite');

    // Close the underlying sqlite
    store1._sqlite.close();

    // Create second instance — should detect closed DB and create fresh
    const store2 = new VerifiedHistoryStore(tmpDir);
    assert.strictEqual(store2.backend, 'sqlite');

    // New instance should work
    const entry = store2.add({
      code: 'function shared() { return 1; }',
      language: 'javascript',
      coherencyScore: { total: 0.8 },
    });
    assert.ok(entry.id);

    try { store2._sqlite.close(); } catch {}
    // Clean up singleton cache
    VerifiedHistoryStore._sqliteInstances?.delete(store2.storeDir);
    cleanTempDir(tmpDir);
  });
});

// ─── CLI→API: Validate Args ─────────────────────────────────────────────────

describe('Integration — Validate Args', () => {
  // These test the validators without calling process.exit
  const { validateCoherency } = require('../src/cli/validate-args');

  it('validateCoherency returns default for undefined', () => {
    assert.strictEqual(validateCoherency(undefined, 'test', 0.5), 0.5);
  });

  it('validateCoherency returns default for boolean true (bare flag)', () => {
    assert.strictEqual(validateCoherency(true, 'test', 0.5), 0.5);
  });

  it('validateCoherency parses valid float', () => {
    assert.strictEqual(validateCoherency('0.7', 'test', 0.5), 0.7);
  });
});

// ─── API→Store: evolvePattern validates input ────────────────────────────────

describe('Integration — evolvePattern Input Validation', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('evolvePattern rejects null code', () => {
    const result = oracle.evolvePattern('some-id', null);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('non-empty string'));
  });

  it('evolvePattern rejects empty string', () => {
    const result = oracle.evolvePattern('some-id', '  ');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('non-empty string'));
  });

  it('evolvePattern rejects non-string', () => {
    const result = oracle.evolvePattern('some-id', 42);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('non-empty string'));
  });
});

// ─── API→Store: Feedback Uses Direct Lookup ──────────────────────────────────

describe('Integration — Feedback Pattern Lookup', () => {
  let oracle, tmpDir;

  beforeEach(() => {
    ({ oracle, tmpDir } = createTestOracle());
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('feedback on valid entry returns success with reliability', () => {
    const submitted = oracle.submit('function fb() { return 1; }', {
      description: 'feedback test', language: 'javascript',
    });
    assert.ok(submitted.accepted);

    const result = oracle.feedback(submitted.entry.id, true);
    assert.strictEqual(result.success, true);
    assert.ok(typeof result.newReliability === 'number');
  });

  it('feedback on nonexistent entry returns error', () => {
    const result = oracle.feedback('nonexistent-id', true);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });

  it('patternFeedback updates usage counts', () => {
    const reg = oracle.registerPattern({
      name: 'fb-pattern', code: 'function fbp(a, b) { return a + b; }',
      language: 'javascript', description: 'feedback pattern test',
    });
    if (!reg.registered || !reg.pattern) return; // skip if similarity-routed

    const result = oracle.patternFeedback(reg.pattern.id, true);
    assert.strictEqual(result.success, true);
    assert.ok(result.usageCount >= 1); // At least 1 from our feedback call
  });
});
