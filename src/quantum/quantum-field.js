'use strict';

/**
 * Quantum Field — The unified quantum state manager for all Oracle patterns.
 *
 * This class wraps a SQLite store and provides quantum operations (capture,
 * observe, feedback, decoherence, entanglement) across ALL pattern types:
 *   - patterns (code patterns in the library)
 *   - entries (verified history)
 *   - candidates (unproven patterns)
 *   - debug_patterns (error→fix pairs)
 *
 * The QuantumField treats every stored item as a quantum state with:
 *   - amplitude (0-1): probability of being useful
 *   - phase (0-2π): used in interference calculations
 *   - quantum_state: superposition | collapsed | decohered
 *   - entangled_with: JSON array of linked pattern IDs
 *   - observation_count: how many times measured
 *   - last_observed_at: timestamp of last observation
 *
 * This module also handles quantum column migration for existing tables.
 */

const {
  PLANCK_AMPLITUDE,
  DECOHERENCE_LAMBDA,
  COLLAPSE_BOOST,
  DECOHERENCE_FLOOR,
  CASCADE_THRESHOLD,
  QUANTUM_STATES,
  computeAmplitude,
  coherencyToAmplitude,
  applyDecoherence,
  determineState,
  computePhase,
  computeInterference,
  applyFieldInterference,
  canTunnel,
  computeEntanglementDelta,
  observePattern,
  quantumDecision,
  ENTANGLEMENT_STRENGTH,
} = require('./quantum-core');

function safeParse(str, fallback) {
  try { return JSON.parse(str || JSON.stringify(fallback)); } catch { return fallback; }
}

// Tables that participate in the quantum field
const QUANTUM_TABLES = ['patterns', 'entries', 'candidates', 'debug_patterns'];

class QuantumField {
  /**
   * @param {object} store - SQLiteStore instance with .db property
   * @param {object} [options]
   * @param {boolean} [options.verbose]
   * @param {function} [options.onCascade] — fired when a pattern's amplitude
   *   crosses CASCADE_THRESHOLD upward on a successful feedback. Receives
   *   { table, id, previousAmplitude, newAmplitude, threshold }. Best-effort:
   *   exceptions are caught and logged under ORACLE_DEBUG.
   */
  constructor(store, options = {}) {
    this.store = store;
    this.db = store.db;
    this.verbose = options.verbose || false;
    this.onCascade = typeof options.onCascade === 'function' ? options.onCascade : null;

    this._migrateAllTables();
  }

  // ─── Schema Migration ───

  /**
   * Add quantum columns to all participating tables.
   * Safe to call multiple times — skips columns that already exist.
   */
  _migrateAllTables() {
    for (const table of QUANTUM_TABLES) {
      this._migrateTable(table);
    }
  }

  _migrateTable(table) {
    // Validate table name against allowlist to prevent SQL injection
    if (!QUANTUM_TABLES.includes(table)) return;

    // Check if table exists
    const tableExists = this.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!tableExists) return;

    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all();
    const colNames = new Set(columns.map(c => c.name));

    const migrations = [
      ['quantum_state', `ALTER TABLE ${table} ADD COLUMN quantum_state TEXT DEFAULT 'superposition'`],
      ['amplitude', `ALTER TABLE ${table} ADD COLUMN amplitude REAL DEFAULT ${PLANCK_AMPLITUDE}`],
      ['phase', `ALTER TABLE ${table} ADD COLUMN phase REAL DEFAULT 0`],
      ['last_observed_at', `ALTER TABLE ${table} ADD COLUMN last_observed_at TEXT`],
      ['entangled_with', `ALTER TABLE ${table} ADD COLUMN entangled_with TEXT DEFAULT '[]'`],
      ['observation_count', `ALTER TABLE ${table} ADD COLUMN observation_count INTEGER DEFAULT 0`],
    ];

    for (const [colName, sql] of migrations) {
      if (colNames.has(colName)) continue;
      try {
        this.db.exec(sql);

        // Backfill amplitude from coherency for patterns/entries/candidates
        if (colName === 'amplitude' && table !== 'debug_patterns') {
          this._backfillAmplitude(table);
        }

        // Backfill phase from id
        if (colName === 'phase') {
          this._backfillPhase(table);
        }
      } catch (e) {
        if (!e.message?.includes('duplicate column')) {
          if (process.env.ORACLE_DEBUG) console.warn(`[quantum-field:migrate:${table}]`, e.message);
        }
      }
    }

    // Create indexes for quantum columns
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_quantum_state ON ${table}(quantum_state)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_amplitude ON ${table}(amplitude)`);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn(`[quantum-field:index:${table}]`, e?.message || e);
    }
  }

  _backfillAmplitude(table) {
    try {
      // Convert existing coherency scores to quantum amplitudes
      const coherencyCol = table === 'entries' ? 'coherency_total' : 'coherency_total';
      const usageCol = table === 'entries' ? 'times_used' : 'usage_count';
      const successCol = table === 'entries' ? 'times_succeeded' : 'success_count';

      const rows = this.db.prepare(`SELECT id, ${coherencyCol}, ${usageCol}, ${successCol} FROM ${table}`).all();
      const stmt = this.db.prepare(`UPDATE ${table} SET amplitude = ? WHERE id = ?`);

      for (const row of rows) {
        const amp = coherencyToAmplitude(row[coherencyCol] || 0, {
          usageCount: row[usageCol] || 0,
          successCount: row[successCol] || 0,
        });
        stmt.run(amp, row.id);
      }
    } catch (e) {
      // Some tables may not have usage columns — that's fine, use coherency directly
      try {
        this.db.exec(`UPDATE ${table} SET amplitude = MAX(${PLANCK_AMPLITUDE}, coherency_total) WHERE amplitude = ${PLANCK_AMPLITUDE} AND coherency_total > ${PLANCK_AMPLITUDE}`);
      } catch (_) {
        if (process.env.ORACLE_DEBUG) console.warn(`[quantum-field:backfill:${table}]`, e?.message || e);
      }
    }
  }

  _backfillPhase(table) {
    try {
      const idCol = table === 'debug_patterns' ? 'fingerprint_hash' : 'id';
      const rows = this.db.prepare(`SELECT id, ${idCol} AS phaseSource FROM ${table}`).all();
      const stmt = this.db.prepare(`UPDATE ${table} SET phase = ? WHERE id = ?`);
      for (const row of rows) {
        stmt.run(computePhase(row.phaseSource), row.id);
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn(`[quantum-field:backfillPhase:${table}]`, e?.message || e);
    }
  }

  // ─── Core Quantum Operations ───

  /**
   * OBSERVE — Measure a set of patterns from a table.
   * Collapses their quantum state and updates observation metadata.
   *
   * @param {string} table - Table name (patterns, entries, candidates, debug_patterns)
   * @param {string[]} ids - Pattern IDs that were observed
   * @returns {number} Count of patterns collapsed
   */
  observe(table, ids) {
    if (!ids || ids.length === 0) return 0;
    const now = new Date().toISOString();
    let collapsed = 0;

    const stmt = this.db.prepare(`
      UPDATE ${table}
      SET quantum_state = ?,
          last_observed_at = ?,
          observation_count = COALESCE(observation_count, 0) + 1,
          amplitude = MIN(1.0, COALESCE(amplitude, ${PLANCK_AMPLITUDE}) + ?)
      WHERE id = ?
    `);

    for (const id of ids) {
      try {
        const result = stmt.run(QUANTUM_STATES.COLLAPSED, now, COLLAPSE_BOOST, id);
        if (result.changes > 0) collapsed++;
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn(`[quantum-field:observe:${table}]`, e?.message || e);
      }
    }

    return collapsed;
  }

  /**
   * FEEDBACK — Update amplitude after using a pattern, and propagate entanglement.
   *
   * @param {string} table - Table name
   * @param {string} id - Pattern ID
   * @param {boolean} succeeded - Whether the pattern worked
   * @returns {{ amplitude: number, quantumState: string, entanglementPropagated: number }}
   */
  feedback(table, id, succeeded) {
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) return null;

    const currentAmplitude = row.amplitude || PLANCK_AMPLITUDE;
    const now = new Date().toISOString();

    // Update amplitude based on outcome
    let newAmplitude;
    if (succeeded) {
      newAmplitude = Math.min(1, currentAmplitude + 0.05);
    } else {
      newAmplitude = Math.max(0, currentAmplitude - 0.03);
    }

    const quantumState = determineState(newAmplitude, true);

    this.db.prepare(`
      UPDATE ${table}
      SET amplitude = ?, quantum_state = ?, last_observed_at = ?,
          observation_count = COALESCE(observation_count, 0) + 1
      WHERE id = ?
    `).run(
      Math.round(newAmplitude * 1000) / 1000,
      quantumState, now, id
    );

    // Propagate entanglement
    const entangled = safeParse(row.entangled_with, []);
    const delta = computeEntanglementDelta(succeeded);
    const propagated = this._propagateEntanglement(entangled, delta, id);

    // Cascade growth trigger — when a pattern's amplitude crosses
    // CASCADE_THRESHOLD upward on a successful feedback, fire the
    // cascade hook so consumers (e.g. the recycler) can spawn
    // entangled variants. See quantum-core.CASCADE_THRESHOLD docstring.
    const cascadeTriggered = this._fireCascadeIfCrossed(
      table, id, currentAmplitude, newAmplitude, succeeded
    );

    return {
      amplitude: Math.round(newAmplitude * 1000) / 1000,
      quantumState,
      entanglementPropagated: propagated,
      cascadeTriggered,
    };
  }

  /**
   * Detect an upward CASCADE_THRESHOLD crossing on a successful feedback,
   * contribute the event to the LRE field, and (if wired) call the
   * onCascade consumer. Returns true iff a crossing fired.
   */
  _fireCascadeIfCrossed(table, id, previousAmplitude, newAmplitude, succeeded) {
    if (!succeeded) return false;
    if (previousAmplitude > CASCADE_THRESHOLD) return false; // already past
    if (newAmplitude <= CASCADE_THRESHOLD) return false;     // didn't cross

    // Best-effort field contribution: the cascade is a meaningful event,
    // so the LRE should see it regardless of whether a consumer is wired.
    try {
      const { contribute } = require('../core/field-coupling');
      contribute({ cost: 1, coherence: newAmplitude, source: `quantum:cascade-spawn:${table}` });
    } catch (_) { /* best-effort */ }

    if (this.onCascade) {
      try {
        this.onCascade({
          table,
          id,
          previousAmplitude,
          newAmplitude,
          threshold: CASCADE_THRESHOLD,
        });
      } catch (e) {
        if (process.env.ORACLE_DEBUG) {
          console.warn(`[quantum-field:cascade:${table}:${id}]`, e?.message || e);
        }
      }
    }
    return true;
  }

  /**
   * ENTANGLE — Link two patterns bidirectionally.
   *
   * @param {string} table - Table name (or mixed: tableA:tableB)
   * @param {string} idA - First pattern ID
   * @param {string} idB - Second pattern ID
   */
  entangle(table, idA, idB) {
    this._addEntanglementLink(table, idA, idB);
    this._addEntanglementLink(table, idB, idA);
  }

  /**
   * ENTANGLE BATCH — Link a parent to multiple children.
   *
   * @param {string} table - Table name
   * @param {string} parentId - Parent pattern ID
   * @param {string[]} childIds - Child pattern IDs
   */
  entangleBatch(table, parentId, childIds) {
    if (!childIds || childIds.length === 0) return;
    for (const childId of childIds) {
      this.entangle(table, parentId, childId);
    }
  }

  _addEntanglementLink(table, fromId, toId) {
    try {
      const row = this.db.prepare(`SELECT entangled_with FROM ${table} WHERE id = ?`).get(fromId);
      if (!row) return;
      const existing = safeParse(row.entangled_with, []);
      if (existing.includes(toId)) return;
      existing.push(toId);
      this.db.prepare(`UPDATE ${table} SET entangled_with = ? WHERE id = ?`)
        .run(JSON.stringify(existing), fromId);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn(`[quantum-field:entangle:${table}]`, e?.message || e);
    }
  }

  _propagateEntanglement(entangledIds, delta, sourceId) {
    if (!entangledIds || entangledIds.length === 0) return 0;
    let propagated = 0;

    for (const linkedId of entangledIds) {
      if (linkedId === sourceId) continue;

      // Try each table — entangled patterns may be in different tables
      for (const table of QUANTUM_TABLES) {
        try {
          const row = this.db.prepare(`SELECT amplitude FROM ${table} WHERE id = ?`).get(linkedId);
          if (!row) continue;

          const current = row.amplitude || PLANCK_AMPLITUDE;
          const updated = Math.round(Math.max(0, Math.min(1, current + delta)) * 1000) / 1000;
          const now = new Date().toISOString();

          this.db.prepare(`UPDATE ${table} SET amplitude = ?, updated_at = ? WHERE id = ?`)
            .run(updated, now, linkedId);
          propagated++;
          break; // Found in this table, skip remaining tables
        } catch (e) {
          // Table might not exist or column might be missing — skip
        }
      }
    }

    return propagated;
  }

  // ─── Decoherence Sweep ───

  /**
   * Run decoherence sweep across all tables — decay unobserved patterns.
   *
   * @param {object} [options] - { maxDays, minAmplitude }
   * @returns {{ swept: object, totalDecohered: number }}
   */
  decoherenceSweep(options = {}) {
    const { maxDays = 180, minAmplitude = 0.01 } = options;
    const now = new Date();
    const cutoff = new Date(now.getTime() - maxDays * 86400000).toISOString();
    const report = { totalDecohered: 0 };

    for (const table of QUANTUM_TABLES) {
      try {
        const tableExists = this.db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        if (!tableExists) continue;

        const stale = this.db.prepare(
          `SELECT id, amplitude, last_observed_at FROM ${table}
           WHERE (last_observed_at IS NOT NULL AND last_observed_at < ?)
              OR (last_observed_at IS NULL AND created_at < ?)`
        ).all(cutoff, cutoff);

        let tableDecohered = 0;
        for (const row of stale) {
          const rawAmplitude = row.amplitude || PLANCK_AMPLITUDE;
          const decohered = applyDecoherence(rawAmplitude, row.last_observed_at || cutoff, now.toISOString());

          if (decohered < minAmplitude) {
            this.db.prepare(
              `UPDATE ${table} SET amplitude = ?, quantum_state = ?, updated_at = ? WHERE id = ?`
            ).run(decohered, QUANTUM_STATES.DECOHERED, now.toISOString(), row.id);
            tableDecohered++;
          } else if (decohered < rawAmplitude) {
            this.db.prepare(
              `UPDATE ${table} SET amplitude = ?, updated_at = ? WHERE id = ?`
            ).run(decohered, now.toISOString(), row.id);
          }
        }

        report[table] = { swept: stale.length, decohered: tableDecohered };
        report.totalDecohered += tableDecohered;
      } catch (e) {
        report[table] = { error: e.message };
      }
    }

    return report;
  }

  /**
   * Re-excite decohered patterns — bring them back from decoherence.
   *
   * @param {string} [table] - Specific table, or null for all tables
   * @param {object} [options] - { boostAmount }
   * @returns {{ reexcited: number }}
   */
  reexcite(table, options = {}) {
    const { boostAmount = 0.15 } = options;
    const tables = table ? [table] : QUANTUM_TABLES;
    const now = new Date().toISOString();
    let totalReexcited = 0;

    for (const t of tables) {
      try {
        const tableExists = this.db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
        ).get(t);
        if (!tableExists) continue;

        const decohered = this.db.prepare(
          `SELECT id, amplitude FROM ${t} WHERE quantum_state = ?`
        ).all(QUANTUM_STATES.DECOHERED);

        const stmt = this.db.prepare(
          `UPDATE ${t} SET amplitude = ?, quantum_state = ?, last_observed_at = ?, updated_at = ? WHERE id = ?`
        );

        for (const row of decohered) {
          const newAmp = Math.max(PLANCK_AMPLITUDE, (row.amplitude || 0) + boostAmount);
          stmt.run(newAmp, QUANTUM_STATES.SUPERPOSITION, now, now, row.id);
          totalReexcited++;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn(`[quantum-field:reexcite:${t}]`, e?.message || e);
      }
    }

    return { reexcited: totalReexcited };
  }

  // ─── Field Statistics ───

  /**
   * Get comprehensive quantum field statistics across all tables.
   *
   * @returns {object} Field-wide statistics
   */
  stats() {
    const fieldStats = {
      totalPatterns: 0,
      totalAmplitude: 0,
      avgAmplitude: 0,
      totalObservations: 0,
      entanglementLinks: 0,
      byState: {
        [QUANTUM_STATES.SUPERPOSITION]: 0,
        [QUANTUM_STATES.COLLAPSED]: 0,
        [QUANTUM_STATES.DECOHERED]: 0,
      },
      byTable: {},
      fieldEnergy: 0,
    };

    for (const table of QUANTUM_TABLES) {
      try {
        const tableExists = this.db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        if (!tableExists) continue;

        const rows = this.db.prepare(
          `SELECT quantum_state, amplitude, observation_count, entangled_with FROM ${table}`
        ).all();

        const tableStats = {
          count: rows.length,
          superposition: 0,
          collapsed: 0,
          decohered: 0,
          totalAmplitude: 0,
          totalObservations: 0,
          entanglementLinks: 0,
        };

        for (const row of rows) {
          const state = row.quantum_state || QUANTUM_STATES.SUPERPOSITION;
          if (state === QUANTUM_STATES.SUPERPOSITION) tableStats.superposition++;
          else if (state === QUANTUM_STATES.COLLAPSED) tableStats.collapsed++;
          else if (state === QUANTUM_STATES.DECOHERED) tableStats.decohered++;

          tableStats.totalAmplitude += row.amplitude || 0;
          tableStats.totalObservations += row.observation_count || 0;

          const entangled = safeParse(row.entangled_with, []);
          tableStats.entanglementLinks += entangled.length;
        }

        fieldStats.totalPatterns += tableStats.count;
        fieldStats.totalAmplitude += tableStats.totalAmplitude;
        fieldStats.totalObservations += tableStats.totalObservations;
        fieldStats.entanglementLinks += tableStats.entanglementLinks;
        fieldStats.byState[QUANTUM_STATES.SUPERPOSITION] += tableStats.superposition;
        fieldStats.byState[QUANTUM_STATES.COLLAPSED] += tableStats.collapsed;
        fieldStats.byState[QUANTUM_STATES.DECOHERED] += tableStats.decohered;
        fieldStats.byTable[table] = tableStats;
      } catch (e) {
        fieldStats.byTable[table] = { error: e.message };
      }
    }

    fieldStats.avgAmplitude = fieldStats.totalPatterns > 0
      ? Math.round(fieldStats.totalAmplitude / fieldStats.totalPatterns * 1000) / 1000
      : 0;
    fieldStats.fieldEnergy = Math.round(fieldStats.totalAmplitude * 1000) / 1000;

    return fieldStats;
  }

  /**
   * Get the entanglement graph for a pattern across all tables.
   *
   * @param {string} id - Pattern ID
   * @param {number} [depth] - Max traversal depth
   * @returns {{ nodes: Array, edges: Array }}
   */
  getEntanglementGraph(id, depth = 2) {
    const visited = new Set();
    const graph = { nodes: [], edges: [] };

    const walk = (currentId, currentDepth) => {
      if (visited.has(currentId) || currentDepth > depth) return;
      visited.add(currentId);

      // Search all tables for this ID
      for (const table of QUANTUM_TABLES) {
        try {
          const tableExists = this.db.prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
          ).get(table);
          if (!tableExists) continue;

          const row = this.db.prepare(
            `SELECT id, amplitude, quantum_state, entangled_with, observation_count FROM ${table} WHERE id = ?`
          ).get(currentId);

          if (!row) continue;

          graph.nodes.push({
            id: row.id,
            table,
            amplitude: row.amplitude,
            quantumState: row.quantum_state,
            observationCount: row.observation_count,
          });

          const entangled = safeParse(row.entangled_with, []);
          for (const linkedId of entangled) {
            graph.edges.push({ from: currentId, to: linkedId });
            walk(linkedId, currentDepth + 1);
          }
          break; // Found in this table
        } catch (e) { /* table might not have the right columns yet */ }
      }
    };

    walk(id, 0);
    return graph;
  }

  /**
   * Search for patterns using quantum observation model across a specific table.
   * Returns scored results with decoherence, interference, and tunneling applied.
   *
   * @param {string} table - Table to search
   * @param {object} query - SQL WHERE clause parameters
   * @param {object} options - { limit, language, now, similarityFn }
   * @returns {Array} Scored and ranked results
   */
  quantumSearch(table, matchedRows, options = {}) {
    const { limit = 10, language, now, similarityFn } = options;
    const currentTime = now || new Date().toISOString();

    const scored = [];
    for (const row of matchedRows) {
      const rawAmplitude = row.amplitude || PLANCK_AMPLITUDE;
      const decohered = applyDecoherence(rawAmplitude, row.last_observed_at, currentTime);

      // Born rule: probability ∝ amplitude²
      const bornProb = decohered * decohered;

      // Observation frequency boost
      const obsBoost = Math.min(0.1, (row.observation_count || 0) * 0.01);

      // Language match bonus
      const langBonus = language && row.language === language ? 0.15 : 0;

      const matchScore = Math.round(
        Math.min(1, (row._baseScore || 0) + bornProb * 0.3 + obsBoost + langBonus) * 1000
      ) / 1000;

      scored.push({
        ...row,
        matchScore,
        decoheredAmplitude: decohered,
        bornProbability: bornProb,
        quantumState: row.quantum_state || QUANTUM_STATES.SUPERPOSITION,
      });
    }

    // Apply field interference between results
    applyFieldInterference(scored, similarityFn);

    // Sort by final score
    scored.sort((a, b) => b.matchScore - a.matchScore);

    // Observe the top results (collapse their state)
    const topIds = scored.slice(0, limit).map(s => s.id).filter(Boolean);
    if (topIds.length > 0) {
      this.observe(table, topIds);
    }

    return scored.slice(0, limit);
  }

  /**
   * Make a quantum-based PULL/EVOLVE/GENERATE decision.
   *
   * @param {object} pattern - Pattern with amplitude and relevance
   * @returns {{ decision: string, confidence: number }}
   */
  decide(pattern) {
    const amplitude = pattern.amplitude || pattern.decoheredAmplitude || PLANCK_AMPLITUDE;
    const relevance = pattern.matchScore || pattern.relevance || 0;
    return quantumDecision(amplitude, relevance);
  }
}

module.exports = { QuantumField };
