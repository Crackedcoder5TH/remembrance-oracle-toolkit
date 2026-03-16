/**
 * Meta-Pattern 7 Fix: Maintenance Lock Not Released on Uncaught Error
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "The outer try/catch always runs, so the lock is always released"
 * Reality:    "If the outer catch itself throws, or if running=true is set before
 *              the try block, the finally never restores `running` because there
 *              IS no finally — the lock release is in the try's normal flow"
 *
 * Bug class: State — lock leak causes permanent daemon stall
 * Location:  src/evolution/daemon.js:runCycle() lines 86-264
 * Severity:  CRITICAL — once lock leaks, no further maintenance cycles run
 *
 * In the current code:
 *   running = true;  (line 103)
 *   ... try { ... } catch { ... }
 *   running = false;  (line 263) — OUTSIDE the finally
 *
 * If an error occurs between lines 103 and the try, or if the catch at line 242
 * itself fails, `running` stays true and `oracle._maintenanceInProgress` stays true.
 *
 * Fix: Use try/finally to guarantee lock release regardless of error path.
 */

// Before (broken):
// function runCycle() {
//   running = true;
//   oracle._maintenanceInProgress = true;
//   try { ... } catch { ... }
//   oracle._maintenanceInProgress = false;  // skipped if catch throws!
//   running = false;                        // skipped if catch throws!
// }

// After (fixed):
function createSafeRunCycle(oracle, state, runCycleBody) {
  return function safeRunCycle() {
    if (state.running) return state.lastReport;
    if (oracle._maintenanceInProgress) {
      if (oracle._maintenanceSince && Date.now() - oracle._maintenanceSince > 30 * 60 * 1000) {
        oracle._maintenanceInProgress = false;
        oracle._maintenanceSource = null;
        oracle._maintenanceSince = null;
      } else {
        return state.lastReport;
      }
    }

    state.running = true;
    oracle._maintenanceInProgress = true;
    oracle._maintenanceSource = 'daemon';
    oracle._maintenanceSince = Date.now();

    try {
      return runCycleBody();
    } finally {
      // ALWAYS release — even if runCycleBody() throws
      oracle._maintenanceInProgress = false;
      oracle._maintenanceSource = null;
      oracle._maintenanceSince = null;
      state.running = false;
    }
  };
}

module.exports = { createSafeRunCycle };
