/**
 * Coherency scoring engine for the Remembrance Oracle.
 *
 * NOW DELEGATES to src/unified/coherency.js — the single source of truth.
 * This file remains for backwards compatibility; all logic lives in the unified module.
 *
 * Scores code snippets on a 0-1 scale across multiple dimensions:
 * - Syntax validity (does it parse?)
 * - Completeness (no dangling references?)
 * - Consistency (naming, style coherence)
 * - Readability (comment density, nesting depth, naming quality)
 * - Security (injection, unsafe patterns)
 * - Test proof (did it pass validation?)
 * - Historical reliability (how often has it worked?)
 */

const unified = require('../unified/coherency');

module.exports = {
  computeCoherencyScore: unified.computeCoherencyScore,
  computeCoverageGate: unified.computeCoverageGate,
  scoreSyntax: unified.scoreSyntax,
  scoreCompleteness: unified.scoreCompleteness,
  scoreConsistency: unified.scoreConsistency,
  scoreReadability: unified.scoreReadability,
  scoreSecurity: unified.scoreSecurity,
  scoreNamingQuality: unified.scoreNamingQuality,
  detectLanguage: unified.detectLanguage,
  checkBalancedBraces: unified.checkBalancedBraces,
  WEIGHTS: unified.WEIGHTS,
  WEIGHT_PRESETS: unified.WEIGHT_PRESETS,
};
