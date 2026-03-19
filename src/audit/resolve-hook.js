'use strict';

/**
 * Resolve Hook — checks the shape of new code against known bug classes.
 *
 * When the oracle sees you writing code that matches a known bug pattern
 * (e.g., .sort() without .slice()), it proactively warns with EVOLVE
 * and attaches the relevant fix pattern.
 *
 * This integrates with the resolve pipeline to add bug-class awareness.
 */

const { BUG_CLASSES } = require('./static-checkers');

// ─── Bug Class Signatures ───
// These are lightweight regex-based checks that detect code shapes
// matching known bug classes. Used during resolve to warn proactively.

const BUG_CLASS_SIGNATURES = [
  {
    bugClass: BUG_CLASSES.STATE_MUTATION,
    name: 'Array mutation via .sort()',
    pattern: /\w+\.sort\s*\(/,
    antiPattern: /\.slice\(\)|\.concat\(|\[\.\.\./,
    warning: 'State mutation risk — .sort() mutates in-place. Use .slice().sort() for safety.',
    debugCategory: 'logic',
  },
  {
    bugClass: BUG_CLASSES.STATE_MUTATION,
    name: 'Array mutation via .reverse()',
    pattern: /\w+\.reverse\s*\(/,
    antiPattern: /\.slice\(\)|\[\.\.\./,
    warning: 'State mutation risk — .reverse() mutates in-place.',
    debugCategory: 'logic',
  },
  {
    bugClass: BUG_CLASSES.SECURITY,
    name: 'Timing-unsafe secret comparison',
    pattern: /(password|secret|token|apiKey|api_key)\s*===?\s*/i,
    antiPattern: /timingSafeEqual/,
    warning: 'Security risk — use crypto.timingSafeEqual() for secret comparison.',
    debugCategory: 'runtime',
  },
  {
    bugClass: BUG_CLASSES.TYPE,
    name: 'Unchecked JSON.parse',
    pattern: /JSON\.parse\s*\(/,
    antiPattern: /try\s*\{|safeParse|catch/,
    warning: 'Type safety risk — JSON.parse throws on invalid input. Wrap in try/catch.',
    debugCategory: 'type',
  },
  {
    bugClass: BUG_CLASSES.TYPE,
    name: 'Division without zero-guard',
    pattern: /\w+\s*\/\s*\w+/,
    antiPattern: /!==?\s*0|>\s*0|Math\.max/,
    warning: 'Type safety risk — division by zero produces Infinity/NaN.',
    debugCategory: 'type',
  },
  {
    bugClass: BUG_CLASSES.CONCURRENCY,
    name: 'Lock without finally',
    pattern: /await\s+\w+\.(acquire|lock)\s*\(/,
    antiPattern: /finally\s*\{/,
    warning: 'Concurrency risk — lock acquire without try/finally causes deadlocks.',
    debugCategory: 'async',
  },
  {
    bugClass: BUG_CLASSES.EDGE_CASE,
    name: 'Switch without default',
    pattern: /switch\s*\(/,
    antiPattern: /default\s*:/,
    warning: 'Edge case risk — switch without default silently drops unmatched values.',
    debugCategory: 'logic',
  },
];

/**
 * Check resolved code against known bug class signatures.
 * Returns warnings if the code matches known risky patterns.
 *
 * @param {string} code - The resolved/healed code
 * @param {object} [options] - { bugClasses, includeDebugPatterns }
 * @returns {Array<{ bugClass: string, name: string, warning: string, debugCategory: string }>}
 */
function checkResolvedCode(code, options = {}) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const enabledClasses = options.bugClasses
    ? new Set(Array.isArray(options.bugClasses) ? options.bugClasses : [options.bugClasses])
    : null;

  for (const sig of BUG_CLASS_SIGNATURES) {
    if (enabledClasses && !enabledClasses.has(sig.bugClass)) continue;

    // Check if code matches the risky pattern
    if (sig.pattern.test(code)) {
      // Check if the anti-pattern (safe version) is also present
      if (sig.antiPattern && sig.antiPattern.test(code)) continue;

      warnings.push({
        bugClass: sig.bugClass,
        name: sig.name,
        warning: sig.warning,
        debugCategory: sig.debugCategory,
      });
    }
  }

  return warnings;
}

/**
 * Enhance a resolve result with bug-class warnings.
 * If warnings are found, the result is augmented with:
 *   - bugClassWarnings: Array of warnings
 *   - If decision was 'pull', may suggest 'evolve' instead
 *
 * @param {object} resolveResult - The resolve() result object
 * @param {object} oracle - RemembranceOracle instance (for debug pattern lookup)
 * @returns {object} Enhanced resolve result
 */
function enhanceResolveWithBugClasses(resolveResult, oracle) {
  if (!resolveResult || !resolveResult.healedCode) return resolveResult;

  const warnings = checkResolvedCode(resolveResult.healedCode);

  if (warnings.length === 0) return resolveResult;

  // Attach warnings to result
  resolveResult.bugClassWarnings = warnings;

  // Look up related debug fixes for each warning
  if (oracle && typeof oracle.debugSearch === 'function') {
    for (const warning of warnings) {
      try {
        const debugMatches = oracle.debugSearch({
          errorMessage: warning.warning,
          language: resolveResult.pattern?.language,
          limit: 1,
        });
        if (debugMatches.length > 0) {
          warning.relatedFix = {
            id: debugMatches[0].id,
            fixDescription: debugMatches[0].fixDescription,
            amplitude: debugMatches[0].amplitude,
          };
        }
      } catch (_) {
        // Debug search is optional
      }
    }
  }

  // If code has high-severity warnings and decision was 'pull', suggest evolve
  const hasHighSeverity = warnings.some(w =>
    w.bugClass === BUG_CLASSES.SECURITY || w.bugClass === BUG_CLASSES.CONCURRENCY
  );

  if (hasHighSeverity && resolveResult.decision === 'pull') {
    resolveResult.bugClassOverride = {
      originalDecision: 'pull',
      newDecision: 'evolve',
      reason: `Bug class warnings detected: ${warnings.map(w => w.name).join(', ')}`,
    };
  }

  return resolveResult;
}

/**
 * Classify a debug fix into a bug class based on its error message and fix code.
 *
 * @param {object} debugPattern - Debug pattern with errorMessage, fixCode, etc.
 * @returns {string|null} Bug class tag or null if no match
 */
function classifyDebugFix(debugPattern) {
  if (!debugPattern) return null;

  const combined = [
    debugPattern.errorMessage || '',
    debugPattern.fixDescription || '',
    debugPattern.fixCode || '',
  ].join(' ').toLowerCase();

  // State mutation indicators
  if (/\.sort\(|\.reverse\(|\.splice\(|mutate|in-place|shared ref/i.test(combined)) {
    return BUG_CLASSES.STATE_MUTATION;
  }

  // Security indicators
  if (/timing|secret|injection|xss|csrf|sanitize|escape|credential/i.test(combined)) {
    return BUG_CLASSES.SECURITY;
  }

  // Concurrency indicators
  if (/deadlock|race|mutex|lock|semaphore|atomic|concurrent|parallel/i.test(combined)) {
    return BUG_CLASSES.CONCURRENCY;
  }

  // Type indicators
  if (/NaN|Infinity|zero.?guard|type.*error|JSON\.parse|parseInt|isNaN/i.test(combined)) {
    return BUG_CLASSES.TYPE;
  }

  // Integration indicators
  if (/null.*check|undefined.*check|return.*null|optional.*chain/i.test(combined)) {
    return BUG_CLASSES.INTEGRATION;
  }

  // Edge case indicators
  if (/default.*case|switch|boundary|edge.*case|off.?by.?one|empty.*array|missing.*param/i.test(combined)) {
    return BUG_CLASSES.EDGE_CASE;
  }

  return null;
}

module.exports = {
  checkResolvedCode,
  enhanceResolveWithBugClasses,
  classifyDebugFix,
  BUG_CLASS_SIGNATURES,
};
