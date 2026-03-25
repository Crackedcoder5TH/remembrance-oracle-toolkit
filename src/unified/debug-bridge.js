'use strict';

/**
 * Debug Bridge — connects debug patterns and main patterns.
 *
 * Previously these were isolated worlds:
 *   - Main patterns in `patterns` table (coherency-scored)
 *   - Debug patterns in `debug_patterns` table (quantum-amplitude)
 *
 * This bridge:
 *   1. Promotes high-amplitude debug fixes → main pattern library
 *   2. Captures repeatedly-failing main patterns → debug entries
 *   3. Federates search across both systems
 *   4. Translates between coherency scores and quantum amplitudes
 */

// ─── Configuration ───

const BRIDGE_DEFAULTS = {
  /** Minimum debug amplitude to auto-promote to main library */
  promoteAmplitude: 0.75,
  /** Minimum successful applications before promotion */
  promoteMinApplied: 3,
  /** Minimum failure rate to capture a main pattern as debug entry */
  captureFailureRate: 0.6,
  /** Minimum uses before failure capture kicks in */
  captureMinUses: 5,
  /** Maximum debug results to include in federated search */
  maxDebugResults: 5,
  /** Amplitude-to-coherency conversion factor */
  amplitudeToCoherency: 0.85,
};

// ─── Promotion: Debug → Main ───

/**
 * Check debug patterns that are ready for promotion to the main library.
 * A debug fix with high amplitude and proven success should become a pattern.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} [options] - Bridge options
 * @returns {{ promoted: number, candidates: Array, errors: string[] }}
 */
function promoteDebugToPatterns(oracle, options = {}) {
  const config = { ...BRIDGE_DEFAULTS, ...options };
  const report = { promoted: 0, candidates: [], errors: [] };

  try {
    const debug = oracle._getDebugOracle?.();
    if (!debug) return report;

    const patterns = debug.getAll({
      minAmplitude: config.promoteAmplitude,
    });

    for (const dbgPattern of patterns) {
      // Must have been applied enough times
      if ((dbgPattern.timesApplied || 0) < config.promoteMinApplied) continue;
      // Must have reasonable success rate
      const successRate = dbgPattern.timesApplied > 0
        ? (dbgPattern.timesResolved || 0) / dbgPattern.timesApplied
        : 0;
      if (successRate < 0.5) continue;

      // Check if already exists as a main pattern (avoid duplicates)
      const existing = _findExistingPattern(oracle, dbgPattern.fixCode, dbgPattern.language);
      if (existing) {
        report.candidates.push({
          id: dbgPattern.id,
          reason: 'already exists as main pattern',
          existingId: existing.id,
        });
        continue;
      }

      // Promote: register as a main pattern
      try {
        const coherency = dbgPattern.amplitude * config.amplitudeToCoherency;
        const name = `debug-fix-${dbgPattern.errorCategory || 'general'}-${dbgPattern.id.slice(0, 8)}`;
        const tags = [
          'debug-promoted',
          dbgPattern.errorCategory || 'runtime',
          dbgPattern.errorClass || 'Error',
          ...(dbgPattern.tags || []),
        ].filter(Boolean);

        oracle.registerPattern({
          name,
          code: dbgPattern.fixCode,
          language: dbgPattern.language || 'javascript',
          description: dbgPattern.fixDescription || `Auto-promoted from debug fix: ${dbgPattern.errorMessage}`,
          tags,
          testCode: '', // Debug patterns don't carry test code
        });

        report.promoted++;
      } catch (e) {
        report.errors.push(`promote ${dbgPattern.id}: ${e.message}`);
      }
    }
  } catch (e) {
    report.errors.push(`promoteDebugToPatterns: ${e.message}`);
  }

  return report;
}

// ─── Capture: Main → Debug ───

/**
 * Check main patterns that are failing repeatedly and capture them as debug entries.
 * This feeds the debug system with error context from the main library.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} [options] - Bridge options
 * @returns {{ captured: number, candidates: Array, errors: string[] }}
 */
function captureFailingPatterns(oracle, options = {}) {
  const config = { ...BRIDGE_DEFAULTS, ...options };
  const report = { captured: 0, candidates: [], errors: [] };

  try {
    const debug = oracle._getDebugOracle?.();
    if (!debug) return report;

    const patterns = oracle.patterns.getAll();
    for (const pattern of patterns) {
      const usage = pattern.usageCount || 0;
      const success = pattern.successCount || 0;
      if (usage < config.captureMinUses) continue;

      const failureRate = 1 - (success / usage);
      if (failureRate < config.captureFailureRate) continue;

      // Don't re-capture patterns already in debug
      const errorMsg = `Main pattern "${pattern.name || pattern.id}" failing at ${(failureRate * 100).toFixed(0)}% rate`;
      const existing = debug.search({
        errorMessage: errorMsg,
        limit: 1,
      });
      if (existing.length > 0 && existing[0].score > 0.8) continue;

      try {
        debug.capture({
          errorMessage: errorMsg,
          stackTrace: `pattern-id: ${pattern.id}\nfailure-rate: ${failureRate.toFixed(3)}\nusage: ${usage}\nsuccesses: ${success}`,
          fixCode: pattern.code,
          fixDescription: `Failing main pattern — needs investigation. Coherency: ${pattern.coherencyScore?.total?.toFixed(3) || 'unknown'}`,
          language: pattern.language || 'javascript',
          tags: ['bridge-captured', 'failing-pattern', ...(pattern.tags || [])],
        });
        report.captured++;
      } catch (e) {
        report.errors.push(`capture ${pattern.id}: ${e.message}`);
      }
    }
  } catch (e) {
    report.errors.push(`captureFailingPatterns: ${e.message}`);
  }

  return report;
}

// ─── Federated Search ───

/**
 * Search across both main patterns and debug patterns.
 * Returns unified results sorted by relevance.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {string} query - Search query
 * @param {object} [options] - { language, limit, includeDebug }
 * @returns {Array} Unified search results
 */
function federatedSearch(oracle, query, options = {}) {
  const config = { ...BRIDGE_DEFAULTS, ...options };
  const results = [];

  // Main pattern search
  try {
    const mainResults = oracle.search(query, {
      language: options.language,
      limit: options.limit || 10,
    });
    for (const result of mainResults) {
      results.push({
        ...result,
        source: 'pattern',
        sourceType: 'main',
      });
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[debug-bridge:federatedSearch] main search failed:', e?.message || e);
  }

  // Debug pattern search (if debug oracle exists)
  if (options.includeDebug !== false) {
    try {
      const debug = oracle._getDebugOracle?.();
      if (debug) {
        const debugResults = debug.search({
          errorMessage: query,
          language: options.language,
          limit: config.maxDebugResults,
        });
        for (const result of debugResults) {
          results.push({
            id: result.id,
            code: result.fixCode,
            name: `debug: ${result.errorCategory || 'fix'}`,
            description: result.fixDescription,
            language: result.language,
            relevance: result.score * 0.9, // Slight discount vs main patterns
            coherencyScore: { total: result.amplitude || result.confidence || 0 },
            source: 'debug',
            sourceType: 'debug',
            errorMessage: result.errorMessage,
          });
        }
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[debug-bridge:federatedSearch] debug search failed:', e?.message || e);
    }
  }

  // Sort by relevance
  results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

  return options.limit ? results.slice(0, options.limit) : results;
}

// ─── Full Bridge Sync ───

/**
 * Run the full bridge cycle: promote ready debug fixes + capture failing patterns.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} [options] - Bridge options
 * @returns {{ promoted: object, captured: object }}
 */
function bridgeSync(oracle, options = {}) {
  const promoted = promoteDebugToPatterns(oracle, options);
  const captured = captureFailingPatterns(oracle, options);
  return { promoted, captured };
}

// ─── Helpers ───

function _findExistingPattern(oracle, code, language) {
  try {
    const { jaccardSimilarity } = require('./similarity');
    const patterns = oracle.patterns.getAll();
    for (const p of patterns) {
      if ((p.language || '').toLowerCase() !== (language || '').toLowerCase()) continue;
      const sim = jaccardSimilarity(code || '', p.code || '');
      if (sim > 0.9) return p;
    }
  } catch (_) { /* similarity module not available */ }
  return null;
}

module.exports = {
  promoteDebugToPatterns,
  captureFailingPatterns,
  federatedSearch,
  bridgeSync,
  BRIDGE_DEFAULTS,
};
