'use strict';

/**
 * Bayesian bug prior — waveform-based risk signal.
 *
 * Intuition: if a new file's structural fingerprint matches patterns
 * that have historically been associated with bugs, we emit a low-
 * confidence "risk" finding so the reviewer pays closer attention.
 *
 * The prior uses three inputs, in order of strength:
 *
 *   1. The Void substrate (42K+ waveforms) if available — each pattern
 *      carries its own waveform and the debug oracle tracks which bug
 *      classes have been registered against it.
 *   2. A bundled seed file of known-buggy fingerprints shipped with
 *      the toolkit (`seeds/audit-bug-prior.json`). This gives us a
 *      baseline even without the full substrate.
 *   3. Ad-hoc fingerprints from the feedback store — if a rule fires
 *      repeatedly on files with a certain shape, we promote that
 *      shape to the prior automatically.
 *
 * For each match we emit a finding with severity proportional to the
 * posterior probability. We cap at severity=medium because a prior
 * can never be as confident as a structural check — it's a hint.
 */

const fs = require('fs');
const path = require('path');

let _fingerprintFn = null;
function loadFingerprint() {
  if (_fingerprintFn) return _fingerprintFn;
  try {
    const mod = require('../compression/fractal');
    if (typeof mod.structuralFingerprint === 'function') {
      _fingerprintFn = mod.structuralFingerprint;
    }
  } catch { /* not available */ }
  if (!_fingerprintFn) {
    // Fallback: return a hash-of-code so the module still functions.
    const crypto = require('crypto');
    _fingerprintFn = (code) => {
      return { hash: crypto.createHash('sha1').update(code).digest('hex').slice(0, 16) };
    };
  }
  return _fingerprintFn;
}

// ─── Seed store ─────────────────────────────────────────────────────────────

const SEED_PATHS = [
  path.join(__dirname, '..', '..', 'seeds', 'audit-bug-prior.json'),
  path.join(__dirname, '..', 'patterns', 'audit-bug-prior.json'),
];

let _priorCache = null;
function loadPrior() {
  if (_priorCache) return _priorCache;
  for (const p of SEED_PATHS) {
    if (fs.existsSync(p)) {
      try {
        _priorCache = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return _priorCache;
      } catch { /* bad JSON, keep trying */ }
    }
  }
  _priorCache = { version: 1, patterns: [] };
  return _priorCache;
}

/**
 * Reset the cache. Used by tests and by `oracle audit prior reload`.
 */
function resetPriorCache() {
  _priorCache = null;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/**
 * Given a source file, return an array of risk findings from the prior.
 *
 * @param {string} source - file contents
 * @param {string} filePath - for attribution
 * @param {object} [opts] - { language, threshold, maxFindings }
 * @returns {Array<finding>}
 */
function scorePrior(source, filePath, opts = {}) {
  if (typeof source !== 'string' || source.length === 0) return [];
  const prior = loadPrior();
  if (!prior.patterns || prior.patterns.length === 0) return [];

  const language = opts.language || detectLanguage(filePath);
  const threshold = opts.threshold ?? 0.7;
  const maxFindings = opts.maxFindings ?? 5;

  const fp = computeFingerprint(source, language);
  if (!fp) return [];

  const findings = [];
  for (const entry of prior.patterns) {
    if (entry.language && entry.language !== language) continue;
    const sim = similarity(fp, entry.fingerprint);
    if (sim < threshold) continue;
    const risk = Math.min(1, sim * (entry.priorBugRate || 0.5));
    const severity = risk >= 0.75 ? 'medium' : risk >= 0.5 ? 'low' : 'info';
    findings.push({
      line: 1,
      column: 1,
      bugClass: 'bayesian',
      ruleId: `bayesian/${entry.category || 'bug-prior'}`,
      severity,
      assumption: 'File shape is unrelated to known-buggy patterns',
      reality: `Matches known-buggy fingerprint "${entry.name}" at similarity ${sim.toFixed(2)} (prior bug rate ${(entry.priorBugRate || 0).toFixed(2)})`,
      suggestion: entry.suggestion || 'Review the flagged fragment carefully; similar shapes have needed fixes in the past.',
      confidence: risk,
      evidence: {
        similarity: sim,
        priorBugRate: entry.priorBugRate || 0,
        matchedPattern: entry.name,
      },
    });
  }

  const sorted = [...findings].sort((a, b) => b.confidence - a.confidence);
  return sorted.slice(0, maxFindings);
}

function computeFingerprint(source, language) {
  const fn = loadFingerprint();
  try {
    return fn(source, language || 'javascript', { fuzzy: true });
  } catch {
    return null;
  }
}

/**
 * Jaccard-style similarity on two fingerprints. Works on whatever
 * fingerprint shape the fractal module returns — we look at the
 * `tokens` / `skeleton` / `hash` fields and fall back to a string
 * comparison of the whole object JSON.
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a.hash && b.hash && a.hash === b.hash) return 1.0;
  const aSkel = extractSkeleton(a);
  const bSkel = extractSkeleton(b);
  if (!aSkel || !bSkel) return 0;
  const aSet = new Set(aSkel.split(/\W+/).filter(Boolean));
  const bSet = new Set(bSkel.split(/\W+/).filter(Boolean));
  let common = 0;
  for (const tok of aSet) if (bSet.has(tok)) common++;
  const union = aSet.size + bSet.size - common;
  if (union === 0) return 0;
  return common / union;
}

function extractSkeleton(fp) {
  if (typeof fp === 'string') return fp;
  if (!fp || typeof fp !== 'object') return '';
  return fp.skeleton || fp.tokens || fp.structure || fp.hash || JSON.stringify(fp);
}

function detectLanguage(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  return {
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.go': 'go', '.rs': 'rust',
  }[ext] || 'javascript';
}

// ─── Augmenting the prior ───────────────────────────────────────────────────

/**
 * Add a new entry to the prior (used when the feedback store shows a
 * rule firing repeatedly on the same shape). The entry is written to
 * the first writable seed path.
 */
function addPriorEntry(entry) {
  const prior = loadPrior();
  prior.patterns = prior.patterns || [];
  prior.patterns.push(entry);
  for (const p of SEED_PATHS) {
    const dir = path.dirname(p);
    if (fs.existsSync(dir)) {
      try {
        fs.writeFileSync(p, JSON.stringify(prior, null, 2));
        resetPriorCache();
        return p;
      } catch { /* read-only, try next */ }
    }
  }
  return null;
}

module.exports = {
  scorePrior,
  loadPrior,
  addPriorEntry,
  resetPriorCache,
  similarity,
};
