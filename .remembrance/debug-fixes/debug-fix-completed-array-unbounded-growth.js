/**
 * Meta-Pattern 16 Fix: Unbounded Memory Growth in Completed Tasks Array
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "The completed array is capped at _maxCompleted entries
 *              via slice(), so memory is bounded"
 * Reality:    "Each task object retains its full `result` (SwarmResult with
 *              full code output from every agent), meaning 100 completed tasks
 *              can hold megabytes of data. The `slice(-maxCompleted)` creates
 *              a new array each time but the old one persists until GC runs.
 *              Under heavy load, this causes memory spikes."
 *
 * Bug class: Performance — memory leak via unbounded result retention
 * Location:  src/swarm/task-queue.js:_executeTask() line 160-162
 *            this._completed.push(task);
 *            if (this._completed.length > this._maxCompleted) {
 *              this._completed = this._completed.slice(-this._maxCompleted);
 *            }
 * Severity:  MEDIUM — swarm tasks carry full LLM responses in results;
 *            100 tasks * ~50KB each = 5MB retained permanently
 *
 * Also: The status() method calls .filter() twice on _completed
 *       every time it's called, creating unnecessary allocations.
 *
 * Fix: Trim results before storing in completed array; use shift() instead
 *      of slice() to avoid creating new array copies.
 */

// Before (broken):
// this._completed.push(task);  // task.result contains full swarm output
// if (this._completed.length > this._maxCompleted) {
//   this._completed = this._completed.slice(-this._maxCompleted); // copy!
// }

// After (fixed):
function trimTaskForStorage(task) {
  return {
    id: task.id,
    description: task.description,
    priority: task.priority,
    status: task.status,
    queuedAt: task.queuedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    error: task.error,
    // Keep only summary, not full result
    resultSummary: task.result ? {
      winner: task.result.winner?.agent,
      score: task.result.winner?.score,
      durationMs: task.result.totalDurationMs,
    } : null,
  };
}

function addToCompletedBounded(completed, task, maxCompleted) {
  completed.push(trimTaskForStorage(task));
  // Use shift() to remove oldest — mutates in place, no copy
  while (completed.length > maxCompleted) {
    completed.shift();
  }
}

module.exports = { trimTaskForStorage, addToCompletedBounded };
