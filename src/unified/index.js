'use strict';

/**
 * Unified Infrastructure — shared engines that replace duplicated implementations.
 *
 * Six consolidated modules:
 *   1. coherency  — Single coherency scorer (merges core + reflector)
 *   2. decay      — Single decay engine (merges confidence-decay + staleness + decoherence)
 *   3. healing    — Single healing orchestrator (merges 4 entry points)
 *   4. similarity — Single similarity checker (merges 3 implementations)
 *   5. variants   — Single variant generator (merges recycler + debug transpilers)
 *   6. debug-bridge — Connects debug and main pattern systems
 */

const coherency = require('./coherency');
const decay = require('./decay');
const healing = require('./healing');
const similarity = require('./similarity');
const variants = require('./variants');
const debugBridge = require('./debug-bridge');

module.exports = {
  ...coherency,
  ...decay,
  ...healing,
  ...similarity,
  ...variants,
  ...debugBridge,

  // Named sub-module access
  coherency,
  decay,
  healing,
  similarity,
  variants,
  debugBridge,
};
