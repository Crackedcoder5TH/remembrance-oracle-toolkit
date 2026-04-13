'use strict';

/**
 * Oracle event bus.
 *
 * A tiny pub-sub so every subsystem becomes a learning subsystem.
 * When a user fixes a finding, dismisses a lint hint, pulls a pattern,
 * heals a file, or hits a covenant violation, we emit a single event.
 * Interested subscribers react: the audit calibrator updates its
 * confidence, the pattern library bumps reliability, the debug oracle
 * nudges a quantum amplitude, the history log appends a row.
 *
 * Design:
 *
 *   - Synchronous-first. Every handler runs inline for simple correctness.
 *     Async handlers are supported; the emitter resolves after all
 *     handlers settle.
 *   - Error-isolated. A throwing handler doesn't block other handlers.
 *   - Namespaced. Event names are dotted strings: 'feedback.fix',
 *     'pattern.registered', 'heal.succeeded', 'covenant.violation'.
 *   - Wildcards. Subscribers can listen to 'feedback.*' to catch every
 *     feedback subtype without knowing them all.
 *   - Process-wide singleton. `require('core/events')` gives you the
 *     same bus everywhere, so a subsystem can subscribe once at init
 *     and never manage references.
 *
 * Standard events (see EVENTS below):
 *
 *   feedback.fix         { ruleId, file, line }
 *   feedback.dismiss     { ruleId, file, line }
 *   audit.finding        { ruleId, bugClass, severity, file, line }
 *   audit.baseline       { total, createdAt }
 *   lint.finding         { ruleId, file, line }
 *   smell.finding        { ruleId, file, line }
 *   pattern.registered   { id, name, language, coherency }
 *   pattern.pulled       { id, name, decision, caller }
 *   pattern.feedback     { id, success }
 *   heal.attempt         { level, file, rule }
 *   heal.succeeded       { level, file, patchCount, coherencyBefore, coherencyAfter }
 *   heal.failed          { level, file, reason }
 *   covenant.violation   { file, principle, reason }
 *   covenant.passed      { file }
 *   history.append       { type, payload }    // auto-emitted by every event
 */

// ─── Bus implementation ────────────────────────────────────────────────────

class OracleEventBus {
  constructor() {
    this._exact = new Map();    // event → Set<handler>
    this._wildcard = new Map(); // prefix → Set<handler>  (prefix ends in '*')
    this._history = [];         // in-memory ring, optional
    this._historyMax = 500;
    this._historyEnabled = false;
  }

  enableHistory(max = 500) {
    this._historyEnabled = true;
    this._historyMax = max;
  }

  getHistory() {
    return [...this._history];
  }

  /**
   * Subscribe to an event or event prefix (using 'feedback.*' syntax).
   */
  on(event, handler) {
    if (typeof event !== 'string' || typeof handler !== 'function') return () => {};
    if (event.endsWith('*')) {
      const prefix = event.slice(0, -1);
      if (!this._wildcard.has(prefix)) this._wildcard.set(prefix, new Set());
      this._wildcard.get(prefix).add(handler);
      return () => this._wildcard.get(prefix).delete(handler);
    }
    if (!this._exact.has(event)) this._exact.set(event, new Set());
    this._exact.get(event).add(handler);
    return () => this._exact.get(event).delete(handler);
  }

  /**
   * Subscribe once. Handler auto-unsubscribes after the first call.
   */
  once(event, handler) {
    const off = this.on(event, (payload, meta) => {
      off();
      return handler(payload, meta);
    });
    return off;
  }

  off(event, handler) {
    if (event.endsWith('*')) {
      const prefix = event.slice(0, -1);
      this._wildcard.get(prefix)?.delete(handler);
      return;
    }
    this._exact.get(event)?.delete(handler);
  }

  /**
   * Emit an event. Returns a promise that resolves after every handler
   * settles (including async ones). Errors are swallowed per-handler so
   * a single bad subscriber doesn't nuke the rest.
   */
  async emit(event, payload = {}) {
    const meta = { event, emittedAt: new Date().toISOString() };

    if (this._historyEnabled) {
      this._history.push({ event, payload, at: meta.emittedAt });
      if (this._history.length > this._historyMax) this._history.shift();
    }

    const handlers = [];
    const exact = this._exact.get(event);
    if (exact) handlers.push(...exact);
    for (const [prefix, set] of this._wildcard.entries()) {
      if (event.startsWith(prefix)) handlers.push(...set);
    }

    const results = [];
    for (const h of handlers) {
      try {
        const r = h(payload, meta);
        if (r && typeof r.then === 'function') results.push(r.catch(e => _reportError(event, e)));
      } catch (e) { _reportError(event, e); }
    }
    if (results.length > 0) { try { await Promise.all(results); } catch { /* already reported */ } }
    return handlers.length;
  }

  /**
   * Synchronous emit — same semantics but only runs sync handlers.
   * Async handlers are scheduled but not awaited. Use when you're in
   * a sync code path (e.g. a CLI handler) and don't want to hold up.
   */
  emitSync(event, payload = {}) {
    const meta = { event, emittedAt: new Date().toISOString() };
    if (this._historyEnabled) {
      this._history.push({ event, payload, at: meta.emittedAt });
      if (this._history.length > this._historyMax) this._history.shift();
    }
    const exact = this._exact.get(event);
    if (exact) for (const h of exact) {
      try { const r = h(payload, meta); if (r && typeof r.then === 'function') r.catch(e => _reportError(event, e)); }
      catch (e) { _reportError(event, e); }
    }
    for (const [prefix, set] of this._wildcard.entries()) {
      if (!event.startsWith(prefix)) continue;
      for (const h of set) {
        try { const r = h(payload, meta); if (r && typeof r.then === 'function') r.catch(e => _reportError(event, e)); }
        catch (e) { _reportError(event, e); }
      }
    }
  }

  /**
   * Remove every subscriber. Mostly useful for tests.
   */
  removeAllListeners() {
    this._exact.clear();
    this._wildcard.clear();
    this._history = [];
  }
}

function _reportError(event, err) {
  if (process.env.ORACLE_DEBUG) {
    console.warn(`[events:${event}] handler error:`, err?.message || err);
  }
}

// ─── Standard event name catalog ────────────────────────────────────────────

const EVENTS = Object.freeze({
  FEEDBACK_FIX:     'feedback.fix',
  FEEDBACK_DISMISS: 'feedback.dismiss',
  AUDIT_FINDING:    'audit.finding',
  AUDIT_BASELINE:   'audit.baseline',
  LINT_FINDING:     'lint.finding',
  SMELL_FINDING:    'smell.finding',
  PATTERN_REGISTERED: 'pattern.registered',
  PATTERN_PULLED:     'pattern.pulled',
  PATTERN_FEEDBACK:   'pattern.feedback',
  HEAL_ATTEMPT:   'heal.attempt',
  HEAL_SUCCEEDED: 'heal.succeeded',
  HEAL_FAILED:    'heal.failed',
  COVENANT_VIOLATION: 'covenant.violation',
  COVENANT_PASSED:    'covenant.passed',
  HISTORY_APPEND:     'history.append',
});

// ─── Process-level singleton ────────────────────────────────────────────────

let _singleton = null;

function getEventBus() {
  if (!_singleton) _singleton = new OracleEventBus();
  return _singleton;
}

function resetEventBus() { _singleton = null; }

// ─── Default wiring ─────────────────────────────────────────────────────────
//
// A subsystem that wants its events persisted to unified history just
// calls wireHistoryPersistence(storage). The bus then forwards every
// event to a `history` append log on the given storage.
function wireHistoryPersistence(storage) {
  const bus = getEventBus();
  if (bus._historyWired) return () => {};
  bus._historyWired = true;
  const off = bus.on('*', (payload, meta) => {
    try {
      const history = storage.namespace('history');
      history.append('events', { type: meta.event, payload, _at: meta.emittedAt });
    } catch (e) { _reportError('history', e); }
  });
  return () => { bus._historyWired = false; off(); };
}

module.exports = {
  OracleEventBus,
  getEventBus,
  resetEventBus,
  wireHistoryPersistence,
  EVENTS,
};
