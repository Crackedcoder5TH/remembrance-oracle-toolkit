/**
 * Evolution Module — Self-evolution, self-optimization, lifecycle management.
 *
 * This barrel export provides the entire evolution subsystem:
 *
 *   context.js     — OracleContext interface (narrow adapter)
 *   evolution.js   — Scoring penalties, auto-heal, regression detection
 *   self-optimize.js — selfImprove, selfOptimize, polish cycles
 *   lifecycle.js   — Event-driven always-on management
 *   whisper.js     — Healing event aggregation + summary text
 *
 * Usage:
 *   const { createOracleContext, evolve, selfImprove, LifecycleEngine } = require('./evolution');
 */

const { createOracleContext } = require('./context');

const {
  evolve,
  stalenessPenalty,
  evolvePenalty,
  evolutionAdjustment,
  needsAutoHeal,
  autoHeal,
  captureRejection,
  detectRegressions,
  recheckCoherency,
  EVOLUTION_DEFAULTS,
} = require('./evolution');

const {
  selfImprove,
  selfOptimize,
  fullCycle,
  consolidateDuplicates,
  consolidateTags,
  pruneStuckCandidates,
  polishCycle,
  iterativePolish,
  OPTIMIZE_DEFAULTS,
} = require('./self-optimize');

const { LifecycleEngine, LIFECYCLE_DEFAULTS } = require('./lifecycle');
const { HealingWhisper, WHISPER_INTROS, WHISPER_DETAILS } = require('./whisper');

module.exports = {
  // Context
  createOracleContext,

  // Evolution
  evolve,
  stalenessPenalty,
  evolvePenalty,
  evolutionAdjustment,
  needsAutoHeal,
  autoHeal,
  captureRejection,
  detectRegressions,
  recheckCoherency,
  EVOLUTION_DEFAULTS,

  // Self-Optimization
  selfImprove,
  selfOptimize,
  fullCycle,
  consolidateDuplicates,
  consolidateTags,
  pruneStuckCandidates,
  polishCycle,
  iterativePolish,
  OPTIMIZE_DEFAULTS,

  // Lifecycle
  LifecycleEngine,
  LIFECYCLE_DEFAULTS,

  // Whisper
  HealingWhisper,
  WHISPER_INTROS,
  WHISPER_DETAILS,
};
