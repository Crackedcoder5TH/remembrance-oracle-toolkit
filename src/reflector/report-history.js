/**
 * Remembrance Self-Reflector — History Sub-Module
 *
 * Run history and logging functions extracted from report.js Section 1.
 * Uses lazy requires for ./scoring and ./multi to avoid circular deps.
 */

const { readFileSync, appendFileSync, existsSync } = require('fs');
const { join, basename } = require('path');

// ─── Lazy Require Helpers (avoid circular deps with scoring/multi) ───

let _scoringMod;
function _scoring() {
  if (!_scoringMod) _scoringMod = require('./scoring');
  return _scoringMod;
}

let _multiMod;
function _multi() {
  if (!_multiMod) _multiMod = require('./multi');
  return _multiMod;
}

// =====================================================================
// History — Run History & Logging
// =====================================================================

function getHistoryV2Path(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-history-v2.json');
}

function getLogPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector.log');
}

/**
 * Load the v2 history file.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} { runs[], summary }
 */
function loadHistoryV2(rootDir) {
  const { loadJSON } = _scoring();
  return loadJSON(getHistoryV2Path(rootDir), { runs: [], version: 2 });
}

/**
 * Save a run record to the v2 history.
 *
 * @param {string} rootDir - Repository root
 * @param {object} record - Run record to save
 * @param {object} options - { maxRuns }
 * @returns {object} The saved record
 */
function saveRunRecord(rootDir, record, options = {}) {
  const { loadJSON, saveJSON, trimArray } = _scoring();
  const { maxRuns = 100 } = options;
  const history = loadJSON(getHistoryV2Path(rootDir), { runs: [], version: 2 });
  history.runs.push(record);
  trimArray(history.runs, maxRuns);
  saveJSON(getHistoryV2Path(rootDir), history);
  return record;
}

/**
 * Create a structured run record from a reflector report.
 *
 * @param {object} report - Reflector report from reflect()
 * @param {object} preSnapshot - Snapshot taken before healing
 * @param {object} options - { runId, trigger, branch }
 * @returns {object} Structured run record
 */
function createRunRecord(report, preSnapshot, options = {}) {
  const {
    runId = `run-${Date.now()}`,
    trigger = 'manual',
    branch = null,
    durationMs = 0,
  } = options;

  const beforeCoherence = preSnapshot
    ? (preSnapshot.aggregate ? preSnapshot.aggregate.avgCoherence : preSnapshot.avgCoherence || 0)
    : report.snapshot.avgCoherence;

  const afterCoherence = report.snapshot.avgCoherence;

  return {
    id: runId,
    timestamp: new Date().toISOString(),
    trigger,
    branch,
    durationMs,
    coherence: {
      before: Math.round(beforeCoherence * 1000) / 1000,
      after: Math.round(afterCoherence * 1000) / 1000,
      delta: Math.round((afterCoherence - beforeCoherence) * 1000) / 1000,
    },
    dimensions: report.snapshot.dimensionAverages || {},
    healing: {
      filesScanned: report.summary.filesScanned,
      filesBelowThreshold: report.summary.filesBelowThreshold,
      filesHealed: report.summary.filesHealed,
      totalImprovement: report.summary.totalImprovement,
      avgImprovement: report.summary.avgImprovement,
    },
    changes: (report.healings || []).map(h => ({
      path: h.path,
      language: h.language,
      before: h.originalCoherence,
      after: h.healedCoherence,
      improvement: h.improvement,
      strategy: h.healingSummary || 'reflection',
    })),
    whisper: report.collectiveWhisper
      ? (typeof report.collectiveWhisper === 'string' ? report.collectiveWhisper : report.collectiveWhisper.message)
      : '',
    health: report.collectiveWhisper
      ? (typeof report.collectiveWhisper === 'object' ? report.collectiveWhisper.overallHealth : 'unknown')
      : 'unknown',
  };
}

/**
 * Append a log entry to the reflector log file.
 *
 * @param {string} rootDir - Repository root
 * @param {string} level - 'INFO', 'WARN', 'ERROR'
 * @param {string} message - Log message
 * @param {object} [data] - Optional structured data
 */
function appendLog(rootDir, level, message, data) {
  const { ensureDir } = _scoring();
  ensureDir(join(rootDir, '.remembrance'));

  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level}] ${message}`;
  if (data) {
    line += ` | ${JSON.stringify(data)}`;
  }
  line += '\n';

  appendFileSync(getLogPath(rootDir), line, 'utf-8');
}

/**
 * Read the last N lines from the log file.
 *
 * @param {string} rootDir - Repository root
 * @param {number} n - Number of lines to read
 * @returns {string[]} Last N log lines
 */
function readLogTail(rootDir, n = 20) {
  const logPath = getLogPath(rootDir);
  try {
    if (!existsSync(logPath)) return [];
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-n);
  } catch {
    return [];
  }
}

/**
 * Compute statistics from run history.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} Statistics summary
 */
function computeStats(rootDir) {
  const history = loadHistoryV2(rootDir);
  const runs = history.runs;

  if (runs.length === 0) {
    return {
      totalRuns: 0,
      lastRun: null,
      trend: 'unknown',
      avgCoherence: 0,
      avgImprovement: 0,
      totalFilesHealed: 0,
    };
  }

  const coherenceValues = runs.map(r => r.coherence?.after || 0);
  const improvements = runs.map(r => r.healing?.avgImprovement || 0);
  const filesHealed = runs.reduce((s, r) => s + (r.healing?.filesHealed || 0), 0);

  const avgCoherence = coherenceValues.reduce((s, v) => s + v, 0) / coherenceValues.length;
  const avgImprovement = improvements.reduce((s, v) => s + v, 0) / improvements.length;

  let trend = 'stable';
  if (runs.length >= 4) {
    const mid = Math.floor(runs.length / 2);
    const recentAvg = coherenceValues.slice(mid).reduce((s, v) => s + v, 0) / (coherenceValues.length - mid);
    const olderAvg = coherenceValues.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
    if (recentAvg - olderAvg > 0.02) trend = 'improving';
    else if (olderAvg - recentAvg > 0.02) trend = 'declining';
  }

  const sorted = [...runs].sort((a, b) => (b.coherence?.after || 0) - (a.coherence?.after || 0));

  return {
    totalRuns: runs.length,
    lastRun: runs[runs.length - 1],
    firstRun: runs[0],
    trend,
    avgCoherence: Math.round(avgCoherence * 1000) / 1000,
    avgImprovement: Math.round(avgImprovement * 1000) / 1000,
    totalFilesHealed: filesHealed,
    bestRun: sorted[0] ? { id: sorted[0].id, coherence: sorted[0].coherence?.after } : null,
    worstRun: sorted[sorted.length - 1] ? { id: sorted[sorted.length - 1].id, coherence: sorted[sorted.length - 1].coherence?.after } : null,
    recentRuns: runs.slice(-5).reverse().map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      coherence: r.coherence?.after,
      healed: r.healing?.filesHealed || 0,
      health: r.health,
    })),
  };
}

/**
 * Generate an ASCII trend chart of coherence over time.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { width, height, last }
 * @returns {string} ASCII chart
 */
function generateTrendChart(rootDir, options = {}) {
  const { width = 60, height = 15, last = 30 } = options;
  const history = loadHistoryV2(rootDir);
  const runs = history.runs.slice(-last);

  if (runs.length === 0) {
    return 'No run history available. Run the reflector to generate data.';
  }

  const values = runs.map(r => r.coherence?.after || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 0.1;

  const lines = [];
  lines.push('Coherence Trend');
  lines.push('');

  const chartWidth = Math.min(width, values.length);
  const step = values.length > chartWidth ? Math.floor(values.length / chartWidth) : 1;
  const sampled = [];
  for (let i = 0; i < values.length; i += step) {
    sampled.push(values[i]);
  }

  for (let row = height - 1; row >= 0; row--) {
    const threshold = min + (range * row / (height - 1));
    const label = threshold.toFixed(3);
    let line = label.padStart(6) + ' |';

    for (let col = 0; col < sampled.length; col++) {
      const val = sampled[col];
      const normalizedRow = Math.round((val - min) / range * (height - 1));

      if (normalizedRow === row) {
        line += '\u2588';
      } else if (normalizedRow > row) {
        line += '\u2591';
      } else {
        line += ' ';
      }
    }

    lines.push(line);
  }

  lines.push('       +' + '\u2500'.repeat(sampled.length));

  const firstDate = runs[0].timestamp ? runs[0].timestamp.slice(0, 10) : '?';
  const lastDate = runs[runs.length - 1].timestamp ? runs[runs.length - 1].timestamp.slice(0, 10) : '?';
  const axisLabel = `        ${firstDate}${' '.repeat(Math.max(0, sampled.length - 20))}${lastDate}`;
  lines.push(axisLabel);

  lines.push('');
  lines.push(`Runs: ${values.length} | Avg: ${(values.reduce((s, v) => s + v, 0) / values.length).toFixed(3)} | Min: ${min.toFixed(3)} | Max: ${max.toFixed(3)}`);

  if (values.length >= 2) {
    const recent = values[values.length - 1];
    const previous = values[values.length - 2];
    const delta = recent - previous;
    const arrow = delta > 0.01 ? '\u25B2' : delta < -0.01 ? '\u25BC' : '\u25C6';
    lines.push(`Trend: ${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`);
  }

  return lines.join('\n');
}

/**
 * Generate a timeline view of recent runs.
 *
 * @param {string} rootDir - Repository root
 * @param {number} count - Number of runs to show
 * @returns {string} Formatted timeline
 */
function generateTimeline(rootDir, count = 10) {
  const history = loadHistoryV2(rootDir);
  const runs = history.runs.slice(-count).reverse();

  if (runs.length === 0) {
    return 'No run history available.';
  }

  const lines = [];
  lines.push('Run Timeline');
  lines.push('');

  for (const run of runs) {
    const date = run.timestamp ? run.timestamp.slice(0, 19).replace('T', ' ') : '?';
    const coh = run.coherence ? `${run.coherence.before.toFixed(3)} -> ${run.coherence.after.toFixed(3)}` : '?';
    const delta = run.coherence ? (run.coherence.delta >= 0 ? '+' : '') + run.coherence.delta.toFixed(3) : '';
    const healed = run.healing ? run.healing.filesHealed : 0;
    const health = run.health || 'unknown';

    lines.push(`  ${date}  [${run.id}]`);
    lines.push(`    Coherence: ${coh} (${delta})`);
    lines.push(`    Healed: ${healed} file(s) | Health: ${health}`);
    if (run.whisper) {
      lines.push(`    Whisper: "${run.whisper}"`);
    }
    if (run.changes && run.changes.length > 0) {
      for (const ch of run.changes.slice(0, 3)) {
        lines.push(`      ${ch.path}: ${ch.before.toFixed(3)} -> ${ch.after.toFixed(3)} (+${ch.improvement.toFixed(3)})`);
      }
      if (run.changes.length > 3) {
        lines.push(`      ... and ${run.changes.length - 3} more`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  getHistoryV2Path,
  getLogPath,
  loadHistoryV2,
  saveRunRecord,
  createRunRecord,
  appendLog,
  readLogTail,
  computeStats,
  generateTrendChart,
  generateTimeline,
};
