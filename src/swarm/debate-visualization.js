'use strict';

/**
 * Swarm Debate Visualization Module
 *
 * Transforms SwarmResult into visualization data structures:
 * 1. Score matrix — heatmap of agent scores across dimensions
 * 2. Voting graph — who scored whom how (directed weighted graph)
 * 3. Consensus tree — hierarchy from winner → allies → dissenters
 * 4. Timeline — when each agent responded, scored, voted
 * 5. Terminal-renderable ASCII visualization
 *
 * Oracle decision: EVOLVE from pipe (0.970) for data transforms.
 */

/**
 * Build a score matrix from rankings for heatmap visualization.
 *
 * @param {object[]} rankings - From consensus.rankings
 * @param {object[]} agentOutputs - Agent outputs with dimensions
 * @returns {object} { agents, dimensions, matrix, legend }
 */
function buildScoreMatrix(rankings, agentOutputs) {
  const agents = rankings.map(r => r.agent);
  const dimensionSet = new Set();

  for (const output of agentOutputs) {
    if (output.dimensions) {
      output.dimensions.forEach(d => dimensionSet.add(d));
    }
  }
  const dimensions = Array.from(dimensionSet);

  // Build matrix: agent → { dimension → score }
  const matrix = {};
  for (const ranking of rankings) {
    matrix[ranking.agent] = {
      total: ranking.totalScore,
      ...(ranking.breakdown || {}),
    };
  }

  // Map agent → assigned dimensions
  const agentDimensions = {};
  for (const output of agentOutputs) {
    agentDimensions[output.agent] = output.dimensions || ['generalist'];
  }

  return {
    agents,
    dimensions,
    matrix,
    agentDimensions,
    winnerAgent: rankings.length > 0 ? rankings[0].agent : null,
  };
}

/**
 * Build a directed voting graph from cross-scoring data.
 *
 * @param {object} crossScoreMatrix - From crossScore() { reviewer: { reviewee: { score } } }
 * @param {string[]} agents - Agent names
 * @returns {object} { nodes, edges }
 */
function buildVotingGraph(crossScoreMatrix, agents) {
  const nodes = agents.map(name => ({
    id: name,
    label: name,
  }));

  const edges = [];
  for (const [reviewer, reviews] of Object.entries(crossScoreMatrix || {})) {
    for (const [reviewee, data] of Object.entries(reviews || {})) {
      edges.push({
        from: reviewer,
        to: reviewee,
        weight: data.score || 0.5,
        label: (data.score || 0.5).toFixed(2),
      });
    }
  }

  return { nodes, edges };
}

/**
 * Build a consensus tree — hierarchical grouping of agents by alignment.
 *
 * @param {object} consensus - From buildConsensus()
 * @returns {object} { winner, allies, dissenters, neutrals }
 */
function buildConsensusTree(consensus) {
  if (!consensus || !consensus.winner) {
    return { winner: null, allies: [], dissenters: [], neutrals: [] };
  }

  const winnerScore = consensus.winner.score;
  const allies = [];
  const dissenters = [];
  const neutrals = [];

  for (const ranking of consensus.rankings) {
    if (ranking.agent === consensus.winner.agent) continue;

    const ratio = winnerScore > 0 ? ranking.totalScore / winnerScore : 0;

    if (ratio >= 0.85) {
      allies.push({ agent: ranking.agent, score: ranking.totalScore, alignment: 'ally' });
    } else if (ratio < 0.7) {
      dissenters.push({ agent: ranking.agent, score: ranking.totalScore, alignment: 'dissenter' });
    } else {
      neutrals.push({ agent: ranking.agent, score: ranking.totalScore, alignment: 'neutral' });
    }
  }

  return {
    winner: { agent: consensus.winner.agent, score: consensus.winner.score },
    allies,
    dissenters,
    neutrals,
  };
}

/**
 * Build a timeline of swarm execution events from steps.
 *
 * @param {object[]} steps - SwarmResult.steps
 * @param {object[]} rankings - SwarmResult.rankings
 * @returns {object[]} Timeline entries
 */
function buildTimeline(steps, rankings) {
  const timeline = [];
  let cumulativeMs = 0;

  for (const step of steps) {
    cumulativeMs += step.durationMs || 0;
    timeline.push({
      event: step.name,
      status: step.status,
      durationMs: step.durationMs || 0,
      cumulativeMs,
      meta: step.error ? { error: step.error } : {},
    });
  }

  return timeline;
}

/**
 * Render ASCII bar chart visualization of agent scores.
 *
 * @param {object[]} rankings - SwarmResult.rankings
 * @param {object} [options] - { width: number }
 * @returns {string} ASCII visualization
 */
function renderScoreChart(rankings, options = {}) {
  if (!rankings || rankings.length === 0) {
    return '  (no agents to display)';
  }

  const width = options.width || 40;
  const lines = [];
  const maxName = Math.max(...rankings.map(r => r.agent.length));

  for (const r of rankings) {
    const name = r.agent.padEnd(maxName);
    const score = r.totalScore || 0;
    const barLen = Math.round(score * width);
    const bar = '#'.repeat(barLen) + '.'.repeat(width - barLen);
    const marker = r === rankings[0] ? ' *' : '';
    lines.push(`  ${name} |${bar}| ${score.toFixed(3)}${marker}`);
  }

  return lines.join('\n');
}

/**
 * Render ASCII consensus tree.
 *
 * @param {object} tree - From buildConsensusTree()
 * @returns {string} ASCII tree
 */
function renderConsensusTree(tree) {
  const lines = [];

  if (!tree.winner) {
    lines.push('  (no consensus reached)');
    return lines.join('\n');
  }

  lines.push(`  [WINNER] ${tree.winner.agent} (${tree.winner.score.toFixed(3)})`);

  if (tree.allies.length > 0) {
    for (const a of tree.allies) {
      lines.push(`    +-- [ALLY] ${a.agent} (${a.score.toFixed(3)})`);
    }
  }

  if (tree.neutrals.length > 0) {
    for (const n of tree.neutrals) {
      lines.push(`    |-- [NEUTRAL] ${n.agent} (${n.score.toFixed(3)})`);
    }
  }

  if (tree.dissenters.length > 0) {
    for (const d of tree.dissenters) {
      lines.push(`    x-- [DISSENT] ${d.agent} (${d.score.toFixed(3)})`);
    }
  }

  return lines.join('\n');
}

/**
 * Render full debate visualization combining all views.
 *
 * @param {object} result - SwarmResult
 * @param {object} [consensus] - Raw consensus object (if available)
 * @returns {string} Complete ASCII visualization
 */
function renderDebateVisualization(result, consensus) {
  const lines = [];

  lines.push('=== Swarm Debate Visualization ===');
  lines.push('');

  // Score chart
  lines.push('Agent Scores:');
  lines.push(renderScoreChart(result.rankings));
  lines.push('');

  // Agreement bar
  const agr = result.agreement || 0;
  const agrBar = '#'.repeat(Math.round(agr * 30)) + '.'.repeat(30 - Math.round(agr * 30));
  lines.push(`Agreement: |${agrBar}| ${(agr * 100).toFixed(0)}%`);
  lines.push('');

  // Consensus tree
  if (consensus) {
    const tree = buildConsensusTree(consensus);
    lines.push('Consensus Tree:');
    lines.push(renderConsensusTree(tree));
    lines.push('');
  }

  // Timeline
  if (result.steps) {
    const timeline = buildTimeline(result.steps, result.rankings);
    lines.push('Pipeline Timeline:');
    for (const entry of timeline) {
      const icon = entry.status === 'ok' ? '+' : '!';
      lines.push(`  [${icon}] ${entry.event.padEnd(14)} ${String(entry.durationMs).padStart(6)}ms  (total: ${entry.cumulativeMs}ms)`);
    }
  }

  lines.push('');
  lines.push('==================================');

  return lines.join('\n');
}

/**
 * Export visualization data as JSON for frontend dashboard consumption.
 *
 * @param {object} result - SwarmResult
 * @param {object} [consensus] - Raw consensus
 * @param {object} [crossScoreMatrix] - Cross-scoring matrix
 * @returns {object} Dashboard-ready data
 */
function exportVisualizationData(result, consensus, crossScoreMatrix) {
  const agentOutputs = (result.rankings || []).map(r => ({
    agent: r.agent,
    dimensions: r.dimensions || [],
    score: r.totalScore,
  }));

  return {
    id: result.id,
    task: result.task,
    timestamp: result.timestamp,
    scoreMatrix: buildScoreMatrix(result.rankings || [], agentOutputs),
    votingGraph: buildVotingGraph(crossScoreMatrix, (result.rankings || []).map(r => r.agent)),
    consensusTree: buildConsensusTree(consensus || { winner: result.winner, rankings: result.rankings || [] }),
    timeline: buildTimeline(result.steps || [], result.rankings || []),
    summary: {
      winner: result.winner?.agent,
      winnerScore: result.winner?.score,
      agreement: result.agreement,
      agentCount: result.agentCount,
      durationMs: result.totalDurationMs,
    },
  };
}

module.exports = {
  buildScoreMatrix,
  buildVotingGraph,
  buildConsensusTree,
  buildTimeline,
  renderScoreChart,
  renderConsensusTree,
  renderDebateVisualization,
  exportVisualizationData,
};
