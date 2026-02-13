/**
 * Hosted Hub — Multi-tenant hosted pattern hub service.
 *
 * Extends the FederationHub concept into a production-grade, multi-tenant
 * hosted service where each team gets an isolated hub instance with its own
 * patterns, members, and settings.
 *
 * Architecture:
 *   HostedHub (central) -> N x FederationHub (per team)
 *   SQLite for metadata (teams, members, usage) — JSON per-team for patterns
 *
 * Features:
 * - Multi-tenant: each team is an isolated FederationHub
 * - SQLite-backed team/member metadata (production-grade)
 * - Rate limiting per API key (sliding window)
 * - Team-scoped + global admin API keys
 * - Usage tracking for billing integration
 * - Public team directory (opt-in)
 * - Full REST API superset of FederationHub
 *
 * Zero external dependencies — Node.js built-ins only.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FederationHub } = require('./hub');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

// ─── Constants ───

const DEFAULT_PORT = 3590;
const DEFAULT_HOST = '0.0.0.0';
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120;     // 120 requests per minute per key
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB max request body

// ─── Rate Limiter ───

class RateLimiter {
  /**
   * Sliding-window rate limiter backed by an in-memory Map.
   * Each key tracks timestamps of requests within the current window.
   *
   * @param {number} windowMs  — Window duration in milliseconds
   * @param {number} maxHits   — Maximum requests allowed per window
   */
  constructor(windowMs = RATE_LIMIT_WINDOW_MS, maxHits = RATE_LIMIT_MAX_REQUESTS) {
    this._windowMs = windowMs;
    this._maxHits = maxHits;
    /** @type {Map<string, number[]>} apiKey -> sorted timestamps */
    this._hits = new Map();
  }

  /**
   * Check whether a request is allowed for the given key.
   * If allowed, records the hit and returns { allowed: true, remaining }.
   * If denied, returns { allowed: false, retryAfterMs }.
   */
  check(key) {
    const now = Date.now();
    const cutoff = now - this._windowMs;

    let timestamps = this._hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this._hits.set(key, timestamps);
    }

    // Prune expired entries
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this._maxHits) {
      const retryAfterMs = timestamps[0] + this._windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    timestamps.push(now);
    return { allowed: true, remaining: this._maxHits - timestamps.length };
  }

  /**
   * Periodically purge keys with no recent activity to prevent memory leaks.
   */
  prune() {
    const cutoff = Date.now() - this._windowMs;
    for (const [key, timestamps] of this._hits) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
        this._hits.delete(key);
      }
    }
  }
}

// ─── HostedHub ───

class HostedHub {
  /**
   * @param {object} options
   * @param {string} [options.dataDir]  — Root data directory (default: ~/.remembrance/hosted-hub/)
   * @param {number} [options.port]     — HTTP port (default: 3590)
   * @param {string} [options.host]     — Bind host (default: 0.0.0.0)
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(require('os').homedir(), '.remembrance', 'hosted-hub');
    this.port = options.port || DEFAULT_PORT;
    this.host = options.host || DEFAULT_HOST;

    this._server = null;
    this._pruneInterval = null;

    // Ensure root data directory
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    /** @type {Map<string, FederationHub>} teamId -> hub instance */
    this._hubs = new Map();

    // Rate limiter
    this._rateLimiter = new RateLimiter();

    // SQLite metadata store
    this._initMetadataStore();

    // Load existing teams from disk
    this._loadExistingTeams();
  }

  // ─── SQLite Metadata ───

  _initMetadataStore() {
    this._useSQLite = false;
    const dbPath = path.join(this.dataDir, 'hosted-hub.db');

    if (DatabaseSync) {
      try {
        this._db = new DatabaseSync(dbPath);
        this._db.exec('PRAGMA journal_mode=WAL');
        this._initSchema();
        this._useSQLite = true;
      } catch {
        this._db = null;
      }
    }

    if (!this._useSQLite) {
      // Fallback: in-memory maps (suitable for tests / envs without SQLite)
      this._teamsMap = new Map();
      this._apiKeysMap = new Map();  // apiKey -> { teamId, memberName, role }
      this._adminKeysSet = new Set();
      this._usageMap = new Map();    // `${teamId}:${memberName}` -> { push, pull, search }
    }
  }

  _initSchema() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        team_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        min_coherency REAL DEFAULT 0.65,
        max_patterns INTEGER DEFAULT 10000,
        is_public INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS team_api_keys (
        api_key TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'contributor',
        created_at TEXT NOT NULL,
        FOREIGN KEY (team_id) REFERENCES teams(team_id)
      );
      CREATE INDEX IF NOT EXISTS idx_team_api_keys_team ON team_api_keys(team_id);

      CREATE TABLE IF NOT EXISTS admin_keys (
        api_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_stats (
        team_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        push_count INTEGER DEFAULT 0,
        pull_count INTEGER DEFAULT 0,
        search_count INTEGER DEFAULT 0,
        last_active TEXT,
        PRIMARY KEY (team_id, member_name),
        FOREIGN KEY (team_id) REFERENCES teams(team_id)
      );
    `);
  }

  // ─── Team Management ───

  /**
   * Create a new team hub.
   *
   * @param {string} name     — Human-readable team name
   * @param {string} owner    — Owner member name
   * @param {object} [settings] — { minCoherency, maxPatterns, isPublic }
   * @returns {{ teamId, name, owner, ownerApiKey, settings }}
   */
  createTeam(name, owner, settings = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Team name is required');
    }
    if (!owner || typeof owner !== 'string') {
      throw new Error('Owner name is required');
    }

    const teamId = crypto.randomBytes(12).toString('hex');
    const now = new Date().toISOString();
    const minCoherency = settings.minCoherency || 0.65;
    const maxPatterns = settings.maxPatterns || 10000;
    const isPublic = settings.isPublic ? 1 : 0;

    // Create team data directory
    const teamDir = path.join(this.dataDir, teamId);
    if (!fs.existsSync(teamDir)) {
      fs.mkdirSync(teamDir, { recursive: true });
    }

    // Create the FederationHub for this team
    const hub = new FederationHub({
      dataDir: teamDir,
      minCoherency,
      teamName: name,
    });
    this._hubs.set(teamId, hub);

    // Register owner as first member in the team hub
    const ownerReg = hub.registerMember(owner, { role: 'admin' });

    if (this._useSQLite) {
      this._db.prepare(`
        INSERT INTO teams (team_id, name, owner, min_coherency, max_patterns, is_public, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(teamId, name, owner, minCoherency, maxPatterns, isPublic, now, now);

      this._db.prepare(`
        INSERT INTO team_api_keys (api_key, team_id, member_name, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(ownerReg.apiKey, teamId, owner, 'admin', now);

      this._db.prepare(`
        INSERT INTO usage_stats (team_id, member_name, push_count, pull_count, search_count, last_active)
        VALUES (?, ?, 0, 0, 0, ?)
      `).run(teamId, owner, now);
    } else {
      this._teamsMap.set(teamId, {
        teamId, name, owner, minCoherency, maxPatterns,
        isPublic: !!settings.isPublic, createdAt: now, updatedAt: now,
      });
      this._apiKeysMap.set(ownerReg.apiKey, { teamId, memberName: owner, role: 'admin' });
      this._usageMap.set(`${teamId}:${owner}`, { push: 0, pull: 0, search: 0 });
    }

    return {
      teamId,
      name,
      owner,
      ownerApiKey: ownerReg.apiKey,
      settings: { minCoherency, maxPatterns, isPublic: !!settings.isPublic },
    };
  }

  /**
   * Delete a team hub. Requires owner identity.
   *
   * @param {string} teamId
   * @param {string} requestingMember — Must be team owner
   * @returns {boolean}
   */
  deleteTeam(teamId, requestingMember) {
    const team = this._getTeamMeta(teamId);
    if (!team) throw new Error('Team not found');
    if (team.owner !== requestingMember) throw new Error('Only the team owner can delete a team');

    // Stop and remove the hub instance
    const hub = this._hubs.get(teamId);
    if (hub) {
      hub.stop();
      this._hubs.delete(teamId);
    }

    // Remove team directory
    const teamDir = path.join(this.dataDir, teamId);
    if (fs.existsSync(teamDir)) {
      fs.rmSync(teamDir, { recursive: true, force: true });
    }

    if (this._useSQLite) {
      this._db.prepare('DELETE FROM usage_stats WHERE team_id = ?').run(teamId);
      this._db.prepare('DELETE FROM team_api_keys WHERE team_id = ?').run(teamId);
      this._db.prepare('DELETE FROM teams WHERE team_id = ?').run(teamId);
    } else {
      this._teamsMap.delete(teamId);
      // Remove all API keys for this team
      for (const [key, val] of this._apiKeysMap) {
        if (val.teamId === teamId) this._apiKeysMap.delete(key);
      }
      // Remove usage entries
      for (const [key] of this._usageMap) {
        if (key.startsWith(`${teamId}:`)) this._usageMap.delete(key);
      }
    }

    return true;
  }

  /**
   * Get team metadata.
   * @returns {object|null}
   */
  _getTeamMeta(teamId) {
    if (this._useSQLite) {
      const row = this._db.prepare('SELECT * FROM teams WHERE team_id = ?').get(teamId);
      if (!row) return null;
      return {
        teamId: row.team_id,
        name: row.name,
        owner: row.owner,
        minCoherency: row.min_coherency,
        maxPatterns: row.max_patterns,
        isPublic: !!row.is_public,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }
    return this._teamsMap.get(teamId) || null;
  }

  // ─── Member Management ───

  /**
   * Register a member in a specific team.
   *
   * @param {string} teamId
   * @param {string} memberName
   * @param {object} [options] — { role }
   * @returns {{ teamId, memberName, apiKey, role }}
   */
  registerMember(teamId, memberName, options = {}) {
    const team = this._getTeamMeta(teamId);
    if (!team) throw new Error('Team not found');

    const hub = this._hubs.get(teamId);
    if (!hub) throw new Error('Team hub not loaded');

    const reg = hub.registerMember(memberName, options);
    const now = new Date().toISOString();

    if (this._useSQLite) {
      this._db.prepare(`
        INSERT INTO team_api_keys (api_key, team_id, member_name, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(reg.apiKey, teamId, memberName, reg.role, now);

      this._db.prepare(`
        INSERT OR IGNORE INTO usage_stats (team_id, member_name, push_count, pull_count, search_count, last_active)
        VALUES (?, ?, 0, 0, 0, ?)
      `).run(teamId, memberName, now);
    } else {
      this._apiKeysMap.set(reg.apiKey, { teamId, memberName, role: reg.role });
      this._usageMap.set(`${teamId}:${memberName}`, { push: 0, pull: 0, search: 0 });
    }

    return { teamId, memberName, apiKey: reg.apiKey, role: reg.role };
  }

  // ─── Admin Keys ───

  /**
   * Create a global admin API key for cross-team operations.
   *
   * @param {string} label — Descriptive label for the key
   * @returns {{ apiKey, label }}
   */
  createAdminKey(label = 'admin') {
    const apiKey = `admin_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();

    if (this._useSQLite) {
      this._db.prepare(`
        INSERT INTO admin_keys (api_key, label, created_at) VALUES (?, ?, ?)
      `).run(apiKey, label, now);
    } else {
      this._adminKeysSet.add(apiKey);
    }

    return { apiKey, label };
  }

  // ─── Authentication ───

  /**
   * Authenticate a request by API key.
   *
   * @param {string} apiKey
   * @returns {{ isAdmin: boolean, teamId?: string, memberName?: string, role?: string } | null}
   */
  authenticate(apiKey) {
    if (!apiKey) return null;

    // Check admin keys first
    if (this._isAdminKey(apiKey)) {
      return { isAdmin: true };
    }

    // Check team-scoped keys
    if (this._useSQLite) {
      const row = this._db.prepare('SELECT * FROM team_api_keys WHERE api_key = ?').get(apiKey);
      if (row) {
        return { isAdmin: false, teamId: row.team_id, memberName: row.member_name, role: row.role };
      }
    } else {
      const entry = this._apiKeysMap.get(apiKey);
      if (entry) {
        return { isAdmin: false, teamId: entry.teamId, memberName: entry.memberName, role: entry.role };
      }
    }

    return null;
  }

  _isAdminKey(apiKey) {
    if (this._useSQLite) {
      const row = this._db.prepare('SELECT 1 FROM admin_keys WHERE api_key = ?').get(apiKey);
      return !!row;
    }
    return this._adminKeysSet.has(apiKey);
  }

  // ─── Usage Tracking ───

  /**
   * Record a usage event for a team member.
   *
   * @param {string} teamId
   * @param {string} memberName
   * @param {'push'|'pull'|'search'} action
   * @param {number} [count=1]
   */
  _trackUsage(teamId, memberName, action, count = 1) {
    const now = new Date().toISOString();

    if (this._useSQLite) {
      const column = `${action}_count`;
      this._db.prepare(`
        UPDATE usage_stats SET ${column} = ${column} + ?, last_active = ?
        WHERE team_id = ? AND member_name = ?
      `).run(count, now, teamId, memberName);
    } else {
      const key = `${teamId}:${memberName}`;
      const usage = this._usageMap.get(key);
      if (usage) {
        usage[action] = (usage[action] || 0) + count;
      }
    }
  }

  /**
   * Get usage stats for a team.
   *
   * @param {string} teamId
   * @returns {Array<{ memberName, pushCount, pullCount, searchCount, lastActive }>}
   */
  getTeamUsage(teamId) {
    if (this._useSQLite) {
      const rows = this._db.prepare(
        'SELECT * FROM usage_stats WHERE team_id = ? ORDER BY push_count DESC'
      ).all(teamId);
      return rows.map(r => ({
        memberName: r.member_name,
        pushCount: r.push_count,
        pullCount: r.pull_count,
        searchCount: r.search_count,
        lastActive: r.last_active,
      }));
    }

    const results = [];
    for (const [key, usage] of this._usageMap) {
      if (key.startsWith(`${teamId}:`)) {
        const memberName = key.slice(teamId.length + 1);
        results.push({
          memberName,
          pushCount: usage.push || 0,
          pullCount: usage.pull || 0,
          searchCount: usage.search || 0,
          lastActive: null,
        });
      }
    }
    return results;
  }

  // ─── Hub Access ───

  /**
   * Get the FederationHub instance for a team.
   * @param {string} teamId
   * @returns {FederationHub|null}
   */
  getHub(teamId) {
    return this._hubs.get(teamId) || null;
  }

  // ─── Disk Recovery ───

  /**
   * Load existing team hubs from disk on startup.
   * Scans dataDir for subdirectories that match known teams.
   */
  _loadExistingTeams() {
    if (this._useSQLite) {
      const rows = this._db.prepare('SELECT * FROM teams').all();
      for (const row of rows) {
        const teamDir = path.join(this.dataDir, row.team_id);
        if (fs.existsSync(teamDir)) {
          try {
            const hub = new FederationHub({
              dataDir: teamDir,
              minCoherency: row.min_coherency,
              teamName: row.name,
            });
            this._hubs.set(row.team_id, hub);
          } catch {
            // Skip corrupt team directories
          }
        }
      }
    } else {
      // In-memory mode: scan for team directories with members.json
      if (!fs.existsSync(this.dataDir)) return;
      try {
        const entries = fs.readdirSync(this.dataDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const membersPath = path.join(this.dataDir, entry.name, 'members.json');
            if (fs.existsSync(membersPath)) {
              try {
                const hub = new FederationHub({
                  dataDir: path.join(this.dataDir, entry.name),
                });
                this._hubs.set(entry.name, hub);
                this._teamsMap.set(entry.name, {
                  teamId: entry.name, name: hub.teamName || entry.name,
                  owner: 'unknown', minCoherency: hub.minCoherency,
                  maxPatterns: 10000, isPublic: false,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
              } catch {
                // Skip corrupt directories
              }
            }
          }
        }
      } catch {
        // No existing teams to load
      }
    }
  }

  // ─── Global Stats ───

  /**
   * Aggregate statistics across all teams.
   */
  globalStats() {
    let totalTeams = 0;
    let totalPatterns = 0;
    let totalMembers = 0;
    const teams = [];

    if (this._useSQLite) {
      const rows = this._db.prepare('SELECT * FROM teams').all();
      totalTeams = rows.length;
      for (const row of rows) {
        const hub = this._hubs.get(row.team_id);
        const hubStats = hub ? hub.stats() : { totalPatterns: 0, totalMembers: 0 };
        totalPatterns += hubStats.totalPatterns;
        totalMembers += hubStats.totalMembers;
        teams.push({
          teamId: row.team_id,
          name: row.name,
          patterns: hubStats.totalPatterns,
          members: hubStats.totalMembers,
          isPublic: !!row.is_public,
        });
      }
    } else {
      totalTeams = this._teamsMap.size;
      for (const [teamId, meta] of this._teamsMap) {
        const hub = this._hubs.get(teamId);
        const hubStats = hub ? hub.stats() : { totalPatterns: 0, totalMembers: 0 };
        totalPatterns += hubStats.totalPatterns;
        totalMembers += hubStats.totalMembers;
        teams.push({
          teamId,
          name: meta.name,
          patterns: hubStats.totalPatterns,
          members: hubStats.totalMembers,
          isPublic: meta.isPublic,
        });
      }
    }

    return { totalTeams, totalPatterns, totalMembers, teams };
  }

  /**
   * List public teams for discovery.
   */
  discoverTeams() {
    const publicTeams = [];

    if (this._useSQLite) {
      const rows = this._db.prepare('SELECT * FROM teams WHERE is_public = 1').all();
      for (const row of rows) {
        const hub = this._hubs.get(row.team_id);
        const hubStats = hub ? hub.stats() : { totalPatterns: 0, totalMembers: 0, avgCoherency: 0 };
        publicTeams.push({
          teamId: row.team_id,
          name: row.name,
          patterns: hubStats.totalPatterns,
          members: hubStats.totalMembers,
          avgCoherency: hubStats.avgCoherency,
          createdAt: row.created_at,
        });
      }
    } else {
      for (const [teamId, meta] of this._teamsMap) {
        if (!meta.isPublic) continue;
        const hub = this._hubs.get(teamId);
        const hubStats = hub ? hub.stats() : { totalPatterns: 0, totalMembers: 0, avgCoherency: 0 };
        publicTeams.push({
          teamId,
          name: meta.name,
          patterns: hubStats.totalPatterns,
          members: hubStats.totalMembers,
          avgCoherency: hubStats.avgCoherency,
          createdAt: meta.createdAt,
        });
      }
    }

    return publicTeams;
  }

  // ─── HTTP Server ───

  /**
   * Start the hosted hub HTTP server.
   * @returns {Promise<http.Server>}
   */
  start() {
    return new Promise((resolve) => {
      this._server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      // Periodic rate-limiter cleanup (every 5 minutes)
      this._pruneInterval = setInterval(() => {
        this._rateLimiter.prune();
      }, 5 * 60 * 1000);
      this._pruneInterval.unref();

      this._server.listen(this.port, this.host, () => {
        resolve(this._server);
      });
    });
  }

  /**
   * Stop the hosted hub server and clean up.
   */
  stop() {
    if (this._pruneInterval) {
      clearInterval(this._pruneInterval);
      this._pruneInterval = null;
    }
    if (this._server) {
      this._server.close();
      this._server = null;
    }
  }

  _handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
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

    // Collect body for POST/DELETE with size limit
    let body = '';
    let bodySize = 0;

    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_BYTES) {
        this._json(res, 413, { error: 'Request body too large' });
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        this._route(req.method, pathname, json, req, res);
      } catch {
        this._json(res, 400, { error: 'Invalid JSON' });
      }
    });
  }

  /**
   * Route incoming requests to the appropriate handler.
   */
  _route(method, pathname, body, req, res) {
    // ─── Public endpoints (no auth required) ───

    if (method === 'GET' && pathname === '/api/hub/health') {
      return this._json(res, 200, {
        status: 'healthy',
        service: 'hosted-hub',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    if (method === 'GET' && pathname === '/api/hub/discover') {
      return this._json(res, 200, { teams: this.discoverTeams() });
    }

    // ─── Auth check ───

    const apiKey = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const auth = this.authenticate(apiKey);

    // Rate limiting (by API key, or by IP for unauthenticated)
    const rateLimitKey = apiKey || req.socket.remoteAddress || 'unknown';
    const rateCheck = this._rateLimiter.check(rateLimitKey);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', Math.ceil(rateCheck.retryAfterMs / 1000));
      return this._json(res, 429, {
        error: 'Rate limit exceeded',
        retryAfterMs: rateCheck.retryAfterMs,
      });
    }
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining);

    // ─── Global stats (requires any auth) ───

    if (method === 'GET' && pathname === '/api/hub/stats') {
      if (!auth) return this._json(res, 401, { error: 'Authentication required' });
      return this._json(res, 200, this.globalStats());
    }

    // ─── Team creation (requires admin or any auth) ───

    if (method === 'POST' && pathname === '/api/teams/create') {
      if (!auth) return this._json(res, 401, { error: 'Authentication required' });
      try {
        const result = this.createTeam(body.name, body.owner || (auth.memberName), body.settings || {});
        return this._json(res, 201, result);
      } catch (err) {
        return this._json(res, 400, { error: err.message });
      }
    }

    // ─── Team-scoped routes ───

    const teamMatch = pathname.match(/^\/api\/teams\/([a-f0-9]+)(\/.*)?$/);
    if (teamMatch) {
      const teamId = teamMatch[1];
      const subPath = teamMatch[2] || '';

      return this._routeTeam(method, teamId, subPath, body, auth, res);
    }

    this._json(res, 404, { error: 'Not found' });
  }

  /**
   * Route team-scoped requests.
   */
  _routeTeam(method, teamId, subPath, body, auth, res) {
    const team = this._getTeamMeta(teamId);
    if (!team) {
      return this._json(res, 404, { error: 'Team not found' });
    }

    const hub = this._hubs.get(teamId);
    if (!hub) {
      return this._json(res, 500, { error: 'Team hub not loaded' });
    }

    // Member registration is open (no auth required for joining)
    if (method === 'POST' && subPath === '/members/register') {
      try {
        const result = this.registerMember(teamId, body.name, body);
        return this._json(res, 201, result);
      } catch (err) {
        return this._json(res, 400, { error: err.message });
      }
    }

    // All other team routes require authentication
    if (!auth) {
      return this._json(res, 401, { error: 'Authentication required' });
    }

    // Team-scoped keys must match the team (admins can access any team)
    if (!auth.isAdmin && auth.teamId !== teamId) {
      return this._json(res, 403, { error: 'API key not authorized for this team' });
    }

    const memberName = auth.isAdmin ? (body._as || 'admin') : auth.memberName;

    // GET /api/teams/:teamId/stats
    if (method === 'GET' && subPath === '/stats') {
      const stats = hub.stats();
      stats.usage = this.getTeamUsage(teamId);
      return this._json(res, 200, stats);
    }

    // POST /api/teams/:teamId/push
    if (method === 'POST' && subPath === '/push') {
      const patterns = body.patterns || [];

      // Enforce maxPatterns limit
      const currentCount = Object.keys(hub._patterns || {}).length;
      if (currentCount + patterns.length > team.maxPatterns) {
        return this._json(res, 400, {
          error: `Would exceed team pattern limit of ${team.maxPatterns} (current: ${currentCount})`,
        });
      }

      const result = hub.pushPatterns(patterns, memberName);
      this._trackUsage(teamId, memberName, 'push', result.accepted);
      return this._json(res, 200, result);
    }

    // POST /api/teams/:teamId/pull
    if (method === 'POST' && subPath === '/pull') {
      const result = hub.pullPatterns(body, memberName);
      this._trackUsage(teamId, memberName, 'pull', result.count);
      return this._json(res, 200, result);
    }

    // POST /api/teams/:teamId/search
    if (method === 'POST' && subPath === '/search') {
      const results = hub.search(body.query, body);
      this._trackUsage(teamId, memberName, 'search', 1);
      return this._json(res, 200, { results, count: results.length });
    }

    // GET /api/teams/:teamId/activity
    if (method === 'GET' && subPath === '/activity') {
      const limit = 50;
      return this._json(res, 200, { activity: hub.activityFeed(limit) });
    }

    // DELETE /api/teams/:teamId
    if (method === 'DELETE' && subPath === '') {
      try {
        this.deleteTeam(teamId, memberName);
        return this._json(res, 200, { deleted: true, teamId });
      } catch (err) {
        return this._json(res, 403, { error: err.message });
      }
    }

    this._json(res, 404, { error: 'Not found' });
  }

  _json(res, status, data) {
    // Guard against writing to an already-finished response
    if (res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}

// ─── Convenience Starter ───

/**
 * Start a hosted hub HTTP server.
 *
 * @param {object} [options]
 * @param {string} [options.dataDir]  — Root data directory
 * @param {number} [options.port]     — HTTP port (default: 3590)
 * @param {string} [options.host]     — Bind host (default: 0.0.0.0)
 * @returns {Promise<{ server: http.Server, hub: HostedHub, close: Function }>}
 *
 * @example
 *   const { server, hub, close } = await startHostedHub({ port: 4000 });
 *   const admin = hub.createAdminKey('ci');
 *   // ... later
 *   close();
 */
async function startHostedHub(options = {}) {
  const hub = new HostedHub(options);
  const server = await hub.start();

  return {
    server,
    hub,
    close() {
      hub.stop();
    },
  };
}

module.exports = {
  HostedHub,
  startHostedHub,
};
