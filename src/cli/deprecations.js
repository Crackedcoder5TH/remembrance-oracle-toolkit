'use strict';

/**
 * Command Deprecation Map — Surface area pruning.
 *
 * Maps deprecated/redundant commands to their canonical replacements.
 * When a deprecated command is invoked, it shows a one-line deprecation
 * notice and delegates to the canonical command.
 *
 * This reduces the effective surface area without breaking existing scripts.
 */

const DEPRECATIONS = {
  // Direct aliases — use canonical name
  'init':        { canonical: 'setup',    message: 'Use "setup" instead of "init"' },
  'evolve':      { canonical: 'maintain', message: 'Use "maintain" instead of "evolve" (deprecated since v3)' },
  'improve':     { canonical: 'maintain', message: 'Use "maintain" instead of "improve" (deprecated since v3)' },
  'optimize':    { canonical: 'maintain', message: 'Use "maintain" instead of "optimize" (deprecated since v3)' },
  'full-cycle':  { canonical: 'maintain', message: 'Use "maintain" instead of "full-cycle" (deprecated since v3)' },

  // Overlapping commands — guide users to the better version
  'smart-search': { canonical: 'search --mode smart', message: 'Use "search --mode smart" for intent-aware search' },
  'recycle':      { canonical: 'generate',             message: 'Use "generate" instead of "recycle"' },
  'deep-clean':   { canonical: 'prune --deep',         message: 'Use "prune --deep" instead of "deep-clean"' },
};

/**
 * Consolidated command groups — shows which commands serve the same purpose.
 * Used by the help system to reduce visual clutter.
 */
const COMMAND_GROUPS = {
  'Search & Retrieve': ['search', 'resolve', 'query'],
  'Pattern Management': ['register', 'submit', 'patterns', 'candidates'],
  'Quality & Healing': ['maintain', 'covenant', 'reflect', 'promote', 'synthesize'],
  'Automation': ['auto-submit', 'auto-register', 'hooks'],
  'Storage & Sync': ['sync', 'share', 'community'],
  'Stats & Debug': ['stats', 'debug', 'audit', 'analytics'],
};

/**
 * Check if a command is deprecated and return info.
 * @param {string} cmd — Command name
 * @returns {Object|null} — { canonical, message } or null
 */
function getDeprecation(cmd) {
  return DEPRECATIONS[cmd] || null;
}

/**
 * Print deprecation warning to stderr (non-blocking, one line).
 * @param {string} cmd — Deprecated command name
 */
function warnDeprecation(cmd) {
  const dep = DEPRECATIONS[cmd];
  if (dep) {
    process.stderr.write(`[deprecated] ${dep.message}\n`);
  }
}

module.exports = {
  DEPRECATIONS,
  COMMAND_GROUPS,
  getDeprecation,
  warnDeprecation,
};
