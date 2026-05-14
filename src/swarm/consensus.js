'use strict';

/**
 * Consensus Module
 *
 * Combines coherency scores, self-confidence, and peer scores into
 * a final ranking with weighted aggregation. Detects agreement level
 * and surfaces dissenting opinions.
 */

/**
 * Build consensus from multi-source scores.
 *
 * Scoring formula:
 *   totalScore = (coherencyScore × w.coherency) + (selfConfidence × w.selfConfidence) + (peerScore × w.peerScore)
 *
 * @param {object[]} agentOutputs - Array of { agent, code, confidence, dimensions, explanation }
 * @param {Map<string, object>} coherencyScores - From scoreWithCoherency(): agent → { total }
 * @param {Map<string, number>} peerScores - From computePeerScores(): agent → avgPeerScore
 * @param {object} config - Swarm config (needs config.weights and config.consensusThreshold)
 * @returns {object} { winner, rankings, agreement, dissent }
 */
function buildConsensus(agentOutputs, coherencyScores, peerScores, config) {
  const weights = config.weights || { coherency: 0.4, selfConfidence: 0.2, peerScore: 0.4 };
  const threshold = config.consensusThreshold ?? 0.7;

  // Build rankings
  const rankings = agentOutputs
    .filter(o => o.code) // Only rank agents that produced code
    .map(output => {
      const coherency = coherencyScores.get(output.agent)?.total ?? 0;
      const self = output.confidence || 0.5;
      const peer = peerScores.get(output.agent) || 0.5;

      const totalScore =
        (coherency * weights.coherency) +
        (self * weights.selfConfidence) +
        (peer * weights.peerScore);

      const __retVal = {
        agent: output.agent,
        totalScore: Math.round(totalScore * 1000) / 1000,
        breakdown: {
          coherency: Math.round(coherency * 1000) / 1000,
          selfConfidence: Math.round(self * 1000) / 1000,
          peerScore: Math.round(peer * 1000) / 1000,
        },
        code: output.code,
        explanation: output.explanation,
        dimensions: output.dimensions,
      };
      // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.coherency || 0)), source: 'oracle:consensus:buildConsensus' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
      return __retVal;
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  if (rankings.length === 0) {
    return {
      winner: null,
      rankings: [],
      agreement: 0,
      dissent: [],
    };
  }

  const winner = rankings[0];

  // Agreement: how many non-winner agents are within threshold of the winner
  const others = rankings.filter(r => r.agent !== winner.agent);
  const agreeing = others.filter(
    r => r.totalScore >= winner.totalScore * threshold
  );
  const agreement = others.length > 0
    ? Math.round((agreeing.length / others.length) * 1000) / 1000
    : 1.0; // Single agent = trivial consensus (no disagreement possible)

  // Dissent: agents significantly below the winner
  const dissent = rankings
    .filter(r => r.agent !== winner.agent && r.totalScore < winner.totalScore * 0.7)
    .map(r => ({
      agent: r.agent,
      totalScore: r.totalScore,
      reasoning: r.explanation || 'No explanation provided',
    }));

  return {
    winner: {
      agent: winner.agent,
      code: winner.code,
      score: winner.totalScore,
      breakdown: winner.breakdown,
      dimensions: winner.dimensions,
      explanation: winner.explanation,
    },
    rankings,
    agreement,
    dissent,
  };
}

/**
 * Quick consensus without peer scoring — uses only coherency + self-confidence.
 * Faster because it skips the cross-scoring API calls.
 *
 * @param {object[]} agentOutputs - Array of { agent, code, confidence }
 * @param {Map<string, object>} coherencyScores - From scoreWithCoherency()
 * @param {object} config - Swarm config
 * @returns {object} Same shape as buildConsensus()
 */
function quickConsensus(agentOutputs, coherencyScores, config) {
  // Use equal weight split between coherency and self-confidence
  const peerScores = new Map();
  for (const output of agentOutputs) {
    peerScores.set(output.agent, 0.5); // Neutral peer score
  }
  const adjustedConfig = {
    ...config,
    weights: { coherency: 0.6, selfConfidence: 0.4, peerScore: 0 },
  };
  return buildConsensus(agentOutputs, coherencyScores, peerScores, adjustedConfig);
}

/**
 * Merge code from top N agents when consensus is strong.
 * Takes the winner's code but appends notable improvements from runners-up.
 *
 * @param {object} consensus - Result from buildConsensus()
 * @param {number} [topN=3] - How many top agents to consider
 * @returns {object} { mergedCode, sources, strategy }
 */
function mergeTopOutputs(consensus, topN = 3) {
  if (!consensus.winner) {
    return { mergedCode: '', sources: [], strategy: 'none' };
  }

  const top = consensus.rankings.slice(0, topN);

  // If strong agreement (>0.8), just use the winner
  if (consensus.agreement >= 0.8 || top.length <= 1) {
    return {
      mergedCode: consensus.winner.code,
      sources: [consensus.winner.agent],
      strategy: 'winner-takes-all',
    };
  }

  // Otherwise, flag that manual review of alternatives is recommended
  return {
    mergedCode: consensus.winner.code,
    sources: top.map(r => r.agent),
    strategy: 'winner-with-alternatives',
    alternatives: top.slice(1).map(r => ({
      agent: r.agent,
      score: r.totalScore,
      code: r.code,
      explanation: r.explanation,
    })),
  };
}

module.exports = {
  buildConsensus,
  quickConsensus,
  mergeTopOutputs,
};
