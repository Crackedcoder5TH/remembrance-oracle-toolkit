'use strict';

/**
 * Swarm Self-Refinement Module
 *
 * The swarm turns inward — analyzing its own historical outputs to:
 * 1. Optimize consensus weights based on what actually worked
 * 2. Identify underperforming dimensions and suggest prompt tuning
 * 3. Detect provider-specific patterns (who wins at security? efficiency?)
 * 4. Generate a refinement report the swarm can apply to future runs
 *
 * Oracle decision: EVOLVE from pipe (0.970) + determineRecommendation (0.552)
 */

const { loadHistory } = require('./swarm-history');
const { loadSwarmConfig, saveSwarmConfig } = require('./swarm-config');

/**
 * Analyze swarm history and produce refinement suggestions.
 *
 * @param {string} [rootDir] - Project root
 * @returns {object} Refinement report
 */
function analyzeSwarmPerformance(rootDir) {
  const history = loadHistory(rootDir);
  const runs = history.runs;

  if (runs.length < 3) {
    return {
      sufficient: false,
      runsAnalyzed: runs.length,
      message: `Need at least 3 runs to analyze (have ${runs.length})`,
      suggestions: [],
    };
  }

  const suggestions = [];
  const stats = history.providerStats;

  // 1. Identify consistently winning providers
  const providerWinRates = {};
  for (const [name, s] of Object.entries(stats)) {
    if (s.totalRuns >= 2) {
      providerWinRates[name] = {
        winRate: s.wins / s.totalRuns,
        avgScore: s.avgScore,
        reliability: s.reliability,
        runs: s.totalRuns,
      };
    }
  }

  // 2. Find the best and worst providers
  const sorted = Object.entries(providerWinRates)
    .sort((a, b) => b[1].reliability - a[1].reliability);

  if (sorted.length >= 2) {
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best[1].reliability - worst[1].reliability > 0.15) {
      suggestions.push({
        type: 'weight_adjustment',
        target: 'provider_priority',
        message: `${best[0]} (reliability: ${best[1].reliability}) consistently outperforms ${worst[0]} (${worst[1].reliability}). Consider prioritizing ${best[0]} for critical tasks.`,
        data: { best: best[0], worst: worst[0], gap: best[1].reliability - worst[1].reliability },
      });
    }
  }

  // 3. Analyze agreement trends — are we getting better or worse?
  const recentAgreement = runs.slice(-5).map(r => r.agreement);
  const olderAgreement = runs.slice(0, Math.min(5, runs.length - 5)).map(r => r.agreement);
  const recentAvg = recentAgreement.reduce((s, v) => s + v, 0) / recentAgreement.length;
  const olderAvg = olderAgreement.length > 0
    ? olderAgreement.reduce((s, v) => s + v, 0) / olderAgreement.length
    : recentAvg;

  if (recentAvg < olderAvg - 0.1) {
    suggestions.push({
      type: 'trend_warning',
      target: 'agreement',
      message: `Agreement trending down: ${(olderAvg * 100).toFixed(0)}% → ${(recentAvg * 100).toFixed(0)}%. Agents may be diverging. Consider narrowing dimensions or increasing cross-scoring weight.`,
      data: { recentAvg, olderAvg, delta: recentAvg - olderAvg },
    });
  } else if (recentAvg > olderAvg + 0.05) {
    suggestions.push({
      type: 'trend_positive',
      target: 'agreement',
      message: `Agreement improving: ${(olderAvg * 100).toFixed(0)}% → ${(recentAvg * 100).toFixed(0)}%. The swarm is learning to converge.`,
      data: { recentAvg, olderAvg, delta: recentAvg - olderAvg },
    });
  }

  // 4. Analyze score distribution — are scores clustered or spread?
  const allScores = runs.map(r => r.winnerScore).filter(s => s > 0);
  if (allScores.length >= 3) {
    const mean = allScores.reduce((s, v) => s + v, 0) / allScores.length;
    const variance = allScores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / allScores.length;
    const stddev = Math.sqrt(variance);

    if (stddev > 0.15) {
      suggestions.push({
        type: 'weight_adjustment',
        target: 'scoring_weights',
        message: `Score variance is high (stddev: ${stddev.toFixed(3)}). Consider increasing coherency weight to stabilize results.`,
        data: { mean, stddev, variance },
      });
    }
  }

  // 5. Check for user feedback patterns
  const approvedRuns = runs.filter(r => r.userApproved === true);
  const rejectedRuns = runs.filter(r => r.userApproved === false);
  if (rejectedRuns.length > approvedRuns.length && rejectedRuns.length >= 2) {
    suggestions.push({
      type: 'quality_alert',
      target: 'overall',
      message: `More rejections (${rejectedRuns.length}) than approvals (${approvedRuns.length}). The swarm may need deeper mode or stricter coherence thresholds.`,
      data: { approved: approvedRuns.length, rejected: rejectedRuns.length },
    });
  }

  return {
    sufficient: true,
    runsAnalyzed: runs.length,
    providerStats: providerWinRates,
    recentAgreement: Math.round(recentAvg * 1000) / 1000,
    suggestions,
  };
}

/**
 * Compute optimized consensus weights based on history.
 * Uses empirical data: if peer scoring correlates with user approval, boost it.
 *
 * @param {string} [rootDir] - Project root
 * @returns {object} { weights, reasoning, applied }
 */
function suggestOptimalWeights(rootDir) {
  const history = loadHistory(rootDir);
  const runs = history.runs;

  // Default weights
  const currentConfig = loadSwarmConfig(rootDir);
  const current = currentConfig.weights;

  if (runs.length < 5) {
    return {
      weights: current,
      reasoning: 'Insufficient data — using current weights',
      applied: false,
    };
  }

  // Analyze which scoring component correlated with user-approved runs
  const approvedScores = runs.filter(r => r.userApproved === true).map(r => r.winnerScore);
  const rejectedScores = runs.filter(r => r.userApproved === false).map(r => r.winnerScore);

  let coherencyBias = 0;
  if (approvedScores.length > 0 && rejectedScores.length > 0) {
    const avgApproved = approvedScores.reduce((s, v) => s + v, 0) / approvedScores.length;
    const avgRejected = rejectedScores.reduce((s, v) => s + v, 0) / rejectedScores.length;
    // If approved runs had much higher scores, coherency is doing its job
    coherencyBias = Math.max(0, Math.min(0.1, (avgApproved - avgRejected) * 0.2));
  }

  // Analyze agreement vs user satisfaction
  const highAgreementApproved = runs.filter(r => r.agreement >= 0.7 && r.userApproved === true).length;
  const highAgreementRejected = runs.filter(r => r.agreement >= 0.7 && r.userApproved === false).length;
  let peerBias = 0;
  if (highAgreementApproved > highAgreementRejected) {
    peerBias = 0.05; // Agreement predicts quality — boost peer weight
  }

  const suggested = {
    coherency: Math.round(Math.min(0.6, Math.max(0.2, current.coherency + coherencyBias)) * 100) / 100,
    selfConfidence: Math.round(Math.min(0.4, Math.max(0.1, current.selfConfidence - coherencyBias * 0.5)) * 100) / 100,
    peerScore: Math.round(Math.min(0.5, Math.max(0.2, current.peerScore + peerBias)) * 100) / 100,
  };

  // Normalize to sum to 1.0
  const sum = suggested.coherency + suggested.selfConfidence + suggested.peerScore;
  suggested.coherency = Math.round((suggested.coherency / sum) * 100) / 100;
  suggested.selfConfidence = Math.round((suggested.selfConfidence / sum) * 100) / 100;
  suggested.peerScore = Math.round(1 - suggested.coherency - suggested.selfConfidence * 100) / 100 || suggested.peerScore;
  // Ensure they sum to 1.0
  suggested.peerScore = Math.round((1 - suggested.coherency - suggested.selfConfidence) * 100) / 100;

  const changed = suggested.coherency !== current.coherency ||
    suggested.selfConfidence !== current.selfConfidence ||
    suggested.peerScore !== current.peerScore;

  return {
    weights: suggested,
    current,
    reasoning: changed
      ? `Adjusted based on ${runs.length} runs: coherencyBias=${coherencyBias.toFixed(3)}, peerBias=${peerBias.toFixed(3)}`
      : 'Current weights are optimal for observed patterns',
    applied: false,
  };
}

/**
 * Apply suggested weights to the swarm config.
 *
 * @param {object} suggested - From suggestOptimalWeights()
 * @param {string} [rootDir] - Project root
 * @returns {object} Updated suggestion with applied=true
 */
function applyWeightSuggestion(suggested, rootDir) {
  const config = loadSwarmConfig(rootDir);
  config.weights = { ...suggested.weights };
  saveSwarmConfig(rootDir, config);
  return { ...suggested, applied: true };
}

/**
 * Run a full self-refinement cycle: analyze + suggest + optionally apply.
 *
 * @param {string} [rootDir] - Project root
 * @param {object} [options] - { autoApply: boolean }
 * @returns {object} { analysis, weightSuggestion }
 */
function selfRefine(rootDir, options = {}) {
  const analysis = analyzeSwarmPerformance(rootDir);
  const weightSuggestion = suggestOptimalWeights(rootDir);

  if (options.autoApply && weightSuggestion.weights !== weightSuggestion.current) {
    applyWeightSuggestion(weightSuggestion, rootDir);
  }

  return { analysis, weightSuggestion };
}

/**
 * Format a refinement report for terminal display.
 *
 * @param {object} report - From selfRefine()
 * @returns {string}
 */
function formatRefinementReport(report) {
  const lines = [];
  lines.push('=== Swarm Self-Refinement Report ===');
  lines.push('');

  const { analysis, weightSuggestion } = report;

  if (!analysis.sufficient) {
    lines.push(analysis.message);
    lines.push('===================================');
    return lines.join('\n');
  }

  lines.push(`Runs analyzed: ${analysis.runsAnalyzed}`);
  lines.push(`Recent agreement: ${(analysis.recentAgreement * 100).toFixed(0)}%`);
  lines.push('');

  if (analysis.suggestions.length === 0) {
    lines.push('No issues detected — the swarm is performing well.');
  } else {
    lines.push(`Suggestions (${analysis.suggestions.length}):`);
    for (const s of analysis.suggestions) {
      const icon = s.type === 'trend_positive' ? '+' : s.type === 'quality_alert' ? '!' : '*';
      lines.push(`  [${icon}] ${s.message}`);
    }
  }

  lines.push('');
  lines.push('Weight suggestion:');
  const w = weightSuggestion.weights;
  lines.push(`  coherency=${w.coherency} self=${w.selfConfidence} peer=${w.peerScore}`);
  lines.push(`  ${weightSuggestion.reasoning}`);
  lines.push(`  Applied: ${weightSuggestion.applied ? 'yes' : 'no'}`);

  lines.push('===================================');
  return lines.join('\n');
}

module.exports = {
  analyzeSwarmPerformance,
  suggestOptimalWeights,
  applyWeightSuggestion,
  selfRefine,
  formatRefinementReport,
};
