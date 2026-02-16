/**
 * Oracle Core — Similarity detection.
 * Prevents near-duplicate pollution and routes close variants to candidates.
 */

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
    const sim = _codeSimilarity(code, pat.code || '');
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
  _checkSimilarity,
};
