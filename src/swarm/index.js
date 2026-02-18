'use strict';

/**
 * Swarm Orchestrator Module — Public API
 *
 * The collective intelligence brain of the Remembrance Oracle.
 * Routes tasks to multiple AI agents in parallel, each specializing
 * in a remembrance dimension. Agents score each other's outputs,
 * vote on the winner, and synthesize a unified whisper.
 */

const { swarm, swarmCode, swarmReview, swarmHeal, formatSwarmResult } = require('./swarm-orchestrator');
const { createAgentPool, getAvailableProviders } = require('./agent-pool');
const { assignDimensions, buildSpecialistPrompt, parseAgentResponse, DIMENSION_PROMPTS } = require('./dimension-router');
const { scoreWithCoherency, crossScore, computePeerScores } = require('./cross-scoring');
const { buildConsensus, quickConsensus, mergeTopOutputs } = require('./consensus');
const { synthesizeWhisper, formatWhisper, determineRecommendation } = require('./whisper-synthesis');
const { DIMENSIONS, DEFAULT_SWARM_CONFIG, loadSwarmConfig, saveSwarmConfig, resolveProviders, getProviderKey, getProviderModel } = require('./swarm-config');

module.exports = {
  // Main orchestration
  swarm,
  swarmCode,
  swarmReview,
  swarmHeal,
  formatSwarmResult,

  // Agent pool
  createAgentPool,
  getAvailableProviders,

  // Dimension routing
  assignDimensions,
  buildSpecialistPrompt,
  parseAgentResponse,
  DIMENSION_PROMPTS,

  // Cross-scoring
  scoreWithCoherency,
  crossScore,
  computePeerScores,

  // Consensus
  buildConsensus,
  quickConsensus,
  mergeTopOutputs,

  // Whisper
  synthesizeWhisper,
  formatWhisper,
  determineRecommendation,

  // Configuration
  DIMENSIONS,
  DEFAULT_SWARM_CONFIG,
  loadSwarmConfig,
  saveSwarmConfig,
  resolveProviders,
  getProviderKey,
  getProviderModel,
};
