const { describe, it } = require('node:test');
const assert = require('node:assert');

function createSafeRunCycle(oracle, state, runCycleBody) {
  return function safeRunCycle() {
    if (state.running) return state.lastReport;
    if (oracle._maintenanceInProgress) {
      if (oracle._maintenanceSince && Date.now() - oracle._maintenanceSince > 30 * 60 * 1000) {
        oracle._maintenanceInProgress = false;
      } else {
        return state.lastReport;
      }
    }
    state.running = true;
    oracle._maintenanceInProgress = true;
    oracle._maintenanceSince = Date.now();
    try {
      return runCycleBody();
    } finally {
      oracle._maintenanceInProgress = false;
      oracle._maintenanceSince = null;
      state.running = false;
    }
  };
}

describe('daemon lock safety on throw', () => {
  it('releases lock even when cycle body throws', () => {
    const oracle = {};
    const state = { running: false, lastReport: null };
    const cycle = createSafeRunCycle(oracle, state, () => {
      throw new Error('boom');
    });
    assert.throws(() => cycle(), /boom/);
    assert.strictEqual(state.running, false);
    assert.strictEqual(oracle._maintenanceInProgress, false);
  });

  it('releases lock on successful cycle', () => {
    const oracle = {};
    const state = { running: false, lastReport: null };
    const cycle = createSafeRunCycle(oracle, state, () => ({ ok: true }));
    const result = cycle();
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(state.running, false);
    assert.strictEqual(oracle._maintenanceInProgress, false);
  });

  it('skips when already running', () => {
    const oracle = {};
    const state = { running: true, lastReport: { old: true } };
    const cycle = createSafeRunCycle(oracle, state, () => ({ new: true }));
    assert.deepStrictEqual(cycle(), { old: true });
  });
});
