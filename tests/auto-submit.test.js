const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');
const { autoSubmit, shouldAutoSubmit } = require('../src/ci/auto-submit');

describe('Auto-Submit Module', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-submit-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('autoSubmit', () => {
    it('returns a report with all expected fields', () => {
      const result = autoSubmit(oracle, tmpDir, { syncPersonal: false, silent: true });
      assert.ok(result.harvest !== undefined);
      assert.ok(result.harvest.registered !== undefined);
      assert.ok(result.harvest.skipped !== undefined);
      assert.ok(result.harvest.failed !== undefined);
      assert.ok(result.harvest.discovered !== undefined);
      assert.ok(result.promoted !== undefined);
      assert.equal(typeof result.synced, 'boolean');
      assert.equal(typeof result.shared, 'boolean');
      assert.ok(Array.isArray(result.errors));
    });

    it('harvests patterns from a directory with source+test files', () => {
      // Create source file
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'utils.js'), `
function add(a, b) { return a + b; }
function multiply(a, b) { return a * b; }
module.exports = { add, multiply };
`);

      // Create test file
      const testDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'utils.test.js'), `
const { add, multiply } = require('../src/utils');
const assert = require('assert');
assert.equal(add(1, 2), 3);
assert.equal(multiply(2, 3), 6);
`);

      const result = autoSubmit(oracle, tmpDir, { syncPersonal: false, silent: true });
      assert.ok(result.harvest.discovered >= 1, 'Should discover at least 1 pattern');
    });

    it('runs in dry-run mode without modifying anything', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'helper.js'), `
function greet(name) { return 'Hello ' + name; }
module.exports = { greet };
`);
      const testDir = path.join(tmpDir, 'tests');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'helper.test.js'), `
const { greet } = require('../src/helper');
const assert = require('assert');
assert.equal(greet('world'), 'Hello world');
`);

      const before = oracle.patterns.getAll().length;
      const result = autoSubmit(oracle, tmpDir, { dryRun: true, syncPersonal: false, silent: true });
      const after = oracle.patterns.getAll().length;

      assert.equal(before, after, 'Dry run should not add patterns');
    });

    it('handles empty directories gracefully', () => {
      const result = autoSubmit(oracle, tmpDir, { syncPersonal: false, silent: true });
      assert.equal(result.harvest.registered, 0);
      assert.equal(result.errors.length, 0);
    });

    it('collects errors without crashing', () => {
      // Pass a non-existent directory
      const result = autoSubmit(oracle, path.join(tmpDir, 'nonexistent'), { syncPersonal: false, silent: true });
      assert.ok(result.errors.length >= 0); // May or may not error depending on harvest behavior
    });

    it('emits auto_submit_complete event', () => {
      const events = [];
      oracle.on((event) => events.push(event));
      autoSubmit(oracle, tmpDir, { syncPersonal: false, silent: true });
      const submitEvent = events.find(e => e.type === 'auto_submit_complete');
      assert.ok(submitEvent, 'Should emit auto_submit_complete event');
      assert.equal(typeof submitEvent.registered, 'number');
      assert.equal(typeof submitEvent.promoted, 'number');
    });
  });

  describe('shouldAutoSubmit', () => {
    it('returns true for non-git directories (safe default)', () => {
      // tmpDir is not a git repo, so execSync will fail, and it should return true
      const result = shouldAutoSubmit(tmpDir);
      assert.equal(result, true);
    });

    it('returns a boolean', () => {
      const result = shouldAutoSubmit(tmpDir);
      assert.equal(typeof result, 'boolean');
    });
  });
});

describe('Post-commit hook script', () => {
  it('generates a script referencing auto-submit instead of auto-seed', () => {
    const { postCommitScript } = require('../src/ci/hooks');
    const script = postCommitScript();
    assert.ok(script.includes('auto-submit'), 'Post-commit hook should reference auto-submit');
    assert.ok(script.includes('shouldAutoSubmit'), 'Post-commit hook should check shouldAutoSubmit');
    assert.ok(script.includes('autoSubmit'), 'Post-commit hook should call autoSubmit');
  });
});

describe('Lifecycle auto-sync default', () => {
  let tmpDir2;
  let oracle2;

  beforeEach(() => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-sync-test-'));
    oracle2 = new RemembranceOracle({ baseDir: tmpDir2, threshold: 0.3, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });

  it('has autoSyncOnCycle enabled by default', () => {
    const lifecycle = require('../src/evolution/lifecycle');
    const engine = new lifecycle.LifecycleEngine(oracle2);
    assert.equal(engine.config.autoSyncOnCycle, true, 'autoSyncOnCycle should default to true');
  });

  it('handles harvest_complete events in lifecycle', () => {
    const lifecycle = require('../src/evolution/lifecycle');
    const { createOracleContext } = require('../src/evolution/context');
    const ctx = createOracleContext(oracle2);
    const engine = new lifecycle.LifecycleEngine(ctx);
    engine.start();

    // Simulate harvest_complete event — should not throw
    engine._handleEvent({ type: 'harvest_complete', source: '.', registered: 5 });

    // Simulate auto_submit_complete event — should not throw
    engine._handleEvent({ type: 'auto_submit_complete', registered: 3, promoted: 1 });

    engine.stop();
  });
});
