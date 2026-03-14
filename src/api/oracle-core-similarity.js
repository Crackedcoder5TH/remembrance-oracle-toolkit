/**
 * Oracle Core — Similarity detection.
 * Prevents near-duplicate pollution and routes close variants to candidates.
 * Uses Jaccard token similarity + structural fingerprint comparison.
 */

let _structuralFingerprint;
try {
  ({ structuralFingerprint: _structuralFingerprint } = require('../compression/fractal'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-similarity:init] silent failure:', e?.message || e);
  _structuralFingerprint = null;
}

// ─── Similarity Thresholds ───
const SIMILARITY_REJECT_THRESHOLD = 0.95;    // >= 95% similar → reject (near-duplicate)
const SIMILARITY_CANDIDATE_THRESHOLD = 0.85; // 85-94% similar → route to candidates
// < 85% similar → accept as new pattern

/**
 * Compute Jaccard token similarity between two code strings.
 * Fast O(n) comparison using word-level tokenization.
 */
function _codeSimilarity(codeA, codeB) {
  const tokensA = new Set((codeA.match(/\b\w+\b/g) || []).map(t => t.toLowerCase()));
  const tokensB = new Set((codeB.match(/\b\w+\b/g) || []).map(t => t.toLowerCase()));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Compute structural similarity via fractal fingerprinting.
 * Two code blocks with the same structure but different names score 1.0.
 */
function _structuralSimilarity(codeA, codeB, language) {
  if (!_structuralFingerprint) return 0;
  try {
    const fpA = _structuralFingerprint(codeA, language);
    const fpB = _structuralFingerprint(codeB, language);
    return fpA.hash === fpB.hash ? 1.0 : 0.0;
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-similarity:_structuralSimilarity] silent failure:', e?.message || e);
    return 0;
  }
}

/**
 * Check if submitted code is too similar to existing patterns.
 * Returns: { action: 'accept'|'candidate'|'reject', similarity, matchedPattern }
 */
function _checkSimilarity(code, patterns, language) {
  const lang = (language || '').toLowerCase();
  let maxSimilarity = 0;
  let matchedPattern = null;

  for (const pat of patterns) {
    // Only compare against same language
    if (lang && (pat.language || '').toLowerCase() !== lang) continue;
    const jaccard = _codeSimilarity(code, pat.code || '');
    const structural = _structuralSimilarity(code, pat.code || '', lang);
    // Blend: Jaccard 60% + structural 40%
    const sim = structural > 0 ? jaccard * 0.6 + structural * 0.4 : jaccard;
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      matchedPattern = pat;
    }
  }

  if (maxSimilarity >= SIMILARITY_REJECT_THRESHOLD) {
    return { action: 'reject', similarity: maxSimilarity, matchedPattern };
  }
  if (maxSimilarity >= SIMILARITY_CANDIDATE_THRESHOLD) {
    return { action: 'candidate', similarity: maxSimilarity, matchedPattern };
  }
  return { action: 'accept', similarity: maxSimilarity, matchedPattern };
}

module.exports = {
  SIMILARITY_REJECT_THRESHOLD,
  SIMILARITY_CANDIDATE_THRESHOLD,
  _codeSimilarity,
  _structuralSimilarity,
  _checkSimilarity,
};
