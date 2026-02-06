/**
 * Lightweight Semantic Embeddings for Code Search
 *
 * Instead of relying on an external API, this module builds semantic
 * embeddings using three complementary signals:
 *
 * 1. Concept mapping — maps natural language to code concept clusters
 *    ("prevent calling too often" → throttle/debounce/rate-limit)
 *
 * 2. Character n-gram hashing — captures structural similarity
 *    (similar variable names, patterns, syntax)
 *
 * 3. Weighted word vectors — TF-IDF enhanced with synonym expansion
 *
 * The combination means "I need a function that prevents calling too
 * often" correctly matches throttle/debounce even without keyword overlap.
 */

// ─── Concept Clusters ───
// Each cluster maps intent-level descriptions to code-level concepts.
// When a query matches a cluster, ALL concepts in that cluster become relevant.
const CONCEPT_CLUSTERS = [
  {
    id: 'rate-limiting',
    triggers: ['rate', 'limit', 'prevent', 'too often', 'too many', 'too fast', 'frequency', 'spam', 'flood', 'burst'],
    concepts: ['throttle', 'debounce', 'rate-limit', 'cooldown', 'interval', 'setTimeout', 'clearTimeout', 'delay'],
  },
  {
    id: 'caching',
    triggers: ['cache', 'remember', 'memoize', 'memo', 'already computed', 'save result', 'reuse', 'store result', 'lookup'],
    concepts: ['memoize', 'cache', 'lru', 'memo', 'Map', 'WeakMap', 'hash', 'lookup table', 'memorize'],
  },
  {
    id: 'sorting',
    triggers: ['sort', 'order', 'arrange', 'rank', 'ascending', 'descending', 'smallest', 'largest', 'compare'],
    concepts: ['sort', 'quicksort', 'mergesort', 'heapsort', 'bubble', 'insertion', 'pivot', 'compare', 'swap', 'partition'],
  },
  {
    id: 'searching',
    triggers: ['find', 'search', 'locate', 'lookup', 'index of', 'contains', 'binary', 'exist', 'position'],
    concepts: ['search', 'binary-search', 'find', 'indexOf', 'includes', 'lookup', 'bsearch', 'lo', 'hi', 'mid'],
  },
  {
    id: 'graph-traversal',
    triggers: ['traverse', 'walk', 'visit', 'explore', 'graph', 'tree', 'path', 'connected', 'reachable', 'neighbors'],
    concepts: ['bfs', 'dfs', 'breadth-first', 'depth-first', 'queue', 'stack', 'visited', 'adjacency', 'neighbor', 'graph', 'tree'],
  },
  {
    id: 'validation',
    triggers: ['validate', 'check', 'verify', 'ensure', 'valid', 'invalid', 'format', 'correct', 'proper', 'well-formed'],
    concepts: ['validate', 'check', 'regex', 'pattern', 'test', 'isValid', 'sanitize', 'guard', 'assert', 'schema'],
  },
  {
    id: 'async-control',
    triggers: ['retry', 'backoff', 'timeout', 'exponential', 'attempt', 'fail', 'resilient', 'robust', 'recover'],
    concepts: ['retry', 'backoff', 'exponential', 'attempt', 'setTimeout', 'Promise', 'async', 'await', 'catch', 'delay'],
  },
  {
    id: 'data-transform',
    triggers: ['flatten', 'transform', 'convert', 'reshape', 'group', 'aggregate', 'reduce', 'collect', 'bucket', 'categorize'],
    concepts: ['flatten', 'deep', 'reduce', 'map', 'groupBy', 'group', 'aggregate', 'transform', 'collect', 'bucket'],
  },
  {
    id: 'composition',
    triggers: ['compose', 'chain', 'pipe', 'combine', 'sequence', 'flow', 'connect', 'pipeline', 'middleware'],
    concepts: ['pipe', 'compose', 'chain', 'flow', 'middleware', 'reduce', 'sequence', 'pipeline', 'combinator'],
  },
  {
    id: 'cloning',
    triggers: ['copy', 'clone', 'duplicate', 'deep copy', 'shallow', 'immutable', 'snapshot', 'replica'],
    concepts: ['clone', 'deep-clone', 'copy', 'structuredClone', 'JSON.parse', 'JSON.stringify', 'spread', 'Object.assign', 'immutable'],
  },
  {
    id: 'data-structures',
    triggers: ['stack', 'queue', 'linked list', 'hash map', 'set', 'heap', 'priority', 'trie', 'prefix'],
    concepts: ['stack', 'queue', 'linkedList', 'hashMap', 'set', 'heap', 'priority-queue', 'trie', 'prefix-tree', 'deque'],
  },
  {
    id: 'string-processing',
    triggers: ['string', 'text', 'parse', 'format', 'template', 'interpolate', 'regex', 'pattern', 'match', 'replace'],
    concepts: ['string', 'regex', 'replace', 'match', 'split', 'join', 'trim', 'template', 'format', 'interpolate', 'parse'],
  },
  {
    id: 'error-handling',
    triggers: ['error', 'exception', 'handle', 'catch', 'throw', 'fail', 'graceful', 'recover', 'fallback'],
    concepts: ['try', 'catch', 'throw', 'Error', 'exception', 'fallback', 'handler', 'recover', 'wrap', 'safe'],
  },
  {
    id: 'concurrency',
    triggers: ['parallel', 'concurrent', 'async', 'simultaneous', 'race', 'all', 'pool', 'worker', 'thread'],
    concepts: ['Promise.all', 'Promise.race', 'parallel', 'pool', 'worker', 'async', 'concurrent', 'semaphore', 'mutex', 'queue'],
  },
];

// ─── N-gram Embedding ───

/**
 * Generate character n-grams from text.
 */
function charNgrams(text, n = 3) {
  const lower = text.toLowerCase();
  const grams = {};
  for (let i = 0; i <= lower.length - n; i++) {
    const gram = lower.slice(i, i + n);
    grams[gram] = (grams[gram] || 0) + 1;
  }
  return grams;
}

/**
 * Cosine similarity between two sparse vectors (objects).
 */
function cosineSim(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const key in a) {
    magA += a[key] * a[key];
    if (key in b) dot += a[key] * b[key];
  }
  for (const key in b) {
    magB += b[key] * b[key];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

// ─── Concept Expansion ───

/**
 * Expand a query using concept clusters.
 * Returns the original terms PLUS activated concept terms.
 */
function expandQuery(query) {
  const lower = query.toLowerCase();
  const words = lower.split(/\s+/).filter(w => w.length > 1);
  const expanded = new Set(words);

  const textContains = (text, term) => {
    if (term.length <= 3) {
      return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
    }
    return text.includes(term);
  };

  for (const cluster of CONCEPT_CLUSTERS) {
    const triggered = cluster.triggers.some(t => textContains(lower, t));
    if (triggered) {
      for (const concept of cluster.concepts) {
        expanded.add(concept.toLowerCase());
      }
    }
  }

  return [...expanded];
}

/**
 * Check which concept clusters a piece of text activates.
 * Returns cluster IDs and a concept richness score.
 */
function identifyConcepts(text) {
  const lower = text.toLowerCase();
  const activated = [];

  // Use word boundary for short terms to avoid substring false positives
  // ("lo" inside "hello", "hi" inside "this")
  const textContains = (term) => {
    if (term.length <= 3) {
      return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower);
    }
    return lower.includes(term);
  };

  for (const cluster of CONCEPT_CLUSTERS) {
    const triggerHits = cluster.triggers.filter(t => textContains(t)).length;
    const conceptHits = cluster.concepts.filter(c => textContains(c.toLowerCase())).length;
    const score = (triggerHits + conceptHits) / (cluster.triggers.length + cluster.concepts.length);
    if (score > 0) {
      activated.push({ id: cluster.id, score, triggerHits, conceptHits });
    }
  }

  return activated.sort((a, b) => b.score - a.score);
}

// ─── Semantic Search Engine ───

/**
 * Compute semantic similarity between a query and a document.
 *
 * Combines three signals:
 * 1. Concept overlap (0.45 weight) — intent-level matching
 * 2. Expanded keyword matching (0.35 weight) — synonym-aware TF-IDF
 * 3. N-gram structural similarity (0.20 weight) — character-level patterns
 *
 * Returns: { similarity, conceptScore, keywordScore, ngramScore, matchedConcepts }
 */
function semanticSimilarity(query, document) {
  const queryLower = query.toLowerCase();
  const docLower = document.toLowerCase();

  // 1. Concept overlap
  const queryConcepts = identifyConcepts(queryLower);
  const docConcepts = identifyConcepts(docLower);
  const queryConceptIds = new Set(queryConcepts.map(c => c.id));
  const docConceptIds = new Set(docConcepts.map(c => c.id));

  let conceptScore = 0;
  if (queryConceptIds.size > 0) {
    const intersection = [...queryConceptIds].filter(id => docConceptIds.has(id));
    const union = new Set([...queryConceptIds, ...docConceptIds]);
    conceptScore = union.size > 0 ? intersection.length / union.size : 0;

    // Boost if the overlapping concepts have high individual scores in BOTH
    for (const id of intersection) {
      const qScore = queryConcepts.find(c => c.id === id)?.score || 0;
      const dScore = docConcepts.find(c => c.id === id)?.score || 0;
      conceptScore += Math.min(qScore, dScore) * 0.5;
    }
    conceptScore = Math.min(1, conceptScore);
  }

  // 2. Expanded keyword matching
  const expandedQuery = expandQuery(query);
  const docWords = docLower.split(/[^a-z0-9]+/).filter(w => w.length > 1);
  const docWordSet = new Set(docWords);

  let keywordHits = 0;
  for (const term of expandedQuery) {
    if (docWordSet.has(term) || docLower.includes(term)) {
      keywordHits++;
    }
  }
  const keywordScore = expandedQuery.length > 0 ? Math.min(1, keywordHits / expandedQuery.length) : 0;

  // 3. N-gram structural similarity (use shorter n=2 for better cross-naming match)
  const queryGrams = charNgrams(queryLower, 2);
  const docGrams = charNgrams(docLower, 2);
  const ngramScore = cosineSim(queryGrams, docGrams);

  // Weighted combination
  const similarity = conceptScore * 0.45 + keywordScore * 0.35 + ngramScore * 0.20;

  return {
    similarity,
    conceptScore,
    keywordScore,
    ngramScore,
    matchedConcepts: [...queryConceptIds].filter(id => docConceptIds.has(id)),
  };
}

/**
 * Search a collection of items semantically.
 *
 * items: array of objects, each with at least { name, description, tags, code }
 * query: natural language search string
 * options: { limit, minScore, language }
 *
 * Returns ranked results with similarity scores.
 */
function semanticSearch(items, query, options = {}) {
  const { limit = 10, minScore = 0.05, language } = options;

  let filtered = items;
  if (language) {
    filtered = filtered.filter(item =>
      (item.language || '').toLowerCase() === language.toLowerCase()
    );
  }

  const results = filtered.map(item => {
    // Build a rich text representation for matching
    const docText = [
      item.name || '',
      item.description || '',
      (item.tags || []).join(' '),
      item.code || '',
    ].join(' ');

    const sim = semanticSimilarity(query, docText);

    // Name match bonus — if query concepts appear in the name, it's very likely relevant
    const nameText = (item.name || '').toLowerCase();
    const nameSim = semanticSimilarity(query, nameText);
    const nameBonus = nameSim.similarity > 0.1 ? nameSim.similarity * 0.3 : 0;

    return {
      ...item,
      semanticScore: Math.min(1, sim.similarity + nameBonus),
      matchedConcepts: sim.matchedConcepts,
      _debug: { ...sim, nameBonus },
    };
  })
  .filter(r => r.semanticScore >= minScore)
  .sort((a, b) => b.semanticScore - a.semanticScore)
  .slice(0, limit);

  return results;
}

module.exports = {
  semanticSearch,
  semanticSimilarity,
  expandQuery,
  identifyConcepts,
  charNgrams,
  cosineSim,
  CONCEPT_CLUSTERS,
};
