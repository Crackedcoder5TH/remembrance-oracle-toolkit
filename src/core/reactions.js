'use strict';

/**
 * Cross-subsystem event reactions.
 *
 * The event bus (src/core/events.js) gives every subsystem a way to
 * emit. This module gives every subsystem a way to REACT — one event
 * now updates many stores at once, so learning signals flow across
 * subsystems automatically.
 *
 * Before: user fixes a finding → audit feedback store increments one
 * counter. The pattern library doesn't notice; the debug oracle
 * doesn't notice; the Bayesian prior doesn't notice.
 *
 * After: user fixes a finding → one `feedback.fix` event fans out to:
 *   - audit feedback calibrator (confidence up)
 *   - pattern library (if the fix pulled a pattern, increment its
 *     successCount)
 *   - debug oracle (if the rule matches a registered bug class, nudge
 *     the quantum amplitude up)
 *   - unified history log
 *
 * Subscribers here are intentionally defensive: each reaction is
 * wrapped in try/catch with ORACLE_DEBUG logging, because a broken
 * subsystem shouldn't crash another subsystem's emit path.
 *
 * Entry point: `wireReactions(oracle)` — called once at CLI bootstrap
 * and from oracle's constructor. Idempotent.
 */

const { getEventBus, EVENTS } = require('./events');

let _wired = false;
let _offHandlers = [];

/**
 * Subscribe the whole reaction graph to the bus.
 *
 * @param {object} oracle - A RemembranceOracle instance (or a partial
 *                          that exposes { patterns, debug }).
 * @param {object} [options]
 *   - force: re-wire even if already wired (testing)
 *   - storageRoot: path for the audit feedback store (defaults cwd)
 * @returns {() => void} unsubscribe function
 */
function wireReactions(oracle, options = {}) {
  if (_wired && !options.force) return _off;
  if (_wired) _off();

  const bus = getEventBus();
  const storageRoot = options.storageRoot || process.cwd();

  _offHandlers = [
    // ── feedback.fix → bump audit calibration + pattern successCount ──
    bus.on(EVENTS.FEEDBACK_FIX, (payload) => {
      safely('feedback.fix→calibration', () => {
        const { recordFeedback } = require('../audit/feedback');
        if (payload?.ruleId) recordFeedback(storageRoot, 'fix', payload.ruleId, payload);
      });
      safely('feedback.fix→pattern-reliability', () => {
        if (oracle?.patterns && payload?.patternId) {
          oracle.patterns.recordUsage(payload.patternId, true);
        }
      });
      safely('feedback.fix→debug-amplitude', () => {
        nudgeDebugAmplitude(oracle, payload, +0.05);
      });
    }),

    // ── feedback.dismiss → down-calibrate + penalize pattern ──────────
    bus.on(EVENTS.FEEDBACK_DISMISS, (payload) => {
      safely('feedback.dismiss→calibration', () => {
        const { recordFeedback } = require('../audit/feedback');
        if (payload?.ruleId) recordFeedback(storageRoot, 'dismiss', payload.ruleId, payload);
      });
      safely('feedback.dismiss→pattern-reliability', () => {
        if (oracle?.patterns && payload?.patternId) {
          oracle.patterns.recordUsage(payload.patternId, false);
        }
      });
      safely('feedback.dismiss→debug-amplitude', () => {
        nudgeDebugAmplitude(oracle, payload, -0.05);
      });
      // Covenant-specific calibration: if the user is dismissing a
      // finding that came from a covenant principle, append the
      // dismissal to the per-principle calibration log. A future
      // covenantCheck() can consult this log to soften a principle
      // that keeps getting rejected by the user (learning from
      // false positives without hand-editing weights).
      safely('feedback.dismiss→covenant-calibration', () => {
        if (payload?.bugClass !== 'covenant') return;
        const principleId = payload?.principleId || payload?.ruleId;
        if (!principleId) return;
        const { getStorage } = require('./storage');
        const ns = getStorage(storageRoot).namespace('covenant_calibration');
        ns.append(principleId, {
          action: 'dismiss',
          file: payload.file,
          line: payload.line,
          reason: payload.reason || null,
        });
      });
    }),

    // ── audit.finding → nudge debug oracle amplitude + update baseline
    //    trend data. Fires every time an audit check surfaces a finding.
    bus.on(EVENTS.AUDIT_FINDING, (payload) => {
      safely('audit.finding→debug-capture', () => {
        // Record a single "finding observed" signal. We don't capture
        // the pattern itself (that would flood the field) — we just
        // boost the matching amplitude if the bug class is registered.
        if (oracle?.debug && typeof oracle.debug.recordObservation === 'function') {
          oracle.debug.recordObservation({ ruleId: payload?.ruleId, file: payload?.file });
        }
      });
    }),

    // ── heal.succeeded → if the heal was at level=generate, the
    //    pattern that was pulled gets credit as a successful use. If
    //    level=confident, the rule that was auto-fixed gets credit as
    //    a trustworthy fix (calibration confidence nudges up).
    bus.on(EVENTS.HEAL_SUCCEEDED, (payload) => {
      safely('heal.succeeded→pattern-usage', () => {
        if (payload?.level === 'generate' && payload?.patternId && oracle?.patterns) {
          oracle.patterns.recordUsage(payload.patternId, true);
        }
      });
      safely('heal.succeeded→calibration-boost', () => {
        // Auto-fix that actually lowered the finding count implicitly
        // validates the rule — treat it as an implicit "fix" feedback.
        if (payload?.level === 'confident' && payload?.rule) {
          const { recordFeedback } = require('../audit/feedback');
          recordFeedback(storageRoot, 'fix', payload.rule, payload);
        }
      });
    }),

    // ── heal.failed → no penalty, just log. Failure is expected at
    //    lower ladder levels; we don't want the confident level to get
    //    downgraded because the SERF level couldn't take over.
    // (No-op handler — history log still captures it)

    // ── pattern.pulled → pre-increment usage. If it was ultimately
    //    unsuccessful the dismissal path will reverse this.
    bus.on(EVENTS.PATTERN_PULLED, (payload) => {
      safely('pattern.pulled→library-pull', () => {
        // Only track that the pull happened. usageCount increments
        // happen on feedback.
        if (process.env.ORACLE_DEBUG) {
          console.error('[reactions] pattern.pulled:', payload?.id || payload?.name || '?');
        }
      });
    }),

    // ── covenant.violation → force a dismiss of whatever pattern or
    //    rule triggered the violation, so the next resolve/heal won't
    //    try the same thing.
    bus.on(EVENTS.COVENANT_VIOLATION, (payload) => {
      safely('covenant.violation→library-retire', () => {
        if (payload?.patternId && oracle?.patterns?.update) {
          // Mark as quarantined — the library already knows how to
          // treat high-bugReports patterns as retired candidates.
          oracle.patterns.reportBug(payload.patternId, { reason: 'covenant', ...payload });
        }
      });
    }),
  ];

  _wired = true;
  return _off;
}

/**
 * Unsubscribe everything wired by wireReactions.
 */
function _off() {
  for (const off of _offHandlers) {
    try { off && off(); } catch { /* ignore */ }
  }
  _offHandlers = [];
  _wired = false;
}

function resetReactions() { _off(); }

function safely(label, fn) {
  try { fn(); }
  catch (e) {
    if (process.env.ORACLE_DEBUG) {
      console.error(`[reactions:${label}]`, e?.message || e);
    }
  }
}

/**
 * Nudge the debug oracle's amplitude for the matching bug class. Works
 * with several oracle shapes:
 *   - oracle.debug.adjustAmplitude(ruleId, delta)
 *   - oracle.debug.feedback(ruleId, success)
 *   - oracle.debug.capture(...) — last resort
 */
function nudgeDebugAmplitude(oracle, payload, delta) {
  const debug = oracle?.debug || oracle?.debugOracle;
  if (!debug) return;
  const ruleId = payload?.ruleId;
  if (!ruleId) return;
  if (typeof debug.adjustAmplitude === 'function') {
    debug.adjustAmplitude(ruleId, delta);
    return;
  }
  if (typeof debug.feedback === 'function') {
    debug.feedback(ruleId, delta > 0);
    return;
  }
}

module.exports = {
  wireReactions,
  resetReactions,
};
