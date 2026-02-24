/**
 * Temporal Memory — The Missing History
 *
 * A temporal knowledge graph that tracks WHY patterns succeeded or failed,
 * WHEN they regressed, and WHAT environmental changes caused failures.
 *
 * Instead of binary stale/fresh, patterns now have a timeline of events
 * with causal annotations. The oracle can say:
 * "This debounce worked until Feb 2026 when Node 22 changed timer semantics."
 *
 * Storage: SQLite table `temporal_events` in the oracle DB.
 */

const path = require('path');
const fs = require('fs');

// ─── Event Types ───

const EVENT_TYPES = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  REGRESSION: 'regression',
  RECOVERY: 'recovery',
  HEALED: 'healed',
  PROMOTED: 'promoted',
  ENVIRONMENT_CHANGE: 'env_change',
  EVOLVED: 'evolved',
  DEPRECATED: 'deprecated',
};

// ─── Temporal Memory Engine ───

class TemporalMemory {
  /**
   * @param {object} db — DatabaseSync instance (node:sqlite)
   */
  constructor(db) {
    this._db = db;
    this._ensureTable();
  }

  _ensureTable() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS temporal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        context TEXT,
        environment TEXT,
        node_version TEXT,
        cause TEXT,
        detail TEXT,
        success_rate_at_time REAL
      )
    `);
    this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_temporal_pattern ON temporal_events(pattern_id)
    `);
    this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_temporal_time ON temporal_events(timestamp)
    `);
  }

  /**
   * Record a temporal event for a pattern.
   */
  record(patternId, eventType, data = {}) {
    const stmt = this._db.prepare(`
      INSERT INTO temporal_events (pattern_id, event_type, timestamp, context, environment, node_version, cause, detail, success_rate_at_time)
      VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      patternId,
      eventType,
      data.context || null,
      data.environment || _detectEnvironment(),
      data.nodeVersion || process.version,
      data.cause || null,
      data.detail || null,
      data.successRate ?? null,
    );
  }

  /**
   * Get the full timeline for a pattern.
   */
  timeline(patternId, options = {}) {
    const { limit = 50 } = options;
    const stmt = this._db.prepare(`
      SELECT * FROM temporal_events WHERE pattern_id = ? ORDER BY timestamp DESC LIMIT ?
    `);
    return stmt.all(patternId, limit);
  }

  /**
   * Detect regressions: patterns that went from success to failure.
   * Returns patterns with their regression point and possible cause.
   */
  detectRegressions(options = {}) {
    const { lookbackDays = 30 } = options;
    const stmt = this._db.prepare(`
      SELECT pattern_id,
             event_type,
             timestamp,
             cause,
             environment,
             node_version,
             success_rate_at_time
      FROM temporal_events
      WHERE timestamp >= datetime('now', ?)
        AND event_type IN ('failure', 'regression')
      ORDER BY timestamp DESC
    `);
    const events = stmt.all(`-${lookbackDays} days`);

    // Group by pattern
    const regressions = new Map();
    for (const e of events) {
      if (!regressions.has(e.pattern_id)) {
        regressions.set(e.pattern_id, {
          patternId: e.pattern_id,
          firstFailure: e.timestamp,
          failureCount: 0,
          lastEnvironment: e.environment,
          lastNodeVersion: e.node_version,
          possibleCause: e.cause,
          lastSuccessRate: e.success_rate_at_time,
        });
      }
      regressions.get(e.pattern_id).failureCount++;
    }

    return [...regressions.values()].sort((a, b) => b.failureCount - a.failureCount);
  }

  /**
   * Analyze a pattern's health over time.
   * Returns a narrative: "This pattern was stable for 3 months, then regressed on <date>."
   */
  analyzeHealth(patternId) {
    const events = this.timeline(patternId, { limit: 100 });
    if (events.length === 0) {
      return { status: 'unknown', narrative: 'No temporal data recorded for this pattern.' };
    }

    const successes = events.filter(e => e.event_type === EVENT_TYPES.SUCCESS);
    const failures = events.filter(e => e.event_type === EVENT_TYPES.FAILURE || e.event_type === EVENT_TYPES.REGRESSION);
    const heals = events.filter(e => e.event_type === EVENT_TYPES.HEALED);

    const totalEvents = successes.length + failures.length;
    const successRate = totalEvents > 0 ? successes.length / totalEvents : 0;

    // Find last regression
    const lastRegression = failures[0];
    const lastSuccess = successes[0];

    let status, narrative;
    if (failures.length === 0) {
      status = 'healthy';
      narrative = `Pattern has ${successes.length} recorded successes with no failures. Stable since first use.`;
    } else if (lastRegression && lastSuccess && lastRegression.timestamp > lastSuccess.timestamp) {
      status = 'regressed';
      const cause = lastRegression.cause ? ` Possible cause: ${lastRegression.cause}.` : '';
      const env = lastRegression.environment ? ` Environment: ${lastRegression.environment}.` : '';
      narrative = `Pattern regressed on ${lastRegression.timestamp.slice(0, 10)}.${cause}${env} ${failures.length} failure(s) recorded.`;
    } else if (heals.length > 0) {
      status = 'recovered';
      narrative = `Pattern recovered after ${failures.length} failure(s). Last healed on ${heals[0].timestamp.slice(0, 10)}.`;
    } else {
      status = 'mixed';
      narrative = `Pattern has ${successes.length} successes and ${failures.length} failures (${(successRate * 100).toFixed(0)}% success rate).`;
    }

    return {
      status,
      narrative,
      successRate,
      totalEvents: events.length,
      successes: successes.length,
      failures: failures.length,
      heals: heals.length,
      lastEvent: events[0],
      firstEvent: events[events.length - 1],
    };
  }

  /**
   * Record an environment change event.
   */
  recordEnvironmentChange(description) {
    const stmt = this._db.prepare(`
      INSERT INTO temporal_events (pattern_id, event_type, timestamp, cause, environment, node_version)
      VALUES ('__global__', ?, datetime('now'), ?, ?, ?)
    `);
    stmt.run(EVENT_TYPES.ENVIRONMENT_CHANGE, description, _detectEnvironment(), process.version);
  }

  /**
   * Get environment change history.
   */
  environmentHistory(limit = 20) {
    const stmt = this._db.prepare(`
      SELECT * FROM temporal_events
      WHERE pattern_id = '__global__' AND event_type = ?
      ORDER BY timestamp DESC LIMIT ?
    `);
    return stmt.all(EVENT_TYPES.ENVIRONMENT_CHANGE, limit);
  }

  /**
   * Get summary statistics for the temporal memory.
   */
  stats() {
    const total = this._db.prepare('SELECT COUNT(*) as cnt FROM temporal_events').get();
    const patterns = this._db.prepare('SELECT COUNT(DISTINCT pattern_id) as cnt FROM temporal_events WHERE pattern_id != ?').get('__global__');
    const byType = this._db.prepare('SELECT event_type, COUNT(*) as cnt FROM temporal_events GROUP BY event_type').all();

    return {
      totalEvents: total.cnt,
      trackedPatterns: patterns.cnt,
      byType: Object.fromEntries(byType.map(r => [r.event_type, r.cnt])),
    };
  }
}

// ─── Helpers ───

function _detectEnvironment() {
  return `node/${process.version} ${process.platform}/${process.arch}`;
}

module.exports = {
  TemporalMemory,
  EVENT_TYPES,
};
