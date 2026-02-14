/**
 * Web Dashboard for the Remembrance Oracle
 *
 * Self-contained HTTP server — no external dependencies.
 * Serves an interactive HTML dashboard with:
 * - Pattern browser with search
 * - Semantic vector visualization
 * - History viewer
 * - Audit log viewer
 * - Store statistics
 * - Real-time WebSocket updates
 * - Authentication & user management
 * - Pattern version history
 */

const http = require('http');
const url = require('url');
const { RemembranceOracle } = require('../api/oracle');
const { safeJsonParse } = require('../core/covenant');

/**
 * Simple in-memory rate limiter.
 * Tracks requests per IP in a sliding window.
 */
function createRateLimiter(options = {}) {
  const { windowMs = 60000, maxRequests = 100 } = options;
  const hits = new Map(); // ip → [timestamps]

  // Cleanup old entries every minute
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of hits) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) hits.delete(ip);
      else hits.set(ip, valid);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  return function rateLimitMiddleware(req, res, next) {
    // Parse X-Forwarded-For for proper client IP behind reverse proxies
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || '127.0.0.1');
    const now = Date.now();
    const timestamps = (hits.get(ip) || []).filter(t => now - t < windowMs);
    timestamps.push(now);
    hits.set(ip, timestamps);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - timestamps.length));

    if (timestamps.length > maxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(windowMs / 1000) });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    next();
  };
}

function createDashboardServer(oracle, options = {}) {
  const oracleInstance = oracle || new RemembranceOracle();

  // Auth manager (optional — when auth is enabled)
  let authManager = options.authManager || null;
  let authMw = null;
  if (options.auth !== false) {
    try {
      const { AuthManager, authMiddleware } = require('../auth/auth');
      if (!authManager) {
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        authManager = new AuthManager(sqliteStore);
      }
      authMw = authMiddleware(authManager);
    } catch {
      // Auth module not available — run without auth
    }
  }

  // Version manager (optional)
  let versionManager = null;
  try {
    const { VersionManager } = require('../core/versioning');
    const sqliteStore = oracleInstance.store.getSQLiteStore();
    versionManager = new VersionManager(sqliteStore);
  } catch {
    // Versioning module not available
  }

  // Rate limiter (optional — when rateLimit is enabled)
  let rateLimiter = null;
  if (options.rateLimit !== false && options.auth !== false) {
    rateLimiter = createRateLimiter(options.rateLimitOptions || {});
  }

  // WebSocket server (optional)
  let wsServer = null;

  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate limiting (applied before auth)
    const proceed = () => {
      // Auth middleware — skip for dashboard HTML, health, and login
      const publicPaths = ['/', '/api/health', '/api/login'];
      if (authMw && !publicPaths.includes(pathname)) {
        authMw(req, res, () => handleRequest(req, res, parsed, pathname));
      } else {
        req.user = null;
        handleRequest(req, res, parsed, pathname);
      }
    };

    if (rateLimiter) {
      rateLimiter(req, res, proceed);
    } else {
      proceed();
    }
  });

  function handleRequest(req, res, parsed, pathname) {
    try {
      // ─── Health ───
      if (pathname === '/api/health') {
        const { health: healthCheck } = require('../health/monitor');
        const healthResult = healthCheck(oracleInstance);
        healthResult.wsClients = wsServer ? wsServer.clients.size : 0;
        const statusCode = healthResult.status === 'healthy' ? 200 : healthResult.status === 'degraded' ? 200 : 503;
        sendJSON(res, healthResult, statusCode);
        return;
      }

      // ─── Metrics ───
      if (pathname === '/api/metrics') {
        const { metrics: metricsSnapshot } = require('../health/monitor');
        sendJSON(res, metricsSnapshot(oracleInstance));
        return;
      }

      // ─── Auth routes ───
      if (pathname === '/api/login' && req.method === 'POST') {
        if (!authManager) { sendJSON(res, { error: 'Auth not enabled' }, 501); return; }
        readBody(req, (body) => {
          const { username, password } = body;
          const result = authManager.authenticate(username, password);
          if (!result) { sendJSON(res, { error: 'Invalid credentials' }, 401); return; }
          sendJSON(res, result);
        });
        return;
      }

      if (pathname === '/api/users' && req.method === 'GET') {
        if (!authManager) { sendJSON(res, [], 200); return; }
        const { canManageUsers } = require('../auth/auth');
        if (!canManageUsers(req.user)) { sendJSON(res, { error: 'Forbidden' }, 403); return; }
        sendJSON(res, authManager.listUsers());
        return;
      }

      if (pathname === '/api/users' && req.method === 'POST') {
        if (!authManager) { sendJSON(res, { error: 'Auth not enabled' }, 501); return; }
        const { canManageUsers } = require('../auth/auth');
        if (!canManageUsers(req.user)) { sendJSON(res, { error: 'Forbidden' }, 403); return; }
        readBody(req, (body) => {
          try {
            const user = authManager.createUser(body.username, body.password, body.role);
            sendJSON(res, user);
          } catch (err) {
            sendJSON(res, { error: err.message }, 400);
          }
        });
        return;
      }

      // ─── Stats ───
      if (pathname === '/api/stats') {
        const storeStats = oracleInstance.stats();
        const patternStats = oracleInstance.patternStats();
        sendJSON(res, { store: storeStats, patterns: patternStats });
        return;
      }

      // ─── Patterns ───
      if (pathname === '/api/patterns') {
        const patterns = oracleInstance.patterns.getAll();
        sendJSON(res, patterns);
        return;
      }

      // ─── Search ───
      if (pathname === '/api/search') {
        const query = parsed.query.q || '';
        const mode = parsed.query.mode || 'hybrid';
        const limit = parseInt(parsed.query.limit) || 10;
        if (!query) { sendJSON(res, []); return; }
        const results = oracleInstance.search(query, { mode, limit });
        sendJSON(res, results);
        return;
      }

      // ─── Nearest vectors ───
      if (pathname === '/api/nearest') {
        const query = parsed.query.q || '';
        if (!query) { sendJSON(res, []); return; }
        try {
          const { nearestTerms } = require('../core/vectors');
          sendJSON(res, nearestTerms(query, 15));
        } catch {
          sendJSON(res, []);
        }
        return;
      }

      // ─── Audit log ───
      if (pathname === '/api/audit') {
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, []); return; }
        const limit = parseInt(parsed.query.limit) || 50;
        sendJSON(res, sqliteStore.getAuditLog({ limit }));
        return;
      }

      // ─── Entries ───
      if (pathname === '/api/entries') {
        const entries = oracleInstance.store.getAll();
        sendJSON(res, entries);
        return;
      }

      // ─── Version history ───
      if (pathname === '/api/versions') {
        if (!versionManager) { sendJSON(res, []); return; }
        const patternId = parsed.query.id;
        if (!patternId) { sendJSON(res, { error: 'id required' }, 400); return; }
        sendJSON(res, versionManager.getHistory(patternId));
        return;
      }

      // ─── Semantic diff ───
      if (pathname === '/api/diff') {
        const idA = parsed.query.a;
        const idB = parsed.query.b;
        if (!idA || !idB) { sendJSON(res, { error: 'a and b required' }, 400); return; }
        if (versionManager) {
          const { semanticDiff } = require('../core/versioning');
          const patternA = oracleInstance.patterns.getAll().find(p => p.id === idA) || oracleInstance.store.get(idA);
          const patternB = oracleInstance.patterns.getAll().find(p => p.id === idB) || oracleInstance.store.get(idB);
          if (!patternA || !patternB) { sendJSON(res, { error: 'Pattern not found' }, 404); return; }
          sendJSON(res, semanticDiff(patternA.code, patternB.code, patternA.language));
        } else {
          sendJSON(res, oracleInstance.diff(idA, idB));
        }
        return;
      }

      // ─── Analytics ───
      if (pathname === '/api/analytics') {
        try {
          const { generateAnalytics, computeTagCloud } = require('../core/analytics');
          const analytics = generateAnalytics(oracleInstance);
          analytics.tagCloud = computeTagCloud(oracleInstance.patterns.getAll());
          sendJSON(res, analytics);
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Voting ───
      if (pathname === '/api/vote' && req.method === 'POST') {
        readBody(req, (body) => {
          const result = oracleInstance.vote(body.patternId, body.voter || 'dashboard', body.vote || 1);
          sendJSON(res, result);
        });
        return;
      }

      if (pathname === '/api/top-voted') {
        const limit = parseInt(parsed.query.limit) || 20;
        const patterns = oracleInstance.topVoted(limit);
        sendJSON(res, patterns);
        return;
      }

      // ─── Reflection loop ───
      if (pathname === '/api/reflect' && req.method === 'POST') {
        readBody(req, (body) => {
          const { reflectionLoop } = require('../core/reflection');
          const result = reflectionLoop(body.code || '', {
            language: body.language,
            maxLoops: body.maxLoops || 3,
            targetCoherence: body.targetCoherence || 0.9,
            description: body.description || '',
            tags: body.tags || [],
          });
          sendJSON(res, result);
        });
        return;
      }

      // ─── Covenant check ───
      if (pathname === '/api/covenant') {
        if (req.method === 'POST') {
          readBody(req, (body) => {
            const { covenantCheck } = require('../core/covenant');
            const result = covenantCheck(body.code || '', {
              description: body.description || '',
              tags: body.tags || [],
              language: body.language,
            });
            sendJSON(res, result);
          });
          return;
        }
        // GET — return the 15 principles
        const { getCovenant } = require('../core/covenant');
        sendJSON(res, getCovenant());
        return;
      }

      // ─── Debug search ───
      if (pathname === '/api/debug/search') {
        const query = parsed.query.q || '';
        if (!query) { sendJSON(res, []); return; }
        try {
          const { DebugOracle } = require('../core/debug-oracle');
          const sqliteStore = oracleInstance.store.getSQLiteStore();
          if (!sqliteStore) { sendJSON(res, []); return; }
          const debugOracle = new DebugOracle(sqliteStore);
          const results = debugOracle.search({ errorMessage: query, limit: parseInt(parsed.query.limit) || 10 });
          sendJSON(res, results);
        } catch {
          sendJSON(res, []);
        }
        return;
      }

      // ─── Debug stats ───
      if (pathname === '/api/debug/stats') {
        try {
          const { DebugOracle } = require('../core/debug-oracle');
          const sqliteStore = oracleInstance.store.getSQLiteStore();
          if (!sqliteStore) { sendJSON(res, { totalPatterns: 0 }); return; }
          const debugOracle = new DebugOracle(sqliteStore);
          sendJSON(res, debugOracle.stats());
        } catch {
          sendJSON(res, { totalPatterns: 0, avgConfidence: 0, byCategory: {}, byLanguage: {} });
        }
        return;
      }

      // ─── Teams ───
      if (pathname === '/api/teams' && req.method === 'GET') {
        // Return teams/orgs for the current user
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, []); return; }
        try {
          sqliteStore.db.exec(`
            CREATE TABLE IF NOT EXISTS teams (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              description TEXT DEFAULT '',
              created_by TEXT DEFAULT '',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS team_members (
              team_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              role TEXT DEFAULT 'member',
              joined_at TEXT NOT NULL,
              PRIMARY KEY (team_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS team_invites (
              id TEXT PRIMARY KEY,
              team_id TEXT NOT NULL,
              code TEXT NOT NULL UNIQUE,
              role TEXT DEFAULT 'member',
              uses_remaining INTEGER DEFAULT 1,
              created_at TEXT NOT NULL,
              expires_at TEXT
            );
          `);
          const teams = sqliteStore.db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all();
          // Enrich with member count
          const enriched = teams.map(t => {
            const members = sqliteStore.db.prepare('SELECT COUNT(*) as count FROM team_members WHERE team_id = ?').get(t.id);
            return { ...t, memberCount: members?.count || 0 };
          });
          sendJSON(res, enriched);
        } catch {
          sendJSON(res, []);
        }
        return;
      }

      if (pathname === '/api/teams' && req.method === 'POST') {
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, { error: 'Storage not available' }, 501); return; }
        readBody(req, (body) => {
          try {
            sqliteStore.db.exec(`
              CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                created_by TEXT DEFAULT '',
                created_at TEXT NOT NULL
              );
              CREATE TABLE IF NOT EXISTS team_members (
                team_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT DEFAULT 'member',
                joined_at TEXT NOT NULL,
                PRIMARY KEY (team_id, user_id)
              );
            `);
            const crypto = require('crypto');
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const name = body.name || 'Unnamed Team';
            const description = body.description || '';
            const createdBy = req.user?.id || 'anonymous';
            sqliteStore.db.prepare(
              'INSERT INTO teams (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)'
            ).run(id, name, description, createdBy, now);
            // Add creator as admin
            sqliteStore.db.prepare(
              'INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
            ).run(id, createdBy, 'admin', now);
            sendJSON(res, { id, name, description, created_by: createdBy, created_at: now, memberCount: 1 });
          } catch (err) {
            sendJSON(res, { error: err.message }, 400);
          }
        });
        return;
      }

      // ─── Team members ───
      const teamMembersMatch = pathname.match(/^\/api\/teams\/([^/]+)\/members$/);
      if (teamMembersMatch && req.method === 'POST') {
        const teamId = teamMembersMatch[1];
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, { error: 'Storage not available' }, 501); return; }
        readBody(req, (body) => {
          try {
            const now = new Date().toISOString();
            const userId = body.userId || body.user_id || '';
            const role = body.role || 'member';
            sqliteStore.db.prepare(
              'INSERT OR REPLACE INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
            ).run(teamId, userId, role, now);
            sendJSON(res, { team_id: teamId, user_id: userId, role, joined_at: now });
          } catch (err) {
            sendJSON(res, { error: err.message }, 400);
          }
        });
        return;
      }

      // ─── Team invites ───
      const teamInviteMatch = pathname.match(/^\/api\/teams\/([^/]+)\/invite$/);
      if (teamInviteMatch && req.method === 'POST') {
        const teamId = teamInviteMatch[1];
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, { error: 'Storage not available' }, 501); return; }
        readBody(req, (body) => {
          try {
            sqliteStore.db.exec(`
              CREATE TABLE IF NOT EXISTS team_invites (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                role TEXT DEFAULT 'member',
                uses_remaining INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                expires_at TEXT
              );
            `);
            const crypto = require('crypto');
            const id = crypto.randomUUID();
            const code = crypto.randomBytes(16).toString('hex');
            const now = new Date().toISOString();
            const role = body.role || 'member';
            const usesRemaining = body.uses || 1;
            const expiresAt = body.expiresAt || null;
            sqliteStore.db.prepare(
              'INSERT INTO team_invites (id, team_id, code, role, uses_remaining, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).run(id, teamId, code, role, usesRemaining, now, expiresAt);
            sendJSON(res, { id, team_id: teamId, code, role, uses_remaining: usesRemaining, created_at: now, expires_at: expiresAt });
          } catch (err) {
            sendJSON(res, { error: err.message }, 400);
          }
        });
        return;
      }

      // ─── Insights ───
      if (pathname === '/api/insights') {
        try {
          const { generateInsights } = require('../core/insights');
          sendJSON(res, generateInsights(oracleInstance, parsed.query));
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Actionable Insights ───
      if (pathname === '/api/insights/act' && req.method === 'POST') {
        try {
          const { actOnInsights } = require('../core/actionable-insights');
          const report = actOnInsights(oracleInstance);
          sendJSON(res, report);
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Usage Boosts (search ranking insights) ───
      if (pathname === '/api/insights/boosts') {
        try {
          const { computeUsageBoosts } = require('../core/actionable-insights');
          const boosts = computeUsageBoosts(oracleInstance);
          const boostArray = Array.from(boosts.entries()).map(([id, boost]) => ({ id, boost }));
          sendJSON(res, boostArray);
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Lifecycle status ───
      if (pathname === '/api/lifecycle') {
        sendJSON(res, oracleInstance.lifecycleStatus());
        return;
      }

      // ─── Lifecycle start ───
      if (pathname === '/api/lifecycle/start' && req.method === 'POST') {
        readBody(req, (body) => {
          sendJSON(res, oracleInstance.startLifecycle(body || {}));
        });
        return;
      }

      // ─── Lifecycle stop ───
      if (pathname === '/api/lifecycle/stop' && req.method === 'POST') {
        sendJSON(res, oracleInstance.stopLifecycle());
        return;
      }

      // ─── Lifecycle run cycle ───
      if (pathname === '/api/lifecycle/run' && req.method === 'POST') {
        const lifecycle = oracleInstance.getLifecycle();
        sendJSON(res, lifecycle.runCycle());
        return;
      }

      // ─── Lifecycle history ───
      if (pathname === '/api/lifecycle/history') {
        const lifecycle = oracleInstance.getLifecycle();
        sendJSON(res, lifecycle.getHistory());
        return;
      }

      // ─── Debug grow ───
      if (pathname === '/api/debug/grow' && req.method === 'POST') {
        try {
          sendJSON(res, oracleInstance.debugGrow(parsed.query || {}));
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Debug patterns list ───
      if (pathname === '/api/debug/patterns') {
        try {
          sendJSON(res, oracleInstance.debugPatterns(parsed.query || {}));
        } catch {
          sendJSON(res, []);
        }
        return;
      }

      // ─── Smart search ───
      if (pathname === '/api/smart-search') {
        const query = parsed.query.q || '';
        if (!query) { sendJSON(res, { results: [], intent: {}, suggestions: [] }); return; }
        try {
          const { smartSearch } = require('../core/search-intelligence');
          const result = smartSearch(oracleInstance, query, {
            limit: parseInt(parsed.query.limit) || 10,
            language: parsed.query.language,
            mode: parsed.query.mode || 'auto',
          });
          sendJSON(res, result);
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Self-improve ───
      if (pathname === '/api/self-improve' && req.method === 'POST') {
        try {
          sendJSON(res, oracleInstance.selfImprove());
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Self-optimize ───
      if (pathname === '/api/self-optimize' && req.method === 'POST') {
        try {
          sendJSON(res, oracleInstance.selfOptimize());
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Full cycle ───
      if (pathname === '/api/full-cycle' && req.method === 'POST') {
        try {
          sendJSON(res, oracleInstance.fullOptimizationCycle());
        } catch (err) {
          sendJSON(res, { error: err.message }, 500);
        }
        return;
      }

      // ─── Serve dashboard HTML ───
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHTML());
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Attach WebSocket after server is created
  try {
    const { WebSocketServer } = require('../core/websocket');
    wsServer = new WebSocketServer(server);

    wsServer.on('connection', () => {
      // Broadcast connection count update
      wsServer.broadcast({ type: 'clients', count: wsServer.clients.size });
    });

    wsServer.on('close', () => {
      wsServer.broadcast({ type: 'clients', count: wsServer.clients.size });
    });

    wsServer.on('message', (msg) => {
      try {
        const data = safeJsonParse(msg, null);
        if (!data) return;
        // Handle client commands
        if (data.type === 'subscribe') {
          // Clients auto-subscribe on connect — this is a no-op acknowledgement
        }
      } catch {
        // Ignore malformed messages
      }
    });
  } catch {
    // WebSocket module not available — dashboard works without it
  }

  // Public method to broadcast events (used by Oracle hooks)
  server.broadcast = function(event) {
    if (wsServer) {
      wsServer.broadcast(event);
    }
  };

  // Auto-forward Oracle events to WebSocket clients
  if (oracleInstance && oracleInstance.on) {
    oracleInstance.on((event) => {
      if (wsServer) wsServer.broadcast(event);
    });
  }

  server.wsServer = wsServer;
  server.authManager = authManager;
  server.versionManager = versionManager;

  return server;
}

function readBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    callback(safeJsonParse(body, {}));
  });
}

function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function startDashboard(oracle, options = {}) {
  const port = options.port || 3333;
  const server = createDashboardServer(oracle, options);
  server.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
    if (server.wsServer) {
      console.log(`WebSocket available at ws://localhost:${port}`);
    }
    if (server.authManager) {
      console.log(`Authentication enabled`);
    }
  });
  return server;
}

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Remembrance Oracle Dashboard</title>
<style>
:root {
  --bg: #0f1019; --bg2: rgba(22,24,38,0.75); --bg3: #2a2d42;
  --bg-glass: rgba(22,24,38,0.55); --bg-glass-hover: rgba(34,37,58,0.7);
  --fg: #d1d5f0; --fg2: #a9b1d6; --fg3: #565f89; --fg4: #3d4466;
  --accent: #7aa2f7; --accent-dim: rgba(122,162,247,0.15);
  --green: #9ece6a; --green-dim: rgba(158,206,106,0.15);
  --red: #f7768e; --red-dim: rgba(247,118,142,0.15);
  --yellow: #e0af68; --yellow-dim: rgba(224,175,104,0.15);
  --purple: #bb9af7; --purple-dim: rgba(187,154,247,0.15);
  --cyan: #7dcfff; --cyan-dim: rgba(125,207,255,0.15);
  --orange: #ff9e64;
  --radius: 12px; --radius-sm: 8px; --radius-xs: 6px;
  --shadow: 0 8px 32px rgba(0,0,0,0.4);
  --glass-border: 1px solid rgba(255,255,255,0.06);
  --transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --sidebar-w: 240px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  background: var(--bg); color: var(--fg); display: flex;
  background-image: radial-gradient(ellipse at 20% 50%, rgba(122,162,247,0.06) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 20%, rgba(187,154,247,0.04) 0%, transparent 50%);
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--fg4); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--fg3); }

/* ─── Sidebar ─── */
.sidebar {
  width: var(--sidebar-w); height: 100vh; position: fixed; left: 0; top: 0; z-index: 50;
  background: var(--bg-glass); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border-right: var(--glass-border); display: flex; flex-direction: column;
  transition: transform var(--transition); overflow: hidden;
}
.sidebar-header {
  padding: 20px 16px 12px; border-bottom: var(--glass-border);
}
.sidebar-logo {
  font-size: 0.85em; font-weight: 700; color: var(--accent); letter-spacing: -0.02em;
  display: flex; align-items: center; gap: 8px;
}
.sidebar-logo-icon {
  width: 28px; height: 28px; border-radius: var(--radius-xs);
  background: linear-gradient(135deg, var(--accent), var(--purple));
  display: flex; align-items: center; justify-content: center; font-size: 14px; color: #fff;
}
.sidebar-subtitle { font-size: 0.7em; color: var(--fg3); margin-top: 4px; }
.ws-dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-left: 6px;
  transition: background var(--transition);
}
.ws-dot.on { background: var(--green); box-shadow: 0 0 6px var(--green); }
.ws-dot.off { background: var(--red); }

.sidebar-nav { flex: 1; overflow-y: auto; padding: 8px 0; }
.nav-section { padding: 8px 16px 4px; font-size: 0.65em; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--fg4); font-weight: 600; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 16px; cursor: pointer;
  color: var(--fg3); font-size: 0.82em; font-weight: 500; transition: all var(--transition);
  border-left: 3px solid transparent; margin: 1px 0;
}
.nav-item:hover { color: var(--fg2); background: rgba(255,255,255,0.03); }
.nav-item.active {
  color: var(--accent); background: var(--accent-dim); border-left-color: var(--accent);
}
.nav-item .nav-icon { width: 18px; text-align: center; font-size: 0.95em; opacity: 0.8; }
.nav-item .nav-badge {
  margin-left: auto; font-size: 0.7em; padding: 1px 6px; border-radius: 10px;
  background: var(--accent-dim); color: var(--accent);
}

.sidebar-footer { padding: 12px 16px; border-top: var(--glass-border); font-size: 0.7em; color: var(--fg4); }

/* ─── Kbd shortcut hint ─── */
.kbd { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 0.75em;
  background: var(--bg3); color: var(--fg3); border: 1px solid var(--fg4); font-family: monospace; }

/* ─── Main ─── */
.main { margin-left: var(--sidebar-w); flex: 1; height: 100vh; overflow-y: auto; overflow-x: hidden; }
.main-inner { max-width: 1200px; margin: 0 auto; padding: 24px 32px 60px; }

/* ─── Header ─── */
.page-header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
.page-title { font-size: 1.3em; font-weight: 700; color: var(--fg); }
.page-desc { font-size: 0.82em; color: var(--fg3); margin-top: 2px; }

/* ─── Panels ─── */
.panel { display: none; animation: fadeUp 0.3s ease; }
.panel.active { display: block; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* ─── Glass Card ─── */
.glass {
  background: var(--bg-glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: var(--glass-border); border-radius: var(--radius); box-shadow: var(--shadow);
}
.glass:hover { background: var(--bg-glass-hover); }

/* ─── Stats Grid ─── */
.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card {
  padding: 16px 18px; border-radius: var(--radius); position: relative; overflow: hidden;
  background: var(--bg-glass); border: var(--glass-border); backdrop-filter: blur(12px);
  transition: transform var(--transition), box-shadow var(--transition);
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
.stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--purple));
}
.stat-label { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg3); font-weight: 600; }
.stat-value { font-size: 1.7em; font-weight: 700; color: var(--accent); margin-top: 4px; }
.stat-sub { font-size: 0.72em; color: var(--fg3); margin-top: 2px; }

/* ─── Search Bars ─── */
.search-container { position: relative; margin-bottom: 16px; }
.search-row { display: flex; gap: 8px; }
.search-input {
  flex: 1; padding: 11px 16px 11px 38px;
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius-sm);
  color: var(--fg); font-family: inherit; font-size: 0.88em; backdrop-filter: blur(12px);
  transition: border-color var(--transition), box-shadow var(--transition); outline: none;
}
.search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.search-input::placeholder { color: var(--fg4); }
.search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  color: var(--fg4); font-size: 0.85em; pointer-events: none;
}
.search-select {
  padding: 10px 14px; background: var(--bg-glass); border: var(--glass-border);
  border-radius: var(--radius-sm); color: var(--fg); font-family: inherit; font-size: 0.85em;
  cursor: pointer; backdrop-filter: blur(12px); outline: none;
}
.search-select:focus { border-color: var(--accent); }
.search-select option { background: var(--bg); }
.search-hint { font-size: 0.72em; color: var(--fg4); margin-top: 6px; display: flex; align-items: center; gap: 6px; }

/* ─── Filter Bar ─── */
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.filter-pill {
  padding: 5px 12px; border-radius: 20px; font-size: 0.78em; cursor: pointer;
  background: var(--bg3); color: var(--fg3); border: 1px solid transparent;
  transition: all var(--transition);
}
.filter-pill:hover { color: var(--fg2); background: var(--bg-glass-hover); }
.filter-pill.active { background: var(--accent-dim); color: var(--accent); border-color: rgba(122,162,247,0.3); }
.sort-btn {
  margin-left: auto; padding: 5px 12px; border-radius: 20px; font-size: 0.78em;
  cursor: pointer; background: var(--bg3); color: var(--fg3); border: none; font-family: inherit;
  transition: all var(--transition);
}
.sort-btn:hover { color: var(--fg2); }

/* ─── Code Card ─── */
.code-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius);
  margin-bottom: 10px; overflow: hidden; transition: all var(--transition);
  border-left: 3px solid var(--fg4);
}
.code-card:hover { border-left-color: var(--accent); background: var(--bg-glass-hover); }
.code-card.expanded { border-left-color: var(--accent); }
.code-card-header {
  padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px;
}
.code-card-expand { color: var(--fg4); font-size: 0.7em; transition: transform var(--transition); }
.code-card.expanded .code-card-expand { transform: rotate(90deg); }
.code-card-name { font-weight: 600; color: var(--fg); font-size: 0.9em; flex: 1; }
.code-card-lang {
  font-size: 0.72em; padding: 2px 8px; border-radius: 10px;
  background: var(--cyan-dim); color: var(--cyan); font-weight: 500;
}
.code-card-score {
  font-size: 0.78em; padding: 2px 10px; border-radius: 10px; font-weight: 600;
}
.score-high { background: var(--green-dim); color: var(--green); }
.score-mid { background: var(--yellow-dim); color: var(--yellow); }
.score-low { background: var(--red-dim); color: var(--red); }
.code-card-body { display: none; padding: 0 16px 14px; }
.code-card.expanded .code-card-body { display: block; animation: fadeUp 0.2s ease; }
.code-card-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.tag {
  display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72em;
  background: var(--purple-dim); color: var(--purple); font-weight: 500;
}
.tag-type { background: var(--yellow-dim); color: var(--yellow); }
.tag-complexity { background: var(--cyan-dim); color: var(--cyan); }

/* ─── Code Block ─── */
pre.code-block {
  background: rgba(0,0,0,0.35); padding: 14px 16px; border-radius: var(--radius-sm);
  overflow-x: auto; font-size: 0.82em; line-height: 1.55; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  max-height: 350px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.04);
}
/* Syntax highlight classes */
.kw { color: var(--purple); } /* keywords */
.str { color: var(--green); } /* strings */
.num { color: var(--orange); } /* numbers */
.cm { color: var(--fg4); font-style: italic; } /* comments */
.fn { color: var(--accent); } /* functions */
.op { color: var(--cyan); } /* operators */

/* ─── Loading Skeleton ─── */
.skeleton { position: relative; overflow: hidden; background: var(--bg3); border-radius: var(--radius-sm); }
.skeleton::after {
  content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer { to { left: 100%; } }
.skel-card { height: 60px; margin-bottom: 10px; border-radius: var(--radius); }
.skel-stat { height: 80px; border-radius: var(--radius); }

/* ─── Toast ─── */
.toast-container { position: fixed; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast-msg {
  padding: 10px 18px; border-radius: var(--radius-sm); font-size: 0.82em;
  background: var(--bg-glass); border: var(--glass-border); backdrop-filter: blur(16px);
  color: var(--fg); box-shadow: var(--shadow);
  animation: toastIn 0.3s ease, toastOut 0.3s ease 2.7s forwards;
}
@keyframes toastIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
@keyframes toastOut { to { opacity: 0; transform: translateX(30px); } }

/* ─── Empty / Info ─── */
.empty-state { text-align: center; color: var(--fg3); padding: 48px 20px; }
.empty-state .empty-icon { font-size: 2em; margin-bottom: 12px; opacity: 0.4; }
.empty-state .empty-text { font-size: 0.88em; }

/* ─── Bar Chart ─── */
.bar-row { display: flex; align-items: center; gap: 10px; margin: 5px 0; }
.bar-label { width: 120px; font-size: 0.78em; color: var(--fg2); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { flex: 1; height: 22px; background: rgba(255,255,255,0.03); border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; min-width: 2px;
  background: linear-gradient(90deg, var(--accent), var(--purple)); }
.bar-fill.green { background: linear-gradient(90deg, var(--green), var(--cyan)); }
.bar-fill.yellow { background: linear-gradient(90deg, var(--yellow), var(--orange)); }
.bar-fill.red { background: linear-gradient(90deg, var(--red), var(--orange)); }
.bar-val { width: 60px; font-size: 0.78em; color: var(--fg3); }

/* ─── Donut Chart (CSS) ─── */
.donut-wrap { display: flex; align-items: center; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
.donut {
  width: 120px; height: 120px; border-radius: 50%; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.donut-center { font-size: 1.1em; font-weight: 700; color: var(--fg); position: relative; z-index: 1; }
.donut-legend { display: flex; flex-direction: column; gap: 6px; }
.donut-legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.78em; color: var(--fg2); }
.donut-swatch { width: 10px; height: 10px; border-radius: 2px; }

/* ─── Debug Card ─── */
.debug-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius);
  padding: 14px 18px; margin-bottom: 10px; border-left: 3px solid var(--red);
}
.debug-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.debug-error { font-size: 0.85em; color: var(--red); font-weight: 600; flex: 1; word-break: break-word; }
.debug-confidence { font-size: 0.78em; padding: 2px 10px; border-radius: 10px; font-weight: 600; white-space: nowrap; }
.debug-meta { font-size: 0.75em; color: var(--fg3); margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; }
.debug-category {
  padding: 2px 8px; border-radius: 10px; font-size: 0.72em; font-weight: 500;
  background: var(--orange); color: #000; display: inline-block;
}

/* ─── Teams ─── */
.team-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius);
  padding: 16px 20px; margin-bottom: 10px; display: flex; align-items: center; gap: 16px;
  transition: all var(--transition);
}
.team-card:hover { background: var(--bg-glass-hover); }
.team-avatar {
  width: 40px; height: 40px; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent), var(--purple));
  display: flex; align-items: center; justify-content: center; font-weight: 700;
  font-size: 1em; color: #fff; flex-shrink: 0;
}
.team-info { flex: 1; }
.team-name { font-weight: 600; font-size: 0.92em; color: var(--fg); }
.team-desc { font-size: 0.78em; color: var(--fg3); margin-top: 2px; }
.team-members { font-size: 0.78em; color: var(--fg3); }
.role-badge {
  padding: 2px 8px; border-radius: 10px; font-size: 0.72em; font-weight: 600;
}
.role-admin { background: var(--red-dim); color: var(--red); }
.role-member { background: var(--green-dim); color: var(--green); }
.role-viewer { background: var(--cyan-dim); color: var(--cyan); }

/* ─── History Timeline ─── */
.timeline { position: relative; padding-left: 24px; }
.timeline::before {
  content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px;
  background: var(--fg4);
}
.timeline-item { position: relative; margin-bottom: 16px; }
.timeline-dot {
  position: absolute; left: -20px; top: 6px; width: 10px; height: 10px;
  border-radius: 50%; background: var(--accent); border: 2px solid var(--bg);
}
.timeline-card {
  background: var(--bg-glass); border: var(--glass-border); border-radius: var(--radius-sm);
  padding: 12px 16px;
}
.timeline-date { font-size: 0.72em; color: var(--fg4); margin-bottom: 4px; }
.timeline-title { font-size: 0.88em; font-weight: 600; color: var(--fg); }
.timeline-detail { font-size: 0.78em; color: var(--fg3); margin-top: 4px; }

/* ─── Vector Scatter (CSS 3D-ish) ─── */
.scatter-container {
  width: 100%; height: 400px; position: relative;
  background: rgba(0,0,0,0.2); border-radius: var(--radius); border: var(--glass-border);
  overflow: hidden; perspective: 600px;
}
.scatter-point {
  position: absolute; border-radius: 50%; cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.scatter-point:hover {
  transform: scale(1.8) !important; z-index: 10;
  box-shadow: 0 0 12px currentColor;
}
.scatter-label {
  position: absolute; font-size: 0.68em; color: var(--fg3); white-space: nowrap;
  pointer-events: none;
}
.scatter-axis { position: absolute; font-size: 0.65em; color: var(--fg4); text-transform: uppercase; letter-spacing: 0.05em; }

/* ─── Admin ─── */
.admin-section { margin-bottom: 24px; }
.admin-section-title { font-size: 0.92em; font-weight: 600; color: var(--accent); margin-bottom: 12px; }
.admin-table {
  width: 100%; border-collapse: collapse; font-size: 0.82em;
}
.admin-table th {
  text-align: left; padding: 8px 12px; color: var(--fg3); font-weight: 600;
  border-bottom: 1px solid var(--fg4); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em;
}
.admin-table td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); color: var(--fg2); }
.admin-table tr:hover td { background: rgba(255,255,255,0.02); }

.btn {
  padding: 8px 16px; border-radius: var(--radius-sm); font-family: inherit; font-size: 0.82em;
  font-weight: 600; cursor: pointer; border: none; transition: all var(--transition);
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #5b8bf5; box-shadow: 0 4px 12px rgba(122,162,247,0.3); }
.btn-ghost { background: transparent; color: var(--fg3); border: 1px solid var(--fg4); }
.btn-ghost:hover { color: var(--fg2); border-color: var(--fg3); }
.btn-sm { padding: 4px 10px; font-size: 0.75em; }

.input-field {
  padding: 8px 14px; background: var(--bg-glass); border: var(--glass-border);
  border-radius: var(--radius-xs); color: var(--fg); font-family: inherit; font-size: 0.85em;
  outline: none; transition: border-color var(--transition);
}
.input-field:focus { border-color: var(--accent); }
.input-row { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }

/* ─── Modal overlay for Ctrl+K ─── */
.cmd-palette {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 200;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: none;
  align-items: flex-start; justify-content: center; padding-top: 15vh;
}
.cmd-palette.open { display: flex; animation: fadeUp 0.15s ease; }
.cmd-palette-box {
  width: 480px; max-width: 90vw; background: var(--bg2); border: var(--glass-border);
  border-radius: var(--radius); box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden;
}
.cmd-palette-input {
  width: 100%; padding: 14px 18px; background: transparent; border: none; border-bottom: var(--glass-border);
  color: var(--fg); font-family: inherit; font-size: 0.95em; outline: none;
}
.cmd-palette-input::placeholder { color: var(--fg4); }

/* ─── Mobile ─── */
.mobile-toggle {
  display: none; position: fixed; top: 12px; left: 12px; z-index: 60;
  width: 36px; height: 36px; border-radius: var(--radius-xs);
  background: var(--bg-glass); border: var(--glass-border); backdrop-filter: blur(12px);
  color: var(--fg); font-size: 1.1em; cursor: pointer; align-items: center; justify-content: center;
}
@media (max-width: 768px) {
  .mobile-toggle { display: flex; }
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0; }
  .main-inner { padding: 16px; padding-top: 56px; }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
}

/* ─── Health Indicator ─── */
.health-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.health-good { background: var(--green); box-shadow: 0 0 6px var(--green); }
.health-warn { background: var(--yellow); box-shadow: 0 0 6px var(--yellow); }
.health-bad { background: var(--red); box-shadow: 0 0 6px var(--red); }
</style>
</head>
<body>

<!-- Mobile toggle -->
<button class="mobile-toggle" id="mobile-toggle" aria-label="Toggle sidebar">&#9776;</button>

<!-- Sidebar -->
<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">R</div>
      Remembrance Oracle
      <span class="ws-dot off" id="ws-dot" title="Disconnected"></span>
    </div>
    <div class="sidebar-subtitle">Proven code memory</div>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-section">Browse</div>
    <div class="nav-item active" data-panel="patterns">
      <span class="nav-icon">&#9638;</span> Patterns <span class="nav-badge" id="nav-pat-count">0</span>
    </div>
    <div class="nav-item" data-panel="search">
      <span class="nav-icon">&#8981;</span> Search <span class="kbd" style="margin-left:auto">&#8984;K</span>
    </div>
    <div class="nav-item" data-panel="debug">
      <span class="nav-icon">&#9888;</span> Debug Explorer
    </div>
    <div class="nav-section">Collaborate</div>
    <div class="nav-item" data-panel="teams">
      <span class="nav-icon">&#9734;</span> Teams
    </div>
    <div class="nav-item" data-panel="history">
      <span class="nav-icon">&#8634;</span> History
    </div>
    <div class="nav-section">Insights</div>
    <div class="nav-item" data-panel="vectors">
      <span class="nav-icon">&#8728;</span> Vectors
    </div>
    <div class="nav-item" data-panel="analytics">
      <span class="nav-icon">&#9636;</span> Analytics
    </div>
    <div class="nav-item" data-panel="charts">
      <span class="nav-icon">&#9650;</span> Charts
    </div>
    <div class="nav-section">System</div>
    <div class="nav-item" data-panel="admin">
      <span class="nav-icon">&#9881;</span> Admin
    </div>
  </nav>
  <div class="sidebar-footer">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span>Remembrance Oracle Toolkit v3</span>
      <button id="voice-toggle" title="Toggle Voice Mode" style="background:none;border:none;cursor:pointer;font-size:1.2em;opacity:0.4;transition:opacity 0.2s">&#128264;</button>
    </div>
  </div>
</aside>

<!-- Main content -->
<main class="main" id="main-content">
<div class="main-inner">

<!-- Toast container -->
<div class="toast-container" id="toast-container"></div>

<!-- Command palette -->
<div class="cmd-palette" id="cmd-palette">
  <div class="cmd-palette-box">
    <input class="cmd-palette-input" id="cmd-input" placeholder="Search patterns, debug fixes, vectors..." />
  </div>
</div>

<!-- ─── PATTERNS TAB ─── -->
<div id="panel-patterns" class="panel active">
  <div class="page-header">
    <div><div class="page-title">Pattern Library</div><div class="page-desc">Browse and filter all proven patterns</div></div>
  </div>
  <div class="stats-row" id="stats-grid">
    <div class="stat-card skeleton skel-stat"></div>
    <div class="stat-card skeleton skel-stat"></div>
    <div class="stat-card skeleton skel-stat"></div>
    <div class="stat-card skeleton skel-stat"></div>
  </div>
  <div class="filter-bar" id="pattern-filters">
    <span class="filter-pill active" data-filter="all">All</span>
  </div>
  <div id="patterns-list">
    <div class="skeleton skel-card"></div><div class="skeleton skel-card"></div><div class="skeleton skel-card"></div>
  </div>
</div>

<!-- ─── SEARCH TAB ─── -->
<div id="panel-search" class="panel">
  <div class="page-header">
    <div><div class="page-title">Search</div><div class="page-desc">Real-time pattern search with intent detection</div></div>
  </div>
  <div class="search-container">
    <div class="search-row">
      <span class="search-icon">&#8981;</span>
      <input class="search-input" id="search-input" placeholder="Search for code patterns..." />
      <select class="search-select" id="search-mode">
        <option value="hybrid">Hybrid</option>
        <option value="semantic">Semantic</option>
        <option value="tfidf">TF-IDF</option>
      </select>
    </div>
    <div class="search-hint">
      <span class="kbd">&#8984;K</span> Quick search &middot; Intent: <span id="search-intent" style="color:var(--cyan)">idle</span>
    </div>
  </div>
  <div id="search-results"><div class="empty-state"><div class="empty-icon">&#8981;</div><div class="empty-text">Type a query to search proven patterns</div></div></div>
</div>

<!-- ─── DEBUG TAB ─── -->
<div id="panel-debug" class="panel">
  <div class="page-header">
    <div><div class="page-title">Debug Explorer</div><div class="page-desc">Search error fixes with confidence levels</div></div>
  </div>
  <div class="stats-row" id="debug-stats">
    <div class="stat-card skeleton skel-stat"></div>
    <div class="stat-card skeleton skel-stat"></div>
    <div class="stat-card skeleton skel-stat"></div>
  </div>
  <div class="search-container">
    <div class="search-row">
      <span class="search-icon">&#9888;</span>
      <input class="search-input" id="debug-search-input" placeholder="Paste an error message to find fixes..." />
    </div>
  </div>
  <div id="debug-results"><div class="empty-state"><div class="empty-icon">&#9888;</div><div class="empty-text">Search for error messages to find proven fixes</div></div></div>
</div>

<!-- ─── TEAMS TAB ─── -->
<div id="panel-teams" class="panel">
  <div class="page-header">
    <div><div class="page-title">Teams</div><div class="page-desc">Manage organizations and collaborators</div></div>
    <button class="btn btn-primary" id="create-team-btn">+ New Team</button>
  </div>
  <div id="teams-list"><div class="empty-state"><div class="empty-icon">&#9734;</div><div class="empty-text">No teams yet</div></div></div>
  <!-- Create team form (hidden by default) -->
  <div id="create-team-form" style="display:none; margin-top: 16px;">
    <div class="glass" style="padding: 20px;">
      <div style="font-weight:600; margin-bottom:12px; color:var(--accent);">Create Team</div>
      <div class="input-row">
        <input class="input-field" id="team-name-input" placeholder="Team name" style="flex:1" />
      </div>
      <div class="input-row">
        <input class="input-field" id="team-desc-input" placeholder="Description (optional)" style="flex:1" />
      </div>
      <div class="input-row">
        <button class="btn btn-primary" id="submit-team-btn">Create</button>
        <button class="btn btn-ghost" id="cancel-team-btn">Cancel</button>
      </div>
    </div>
  </div>
</div>

<!-- ─── HISTORY TAB ─── -->
<div id="panel-history" class="panel">
  <div class="page-header">
    <div><div class="page-title">History</div><div class="page-desc">Pattern version timeline and semantic diffs</div></div>
  </div>
  <div class="search-container">
    <div class="search-row">
      <span class="search-icon">&#8634;</span>
      <input class="search-input" id="history-search" placeholder="Filter history by name or description..." />
    </div>
  </div>
  <div id="history-list">
    <div class="skeleton skel-card"></div><div class="skeleton skel-card"></div>
  </div>
</div>

<!-- ─── VECTORS TAB ─── -->
<div id="panel-vectors" class="panel">
  <div class="page-header">
    <div><div class="page-title">Vector Space</div><div class="page-desc">Explore semantic relationships between terms</div></div>
  </div>
  <div class="search-container">
    <div class="search-row">
      <span class="search-icon">&#8728;</span>
      <input class="search-input" id="vector-input" placeholder="Enter a term to find nearest vectors..." />
    </div>
  </div>
  <div id="vector-scatter" class="scatter-container" style="display:none;"></div>
  <div id="vector-results"><div class="empty-state"><div class="empty-icon">&#8728;</div><div class="empty-text">Type a term to explore the vector space</div></div></div>
</div>

<!-- ─── ANALYTICS TAB ─── -->
<div id="panel-analytics" class="panel">
  <div class="page-header">
    <div><div class="page-title">Analytics</div><div class="page-desc">Health indicators, distribution charts, and tag cloud</div></div>
  </div>
  <div id="analytics-content">
    <div class="stats-row"><div class="stat-card skeleton skel-stat"></div><div class="stat-card skeleton skel-stat"></div><div class="stat-card skeleton skel-stat"></div></div>
  </div>
</div>

<!-- ─── CHARTS TAB ─── -->
<div id="panel-charts" class="panel">
  <div class="page-header">
    <div><div class="page-title">Visual Coherence</div><div class="page-desc">Charts: coherence trend, dimension breakdown, top patterns, vote distribution</div></div>
    <button class="btn btn-ghost" id="refresh-charts-btn">Refresh</button>
  </div>
  <div class="stats-row" style="margin-bottom: 24px">
    <div class="stat-card" style="flex:1"><div class="stat-label">Avg Coherency</div><div class="stat-value" id="chart-avg-coherency">--</div></div>
    <div class="stat-card" style="flex:1"><div class="stat-label">Total Patterns</div><div class="stat-value" id="chart-total-patterns">--</div></div>
    <div class="stat-card" style="flex:1"><div class="stat-label">High Quality (&gt;0.8)</div><div class="stat-value" id="chart-high-quality">--</div></div>
    <div class="stat-card" style="flex:1"><div class="stat-label">Total Votes</div><div class="stat-value" id="chart-total-votes">--</div></div>
  </div>
  <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
    <div class="card" style="padding:20px">
      <div class="card-title" style="margin-bottom:12px">Coherence Distribution</div>
      <svg id="chart-coherence-dist" width="100%" height="200" viewBox="0 0 400 200"></svg>
    </div>
    <div class="card" style="padding:20px">
      <div class="card-title" style="margin-bottom:12px">Dimension Breakdown (avg)</div>
      <svg id="chart-dimensions" width="100%" height="200" viewBox="0 0 400 200"></svg>
    </div>
  </div>
  <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
    <div class="card" style="padding:20px">
      <div class="card-title" style="margin-bottom:12px">Top 10 Patterns by Usage</div>
      <svg id="chart-top-usage" width="100%" height="260" viewBox="0 0 400 260"></svg>
    </div>
    <div class="card" style="padding:20px">
      <div class="card-title" style="margin-bottom:12px">Language Distribution</div>
      <svg id="chart-languages" width="100%" height="260" viewBox="0 0 400 260"></svg>
    </div>
  </div>
  <div class="card" style="padding:20px">
    <div class="card-title" style="margin-bottom:12px">Coherence Sparkline (by pattern creation order)</div>
    <svg id="chart-sparkline" width="100%" height="100" viewBox="0 0 800 100"></svg>
  </div>
</div>

<!-- ─── ADMIN TAB ─── -->
<div id="panel-admin" class="panel">
  <div class="page-header">
    <div><div class="page-title">Admin</div><div class="page-desc">User management, API keys, and system settings</div></div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">Users</div>
    <div class="input-row">
      <input class="input-field" id="new-username" placeholder="Username" />
      <input class="input-field" id="new-password" placeholder="Password" type="password" />
      <select class="search-select" id="new-role">
        <option value="viewer">Viewer</option>
        <option value="contributor">Contributor</option>
        <option value="admin">Admin</option>
      </select>
      <button class="btn btn-primary btn-sm" id="create-user-btn">Add User</button>
    </div>
    <div id="users-table"></div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">API Key</div>
    <div class="input-row">
      <button class="btn btn-ghost" id="gen-api-key-btn">Generate API Key</button>
      <code id="api-key-display" style="font-size:0.82em;color:var(--cyan);padding:4px 8px;background:var(--bg3);border-radius:4px;display:none;word-break:break-all"></code>
    </div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">System Health</div>
    <div id="system-health">
      <div class="skeleton skel-card"></div>
    </div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">System Settings</div>
    <div style="font-size:0.82em; color: var(--fg3); padding: 8px 0;">
      <div class="input-row">
        <span style="width:140px">Coherency Threshold</span>
        <input class="input-field" type="number" step="0.1" min="0" max="1" value="0.6" style="width:80px" disabled />
      </div>
      <div class="input-row">
        <span style="width:140px">Community Min</span>
        <input class="input-field" type="number" step="0.1" min="0" max="1" value="0.7" style="width:80px" disabled />
      </div>
    </div>
  </div>
</div>

</div>
</main>

<script>
(function() {
  'use strict';

  // ─── Helpers ───
  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function scoreClass(s) { return s >= 0.7 ? 'score-high' : s >= 0.4 ? 'score-mid' : 'score-low'; }
  function debounce(fn, ms) { let t; return function() { clearTimeout(t); const a = arguments, c = this; t = setTimeout(() => fn.apply(c, a), ms); }; }

  // Basic syntax highlight
  function highlight(code, lang) {
    if (!code) return '';
    let s = esc(code);
    // comments
    s = s.replace(/(\/\/[^\\n]*)/g, '<span class="cm">$1</span>');
    s = s.replace(/(#[^\\n]*)/g, function(m) { return lang === 'python' ? '<span class="cm">' + m + '</span>' : m; });
    // strings
    s = s.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|\`[^\`]*?\`)/g, '<span class="str">$1</span>');
    // numbers
    s = s.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="num">$1</span>');
    // keywords
    var kwRegex = /\\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|try|catch|throw|switch|case|break|default|typeof|instanceof|in|of|def|self|lambda|yield|None|True|False|fn|impl|pub|use|mod|struct|enum|match|mut|go|func|defer|select|chan)\\b/g;
    s = s.replace(kwRegex, '<span class="kw">$1</span>');
    // function calls
    s = s.replace(/\\b([a-zA-Z_]\\w*)\\s*\\(/g, '<span class="fn">$1</span>(');
    return s;
  }

  // ─── State ───
  let allPatterns = [];
  let currentFilter = 'all';
  let sortBy = 'coherency';
  let sortAsc = false;

  // ─── Toast ───
  function showToast(msg) {
    var c = document.getElementById('toast-container');
    var t = document.createElement('div');
    t.className = 'toast-msg';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3100);
  }

  // ─── Navigation ───
  var navItems = document.querySelectorAll('.nav-item');
  var panels = document.querySelectorAll('.panel');

  function switchPanel(panelName) {
    navItems.forEach(function(n) {
      n.classList.toggle('active', n.dataset.panel === panelName);
    });
    panels.forEach(function(p) {
      p.classList.toggle('active', p.id === 'panel-' + panelName);
    });
    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
    // Lazy-load tab data
    if (panelName === 'analytics' && !window._analyticsLoaded) loadAnalytics();
    if (panelName === 'charts' && !window._chartsLoaded) loadCharts();
    if (panelName === 'history' && !window._historyLoaded) loadHistory();
    if (panelName === 'debug' && !window._debugLoaded) loadDebugStats();
    if (panelName === 'teams' && !window._teamsLoaded) loadTeams();
    if (panelName === 'admin' && !window._adminLoaded) loadAdmin();
  }

  navItems.forEach(function(item) {
    item.addEventListener('click', function() { switchPanel(this.dataset.panel); });
  });

  // Mobile toggle
  document.getElementById('mobile-toggle').addEventListener('click', function() {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // ─── Keyboard shortcuts ───
  document.addEventListener('keydown', function(e) {
    // Ctrl+K or Cmd+K => command palette / search focus
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      var cp = document.getElementById('cmd-palette');
      if (cp.classList.contains('open')) {
        cp.classList.remove('open');
      } else {
        cp.classList.add('open');
        document.getElementById('cmd-input').value = '';
        document.getElementById('cmd-input').focus();
      }
    }
    if (e.key === 'Escape') {
      document.getElementById('cmd-palette').classList.remove('open');
    }
  });

  // Command palette search redirects to Search tab
  document.getElementById('cmd-input').addEventListener('input', debounce(function() {
    var q = this.value.trim();
    if (q.length > 1) {
      switchPanel('search');
      document.getElementById('search-input').value = q;
      document.getElementById('search-input').dispatchEvent(new Event('input'));
      document.getElementById('cmd-palette').classList.remove('open');
    }
  }, 400));

  // Close palette on bg click
  document.getElementById('cmd-palette').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });

  // ─── WebSocket ───
  var ws = null;
  var wsReconnectTimer = null;

  function connectWS() {
    try {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host);
      ws.onopen = function() {
        document.getElementById('ws-dot').className = 'ws-dot on';
        document.getElementById('ws-dot').title = 'Connected';
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
      };
      ws.onmessage = function(event) {
        try { handleWSEvent(JSON.parse(event.data)); } catch(e) { console.debug('[ws] message parse error:', e.message); }
      };
      ws.onclose = function() {
        document.getElementById('ws-dot').className = 'ws-dot off';
        document.getElementById('ws-dot').title = 'Disconnected';
        ws = null;
        if (!wsReconnectTimer) wsReconnectTimer = setTimeout(connectWS, 3000);
      };
      ws.onerror = function(e) { console.debug('[ws] connection error:', e); };
    } catch(e) { console.debug('[ws] setup error:', e.message); }
  }

  function handleWSEvent(data) {
    switch(data.type) {
      case 'pattern_registered':
        showToast('New pattern: ' + (data.name || 'unknown'));
        refreshPatterns();
        break;
      case 'entry_added':
        showToast('New entry added');
        break;
      case 'pattern_evolved':
        showToast('Pattern evolved: ' + (data.name || ''));
        refreshPatterns();
        break;
      case 'feedback':
        showToast('Feedback: ' + (data.id || '').slice(0,8));
        break;
      case 'stats_update':
        refreshStats();
        break;
      case 'healing_start':
        showHealingBanner(data);
        break;
      case 'healing_progress':
        updateHealingProgress(data);
        break;
      case 'healing_complete':
        completeHealingBanner(data);
        break;
      case 'healing_failed':
        failHealingBanner(data);
        break;
      case 'auto_promote':
        showToast('Auto-promoted: ' + (data.promoted || 0) + ' candidate(s)');
        refreshPatterns();
        break;
      case 'rollback':
        showToast('Rollback: ' + (data.patternName || '') + ' reverted to v' + (data.restoredVersion || '?'));
        refreshPatterns();
        break;
      case 'security_veto':
        showToast('Security veto: ' + (data.patternName || '') + ' — ' + (data.tool || ''));
        break;
    }
  }

  // ─── Healing Banner (real-time feedback) ───
  function showHealingBanner(data) {
    var existing = document.getElementById('healing-banner');
    if (existing) existing.remove();
    var banner = document.createElement('div');
    banner.id = 'healing-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1a1a2e;color:#e0e0ff;padding:12px 20px;z-index:9999;font-family:monospace;border-bottom:2px solid #6c63ff;transition:opacity 0.5s;';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:1.2em;">&#x2728;</span>' +
      '<span>Healing <strong>' + esc(data.patternName || '') + '</strong> (' + esc(data.decision || '') + ')...</span>' +
      '<span id="healing-coherence" style="color:#6c63ff;font-weight:bold;">loop 0/' + (data.maxLoops || 3) + '</span>' +
      '<div id="healing-bar" style="flex:1;height:6px;background:#333;border-radius:3px;overflow:hidden;">' +
      '<div id="healing-bar-fill" style="width:0%;height:100%;background:linear-gradient(90deg,#6c63ff,#a78bfa);transition:width 0.3s;"></div>' +
      '</div></div>';
    document.body.prepend(banner);
  }

  function updateHealingProgress(data) {
    var label = document.getElementById('healing-coherence');
    var fill = document.getElementById('healing-bar-fill');
    if (label) label.textContent = 'loop ' + data.loop + '/' + data.maxLoops + ' | coherence: ' + (data.coherence || 0).toFixed(3) + ' | ' + (data.strategy || '');
    if (fill) fill.style.width = Math.min(100, ((data.loop / (data.maxLoops || 3)) * 100)).toFixed(0) + '%';
  }

  function completeHealingBanner(data) {
    var banner = document.getElementById('healing-banner');
    if (!banner) return;
    var imp = data.improvement || 0;
    var sign = imp >= 0 ? '+' : '';
    banner.style.borderBottomColor = '#22c55e';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:1.2em;">&#x2705;</span>' +
      '<span>Healed <strong>' + esc(data.patternName || '') + '</strong></span>' +
      '<span style="color:#22c55e;font-weight:bold;">' + (data.finalCoherence || 0).toFixed(3) + ' (' + sign + imp.toFixed(3) + ') in ' + (data.loops || 0) + ' loop(s)</span>' +
      '</div>';
    setTimeout(function() { if (banner.parentNode) { banner.style.opacity = '0'; setTimeout(function() { banner.remove(); }, 500); } }, 5000);
  }

  function failHealingBanner(data) {
    var banner = document.getElementById('healing-banner');
    if (!banner) return;
    banner.style.borderBottomColor = '#ef4444';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
      '<span style="font-size:1.2em;">&#x274C;</span>' +
      '<span>Healing failed for <strong>' + esc(data.patternName || '') + '</strong>: ' + esc(data.error || 'unknown') + '</span>' +
      '</div>';
    setTimeout(function() { if (banner.parentNode) { banner.style.opacity = '0'; setTimeout(function() { banner.remove(); }, 500); } }, 5000);
  }

  connectWS();

  // ─── Voice Mode (Web Speech API) ───
  var voiceEnabled = false;
  var voiceToggle = document.getElementById('voice-toggle');
  voiceToggle.addEventListener('click', function() {
    voiceEnabled = !voiceEnabled;
    voiceToggle.style.opacity = voiceEnabled ? '1' : '0.4';
    voiceToggle.innerHTML = voiceEnabled ? '&#128266;' : '&#128264;';
    if (voiceEnabled) speakWhisper('Voice mode activated. I will speak whispers from the healed future.');
  });

  function speakWhisper(text) {
    if (!voiceEnabled || !window.speechSynthesis || !text) return;
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 0.95;
    utterance.volume = 0.8;
    // Prefer a calm, clear voice
    var voices = window.speechSynthesis.getVoices();
    var preferred = voices.find(function(v) { return /samantha|karen|daniel|google.*uk|zira/i.test(v.name); });
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }

  // Speak healing whispers when events arrive
  var _origComplete = completeHealingBanner;
  completeHealingBanner = function(data) {
    _origComplete(data);
    if (data.whisper) speakWhisper(data.whisper);
    else if (data.patternName) speakWhisper('Healing complete for ' + data.patternName + '. Coherence: ' + (data.finalCoherence || 0).toFixed(2));
  };

  var _origFail = failHealingBanner;
  failHealingBanner = function(data) {
    _origFail(data);
    speakWhisper('Healing failed for ' + (data.patternName || 'pattern') + '. ' + (data.error || ''));
  };

  // ─── Pattern Rendering ───
  function renderPatternCard(p) {
    var score = (p.coherencyScore && p.coherencyScore.total != null ? p.coherencyScore.total : 0);
    var tags = (p.tags || []).map(function(t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    var typeTag = p.patternType ? '<span class="tag tag-type">' + esc(p.patternType) + '</span>' : '';
    var cxTag = p.complexity ? '<span class="tag tag-complexity">' + esc(p.complexity) + '</span>' : '';

    return '<div class="code-card" data-id="' + esc(p.id) + '" data-lang="' + esc(p.language || '') +
      '" data-score="' + score + '">' +
      '<div class="code-card-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
      '<span class="code-card-expand">&#9654;</span>' +
      '<span class="code-card-name">' + esc(p.name) + '</span>' +
      '<span class="code-card-lang">' + esc(p.language || 'unknown') + '</span>' +
      '<span class="code-card-score ' + scoreClass(score) + '">' + score.toFixed(3) + '</span>' +
      '</div>' +
      '<div class="code-card-body">' +
      '<div class="code-card-meta">' + typeTag + cxTag + tags + '</div>' +
      '<pre class="code-block">' + highlight(p.code, p.language) + '</pre>' +
      '</div></div>';
  }

  // ─── Patterns Tab ───
  function refreshStats() {
    fetch('/api/stats').then(function(r) { return r.json(); }).then(function(stats) {
      var ps = stats.patterns || {};
      var sg = document.getElementById('stats-grid');
      sg.innerHTML =
        '<div class="stat-card"><div class="stat-label">Patterns</div><div class="stat-value">' + (ps.totalPatterns||0) + '</div><div class="stat-sub">Proven code patterns</div></div>' +
        '<div class="stat-card"><div class="stat-label">Entries</div><div class="stat-value">' + (stats.store && stats.store.totalEntries||0) + '</div><div class="stat-sub">Store entries</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Coherency</div><div class="stat-value">' + (ps.avgCoherency||0).toFixed(3) + '</div><div class="stat-sub">Quality score</div></div>' +
        '<div class="stat-card"><div class="stat-label">Languages</div><div class="stat-value">' + Object.keys(ps.byLanguage||{}).length + '</div><div class="stat-sub">Supported</div></div>';
      document.getElementById('nav-pat-count').textContent = ps.totalPatterns || 0;
    }).catch(function() {});
  }

  function refreshPatterns() {
    fetch('/api/patterns').then(function(r) { return r.json(); }).then(function(patterns) {
      allPatterns = patterns;
      buildFilters();
      renderFilteredPatterns();
    }).catch(function() {
      document.getElementById('patterns-list').innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load patterns</div></div>';
    });
  }

  function buildFilters() {
    var langs = {};
    allPatterns.forEach(function(p) {
      var l = p.language || 'unknown';
      langs[l] = (langs[l] || 0) + 1;
    });
    var fb = document.getElementById('pattern-filters');
    var html = '<span class="filter-pill' + (currentFilter === 'all' ? ' active' : '') + '" data-filter="all">All (' + allPatterns.length + ')</span>';
    Object.keys(langs).sort().forEach(function(l) {
      html += '<span class="filter-pill' + (currentFilter === l ? ' active' : '') + '" data-filter="' + esc(l) + '">' + esc(l) + ' (' + langs[l] + ')</span>';
    });
    html += '<button class="sort-btn" id="sort-toggle">Sort: ' + (sortBy === 'coherency' ? 'Coherency' : 'Name') + ' ' + (sortAsc ? '&#9650;' : '&#9660;') + '</button>';
    fb.innerHTML = html;

    fb.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        currentFilter = this.dataset.filter;
        buildFilters();
        renderFilteredPatterns();
      });
    });
    var sortBtn = document.getElementById('sort-toggle');
    if (sortBtn) {
      sortBtn.addEventListener('click', function() {
        if (sortBy === 'coherency') { sortBy = 'name'; }
        else { sortBy = 'coherency'; sortAsc = !sortAsc; }
        buildFilters();
        renderFilteredPatterns();
      });
    }
  }

  function renderFilteredPatterns() {
    var filtered = allPatterns;
    if (currentFilter !== 'all') {
      filtered = allPatterns.filter(function(p) { return (p.language || 'unknown') === currentFilter; });
    }
    filtered = filtered.slice().sort(function(a, b) {
      if (sortBy === 'coherency') {
        var sa = (a.coherencyScore && a.coherencyScore.total != null ? a.coherencyScore.total : 0);
        var sb = (b.coherencyScore && b.coherencyScore.total != null ? b.coherencyScore.total : 0);
        return sortAsc ? sa - sb : sb - sa;
      }
      return sortAsc ? (a.name || '').localeCompare(b.name || '') : (b.name || '').localeCompare(a.name || '');
    });
    var pl = document.getElementById('patterns-list');
    if (filtered.length === 0) {
      pl.innerHTML = '<div class="empty-state"><div class="empty-icon">&#9638;</div><div class="empty-text">No patterns found. Run: oracle seed</div></div>';
    } else {
      pl.innerHTML = filtered.map(renderPatternCard).join('');
    }
  }

  // Initial load
  refreshStats();
  refreshPatterns();

  // ─── Search Tab ───
  var searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', debounce(function() {
    var q = this.value.trim();
    var intentEl = document.getElementById('search-intent');
    if (!q) {
      document.getElementById('search-results').innerHTML = '<div class="empty-state"><div class="empty-icon">&#8981;</div><div class="empty-text">Type a query to search proven patterns</div></div>';
      intentEl.textContent = 'idle';
      return;
    }
    intentEl.textContent = 'searching...';
    var mode = document.getElementById('search-mode').value;
    fetch('/api/search?q=' + encodeURIComponent(q) + '&mode=' + mode)
      .then(function(r) { return r.json(); })
      .then(function(results) {
        if (results.length === 0) {
          intentEl.textContent = 'no matches';
          document.getElementById('search-results').innerHTML = '<div class="empty-state"><div class="empty-text">No results for "' + esc(q) + '"</div></div>';
          return;
        }
        intentEl.textContent = results.length + ' match' + (results.length !== 1 ? 'es' : '');
        document.getElementById('search-results').innerHTML = results.map(function(r) {
          var score = r.matchScore || r.semanticScore || 0;
          var concepts = (r.matchedConcepts && r.matchedConcepts.length) ? '<div style="font-size:0.75em;color:var(--fg3);margin-top:4px">Concepts: ' + r.matchedConcepts.join(', ') + '</div>' : '';
          return '<div class="code-card"><div class="code-card-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
            '<span class="code-card-expand">&#9654;</span>' +
            '<span class="code-card-name">' + esc(r.name || r.description || r.id) + '</span>' +
            '<span class="code-card-lang">' + esc(r.language || '') + '</span>' +
            '<span class="code-card-score ' + scoreClass(score) + '">match: ' + score.toFixed(3) + '</span>' +
            '</div><div class="code-card-body">' + concepts +
            '<pre class="code-block">' + highlight(r.code, r.language) + '</pre>' +
            '</div></div>';
        }).join('');
      }).catch(function() { intentEl.textContent = 'error'; });
  }, 300));

  // ─── Debug Tab ───
  function loadDebugStats() {
    window._debugLoaded = true;
    fetch('/api/debug/stats').then(function(r) { return r.json(); }).then(function(s) {
      document.getElementById('debug-stats').innerHTML =
        '<div class="stat-card"><div class="stat-label">Debug Patterns</div><div class="stat-value">' + (s.totalPatterns||0) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Confidence</div><div class="stat-value">' + (s.avgConfidence||0).toFixed(3) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Resolution Rate</div><div class="stat-value">' + ((s.resolutionRate||0)*100).toFixed(0) + '%</div></div>';
    }).catch(function() {
      document.getElementById('debug-stats').innerHTML = '<div class="stat-card"><div class="stat-label">Debug Patterns</div><div class="stat-value">0</div></div>';
    });
  }

  document.getElementById('debug-search-input').addEventListener('input', debounce(function() {
    var q = this.value.trim();
    if (!q) {
      document.getElementById('debug-results').innerHTML = '<div class="empty-state"><div class="empty-icon">&#9888;</div><div class="empty-text">Search for error messages to find proven fixes</div></div>';
      return;
    }
    fetch('/api/debug/search?q=' + encodeURIComponent(q))
      .then(function(r) { return r.json(); })
      .then(function(results) {
        if (!results || results.length === 0) {
          document.getElementById('debug-results').innerHTML = '<div class="empty-state"><div class="empty-text">No debug fixes found for that error</div></div>';
          return;
        }
        document.getElementById('debug-results').innerHTML = results.map(function(d) {
          var conf = d.confidence || 0;
          return '<div class="debug-card">' +
            '<div class="debug-card-header">' +
            '<span class="debug-error">' + esc(d.errorMessage || d.error_message || '') + '</span>' +
            '<span class="debug-confidence ' + scoreClass(conf) + '">' + (conf*100).toFixed(0) + '% conf</span>' +
            '</div>' +
            '<div class="debug-meta">' +
            '<span class="debug-category">' + esc(d.errorCategory || d.error_category || '') + '</span>' +
            '<span>' + esc(d.language || '') + '</span>' +
            '<span>Applied: ' + (d.timesApplied || 0) + '</span>' +
            '<span>Resolved: ' + (d.timesResolved || 0) + '</span>' +
            (d.matchType ? '<span>Match: ' + esc(d.matchType) + '</span>' : '') +
            '</div>' +
            (d.fixCode ? '<pre class="code-block" style="margin-top:8px">' + highlight(d.fixCode || d.fix_code || '', d.language) + '</pre>' : '') +
            (d.fixDescription || d.fix_description ? '<div style="font-size:0.78em;color:var(--fg3);margin-top:6px">' + esc(d.fixDescription || d.fix_description) + '</div>' : '') +
            '</div>';
        }).join('');
      }).catch(function() {
        document.getElementById('debug-results').innerHTML = '<div class="empty-state"><div class="empty-text">Error searching debug patterns</div></div>';
      });
  }, 300));

  // ─── Teams Tab ───
  function loadTeams() {
    window._teamsLoaded = true;
    fetch('/api/teams').then(function(r) { return r.json(); }).then(function(teams) {
      if (!teams || teams.length === 0) {
        document.getElementById('teams-list').innerHTML = '<div class="empty-state"><div class="empty-icon">&#9734;</div><div class="empty-text">No teams yet. Create one to get started.</div></div>';
        return;
      }
      document.getElementById('teams-list').innerHTML = teams.map(function(t) {
        var initial = (t.name || '?')[0].toUpperCase();
        return '<div class="team-card">' +
          '<div class="team-avatar">' + esc(initial) + '</div>' +
          '<div class="team-info">' +
          '<div class="team-name">' + esc(t.name) + '</div>' +
          '<div class="team-desc">' + esc(t.description || '') + '</div>' +
          '</div>' +
          '<div class="team-members">' + (t.memberCount || 0) + ' members</div>' +
          '</div>';
      }).join('');
    }).catch(function() {
      document.getElementById('teams-list').innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load teams</div></div>';
    });
  }

  document.getElementById('create-team-btn').addEventListener('click', function() {
    var f = document.getElementById('create-team-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('cancel-team-btn').addEventListener('click', function() {
    document.getElementById('create-team-form').style.display = 'none';
  });
  document.getElementById('submit-team-btn').addEventListener('click', function() {
    var name = document.getElementById('team-name-input').value.trim();
    if (!name) return;
    fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, description: document.getElementById('team-desc-input').value.trim() })
    }).then(function(r) { return r.json(); }).then(function(team) {
      showToast('Team created: ' + team.name);
      document.getElementById('create-team-form').style.display = 'none';
      document.getElementById('team-name-input').value = '';
      document.getElementById('team-desc-input').value = '';
      window._teamsLoaded = false;
      loadTeams();
    }).catch(function() { showToast('Failed to create team'); });
  });

  // ─── History Tab ───
  function loadHistory() {
    window._historyLoaded = true;
    fetch('/api/entries').then(function(r) { return r.json(); }).then(function(entries) {
      if (!entries || entries.length === 0) {
        document.getElementById('history-list').innerHTML = '<div class="empty-state"><div class="empty-icon">&#8634;</div><div class="empty-text">No entries in history</div></div>';
        return;
      }
      var html = '<div class="timeline">';
      entries.forEach(function(e) {
        var score = (e.coherencyScore && e.coherencyScore.total != null ? e.coherencyScore.total : 0);
        var date = e.timestamp || e.created_at || '';
        html += '<div class="timeline-item">' +
          '<div class="timeline-dot"></div>' +
          '<div class="timeline-card">' +
          '<div class="timeline-date">' + esc(date) + '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div class="timeline-title">' + esc(e.description || e.id) + '</div>' +
          '<span class="code-card-score ' + scoreClass(score) + '" style="font-size:0.75em">' + score.toFixed(3) + '</span>' +
          '</div>' +
          '<div class="timeline-detail"><span class="code-card-lang" style="font-size:0.7em">' + esc(e.language || '') + '</span>' +
          (e.tags && e.tags.length ? ' &middot; ' + e.tags.map(function(t) { return '<span class="tag" style="font-size:0.68em">' + esc(t) + '</span>'; }).join('') : '') +
          '</div>' +
          '</div></div>';
      });
      html += '</div>';
      document.getElementById('history-list').innerHTML = html;
    }).catch(function() {
      document.getElementById('history-list').innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load history</div></div>';
    });
  }

  // History filter
  document.getElementById('history-search').addEventListener('input', debounce(function() {
    var q = this.value.trim().toLowerCase();
    document.querySelectorAll('#history-list .timeline-item').forEach(function(item) {
      var text = item.textContent.toLowerCase();
      item.style.display = !q || text.includes(q) ? '' : 'none';
    });
  }, 200));

  // ─── Vectors Tab ───
  var vectorColors = ['#7aa2f7','#bb9af7','#7dcfff','#9ece6a','#e0af68','#f7768e','#ff9e64','#73daca','#b4f9f8','#c0caf5'];

  document.getElementById('vector-input').addEventListener('input', debounce(function() {
    var q = this.value.trim();
    if (!q) {
      document.getElementById('vector-scatter').style.display = 'none';
      document.getElementById('vector-results').innerHTML = '<div class="empty-state"><div class="empty-icon">&#8728;</div><div class="empty-text">Type a term to explore the vector space</div></div>';
      return;
    }
    fetch('/api/nearest?q=' + encodeURIComponent(q))
      .then(function(r) { return r.json(); })
      .then(function(terms) {
        if (!terms || terms.length === 0) {
          document.getElementById('vector-scatter').style.display = 'none';
          document.getElementById('vector-results').innerHTML = '<div class="empty-state"><div class="empty-text">No matching terms in vector space</div></div>';
          return;
        }
        // Bar chart
        var maxSim = terms[0].similarity || 1;
        var html = terms.map(function(t, i) {
          var pct = (t.similarity / maxSim * 100).toFixed(1);
          return '<div class="bar-row"><span class="bar-label">' + esc(t.term) +
            '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + vectorColors[i % vectorColors.length] + '"></div></div>' +
            '<span class="bar-val">' + t.similarity.toFixed(3) + '</span></div>';
        }).join('');
        document.getElementById('vector-results').innerHTML = html;

        // 3D scatter
        var scatter = document.getElementById('vector-scatter');
        scatter.style.display = 'block';
        var sw = scatter.offsetWidth;
        var sh = scatter.offsetHeight;
        var scatterHTML = '<div class="scatter-axis" style="bottom:8px;left:50%;transform:translateX(-50%)">Similarity</div>' +
          '<div class="scatter-axis" style="left:8px;top:50%;transform:translateY(-50%) rotate(-90deg)">Distribution</div>';

        terms.forEach(function(t, i) {
          var x = 40 + (t.similarity / maxSim) * (sw - 100);
          // Pseudo-random y based on term hash
          var hash = 0;
          for (var c = 0; c < t.term.length; c++) hash = ((hash << 5) - hash) + t.term.charCodeAt(c);
          var y = 30 + Math.abs(hash % (sh - 80));
          var size = 6 + (t.similarity / maxSim) * 12;
          var depth = 0.5 + (t.similarity / maxSim) * 0.5;
          var color = vectorColors[i % vectorColors.length];
          scatterHTML += '<div class="scatter-point" style="left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;' +
            'background:' + color + ';opacity:' + depth + ';transform:scale(' + depth + ');" title="' + esc(t.term) + ': ' + t.similarity.toFixed(3) + '"></div>';
          scatterHTML += '<div class="scatter-label" style="left:' + (x + size + 4) + 'px;top:' + (y - 2) + 'px;opacity:' + (depth * 0.8) + '">' + esc(t.term) + '</div>';
        });
        scatter.innerHTML = scatterHTML;
      }).catch(function() {
        document.getElementById('vector-scatter').style.display = 'none';
        document.getElementById('vector-results').innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load vectors</div></div>';
      });
  }, 300));

  // ─── Analytics Tab ───
  function loadAnalytics() {
    window._analyticsLoaded = true;
    fetch('/api/analytics').then(function(r) { return r.json(); }).then(function(data) {
      var ov = data.overview || {};
      var dist = data.coherencyDistribution || {};
      var health = data.healthReport || {};
      var langs = data.languageBreakdown || {};
      var tags = data.tagCloud || [];
      var top = data.topPatterns || [];

      var html = '';

      // Stats
      html += '<div class="stats-row">';
      html += '<div class="stat-card"><div class="stat-label">Total Patterns</div><div class="stat-value">' + (ov.totalPatterns||0) + '</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Avg Coherency</div><div class="stat-value">' + (ov.avgCoherency||0).toFixed(3) + '</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Quality Ratio</div><div class="stat-value">' + (ov.qualityRatio||0) + '%</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Languages</div><div class="stat-value">' + (ov.languages||0) + '</div></div>';
      html += '</div>';

      // Health indicators
      html += '<div style="display:flex;gap:24px;margin:16px 0;flex-wrap:wrap">';
      html += '<div style="display:flex;align-items:center;gap:8px"><span class="health-dot health-good"></span><span style="font-size:0.85em">Healthy: ' + (health.healthy||0) + '</span></div>';
      html += '<div style="display:flex;align-items:center;gap:8px"><span class="health-dot health-warn"></span><span style="font-size:0.85em">Warning: ' + (health.warning||0) + '</span></div>';
      html += '<div style="display:flex;align-items:center;gap:8px"><span class="health-dot health-bad"></span><span style="font-size:0.85em">Critical: ' + (health.critical||0) + '</span></div>';
      html += '</div>';

      // Coherency distribution bars
      html += '<div class="admin-section-title" style="margin-top:20px">Coherency Distribution</div>';
      var distKeys = Object.keys(dist);
      var maxBucket = Math.max.apply(null, distKeys.map(function(k) { return dist[k]; }).concat([1]));
      distKeys.forEach(function(range) {
        var pct = (dist[range] / maxBucket * 100).toFixed(1);
        html += '<div class="bar-row"><span class="bar-label">' + esc(range) + '</span>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="bar-val">' + dist[range] + '</span></div>';
      });

      // Language donut
      var langKeys = Object.keys(langs);
      if (langKeys.length > 0) {
        html += '<div class="admin-section-title" style="margin-top:20px">Languages</div>';
        var total = langKeys.reduce(function(s, k) { return s + langs[k].count; }, 0) || 1;
        // CSS conic gradient donut
        var gradParts = [];
        var angle = 0;
        var legendItems = [];
        langKeys.forEach(function(l, i) {
          var pct = langs[l].count / total * 100;
          var color = vectorColors[i % vectorColors.length];
          gradParts.push(color + ' ' + angle.toFixed(1) + '% ' + (angle + pct).toFixed(1) + '%');
          legendItems.push('<div class="donut-legend-item"><span class="donut-swatch" style="background:' + color + '"></span>' + esc(l) + ': ' + langs[l].count + ' (' + langs[l].avgCoherency.toFixed(3) + ')</div>');
          angle += pct;
        });
        html += '<div class="donut-wrap">';
        html += '<div class="donut" style="background:conic-gradient(' + gradParts.join(',') + ');"><div style="width:60px;height:60px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center"><span class="donut-center">' + langKeys.length + '</span></div></div>';
        html += '<div class="donut-legend">' + legendItems.join('') + '</div>';
        html += '</div>';
      }

      // Tag cloud
      if (tags.length > 0) {
        html += '<div class="admin-section-title" style="margin-top:20px">Tag Cloud</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;padding:12px 0">';
        var maxTag = tags[0].count || 1;
        tags.forEach(function(t) {
          var size = 0.72 + (t.count / maxTag) * 0.9;
          html += '<span class="tag" style="font-size:' + size.toFixed(2) + 'em;padding:3px 10px">' + esc(t.tag) + ' (' + t.count + ')</span>';
        });
        html += '</div>';
      }

      // Top patterns
      if (top.length > 0) {
        html += '<div class="admin-section-title" style="margin-top:20px">Top Patterns</div>';
        top.forEach(function(p) {
          html += '<div class="code-card" style="border-left-color:var(--green)"><div class="code-card-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
            '<span class="code-card-expand">&#9654;</span>' +
            '<span class="code-card-name">' + esc(p.name) + '</span>' +
            '<span class="code-card-lang">' + esc(p.language || '') + '</span>' +
            '<span class="code-card-score ' + scoreClass(p.coherency) + '">' + p.coherency.toFixed(3) + '</span>' +
            '</div></div>';
        });
      }

      document.getElementById('analytics-content').innerHTML = html;
    }).catch(function(err) {
      document.getElementById('analytics-content').innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load analytics</div></div>';
    });
  }

  // ─── Charts Tab (Visual Coherence) ───
  function loadCharts() {
    window._chartsLoaded = true;
    fetch('/api/analytics').then(function(r) { return r.json(); }).then(function(data) {
      var patterns = [];
      try {
        // Also fetch full pattern list for detailed charting
        fetch('/api/patterns').then(function(r2) { return r2.json(); }).then(function(pats) {
          patterns = pats || [];
          renderAllCharts(data, patterns);
        });
      } catch(e) { console.debug('[charts] pattern fetch failed:', e.message); renderAllCharts(data, []); }
    });
  }

  function renderAllCharts(analytics, patterns) {
    var ov = analytics.overview || {};
    var dist = analytics.coherencyDistribution || {};
    var langs = analytics.languageBreakdown || {};

    // Summary cards
    document.getElementById('chart-avg-coherency').textContent = (ov.avgCoherency || 0).toFixed(3);
    document.getElementById('chart-total-patterns').textContent = ov.totalPatterns || 0;
    document.getElementById('chart-high-quality').textContent = (ov.qualityRatio || 0) + '%';
    var totalVotes = patterns.reduce(function(sum, p) { return sum + (p.upvotes || 0) + (p.downvotes || 0); }, 0);
    document.getElementById('chart-total-votes').textContent = totalVotes;

    // 1. Coherence Distribution Bar Chart
    renderBarChart('chart-coherence-dist', dist, 'var(--accent)');

    // 2. Dimension Breakdown
    renderDimensionChart('chart-dimensions', patterns);

    // 3. Top 10 by Usage
    renderUsageChart('chart-top-usage', patterns);

    // 4. Language Distribution
    renderLanguageChart('chart-languages', langs);

    // 5. Sparkline
    renderSparkline('chart-sparkline', patterns);
  }

  function renderBarChart(svgId, dist, color) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var keys = Object.keys(dist);
    if (keys.length === 0) { svg.innerHTML = '<text x="200" y="100" fill="var(--fg3)" text-anchor="middle" font-size="14">No data</text>'; return; }
    var maxVal = Math.max.apply(null, keys.map(function(k) { return dist[k]; }).concat([1]));
    var barW = Math.floor(360 / keys.length) - 4;
    var html = '';
    keys.forEach(function(k, i) {
      var h = Math.max(2, (dist[k] / maxVal) * 160);
      var x = 30 + i * (barW + 4);
      var y = 180 - h;
      html += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="' + color + '" rx="3" opacity="0.85"/>';
      html += '<text x="' + (x + barW/2) + '" y="195" fill="var(--fg3)" text-anchor="middle" font-size="9">' + k + '</text>';
      html += '<text x="' + (x + barW/2) + '" y="' + (y - 4) + '" fill="var(--fg2)" text-anchor="middle" font-size="10">' + dist[k] + '</text>';
    });
    svg.innerHTML = html;
  }

  function renderDimensionChart(svgId, patterns) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var dims = { correctness: 0, simplicity: 0, unity: 0, reliability: 0, economy: 0 };
    var count = 0;
    patterns.forEach(function(p) {
      var cs = p.coherencyScore;
      if (cs && typeof cs === 'object') {
        Object.keys(dims).forEach(function(d) { if (cs[d] != null) dims[d] += cs[d]; });
        count++;
      }
    });
    if (count === 0) { svg.innerHTML = '<text x="200" y="100" fill="var(--fg3)" text-anchor="middle" font-size="14">No dimension data</text>'; return; }
    var dimKeys = Object.keys(dims);
    var barW = Math.floor(360 / dimKeys.length) - 8;
    var colors = ['var(--green)', 'var(--accent)', 'var(--purple)', 'var(--yellow)', 'var(--cyan)'];
    var html = '';
    dimKeys.forEach(function(d, i) {
      var avg = dims[d] / count;
      var h = avg * 160;
      var x = 30 + i * (barW + 8);
      var y = 180 - h;
      html += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" fill="' + colors[i] + '" rx="4" opacity="0.8"/>';
      html += '<text x="' + (x + barW/2) + '" y="195" fill="var(--fg3)" text-anchor="middle" font-size="9">' + d.slice(0,4) + '</text>';
      html += '<text x="' + (x + barW/2) + '" y="' + (y - 4) + '" fill="var(--fg2)" text-anchor="middle" font-size="10">' + avg.toFixed(2) + '</text>';
    });
    svg.innerHTML = html;
  }

  function renderUsageChart(svgId, patterns) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var sorted = patterns.slice().sort(function(a, b) { return (b.usageCount || 0) - (a.usageCount || 0); }).slice(0, 10);
    if (sorted.length === 0) { svg.innerHTML = '<text x="200" y="130" fill="var(--fg3)" text-anchor="middle" font-size="14">No usage data</text>'; return; }
    var maxUsage = Math.max.apply(null, sorted.map(function(p) { return p.usageCount || 0; }).concat([1]));
    var html = '';
    sorted.forEach(function(p, i) {
      var w = Math.max(2, ((p.usageCount || 0) / maxUsage) * 260);
      var y = 10 + i * 24;
      html += '<rect x="130" y="' + y + '" width="' + w + '" height="18" fill="var(--green)" rx="3" opacity="0.75"/>';
      var name = (p.name || '').length > 15 ? (p.name || '').slice(0, 15) + '..' : (p.name || '');
      html += '<text x="125" y="' + (y + 13) + '" fill="var(--fg2)" text-anchor="end" font-size="10">' + name + '</text>';
      html += '<text x="' + (135 + w) + '" y="' + (y + 13) + '" fill="var(--fg3)" font-size="10">' + (p.usageCount || 0) + '</text>';
    });
    svg.innerHTML = html;
  }

  function renderLanguageChart(svgId, langs) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var keys = Object.keys(langs);
    if (keys.length === 0) { svg.innerHTML = '<text x="200" y="130" fill="var(--fg3)" text-anchor="middle" font-size="14">No language data</text>'; return; }
    var total = keys.reduce(function(s, k) { return s + langs[k]; }, 0);
    var colors = ['var(--accent)', 'var(--green)', 'var(--purple)', 'var(--yellow)', 'var(--cyan)', 'var(--red)', 'var(--orange)'];
    var html = '';
    var cx = 130, cy = 130, r = 100;
    var startAngle = 0;
    keys.forEach(function(lang, i) {
      var pct = langs[lang] / total;
      var angle = pct * Math.PI * 2;
      var endAngle = startAngle + angle;
      var x1 = cx + r * Math.cos(startAngle);
      var y1 = cy + r * Math.sin(startAngle);
      var x2 = cx + r * Math.cos(endAngle);
      var y2 = cy + r * Math.sin(endAngle);
      var largeArc = angle > Math.PI ? 1 : 0;
      html += '<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + colors[i % colors.length] + '" opacity="0.85"/>';
      // Legend
      html += '<rect x="260" y="' + (20 + i * 22) + '" width="14" height="14" fill="' + colors[i % colors.length] + '" rx="3"/>';
      html += '<text x="280" y="' + (32 + i * 22) + '" fill="var(--fg2)" font-size="11">' + lang + ' (' + langs[lang] + ')</text>';
      startAngle = endAngle;
    });
    svg.innerHTML = html;
  }

  function renderSparkline(svgId, patterns) {
    var svg = document.getElementById(svgId);
    if (!svg) return;
    var scores = patterns.map(function(p) { return p.coherencyScore && p.coherencyScore.total != null ? p.coherencyScore.total : 0; });
    if (scores.length === 0) { svg.innerHTML = '<text x="400" y="50" fill="var(--fg3)" text-anchor="middle" font-size="14">No sparkline data</text>'; return; }
    var step = 790 / Math.max(scores.length - 1, 1);
    var points = scores.map(function(s, i) { return (5 + i * step).toFixed(1) + ',' + (90 - s * 80).toFixed(1); });
    var html = '<polyline points="' + points.join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.7"/>';
    // Average line
    var avg = scores.reduce(function(s, v) { return s + v; }, 0) / scores.length;
    var avgY = (90 - avg * 80).toFixed(1);
    html += '<line x1="5" y1="' + avgY + '" x2="795" y2="' + avgY + '" stroke="var(--green)" stroke-width="1" stroke-dasharray="4,3" opacity="0.6"/>';
    html += '<text x="798" y="' + (parseFloat(avgY) + 4) + '" fill="var(--green)" font-size="9" text-anchor="end">avg ' + avg.toFixed(2) + '</text>';
    svg.innerHTML = html;
  }

  document.getElementById('refresh-charts-btn').addEventListener('click', function() {
    window._chartsLoaded = false;
    loadCharts();
  });

  // ─── Admin Tab ───
  function loadAdmin() {
    window._adminLoaded = true;
    // Load users
    fetch('/api/users').then(function(r) { return r.json(); }).then(function(users) {
      if (!users || !Array.isArray(users) || users.length === 0) {
        document.getElementById('users-table').innerHTML = '<div style="font-size:0.82em;color:var(--fg3);padding:8px 0">No users configured (auth may be disabled)</div>';
        return;
      }
      var html = '<table class="admin-table"><thead><tr><th>Username</th><th>Role</th><th>Created</th></tr></thead><tbody>';
      users.forEach(function(u) {
        html += '<tr><td>' + esc(u.username) + '</td><td><span class="role-badge role-' + (u.role||'viewer') + '">' + esc(u.role) + '</span></td><td>' + esc(u.created_at || '') + '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('users-table').innerHTML = html;
    }).catch(function() {
      document.getElementById('users-table').innerHTML = '<div style="font-size:0.82em;color:var(--fg3);padding:8px 0">Auth disabled or not available</div>';
    });

    // Load health
    fetch('/api/health').then(function(r) { return r.json(); }).then(function(h) {
      document.getElementById('system-health').innerHTML =
        '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
        '<div class="stat-card" style="flex:1;min-width:150px"><div class="stat-label">Status</div><div class="stat-value" style="color:var(--green)">' + esc(h.status || 'unknown') + '</div></div>' +
        '<div class="stat-card" style="flex:1;min-width:150px"><div class="stat-label">WS Clients</div><div class="stat-value">' + (h.wsClients||0) + '</div></div>' +
        '</div>';
    }).catch(function() {});
  }

  // Create user button
  document.getElementById('create-user-btn').addEventListener('click', function() {
    var username = document.getElementById('new-username').value.trim();
    var password = document.getElementById('new-password').value;
    var role = document.getElementById('new-role').value;
    if (!username || !password) { showToast('Username and password required'); return; }
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password, role: role })
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (result.error) { showToast('Error: ' + result.error); return; }
      showToast('User created: ' + result.username);
      document.getElementById('new-username').value = '';
      document.getElementById('new-password').value = '';
      window._adminLoaded = false;
      loadAdmin();
    }).catch(function() { showToast('Failed to create user'); });
  });

  // API key generation
  document.getElementById('gen-api-key-btn').addEventListener('click', function() {
    var key = 'rok_' + Array.from(crypto.getRandomValues(new Uint8Array(24)), function(b) { return b.toString(16).padStart(2,'0'); }).join('');
    var display = document.getElementById('api-key-display');
    display.textContent = key;
    display.style.display = 'inline';
    showToast('API key generated (local only)');
  });

})();
</script>
</body>
</html>`;
}

module.exports = { createDashboardServer, startDashboard, getDashboardHTML, createRateLimiter };
