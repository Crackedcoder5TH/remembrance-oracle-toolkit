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
const { ensureDir, loadJSON, saveJSON, trimArray } = require('./utils');
const { toEngineConfig } = require('./config');
const { resolveConfig } = require('./modes');
const { saveRunRecord, createRunRecord } = require('./history');
const { safeReflect } = require('./safety');

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
 * Also inherits from central config if available.
 */
function loadConfig(rootDir) {
  // Layer 1: Resolved config (central + mode + env overrides)
  let centralOverrides = {};
  try {
    const central = resolveConfig(rootDir, { env: process.env });
    const flat = toEngineConfig(central);
    centralOverrides = {
      minCoherence: flat.minCoherence,
      autoMergeThreshold: flat.autoMergeThreshold,
      push: flat.push,
      openPR: flat.openPR,
      autoMerge: flat.autoMerge,
      maxFilesPerRun: flat.maxFilesPerRun,
    };
  } catch {
    // Config not available, use schedule defaults
  }

  // Layer 2: Schedule-specific config (from reflector-config.json)
  const scheduleOverrides = loadJSON(getConfigPath(rootDir), {});

  return { ...DEFAULT_SCHEDULE_CONFIG, ...centralOverrides, ...scheduleOverrides };
}

/**
 * Save reflector configuration.
 */
function saveConfig(rootDir, config) {
  return saveJSON(getConfigPath(rootDir), config);
}

// ─── Run History ───

/**
 * Load run history from .remembrance/reflector-history.json
 */
function loadHistory(rootDir) {
  return loadJSON(getHistoryPath(rootDir), { runs: [] });
}

/**
 * Append a run record to history.
 */
function recordRun(rootDir, record) {
  const history = loadHistory(rootDir);
  history.runs.push(record);

  const config = loadConfig(rootDir);
  trimArray(history.runs, config.maxRunHistory);
  saveJSON(getHistoryPath(rootDir), history);
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

  // Run the reflector with safety protections (backup, approval, coherence guard)
  let safeResult;
  try {
    safeResult = safeReflect(rootDir, {
      ...config,
      dryRunMode: config.dryRun || false,
      requireApproval: config.requireApproval || false,
      autoRollback: config.autoRollback !== false,
    });
  } catch (err) {
    runRecord.error = err.message;
    runRecord.finishedAt = new Date().toISOString();
    runRecord.durationMs = Date.now() - startTime;
    recordRun(rootDir, runRecord);
    return runRecord;
  }

  const report = safeResult.report || {};
  runRecord.report = {
    filesScanned: report.filesScanned || 0,
    filesBelowThreshold: report.filesBelowThreshold || 0,
    filesHealed: report.filesHealed || 0,
    avgImprovement: report.avgImprovement || 0,
    autoMergeRecommended: report.autoMergeRecommended || false,
    collectiveWhisper: report.collectiveWhisper || '',
  };
  runRecord.safety = safeResult.safety || {};

  // Save full report to disk
  try {
    const reportPath = getReportPath(rootDir);
    saveJSON(reportPath, safeResult);
    runRecord.reportPath = reportPath;
  } catch {
    // Best effort
  }

  // Create healing branch if there are changes and not auto-rolled-back
  const healedFiles = safeResult.healedFiles || [];
  if (healedFiles.length > 0 && !safeResult.safety?.autoRolledBack) {
    // Build a report-like object for createHealingBranch
    const branchReport = {
      rootDir,
      healedFiles,
      collectiveWhisper: { message: report.collectiveWhisper || '' },
      summary: {
        avgImprovement: report.avgImprovement || 0,
        autoMergeRecommended: report.autoMergeRecommended || false,
      },
      snapshot: { totalFiles: report.filesScanned || 0, avgCoherence: 0, minCoherence: 0, maxCoherence: 0 },
    };

    try {
      const branchResult = createHealingBranch(branchReport, {
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

  // Also save to v2 history for trend tracking
  try {
    const v2Record = {
      id: runRecord.id,
      timestamp: runRecord.startedAt,
      trigger: 'scheduled',
      branch: runRecord.branch || null,
      durationMs: runRecord.durationMs,
      coherence: {
        before: safeResult.safety?.preCoherence || 0,
        after: (safeResult.safety?.preCoherence || 0) + (report.avgImprovement || 0),
        delta: report.avgImprovement || 0,
      },
      healing: {
        filesScanned: report.filesScanned || 0,
        filesBelowThreshold: report.filesBelowThreshold || 0,
        filesHealed: report.filesHealed || 0,
        totalImprovement: report.totalImprovement || 0,
        avgImprovement: report.avgImprovement || 0,
      },
      changes: [],
      whisper: report.collectiveWhisper || '',
      health: 'unknown',
    };
    saveRunRecord(rootDir, v2Record, { maxRuns: config.maxRunHistory || 50 });
  } catch {
    // Best effort — v2 history write is supplementary
  }

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
