'use strict';

/**
 * Rich summary aggregator for `oracle audit summary`.
 *
 * The old summary was literally
 *
 *   Static Checks: 0
 *   Cascades:      0
 *
 * Which is a count, not a summary. The new version pulls from every
 * datapoint the audit subsystem has:
 *
 *   - Current findings by bug class, severity, and rule
 *   - Delta against the baseline (new / fixed / persisted)
 *   - Files that regressed (more findings than baseline)
 *   - Files that improved (fewer findings than baseline)
 *   - Healing success rate (from the healing lineage if available)
 *   - Feedback calibration state (which rules have been downgraded)
 *   - Top bug classes this run
 *   - Files with the most findings
 *   - Trending: finding delta over the last N runs (if a history file exists)
 *
 * Output is a structured object; rendering is the CLI's job.
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = 'audit-history.json';
const HISTORY_MAX = 30; // keep last 30 runs

function resolveHistoryPath(repoRoot) {
  const dirs = ['.remembrance', '.oracle'];
  for (const d of dirs) {
    const candidate = path.join(repoRoot, d, HISTORY_FILE);
    if (fs.existsSync(candidate)) return candidate;
    if (fs.existsSync(path.join(repoRoot, d))) return candidate;
  }
  return path.join(repoRoot, dirs[0], HISTORY_FILE);
}

function loadHistory(repoRoot) {
  const p = resolveHistoryPath(repoRoot);
  if (!fs.existsSync(p)) return { runs: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (!raw || typeof raw !== 'object') return { runs: [] };
    raw.runs = raw.runs || [];
    return raw;
  } catch { return { runs: [] }; }
}

function saveHistory(history, repoRoot) {
  const p = resolveHistoryPath(repoRoot);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Trim to HISTORY_MAX
  history.runs = (history.runs || []).slice(-HISTORY_MAX);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(history, null, 2));
  fs.renameSync(tmp, p);
}

/**
 * Build a rich summary object.
 *
 * @param {object} input
 * @param {Array} input.findings - flat list of current findings (each has a `file` field)
 * @param {object} [input.diff] - baseline diff (result of diffAgainstBaseline)
 * @param {object} [input.calibration] - calibration summary (from feedback.summarizeStore)
 * @param {object} [input.healing] - { attempts, succeeded, lineage }
 * @param {object} [input.history] - loaded history { runs }
 * @param {Array}  [input.smellFindings]
 * @param {Array}  [input.lintFindings]
 * @param {Array}  [input.priorFindings]
 * @returns {object} structured summary
 */
function buildSummary(input) {
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const diff = input.diff || { new: [], fixed: [], persisted: [], regressedFiles: [], improvedFiles: [] };
  const calibration = input.calibration || { rules: [] };
  const healing = input.healing || null;
  const smellFindings = input.smellFindings || [];
  const lintFindings = input.lintFindings || [];
  const priorFindings = input.priorFindings || [];
  const history = input.history || { runs: [] };

  const byClass = {};
  const bySeverity = {};
  const byRule = {};
  const byFile = {};
  for (const f of findings) {
    byClass[f.bugClass] = (byClass[f.bugClass] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    if (f.ruleId) byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
    if (f.file) byFile[f.file] = (byFile[f.file] || 0) + 1;
  }

  const topBugClasses = Object.entries(byClass)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cls, count]) => ({ cls, count }));

  const topRules = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({ rule, count }));

  const worstFiles = Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  // Healing rate
  let healingRate = null;
  if (healing && typeof healing.attempts === 'number' && healing.attempts > 0) {
    healingRate = healing.succeeded / healing.attempts;
  }

  // Trending: compare totals over recent runs
  const trend = computeTrend(history, findings.length);

  // Calibration: how many rules are currently downgraded
  const downgradedRules = (calibration.rules || []).filter(r => r.confidence != null && r.confidence < 0.7);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      findings: findings.length,
      bugs: findings.filter(f => !isStyle(f) && !isSmell(f)).length,
      styleHints: lintFindings.length,
      smells: smellFindings.length,
      priorRisks: priorFindings.length,
    },
    breakdown: {
      byClass,
      bySeverity,
      topBugClasses,
      topRules,
    },
    baseline: {
      hasBaseline: Array.isArray(diff.persisted),
      newSinceBaseline: diff.new.length,
      fixedSinceBaseline: diff.fixed.length,
      persistedFromBaseline: diff.persisted.length,
      regressedFiles: diff.regressedFiles,
      improvedFiles: diff.improvedFiles,
    },
    worstFiles,
    healing: healingRate == null ? null : {
      attempts: healing.attempts,
      succeeded: healing.succeeded,
      successRate: healingRate,
    },
    calibration: {
      knownRules: (calibration.rules || []).length,
      downgradedRules: downgradedRules.map(r => ({ ruleId: r.ruleId, confidence: r.confidence })),
    },
    trend,
  };
}

function isStyle(f) { return (f.ruleId || '').startsWith('lint/'); }
function isSmell(f) { return (f.ruleId || '').startsWith('smell/'); }

function computeTrend(history, currentTotal) {
  const runs = (history.runs || []).slice(-10);
  if (runs.length === 0) return { direction: 'flat', delta: 0, recent: [] };
  const prev = runs[runs.length - 1]?.total ?? currentTotal;
  const delta = currentTotal - prev;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return {
    direction,
    delta,
    recent: runs.map(r => ({ at: r.at, total: r.total })),
  };
}

/**
 * Append this run to history.
 */
function recordRun(repoRoot, findings) {
  const history = loadHistory(repoRoot);
  history.runs = history.runs || [];
  history.runs.push({
    at: new Date().toISOString(),
    total: findings.length,
  });
  saveHistory(history, repoRoot);
}

module.exports = {
  buildSummary,
  loadHistory,
  saveHistory,
  recordRun,
  resolveHistoryPath,
};
