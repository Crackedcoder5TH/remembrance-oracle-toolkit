'use strict';

/**
 * Prediction→outcome collection store for the Phase 2 risk scorer.
 *
 * Stage 5 of the anti-hallucination pipeline. The risk-score tool
 * returns a probability (0..1) for every file it sees. The ONLY way
 * to tell whether that probability is predictive is to watch what
 * actually happens to those files over time: do they get bugs
 * reported? do the tests that cover them fail? do they need healing?
 *
 * This module is the infrastructure for collecting those pairs.
 * Every `oracle risk-score` call writes a prediction row. Every
 * subsequent `feedback.fix` / `feedback.dismiss` event AND every
 * `pattern.deleted` event tied to a scored file writes an outcome
 * row. Over time the table accumulates enough (prediction, outcome)
 * pairs to retune the weights in risk-score.js.
 *
 * Storage shape (under .remembrance/feedback-store/):
 *
 *   predictions.jsonl  one JSON row per prediction:
 *     { id, file, probability, riskLevel, cyclomatic, totalCoherency,
 *       at, sessionId }
 *
 *   outcomes.jsonl     one JSON row per observed outcome:
 *     { predictionId, file, outcome, source, at }
 *       outcome ∈ {'bug_confirmed','bug_dismissed','pattern_deleted',
 *                  'healing_succeeded','test_failed'}
 *
 * Both are append-only line logs — cheap to write, easy to stream.
 * The training-time reader joins predictions to outcomes by
 * predictionId (or by file + time window if no explicit id).
 *
 * Training threshold: accumulate ~200 paired rows before treating
 * the dataset as useful. Below that, the classifier in risk-score
 * stays at the v1 baseline (cyclomatic-only).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_DIR = '.remembrance/feedback-store';
const PREDICTIONS_FILE = 'predictions.jsonl';
const OUTCOMES_FILE = 'outcomes.jsonl';

function storeDir(repoRoot) {
  return path.join(repoRoot || process.cwd(), DEFAULT_DIR);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function makeId() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Record a prediction. Returns the generated prediction id so the
 * caller (typically an MCP tool or a CLI handler) can thread it
 * through to any subsequent outcome event.
 *
 * @param {object} prediction
 *   - file: string (required)
 *   - probability: number 0..1
 *   - riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
 *   - cyclomatic: number (raw count from astAnalysis)
 *   - totalCoherency: number 0..1
 *   - sessionId: optional compliance session id for cross-ref
 * @param {object} options
 *   - repoRoot: filesystem root (default cwd)
 *
 * @returns {string} id of the recorded prediction
 */
function recordPrediction(prediction, options = {}) {
  if (!prediction || typeof prediction !== 'object') {
    throw new TypeError('recordPrediction: prediction must be an object');
  }
  if (!prediction.file || typeof prediction.file !== 'string') {
    throw new TypeError('recordPrediction: prediction.file is required');
  }
  const dir = storeDir(options.repoRoot);
  ensureDir(dir);
  const id = prediction.id || makeId();
  const row = {
    id,
    file: prediction.file,
    probability: typeof prediction.probability === 'number' ? prediction.probability : 0,
    riskLevel: prediction.riskLevel || 'LOW',
    cyclomatic: prediction.cyclomatic || 0,
    totalCoherency: prediction.totalCoherency || 0,
    sessionId: prediction.sessionId || null,
    at: new Date().toISOString(),
  };
  const line = JSON.stringify(row) + '\n';
  fs.appendFileSync(path.join(dir, PREDICTIONS_FILE), line, 'utf-8');
  return id;
}

/**
 * Record an outcome for a prior prediction. Can be linked to the
 * prediction either by id (preferred) or by file + time window.
 *
 * @param {object} outcome
 *   - file: string (required)
 *   - outcome: one of the standard outcome labels
 *   - source: where the signal came from (event name, CLI cmd, etc.)
 *   - predictionId: optional id of a specific prediction row
 * @param {object} options
 *   - repoRoot: filesystem root
 */
function recordOutcome(outcome, options = {}) {
  if (!outcome || typeof outcome !== 'object') {
    throw new TypeError('recordOutcome: outcome must be an object');
  }
  if (!outcome.file || typeof outcome.file !== 'string') {
    throw new TypeError('recordOutcome: outcome.file is required');
  }
  if (!outcome.outcome) {
    throw new TypeError('recordOutcome: outcome.outcome label is required');
  }
  const dir = storeDir(options.repoRoot);
  ensureDir(dir);
  const row = {
    predictionId: outcome.predictionId || null,
    file: outcome.file,
    outcome: outcome.outcome,
    source: outcome.source || 'manual',
    at: new Date().toISOString(),
  };
  fs.appendFileSync(path.join(dir, OUTCOMES_FILE), JSON.stringify(row) + '\n', 'utf-8');
}

/**
 * Read all predictions + outcomes and pair them. Returns an array
 * of { prediction, outcomes[] } so the training loop can compute
 * precision/recall at each threshold.
 *
 * Pairing strategy:
 *   1. If the outcome has a predictionId, match by id (strict).
 *   2. Otherwise match by file: every outcome for a file joins to
 *      every prediction for the same file. The training code can
 *      apply a time window if it wants tighter pairing.
 */
function loadPairs(options = {}) {
  const dir = storeDir(options.repoRoot);
  const predPath = path.join(dir, PREDICTIONS_FILE);
  const outPath = path.join(dir, OUTCOMES_FILE);
  const predictions = readLines(predPath);
  const outcomes = readLines(outPath);

  const byId = new Map();
  const byFile = new Map();
  for (const p of predictions) {
    byId.set(p.id, { prediction: p, outcomes: [] });
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push(p);
  }

  for (const o of outcomes) {
    if (o.predictionId && byId.has(o.predictionId)) {
      byId.get(o.predictionId).outcomes.push(o);
      continue;
    }
    // File-based fallback
    const predList = byFile.get(o.file) || [];
    for (const p of predList) {
      if (byId.has(p.id)) byId.get(p.id).outcomes.push(o);
    }
  }

  return Array.from(byId.values());
}

/**
 * Load stats summary: total predictions, total outcomes, paired
 * count, bucket breakdown. Useful for the CLI status command and
 * for deciding whether there's enough data to retune.
 */
function loadStats(options = {}) {
  const pairs = loadPairs(options);
  const withOutcomes = pairs.filter(p => p.outcomes.length > 0);
  const byLevel = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const p of pairs) {
    const lvl = p.prediction.riskLevel;
    if (byLevel[lvl] != null) byLevel[lvl]++;
  }
  return {
    totalPredictions: pairs.length,
    totalPaired: withOutcomes.length,
    unpaired: pairs.length - withOutcomes.length,
    byRiskLevel: byLevel,
    readyForTraining: withOutcomes.length >= 200,
  };
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  const content = fs.readFileSync(file, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); }
    catch { /* skip malformed */ }
  }
  return out;
}

module.exports = {
  recordPrediction,
  recordOutcome,
  loadPairs,
  loadStats,
  storeDir,
};

// ── Atomic self-description (batch-generated) ────────────────────
recordPrediction.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
recordOutcome.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
loadPairs.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
loadStats.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
storeDir.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'odd', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 3, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
