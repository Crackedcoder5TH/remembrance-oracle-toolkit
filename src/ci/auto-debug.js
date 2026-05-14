/**
 * Auto-Debug Module — Automatic debug pattern capture and healed code forwarding.
 *
 * Captures error→fix pairs automatically during oracle operations:
 *   - Healing failures during resolve → captured as debug patterns
 *   - Failed feedback → captured as debug patterns
 *   - Successful healing → healed code forwarded as proven debug patterns
 *
 * Also runs the debug sweep: grow variants + sync to personal store.
 *
 * Usage:
 *   const { captureResolveDebug, captureFeedbackDebug, debugSweep } = require('./auto-debug');
 *
 *   // After resolve with healing
 *   captureResolveDebug(oracle, resolveResult, request);
 *
 *   // After failed feedback
 *   captureFeedbackDebug(oracle, id, pattern, healResult);
 *
 *   // End-of-session or post-commit sweep
 *   debugSweep(oracle, { silent: true });
 */

/**
 * Capture debug patterns from a resolve operation.
 *
 * When healing succeeds with improvement, the healed code is forwarded as a
 * proven debug pattern (error = "low coherency", fix = healed code).
 *
 * When healing fails, the error is captured so future resolves can learn.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {object} resolveResult — Result from oracle.resolve()
 * @param {object} request — Original resolve request
 * @returns {object} { captured: number, forwarded: number, errors: string[] }
 */
function captureResolveDebug(oracle, resolveResult, request = {}) {
  const report = { captured: 0, forwarded: 0, errors: [] };

  try {
    const debug = oracle._getDebugOracle?.();
    if (!debug) return report;

    const pattern = resolveResult.pattern;
    const healing = resolveResult.healing;
    if (!pattern || !healing) return report;

    // Forward healed code as a debug pattern when coherency improved
    if (healing.improvement > 0 && resolveResult.healedCode) {
      const errorMessage = `Low coherency in pattern "${pattern.name || pattern.id}": ${healing.originalCoherence?.toFixed?.(3) || 'unknown'} → needs healing`;
      const result = debug.capture({
        errorMessage,
        stackTrace: `healing-path: ${(healing.healingPath || []).join(' > ')}`,
        fixCode: resolveResult.healedCode,
        fixDescription: `Healed via ${healing.loops} reflection loop(s). Coherency: ${healing.originalCoherence?.toFixed?.(3) || '?'} → ${healing.finalCoherence?.toFixed?.(3) || '?'}. Pattern: ${pattern.name || pattern.id}`,
        language: pattern.language || request.language || 'javascript',
        tags: ['auto-debug', 'healed', 'resolve', ...(pattern.tags || [])],
      });

      if (result.captured) {
        report.forwarded++;
        // Mark it as already resolved once (the healing itself is proof)
        try {
          debug.reportOutcome(result.pattern.id, true);
        } catch (_) { /* best effort */ }
      }
    }

    // Capture healing failures as debug patterns for future learning
    if (healing.improvement <= 0 && pattern.code) {
      const errorMessage = `Healing failed for pattern "${pattern.name || pattern.id}": coherency stuck at ${healing.originalCoherence?.toFixed?.(3) || 'unknown'}`;
      const result = debug.capture({
        errorMessage,
        stackTrace: `healing-path: ${(healing.healingPath || []).join(' > ')}\ndecision: ${resolveResult.decision}`,
        fixCode: pattern.code,
        fixDescription: `Original code (healing did not improve). Pattern: ${pattern.name || pattern.id}. Decision: ${resolveResult.decision}`,
        language: pattern.language || request.language || 'javascript',
        tags: ['auto-debug', 'healing-failed', 'resolve'],
      });

      if (result.captured) {
        report.captured++;
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-debug:captureResolveDebug]', e?.message || e);
    report.errors.push(e.message || String(e));
  }

  return report;
}

/**
 * Capture debug patterns from a failed feedback operation.
 *
 * When a pattern reports failure, the error context is captured as a debug
 * pattern. When auto-heal produces a fix, that fix is forwarded as a
 * proven debug pattern.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {string} id — Pattern or entry ID that failed
 * @param {object} entry — The pattern/entry object (with .code, .name, etc.)
 * @param {object} healResult — Result from auto-heal (if any)
 * @returns {object} { captured: number, forwarded: number, errors: string[] }
 */
function captureFeedbackDebug(oracle, id, entry, healResult) {
  const report = { captured: 0, forwarded: 0, errors: [] };

  try {
    const debug = oracle._getDebugOracle?.();
    if (!debug) return report;

    const name = entry?.name || entry?.description || id;
    const code = entry?.code || '';
    const language = entry?.language || 'javascript';

    // Capture the failure as a debug pattern
    if (code) {
      const errorMessage = `Pattern "${name}" reported as failing (id: ${id})`;
      const captureResult = debug.capture({
        errorMessage,
        stackTrace: '',
        fixCode: code,
        fixDescription: `Original code from failed pattern "${name}" — needs investigation or healing`,
        language,
        tags: ['auto-debug', 'feedback-failure'],
      });

      if (captureResult.captured) {
        report.captured++;
      }
    }

    // Forward the healed version if auto-heal produced one
    if (healResult?.healed && healResult.improvement > 0) {
      const healedCode = healResult.healedCode || healResult.code || entry?.code;
      if (healedCode) {
        const errorMessage = `Auto-heal fix for pattern "${name}" (id: ${id})`;
        const forwardResult = debug.capture({
          errorMessage,
          stackTrace: '',
          fixCode: healedCode,
          fixDescription: `Auto-healed code. Improvement: +${healResult.improvement?.toFixed?.(3) || '?'}. New coherency: ${healResult.newCoherency?.toFixed?.(3) || '?'}`,
          language,
          tags: ['auto-debug', 'auto-healed', 'feedback'],
        });

        if (forwardResult.captured) {
          report.forwarded++;
          // Mark as resolved since healing proved it works
          try {
            debug.reportOutcome(forwardResult.pattern.id, true);
          } catch (_) { /* best effort */ }
        }
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-debug:captureFeedbackDebug]', e?.message || e);
    report.errors.push(e.message || String(e));
  }

  return report;
}

/**
 * Run the debug sweep — grow variants + sync to personal store.
 *
 * This should run:
 *   - At the end of auto-submit (post-commit hook)
 *   - At the end of a session (auto-submit CLI)
 *   - Standalone via `oracle auto-debug-sweep`
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {object} options
 * @param {boolean} options.silent — Suppress output
 * @param {boolean} options.dryRun — Preview only
 * @param {number} options.minConfidence — Min confidence for growth (default 0.3)
 * @returns {{ grown: object, synced: object, errors: string[] }}
 */
function debugSweep(oracle, options = {}) {
  const { silent = false, dryRun = false, minConfidence = 0.3 } = options;

  const report = { grown: null, synced: null, errors: [] };
  const log = silent ? () => {} : (msg) => console.log(`[auto-debug] ${msg}`);

  // Step 1: Grow debug pattern variants from high-confidence patterns
  try {
    if (!dryRun) {
      const growResult = oracle.debugGrow({ minConfidence });
      report.grown = growResult;
      if (growResult.stored > 0) {
        log(`Grew ${growResult.stored} debug variant(s) from ${growResult.processed} pattern(s)`);
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-debug:debugSweep] grow failed:', e?.message || e);
    report.errors.push(`grow: ${e.message}`);
  }

  // Step 2: Sync debug patterns to personal store
  try {
    if (!dryRun) {
      const syncResult = oracle.debugSyncPersonal({ verbose: false });
      report.synced = syncResult;
      if (syncResult.synced > 0) {
        log(`Synced ${syncResult.synced} debug pattern(s) to personal store`);
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-debug:debugSweep] sync failed:', e?.message || e);
    report.errors.push(`sync: ${e.message}`);
  }

  return report;
}

module.exports = { captureResolveDebug, captureFeedbackDebug, debugSweep };
