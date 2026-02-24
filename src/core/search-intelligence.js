/**
 * Search Intelligence — Intent Parsing + Contextual Ranking
 *
 * Enhances the base search pipeline (relevance.js + embeddings.js) with:
 *
 *   1. INTENT PARSING:    Extract constraints, preferences, and goals from queries
 *   2. QUERY REWRITING:   Typo correction, synonym expansion, abbreviation expansion
 *   3. CONTEXTUAL RANKING: Weight results by usage frequency, recency, feedback
 *   4. CROSS-LANGUAGE:    Find Python equivalents when searching in JS, etc.
 *   5. CONSTRAINT FILTERS: "fast sort" → O(n log n), "safe parse" → with validation
 *
 * Data constants live in search-intelligence-data.js for simplicity.
 */

const {
  INTENT_PATTERNS, CORRECTIONS, LANGUAGE_ALIASES,
  LANGUAGE_FAMILIES, KNOWN_LANGUAGES, ARCHITECTURAL_PATTERNS,
} = require('./search-intelligence-data');

// ─── Intent Parsing ───

/**
 * Parse a search query to extract structured intent.
 *
 * @param {string} query - Raw search query
 * @returns {object} Parsed intent with signals, corrections, constraints
 */
function parseIntent(query) {
  if (!query || typeof query !== 'string') {
    return { original: '', rewritten: '', tokens: [], intents: [], language: null, constraints: {} };
  }

  const lower = query.toLowerCase().trim();
  const tokens = lower.split(/\s+/).filter(t => t.length > 0);

  const intents = detectIntents(lower);
  const language = detectLanguage(tokens);
  const constraints = detectConstraints(query);
  const rewritten = rewriteQuery(tokens);

  return { original: query, rewritten, tokens, intents, language, constraints };
}

/**
 * Detect intent signals from query text.
 */
function detectIntents(lower) {
  const intents = [];
  for (const [name, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.triggers.test(lower)) {
      intents.push({ name, weight: pattern.weight, boost: pattern.boost, structural: !!pattern.structural });
    }
  }
  return intents;
}

/**
 * Detect language from query tokens.
 */
function detectLanguage(tokens) {
  for (const token of tokens) {
    if (LANGUAGE_ALIASES[token]) return LANGUAGE_ALIASES[token];
    if (KNOWN_LANGUAGES.has(token)) return token;
  }
  return null;
}

/**
 * Detect structured constraints from query text.
 */
function detectConstraints(query) {
  const constraints = {};
  if (/\bO\(\s*n\s*log\s*n\s*\)/i.test(query)) constraints.complexity = 'nlogn';
  if (/\bO\(\s*n\s*\)/i.test(query)) constraints.complexity = 'linear';
  if (/\bO\(\s*1\s*\)/i.test(query)) constraints.complexity = 'constant';
  if (/\b(no|without)\s+(dependencies|deps)\b/i.test(query)) constraints.zeroDeps = true;
  if (/\b(type|typed|typesafe|type-safe)\b/i.test(query)) constraints.typed = true;
  return constraints;
}

// ─── Query Rewriting ───

/**
 * Rewrite query tokens with typo corrections and abbreviation expansion.
 */
function rewriteQuery(tokens) {
  const corrected = tokens.map(t => {
    const correction = CORRECTIONS[t];
    if (correction) return correction;

    for (const [typo, fix] of Object.entries(CORRECTIONS)) {
      if (editDistance(t, typo) <= 1 && t.length >= 3) return fix;
    }

    return t;
  });

  return corrected.join(' ');
}

/**
 * Simple edit distance (Levenshtein) for typo detection.
 */
function editDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

// ─── Contextual Ranking ───

/**
 * Apply intent-based boosts to search results.
 */
function applyIntentRanking(results, intent) {
  if (!results || results.length === 0) return results;
  if (!intent || intent.intents.length === 0) return results;

  return results.map(result => {
    let boost = 0;

    for (const signal of intent.intents) {
      const tags = result.tags || [];
      boost += signal.boost.tags.filter(t => tags.includes(t)).length * signal.weight * 0.5;

      const code = result.code || '';
      const codeBoost = signal.boost.codeHints.filter(h => code.includes(h)).length;
      boost += Math.min(codeBoost * signal.weight * 0.3, signal.weight);

      if (signal.name === 'simplicity' && signal.penalize) {
        if (code.split('\n').length > signal.penalize.minLines) boost -= 0.1;
      }
    }

    if (intent.language && result.language) {
      const family = LANGUAGE_FAMILIES[intent.language] || [];
      if (result.language === intent.language) boost += 0.1;
      else if (family.includes(result.language)) boost += 0.05;
    }

    const enhancedScore = Math.min(1, Math.max(0, (result.matchScore || result.relevance || 0) + boost));

    return {
      ...result,
      matchScore: Math.round(enhancedScore * 1000) / 1000,
      intentBoost: Math.round(boost * 1000) / 1000,
      matchedIntents: intent.intents.map(i => i.name),
    };
  }).sort((a, b) => b.matchScore - a.matchScore);
}

// ─── Cross-Language Search ───

/**
 * Expand search to include related languages.
 */
function expandLanguages(language) {
  if (!language) return [];
  const resolved = LANGUAGE_ALIASES[language] || language;
  const family = LANGUAGE_FAMILIES[resolved] || [];
  return [resolved, ...family];
}

// ─── Search Mode Selection ───

/**
 * Select the optimal search mode based on parsed intent.
 */
function selectSearchMode(intent, requestedMode) {
  if (requestedMode && requestedMode !== 'auto') return requestedMode;
  if (!intent || intent.intents.length === 0) return 'hybrid';

  const intentNames = new Set(intent.intents.map(i => i.name));
  if (intentNames.has('performance') || intentNames.has('safety') || intentNames.has('functional') ||
      intentNames.has('architecture') || intentNames.has('designPattern')) {
    return 'semantic';
  }

  return 'hybrid';
}

// ─── Usage Boosts ───

/**
 * Apply usage-based boosts to search results.
 */
function applyUsageBoosts(results, oracle) {
  if (!results || results.length === 0) return results;

  try {
    const { computeUsageBoosts } = require('../analytics/actionable-insights');
    const boosts = computeUsageBoosts(oracle);
    if (boosts.size === 0) return results;

    return results.map(r => {
      const boost = boosts.get(r.id) || 0;
      if (boost > 0) {
        return { ...r, matchScore: Math.min(1, (r.matchScore || 0) + boost), usageBoost: boost };
      }
      return r;
    }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  } catch {
    return results;
  }
}

// ─── Constraint Filters ───

/**
 * Apply constraint filters to search results.
 */
function applyConstraintFilters(results, constraints) {
  if (!constraints) return results;

  let filtered = results;

  if (constraints.zeroDeps) {
    filtered = filtered.filter(r => {
      const code = r.code || '';
      return !code.includes('require(') && !code.includes('import ');
    });
  }

  if (constraints.typed) {
    filtered = filtered.filter(r => {
      const lang = (r.language || '').toLowerCase();
      const code = r.code || '';
      return lang === 'typescript' || code.includes(': string') || code.includes(': number');
    });
  }

  return filtered;
}

// ─── Deduplication ───

/**
 * Deduplicate results by name/id.
 */
function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(r => {
    const key = r.name || r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Architectural Injection ───

/**
 * Inject architectural patterns into search results when structural intent is detected.
 */
function injectArchitecturalResults(results, intent, limit) {
  const isStructural = intent.intents.some(i => i.structural);
  if (!isStructural) return results;

  const existingIds = new Set(results.map(r => r.id));
  const archMatches = ARCHITECTURAL_PATTERNS
    .filter(p => !existingIds.has(p.id))
    .map(p => {
      const query = intent.rewritten || intent.original;
      const words = query.toLowerCase().split(/\s+/);
      const allText = [p.name, p.description, ...p.tags].join(' ').toLowerCase();
      const hits = words.filter(w => w.length > 2 && allText.includes(w)).length;
      const matchScore = words.length > 0 ? Math.min(1, hits / words.length + 0.3) : 0.3;
      return { ...p, matchScore, intentBoost: 0.3, matchedIntents: ['architecture'] };
    })
    .filter(p => p.matchScore > 0.2)
    .sort((a, b) => b.matchScore - a.matchScore);

  return [...archMatches, ...results].slice(0, limit);
}

// ─── Suggestion Generation ───

/**
 * Generate search suggestions when results are sparse.
 */
function generateSuggestions(results, intent) {
  if (results.length >= 3) return [];

  const suggestions = [];
  if (intent.rewritten !== intent.original) suggestions.push(`Did you mean: "${intent.rewritten}"?`);
  if (intent.language) suggestions.push(`Try searching without language filter`);
  if (intent.intents.length > 0) suggestions.push(`Detected intents: ${intent.intents.map(i => i.name).join(', ')}`);
  return suggestions;
}

// ─── Embedding Merge ───

/**
 * Merge embedding-based results into main results (best-effort).
 */
function mergeEmbeddingResults(results, oracle, query, intent, language, limit, embeddingEngine) {
  if (!embeddingEngine || intent.intents.length === 0 || results.length >= limit) return results;

  try {
    const allPatterns = oracle.patterns.getAll();
    const embeddingResults = embeddingEngine.search(query, allPatterns, { limit, language });
    const existingIds = new Set(results.map(r => r.id));
    for (const er of embeddingResults) {
      if (!existingIds.has(er.id)) {
        results.push({ ...er, matchScore: er._relevance?.relevance || 0, embeddingMatch: true });
      }
    }
  } catch {
    // Embedding search is best-effort
  }

  return results;
}

/**
 * Fetch results from language-family expansion.
 */
function fetchFamilyResults(results, oracle, searchQuery, searchLang, searchMode) {
  if (!searchLang) return results;

  const family = expandLanguages(searchLang);
  for (const lang of family) {
    if (lang === searchLang) continue;
    const familyResults = oracle.search(searchQuery, { limit: 5, language: lang, mode: searchMode });
    results = results.concat(familyResults.map(r => ({ ...r, crossLanguage: true })));
  }
  return results;
}

// ─── Smart Search (Pipeline) ───

/**
 * Intelligent search that combines intent parsing, query rewriting,
 * contextual ranking, and embedding-tier selection into a single call.
 *
 * Pipeline: parse → select mode → rewrite → search → embed → expand → rank → boost → filter → dedup → inject → suggest
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {string} query - Raw search query
 * @param {object} options - { language, limit, mode, embeddingEngine }
 * @returns {object} { results, intent, rewrittenQuery, suggestions, searchMode }
 */
function smartSearch(oracle, query, options = {}) {
  const { language, limit = 10, mode = 'auto', embeddingEngine } = options;

  const intent = parseIntent(query);
  const searchMode = selectSearchMode(intent, mode);
  const searchQuery = intent.rewritten || query;
  const searchLang = language || intent.language;

  // Core search with over-fetch for re-ranking
  let results = oracle.search(searchQuery, { limit: limit * 2, language: searchLang, mode: searchMode });

  // Enrich: embeddings → family languages → intent ranking → usage boosts
  results = mergeEmbeddingResults(results, oracle, searchQuery, intent, searchLang, limit, embeddingEngine);
  results = fetchFamilyResults(results, oracle, searchQuery, searchLang, searchMode);
  results = applyIntentRanking(results, intent);
  results = applyUsageBoosts(results, oracle);

  // Narrow: constraints → dedup → architectural injection → suggestions
  results = applyConstraintFilters(results, intent.constraints);
  results = deduplicateResults(results);
  results = injectArchitecturalResults(results, intent, limit * 2);

  const suggestions = generateSuggestions(results, intent);

  return {
    results: results.slice(0, limit),
    intent,
    rewrittenQuery: searchQuery,
    corrections: intent.rewritten !== intent.original ? intent.rewritten : null,
    suggestions,
    totalMatches: results.length,
    searchMode,
  };
}

// ─── Exports ───

module.exports = {
  parseIntent,
  rewriteQuery,
  editDistance,
  applyIntentRanking,
  applyUsageBoosts,
  selectSearchMode,
  expandLanguages,
  smartSearch,
  injectArchitecturalResults,
  INTENT_PATTERNS,
  CORRECTIONS,
  LANGUAGE_ALIASES,
  LANGUAGE_FAMILIES,
  ARCHITECTURAL_PATTERNS,
};
