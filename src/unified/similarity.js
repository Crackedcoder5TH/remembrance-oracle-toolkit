'use strict';

/**
 * Unified Similarity Engine — single implementation for code similarity detection.
 *
 * Replaces three separate implementations:
 *   - src/api/oracle-core-similarity.js (Jaccard + structural for submit dedup)
 *   - src/api/oracle-patterns-candidates.js (re-implemented similarity for candidate eval)
 *   - src/debug/debug-oracle.js computeFixSimilarity (Jaccard for debug patterns)
 *
 * Provides one engine with configurable thresholds for different contexts.
 */

// ─── Optional Dependencies ───

let _structuralFingerprint;
try {
  ({ structuralFingerprint: _structuralFingerprint } = require('../compression/fractal'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[unified-similarity:init] fractal not available:', e?.message || e);
  _structuralFingerprint = null;
}

let _familyAwareSimilarity;
try {
  ({ familyAwareSimilarity: _familyAwareSimilarity } = require('../compression/fractal-library-bridge'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[unified-similarity:init] bridge not available:', e?.message || e);
}

// ─── Thresholds ───

const THRESHOLDS = {
  /** Submit dedup — strict: near-duplicates rejected, close variants → candidates */
  submit: {
    reject: 0.95,
    candidate: 0.85,
    jaccardWeight: 0.6,
    structuralWeight: 0.4,
  },
  /** Candidate evaluation — moderate: less strict for candidate matching */
  candidate: {
    reject: 0.95,
    candidate: 0.80,
    jaccardWeight: 0.7,
    structuralWeight: 0.3,
  },
  /** Debug pattern matching — lenient: focus on finding similar fixes */
  debug: {
    reject: 0.98,
    candidate: 0.75,
    jaccardWeight: 1.0,
    structuralWeight: 0.0,
  },
  /** Near-duplicate merge (self-optimize) */
  merge: {
    reject: 0.92,
    candidate: 0.85,
    jaccardWeight: 0.5,
    structuralWeight: 0.5,
  },
};

// ─── Core Functions ───

/**
 * Compute Jaccard token similarity between two code strings.
 * Fast O(n) comparison using word-level tokenization.
 *
 * @param {string} codeA - First code string
 * @param {string} codeB - Second code string
 * @returns {number} Similarity score 0-1
 */
function jaccardSimilarity(codeA, codeB) {
  if (!codeA || !codeB) return 0;
  const tokensA = new Set((codeA.match(/\b\w+\b/g) || []).map(t => t.toLowerCase()));
  const tokensB = new Set((codeB.match(/\b\w+\b/g) || []).map(t => t.toLowerCase()));
  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Compute structural similarity via fractal fingerprinting.
 * Two code blocks with the same structure but different names score 1.0.
 *
 * @param {string} codeA - First code string
 * @param {string} codeB - Second code string
 * @param {string} language - Programming language
 * @returns {number} 0.0 or 1.0
 */
function structuralSimilarity(codeA, codeB, language) {
  if (!_structuralFingerprint) return 0;
  try {
    const fpA = _structuralFingerprint(codeA, language);
    const fpB = _structuralFingerprint(codeB, language);
    return fpA.hash === fpB.hash ? 1.0 : 0.0;
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[unified-similarity:structural] silent failure:', e?.message || e);
    return 0;
  }
}

/**
 * Compute blended similarity between two code strings.
 * Uses configurable blend of Jaccard + structural similarity.
 *
 * @param {string} codeA - First code string
 * @param {string} codeB - Second code string
 * @param {string} [language] - Programming language for structural comparison
 * @param {object} [options] - { jaccardWeight, structuralWeight } or { context: 'submit'|'candidate'|'debug'|'merge' }
 * @returns {number} Blended similarity 0-1
 */
function codeSimilarity(codeA, codeB, language, options = {}) {
  if (!codeA || !codeB) return 0;
  const config = resolveThresholds(options);
  const jaccard = jaccardSimilarity(codeA, codeB);
  const structural = structuralSimilarity(codeA, codeB, language);

  if (structural > 0) {
    return jaccard * config.jaccardWeight + structural * config.structuralWeight;
  }
  return jaccard;
}

/**
 * Check if submitted code is too similar to existing patterns.
 * Returns action: 'accept' | 'candidate' | 'reject'.
 *
 * @param {string} code - Code to check
 * @param {Array} patterns - Existing patterns to compare against
 * @param {string} [language] - Programming language
 * @param {object} [options] - { context: 'submit'|'candidate'|'debug'|'merge' } or custom thresholds
 * @returns {{ action: 'accept'|'candidate'|'reject', similarity: number, matchedPattern: object|null }}
 */
function checkSimilarity(code, patterns, language, options = {}) {
  const config = resolveThresholds(options);
  const lang = (language || '').toLowerCase();
  let maxSimilarity = 0;
  let matchedPattern = null;

  for (const pat of patterns) {
    // Only compare against same language when specified
    if (lang && (pat.language || '').toLowerCase() !== lang) continue;
    const sim = codeSimilarity(code, pat.code || pat.fixCode || '', lang, options);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      matchedPattern = pat;
    }
  }

  if (maxSimilarity >= config.reject) {
    return { action: 'reject', similarity: maxSimilarity, matchedPattern };
  }
  if (maxSimilarity >= config.candidate) {
    return { action: 'candidate', similarity: maxSimilarity, matchedPattern };
  }
  return { action: 'accept', similarity: maxSimilarity, matchedPattern };
}

// ─── Helpers ───

function resolveThresholds(options) {
  if (options.context && THRESHOLDS[options.context]) {
    return { ...THRESHOLDS[options.context], ...options };
  }
  return { ...THRESHOLDS.submit, ...options };
}

module.exports = {
  jaccardSimilarity,
  structuralSimilarity,
  codeSimilarity,
  checkSimilarity,
  THRESHOLDS,
  // Backwards-compatible aliases for oracle-core-similarity consumers
  _codeSimilarity: jaccardSimilarity,
  _structuralSimilarity: structuralSimilarity,
  _checkSimilarity: checkSimilarity,
  SIMILARITY_REJECT_THRESHOLD: THRESHOLDS.submit.reject,
  SIMILARITY_CANDIDATE_THRESHOLD: THRESHOLDS.submit.candidate,
};
