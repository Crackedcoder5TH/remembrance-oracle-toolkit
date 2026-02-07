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

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function computeTF(tokens) {
  const freq = {};
  for (const t of tokens) {
    freq[t] = (freq[t] || 0) + 1;
  }
  const total = tokens.length || 1;
  const tf = {};
  for (const [term, count] of Object.entries(freq)) {
    tf[term] = count / total;
  }
  return tf;
}

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

function computeRelevance(query, entry) {
  const queryTokens = tokenize(
    `${query.description || ''} ${(query.tags || []).join(' ')} ${query.language || ''}`
  );
  const entryTokens = tokenize(
    `${entry.description || ''} ${(entry.tags || []).join(' ')} ${entry.language || ''} ${entry.code || ''}`
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
    substance = codeLen < 35 ? 0.4 : codeLen < 70 ? 0.75 : codeLen < 130 ? 0.9 : 1.0;
  }
  if (entry.name !== undefined) {
    namePenalty = entry.name.length <= 2 ? 0.5 : 1.0;
  }

  // Final relevance score
  const relevance =
    (textScore * 0.35 +
    tagOverlap * 0.25 +
    langMatch * 0.15 +
    coherency * 0.25) * substance * namePenalty;

  return {
    relevance: Math.round(relevance * 1000) / 1000,
    breakdown: { textScore, tagOverlap, langMatch, coherency },
  };
}

function rankEntries(query, entries, options = {}) {
  const { limit = 10, minRelevance = 0.1, minCoherency = 0.0 } = options;

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
