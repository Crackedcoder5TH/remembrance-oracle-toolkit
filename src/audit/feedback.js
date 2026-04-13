'use strict';

/**
 * Audit feedback store + severity calibration.
 *
 * Every time a finding is dismissed or fixed, we record that event in
 * `.remembrance/audit-feedback.json`. The store aggregates per-ruleId
 * counts and computes a confidence score — a ratio of fixes over the
 * total (fixes + dismisses).
 *
 * Confidence ≥ 0.7  → rule is trustworthy, keep declared severity
 * Confidence 0.4 – 0.7 → rule is mixed, downgrade one step
 * Confidence < 0.4  → rule is noisy, downgrade two steps (info)
 *
 * New rules start with no data and are trusted at face value. A minimum
 * of 5 total observations is required before calibration kicks in, so
 * a single false positive doesn't tank a rule.
 *
 * This module deliberately stores feedback on disk as JSON. We could
 * use SQLite but that adds a dep on the sqlite store for a single
 * append-only counter — JSON is simpler and diffable.
 */

const fs = require('fs');
const path = require('path');

const STORE_DIRS = ['.remembrance', '.oracle'];
const STORE_FILE = 'audit-feedback.json';
const MIN_OBSERVATIONS = 5;

const SEVERITY_ORDER = ['high', 'medium', 'low', 'info'];

function resolveStorePath(repoRoot) {
  for (const d of STORE_DIRS) {
    const candidate = path.join(repoRoot, d, STORE_FILE);
    if (fs.existsSync(candidate)) return candidate;
    const dir = path.join(repoRoot, d);
    if (fs.existsSync(dir)) return candidate;
  }
  return path.join(repoRoot, STORE_DIRS[0], STORE_FILE);
}

function emptyStore() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    rules: {},
  };
}

function loadStore(storePath) {
  if (!fs.existsSync(storePath)) return emptyStore();
  try {
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    if (!raw || typeof raw !== 'object' || !raw.rules) return emptyStore();
    return raw;
  } catch {
    return emptyStore();
  }
}

function saveStore(store, storePath) {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = storePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, storePath);
}

function ensureRule(store, ruleId) {
  if (!store.rules[ruleId]) {
    store.rules[ruleId] = {
      fixed: 0,
      dismissed: 0,
      lastEvent: null,
    };
  }
  return store.rules[ruleId];
}

/**
 * Record a user action against a finding.
 *
 * @param {string} repoRoot
 * @param {string} action - 'fix' | 'dismiss'
 * @param {string} ruleId
 * @param {object} [context] - { file, line }
 */
function recordFeedback(repoRoot, action, ruleId, context) {
  if (!ruleId) return null;
  const storePath = resolveStorePath(repoRoot);
  const store = loadStore(storePath);
  const rule = ensureRule(store, ruleId);
  if (action === 'fix') rule.fixed++;
  else if (action === 'dismiss') rule.dismissed++;
  else return null;
  rule.lastEvent = {
    action,
    at: new Date().toISOString(),
    file: context?.file || null,
    line: context?.line || null,
  };
  saveStore(store, storePath);
  return rule;
}

/**
 * Compute a confidence score for a rule based on its feedback history.
 * Returns a number in [0, 1]. Rules with < MIN_OBSERVATIONS events
 * return 1.0 (trust until calibrated).
 */
function confidenceFor(store, ruleId) {
  const rule = store.rules[ruleId];
  if (!rule) return 1.0;
  const total = rule.fixed + rule.dismissed;
  if (total < MIN_OBSERVATIONS) return 1.0;
  return rule.fixed / total;
}

/**
 * Downgrade a severity based on a confidence score.
 *
 *   conf ≥ 0.7  → keep
 *   conf 0.4–0.7 → drop one step
 *   conf < 0.4  → drop two steps (to low or info)
 */
function calibrateSeverity(severity, confidence) {
  if (!severity || !SEVERITY_ORDER.includes(severity)) return severity;
  let steps = 0;
  if (confidence < 0.7) steps = 1;
  if (confidence < 0.4) steps = 2;
  if (steps === 0) return severity;
  const idx = SEVERITY_ORDER.indexOf(severity);
  const next = Math.min(SEVERITY_ORDER.length - 1, idx + steps);
  return SEVERITY_ORDER[next];
}

/**
 * Apply calibration to an array of findings, mutating each finding's
 * `severity` and annotating with `calibrated` + `originalSeverity`.
 *
 * Noise-gated findings (conf < 0.25) are dropped entirely.
 */
function calibrateFindings(findings, repoRoot) {
  const storePath = resolveStorePath(repoRoot);
  const store = loadStore(storePath);
  const out = [];
  for (const f of findings) {
    const conf = confidenceFor(store, f.ruleId || f.bugClass || '');
    if (conf < 0.25) {
      // Drop: the rule has proven itself noise
      continue;
    }
    const nextSeverity = calibrateSeverity(f.severity, conf);
    if (nextSeverity !== f.severity) {
      out.push({
        ...f,
        originalSeverity: f.severity,
        severity: nextSeverity,
        calibrated: true,
        confidence: conf,
      });
    } else {
      out.push({ ...f, confidence: conf });
    }
  }
  return out;
}

/**
 * Return a summary of the current feedback store sorted by most-dismissed.
 */
function summarizeStore(repoRoot) {
  const store = loadStore(resolveStorePath(repoRoot));
  const rows = [];
  for (const [ruleId, stats] of Object.entries(store.rules)) {
    const total = stats.fixed + stats.dismissed;
    const conf = total >= MIN_OBSERVATIONS ? stats.fixed / total : null;
    rows.push({
      ruleId,
      fixed: stats.fixed,
      dismissed: stats.dismissed,
      confidence: conf,
      lastEvent: stats.lastEvent,
    });
  }
  rows.sort((a, b) => b.dismissed - a.dismissed);
  return { total: rows.length, rules: rows };
}

module.exports = {
  resolveStorePath,
  loadStore,
  saveStore,
  recordFeedback,
  confidenceFor,
  calibrateSeverity,
  calibrateFindings,
  summarizeStore,
  MIN_OBSERVATIONS,
};
