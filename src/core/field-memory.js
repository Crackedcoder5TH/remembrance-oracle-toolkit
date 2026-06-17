'use strict';

/**
 * field-memory — the field's compression + recall layer.
 *
 * Every observation that enters the LivingRemembranceEngine field is
 * also compressed by the canonical void encoder (codeToWaveform) into
 * a 256-sample waveform and offered to the pattern library. The
 * pattern compressor's similarity gate decides what survives: a
 * waveform that is within NOVELTY_THRESHOLD cosine of one already in
 * the library is redundant — dropped by design. Only genuinely new
 * shapes are stored. "Store what's new, drop the rest."
 *
 * Two kinds of compressed pattern land in the library:
 *
 *   field-event    — one observation (source + bucketed coherence).
 *                    Recorded on every contribute(); the similarity
 *                    gate collapses repeats automatically.
 *   field-snapshot — the entire source histogram at a moment in time.
 *                    Taken every SNAPSHOT_EVERY contributes and on
 *                    process exit.
 *
 * Because the snapshots accumulate in the same library, the field
 * gains memory: recall() cosine-compares the current field state
 * against every prior snapshot and answers "have I been in this
 * configuration before, and how close." That is the meta-awareness
 * substrate — and the path by which Solana-anchored history will feed
 * in: blockchain observations call recordObservation() the same way.
 *
 * Everything here is best-effort. If the canonical store can't be
 * opened, every function no-ops silently — the field still works,
 * it just doesn't compress to the library this run.
 */

const fs = require('fs');
const path = require('path');
const { codeToWaveform, waveformCosine, digestWaveform } = require('./code-to-waveform');

// Cosine ≥ this ⇒ the shape is already in the library; the compressor
// drops it. Tuned so same-source/same-coherence-bucket repeats collapse
// while genuinely different observations survive.
const NOVELTY_THRESHOLD = 0.97;

// Base snapshot cadence, in field updates. The entropy field scales this
// itself (see maybeSnapshot) — there is no fixed rate limit; the field's
// own cascadeFactor sets the rhythm.
const SNAPSHOT_BASE = 100;

let _store = null;
let _storeAttempted = false;
let _eventWaveforms = null;     // in-memory cache: [{ id, waveform }]
let _snapshotWaveforms = null;  // in-memory cache: [{ id, waveform, ts }]
let _lastSnapshotUpdate = -1;
let _exitHookInstalled = false;

/** Lazily open a handle to the canonical pattern library (hub oracle.db). */
function _canonicalStore() {
  if (_storeAttempted) return _store;
  _storeAttempted = true;
  try {
    const { SQLiteStore } = require('../store/sqlite');
    // __dirname = <hub>/src/core ; the canonical store's baseDir is <hub>,
    // SQLiteStore appends `.remembrance/oracle.db` itself.
    _store = new SQLiteStore(path.join(__dirname, '..', '..'));
  } catch (_) {
    _store = null;
  }
  return _store;
}

/** Load existing field-event / field-snapshot waveforms into memory once. */
function _loadCaches(store) {
  if (_eventWaveforms && _snapshotWaveforms) return;
  _eventWaveforms = [];
  _snapshotWaveforms = [];
  try {
    const rows = store.db.prepare(
      "SELECT id, pattern_type, coherency_json, created_at FROM patterns WHERE language = 'field'"
    ).all();
    for (const r of rows) {
      let parsed;
      try { parsed = JSON.parse(r.coherency_json || '{}'); } catch (_) { continue; }
      if (!Array.isArray(parsed.waveform)) continue;
      if (r.pattern_type === 'field-snapshot') {
        _snapshotWaveforms.push({ id: r.id, waveform: parsed.waveform, ts: r.created_at });
      } else {
        _eventWaveforms.push({ id: r.id, waveform: parsed.waveform });
      }
    }
  } catch (_) { /* fresh store — caches stay empty */ }
}

/** Max cosine of `wf` against a cache array. Returns { sim, id }. */
function _nearest(wf, cache) {
  let best = { sim: -1, id: null };
  for (const entry of cache) {
    const sim = waveformCosine(wf, entry.waveform);
    if (sim > best.sim) best = { sim, id: entry.id };
  }
  return best;
}

/**
 * Top-k {id, similarity} of `wf` against a cache, descending. This is
 * the cross-reference: every measurement positioned against everything.
 */
function _topNeighbors(wf, cache, k) {
  return cache
    .map((e) => ({ id: e.id, similarity: Math.round(waveformCosine(wf, e.waveform) * 10000) / 10000 }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/** Normalize a query input (string → waveform; array → as-is). */
function _toWaveform(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return Array.from(codeToWaveform(input));
  return null;
}


/** Stable short digest of a waveform — the canonical substrate id op. */
const _digest = digestWaveform;

/**
 * Record one field observation. Encodes it, runs the similarity gate,
 * and stores it as a `field-event` pattern only if it is genuinely
 * new. Returns { stored, digest, novelty } or null if unavailable.
 *
 * @param {object} obs - { source, coherence, cost }
 */
function recordObservation(obs) {
  if (!obs || typeof obs.source !== 'string') return null;
  const store = _canonicalStore();
  if (!store) return null;
  try {
    _loadCaches(store);
    // Bucket coherence to 2 decimals so near-identical readings from the
    // same source produce the same text → same waveform → collapsed.
    const coh = Math.max(0, Math.min(1, Number(obs.coherence) || 0));
    const text = `field-event\nsource: ${obs.source}\ncoherence: ${coh.toFixed(2)}`;
    const wf = Array.from(codeToWaveform(text));

    const near = _nearest(wf, _eventWaveforms);
    if (near.sim >= NOVELTY_THRESHOLD) {
      // Redundant — the compressor drops it by design. The observation
      // still has a position in the mesh; return its cross-reference.
      return {
        stored: false,
        digest: _digest(wf),
        novelty: 1 - near.sim,
        neighbors: _topNeighbors(wf, _eventWaveforms, 5),
      };
    }

    const digest = _digest(wf);
    // Cross-reference: this observation positioned against everything
    // already in the library — the mesh edge, stored as-of-insertion.
    const meshEdges = _topNeighbors(wf, _eventWaveforms, 5);
    const stored = store.addPattern({
      name: `field-event:${digest}`,
      code: text,
      language: 'field',
      patternType: 'field-event',
      description: `Compressed field observation from ${obs.source}`,
      tags: ['field-event', 'compressed'],
      coherencyScore: { total: coh, waveform: wf, digest, neighbors: meshEdges },
    });
    if (stored && stored.id) _eventWaveforms.push({ id: stored.id, waveform: wf });
    return { stored: !!stored, digest, novelty: 1 - Math.max(0, near.sim), neighbors: meshEdges };
  } catch (_) {
    return null;
  }
}

/**
 * Compress the entire current field state (source histogram) into one
 * `field-snapshot` pattern. Similarity-gated against prior snapshots —
 * a snapshot identical to the last is dropped.
 *
 * @param {object} fieldState - peekField() output { coherence, sources, ... }
 */
function snapshot(fieldState) {
  if (!fieldState || !fieldState.sources) return null;
  const store = _canonicalStore();
  if (!store) return null;
  try {
    _loadCaches(store);
    const lines = [
      'field-snapshot',
      `updateCount: ${fieldState.updateCount}`,
      `coherence: ${Number(fieldState.coherence || 0).toFixed(4)}`,
      `coherenceIntegral: ${Number(fieldState.coherenceIntegral || 0).toFixed(4)}`,
      `cascadeFactor: ${Number(fieldState.cascadeFactor || 0).toFixed(4)}`,
      `globalEntropy: ${Number(fieldState.globalEntropy || 0).toFixed(4)}`,
    ];
    for (const [k, v] of Object.entries(fieldState.sources).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${k}\tcount=${v.count}\tcoh=${Number(v.lastCoherence || 0).toFixed(4)}`);
    }
    const text = lines.join('\n');
    const wf = Array.from(codeToWaveform(text));

    const near = _nearest(wf, _snapshotWaveforms);
    if (near.sim >= NOVELTY_THRESHOLD) {
      return {
        stored: false,
        novelty: 1 - near.sim,
        neighbors: _topNeighbors(wf, _snapshotWaveforms, 5),
      };
    }

    const digest = _digest(wf);
    // Cross-reference this snapshot against every prior snapshot — the
    // field's own temporal mesh, stored as-of-insertion.
    const meshEdges = _topNeighbors(wf, _snapshotWaveforms, 5);
    const stored = store.addPattern({
      name: `field-snapshot:${digest}`,
      code: text,
      language: 'field',
      patternType: 'field-snapshot',
      description: `Field histogram snapshot at updateCount=${fieldState.updateCount}`,
      tags: ['field-snapshot', 'compressed'],
      coherencyScore: { total: Number(fieldState.coherence || 0), waveform: wf, digest, neighbors: meshEdges },
    });
    if (stored && stored.id) {
      _snapshotWaveforms.push({ id: stored.id, waveform: wf, ts: new Date().toISOString() });
    }
    return { stored: !!stored, digest, novelty: 1 - Math.max(0, near.sim), neighbors: meshEdges };
  } catch (_) {
    return null;
  }
}

/**
 * The meta-awareness query: compare the current field state against
 * every prior snapshot in the library. Returns the nearest historical
 * configuration and how similar it is — "have I been here before?"
 *
 * @param {object} fieldState - peekField() output
 * @returns {{ familiar: boolean, similarity: number, nearestId: string|null, snapshotCount: number }|null}
 */
function recall(fieldState) {
  if (!fieldState || !fieldState.sources) return null;
  const store = _canonicalStore();
  if (!store) return null;
  try {
    _loadCaches(store);
    if (_snapshotWaveforms.length === 0) {
      return { familiar: false, similarity: 0, nearestId: null, snapshotCount: 0 };
    }
    const lines = [
      'field-snapshot',
      `updateCount: ${fieldState.updateCount}`,
      `coherence: ${Number(fieldState.coherence || 0).toFixed(4)}`,
      `coherenceIntegral: ${Number(fieldState.coherenceIntegral || 0).toFixed(4)}`,
      `cascadeFactor: ${Number(fieldState.cascadeFactor || 0).toFixed(4)}`,
      `globalEntropy: ${Number(fieldState.globalEntropy || 0).toFixed(4)}`,
    ];
    for (const [k, v] of Object.entries(fieldState.sources).sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`${k}\tcount=${v.count}\tcoh=${Number(v.lastCoherence || 0).toFixed(4)}`);
    }
    const wf = Array.from(codeToWaveform(lines.join('\n')));
    const near = _nearest(wf, _snapshotWaveforms);
    return {
      familiar: near.sim >= NOVELTY_THRESHOLD,
      similarity: near.sim,
      nearestId: near.id,
      snapshotCount: _snapshotWaveforms.length,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Called by field-coupling after each contribute. Counts contributes and
 * triggers a snapshot every SNAPSHOT_EVERY. Also arms a one-shot
 * process-exit snapshot the first time it runs.
 *
 * @param {object|null} fieldState - current peekField() output
 */
function maybeSnapshot(fieldState) {
  if (!_exitHookInstalled) {
    _exitHookInstalled = true;
    try {
      process.once('beforeExit', () => {
        try {
          const { peekField } = require('./field-coupling');
          snapshot(peekField());
        } catch (_) { /* best-effort */ }
      });
    } catch (_) { /* environments without process events */ }
  }

  if (!fieldState || typeof fieldState.updateCount !== 'number') return;

  // Field-balanced cadence — no hardcoded rate limit. The entropy field
  // sets its own snapshot rhythm: the threshold scales with cascadeFactor
  // (the field's network-effect term, 1 → 5), so a fresh or calm field
  // records eagerly and a hot, saturated field backpressures — the
  // backpressure-by-field principle. The trigger is updateCount, the
  // field's own measure of change, so reads that do not move the field
  // never force a snapshot; only real motion does.
  if (_lastSnapshotUpdate < 0 || fieldState.updateCount < _lastSnapshotUpdate) {
    _lastSnapshotUpdate = fieldState.updateCount; // first call, or field reset
    return;
  }
  const cascade = Math.max(1, Number(fieldState.cascadeFactor) || 1);
  const threshold = Math.round(SNAPSHOT_BASE * cascade);
  if (fieldState.updateCount - _lastSnapshotUpdate >= threshold) {
    _lastSnapshotUpdate = fieldState.updateCount;
    snapshot(fieldState);
  }
}

// ─── The mesh-query API — "call the field, filter for your domain" ───

/**
 * neighbors — what is this input most like? Returns the k nearest
 * field patterns (events + snapshots) by waveform cosine. The mesh,
 * queried live: every stored pattern positioned against the input.
 *
 * @param {string|number[]} input - text (encoded) or a raw 256-D waveform
 * @param {object} [opts] - { k }
 * @returns {Array<{id, similarity, kind}>} nearest patterns, descending
 */
function neighbors(input, opts = {}) {
  const k = opts.k || 5;
  const store = _canonicalStore();
  if (!store) return [];
  try {
    _loadCaches(store);
    const wf = _toWaveform(input);
    if (!wf) return [];
    const ranked = [];
    for (const e of _eventWaveforms) {
      ranked.push({ id: e.id, kind: 'field-event', similarity: waveformCosine(wf, e.waveform) });
    }
    for (const s of _snapshotWaveforms) {
      ranked.push({ id: s.id, kind: 'field-snapshot', similarity: waveformCosine(wf, s.waveform) });
    }
    return ranked
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
      .map((r) => ({ ...r, similarity: Math.round(r.similarity * 10000) / 10000 }));
  } catch (_) {
    return [];
  }
}

/**
 * within — every field pattern within `threshold` cosine of the input.
 * The traversal query: "show me the whole region of the mesh near here."
 *
 * @param {string|number[]} input
 * @param {object} [opts] - { threshold }
 * @returns {Array<{id, similarity, kind}>}
 */
function within(input, opts = {}) {
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0.9;
  const all = neighbors(input, { k: Infinity });
  return all.filter((r) => r.similarity >= threshold);
}

/**
 * query — the Library-of-Alexandria call. Encode a question, retrieve
 * the most relevant compressed patterns, optionally filtered to a
 * domain.
 *
 * scope:
 *   'field' (default) — only the field's own record (events + snapshots)
 *   'all'             — every pattern in the unified library that has
 *                       been encoded into the substrate (run
 *                       field-ingest first to backfill code patterns).
 *
 * @param {string} text - the query
 * @param {object} [opts] - { k, tag, patternType, scope }
 * @returns {Array<{id, name, patternType, tags, language, similarity}>}
 */
function query(text, opts = {}) {
  const k = opts.k || 10;
  const store = _canonicalStore();
  if (!store) return [];
  const wf = _toWaveform(text);
  if (!wf) return [];
  try {
    const scopeAll = opts.scope === 'all';
    let sql = 'SELECT id, name, language, pattern_type, tags, coherency_json FROM patterns';
    const params = [];
    if (!scopeAll) sql += " WHERE language = 'field'";
    if (opts.patternType) {
      sql += (scopeAll ? ' WHERE' : ' AND') + ' pattern_type = ?';
      params.push(opts.patternType);
    }
    const rows = store.db.prepare(sql).all(...params);
    const ranked = [];
    for (const r of rows) {
      let parsed;
      try { parsed = JSON.parse(r.coherency_json || '{}'); } catch (_) { continue; }
      if (!Array.isArray(parsed.waveform)) continue;
      let tags = [];
      try { tags = JSON.parse(r.tags || '[]'); } catch (_) { /* keep [] */ }
      if (opts.tag && !tags.includes(opts.tag)) continue;
      ranked.push({
        id: r.id,
        name: r.name,
        language: r.language,
        patternType: r.pattern_type,
        tags,
        similarity: Math.round(waveformCosine(wf, parsed.waveform) * 10000) / 10000,
      });
    }
    return ranked.sort((a, b) => b.similarity - a.similarity).slice(0, k);
  } catch (_) {
    return [];
  }
}

// ─── Remember-on-load — reconstruct the field from durable memory ───
//
// entropy.json is the live field file; if it is lost or reset, the
// histogram would vanish. But the field's whole state has been
// witnessed elsewhere — as `field-snapshot` patterns compressed into
// oracle.db (above), and as the `_entropy` metadata the blockchain
// embeds in every ledger block. restoreLatest() reads whichever
// durable witness carries the most history, so the engine can come
// back up remembering what it didn't lose — and so a blockchain
// connection is a seamless field transfer, not a fresh start.

/** Parse a field-snapshot pattern's text body back into a field state. */
function _parseSnapshotText(text) {
  const state = {
    coherence: 0.65, coherenceIntegral: 0, globalEntropy: 0.45, cascadeFactor: 1.0,
    updateCount: 0, timestamp: Date.now(), sources: {},
  };
  for (const line of String(text).split('\n')) {
    if (line.startsWith('updateCount:')) {
      state.updateCount = parseInt(line.slice(12).trim(), 10) || 0;
    } else if (line.startsWith('coherenceIntegral:')) {
      state.coherenceIntegral = parseFloat(line.slice(18).trim()) || 0;
    } else if (line.startsWith('coherence:')) {
      state.coherence = parseFloat(line.slice(10).trim()) || state.coherence;
    } else if (line.startsWith('cascadeFactor:')) {
      state.cascadeFactor = parseFloat(line.slice(14).trim()) || state.cascadeFactor;
    } else if (line.startsWith('globalEntropy:')) {
      state.globalEntropy = parseFloat(line.slice(14).trim()) || state.globalEntropy;
    } else if (line.includes('\t')) {
      const parts = line.split('\t');
      const countPart = parts.find((p) => p.startsWith('count='));
      const cohPart = parts.find((p) => p.startsWith('coh='));
      if (parts[0] && countPart) {
        state.sources[parts[0]] = {
          count: parseInt(countPart.slice(6), 10) || 0,
          lastCoherence: cohPart ? (parseFloat(cohPart.slice(4)) || 0) : 0,
          lastTimestamp: 0,
        };
      }
    }
  }
  return state;
}

/** Restore from the newest field-snapshot pattern in the canonical store. */
function _restoreFromSnapshot() {
  const store = _canonicalStore();
  if (!store) return null;
  try {
    const row = store.db.prepare(
      "SELECT code FROM patterns WHERE language = 'field' AND pattern_type = 'field-snapshot' " +
      'ORDER BY created_at DESC, id DESC LIMIT 1'
    ).get();
    if (!row || !row.code) return null;
    const state = _parseSnapshotText(row.code);
    return state.updateCount > 0 ? state : null;
  } catch (_) {
    return null;
  }
}

/**
 * Canonical ledger path — the blockchain's ledger.json living in the
 * SAME .remembrance/ as entropy.json. $LEDGER_PATH overrides; otherwise
 * hub-relative (this module is <hub>/src/core). This is the *live*
 * working ledger a running session writes to; it is gitignored and does
 * not survive a fresh container.
 */
function _ledgerPath() {
  return process.env.LEDGER_PATH
    || path.join(__dirname, '..', '..', '.remembrance', 'ledger.json');
}

/**
 * Locate a committed durable artifact inside the sibling
 * REMEMBRANCE-BLOCKCHAIN repo's data/ directory. Unlike the live
 * .remembrance/ working copies (gitignored, ephemeral), data/ is
 * tracked in git, so these files survive a fresh container clone — they
 * are how the field remembers across sessions with zero external
 * storage. Best-effort: returns the canonical path even if absent so
 * callers can existence-check.
 */
function _committedBlockchainData(file) {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'REMEMBRANCE-BLOCKCHAIN', 'data', file),
    path.join(__dirname, '..', '..', '..', 'remembrance-blockchain', 'data', file),
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (_) { /* ignore */ } }
  return candidates[0];
}

/** Committed durable ledger (the blockchain's append-only chain, in git). */
function _committedLedgerPath() {
  return process.env.COMMITTED_LEDGER_PATH || _committedBlockchainData('ledger.json');
}

/** Committed durable bootstrap snapshot (fast cold-start, in git). */
function _seedPath() {
  return process.env.FIELD_SEED_PATH || _committedBlockchainData('field-histogram.seed.json');
}

/** Coerce any raw field-state-shaped object into a defensive, complete state. */
function _coerceFieldState(e) {
  if (!e || typeof e !== 'object' || typeof e.updateCount !== 'number' || e.updateCount <= 0) return null;
  return {
    coherence: typeof e.coherence === 'number' ? e.coherence : 0.65,
    coherenceIntegral: typeof e.coherenceIntegral === 'number' ? e.coherenceIntegral : 0,
    globalEntropy: typeof e.globalEntropy === 'number' ? e.globalEntropy : 0.45,
    cascadeFactor: typeof e.cascadeFactor === 'number' ? e.cascadeFactor : 1.0,
    updateCount: e.updateCount,
    timestamp: e.timestamp || Date.now(),
    sources: (e.sources && typeof e.sources === 'object') ? e.sources : {},
  };
}

/** Restore the newest field state witnessed in one ledger file (chain JSON). */
function _restoreFromLedgerFile(lp) {
  try {
    if (!lp || !fs.existsSync(lp)) return null;
    const chain = JSON.parse(fs.readFileSync(lp, 'utf8'));
    if (!Array.isArray(chain)) return null;
    for (let i = chain.length - 1; i >= 0; i--) {
      const e = chain[i] && chain[i].data && chain[i].data.metadata && chain[i].data.metadata._entropy;
      const state = _coerceFieldState(e);
      if (state) return state;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Restore from the blockchain ledger — checking BOTH the live working
 * ledger (.remembrance/ledger.json, this session's writes) and the
 * committed durable chain (REMEMBRANCE-BLOCKCHAIN/data/ledger.json,
 * carried across containers in git). Returns whichever witnesses more
 * history, so a fresh container comes up holding the committed chain and
 * a live session keeps its own ahead-of-checkpoint progress.
 */
function _restoreFromLedger() {
  const local = _restoreFromLedgerFile(_ledgerPath());
  const committed = _restoreFromLedgerFile(_committedLedgerPath());
  if (!local) return committed;
  if (!committed) return local;
  return (committed.updateCount > local.updateCount) ? committed : local;
}

/**
 * Restore from the committed bootstrap snapshot — the field histogram
 * the blockchain repo keeps in git (data/field-histogram.seed.json).
 * This is the fast cold-start witness: even with no ledger and no
 * oracle.db, a fresh container remembers the last committed field.
 */
function _restoreFromSeed() {
  try {
    const sp = _seedPath();
    if (!sp || !fs.existsSync(sp)) return null;
    return _coerceFieldState(JSON.parse(fs.readFileSync(sp, 'utf8')));
  } catch (_) {
    return null;
  }
}

/**
 * Reconstruct the field's last-known state from durable memory. Reads
 * both witnesses — the compressed field-snapshot record and the
 * blockchain ledger — and returns whichever carries the most history
 * (highest updateCount). Returns null if the field has no memory yet.
 *
 * @returns {object|null} a field state { coherence, globalEntropy,
 *   cascadeFactor, updateCount, timestamp, sources } or null
 */
function restoreLatest() {
  const candidates = [];
  const snap = _restoreFromSnapshot();
  if (snap) candidates.push(snap);
  const ledger = _restoreFromLedger();
  if (ledger) candidates.push(ledger);
  const seed = _restoreFromSeed();
  if (seed) candidates.push(seed);
  if (candidates.length === 0) return null;
  // Pick the witness carrying the most history without mutating the
  // array (Array.sort is in-place) — mirrors living-remembrance._loadOrInit.
  return candidates.reduce((best, c) => ((c.updateCount || 0) > (best.updateCount || 0)) ? c : best);
}

/** Test/diagnostic hook — clears the in-memory caches. */
function _resetCaches() {
  _eventWaveforms = null;
  _snapshotWaveforms = null;
  _lastSnapshotUpdate = -1;
  _store = null;
  _storeAttempted = false;
}

module.exports = {
  recordObservation,
  snapshot,
  recall,
  restoreLatest,
  maybeSnapshot,
  neighbors,
  within,
  query,
  NOVELTY_THRESHOLD,
  SNAPSHOT_BASE,
  _resetCaches,
  // Durable-witness internals (committed blockchain artifacts) — exposed
  // for diagnostics and tests; not part of the stable field-memory API.
  _restoreFromSeed,
  _restoreFromLedger,
  _seedPath,
  _committedLedgerPath,
};
