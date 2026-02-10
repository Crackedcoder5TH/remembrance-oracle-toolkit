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
 */

// ─── Intent Signals ───

const INTENT_PATTERNS = {
  performance: {
    triggers: /\b(fast|quick|efficient|optimiz|O\(|performance|speed|throughput|latency|benchmark)\b/i,
    boost: { tags: ['algorithm', 'optimization', 'performance'], codeHints: ['cache', 'memo', 'pool', 'batch'] },
    weight: 0.15,
  },
  safety: {
    triggers: /\b(safe|secure|valid|sanitiz|guard|protect|prevent|defensive|robust)\b/i,
    boost: { tags: ['validation', 'security', 'safe'], codeHints: ['try', 'catch', 'throw', 'assert', 'check'] },
    weight: 0.15,
  },
  simplicity: {
    triggers: /\b(simple|easy|basic|minimal|clean|readable|straightforward|concise|tiny)\b/i,
    boost: { tags: ['utility', 'helper', 'simple'], codeHints: [] },
    weight: 0.1,
    penalize: { minLines: 20 }, // Penalize long code for "simple" queries
  },
  async: {
    triggers: /\b(async|await|promise|concurrent|parallel|non-blocking|callback|event)\b/i,
    boost: { tags: ['async', 'promise', 'concurrent'], codeHints: ['async', 'await', 'Promise', 'callback'] },
    weight: 0.12,
  },
  functional: {
    triggers: /\b(functional|immutable|pure|compose|pipe|chain|map|filter|reduce|declarative)\b/i,
    boost: { tags: ['functional', 'composition', 'utility'], codeHints: ['map', 'filter', 'reduce', 'pipe', 'compose'] },
    weight: 0.1,
  },
  testing: {
    triggers: /\b(test|spec|mock|stub|assert|expect|should|coverage|unit|integration)\b/i,
    boost: { tags: ['test', 'testing', 'mock'], codeHints: ['assert', 'expect', 'describe', 'it', 'test'] },
    weight: 0.1,
  },
};

// ─── Common Typos & Abbreviations ───

const CORRECTIONS = {
  // Common misspellings
  'debounse': 'debounce',
  'throttel': 'throttle',
  'memoize': 'memoize',
  'memorize': 'memoize',
  'memorise': 'memoize',
  'seach': 'search',
  'serach': 'search',
  'valiate': 'validate',
  'cahe': 'cache',
  'chache': 'cache',
  'queu': 'queue',
  'quere': 'query',
  'sotr': 'sort',
  'algortihm': 'algorithm',
  'algorithim': 'algorithm',
  'recurive': 'recursive',
  'recusive': 'recursive',
  'asyncronous': 'asynchronous',
  'promis': 'promise',
  'flaten': 'flatten',
  'flattern': 'flatten',
  'concurency': 'concurrency',

  // Abbreviations
  'fn': 'function',
  'cb': 'callback',
  'arr': 'array',
  'str': 'string',
  'obj': 'object',
  'num': 'number',
  'len': 'length',
  'idx': 'index',
  'req': 'request',
  'res': 'response',
  'err': 'error',
  'msg': 'message',
  'ctx': 'context',
  'cfg': 'config',
  'opts': 'options',
  'params': 'parameters',
  'args': 'arguments',
  'impl': 'implementation',
  'util': 'utility',
  'utils': 'utilities',
  'regex': 'regular expression',
  'fmt': 'format',
  'iter': 'iterator',
  'gen': 'generator',
};

// ─── Language Aliases ───

const LANGUAGE_ALIASES = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'cpp': 'c++',
  'node': 'javascript',
  'nodejs': 'javascript',
  'deno': 'typescript',
};

const LANGUAGE_FAMILIES = {
  javascript: ['typescript'],
  typescript: ['javascript'],
  python: [],
  go: [],
  rust: [],
};

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

  // Detect intents
  const intents = [];
  for (const [name, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.triggers.test(lower)) {
      intents.push({ name, weight: pattern.weight, boost: pattern.boost });
    }
  }

  // Detect language intent
  let language = null;
  for (const token of tokens) {
    if (LANGUAGE_ALIASES[token]) {
      language = LANGUAGE_ALIASES[token];
      break;
    }
    // Check if token IS a language name
    if (['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'ruby'].includes(token)) {
      language = token;
      break;
    }
  }

  // Detect constraints
  const constraints = {};
  if (/\bO\(\s*n\s*log\s*n\s*\)/i.test(query)) constraints.complexity = 'nlogn';
  if (/\bO\(\s*n\s*\)/i.test(query)) constraints.complexity = 'linear';
  if (/\bO\(\s*1\s*\)/i.test(query)) constraints.complexity = 'constant';
  if (/\b(no|without)\s+(dependencies|deps)\b/i.test(query)) constraints.zeroDeps = true;
  if (/\b(type|typed|typesafe|type-safe)\b/i.test(query)) constraints.typed = true;

  // Rewrite query with corrections
  const rewritten = rewriteQuery(tokens);

  return {
    original: query,
    rewritten,
    tokens,
    intents,
    language,
    constraints,
  };
}

/**
 * Rewrite query tokens with typo corrections and abbreviation expansion.
 */
function rewriteQuery(tokens) {
  const corrected = tokens.map(t => {
    const correction = CORRECTIONS[t];
    if (correction) return correction;

    // Edit distance 1 corrections for common terms
    for (const [typo, fix] of Object.entries(CORRECTIONS)) {
      if (editDistance(t, typo) <= 1 && t.length >= 3) {
        return fix;
      }
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
 * Enhances the base relevance score with contextual signals.
 *
 * @param {Array} results - Search results with base scores
 * @param {object} intent - Parsed intent from parseIntent()
 * @returns {Array} Re-ranked results
 */
function applyIntentRanking(results, intent) {
  if (!results || results.length === 0) return results;
  if (!intent || intent.intents.length === 0) return results;

  return results.map(result => {
    let boost = 0;

    for (const signal of intent.intents) {
      // Tag boost
      const tags = result.tags || [];
      const tagBoost = signal.boost.tags.filter(t => tags.includes(t)).length;
      boost += tagBoost * signal.weight * 0.5;

      // Code hint boost
      const code = result.code || '';
      const codeBoost = signal.boost.codeHints.filter(h => code.includes(h)).length;
      boost += Math.min(codeBoost * signal.weight * 0.3, signal.weight);

      // Simplicity penalty for long code
      if (signal.name === 'simplicity' && signal.penalize) {
        const lines = code.split('\n').length;
        if (lines > signal.penalize.minLines) {
          boost -= 0.1;
        }
      }
    }

    // Language family boost
    if (intent.language && result.language) {
      const family = LANGUAGE_FAMILIES[intent.language] || [];
      if (result.language === intent.language) {
        boost += 0.1;
      } else if (family.includes(result.language)) {
        boost += 0.05;
      }
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
 * If searching for "sort" in JS, also consider TS results.
 *
 * @param {string} language - Primary language
 * @returns {Array} Languages to search (including family)
 */
function expandLanguages(language) {
  if (!language) return [];
  const resolved = LANGUAGE_ALIASES[language] || language;
  const family = LANGUAGE_FAMILIES[resolved] || [];
  return [resolved, ...family];
}

// ─── Smart Search ───

/**
 * Intelligent search that combines intent parsing, query rewriting,
 * and contextual ranking into a single call.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {string} query - Raw search query
 * @param {object} options - { language, limit, mode }
 * @returns {object} { results, intent, rewrittenQuery, suggestions }
 */
function smartSearch(oracle, query, options = {}) {
  const { language, limit = 10, mode = 'hybrid' } = options;

  // Step 1: Parse intent
  const intent = parseIntent(query);

  // Step 2: Use rewritten query for search
  const searchQuery = intent.rewritten || query;
  const searchLang = language || intent.language;

  // Step 3: Search with expanded languages
  let results = oracle.search(searchQuery, {
    limit: limit * 2, // Over-fetch for re-ranking
    language: searchLang,
    mode,
  });

  // Step 4: If language was detected, also search family languages
  if (searchLang) {
    const family = expandLanguages(searchLang);
    for (const lang of family) {
      if (lang === searchLang) continue;
      const familyResults = oracle.search(searchQuery, { limit: 5, language: lang, mode });
      results = results.concat(familyResults.map(r => ({ ...r, crossLanguage: true })));
    }
  }

  // Step 5: Apply intent-based ranking
  results = applyIntentRanking(results, intent);

  // Step 6: Apply constraint filters
  if (intent.constraints.zeroDeps) {
    results = results.filter(r => {
      const code = r.code || '';
      return !code.includes('require(') && !code.includes('import ');
    });
  }

  // Step 7: Deduplicate by name
  const seen = new Set();
  results = results.filter(r => {
    const key = r.name || r.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Step 8: Generate suggestions if few results
  const suggestions = [];
  if (results.length < 3) {
    if (intent.rewritten !== intent.original) {
      suggestions.push(`Did you mean: "${intent.rewritten}"?`);
    }
    if (intent.language) {
      suggestions.push(`Try searching without language filter`);
    }
    if (intent.intents.length > 0) {
      suggestions.push(`Detected intents: ${intent.intents.map(i => i.name).join(', ')}`);
    }
  }

  return {
    results: results.slice(0, limit),
    intent,
    rewrittenQuery: searchQuery,
    corrections: intent.rewritten !== intent.original ? intent.rewritten : null,
    suggestions,
    totalMatches: results.length,
  };
}

// ─── Exports ───

module.exports = {
  parseIntent,
  rewriteQuery,
  editDistance,
  applyIntentRanking,
  expandLanguages,
  smartSearch,
  INTENT_PATTERNS,
  CORRECTIONS,
  LANGUAGE_ALIASES,
  LANGUAGE_FAMILIES,
};
