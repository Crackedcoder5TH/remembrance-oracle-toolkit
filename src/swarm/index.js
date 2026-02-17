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
const { DEFAULT_ESCALATION_CONFIG, shouldEscalate, getEscalationMode, applyEscalation, swarmWithEscalation } = require('./escalation');
const { loadHistory, saveHistory, recordRun, recordFeedback, getProviderReliability, getHistorySummary } = require('./swarm-history');
const { ERROR_CLASSES, classifyError, getRecoveryStrategy, sendWithRecovery, dispatchWithRecovery, buildErrorSummary } = require('./error-recovery');
const { SwarmProgressEmitter, createSwarmEmitter, attachCliReporter } = require('./progress-emitter');
const { DIMENSION_TEMPLATES, buildRememberedPrompt, preflightOracleSearch, buildAllPrompts } = require('./prompt-templates');

module.exports = {
  // Main orchestration
  swarm,
  swarmCode,
  swarmReview,
  swarmHeal,
  formatSwarmResult,

  // Escalation
  DEFAULT_ESCALATION_CONFIG,
  shouldEscalate,
  getEscalationMode,
  applyEscalation,
  swarmWithEscalation,

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

  // History & Feedback
  loadHistory,
  saveHistory,
  recordRun,
  recordFeedback,
  getProviderReliability,
  getHistorySummary,

  // Error Recovery
  ERROR_CLASSES,
  classifyError,
  getRecoveryStrategy,
  sendWithRecovery,
  dispatchWithRecovery,
  buildErrorSummary,

  // Progress Streaming
  SwarmProgressEmitter,
  createSwarmEmitter,
  attachCliReporter,

  // Prompt Templates
  DIMENSION_TEMPLATES,
  buildRememberedPrompt,
  preflightOracleSearch,
  buildAllPrompts,

  // Configuration
  DIMENSIONS,
  DEFAULT_SWARM_CONFIG,
  loadSwarmConfig,
  saveSwarmConfig,
  resolveProviders,
  getProviderKey,
  getProviderModel,
};
