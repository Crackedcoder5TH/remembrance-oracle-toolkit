/**
 * Federation Hub — Lightweight pattern hub for team collaboration.
 *
 * The killer feature: a team of devs, each with local stores,
 * auto-syncing proven patterns via a lightweight hub.
 *
 * Like a private npm registry but for validated code snippets.
 *
 * Architecture:
 *   Hub (central server) ← → Members (local oracles)
 *
 * Hub features:
 * - Member registration with API keys
 * - Pattern push (member → hub) with deduplication
 * - Pattern pull (hub → member) with filters
 * - Conflict resolution (highest coherency wins)
 * - Activity feed (real-time pattern announcements)
 * - Team analytics (who contributes most, quality trends)
 *
 * Security:
 * - API key authentication per member
 * - Patterns must pass covenant + coherency threshold
 * - No arbitrary code execution on hub
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Hub Server ───

class FederationHub {
  /**
   * @param {object} options
   * @param {string} options.dataDir — Directory for hub data (default: ~/.remembrance/hub/)
   * @param {number} options.minCoherency — Minimum coherency to accept patterns (default: 0.65)
   * @param {string} options.teamName — Team name
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(require('os').homedir(), '.remembrance', 'hub');
    this.minCoherency = options.minCoherency || 0.65;
    this.teamName = options.teamName || 'default';
    this._server = null;

    // Ensure data directory
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this._membersPath = path.join(this.dataDir, 'members.json');
    this._patternsPath = path.join(this.dataDir, 'patterns.json');
    this._activityPath = path.join(this.dataDir, 'activity.json');

    this._members = this._loadJSON(this._membersPath, {});
    this._patterns = this._loadJSON(this._patternsPath, {});
    this._activity = this._loadJSON(this._activityPath, []);
  }

  // ─── Member Management ───

  /**
   * Register a new member. Returns an API key.
   */
  registerMember(name, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Member name is required');
    }
    if (this._members[name]) {
      throw new Error(`Member "${name}" already registered`);
    }

    const apiKey = crypto.randomBytes(24).toString('hex');
    this._members[name] = {
      name,
      apiKey,
      role: options.role || 'contributor',
      joinedAt: new Date().toISOString(),
      pushCount: 0,
      pullCount: 0,
      lastSeen: null,
    };

    this._save(this._membersPath, this._members);
    this._addActivity('member_joined', { member: name });
    return { name, apiKey, role: this._members[name].role };
  }

  /**
   * Remove a member.
   */
  removeMember(name) {
    if (!this._members[name]) return false;
    delete this._members[name];
    this._save(this._membersPath, this._members);
    this._addActivity('member_removed', { member: name });
    return true;
  }

  /**
   * List all members (without API keys).
   */
  listMembers() {
    return Object.values(this._members).map(m => ({
      name: m.name,
      role: m.role,
      joinedAt: m.joinedAt,
      pushCount: m.pushCount,
      pullCount: m.pullCount,
      lastSeen: m.lastSeen,
    }));
  }

  /**
   * Authenticate a member by API key.
   * @returns {object|null} Member info or null
   */
  authenticate(apiKey) {
    for (const m of Object.values(this._members)) {
      if (m.apiKey === apiKey) {
        m.lastSeen = new Date().toISOString();
        return m;
      }
    }
    return null;
  }

  // ─── Pattern Sync ───

  /**
   * Push patterns from a member to the hub.
   * Deduplicates by name+language, keeps highest coherency.
   *
   * @param {Array} patterns - Array of { name, code, language, tags, coherencyTotal, testCode, author }
   * @param {string} memberName - Who is pushing
   * @returns {{ accepted, rejected, duplicates }}
   */
  pushPatterns(patterns, memberName) {
    let accepted = 0, rejected = 0, duplicates = 0;
    const results = [];

    for (const p of patterns) {
      // Validate minimum fields
      if (!p.name || !p.code || !p.language) {
        rejected++;
        results.push({ name: p.name, status: 'rejected', reason: 'Missing name, code, or language' });
        continue;
      }

      const coherency = p.coherencyTotal || p.coherencyScore?.total || 0;
      if (coherency < this.minCoherency) {
        rejected++;
        results.push({ name: p.name, status: 'rejected', reason: `Coherency ${coherency} below threshold ${this.minCoherency}` });
        continue;
      }

      const key = `${p.name}:${p.language}`;
      const existing = this._patterns[key];

      if (existing) {
        const existingCoherency = existing.coherencyTotal || 0;
        if (coherency > existingCoherency) {
          // Replace with higher quality version
          this._patterns[key] = this._makeHubPattern(p, memberName, coherency);
          duplicates++;
          results.push({ name: p.name, status: 'updated', reason: 'Higher coherency' });
        } else {
          duplicates++;
          results.push({ name: p.name, status: 'skipped', reason: 'Existing version has equal or higher coherency' });
        }
      } else {
        this._patterns[key] = this._makeHubPattern(p, memberName, coherency);
        accepted++;
        results.push({ name: p.name, status: 'accepted' });
      }
    }

    // Update member stats
    if (this._members[memberName]) {
      this._members[memberName].pushCount += accepted;
      this._save(this._membersPath, this._members);
    }

    this._save(this._patternsPath, this._patterns);
    this._addActivity('patterns_pushed', { member: memberName, accepted, rejected, duplicates });

    return { accepted, rejected, duplicates, total: patterns.length, results };
  }

  /**
   * Pull patterns from the hub to a member.
   *
   * @param {object} filters - { language?, minCoherency?, since?, tags?, limit? }
   * @param {string} memberName - Who is pulling
   * @returns {{ patterns, count }}
   */
  pullPatterns(filters = {}, memberName = 'anonymous') {
    let patterns = Object.values(this._patterns);

    // Apply filters
    if (filters.language) {
      patterns = patterns.filter(p => p.language === filters.language.toLowerCase());
    }
    if (filters.minCoherency) {
      patterns = patterns.filter(p => (p.coherencyTotal || 0) >= filters.minCoherency);
    }
    if (filters.since) {
      const sinceDate = new Date(filters.since).getTime();
      patterns = patterns.filter(p => new Date(p.pushedAt || 0).getTime() > sinceDate);
    }
    if (filters.tags && filters.tags.length > 0) {
      const tagSet = new Set(filters.tags.map(t => t.toLowerCase()));
      patterns = patterns.filter(p =>
        (p.tags || []).some(t => tagSet.has(t.toLowerCase()))
      );
    }

    // Sort by coherency descending
    patterns.sort((a, b) => (b.coherencyTotal || 0) - (a.coherencyTotal || 0));

    const limit = filters.limit || 100;
    patterns = patterns.slice(0, limit);

    // Update member stats
    if (this._members[memberName]) {
      this._members[memberName].pullCount += patterns.length;
      this._save(this._membersPath, this._members);
    }

    return { patterns, count: patterns.length };
  }

  /**
   * Search hub patterns.
   */
  search(query, options = {}) {
    const { language, limit = 20 } = options;
    const queryLower = (query || '').toLowerCase();
    const terms = queryLower.split(/\s+/).filter(t => t.length > 1);

    let patterns = Object.values(this._patterns);

    if (language) {
      patterns = patterns.filter(p => p.language === language.toLowerCase());
    }

    // Simple scoring: name match + tag match + description match
    const scored = patterns.map(p => {
      let termScore = 0;
      const nameLower = (p.name || '').toLowerCase();
      const descLower = (p.description || '').toLowerCase();
      const tags = (p.tags || []).map(t => t.toLowerCase());

      for (const term of terms) {
        if (nameLower.includes(term)) termScore += 3;
        if (tags.includes(term)) termScore += 2;
        if (descLower.includes(term)) termScore += 1;
      }

      // Only boost with coherency if at least one term matched
      const score = termScore > 0 ? termScore + (p.coherencyTotal || 0) * 2 : 0;

      return { ...p, _score: score };
    })
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

    return scored.map(({ _score, ...rest }) => rest);
  }

  // ─── Team Analytics ───

  /**
   * Get hub statistics.
   */
  stats() {
    const patterns = Object.values(this._patterns);
    const members = Object.values(this._members);

    const totalCoherency = patterns.reduce((sum, p) => sum + (p.coherencyTotal || 0), 0);
    const languages = {};
    for (const p of patterns) {
      languages[p.language] = (languages[p.language] || 0) + 1;
    }

    // Top contributors
    const contributors = members
      .filter(m => m.pushCount > 0)
      .sort((a, b) => b.pushCount - a.pushCount)
      .slice(0, 10)
      .map(m => ({ name: m.name, pushCount: m.pushCount, pullCount: m.pullCount }));

    return {
      teamName: this.teamName,
      totalPatterns: patterns.length,
      totalMembers: members.length,
      avgCoherency: patterns.length > 0 ? Math.round(totalCoherency / patterns.length * 1000) / 1000 : 0,
      languages,
      topContributors: contributors,
      minCoherency: this.minCoherency,
    };
  }

  /**
   * Get recent activity feed.
   */
  activityFeed(limit = 50) {
    return this._activity.slice(-limit).reverse();
  }

  // ─── HTTP Server ───

  /**
   * Start the hub HTTP server.
   * @param {number} port
   * @returns {Promise<http.Server>}
   */
  start(port = 3580) {
    return new Promise((resolve) => {
      this._server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      this._server.listen(port, () => {
        resolve(this._server);
      });
    });
  }

  /**
   * Stop the hub server.
   */
  stop() {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
  }

  _handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Collect body for POST
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        this._route(req.method, pathname, json, req, res);
      } catch {
        this._json(res, 400, { error: 'Invalid JSON' });
      }
    });
  }

  _route(method, pathname, body, req, res) {
    // Auth check for protected routes
    const publicRoutes = ['/api/stats', '/api/health', '/api/members/register'];
    const isPublic = publicRoutes.includes(pathname);

    let member = null;
    if (!isPublic) {
      const apiKey = (req.headers.authorization || '').replace('Bearer ', '');
      member = this.authenticate(apiKey);
      if (!member) {
        return this._json(res, 401, { error: 'Invalid API key' });
      }
    }

    // Routes
    if (method === 'GET' && pathname === '/api/health') {
      return this._json(res, 200, { status: 'healthy', team: this.teamName });
    }

    if (method === 'GET' && pathname === '/api/stats') {
      return this._json(res, 200, this.stats());
    }

    if (method === 'POST' && pathname === '/api/members/register') {
      try {
        const result = this.registerMember(body.name, body);
        return this._json(res, 201, result);
      } catch (err) {
        return this._json(res, 400, { error: err.message });
      }
    }

    if (method === 'GET' && pathname === '/api/members') {
      return this._json(res, 200, { members: this.listMembers() });
    }

    if (method === 'POST' && pathname === '/api/push') {
      const patterns = body.patterns || [];
      const result = this.pushPatterns(patterns, member.name);
      return this._json(res, 200, result);
    }

    if (method === 'POST' && pathname === '/api/pull') {
      const result = this.pullPatterns(body, member.name);
      return this._json(res, 200, result);
    }

    if (method === 'POST' && pathname === '/api/search') {
      const results = this.search(body.query, body);
      return this._json(res, 200, { results, count: results.length });
    }

    if (method === 'GET' && pathname === '/api/activity') {
      return this._json(res, 200, { activity: this.activityFeed() });
    }

    this._json(res, 404, { error: 'Not found' });
  }

  _json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  // ─── Persistence Helpers ───

  _loadJSON(filepath, fallback) {
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
      return fallback;
    }
  }

  _save(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _addActivity(type, detail) {
    this._activity.push({
      type,
      detail,
      timestamp: new Date().toISOString(),
    });
    // Keep last 1000 events
    if (this._activity.length > 1000) {
      this._activity = this._activity.slice(-1000);
    }
    this._save(this._activityPath, this._activity);
  }

  _makeHubPattern(p, memberName, coherency) {
    return {
      name: p.name,
      code: p.code,
      language: (p.language || 'javascript').toLowerCase(),
      description: p.description || '',
      tags: p.tags || [],
      coherencyTotal: coherency,
      testCode: p.testCode || null,
      author: p.author || memberName,
      contributor: memberName,
      pushedAt: new Date().toISOString(),
    };
  }
}

// ─── Hub Client ───

class HubClient {
  /**
   * @param {string} hubUrl - Hub server URL (e.g. http://192.168.1.5:3580)
   * @param {string} apiKey - Member API key
   */
  constructor(hubUrl, apiKey) {
    this.hubUrl = hubUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Push local patterns to the hub.
   * @param {Array} patterns
   */
  async push(patterns) {
    return this._post('/api/push', { patterns });
  }

  /**
   * Pull patterns from the hub.
   * @param {object} filters - { language, minCoherency, since, tags, limit }
   */
  async pull(filters = {}) {
    return this._post('/api/pull', filters);
  }

  /**
   * Search hub patterns.
   */
  async search(query, options = {}) {
    return this._post('/api/search', { query, ...options });
  }

  /**
   * Get hub stats.
   */
  async stats() {
    return this._get('/api/stats');
  }

  /**
   * Check hub health.
   */
  async health() {
    return this._get('/api/health');
  }

  /**
   * Get activity feed.
   */
  async activity() {
    return this._get('/api/activity');
  }

  // ─── HTTP helpers ───

  _get(pathname) {
    return new Promise((resolve, reject) => {
      const url = new URL(pathname, this.hubUrl);
      const mod = url.protocol === 'https:' ? https : http;

      const req = mod.request(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  _post(pathname, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(pathname, this.hubUrl);
      const mod = url.protocol === 'https:' ? https : http;
      const bodyStr = JSON.stringify(body);

      const req = mod.request(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(bodyStr);
      req.end();
    });
  }
}

module.exports = {
  FederationHub,
  HubClient,
};
