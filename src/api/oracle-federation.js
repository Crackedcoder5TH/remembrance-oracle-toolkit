/**
 * Oracle Federation Mixin — sync, share, community, repos, remotes
 * Mixed into RemembranceOracle.prototype
 */

const federationMethods = {

  // ─── Cross-Project Persistence ───

  syncToGlobal(options = {}) {
    const { syncToGlobal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { synced: 0, error: 'No SQLite store available' };
    return syncToGlobal(sqliteStore, options);
  },

  syncFromGlobal(options = {}) {
    const { syncFromGlobal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return syncFromGlobal(sqliteStore, options);
  },

  sync(options = {}) {
    const { syncBidirectional } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { error: 'No SQLite store available' };
    return syncBidirectional(sqliteStore, options);
  },

  share(options = {}) {
    const { shareToCommunity } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { shared: 0, error: 'No SQLite store available' };
    return shareToCommunity(sqliteStore, options);
  },

  pullCommunity(options = {}) {
    const { pullFromCommunity } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return pullFromCommunity(sqliteStore, options);
  },

  federatedSearch(query = {}) {
    const { federatedQuery } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { error: 'No SQLite store available' };
    return federatedQuery(sqliteStore, query);
  },

  globalStats() {
    const { globalStats } = require('../core/persistence');
    return globalStats();
  },

  personalStats() {
    const { personalStats } = require('../core/persistence');
    return personalStats();
  },

  communityStats() {
    const { communityStats } = require('../core/persistence');
    return communityStats();
  },

  // ─── Remote Federation ───

  registerRemote(url, options = {}) {
    const { registerRemote } = require('../cloud/client');
    return registerRemote(url, options);
  },

  removeRemote(urlOrName) {
    const { removeRemote } = require('../cloud/client');
    return removeRemote(urlOrName);
  },

  listRemotes() {
    const { listRemotes } = require('../cloud/client');
    return listRemotes();
  },

  async remoteSearch(query, options = {}) {
    const { federatedRemoteSearch } = require('../cloud/client');
    return federatedRemoteSearch(query, options);
  },

  async checkRemoteHealth() {
    const { checkRemoteHealth } = require('../cloud/client');
    return checkRemoteHealth();
  },

  async fullFederatedSearch(query, options = {}) {
    const results = { local: [], remote: [], repos: [], errors: [] };

    try {
      const fed = this.federatedSearch({ description: query, language: options.language });
      results.local = fed.patterns || [];
    } catch { /* local search error */ }

    try {
      const repos = this.crossRepoSearch(query, { language: options.language, limit: options.limit || 20 });
      results.repos = repos.results || [];
    } catch { /* repo search error */ }

    try {
      const remote = await this.remoteSearch(query, { language: options.language, limit: options.limit || 20 });
      results.remote = remote.results || [];
      results.errors = remote.errors || [];
    } catch (err) {
      results.errors.push({ remote: 'all', error: err.message });
    }

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

  // ─── Repo Discovery ───

  discoverRepos(options = {}) {
    const { discoverRepoStores } = require('../core/persistence');
    return discoverRepoStores(options);
  },

  registerRepo(repoPath) {
    const { registerRepo } = require('../core/persistence');
    return registerRepo(repoPath);
  },

  listRepos() {
    const { listRepos } = require('../core/persistence');
    return listRepos();
  },

  crossRepoSearch(description, options = {}) {
    const { crossRepoSearch } = require('../core/persistence');
    return crossRepoSearch(description, options);
  },
};

module.exports = { federationMethods };
