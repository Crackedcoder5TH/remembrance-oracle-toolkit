'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Swarm History Module
 *
 * Tracks per-provider performance across swarm runs.
 * After every run, records: provider, score, agreement, win/loss, task type.
 * Over time, builds reliability weights that inform future agent selection.
 *
 * Oracle decision: EVOLVE from existing feedback patterns (ci/feedback.js, core/feedback.js)
 * Evolved to track swarm-specific provider metrics with file-based persistence.
 */

const HISTORY_FILE = 'swarm-history.json';
const MAX_HISTORY_ENTRIES = 500;

/**
 * Load swarm history from .remembrance/swarm-history.json
 *
 * @param {string} [rootDir] - Project root
 * @returns {object} { runs: [], providerStats: {} }
 */
function loadHistory(rootDir) {
  const filePath = path.join(rootDir || '.', '.remembrance', HISTORY_FILE);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    // Corrupted file, start fresh
  }
  return { runs: [], providerStats: {} };
}

/**
 * Save swarm history to .remembrance/swarm-history.json
 *
 * @param {string} [rootDir] - Project root
 * @param {object} history - History object
 */
function saveHistory(rootDir, history) {
  const dir = path.join(rootDir || '.', '.remembrance');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, HISTORY_FILE);

  // Trim to max entries
  if (history.runs.length > MAX_HISTORY_ENTRIES) {
    history.runs = history.runs.slice(-MAX_HISTORY_ENTRIES);
  }

  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

/**
 * Record a swarm run's results into history.
 * Updates both the run log and per-provider aggregate stats.
 *
 * @param {object} result - SwarmResult from swarm()
 * @param {object} [extra] - Extra metadata { userApproved, taskType }
 * @param {string} [rootDir] - Project root
 * @returns {object} Updated history
 */
function recordRun(result, extra = {}, rootDir) {
  const history = loadHistory(rootDir);

  // Build run entry
  const run = {
    id: result.id,
    timestamp: result.timestamp || new Date().toISOString(),
    task: (result.task || '').slice(0, 200),
    winner: result.winner?.agent || null,
    winnerScore: result.winner?.score || 0,
    agreement: result.agreement || 0,
    agentCount: result.agentCount || 0,
    durationMs: result.totalDurationMs || 0,
    rankings: (result.rankings || []).map(r => ({
      agent: r.agent,
      score: r.totalScore,
    })),
    userApproved: extra.userApproved ?? null,
    taskType: extra.taskType || 'code',
  };

  history.runs.push(run);

  // Update per-provider stats
  for (const ranking of run.rankings) {
    const stats = history.providerStats[ranking.agent] || {
      totalRuns: 0,
      wins: 0,
      totalScore: 0,
      avgScore: 0,
      reliability: 0.5,
      lastSeen: null,
    };

    stats.totalRuns++;
    stats.totalScore += ranking.score;
    stats.avgScore = stats.totalScore / stats.totalRuns;
    stats.lastSeen = run.timestamp;

    if (ranking.agent === run.winner) {
      stats.wins++;
    }

    // Reliability = weighted blend of win rate and avg score
    const winRate = stats.wins / stats.totalRuns;
    stats.reliability = Math.round((winRate * 0.4 + stats.avgScore * 0.6) * 1000) / 1000;

    history.providerStats[ranking.agent] = stats;
  }

  // If user explicitly approved/rejected, boost/penalize winner
  if (extra.userApproved !== undefined && run.winner) {
    const winnerStats = history.providerStats[run.winner];
    if (winnerStats) {
      const adjustment = extra.userApproved ? 0.02 : -0.03;
      winnerStats.reliability = Math.max(0, Math.min(1,
        Math.round((winnerStats.reliability + adjustment) * 1000) / 1000
      ));
    }
  }

  saveHistory(rootDir, history);
  return history;
}

/**
 * Record user feedback for a specific swarm run.
 *
 * @param {string} runId - The swarm run ID
 * @param {boolean} approved - Whether the user approved the output
 * @param {string} [rootDir] - Project root
 * @returns {{ found: boolean, provider: string|null }}
 */
function recordFeedback(runId, approved, rootDir) {
  const history = loadHistory(rootDir);
  const run = history.runs.find(r => r.id === runId);
  if (!run) return { found: false, provider: null };

  run.userApproved = approved;

  // Adjust winner reliability
  if (run.winner && history.providerStats[run.winner]) {
    const stats = history.providerStats[run.winner];
    const adjustment = approved ? 0.02 : -0.03;
    stats.reliability = Math.max(0, Math.min(1,
      Math.round((stats.reliability + adjustment) * 1000) / 1000
    ));
  }

  saveHistory(rootDir, history);
  return { found: true, provider: run.winner };
}

/**
 * Get provider reliability scores from history.
 * Returns a Map of provider → reliability (0-1) for use in consensus weighting.
 *
 * @param {string} [rootDir] - Project root
 * @returns {Map<string, number>} Provider reliability scores
 */
function getProviderReliability(rootDir) {
  const history = loadHistory(rootDir);
  const reliability = new Map();

  for (const [provider, stats] of Object.entries(history.providerStats)) {
    reliability.set(provider, stats.reliability);
  }

  return reliability;
}

/**
 * Get a summary of swarm history stats.
 *
 * @param {string} [rootDir] - Project root
 * @returns {object} Summary stats
 */
function getHistorySummary(rootDir) {
  const history = loadHistory(rootDir);

  return {
    totalRuns: history.runs.length,
    providers: Object.entries(history.providerStats).map(([name, stats]) => ({
      name,
      runs: stats.totalRuns,
      wins: stats.wins,
      avgScore: Math.round(stats.avgScore * 1000) / 1000,
      reliability: stats.reliability,
      lastSeen: stats.lastSeen,
    })),
    recentRuns: history.runs.slice(-5).map(r => ({
      id: r.id,
      winner: r.winner,
      score: r.winnerScore,
      agreement: r.agreement,
      approved: r.userApproved,
    })),
  };
}

module.exports = {
  loadHistory,
  saveHistory,
  recordRun,
  recordFeedback,
  getProviderReliability,
  getHistorySummary,
  HISTORY_FILE,
  MAX_HISTORY_ENTRIES,
};
