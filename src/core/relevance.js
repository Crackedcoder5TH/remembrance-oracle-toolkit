/**
 * Relevance matching engine.
 *
 * When an AI queries for code, this module finds the most relevant
 * snippets based on:
 * - Tag/keyword overlap
 * - Language match
 * - Description similarity (TF-IDF-like scoring)
 * - Coherency score (higher = preferred)
 */

const {
  MIN_TOKEN_LENGTH,
  CODE_SUBSTANCE,
  NAME_PENALTY,
  RELEVANCE_WEIGHTS,
  RELEVANCE_DEFAULTS,
} = require('../constants/thresholds');

/**
 * Tokenizes text into normalized lowercase tokens, filtering out short tokens.
 * @param {string} text - The text to tokenize
 * @returns {string[]} Array of normalized tokens
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > MIN_TOKEN_LENGTH);
}

/**
 * Computes term frequency (TF) scores for a set of tokens.
 * @param {string[]} tokens - Array of tokens to compute frequencies for
 * @returns {Object.<string, number>} Object mapping terms to their frequency ratios (0-1)
 */
function computeTF(tokens) {
  const freq = Object.create(null);
  for (const t of tokens) {
    freq[t] = (freq[t] || 0) + 1;
  }
  const total = tokens.length || 1;
  const tf = Object.create(null);
  for (const term of Object.keys(freq)) {
    tf[term] = freq[term] / total;
  }
  return tf;
}

/**
 * Computes cosine similarity between two term frequency vectors.
 * @param {Object.<string, number>} tfA - First TF vector
 * @param {Object.<string, number>} tfB - Second TF vector
 * @returns {number} Similarity score between 0 (no similarity) and 1 (identical)
 */
function cosineSimilarity(tfA, tfB) {
  const allTerms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
  let dot = 0, magA = 0, magB = 0;
  for (const term of allTerms) {
    const a = tfA[term] || 0;
    const b = tfB[term] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Computes relevance score between a query and an entry using TF-IDF-like scoring with tag overlap, language match, and coherency weighting.
 * @param {Object} query - Query object with description, tags, and language properties
 * @param {Object} entry - Entry object with description, tags, language, code, name, and coherencyScore properties
 * @returns {{relevance: number, breakdown: {textScore: number, tagOverlap: number, langMatch: number, coherency: number}}} Relevance score (0-1) with component breakdown
 */
function computeRelevance(query, entry) {
  const queryTokens = tokenize(
    `${query.description || ''} ${(query.tags || []).join(' ')} ${query.language || ''}`
  );
  const entryTokens = tokenize(
    `${entry.description || ''} ${(entry.tags || []).join(' ')} ${entry.language || ''}`
  );

  const queryTF = computeTF(queryTokens);
  const entryTF = computeTF(entryTokens);

  // Text similarity
  const textScore = cosineSimilarity(queryTF, entryTF);

  // Tag overlap boost
  const queryTags = new Set((query.tags || []).map(t => t.toLowerCase()));
  const entryTags = new Set((entry.tags || []).map(t => t.toLowerCase()));
  let tagOverlap = 0;
  if (queryTags.size > 0) {
    const intersection = [...queryTags].filter(t => entryTags.has(t));
    tagOverlap = intersection.length / queryTags.size;
  }

  // Language match
  const langMatch = query.language && entry.language &&
    query.language.toLowerCase() === entry.language.toLowerCase() ? 1.0 : 0.0;

  // Coherency weight — proven code ranks higher
  const coherency = entry.coherencyScore?.total ?? 0.5;

  // Code substance penalty — deprioritize trivial/stub patterns (only when code field is present)
  let substance = 1.0;
  let namePenalty = 1.0;
  if (entry.code !== undefined) {
    const codeLen = entry.code.length;
    substance = codeLen < CODE_SUBSTANCE.TRIVIAL_THRESHOLD ? CODE_SUBSTANCE.TRIVIAL_WEIGHT
      : codeLen < CODE_SUBSTANCE.SHORT_THRESHOLD ? CODE_SUBSTANCE.SHORT_WEIGHT
      : codeLen < CODE_SUBSTANCE.MEDIUM_THRESHOLD ? CODE_SUBSTANCE.MEDIUM_WEIGHT
      : CODE_SUBSTANCE.FULL_WEIGHT;
  }
  if (entry.name !== undefined) {
    namePenalty = entry.name.length <= NAME_PENALTY.SHORT_THRESHOLD ? NAME_PENALTY.SHORT_WEIGHT : 1.0;
  }

  // Final relevance score
  const relevance =
    (textScore * RELEVANCE_WEIGHTS.TEXT_SCORE +
    tagOverlap * RELEVANCE_WEIGHTS.TAG_OVERLAP +
    langMatch * RELEVANCE_WEIGHTS.LANGUAGE_MATCH +
    coherency * RELEVANCE_WEIGHTS.COHERENCY) * substance * namePenalty;

  return {
    relevance: Math.round(relevance * 1000) / 1000,
    breakdown: { textScore, tagOverlap, langMatch, coherency },
  };
}

/**
 * Ranks and filters entries by relevance to a query, returning the top matches.
 * @param {Object} query - Query object with description, tags, and language properties
 * @param {Object[]} entries - Array of entry objects to rank
 * @param {Object} [options={}] - Ranking options
 * @param {number} [options.limit] - Maximum number of results to return
 * @param {number} [options.minRelevance] - Minimum relevance threshold (0-1)
 * @param {number} [options.minCoherency] - Minimum coherency threshold (0-1)
 * @returns {Object[]} Sorted array of entries with _relevance property, filtered by thresholds and limited
 */
function rankEntries(query, entries, options = {}) {
  if (!Array.isArray(entries)) return [];
  if (query == null || typeof query !== 'object') return [];
  const { limit = RELEVANCE_DEFAULTS.LIMIT, minRelevance = RELEVANCE_DEFAULTS.MIN_RELEVANCE, minCoherency = RELEVANCE_DEFAULTS.MIN_COHERENCY } = options;

  const scored = entries
    .filter(entry => {
      const c = entry.coherencyScore?.total ?? 0;
      return c >= minCoherency;
    })
    .map(entry => ({
      ...entry,
      _relevance: computeRelevance(query, entry),
    }))
    .filter(entry => entry._relevance.relevance >= minRelevance)
    .sort((a, b) => b._relevance.relevance - a._relevance.relevance)
    .slice(0, limit);

  return scored;
}

module.exports = {
  computeRelevance,
  rankEntries,
  tokenize,
  computeTF,
  cosineSimilarity,
};
