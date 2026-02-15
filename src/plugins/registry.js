/**
 * Extension Registries — Formal extension API for the Remembrance Oracle.
 *
 * Four pluggable registries that let the community extend the oracle:
 *
 * 1. LanguageRunnerRegistry — Custom sandbox runners (Ruby, PHP, Kotlin, etc.)
 * 2. CovenantPrincipleRegistry — Domain-specific harm detection rules
 * 3. StorageBackendRegistry — Alternative storage backends (PostgreSQL, S3, etc.)
 * 4. SearchProviderRegistry — Custom search/embedding providers (OpenAI, Ollama, etc.)
 *
 * Each registry validates its entries and exposes a consistent API:
 *   .register(name, implementation)
 *   .unregister(name)
 *   .get(name)
 *   .list()
 *   .has(name)
 */

// ─── Language Runner Registry ───

class LanguageRunnerRegistry {
  constructor() {
    this._runners = new Map();
  }

  /**
   * Register a custom language runner.
   * @param {string} language — Canonical language name (e.g. 'ruby', 'php', 'kotlin')
   * @param {object} runner — { execute(code, testCode, options) => { passed, output, sandboxed } }
   * @param {object} [meta] — { aliases?: string[], timeout?: number, description?: string }
   */
  register(language, runner, meta = {}) {
    if (!language || typeof language !== 'string') {
      throw new Error('Language name must be a non-empty string');
    }
    if (!runner || typeof runner.execute !== 'function') {
      throw new Error(`Runner for "${language}" must have an execute(code, testCode, options) method`);
    }

    const lang = language.toLowerCase();
    const entry = {
      language: lang,
      runner,
      aliases: (meta.aliases || []).map(a => a.toLowerCase()),
      timeout: meta.timeout || 10000,
      description: meta.description || `Custom runner for ${lang}`,
    };

    this._runners.set(lang, entry);

    // Also register aliases
    for (const alias of entry.aliases) {
      this._runners.set(alias, entry);
    }

    return entry;
  }

  unregister(language) {
    const lang = language.toLowerCase();
    const entry = this._runners.get(lang);
    if (!entry) return false;

    // Remove main entry and all aliases
    this._runners.delete(entry.language);
    for (const alias of entry.aliases) {
      this._runners.delete(alias);
    }
    return true;
  }

  get(language) {
    return this._runners.get(language.toLowerCase()) || null;
  }

  has(language) {
    return this._runners.has(language.toLowerCase());
  }

  list() {
    // Deduplicate aliases — only list primary entries
    const seen = new Set();
    const result = [];
    for (const [, entry] of this._runners) {
      if (!seen.has(entry.language)) {
        seen.add(entry.language);
        result.push({
          language: entry.language,
          aliases: entry.aliases,
          timeout: entry.timeout,
          description: entry.description,
        });
      }
    }
    return result;
  }

  /**
   * Execute code using a registered runner.
   * @returns {{ passed, output, sandboxed }} or null if no runner found
   */
  execute(language, code, testCode, options = {}) {
    const entry = this.get(language);
    if (!entry) return null;
    return entry.runner.execute(code, testCode, {
      timeout: options.timeout || entry.timeout,
      ...options,
    });
  }
}

// ─── Covenant Principle Registry ───

class CovenantPrincipleRegistry {
  constructor() {
    this._principles = new Map();
    this._nextId = 100; // Start custom principles at 100 to avoid collision with built-in 1-15
  }

  /**
   * Register a custom covenant principle.
   * @param {object} principle
   * @param {string} principle.name — Human-readable name
   * @param {string} principle.seal — Description of what this principle enforces
   * @param {Array<{pattern: RegExp, reason: string}>} principle.harmPatterns — Patterns that violate this principle
   * @param {string} [principle.domain] — Domain this applies to (e.g. 'healthcare', 'finance')
   */
  register(principle) {
    if (!principle || !principle.name || typeof principle.name !== 'string') {
      throw new Error('Principle must have a name (string)');
    }
    if (!principle.seal || typeof principle.seal !== 'string') {
      throw new Error(`Principle "${principle.name}" must have a seal (string)`);
    }
    if (!Array.isArray(principle.harmPatterns) || principle.harmPatterns.length === 0) {
      throw new Error(`Principle "${principle.name}" must have at least one harmPattern`);
    }

    // Validate each harm pattern
    for (const hp of principle.harmPatterns) {
      if (!(hp.pattern instanceof RegExp)) {
        throw new Error(`Harm patterns for "${principle.name}" must have a RegExp pattern`);
      }
      if (!hp.reason || typeof hp.reason !== 'string') {
        throw new Error(`Harm patterns for "${principle.name}" must have a reason (string)`);
      }
    }

    const id = this._nextId++;
    const entry = {
      id,
      name: principle.name,
      seal: principle.seal,
      harmPatterns: principle.harmPatterns,
      domain: principle.domain || 'general',
    };

    this._principles.set(principle.name, entry);
    return entry;
  }

  unregister(name) {
    return this._principles.delete(name);
  }

  get(name) {
    return this._principles.get(name) || null;
  }

  has(name) {
    return this._principles.has(name);
  }

  list() {
    return Array.from(this._principles.values()).map(p => ({
      id: p.id,
      name: p.name,
      seal: p.seal,
      domain: p.domain,
      patternCount: p.harmPatterns.length,
    }));
  }

  /**
   * Run all custom principles against code.
   * @returns {Array<{principle: number, name: string, seal: string, reason: string}>}
   */
  check(code) {
    const violations = [];
    for (const [, entry] of this._principles) {
      for (const hp of entry.harmPatterns) {
        if (hp.pattern.test(code)) {
          violations.push({
            principle: entry.id,
            name: entry.name,
            seal: entry.seal,
            reason: hp.reason,
            domain: entry.domain,
          });
        }
      }
    }
    return violations;
  }
}

// ─── Storage Backend Registry ───

class StorageBackendRegistry {
  constructor() {
    this._backends = new Map();
  }

  /**
   * Register a custom storage backend.
   * @param {string} name — Backend name (e.g. 'postgresql', 's3', 'redis')
   * @param {object} backend — Must implement the StorageBackend interface:
   *   - add(entry) => entry (with id)
   *   - get(id) => entry | null
   *   - getAll() => entry[]
   *   - remove(id) => boolean
   *   - search(query) => entry[]
   *   - summary() => { totalEntries, ... }
   * @param {object} [meta] — { description?: string, persistent?: boolean }
   */
  register(name, backend, meta = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Backend name must be a non-empty string');
    }

    const requiredMethods = ['add', 'get', 'getAll', 'remove', 'search', 'summary'];
    for (const method of requiredMethods) {
      if (typeof backend[method] !== 'function') {
        throw new Error(`Backend "${name}" must implement ${method}()`);
      }
    }

    const entry = {
      name,
      backend,
      description: meta.description || `Custom storage backend: ${name}`,
      persistent: meta.persistent !== false,
    };

    this._backends.set(name, entry);
    return entry;
  }

  unregister(name) {
    return this._backends.delete(name);
  }

  get(name) {
    const entry = this._backends.get(name);
    return entry ? entry.backend : null;
  }

  has(name) {
    return this._backends.has(name);
  }

  list() {
    return Array.from(this._backends.values()).map(e => ({
      name: e.name,
      description: e.description,
      persistent: e.persistent,
    }));
  }
}

// ─── Search Provider Registry ───

class SearchProviderRegistry {
  constructor() {
    this._providers = new Map();
  }

  /**
   * Register a custom search/embedding provider.
   * @param {string} name — Provider name (e.g. 'openai', 'ollama', 'cohere')
   * @param {object} provider — Must implement:
   *   - search(query, items, options) => ranked items with _relevance scores
   *   OR
   *   - embed(text) => number[] (vector)
   *   - similarity(vecA, vecB) => number (0-1)
   * @param {object} [meta] — { description?: string, priority?: number }
   */
  register(name, provider, meta = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name must be a non-empty string');
    }
    if (typeof provider.search !== 'function' && typeof provider.embed !== 'function') {
      throw new Error(`Provider "${name}" must implement search(query, items, options) or embed(text) + similarity(vecA, vecB)`);
    }

    const entry = {
      name,
      provider,
      description: meta.description || `Custom search provider: ${name}`,
      priority: meta.priority || 0, // Higher priority providers are queried first
      type: typeof provider.search === 'function' ? 'search' : 'embedding',
    };

    this._providers.set(name, entry);
    return entry;
  }

  unregister(name) {
    return this._providers.delete(name);
  }

  get(name) {
    const entry = this._providers.get(name);
    return entry ? entry.provider : null;
  }

  has(name) {
    return this._providers.has(name);
  }

  list() {
    return Array.from(this._providers.values()).map(e => ({
      name: e.name,
      description: e.description,
      priority: e.priority,
      type: e.type,
    }));
  }

  /**
   * Get providers sorted by priority (highest first).
   */
  getByPriority() {
    return Array.from(this._providers.values())
      .sort((a, b) => b.priority - a.priority)
      .map(e => e.provider);
  }

  /**
   * Run search across all registered providers, merge results.
   * Falls back to built-in search if no providers are registered.
   * @param {string} query
   * @param {Array} items
   * @param {object} options
   * @returns {Array} Merged, deduplicated, sorted results
   */
  search(query, items, options = {}) {
    const providers = this.getByPriority();
    if (providers.length === 0) return null; // Signal: use built-in

    const allResults = [];
    const seen = new Set();

    for (const provider of providers) {
      try {
        let results;
        if (typeof provider.search === 'function') {
          results = provider.search(query, items, options);
        } else if (typeof provider.embed === 'function') {
          // Embedding-based search: embed query, compute similarities
          const queryVec = provider.embed(query);
          results = items.map(item => {
            const text = `${item.name || ''} ${item.description || ''} ${(item.tags || []).join(' ')} ${item.code || ''}`;
            const itemVec = provider.embed(text);
            const sim = typeof provider.similarity === 'function'
              ? provider.similarity(queryVec, itemVec)
              : cosineSim(queryVec, itemVec);
            return { ...item, _relevance: { relevance: sim } };
          }).sort((a, b) => b._relevance.relevance - a._relevance.relevance);
        }

        if (Array.isArray(results)) {
          for (const r of results) {
            const id = r.id || r.name;
            if (id && !seen.has(id)) {
              seen.add(id);
              allResults.push(r);
            }
          }
        }
      } catch {
        // Provider failure is non-fatal
      }
    }

    return allResults.sort((a, b) =>
      (b._relevance?.relevance || 0) - (a._relevance?.relevance || 0)
    );
  }
}

// Helper: cosine similarity for raw vectors
function cosineSim(a, b) {
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

module.exports = {
  LanguageRunnerRegistry,
  CovenantPrincipleRegistry,
  StorageBackendRegistry,
  SearchProviderRegistry,
  cosineSim,
};
