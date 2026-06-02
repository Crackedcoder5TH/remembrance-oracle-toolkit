'use strict';

/**
 * operational-signal.js — operational coherency as a field signal.
 *
 * The field has historically heard from SCORING events (compute coherency,
 * scan safety, verify execution, score resonance). The diagnostic surfaced
 * a structural gap: the field is blind to OPERATIONAL events — requests
 * served, queries run, writes committed. Every infrastructure module
 * (server, store, MCP handlers, submission gateway) performs work the
 * field could observe through one shaped signal: latency + success.
 *
 * This module gives operational events a coherency-shaped reading that
 * plugs into the same field-coupling.contribute() pipeline as the scoring
 * signals. It's the new axis the diagnostic asked for: the field grows
 * a per-source histogram of OPERATIONAL health alongside its scoring one.
 *
 * Signal shape:
 *
 *   latencyCoherence(durationMs, expectedMs)
 *     Returns expectedMs / (expectedMs + durationMs). Natural [0,1] mapping:
 *       duration = 0       -> 1.0  (instant)
 *       duration = expected -> 0.5  (on budget)
 *       duration = 10×expected -> 0.09 (heavily over)
 *     Smooth, monotonic, no thresholds, no clamping needed.
 *
 *   operationCoherence({ durationMs, expectedMs, ok })
 *     Failed operations contribute coherence 0 regardless of speed (an
 *     operation that errored is not a coherent operation). Successful
 *     ones get their latencyCoherence reading.
 *
 *   recordOperation({ source, durationMs, expectedMs, ok, cost })
 *     Computes the operation's coherence and contributes to the field.
 *     Source MUST start with 'op:' so operational tracks are easy to
 *     filter from scoring tracks in the per-source histogram. Best-
 *     effort; never throws.
 *
 *   withOperationalTracking(source, expectedMs, asyncFn)
 *     Wraps an async function so every call records its operational
 *     coherency automatically. Returns the wrapped function — drop-in
 *     replacement for hot paths.
 */

/** Latency-as-coherency, smooth and bounded. */
function latencyCoherence(durationMs, expectedMs) {
  const d = Math.max(0, Number(durationMs) || 0);
  const e = Math.max(1, Number(expectedMs) || 100);
  return e / (e + d);
}

/** Operation coherence — fails are 0, successes get latency-coherence. */
function operationCoherence({ durationMs, expectedMs, ok = true } = {}) {
  if (!ok) return 0;
  return latencyCoherence(durationMs, expectedMs);
}

/**
 * Record a single operational event to the field. Sources must start with
 * 'op:' so the per-source histogram cleanly separates operational tracks
 * from scoring tracks. Best-effort; failure to contribute never affects
 * the calling operation.
 *
 * @param {object} obs
 * @param {string} obs.source        — 'op:<subsystem>:<event>'
 * @param {number} obs.durationMs    — actual duration
 * @param {number} [obs.expectedMs=100] — budget
 * @param {boolean} [obs.ok=true]    — did the operation succeed?
 * @param {number} [obs.cost=1]      — work units
 */
function recordOperation({ source, durationMs, expectedMs = 100, ok = true, cost = 1 } = {}) {
  if (typeof source !== 'string' || !source.startsWith('op:')) {
    if (process.env.ORACLE_DEBUG) console.warn('[operational-signal] source must start with "op:", got:', source);
    return null;
  }
  const coherence = operationCoherence({ durationMs, expectedMs, ok });
  try {
    const { contribute } = require('../core/field-coupling');
    return contribute({ cost, coherence, source });
  } catch (_) { return null; }
}

/**
 * Wrap an async function so every call automatically records operational
 * coherency. The wrapper is a drop-in replacement: same signature, same
 * return value (it forwards the original return or throws), but every
 * call adds one observation to the field's per-source histogram.
 *
 *   const wrappedSearch = withOperationalTracking('op:store:search', 50, store.search);
 *   await wrappedSearch(query);  // contributes op:store:search to the field
 *
 * Errors are recorded as ok:false (coherence 0) AND re-thrown — the
 * caller's error handling is preserved.
 */
function withOperationalTracking(source, expectedMs, asyncFn) {
  if (typeof asyncFn !== 'function') {
    throw new TypeError('withOperationalTracking: asyncFn must be a function');
  }
  return async function trackedOp(...args) {
    const start = Date.now();
    let ok = true;
    let err = null;
    try {
      const result = await asyncFn.apply(this, args);
      return result;
    } catch (e) {
      ok = false;
      err = e;
      throw e;
    } finally {
      const durationMs = Date.now() - start;
      recordOperation({ source, durationMs, expectedMs, ok });
    }
  };
}

/**
 * Synchronous variant for code paths that can't be async. Wraps a regular
 * function the same way.
 */
function withOperationalTrackingSync(source, expectedMs, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('withOperationalTrackingSync: fn must be a function');
  }
  return function trackedOpSync(...args) {
    const start = Date.now();
    let ok = true;
    try {
      return fn.apply(this, args);
    } catch (e) {
      ok = false;
      throw e;
    } finally {
      const durationMs = Date.now() - start;
      recordOperation({ source, durationMs, expectedMs, ok });
    }
  };
}

module.exports = {
  latencyCoherence,
  operationCoherence,
  recordOperation,
  withOperationalTracking,
  withOperationalTrackingSync,
};
