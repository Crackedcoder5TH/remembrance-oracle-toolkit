'use strict';

/**
 * Unified Oracle history.
 *
 * Before this module, every subsystem logged to its own place:
 *
 *   - Audit: .remembrance/audit/audit.jsonl (SQLite audit_logs table)
 *   - Healing: src/patterns/library.js healing lineage
 *   - Pattern usage: library.register usageCount / successCount
 *   - Covenant violations: mostly in memory
 *   - Debug oracle events: quantum-field internal state
 *   - Feedback store: audit-feedback.json
 *
 * There was no way to answer "what did the Oracle do for me this week?"
 *
 * This module is the single events table every subsystem appends to.
 * It piggybacks on OracleStorage (src/core/storage.js) so the storage
 * backend is consistent (JSON for simple, SQLite for big installs),
 * and subscribes to the OracleEventBus (src/core/events.js) so every
 * subsystem becomes a history producer automatically.
 *
 * The `oracle history` CLI reads from this log and feeds the rich
 * audit summary's trend + regression counts.
 *
 * Shape of each stored entry:
 *
 *   { type: 'audit.finding', payload: {...}, _at: ISO timestamp }
 *
 * Types covered (see core/events EVENTS catalog):
 *
 *   feedback.fix / feedback.dismiss
 *   audit.finding / audit.baseline
 *   lint.finding / smell.finding
 *   pattern.registered / pattern.pulled / pattern.feedback
 *   heal.attempt / heal.succeeded / heal.failed
 *   covenant.violation / covenant.passed
 *   reflector.heal.start / reflector.heal.end
 */

const { getEventBus } = require('./events');
const { getStorage } = require('./storage');

const NAMESPACE = 'history';
const LOG_KEY = 'events';

// ─── Wiring ─────────────────────────────────────────────────────────────────

/**
 * Wire every event on the bus to the history namespace on the given
 * storage instance. Subscribes to the `*` wildcard so any subsystem
 * emitting an event flows through automatically.
 *
 * Idempotent — calling this twice doesn't produce duplicate log
 * entries. Returns an unsubscribe function.
 */
function wireHistory(repoRoot, options = {}) {
  const storage = options.storage || getStorage(repoRoot);
  const bus = getEventBus();
  if (bus._historyWired) return bus._historyWireOff || (() => {});

  const ns = storage.namespace(NAMESPACE);
  const off = bus.on('*', (payload, meta) => {
    try {
      ns.append(LOG_KEY, {
        type: meta.event,
        payload: serializePayload(payload),
        _at: meta.emittedAt,
      });
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[history:wire]', e?.message || e);
    }
  });
  bus._historyWired = true;
  bus._historyWireOff = () => {
    bus._historyWired = false;
    off();
  };
  return bus._historyWireOff;
}

/**
 * Read history entries. Supports a few filters that map well to both
 * the JSON log and a future SQLite-backed implementation:
 *
 *   type:   string or array of event types (exact match)
 *   typePrefix: string (e.g. 'heal.' matches heal.attempt/succeeded/failed)
 *   since:  Date or ISO string
 *   until:  Date or ISO string
 *   limit:  max entries (default 100)
 *   reverse: return newest-first (default true)
 */
function readHistory(repoRoot, filters = {}) {
  const storage = filters.storage || getStorage(repoRoot);
  const entries = readRawLog(storage);
  return filterEntries(entries, filters);
}

function readRawLog(storage) {
  const ns = storage.namespace(NAMESPACE);
  // JsonStorage.append writes to {namespace}/{key}.log.json — the
  // `.log` suffix comes from the namespace implementation, `.json`
  // is added by _pathFor.
  const fs = require('fs');
  const path = require('path');
  const logPath = path.join(storage.baseDir || '', NAMESPACE, LOG_KEY + '.log.json');
  if (fs.existsSync(logPath)) {
    const raw = fs.readFileSync(logPath, 'utf-8');
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); }
      catch { /* skip malformed */ }
    }
    return out;
  }
  // SQLite backend: pull rows via the namespace's append log table
  if (typeof storage.db === 'object' && storage.db) {
    try {
      const rows = storage.db
        .prepare('SELECT entry, at FROM oracle_storage_log WHERE namespace = ? AND key = ? ORDER BY at')
        .all(NAMESPACE, LOG_KEY);
      return rows.map(r => {
        try { return JSON.parse(r.entry); }
        catch { return null; }
      }).filter(Boolean);
    } catch { return []; }
  }
  return [];
}

function filterEntries(entries, filters) {
  let out = entries;

  if (filters.type) {
    const set = new Set(Array.isArray(filters.type) ? filters.type : [filters.type]);
    out = out.filter(e => set.has(e.type));
  }
  if (filters.typePrefix) {
    out = out.filter(e => e.type && e.type.startsWith(filters.typePrefix));
  }
  if (filters.since) {
    const cutoff = new Date(filters.since).getTime();
    out = out.filter(e => new Date(e._at || 0).getTime() >= cutoff);
  }
  if (filters.until) {
    const cutoff = new Date(filters.until).getTime();
    out = out.filter(e => new Date(e._at || 0).getTime() <= cutoff);
  }
  if (filters.reverse !== false) {
    out = [...out].reverse();
  }
  if (filters.limit && filters.limit > 0) {
    out = out.slice(0, filters.limit);
  }
  return out;
}

/**
 * Compact an event payload so the log stays readable. Large fields
 * (sources, full ASTs, findings arrays) are replaced with summaries.
 */
function serializePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string' && v.length > 500) {
      out[k] = v.slice(0, 500) + '…[truncated]';
    } else if (Array.isArray(v) && v.length > 20) {
      out[k] = { length: v.length, firstThree: v.slice(0, 3) };
    } else if (v && typeof v === 'object') {
      try { JSON.stringify(v); out[k] = v; }
      catch { out[k] = '[circular]'; }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Produce a compact summary of the last N events grouped by type.
 * Used by `oracle audit summary` to feed the trend widget.
 */
function summarizeHistory(repoRoot, options = {}) {
  const since = options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const entries = readHistory(repoRoot, { since, reverse: false });
  const byType = {};
  for (const e of entries) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }
  return {
    since,
    total: entries.length,
    byType,
    mostRecent: entries.slice(-1)[0] || null,
  };
}

module.exports = {
  wireHistory,
  readHistory,
  summarizeHistory,
  NAMESPACE,
  LOG_KEY,
};
