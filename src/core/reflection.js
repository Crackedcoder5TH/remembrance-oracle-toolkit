/**
 * Infinite Reflection Loop — barrel re-export (SERF v2).
 *
 * Split into focused sub-modules:
 *   reflection-transforms.js — The 5 refinement strategy transforms
 *   reflection-scorers.js    — Dimension scorers + observeCoherence
 *   reflection-serf.js       — SERF v2 constants + innerProduct + reflectionScore
 *   reflection-loop.js       — reflectionLoop + generateCandidates + whispers + format
 */

const transforms = require('./reflection-transforms');
const scorers = require('./reflection-scorers');
const serf = require('./reflection-serf');
const loop = require('./reflection-loop');

module.exports = {
  ...transforms,
  ...scorers,
  ...serf,
  ...loop,
};
