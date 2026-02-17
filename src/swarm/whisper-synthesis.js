'use strict';

/**
 * Whisper Synthesis Module
 *
 * Synthesizes a collective whisper from all swarm agent perspectives.
 * The whisper is the swarm's unified voice — a narrative that captures
 * agreement, dissent, and the reasoning behind the final choice.
 */

/**
 * Synthesize the collective whisper from swarm results.
 *
 * @param {object} consensus - From buildConsensus()
 * @param {object[]} agentOutputs - All agent outputs with their dimensions
 * @param {string} task - The original task description
 * @returns {object} { message, dimensions, agreement, dissent, recommendation }
 */
function synthesizeWhisper(consensus, agentOutputs, task) {
  if (!consensus.winner) {
    return {
      message: 'The swarm could not reach consensus. No agent produced valid code for this task.',
      dimensions: {},
      agreement: 0,
      dissent: [],
      recommendation: 'GENERATE',
    };
  }

  const { winner, rankings, agreement, dissent } = consensus;

  // Gather dimension-specific insights from specialists
  const dimensionInsights = {};
  for (const output of agentOutputs) {
    if (!output.dimensions) continue;
    for (const dim of output.dimensions) {
      if (dim === 'generalist') continue;
      dimensionInsights[dim] = {
        agent: output.agent,
        confidence: output.confidence || 0.5,
        insight: output.explanation?.slice(0, 200) || '',
      };
    }
  }

  // Build the narrative
  const message = buildNarrative(winner, rankings, agreement, dissent, task);

  // Determine recommendation
  const recommendation = determineRecommendation(winner.score, agreement);

  return {
    message,
    dimensions: dimensionInsights,
    agreement,
    dissent: dissent.map(d => `${d.agent}: ${d.reasoning.slice(0, 100)}`),
    recommendation,
    winner: {
      agent: winner.agent,
      score: winner.score,
      dimensions: winner.dimensions,
    },
  };
}

/**
 * Build a human-readable narrative from swarm results.
 */
function buildNarrative(winner, rankings, agreement, dissent, task) {
  const lines = [];

  // Opening
  lines.push(`The swarm deliberated on: "${truncate(task, 80)}"`);
  lines.push('');

  // Winner announcement
  const agentCount = rankings.length;
  if (agreement >= 0.8) {
    lines.push(`Strong consensus (${(agreement * 100).toFixed(0)}%) among ${agentCount} agents.`);
    lines.push(`${winner.agent} produced the winning solution (score: ${winner.score.toFixed(3)}).`);
  } else if (agreement >= 0.5) {
    lines.push(`Moderate consensus (${(agreement * 100).toFixed(0)}%) among ${agentCount} agents.`);
    lines.push(`${winner.agent} leads with score ${winner.score.toFixed(3)}, but alternatives exist.`);
  } else {
    lines.push(`Weak consensus (${(agreement * 100).toFixed(0)}%) — the swarm is divided.`);
    lines.push(`${winner.agent} edges ahead at ${winner.score.toFixed(3)}, but review alternatives carefully.`);
  }

  // Score breakdown
  lines.push('');
  lines.push('Score breakdown:');
  const b = winner.breakdown;
  lines.push(`  Coherency: ${b.coherency.toFixed(3)} | Self-confidence: ${b.selfConfidence.toFixed(3)} | Peer score: ${b.peerScore.toFixed(3)}`);

  // Ranking summary
  if (rankings.length > 1) {
    lines.push('');
    lines.push('Full ranking:');
    for (let i = 0; i < Math.min(rankings.length, 5); i++) {
      const r = rankings[i];
      const marker = i === 0 ? ' (winner)' : '';
      lines.push(`  ${i + 1}. ${r.agent} — ${r.totalScore.toFixed(3)}${marker}`);
    }
  }

  // Dissent
  if (dissent.length > 0) {
    lines.push('');
    lines.push('Dissenting voices:');
    for (const d of dissent.slice(0, 3)) {
      lines.push(`  ${d.agent} (${d.totalScore.toFixed(3)}): ${truncate(d.reasoning, 80)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Determine PULL/EVOLVE/GENERATE recommendation based on swarm results.
 */
function determineRecommendation(winnerScore, agreement) {
  if (winnerScore >= 0.8 && agreement >= 0.7) return 'PULL';
  if (winnerScore >= 0.6) return 'EVOLVE';
  return 'GENERATE';
}

/**
 * Truncate a string to a max length with ellipsis.
 */
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

/**
 * Format a whisper for terminal display.
 *
 * @param {object} whisper - From synthesizeWhisper()
 * @returns {string} Formatted text
 */
function formatWhisper(whisper) {
  const lines = [];
  lines.push('=== Swarm Whisper ===');
  lines.push('');
  lines.push(whisper.message);

  if (Object.keys(whisper.dimensions).length > 0) {
    lines.push('');
    lines.push('Dimension insights:');
    for (const [dim, info] of Object.entries(whisper.dimensions)) {
      lines.push(`  ${dim}: ${info.agent} (confidence: ${info.confidence.toFixed(2)}) — ${truncate(info.insight, 60)}`);
    }
  }

  lines.push('');
  lines.push(`Recommendation: ${whisper.recommendation}`);
  lines.push('===================');

  return lines.join('\n');
}

module.exports = {
  synthesizeWhisper,
  formatWhisper,
  determineRecommendation,
};
