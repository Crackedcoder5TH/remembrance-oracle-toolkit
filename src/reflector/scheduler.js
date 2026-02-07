/**
 * Remembrance Self-Reflector — Scheduler
 *
 * Provides scheduling capabilities for the self-reflector:
 * 1. Cron-based interval scheduling (runs every N hours)
 * 2. On-demand trigger (manual or webhook-driven)
 * 3. Configuration management (persist schedule settings)
 * 4. Run history tracking
 *
 * Uses only Node.js built-ins — no external cron libraries needed.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join } = require('path');
const { reflect, formatReport } = require('./engine');
const { createHealingBranch, findExistingReflectorPR } = require('./github');

// ─── Configuration ───

const DEFAULT_SCHEDULE_CONFIG = {
  enabled: true,
  intervalHours: 6,           // Run every 6 hours
  minCoherence: 0.7,          // Healing threshold
  autoMerge: false,            // Auto-merge high-coherence PRs
  autoMergeThreshold: 0.9,    // Min coherence for auto-merge
  push: false,                 // Push healing branch to remote
  openPR: false,               // Open PR with healing
  maxFilesPerRun: 50,          // Safety limit
  skipIfPROpen: true,          // Skip if there's already an open reflector PR
  maxRunHistory: 50,           // Keep last 50 run records
};

// ─── Config Persistence ───

function getConfigPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-config.json');
}

function getHistoryPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-history.json');
}

function getReportPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-report.json');
}

/**
 * Load reflector configuration from .remembrance/reflector-config.json
 */
function loadConfig(rootDir) {
  const configPath = getConfigPath(rootDir);
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_SCHEDULE_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_SCHEDULE_CONFIG };
}

/**
 * Save reflector configuration.
 */
function saveConfig(rootDir, config) {
  const configPath = getConfigPath(rootDir);
  const dir = join(rootDir, '.remembrance');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

// ─── Run History ───

/**
 * Load run history from .remembrance/reflector-history.json
 */
function loadHistory(rootDir) {
  const historyPath = getHistoryPath(rootDir);
  try {
    if (existsSync(historyPath)) {
      return JSON.parse(readFileSync(historyPath, 'utf-8'));
    }
  } catch {
    // Fall through
  }
  return { runs: [] };
}

/**
 * Append a run record to history.
 */
function recordRun(rootDir, record) {
  const history = loadHistory(rootDir);
  history.runs.push(record);

  // Trim to maxRunHistory
  const config = loadConfig(rootDir);
  while (history.runs.length > config.maxRunHistory) {
    history.runs.shift();
  }

  const historyPath = getHistoryPath(rootDir);
  const dir = join(rootDir, '.remembrance');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  return record;
}

// ─── Scheduled Execution ───

/**
 * Run a single reflector cycle.
 * This is the main entry point for both scheduled and manual runs.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - Override config values for this run
 * @returns {object} Run result with report, branch info, timing
 */
function runReflector(rootDir, options = {}) {
  const config = { ...loadConfig(rootDir), ...options };
  const startTime = Date.now();

  const runRecord = {
    id: `run-${Date.now()}`,
    startedAt: new Date().toISOString(),
    config: {
      minCoherence: config.minCoherence,
      push: config.push,
      openPR: config.openPR,
      autoMerge: config.autoMerge,
    },
  };

  // Check for existing open PR if skipIfPROpen is set
  if (config.skipIfPROpen && config.openPR) {
    const existingPR = findExistingReflectorPR(rootDir);
    if (existingPR) {
      runRecord.skipped = true;
      runRecord.reason = `Existing reflector PR open: #${existingPR.number}`;
      runRecord.existingPR = existingPR;
      runRecord.finishedAt = new Date().toISOString();
      runRecord.durationMs = Date.now() - startTime;
      recordRun(rootDir, runRecord);
      return runRecord;
    }
  }

  // Run the reflector engine
  let report;
  try {
    report = reflect(rootDir, config);
  } catch (err) {
    runRecord.error = err.message;
    runRecord.finishedAt = new Date().toISOString();
    runRecord.durationMs = Date.now() - startTime;
    recordRun(rootDir, runRecord);
    return runRecord;
  }

  runRecord.report = {
    filesScanned: report.summary.filesScanned,
    filesBelowThreshold: report.summary.filesBelowThreshold,
    filesHealed: report.summary.filesHealed,
    avgImprovement: report.summary.avgImprovement,
    autoMergeRecommended: report.summary.autoMergeRecommended,
    collectiveWhisper: report.collectiveWhisper.message,
  };

  // Save full report to disk
  try {
    const reportPath = getReportPath(rootDir);
    const dir = join(rootDir, '.remembrance');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    runRecord.reportPath = reportPath;
  } catch {
    // Best effort
  }

  // Create healing branch if there are changes
  if (report.healedFiles && report.healedFiles.length > 0) {
    try {
      const branchResult = createHealingBranch(report, {
        push: config.push,
        openPR: config.openPR,
        autoMerge: config.autoMerge,
        cwd: rootDir,
      });
      runRecord.branch = branchResult.branch;
      runRecord.commits = branchResult.commits;
      runRecord.prUrl = branchResult.prUrl;
      runRecord.prNumber = branchResult.prNumber;
      runRecord.filesChanged = branchResult.files;
    } catch (err) {
      runRecord.branchError = err.message;
    }
  }

  runRecord.finishedAt = new Date().toISOString();
  runRecord.durationMs = Date.now() - startTime;
  recordRun(rootDir, runRecord);

  return runRecord;
}

// ─── Interval Scheduler ───

/**
 * Start the reflector on an interval timer.
 * Returns a controller object with stop() method.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - Override config values
 * @returns {object} { stop, isRunning, lastRun, nextRun }
 */
function startScheduler(rootDir, options = {}) {
  const config = { ...loadConfig(rootDir), ...options };
  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  let timer = null;
  let running = false;
  let lastRun = null;

  const controller = {
    get isRunning() { return running; },
    get lastRun() { return lastRun; },
    get nextRun() {
      if (!timer || !lastRun) return null;
      return new Date(new Date(lastRun.startedAt).getTime() + intervalMs).toISOString();
    },

    async runOnce() {
      if (running) return lastRun;
      running = true;
      try {
        lastRun = runReflector(rootDir, config);
        return lastRun;
      } finally {
        running = false;
      }
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };

  // Run immediately, then on interval
  controller.runOnce();

  timer = setInterval(() => {
    controller.runOnce();
  }, intervalMs);

  // Don't keep the process alive just for the timer
  if (timer.unref) timer.unref();

  return controller;
}

// ─── Cron Expression Parser (minimal) ───

/**
 * Parse a simple cron interval into hours.
 * Supports: "every 6 hours", "every 12h", "hourly", "daily"
 *
 * @param {string} expression - Human-readable interval
 * @returns {number} Interval in hours
 */
function parseCronInterval(expression) {
  const lower = expression.toLowerCase().trim();

  if (lower === 'hourly' || lower === 'every hour') return 1;
  if (lower === 'daily' || lower === 'every day') return 24;
  if (lower === 'weekly') return 168;

  const hourMatch = lower.match(/every\s+(\d+)\s*h(?:ours?)?/);
  if (hourMatch) return parseInt(hourMatch[1]);

  const minMatch = lower.match(/every\s+(\d+)\s*m(?:inutes?)?/);
  if (minMatch) return parseInt(minMatch[1]) / 60;

  // Default to 6 hours
  return 6;
}

// ─── Status ───

/**
 * Get the current reflector status.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} { config, lastRun, history }
 */
function getStatus(rootDir) {
  const config = loadConfig(rootDir);
  const history = loadHistory(rootDir);
  const lastRun = history.runs.length > 0 ? history.runs[history.runs.length - 1] : null;

  return {
    config,
    lastRun,
    totalRuns: history.runs.length,
    recentRuns: history.runs.slice(-5).reverse(),
  };
}

module.exports = {
  DEFAULT_SCHEDULE_CONFIG,
  loadConfig,
  saveConfig,
  loadHistory,
  recordRun,
  runReflector,
  startScheduler,
  parseCronInterval,
  getStatus,
  getConfigPath,
  getHistoryPath,
  getReportPath,
};
