'use strict';

/**
 * Cross-Scoring Module
 *
 * After all agents produce outputs, this module orchestrates mutual evaluation.
 * Each agent scores the other agents' code using the oracle's coherency engine
 * and optionally via peer-review prompts sent back to the agents.
 */

/**
 * Score all agent outputs using the local coherency function.
 * No API calls needed — this uses the oracle's built-in scoring.
 *
 * @param {object[]} agentOutputs - Array of { agent, code, explanation, confidence, dimensions }
 * @param {function} coherencyFn - computeCoherencyScore(code, metadata) → { total, breakdown }
 * @returns {Map<string, object>} Map of agentName → { total, breakdown }
 */
function scoreWithCoherency(agentOutputs, coherencyFn) {
  const scores = new Map();

  for (const output of agentOutputs) {
    if (!output.code) {
      scores.set(output.agent, { total: 0, breakdown: {} });
      continue;
    }
    try {
      const result = coherencyFn(output.code, {
        description: output.explanation || '',
        tags: output.dimensions || [],
      });
      scores.set(output.agent, {
        total: result.total || 0,
        breakdown: result.breakdown || {},
      });
    } catch {
      scores.set(output.agent, { total: 0, breakdown: {} });
    }
  }

  return scores;
}

/**
 * Build peer-review prompts for cross-scoring via API calls.
 * Each agent reviews every other agent's code.
 *
 * @param {object[]} agentOutputs - Array of { agent, code, explanation }
 * @param {string[]} dimensions - Dimensions to score on
 * @returns {object[]} Array of { reviewer, reviewee, prompt }
 */
function buildPeerReviewPrompts(agentOutputs, dimensions) {
  const prompts = [];

  for (const reviewer of agentOutputs) {
    for (const reviewee of agentOutputs) {
      if (reviewer.agent === reviewee.agent) continue;
      if (!reviewee.code) continue;

      const dimList = dimensions.length > 0
        ? dimensions.join(', ')
        : 'simplicity, correctness, readability, security, efficiency';

      prompts.push({
        reviewer: reviewer.agent,
        reviewee: reviewee.agent,
        prompt: [
          `Score the following code on these dimensions: ${dimList}.`,
          'For each dimension, give a score from 0.0 to 1.0.',
          'Then give an overall score on the last line as: SCORE: <number>',
          '',
          '```',
          reviewee.code,
          '```',
        ].join('\n'),
      });
    }
  }

  return prompts;
}

/**
 * Execute peer scoring by sending review prompts to agents.
 * Returns a scoring matrix: matrix[reviewer][reviewee] = { score, reasoning }
 *
 * @param {object[]} agentOutputs - Array of { agent, code, ... }
 * @param {object} pool - Agent pool with send() method
 * @param {string[]} dimensions - Dimensions to score on
 * @returns {object} Scoring matrix
 */
async function crossScore(agentOutputs, pool, dimensions) {
  const matrix = {};
  const prompts = buildPeerReviewPrompts(agentOutputs, dimensions);

  // Send all review prompts in parallel
  const results = await Promise.allSettled(
    prompts.map(async ({ reviewer, reviewee, prompt }) => {
      try {
        const { response } = await pool.send(reviewer, prompt, {
          system: 'You are a code reviewer. Score the given code concisely. End with SCORE: <0.0-1.0>',
        });
        const scoreMatch = response.match(/SCORE:\s*([\d.]+)/i);
        const score = scoreMatch ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1]))) : 0.5;
        return { reviewer, reviewee, score, reasoning: response.slice(0, 200) };
      } catch {
        return { reviewer, reviewee, score: 0.5, reasoning: 'Review failed (timeout or error)' };
      }
    })
  );

  // Build the matrix
  for (const result of results) {
    const { reviewer, reviewee, score, reasoning } = result.status === 'fulfilled'
      ? result.value
      : { reviewer: '', reviewee: '', score: 0.5, reasoning: 'Error' };
    if (!reviewer) continue;
    if (!matrix[reviewer]) matrix[reviewer] = {};
    matrix[reviewer][reviewee] = { score, reasoning };
  }

  return matrix;
}

/**
 * Compute average peer scores from a scoring matrix.
 *
 * @param {object} matrix - Scoring matrix from crossScore()
 * @param {string[]} agentNames - All agent names
 * @returns {Map<string, number>} Map of agentName → average peer score
 */
function computePeerScores(matrix, agentNames) {
  const peerScores = new Map();

  for (const agent of agentNames) {
    const scores = [];
    // Collect all scores given TO this agent by other agents
    for (const reviewer of agentNames) {
      if (reviewer === agent) continue;
      const score = matrix[reviewer]?.[agent]?.score;
      if (typeof score === 'number') scores.push(score);
    }
    const avg = scores.length > 0
      ? scores.reduce((s, v) => s + v, 0) / scores.length
      : 0.5;
    peerScores.set(agent, avg);
  }

  return peerScores;
}

module.exports = {
  scoreWithCoherency,
  buildPeerReviewPrompts,
  crossScore,
  computePeerScores,
};
