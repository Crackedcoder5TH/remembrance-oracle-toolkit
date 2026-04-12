'use strict';

/**
 * MCP Feedback Tracker — auto-infers feedback from tool usage patterns.
 *
 * When oracle_resolve returns PULL for pattern X, and the model later
 * calls oracle_submit or oracle_register (meaning it wrote working code
 * in the same domain), we infer the pulled pattern was useful.
 *
 * This closes the feedback loop at the MCP level — models that never
 * explicitly call oracle_feedback still contribute to pattern scoring.
 */

const _pendingPulls = new Map(); // patternId → { pulledAt, name, decision }

/**
 * Track a pull/evolve decision from oracle_resolve.
 */
function trackPull(patternId, name, decision) {
  if (decision === 'pull' || decision === 'evolve') {
    _pendingPulls.set(patternId, { pulledAt: Date.now(), name, decision });
  }
}

/**
 * Infer feedback from activity — when oracle_submit or oracle_register
 * is called with pending pulls, infer success for those pulls.
 *
 * Only infers for pulls within the last 30 minutes.
 */
function inferFeedbackFromActivity(oracle) {
  const inferred = [];
  for (const [id, info] of _pendingPulls) {
    if (Date.now() - info.pulledAt < 30 * 60 * 1000) { // within 30 min
      try {
        oracle.feedback(id, true); // infer success
        inferred.push({ id, name: info.name, decision: info.decision });
      } catch (e) { /* non-fatal */ }
    }
  }
  _pendingPulls.clear();
  return inferred;
}

/**
 * Remove a specific pattern from pending pulls (explicit feedback given).
 */
function clearPendingPull(patternId) {
  _pendingPulls.delete(patternId);
}

/**
 * Get all pending pulls that haven't received feedback yet.
 */
function getPendingPulls() {
  return [..._pendingPulls.entries()].map(([id, info]) => ({ id, ...info }));
}

/**
 * Reset all pending pulls (for testing).
 */
function _reset() {
  _pendingPulls.clear();
}

module.exports = {
  trackPull,
  inferFeedbackFromActivity,
  clearPendingPull,
  getPendingPulls,
  _reset,
};
