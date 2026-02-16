/**
 * Embedding Engine — Smarter search with local embeddings.
 *
 * Three tiers of embedding quality:
 *
 * Tier 1: Built-in (always available)
 *   - Enhanced bag-of-concepts: 64-dim vector from concept clusters + code structure
 *   - Combines: concept activation (14D) + code structure (18D) + word vector projection (32D)
 *
 * Tier 2: Ollama (local, optional)
 *   - Uses a local Ollama server for dense embeddings
 *   - Models: nomic-embed-text, all-minilm, mxbai-embed-large, etc.
 *
 * Tier 3: Plugin-provided (via SearchProviderRegistry)
 *   - Any external embedding API (OpenAI, Cohere, etc.)
 *
 * The engine auto-selects the best available tier and caches embeddings.
 */

const http = require('http');
const crypto = require('crypto');
const { CONCEPT_CLUSTERS, identifyConcepts, expandQuery } = require('./embeddings');

/** Hash text to produce a collision-resistant cache key. */
function cacheKey(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

// ─── Built-in Enhanced Embeddings (Tier 1) ───

// 18 structural features for code analysis
const CODE_STRUCTURE_FEATURES = [
  'has-loops',       // for/while/do
  'has-recursion',   // function calls self
  'has-async',       // async/await/Promise
  'has-class',       // class definition
  'has-closure',     // inner function/arrow
  'has-error-handling', // try/catch
  'has-generics',    // <T> type params
  'has-callbacks',   // function params
  'has-regex',       // RegExp usage
  'has-math',        // Math ops
  'has-io',          // fs/http/net
  'has-dom',         // document/window
  'has-testing',     // assert/expect/describe
  'has-destructuring', // { x } = or [ x ] =
  'has-spread',      // ...args
  'has-generator',   // function*/yield
  'has-conditional', // if/switch/ternary
  'has-types',       // type annotations
];

const STRUCTURE_PATTERNS = [
  /\b(for|while|do)\s*[\(\{]/,
  /\bfunction\s+(\w+)[^]*?\b\1\s*\(/,
  /\b(async|await|Promise)\b/,
  /\bclass\s+\w+/,
  /=>\s*[\{\(]|function\s*\(/,
  /\btry\s*\{/,
  /<\w+>/,
  /function\s*\([^)]*function|=>\s*\w+\s*=>/,
  /\/[^/\n]+\/[gimsuy]?|new\s+RegExp/,
  /Math\.\w+/,
  /\b(fs|http|net|require\(['"](?:fs|http|net))/,
  /\b(document|window|DOM|Element)\b/,
  /\b(assert|expect|describe|it|test)\b/,
  /\{[^}]*\}\s*=|\[[^\]]*\]\s*=/,
  /\.\.\.\w+/,
  /function\s*\*|yield\b/,
  /\b(if|switch)\b|\?\s*[^:]+\s*:/,
  /:\s*(string|number|boolean|void|any)\b|<\w+>/,
];

/**
 * Generate a 64-dimensional embedding from text using built-in analysis.
 * Components:
 *   [0-13]  — Concept cluster activation (14 dimensions)
 *   [14-31] — Code structure features (18 dimensions)
 *   [32-63] — Projected word vector (32 dimensions from vectors.js)
 *
 * @param {string} text — Code or natural language text
 * @returns {number[]} 64-dimensional unit vector
 */
function builtinEmbed(text) {
  const vec = new Float64Array(64);

  // Part 1: Concept cluster activation (dims 0-13)
  const concepts = identifyConcepts(text);
  const clusterMap = {};
  for (const c of concepts) clusterMap[c.id] = c.score;
  const clusterIds = CONCEPT_CLUSTERS.map(c => c.id);
  for (let i = 0; i < clusterIds.length && i < 14; i++) {
    vec[i] = clusterMap[clusterIds[i]] || 0;
  }

  // Part 2: Code structure features (dims 14-31)
  for (let i = 0; i < STRUCTURE_PATTERNS.length && i < 18; i++) {
    vec[14 + i] = STRUCTURE_PATTERNS[i].test(text) ? 1.0 : 0.0;
  }

  // Part 3: Word vector projection (dims 32-63)
  try {
    const { embedDocument } = require('./vectors');
    const wordVec = embedDocument(text);
    for (let i = 0; i < 32 && i < wordVec.length; i++) {
      vec[32 + i] = wordVec[i];
    }
  } catch {
    // vectors.js not available — leave zeros
  }

  // L2 normalize
  let mag = 0;
  for (let i = 0; i < vec.length; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= mag;
  }

  return Array.from(vec);
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Ollama Integration (Tier 2) ───

/**
 * Check if Ollama is available locally.
 * @param {object} [options] - { host, port }
 * @returns {Promise<{available: boolean, models?: string[]}>}
 */
function checkOllama(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port || 11434;

  if (typeof port !== 'number' || port < 1 || port > 65535) {
    return Promise.resolve({ available: false });
  }

  return new Promise((resolve) => {
    const req = http.request({ host, port, path: '/api/tags', method: 'GET', timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const models = (parsed.models || []).map(m => m.name);
          const embeddingModels = models.filter(m =>
            /embed|minilm|nomic|bge|gte|e5/i.test(m)
          );
          resolve({ available: true, models, embeddingModels });
        } catch {
          resolve({ available: false });
        }
      });
    });
    req.on('error', () => resolve({ available: false }));
    req.on('timeout', () => { req.destroy(); resolve({ available: false }); });
    req.end();
  });
}

/**
 * Get embeddings from a local Ollama server.
 * @param {string} text - Text to embed
 * @param {object} [options] - { host, port, model }
 * @returns {Promise<number[]|null>} Embedding vector or null if unavailable
 */
function ollamaEmbed(text, options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port || 11434;
  const model = options.model || 'nomic-embed-text';

  return new Promise((resolve) => {
    const body = JSON.stringify({ model, prompt: text });
    const req = http.request({
      host, port,
      path: '/api/embeddings',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.embedding || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── Embedding Engine (orchestrator) ───

class EmbeddingEngine {
  constructor(options = {}) {
    this._cache = new Map();
    this._maxCache = options.maxCache || 5000;
    this._ollamaHost = options.ollamaHost || '127.0.0.1';
    this._ollamaPort = options.ollamaPort || 11434;
    this._ollamaModel = options.ollamaModel || 'nomic-embed-text';
    this._ollamaAvailable = null; // null = not checked, true/false after check
    this._searchRegistry = options.searchRegistry || null;
    this._tier = 'builtin'; // Current active tier
  }

  /**
   * Detect the best available embedding tier.
   * @returns {Promise<string>} 'ollama' | 'plugin' | 'builtin'
   */
  async detectTier() {
    // Check for plugin-provided embedding providers
    if (this._searchRegistry) {
      const providers = this._searchRegistry.list().filter(p => p.type === 'embedding');
      if (providers.length > 0) {
        this._tier = 'plugin';
        return 'plugin';
      }
    }

    // Check for Ollama
    const status = await checkOllama({ host: this._ollamaHost, port: this._ollamaPort });
    if (status.available && status.embeddingModels && status.embeddingModels.length > 0) {
      this._ollamaAvailable = true;
      this._ollamaModel = status.embeddingModels[0]; // Use first embedding model
      this._tier = 'ollama';
      return 'ollama';
    }
    this._ollamaAvailable = false;

    this._tier = 'builtin';
    return 'builtin';
  }

  /**
   * Embed text using the best available tier.
   * Synchronous fallback to builtin if async providers unavailable.
   *
   * @param {string} text
   * @returns {number[]} Embedding vector
   */
  embed(text) {
    // Check cache
    const key = cacheKey(text);
    if (this._cache.has(key)) return this._cache.get(key);

    // Always use builtin for sync path
    const vec = builtinEmbed(text);
    this._setCache(key, vec);
    return vec;
  }

  /**
   * Embed text using the best available tier (async for Ollama/plugins).
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedAsync(text) {
    const key = cacheKey(text);
    if (this._cache.has(key)) return this._cache.get(key);

    // Tier 3: Plugin providers
    if (this._tier === 'plugin' && this._searchRegistry) {
      const providers = this._searchRegistry.list().filter(p => p.type === 'embedding');
      if (providers.length > 0) {
        const provider = this._searchRegistry.get(providers[0].name);
        if (provider && typeof provider.embed === 'function') {
          try {
            const vec = await provider.embed(text);
            if (vec && vec.length > 0) {
              this._setCache(key, vec);
              return vec;
            }
          } catch { /* fall through */ }
        }
      }
    }

    // Tier 2: Ollama
    if (this._tier === 'ollama' && this._ollamaAvailable) {
      const vec = await ollamaEmbed(text, {
        host: this._ollamaHost,
        port: this._ollamaPort,
        model: this._ollamaModel,
      });
      if (vec && vec.length > 0) {
        this._setCache(key, vec);
        return vec;
      }
    }

    // Tier 1: Built-in
    const vec = builtinEmbed(text);
    this._setCache(key, vec);
    return vec;
  }

  /**
   * Compute similarity between two texts.
   */
  similarity(textA, textB) {
    return cosineSimilarity(this.embed(textA), this.embed(textB));
  }

  /**
   * Search items using embeddings.
   * @param {string} query
   * @param {Array} items — Array of { name, description, tags, code }
   * @param {object} [options] — { limit, minScore, language }
   * @returns {Array} Ranked items with _relevance scores
   */
  search(query, items, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const { limit = 10, minScore = 0.05, language } = options;

    let filtered = items;
    if (language) {
      filtered = filtered.filter(item =>
        (item.language || '').toLowerCase() === language.toLowerCase()
      );
    }

    const queryVec = this.embed(query);
    const expandedTerms = expandQuery(query);

    const results = filtered.map(item => {
      const docText = [
        item.name || '',
        item.description || '',
        (item.tags || []).join(' '),
        (item.code || '').slice(0, 500), // Limit code length for embedding
      ].join(' ');

      const docVec = this.embed(docText);
      const embeddingSim = cosineSimilarity(queryVec, docVec);

      // Keyword boost: expanded terms that appear in the document
      const docLower = docText.toLowerCase();
      let keywordHits = 0;
      for (const term of expandedTerms) {
        if (docLower.includes(term)) keywordHits++;
      }
      const keywordBoost = expandedTerms.length > 0
        ? (keywordHits / expandedTerms.length) * 0.2
        : 0;

      // Name match bonus
      const nameLower = (item.name || '').toLowerCase();
      const queryLower = query.toLowerCase();
      const nameBonus = nameLower.includes(queryLower) ? 0.15
        : queryLower.split(/\s+/).some(w => nameLower.includes(w)) ? 0.08
        : 0;

      const score = Math.min(1, embeddingSim + keywordBoost + nameBonus);

      return {
        ...item,
        _relevance: { relevance: score, embeddingSim, keywordBoost, nameBonus },
      };
    })
    .filter(r => r._relevance.relevance >= minScore)
    .sort((a, b) => b._relevance.relevance - a._relevance.relevance)
    .slice(0, limit);

    return results;
  }

  /**
   * Get engine status.
   */
  status() {
    return {
      tier: this._tier,
      cacheSize: this._cache.size,
      maxCache: this._maxCache,
      ollamaAvailable: this._ollamaAvailable,
      ollamaModel: this._ollamaModel,
      pluginProviders: this._searchRegistry ? this._searchRegistry.list().filter(p => p.type === 'embedding').length : 0,
    };
  }

  _setCache(key, vec) {
    if (this._cache.size >= this._maxCache) {
      // Evict oldest (first key in Map iteration)
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(key, vec);
  }

  clearCache() {
    this._cache.clear();
  }
}

module.exports = {
  EmbeddingEngine,
  builtinEmbed,
  cosineSimilarity,
  checkOllama,
  ollamaEmbed,
  CODE_STRUCTURE_FEATURES,
};
