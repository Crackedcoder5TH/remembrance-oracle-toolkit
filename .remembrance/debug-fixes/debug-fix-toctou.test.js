const { describe, it } = require('node:test');
const assert = require('node:assert');
const { acquireMaintenanceLock, releaseMaintenanceLock } = require('/tmp/debug-fix-toctou.js');

describe('TOCTOU maintenance lock', () => {
  it('acquires lock when not held', () => {
    const oracle = {};
    assert.strictEqual(acquireMaintenanceLock(oracle, () => {}), true);
    assert.strictEqual(oracle._maintenanceInProgress, true);
    assert.strictEqual(oracle._maintenanceSource, 'daemon');
    assert.ok(oracle._maintenanceSince > 0);
  });

  it('rejects when lock is held and fresh', () => {
    const oracle = { _maintenanceInProgress: true, _maintenanceSince: Date.now(), _maintenanceSource: 'other' };
    assert.strictEqual(acquireMaintenanceLock(oracle, () => {}), false);
  });

  it('force-releases stale lock (>30 min)', () => {
    const oracle = { _maintenanceInProgress: true, _maintenanceSince: Date.now() - 31 * 60 * 1000, _maintenanceSource: 'other' };
    const logs = [];
    assert.strictEqual(acquireMaintenanceLock(oracle, m => logs.push(m)), true);
    assert.ok(logs[0].includes('Force-releasing'));
    assert.strictEqual(oracle._maintenanceSource, 'daemon');
  });

  it('releases lock cleanly', () => {
    const oracle = { _maintenanceInProgress: true, _maintenanceSince: Date.now(), _maintenanceSource: 'daemon' };
    releaseMaintenanceLock(oracle);
    assert.strictEqual(oracle._maintenanceInProgress, false);
    assert.strictEqual(oracle._maintenanceSince, null);
  });
});
