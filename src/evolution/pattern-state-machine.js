'use strict';

/**
 * Pattern Lifecycle State Machine — Centralizes all pattern state transitions.
 *
 * States:
 *   CANDIDATE  → Unproven code awaiting test proof
 *   PATTERN    → Proven, active, searchable code
 *   RETIRED    → Archived due to low usage/coherency
 *
 * Transitions:
 *   CANDIDATE → PATTERN   (promote: test proof + coherency gate)
 *   PATTERN   → RETIRED   (retire: composite score below threshold)
 *   PATTERN   → PATTERN   (evolve: new version replaces old)
 *   RETIRED   → CANDIDATE (resurrect: re-enter via healing)
 *
 * Each transition runs hooks:
 *   - guard:  validates preconditions (returns boolean)
 *   - before: runs before the transition (update embeddings, etc.)
 *   - after:  runs after the transition (audit log, family counts, etc.)
 *
 * Usage:
 *   const sm = createPatternLifecycle(store, options);
 *   sm.promote(candidateId, testCode);    // CANDIDATE → PATTERN
 *   sm.retire(patternId);                 // PATTERN → RETIRED
 *   sm.evolve(patternId, newCode, meta);  // PATTERN → PATTERN (new version)
 *   sm.resurrect(archivedId);             // RETIRED → CANDIDATE
 */

const STATES = {
  CANDIDATE: 'candidate',
  PATTERN: 'pattern',
  RETIRED: 'retired',
};

const TRANSITIONS = {
  PROMOTE: 'promote',
  RETIRE: 'retire',
  EVOLVE: 'evolve',
  RESURRECT: 'resurrect',
};

// Valid state transitions: from → [allowed events]
const TRANSITION_MAP = {
  [STATES.CANDIDATE]: {
    [TRANSITIONS.PROMOTE]: STATES.PATTERN,
  },
  [STATES.PATTERN]: {
    [TRANSITIONS.RETIRE]: STATES.RETIRED,
    [TRANSITIONS.EVOLVE]: STATES.PATTERN,
  },
  [STATES.RETIRED]: {
    [TRANSITIONS.RESURRECT]: STATES.CANDIDATE,
  },
};

/**
 * Create a pattern lifecycle state machine bound to a store.
 *
 * @param {object} store - SQLiteStore instance
 * @param {object} [options]
 * @param {number} [options.minPromotionCoherency=0.6] - Min coherency for promotion
 * @param {number} [options.retireThreshold=0.30] - Composite score below which patterns retire
 * @param {Function} [options.onTransition] - Hook called on every transition: (event) => void
 * @returns {object} Lifecycle API
 */
function createPatternLifecycle(store, options = {}) {
  const {
    minPromotionCoherency = 0.6,
    retireThreshold = 0.30,
    onTransition = null,
  } = options;

  const listeners = [];

  function _emit(event) {
    if (onTransition) {
      try { onTransition(event); } catch (_) { /* never break caller */ }
    }
    for (const listener of listeners) {
      try { listener(event); } catch (_) { /* never break caller */ }
    }
  }

  /**
   * Determine the current state of an entity by its ID.
   * Checks patterns table, candidates table, and archive.
   */
  function getState(id) {
    if (!store || !store.db) return null;

    // Check patterns table first (most common lookup)
    const pattern = store.db.prepare('SELECT id FROM patterns WHERE id = ?').get(id);
    if (pattern) return STATES.PATTERN;

    // Check candidates table (unpromoted)
    const candidate = store.db.prepare(
      'SELECT id, promoted_at FROM candidates WHERE id = ?'
    ).get(id);
    if (candidate) {
      return candidate.promoted_at ? STATES.PATTERN : STATES.CANDIDATE;
    }

    // Check archive
    const archived = store.db.prepare('SELECT id FROM pattern_archive WHERE id = ?').get(id);
    if (archived) return STATES.RETIRED;

    return null;
  }

  /**
   * Validate that a transition is allowed.
   */
  function _validateTransition(id, fromState, transition) {
    if (!fromState) {
      return { valid: false, reason: `Entity ${id} not found in any table` };
    }
    const allowed = TRANSITION_MAP[fromState];
    if (!allowed || !allowed[transition]) {
      return {
        valid: false,
        reason: `Transition "${transition}" not allowed from state "${fromState}"`,
      };
    }
    return { valid: true, toState: allowed[transition] };
  }

  // ─── PROMOTE: CANDIDATE → PATTERN ───

  /**
   * Promote a candidate to a proven pattern.
   *
   * Guards:
   *   - Candidate must exist and not already be promoted
   *   - Must have test code (passed in or existing)
   *   - Coherency must meet minimum threshold
   *
   * Hooks:
   *   - After: audit log, update embeddings, update family counts
   *
   * @param {string} candidateId
   * @param {string} [testCode] - Test proof (uses candidate's if not provided)
   * @param {object} [registerFn] - Optional function to register through full oracle pipeline
   * @returns {{ success: boolean, reason?: string, pattern?: object }}
   */
  function promote(candidateId, testCode, registerFn) {
    const currentState = getState(candidateId);
    const validation = _validateTransition(candidateId, currentState, TRANSITIONS.PROMOTE);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    // Fetch candidate
    const candidate = store.getCandidate(candidateId);
    if (!candidate) {
      return { success: false, reason: 'Candidate not found' };
    }

    const effectiveTestCode = testCode || candidate.testCode;
    if (!effectiveTestCode) {
      return { success: false, reason: 'No test code provided — test proof required for promotion' };
    }

    if ((candidate.coherencyTotal || 0) < minPromotionCoherency) {
      return {
        success: false,
        reason: `Coherency ${candidate.coherencyTotal} below minimum ${minPromotionCoherency}`,
      };
    }

    // Perform the transition
    let registeredPattern = null;
    if (typeof registerFn === 'function') {
      const result = registerFn({
        name: candidate.name,
        code: candidate.code,
        language: candidate.language,
        description: candidate.description,
        tags: (candidate.tags || []).filter(t => t !== 'candidate'),
        testCode: effectiveTestCode,
      });
      if (!result || !result.registered) {
        return { success: false, reason: result?.reason || 'Registration through oracle pipeline failed' };
      }
      registeredPattern = result.pattern;
    }

    // Mark candidate as promoted
    store.promoteCandidate(candidateId);

    const event = {
      transition: TRANSITIONS.PROMOTE,
      from: STATES.CANDIDATE,
      to: STATES.PATTERN,
      entityId: candidateId,
      patternId: registeredPattern?.id || candidateId,
      name: candidate.name,
      timestamp: new Date().toISOString(),
    };
    _emit(event);

    return { success: true, pattern: registeredPattern, event };
  }

  // ─── RETIRE: PATTERN → RETIRED ───

  /**
   * Retire a single pattern by ID.
   *
   * Guards:
   *   - Pattern must exist in patterns table
   *   - Composite score must be below threshold (or force=true)
   *
   * Hooks:
   *   - Before: archive pattern
   *   - After: cleanup fractal data, audit log
   *
   * @param {string} patternId
   * @param {object} [opts]
   * @param {boolean} [opts.force=false] - Skip composite score check
   * @returns {{ success: boolean, reason?: string }}
   */
  function retire(patternId, opts = {}) {
    const { force = false } = opts;
    const currentState = getState(patternId);
    const validation = _validateTransition(patternId, currentState, TRANSITIONS.RETIRE);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const row = store.db.prepare('SELECT * FROM patterns WHERE id = ?').get(patternId);
    if (!row) {
      return { success: false, reason: 'Pattern not found in patterns table' };
    }

    // Guard: composite score check
    if (!force) {
      const coherency = row.coherency_total || 0;
      const reliability = row.usage_count > 0 ? row.success_count / row.usage_count : 0.5;
      const composite = coherency * 0.6 + reliability * 0.4;
      if (composite >= retireThreshold) {
        return {
          success: false,
          reason: `Composite score ${composite.toFixed(3)} >= threshold ${retireThreshold} — pattern is healthy`,
        };
      }
    }

    // Perform the transition
    store.db.exec('BEGIN');
    try {
      store._archivePattern(row, 'retirement');
      if (store._cleanupFractalData) store._cleanupFractalData(patternId);
      store.db.prepare('DELETE FROM patterns WHERE id = ?').run(patternId);
      store._audit('retire', 'patterns', patternId, { name: row.name });
      store.db.exec('COMMIT');
    } catch (e) {
      store.db.exec('ROLLBACK');
      return { success: false, reason: `Retirement failed: ${e.message}` };
    }

    const event = {
      transition: TRANSITIONS.RETIRE,
      from: STATES.PATTERN,
      to: STATES.RETIRED,
      entityId: patternId,
      name: row.name,
      timestamp: new Date().toISOString(),
    };
    _emit(event);

    return { success: true, event };
  }

  /**
   * Bulk retire patterns below the composite score threshold.
   * Delegates to the existing store method but emits events for each.
   *
   * @param {number} [minScore] - Override retire threshold
   * @returns {{ retired: number, remaining: number, events: object[] }}
   */
  function retireBulk(minScore) {
    const threshold = minScore ?? retireThreshold;
    const rows = store.db.prepare('SELECT * FROM patterns').all();
    const toRetire = [];

    for (const row of rows) {
      const coherency = row.coherency_total || 0;
      const reliability = row.usage_count > 0 ? row.success_count / row.usage_count : 0.5;
      const composite = coherency * 0.6 + reliability * 0.4;
      if (composite < threshold) {
        toRetire.push(row);
      }
    }

    const events = [];
    store.db.exec('BEGIN');
    try {
      for (const row of toRetire) {
        store._archivePattern(row, 'retirement');
        if (store._cleanupFractalData) store._cleanupFractalData(row.id);
        store.db.prepare('DELETE FROM patterns WHERE id = ?').run(row.id);
        store._audit('retire', 'patterns', row.id, { name: row.name });
        events.push({
          transition: TRANSITIONS.RETIRE,
          from: STATES.PATTERN,
          to: STATES.RETIRED,
          entityId: row.id,
          name: row.name,
          timestamp: new Date().toISOString(),
        });
      }
      store.db.exec('COMMIT');
    } catch (e) {
      store.db.exec('ROLLBACK');
      return { retired: 0, remaining: rows.length, events: [], error: e.message };
    }

    for (const event of events) _emit(event);

    const remaining = store.db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;
    return { retired: toRetire.length, remaining, events };
  }

  // ─── EVOLVE: PATTERN → PATTERN (new version) ───

  /**
   * Evolve a pattern by updating its code and re-scoring coherency.
   *
   * Guards:
   *   - Pattern must exist
   *
   * Hooks:
   *   - After: update embeddings, append evolution history, audit log
   *
   * @param {string} patternId
   * @param {object} updates - { code, coherencyScore, ... }
   * @returns {{ success: boolean, reason?: string, pattern?: object }}
   */
  function evolve(patternId, updates) {
    const currentState = getState(patternId);
    const validation = _validateTransition(patternId, currentState, TRANSITIONS.EVOLVE);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    if (!updates || !updates.code) {
      return { success: false, reason: 'Evolve requires updated code' };
    }

    // Append to evolution history — use direct SQLite access with fallback
    let pattern = null;
    if (typeof store.getPattern === 'function') {
      pattern = store.getPattern(patternId);
    } else if (store.db) {
      const row = store.db.prepare('SELECT * FROM patterns WHERE id = ?').get(patternId);
      if (row) pattern = row;
    }
    const history = pattern?.evolutionHistory || [];
    history.push({
      type: 'evolve',
      timestamp: new Date().toISOString(),
      previousCode: pattern?.code?.substring(0, 200),
    });

    const updatePayload = {
      ...updates,
      evolutionHistory: history,
      updatedAt: new Date().toISOString(),
    };

    const updated = store.updatePattern(patternId, updatePayload);
    if (!updated) {
      return { success: false, reason: 'Pattern update failed' };
    }

    // Re-embed after code change
    try {
      const { integratePatternIncremental } = require('../compression/fractal-library-bridge');
      integratePatternIncremental(updated, store);
    } catch (_) {
      // Non-fatal — embedding update is best-effort
    }

    const event = {
      transition: TRANSITIONS.EVOLVE,
      from: STATES.PATTERN,
      to: STATES.PATTERN,
      entityId: patternId,
      name: updated.name,
      timestamp: new Date().toISOString(),
    };
    _emit(event);

    return { success: true, pattern: updated, event };
  }

  // ─── RESURRECT: RETIRED → CANDIDATE ───

  /**
   * Resurrect an archived pattern back into the candidate pool.
   *
   * Guards:
   *   - Pattern must exist in pattern_archive
   *
   * Hooks:
   *   - After: insert into candidates, audit log
   *
   * @param {string} archivedId
   * @returns {{ success: boolean, reason?: string, candidate?: object }}
   */
  function resurrect(archivedId) {
    const currentState = getState(archivedId);
    const validation = _validateTransition(archivedId, currentState, TRANSITIONS.RESURRECT);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    const archived = store.db.prepare('SELECT * FROM pattern_archive WHERE id = ?').get(archivedId);
    if (!archived) {
      return { success: false, reason: 'Archived pattern not found' };
    }

    // Parse full row data for restoration
    let fullRow;
    try {
      fullRow = JSON.parse(archived.full_row_json || '{}');
    } catch (_) {
      fullRow = {};
    }

    const now = new Date().toISOString();
    const candidateId = archived.id;

    // Insert into candidates table as a re-entry
    store.db.exec('BEGIN');
    try {
      store.db.prepare(`
        INSERT OR REPLACE INTO candidates
          (id, name, code, language, pattern_type, coherency_total, coherency_json,
           test_code, tags, description, parent_pattern, generation_method, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        candidateId,
        archived.name,
        archived.code,
        archived.language || 'unknown',
        archived.pattern_type || 'utility',
        archived.coherency_total || 0,
        archived.coherency_json || '{}',
        archived.test_code || fullRow.test_code || null,
        archived.tags || fullRow.tags || '[]',
        fullRow.description || null,
        null, // no parent — this is a resurrection
        'resurrected',
        now,
        now
      );

      // Remove from archive
      store.db.prepare('DELETE FROM pattern_archive WHERE id = ?').run(archivedId);

      store._audit('resurrect', 'pattern_archive', archivedId, {
        name: archived.name,
        previousReason: archived.deleted_reason,
      });

      store.db.exec('COMMIT');
    } catch (e) {
      store.db.exec('ROLLBACK');
      return { success: false, reason: `Resurrection failed: ${e.message}` };
    }

    const candidate = store.getCandidate(candidateId);

    const event = {
      transition: TRANSITIONS.RESURRECT,
      from: STATES.RETIRED,
      to: STATES.CANDIDATE,
      entityId: archivedId,
      name: archived.name,
      timestamp: now,
    };
    _emit(event);

    return { success: true, candidate, event };
  }

  // ─── Subscriptions ───

  function subscribe(listener) {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  return {
    // State queries
    getState,
    STATES,
    TRANSITIONS,
    TRANSITION_MAP,

    // Transitions
    promote,
    retire,
    retireBulk,
    evolve,
    resurrect,

    // Subscriptions
    subscribe,
  };
}

module.exports = {
  createPatternLifecycle,
  STATES,
  TRANSITIONS,
  TRANSITION_MAP,
};
