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
  const contribute = _contribute();
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

        // Contribute the pattern to the field. coherency_total is the
        // pattern's own measured coherency — its standing in the field.
        // Grouped source (library:<language>) keeps the histogram a
        // bounded compass even at 80k+ patterns; per-pattern granularity
        // lives in the field-memory mesh, not the histogram.
        if (contribute) {
          contribute({
            cost: 1,
            coherence: Math.max(0, Math.min(1, Number(p.coherency_total) || 0)),
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
  const contribute = _contribute();
  if (!contribute) return report;

  const buckets = [];
  try { buckets.push(['thresholds', require('../constants/thresholds')]); } catch (_) { /* skip */ }
  try { buckets.push(['quantum', require('../quantum/quantum-core')]); } catch (_) { /* skip */ }

  // Flatten: walk each module's exports, emit one observation per number.
  // Source is grouped at the module level (constant:<module>) — the
  // histogram stays a bounded compass; each constant's value still
  // enters the field (moves coherence, is counted).
  const walk = (prefix, obj, depth) => {
    if (depth > 3 || obj == null) return;
    const moduleKey = prefix.split(':')[0];
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'number' && isFinite(val)) {
        report.total += 1;
        try {
          contribute({
            cost: 1,
            coherence: Math.max(0, Math.min(1, val)),
            source: `constant:${moduleKey}`,
          });
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
