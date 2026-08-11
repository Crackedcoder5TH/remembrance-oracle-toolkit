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
  'recycle':      { canonical: 'generate',             message: 'Use "generate" instead of "recycle"' },

  // REMOVED 2026-08-11 — both pointed at canonicals that do not exist, and
  // a deprecation whose target is imaginary does not simplify a surface, it
  // deletes one. Each silently swallowed a live capability:
  //
  //   'smart-search' -> 'search --mode smart'
  //       search() only branches on mode === 'semantic'; there is no smart
  //       mode. Every `oracle smart-search` ran a plain hybrid search while
  //       the notice claimed otherwise, so smartSearch's intent detection,
  //       typo correction, rewritten query and suggestions — all live, all
  //       advertised in `oracle help` — were unreachable from the CLI.
  //
  //   'deep-clean' -> 'prune --deep'
  //       prune() reads only --untested and --min-coherency; --deep is not
  //       a flag it has. The redirect ran an ordinary prune.
  //
  // Both commands have real implementations and are no longer intercepted.
  // A deprecation belongs here only when its canonical genuinely does the
  // same work — the tests in tests/cli-contract.test.js now check that.
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

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
getDeprecation.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
warnDeprecation.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
