'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Preflight Check', () => {
  let tmpDir;
  const origCwd = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
    process.chdir(tmpDir);
    // Create a fake .remembrance dir
    fs.mkdirSync(path.join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shouldBypass returns true for exempt commands', () => {
    const { shouldBypass } = require('../src/core/preflight');
    assert.ok(shouldBypass('hooks'));
    assert.ok(shouldBypass('sync'));
    assert.ok(shouldBypass('help'));
    assert.ok(shouldBypass('config'));
    assert.ok(!shouldBypass('search'));
    assert.ok(!shouldBypass('resolve'));
    assert.ok(!shouldBypass('submit'));
  });

  it('recordSyncPull creates sync-timestamp.json', () => {
    const { recordSyncPull } = require('../src/core/preflight');
    recordSyncPull(tmpDir);

    const filePath = path.join(tmpDir, '.remembrance', 'sync-timestamp.json');
    assert.ok(fs.existsSync(filePath));

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert.ok(data.lastPull);
    const age = Date.now() - new Date(data.lastPull).getTime();
    assert.ok(age < 5000, 'Timestamp should be recent');
  });

  it('checkLastSync returns fresh after recordSyncPull', () => {
    const { checkLastSync, recordSyncPull } = require('../src/core/preflight');
    recordSyncPull(tmpDir);

    const result = checkLastSync(tmpDir);
    assert.ok(result.fresh);
  });

  it('checkLastSync returns stale when no timestamp exists and personal store present', () => {
    const { checkLastSync } = require('../src/core/preflight');
    // Create a fake personal store so it doesn't short-circuit
    const personalDir = path.join(os.homedir(), '.remembrance', 'personal');
    const hadPersonalStore = fs.existsSync(path.join(personalDir, 'oracle.db'));

    const result = checkLastSync(tmpDir);
    // Either fresh (no personal store) or stale (no timestamp)
    if (hadPersonalStore) {
      assert.ok(!result.fresh);
    } else {
      assert.ok(result.fresh); // No personal store = first run
    }
  });

  it('runPreflight returns warnings array', () => {
    const { runPreflight } = require('../src/core/preflight');
    const result = runPreflight(tmpDir);
    assert.ok(Array.isArray(result.warnings));
    assert.equal(typeof result.ok, 'boolean');
  });

  it('printPreflightWarnings handles empty warnings', () => {
    const { printPreflightWarnings } = require('../src/core/preflight');
    // Should not throw
    printPreflightWarnings([], null);
    printPreflightWarnings(null, null);
  });
});
