'use strict';

/**
 * Substrate ↔ Bayesian bug-prior promotion loop.
 *
 * The debug oracle (src/debug/debug-oracle.js) tracks "quantum" bug
 * patterns with amplitudes — every captured error or bad pattern gets
 * an amplitude that grows with use and decays with age. Patterns above
 * a threshold are effectively "high-confidence bug smells".
 *
 * The Bayesian bug-prior (src/audit/bayesian-prior.js) scores incoming
 * files against a seed list of known-buggy fingerprints. Until now that
 * seed list was hand-curated and static.
 *
 * This module is the bridge. It walks the debug oracle, pulls every
 * pattern whose amplitude exceeds a configurable threshold, computes a
 * structural fingerprint of the bad-code example stored with that
 * pattern, and merges it into the prior as a new entry. Over time the
 * prior grows stronger as the debug oracle learns.
 *
 * The job is safe to run repeatedly:
 *   - existing entries (by name) are updated in place, not duplicated
 *   - the debug oracle is read-only
 *   - a dry-run option previews what would change without writing
 *
 * Usage:
 *   const { promoteFromSubstrate } = require('./prior-promoter');
 *   const result = promoteFromSubstrate(oracle, {
 *     amplitudeThreshold: 0.7,
 *     maxPromote: 50,
 *     dryRun: false,
 *   });
 *
 * Returns: { considered, promoted, updated, skipped, dryRun, entries }
 */

const fs = require('fs');
const path = require('path');

/**
 * Walk the debug oracle and promote high-amplitude patterns into the
 * Bayesian bug-prior.
 *
 * @param {object} oracle - A RemembranceOracle instance (must expose
 *                          `oracle.debug.getAll()` or compatible)
 * @param {object} options
 *   - amplitudeThreshold: minimum amplitude to promote (default 0.7)
 *   - maxPromote:         cap entries to promote per run (default 50)
 *   - dryRun:             don't write the seed file
 * @returns {object}
 */
function promoteFromSubstrate(oracle, options = {}) {
  const amplitudeThreshold = options.amplitudeThreshold ?? 0.7;
  const maxPromote = options.maxPromote ?? 50;
  const dryRun = options.dryRun === true;

  const result = {
    considered: 0,
    promoted: 0,
    updated: 0,
    skipped: 0,
    dryRun,
    entries: [],
  };

  // Pull candidates from the debug oracle. We tolerate several shapes
  // because `oracle.debug` may be a DebugOracle instance, a plain
  // object, or absent.
  const debugPatterns = readDebugPatterns(oracle);
  if (debugPatterns.length === 0) {
    return { ...result, reason: 'no debug patterns available' };
  }
  result.considered = debugPatterns.length;

  // Load the existing prior so we can merge rather than clobber.
  const { loadPrior, addPriorEntry, resetPriorCache } = require('./bayesian-prior');
  const prior = loadPrior();
  const existing = new Map();
  for (const entry of (prior.patterns || [])) {
    existing.set(entry.name, entry);
  }

  // Filter + rank debug patterns by amplitude
  const ranked = debugPatterns
    .map(p => ({ ...p, amplitude: p.amplitude ?? p.confidence ?? 0 }))
    .filter(p => (p.amplitude || 0) >= amplitudeThreshold)
    .sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0))
    .slice(0, maxPromote);

  if (ranked.length === 0) {
    return { ...result, reason: `no patterns at or above amplitude ${amplitudeThreshold}` };
  }

  // Compute fingerprint per candidate via the fractal compressor
  let structuralFingerprint;
  try { structuralFingerprint = require('../compression/fractal').structuralFingerprint; }
  catch { structuralFingerprint = null; }

  const promoted = [];
  for (const p of ranked) {
    // The debug oracle stores error examples. We use p.badCode / p.code
    // if present, otherwise fall back to the error message pattern.
    const sampleCode = p.badCode || p.code || p.errorMessage || p.pattern || '';
    if (!sampleCode || sampleCode.length < 8) { result.skipped++; continue; }

    const fingerprint = structuralFingerprint
      ? safeFingerprint(structuralFingerprint, sampleCode, p.language || 'javascript')
      : { hash: hashString(sampleCode) };

    const entry = {
      name: p.name || p.id || `debug-${hashString(sampleCode).slice(0, 8)}`,
      language: p.language || 'javascript',
      category: p.category || 'bug-prior',
      priorBugRate: Math.min(1, Math.max(0, p.amplitude || 0)),
      fingerprint,
      suggestion: p.suggestion || p.fix || 'Historically a high-amplitude bug pattern in the debug oracle. Review carefully.',
      source: 'debug-oracle',
      promotedAt: new Date().toISOString(),
      sampleCode: sampleCode.slice(0, 400),
    };

    promoted.push(entry);
    if (existing.has(entry.name)) result.updated++;
    else result.promoted++;
    result.entries.push({
      name: entry.name,
      amplitude: p.amplitude,
      priorBugRate: entry.priorBugRate,
      action: existing.has(entry.name) ? 'update' : 'promote',
    });
  }

  if (!dryRun && promoted.length > 0) {
    // Merge into the seed file: update-in-place by name, append new.
    const seedPath = resolveSeedPath();
    if (!seedPath) {
      return { ...result, reason: 'no writable seed path' };
    }
    const seed = loadSeed(seedPath);
    const byName = new Map();
    for (const e of (seed.patterns || [])) byName.set(e.name, e);
    for (const e of promoted) byName.set(e.name, e);
    seed.patterns = Array.from(byName.values());
    seed.updatedAt = new Date().toISOString();
    seed.promotedCount = (seed.promotedCount || 0) + promoted.length;
    fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
    if (typeof resetPriorCache === 'function') resetPriorCache();
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readDebugPatterns(oracle) {
  if (!oracle) return [];
  // Try oracle.debug.getAll()
  const debug = oracle.debug || oracle.debugOracle || null;
  if (debug && typeof debug.getAll === 'function') {
    try { return debug.getAll() || []; } catch { /* ignore */ }
  }
  // Try oracle.store-backed sqlite directly
  try {
    const sqliteStore = oracle.store && oracle.store.getSQLiteStore && oracle.store.getSQLiteStore();
    if (sqliteStore && typeof sqliteStore.getAllDebugPatterns === 'function') {
      return sqliteStore.getAllDebugPatterns() || [];
    }
  } catch { /* ignore */ }
  return [];
}

function safeFingerprint(fn, code, language) {
  try { return fn(code, language, { fuzzy: true }); }
  catch { return { hash: hashString(code) }; }
}

function hashString(s) {
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(s || '').digest('hex').slice(0, 16);
}

function resolveSeedPath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'seeds', 'data', 'audit-bug-prior.json'),
    path.join(__dirname, '..', '..', 'seeds', 'audit-bug-prior.json'), // legacy
    path.join(__dirname, '..', 'patterns', 'audit-bug-prior.json'),
  ];
  for (const p of candidates) {
    const dir = path.dirname(p);
    if (fs.existsSync(dir)) return p;
  }
  return null;
}

function loadSeed(seedPath) {
  if (!fs.existsSync(seedPath)) {
    return { version: 1, patterns: [], createdAt: new Date().toISOString() };
  }
  try { return JSON.parse(fs.readFileSync(seedPath, 'utf-8')); }
  catch { return { version: 1, patterns: [] }; }
}

module.exports = {
  promoteFromSubstrate,
  // Exposed for tests
  _resolveSeedPath: resolveSeedPath,
};
