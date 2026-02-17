/**
 * Remembrance Reflector BOT — Scoring Module (barrel re-export)
 *
 * Split into focused sub-modules for maintainability:
 *   1. scoring-utils.js    — ensureDir, loadJSON, saveJSON, deepMerge, etc.
 *   2. scoring-config.js   — CENTRAL_DEFAULTS, load/save/validate config
 *   3. scoring-modes.js    — PRESET_MODES, resolveConfig, mode management
 *   4. scoring-errors.js   — ERROR_TYPES, classifyError, retry, circuit breaker
 *   5. scoring-analysis.js — complexity, security scan, deepScore, repoScore
 *   6. scoring-coherence.js — coherence scorer, test proof, historical reliability
 *
 * All exports are re-exported here for backwards compatibility.
 */

const utils = require('./scoring-utils');
const config = require('./scoring-config');
const modes = require('./scoring-modes');
const errors = require('./scoring-errors');
const analysis = require('./scoring-analysis');
const coherence = require('./scoring-coherence');

module.exports = {
  // Section 1: Shared Utilities
  ...utils,

  // Section 2: Central Configuration
  ...config,

  // Section 3: Modes & Presets
  ...modes,

  // Section 4: Error Handling
  ...errors,

  // Section 5: Deep Code Analysis
  ...analysis,

  // Section 6: Coherence Scorer
  ...coherence,
};
