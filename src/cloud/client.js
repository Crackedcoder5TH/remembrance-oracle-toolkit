/**
 * Remote Oracle Client — HTTP federation layer.
 *
 * Connects to remote oracle cloud servers to enable federated search
 * across multiple oracle instances over the network.
 *
 * No external dependencies — uses Node built-in http/https.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REMOTES_CONFIG_DIR = path.join(os.homedir(), '.remembrance');
const REMOTES_CONFIG_PATH = path.join(REMOTES_CONFIG_DIR, 'remotes.json');

// ─── HTTP Helper ───

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const timeout = options.timeout || 10000;

    const req = mod.request(parsed, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// ─── Remote Oracle Client ───

class RemoteOracleClient {
  /**
   * @param {string} baseUrl - Remote oracle server URL (e.g. http://192.168.1.5:3579)
   * @param {object} options - { token, name, timeout }
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.name = options.name || new URL(baseUrl).hostname;
    this.token = options.token || null;
    this.timeout = options.timeout || 10000;
  }

  /**
   * Authenticate with the remote server.
   * @param {string} username
   * @param {string} password
   * @returns {{ success, token?, error? }}
   */
  async login(username, password) {
    try {
      const res = await request(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        body: { username, password },
        timeout: this.timeout,
      });
      if (res.status === 200 && res.data.token) {
        this.token = res.data.token;
        return { success: true, token: res.data.token };
      }
      return { success: false, error: res.data.error || 'Authentication failed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Check if the remote oracle is reachable.
   * @returns {{ online, version?, patterns?, latencyMs }}
   */
  async health() {
    const start = Date.now();
    try {
      const res = await request(`${this.baseUrl}/api/health`, { timeout: 5000 });
      return {
        online: res.status === 200,
        ...(res.data || {}),
        latencyMs: Date.now() - start,
      };
    } catch {
      return { online: false, latencyMs: Date.now() - start };
    }
  }

  /**
   * Search patterns on the remote oracle.
   * @param {string} query - Search description
   * @param {object} options - { language, limit }
   * @returns {{ results, source }}
   */
  async search(query, options = {}) {
    try {
      const res = await request(`${this.baseUrl}/api/search`, {
        method: 'POST',
        body: { query, language: options.language, limit: options.limit || 20 },
        token: this.token,
        timeout: this.timeout,
      });
      if (res.status === 200) {
        const results = (res.data.results || res.data || []).map(p => ({
          ...p,
          _source: 'remote',
          _remote: this.name,
          _remoteUrl: this.baseUrl,
        }));
        return { results, source: this.name };
      }
      return { results: [], source: this.name, error: res.data.error };
    } catch (err) {
      return { results: [], source: this.name, error: err.message };
    }
  }

  /**
   * Get patterns from the remote oracle.
   * @param {object} options - { language, limit, offset }
   * @returns {{ patterns, total }}
   */
  async getPatterns(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.language) params.set('language', options.language);
      if (options.limit) params.set('limit', String(options.limit));
      if (options.offset) params.set('offset', String(options.offset));
      const qs = params.toString() ? `?${params}` : '';

      const res = await request(`${this.baseUrl}/api/patterns${qs}`, {
        token: this.token,
        timeout: this.timeout,
      });
      if (res.status === 200) {
        return { patterns: res.data.patterns || res.data || [], total: res.data.total };
      }
      return { patterns: [], error: res.data.error };
    } catch (err) {
      return { patterns: [], error: err.message };
    }
  }

  /**
   * Get remote store statistics.
   */
  async stats() {
    try {
      const res = await request(`${this.baseUrl}/api/stats`, {
        token: this.token,
        timeout: this.timeout,
      });
      return res.status === 200 ? res.data : { error: res.data.error };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Pull patterns from remote to local store.
   * @param {object} options - { since, language, limit }
   */
  async pull(options = {}) {
    try {
      const res = await request(`${this.baseUrl}/api/sync/pull`, {
        method: 'POST',
        body: { since: options.since, language: options.language, limit: options.limit || 100 },
        token: this.token,
        timeout: this.timeout,
      });
      if (res.status === 200) {
        return { success: true, patterns: res.data.patterns || [], count: res.data.count || 0 };
      }
      return { success: false, error: res.data.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Push patterns to remote store.
   * @param {Array} patterns - Pattern objects to push
   */
  async push(patterns) {
    try {
      const res = await request(`${this.baseUrl}/api/sync/push`, {
        method: 'POST',
        body: { patterns },
        token: this.token,
        timeout: this.timeout,
      });
      return res.status === 200 ? { success: true, ...res.data } : { success: false, error: res.data.error };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

// ─── Remote Registry ───

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Register a remote oracle server URL.
 */
function registerRemote(url, options = {}) {
  ensureDir(REMOTES_CONFIG_DIR);
  let config = loadRemotesConfig();
  const name = options.name || new URL(url).hostname;
  const existing = config.remotes.find(r => r.url === url);
  if (existing) {
    existing.name = name;
    if (options.token) existing.token = options.token;
  } else {
    config.remotes.push({ url, name, token: options.token || null, addedAt: new Date().toISOString() });
  }
  fs.writeFileSync(REMOTES_CONFIG_PATH, JSON.stringify(config, null, 2));
  return { registered: true, name, url, totalRemotes: config.remotes.length };
}

/**
 * Remove a remote oracle server.
 */
function removeRemote(urlOrName) {
  let config = loadRemotesConfig();
  const before = config.remotes.length;
  config.remotes = config.remotes.filter(r => r.url !== urlOrName && r.name !== urlOrName);
  if (config.remotes.length < before) {
    fs.writeFileSync(REMOTES_CONFIG_PATH, JSON.stringify(config, null, 2));
    return { removed: true };
  }
  return { removed: false, error: 'Remote not found' };
}

/**
 * List configured remote oracles.
 */
function listRemotes() {
  return loadRemotesConfig().remotes;
}

/**
 * Load remotes config from disk.
 */
function loadRemotesConfig() {
  try {
    if (fs.existsSync(REMOTES_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(REMOTES_CONFIG_PATH, 'utf-8'));
    }
  } catch { /* fresh config */ }
  return { remotes: [] };
}

/**
 * Federated search across all registered remote oracles.
 * Queries each remote in parallel, merges and deduplicates results.
 *
 * @param {string} query - Search description
 * @param {object} options - { language, limit, timeout, remotes }
 * @returns {Promise<{ results, remotes, errors }>}
 */
async function federatedRemoteSearch(query, options = {}) {
  const remotes = options.remotes || listRemotes();
  if (remotes.length === 0) {
    return { results: [], remotes: [], errors: [] };
  }

  const timeout = options.timeout || 10000;
  const promises = remotes.map(async (remote) => {
    const client = new RemoteOracleClient(remote.url, {
      name: remote.name,
      token: remote.token,
      timeout,
    });
    try {
      const result = await client.search(query, { language: options.language, limit: options.limit || 20 });
      return { remote: remote.name, url: remote.url, ...result };
    } catch (err) {
      return { remote: remote.name, url: remote.url, results: [], error: err.message };
    }
  });

  const responses = await Promise.all(promises);

  // Merge and deduplicate (first occurrence wins)
  const seen = new Set();
  const allResults = [];
  const remoteInfo = [];
  const errors = [];

  for (const res of responses) {
    remoteInfo.push({ name: res.remote, url: res.url, count: res.results.length, error: res.error || null });
    if (res.error) errors.push({ remote: res.remote, error: res.error });

    for (const p of res.results) {
      const key = `${p.name}:${p.language}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allResults.push(p);
    }
  }

  return {
    results: allResults.slice(0, options.limit || 50),
    remotes: remoteInfo,
    errors,
  };
}

/**
 * Health check all registered remotes.
 * @returns {Promise<Array<{ name, url, online, latencyMs }>>}
 */
async function checkRemoteHealth() {
  const remotes = listRemotes();
  const results = await Promise.all(remotes.map(async (remote) => {
    const client = new RemoteOracleClient(remote.url, { name: remote.name });
    const health = await client.health();
    return { name: remote.name, url: remote.url, ...health };
  }));
  return results;
}

module.exports = {
  RemoteOracleClient,
  registerRemote,
  removeRemote,
  listRemotes,
  federatedRemoteSearch,
  checkRemoteHealth,
  request,
};
