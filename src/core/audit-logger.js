'use strict';

/**
 * Audit Logger — immutable, append-only audit trail for oracle operations.
 *
 * Records who submitted, pulled, healed, registered, evolved, and gave
 * feedback on patterns.  Entries are written to an append-only JSONL file
 * and optionally to SQLite for queryable access.
 *
 * Every entry includes: timestamp, action, actor, target id, and metadata.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_ACTIONS = new Set([
  'submit', 'register', 'evolve', 'resolve',
  'feedback', 'pattern_feedback', 'heal', 'share',
  'sync_push', 'sync_pull', 'prune',
]);

let _auditDir = null;
let _auditStream = null;

/**
 * Initialise the audit logger.  Safe to call multiple times (idempotent).
 * @param {string} baseDir — the .remembrance directory (or project root)
 */
function initAuditLog(baseDir) {
  if (_auditStream) return; // already initialised
  _auditDir = path.join(baseDir, '.remembrance', 'audit');
  fs.mkdirSync(_auditDir, { recursive: true });
  const logPath = path.join(_auditDir, 'audit.jsonl');
  _auditStream = fs.createWriteStream(logPath, { flags: 'a', encoding: 'utf-8' });
}

/**
 * Write an audit entry.  Non-blocking, fire-and-forget — audit failures
 * must never break the main operation.
 */
function auditLog(action, details = {}) {
  try {
    if (!AUDIT_ACTIONS.has(action)) return;
    const entry = {
      ts: new Date().toISOString(),
      action,
      id: details.id || null,
      actor: details.actor || process.env.USER || process.env.USERNAME || 'unknown',
      name: details.name || null,
      language: details.language || null,
      success: details.success ?? null,
      meta: details.meta || null,
      traceId: crypto.randomBytes(6).toString('hex'),
    };
    const line = JSON.stringify(entry) + '\n';
    if (_auditStream && !_auditStream.destroyed) {
      _auditStream.write(line);
    }
  } catch (_) {
    // Audit logging must never throw — silent swallow by design
  }
}

/**
 * Read recent audit entries (most-recent-first).
 * @param {number} limit — max entries to return (default 50)
 */
function readAuditLog(limit = 50) {
  try {
    if (!_auditDir) return [];
    const logPath = path.join(_auditDir, 'audit.jsonl');
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Close the audit stream (for graceful shutdown).
 */
function closeAuditLog() {
  if (_auditStream && !_auditStream.destroyed) {
    _auditStream.end();
    _auditStream = null;
  }
}

/**
 * Reset internal state (for testing).
 */
function _resetAuditLog() {
  closeAuditLog();
  _auditDir = null;
}

module.exports = { initAuditLog, auditLog, readAuditLog, closeAuditLog, _resetAuditLog };
