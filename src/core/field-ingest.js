'use strict';

/**
 * field-ingest — pull the existing ecosystem INTO the field.
 *
 * field-memory.js wires the forward arrow: new observations flow into
 * the field and get compressed into the library. This module wires the
 * reverse arrow: everything that already exists — the whole pattern
 * library, the constants, the static numbers — is encoded into the
 * 256-D substrate and contributed to the field, so the field knows
 * the entire ecosystem, not just the events that fired since it woke.
 *
 * After an ingest pass:
 *   - every pattern in the library carries a 256-D waveform (backfilled
 *     onto coherency_json.waveform if it didn't have one), so it lives
 *     in the same substrate as field events and is queryable by cosine;
 *   - every pattern has contributed to the field histogram under a
 *     `library:<lang>:<name>` source;
 *   - every named numeric constant has contributed under a
 *     `constant:<name>` source.
 *
 * Idempotent: re-running skips patterns that already have a waveform
 * and the field's similarity gate collapses repeat contributions.
 * Best-effort throughout — a failure on one pattern never aborts the
 * pass.
 */

const path = require('path');
const { codeToWaveform, digestWaveform } = require('./code-to-waveform');

/** Lazily resolve the field-coupling contribute() — best-effort. */
function _contribute() {
  try {
    return require('./field-coupling').contribute;
  } catch (_) {
    return null;
  }
}

/**
 * Ingest the entire pattern library into the field.
 *
 * For every non-field pattern: backfill a canonical waveform onto
 * coherency_json if absent, then contribute the pattern to the field.
 *
 * @param {object} store - a SQLiteStore (must expose `.db`)
 * @param {object} [opts] - { limit }
 * @returns {{ total, encoded, contributed, skipped }}
 */
function ingestPatterns(store, opts = {}) {
  const report = { total: 0, encoded: 0, contributed: 0, skipped: 0 };
  if (!store || !store.db) return report;
  let contribute = null;
  try { ({ recordCost: contribute } = require('./field-coupling')); } catch (_) { /* best-effort */ }
  try {
    let sql = 'SELECT id, name, code, language, coherency_total, coherency_json FROM patterns';
    if (opts.limit) sql += ` LIMIT ${Math.max(1, parseInt(opts.limit, 10))}`;
    const rows = store.db.prepare(sql).all();
    report.total = rows.length;

    for (const p of rows) {
      try {
        // field-* patterns are already encoded by field-memory — skip.
        if (p.language === 'field') { report.skipped += 1; continue; }

        let cj;
        try { cj = JSON.parse(p.coherency_json || '{}'); } catch (_) { cj = {}; }

        // Backfill the waveform if this pattern has never been encoded.
        if (!Array.isArray(cj.waveform)) {
          const wf = Array.from(codeToWaveform(p.code || p.name || ''));
          cj.waveform = wf;
          cj.digest = digestWaveform(wf);
          store.db.prepare('UPDATE patterns SET coherency_json = ? WHERE id = ?')
            .run(JSON.stringify(cj), p.id);
          report.encoded += 1;
        }

        // Count the pattern into the field as an ingestion event. The
        // stored coherency_total is the submit-time heuristic aggregate
        // with an invented ||0 fallback — not a compressor reading — so
        // it left the coherence channel (provenance purge 2026-08-09).
        // A pattern's lawful coherency enters at its witness/replay
        // doorway, where the compressor read its bytes. Grouped source
        // (library:<language>) keeps the histogram a bounded compass.
        if (contribute) {
          contribute({
            units: 1,
            kind: 'ingestion',
            source: `library:${p.language || 'unknown'}`,
          });
          report.contributed += 1;
        }
      } catch (_) { /* one pattern failing never aborts the pass */ }
    }
  } catch (_) { /* store unreadable — return what we have */ }
  return report;
}

/**
 * Ingest the static numeric constants into the field. Each named
 * threshold/weight becomes a `constant:<name>` source — the field
 * then knows the system's static numbers, not just its moving ones.
 *
 * @returns {{ total, contributed }}
 */
function ingestConstants() {
  const report = { total: 0, contributed: 0 };
  let recordCost = null;
  try { ({ recordCost } = require('./field-coupling')); } catch (_) { /* best-effort */ }
  if (!recordCost) return report;

  const buckets = [];
  try { buckets.push(['thresholds', require('../constants/thresholds')]); } catch (_) { /* skip */ }
  try { buckets.push(['quantum', require('../quantum/quantum-core')]); } catch (_) { /* skip */ }

  // Flatten: walk each module's exports, emit one observation per number.
  // Source is grouped at the module level (constant:<module>) so the
  // histogram stays a bounded compass.
  //
  // PROVENANCE (2026-08-09): a declared constant is a DECLARATION, not a
  // measurement — no compressor ever emitted it, so its value no longer
  // enters the coherence channel. Each constant is counted as a
  // declaration event through recordCost (which passes through the
  // field's own coherence — nothing invented); the census memory the
  // histogram carries is unchanged.
  const walk = (prefix, obj, depth) => {
    if (depth > 3 || obj == null) return;
    const moduleKey = prefix.split(':')[0];
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'number' && isFinite(val)) {
        report.total += 1;
        try {
          recordCost({ units: 1, source: `constant:${moduleKey}`, kind: 'declaration' });
          report.contributed += 1;
        } catch (_) { /* best-effort */ }
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        walk(`${prefix}:${key}`, val, depth + 1);
      }
    }
  };
  for (const [name, mod] of buckets) walk(name, mod, 0);
  return report;
}

/**
 * Full ingest — patterns + constants. The one call that brings the
 * existing ecosystem into the field.
 *
 * @param {object} store - SQLiteStore
 * @param {object} [opts]
 * @returns {{ patterns, constants }}
 */
function ingest(store, opts = {}) {
  return {
    patterns: ingestPatterns(store, opts),
    constants: ingestConstants(),
  };
}

module.exports = { ingest, ingestPatterns, ingestConstants };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
ingestPatterns.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 10, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
ingestConstants.atomicProperties = { charge: 0, valence: 2, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 1, group: 9, period: 3, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };
ingest.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 10, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
