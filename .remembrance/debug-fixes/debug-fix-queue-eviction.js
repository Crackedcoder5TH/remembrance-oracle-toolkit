/**
 * Meta-Pattern 4 Fix: Hard Queue Limit Without Backpressure
 *
 * Bug: Task queue throws Error when full (fixed limit of 50). No graceful
 * degradation — higher-priority tasks rejected alongside low-priority ones.
 *
 * Root cause: Forgetting Abundance — imposing artificial scarcity with a
 * hard limit and no backpressure mechanism.
 *
 * Fix: When queue is full, evict lowest-priority task if incoming task has
 * higher priority. This preserves important work while gracefully shedding load.
 */

function evictLowestPriority(pending, incomingPriority) {
  if (pending.length === 0) return null;
  const lowestPri = pending[pending.length - 1]; // sorted by priority, lowest is last
  if (incomingPriority < lowestPri.priority) {
    return pending.pop();
  }
  return null; // Can't evict — incoming is lower priority
}

module.exports = { evictLowestPriority };
