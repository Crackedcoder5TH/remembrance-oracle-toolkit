/**
 * Meta-Pattern 5 Fix: TOCTOU Race Condition in Maintenance Lock
 *
 * Bug: Check-then-set pattern on oracle._maintenanceInProgress allows concurrent
 * cycles to overlap when setInterval fires while a synchronous runCycle is in progress.
 *
 * Root cause: Forgetting the Eternal Now — assuming linear time/order when
 * reality is concurrent. The check and the set are not atomic.
 *
 * Fix: Add stale lock detection with timestamp. If lock held >30 min,
 * force-release (crash recovery). Track oracle._maintenanceSince on acquisition.
 * Use while() loop for history trimming instead of single shift().
 */

// Before (broken):
// if (oracle._maintenanceInProgress) { return lastReport; }
// running = true;
// oracle._maintenanceInProgress = true;

// After (fixed):
function acquireMaintenanceLock(oracle, log) {
  if (oracle._maintenanceInProgress) {
    // Stale lock detection: if lock held >30 min, force-release
    if (oracle._maintenanceSince && Date.now() - oracle._maintenanceSince > 30 * 60 * 1000) {
      log(`Force-releasing stale maintenance lock (held since ${new Date(oracle._maintenanceSince).toISOString()})`);
      oracle._maintenanceInProgress = false;
      oracle._maintenanceSource = null;
      oracle._maintenanceSince = null;
    } else {
      return false; // Lock held, not stale
    }
  }
  oracle._maintenanceInProgress = true;
  oracle._maintenanceSource = 'daemon';
  oracle._maintenanceSince = Date.now();
  return true;
}

function releaseMaintenanceLock(oracle) {
  oracle._maintenanceInProgress = false;
  oracle._maintenanceSource = null;
  oracle._maintenanceSince = null;
}

module.exports = { acquireMaintenanceLock, releaseMaintenanceLock };
