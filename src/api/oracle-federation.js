/**
 * Oracle Federation — persistence, remotes, repos, debug oracle.
 * Cross-project and cross-machine pattern sharing.
 */

const { DebugOracle } = require('../core/debug-oracle');

module.exports = {
  /**
   * Sync local patterns to personal store (~/.remembrance/personal/).
   * Proven patterns accumulate across all projects, privately.
   */
  syncToGlobal(options = {}) {
    const { syncToGlobal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { synced: 0, error: 'No SQLite store available' };
    return syncToGlobal(sqliteStore, options);
  },

  /**
   * Pull patterns from personal store into this project.
   */
  syncFromGlobal(options = {}) {
    const { syncFromGlobal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return syncFromGlobal(sqliteStore, options);
  },

  /**
   * Bidirectional sync with personal store.
   */
  sync(options = {}) {
    const { syncBidirectional } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { error: 'No SQLite store available' };
    return syncBidirectional(sqliteStore, options);
  },

  /**
   * Share patterns to the community store.
   * Explicit action — only shares test-backed patterns above 0.7 coherency.
   */
  share(options = {}) {
    const { shareToCommunity } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { shared: 0, error: 'No SQLite store available' };
    return shareToCommunity(sqliteStore, options);
  },

  /**
   * Pull patterns from the community store into this project.
   */
  pullCommunity(options = {}) {
    const { pullFromCommunity } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return pullFromCommunity(sqliteStore, options);
  },

  /**
   * Search across local + personal + community stores.
   * Returns merged results, deduplicated, sorted by coherency.
   */
  federatedSearch(query = {}) {
    const { federatedQuery } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { error: 'No SQLite store available' };
    return federatedQuery(sqliteStore, query);
  },

  /**
   * Get combined global store statistics (personal + community).
   */
  globalStats() {
    const { globalStats } = require('../core/persistence');
    return globalStats();
  },

  /**
   * Get personal store statistics only.
   */
  personalStats() {
    const { personalStats } = require('../core/persistence');
    return personalStats();
  },

  /**
   * Get community store statistics only.
   */
  communityStats() {
    const { communityStats } = require('../core/persistence');
    return communityStats();
  },

  /**
   * Deduplicate patterns in local, personal, and community stores.
   * Keeps the highest-coherency row for each (name, language) pair.
   * Returns report with removed counts per store.
   */
  deduplicate(options = {}) {
    const { stores = ['local', 'personal', 'community'] } = options;
    const report = { local: null, personal: null, community: null };

    if (stores.includes('local')) {
      const sqliteStore = this.store.getSQLiteStore();
      if (sqliteStore && typeof sqliteStore.deduplicatePatterns === 'function') {
        report.local = sqliteStore.deduplicatePatterns();
      }
    }

    if (stores.includes('personal')) {
      try {
        const { openPersonalStore } = require('../core/persistence');
        const personalStore = openPersonalStore();
        if (personalStore && typeof personalStore.deduplicatePatterns === 'function') {
          report.personal = personalStore.deduplicatePatterns();
        }
      } catch { /* best-effort */ }
    }

    if (stores.includes('community')) {
      try {
        const { openCommunityStore } = require('../core/persistence');
        const communityStore = openCommunityStore();
        if (communityStore && typeof communityStore.deduplicatePatterns === 'function') {
          report.community = communityStore.deduplicatePatterns();
        }
      } catch { /* best-effort */ }
    }

    return report;
  },

  /**
   * Register a remote oracle server for federated search.
   */
  registerRemote(url, options = {}) {
    const { registerRemote } = require('../cloud/client');
    return registerRemote(url, options);
  },

  /**
   * Remove a remote oracle server.
   */
  removeRemote(urlOrName) {
    const { removeRemote } = require('../cloud/client');
    return removeRemote(urlOrName);
  },

  /**
   * List registered remote oracle servers.
   */
  listRemotes() {
    const { listRemotes } = require('../cloud/client');
    return listRemotes();
  },

  /**
   * Search patterns across all registered remote oracle servers.
   * Queries each remote in parallel, merges and deduplicates.
   */
  async remoteSearch(query, options = {}) {
    const { federatedRemoteSearch } = require('../cloud/client');
    return federatedRemoteSearch(query, options);
  },

  /**
   * Health check all remote oracle servers.
   */
  async checkRemoteHealth() {
    const { checkRemoteHealth } = require('../cloud/client');
    return checkRemoteHealth();
  },

  /**
   * Full federated search: local + personal + community + repos + remotes.
   * The ultimate query that searches everywhere.
   */
  async fullFederatedSearch(query, options = {}) {
    const results = { local: [], remote: [], repos: [], errors: [] };

    // Local federated (local + personal + community)
    try {
      const fed = this.federatedSearch({ description: query, language: options.language });
      results.local = fed.patterns || [];
    } catch { /* local search error */ }

    // Cross-repo search (sibling directories)
    try {
      const repos = this.crossRepoSearch(query, { language: options.language, limit: options.limit || 20 });
      results.repos = repos.results || [];
    } catch { /* repo search error */ }

    // Remote oracle search (HTTP federation)
    try {
      const remote = await this.remoteSearch(query, { language: options.language, limit: options.limit || 20 });
      results.remote = remote.results || [];
      results.errors = remote.errors || [];
    } catch (err) {
      results.errors.push({ remote: 'all', error: err.message });
    }

    // Merge and deduplicate
    const seen = new Set();
    const merged = [];
    for (const list of [results.local, results.repos, results.remote]) {
      for (const p of list) {
        const key = `${p.name}:${p.language}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(p);
      }
    }

    return {
      results: merged.slice(0, options.limit || 50),
      localCount: results.local.length,
      repoCount: results.repos.length,
      remoteCount: results.remote.length,
      errors: results.errors,
    };
  },

  /**
   * Discover oracle stores in sibling repositories.
   */
  discoverRepos(options = {}) {
    const { discoverRepoStores } = require('../core/persistence');
    return discoverRepoStores(options);
  },

  /**
   * Register a repo path for federated search.
   */
  registerRepo(repoPath) {
    const { registerRepo } = require('../core/persistence');
    return registerRepo(repoPath);
  },

  /**
   * List configured repos.
   */
  listRepos() {
    const { listRepos } = require('../core/persistence');
    return listRepos();
  },

  /**
   * Search patterns across multiple repo oracle stores.
   */
  crossRepoSearch(description, options = {}) {
    const { crossRepoSearch } = require('../core/persistence');
    return crossRepoSearch(description, options);
  },

  /**
   * Get or create the DebugOracle instance (lazy-initialized).
   */
  _getDebugOracle() {
    if (!this._debugOracle) {
      const sqliteStore = this.store.getSQLiteStore();
      if (!sqliteStore) return null;
      this._debugOracle = new DebugOracle(sqliteStore, {
        verbose: this.recycler?.verbose || false,
        variantLanguages: this.recycler?.variantLanguages || ['python', 'typescript'],
      });
    }
    return this._debugOracle;
  },

  /**
   * Capture an error->fix pair as a debug pattern.
   * Automatically generates language variants and error variants.
   *
   * @param {object} params
   *   - errorMessage: The error message
   *   - stackTrace: Optional stack trace
   *   - fixCode: The code that fixes the error
   *   - fixDescription: Human description of the fix
   *   - language: Programming language
   *   - tags: Array of tags
   * @returns {object} { captured, pattern, variants }
   */
  debugCapture(params) {
    const debug = this._getDebugOracle();
    if (!debug) return { captured: false, error: 'No SQLite store available' };
    const result = debug.capture(params);
    if (result.captured) {
      this._emit({ type: 'debug_capture', id: result.pattern?.id, errorClass: result.pattern?.errorClass });
    }
    return result;
  },

  /**
   * Search for debug patterns matching an error.
   * Searches local store, personal store, and community store.
   *
   * @param {object} params
   *   - errorMessage: The error to find fixes for
   *   - stackTrace: Optional stack trace
   *   - language: Preferred language
   *   - limit: Max results (default 5)
   *   - federated: Search all tiers (default true)
   * @returns {Array} Matching debug patterns, ranked by confidence
   */
  debugSearch(params) {
    const { federated = true, ...searchParams } = params;

    if (federated) {
      const sqliteStore = this.store.getSQLiteStore();
      if (!sqliteStore) return [];
      const { federatedDebugSearch } = require('../core/persistence');
      return federatedDebugSearch(sqliteStore, searchParams);
    }

    const debug = this._getDebugOracle();
    if (!debug) return [];
    return debug.search(searchParams);
  },

  /**
   * Report whether an applied fix resolved the error.
   * Updates confidence and triggers cascading variant generation on success.
   */
  debugFeedback(id, resolved) {
    const debug = this._getDebugOracle();
    if (!debug) return { success: false, error: 'No SQLite store available' };
    const result = debug.reportOutcome(id, resolved);
    if (result.success) {
      this._emit({ type: 'debug_feedback', id, resolved, confidence: result.confidence });
    }
    return result;
  },

  /**
   * Grow the debug pattern library exponentially.
   * Generates language variants and error variants from high-confidence patterns.
   */
  debugGrow(options = {}) {
    const debug = this._getDebugOracle();
    if (!debug) return { processed: 0, error: 'No SQLite store available' };
    return debug.grow(options);
  },

  /**
   * Get all debug patterns, optionally filtered.
   */
  debugPatterns(filters = {}) {
    const debug = this._getDebugOracle();
    if (!debug) return [];
    return debug.getAll(filters);
  },

  /**
   * Get debug pattern library statistics.
   */
  debugStats() {
    const debug = this._getDebugOracle();
    if (!debug) return { totalPatterns: 0, error: 'No SQLite store available' };
    return debug.stats();
  },

  /**
   * Share debug patterns to community store.
   * Higher bar: requires confidence >= 0.5 and at least 1 successful resolution.
   */
  debugShare(options = {}) {
    const { shareDebugPatterns } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { shared: 0, error: 'No SQLite store available' };
    return shareDebugPatterns(sqliteStore, options);
  },

  /**
   * Pull debug patterns from community store.
   */
  debugPullCommunity(options = {}) {
    const { pullDebugPatterns } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return pullDebugPatterns(sqliteStore, options);
  },

  /**
   * Sync debug patterns to personal store.
   */
  debugSyncPersonal(options = {}) {
    const { syncDebugToPersonal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { synced: 0, error: 'No SQLite store available' };
    return syncDebugToPersonal(sqliteStore, options);
  },

  /**
   * Seed the debug oracle with pre-built patterns for all 10 error categories.
   * Fills gaps: syntax, reference, build, permission, data + more type/runtime/etc.
   * Auto-generates language variants (Python, TypeScript, Go) for each seed.
   *
   * @param {object} options — { verbose, categories, languages }
   * @returns {{ seeded, skipped, duplicates, variants, byCategory, byLanguage }}
   */
  debugSeed(options = {}) {
    const debug = this._getDebugOracle();
    if (!debug) return { seeded: 0, error: 'No SQLite store available' };
    const { seedDebugPatterns } = require('../core/debug-seeds');
    return seedDebugPatterns(debug, options);
  },

  /**
   * Get combined debug stats across all tiers.
   */
  debugGlobalStats() {
    const { debugGlobalStats } = require('../core/persistence');
    return debugGlobalStats();
  },
};
