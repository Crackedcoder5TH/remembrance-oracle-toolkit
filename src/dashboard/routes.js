'use strict';

/**
 * Dashboard API route handlers — all /api/* endpoints.
 * Extracted from server.js for clarity (~500 lines → focused module).
 */

const { safeJsonParse } = require('../core/covenant');

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function sendJSON(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req, callback) {
  let body = '';
  let aborted = false;
  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) {
      aborted = true;
      req.destroy();
      callback({ _error: 'Request body too large', _status: 413 });
    }
  });
  req.on('end', () => {
    if (!aborted) callback(safeJsonParse(body, {}));
  });
}

function safeReadBody(req, res, handler) {
  readBody(req, (body) => {
    if (body && body._error) {
      sendJSON(res, { error: body._error }, body._status || 400);
      return;
    }
    try {
      handler(body);
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
  });
}

function createRouteHandler(oracleInstance, { authManager, versionManager, wsServer, getDashboardHTML }) {
  return function handleRequest(req, res, parsed, pathname) {
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
        safeReadBody(req, res, (body) => {
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
        safeReadBody(req, res, (body) => {
          const user = authManager.createUser(body.username, body.password, body.role);
          sendJSON(res, user);
        });
        return;
      }

      // ─── Stats ───
      if (pathname === '/api/stats') {
        sendJSON(res, { store: oracleInstance.stats(), patterns: oracleInstance.patternStats() });
        return;
      }

      // ─── Patterns ───
      if (pathname === '/api/patterns') {
        sendJSON(res, oracleInstance.patterns.getAll());
        return;
      }

      // ─── Search ───
      if (pathname === '/api/search') {
        const query = parsed.query.q || '';
        const mode = parsed.query.mode || 'hybrid';
        const limit = parseInt(parsed.query.limit) || 10;
        if (!query) { sendJSON(res, []); return; }
        sendJSON(res, oracleInstance.search(query, { mode, limit }));
        return;
      }

      // ─── Nearest vectors ───
      if (pathname === '/api/nearest') {
        const query = parsed.query.q || '';
        if (!query) { sendJSON(res, []); return; }
        try {
          const { nearestTerms } = require('../search/vectors');
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
        sendJSON(res, sqliteStore.getAuditLog({ limit: parseInt(parsed.query.limit) || 50 }));
        return;
      }

      // ─── Entries ───
      if (pathname === '/api/entries') {
        sendJSON(res, oracleInstance.store.getAll());
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
          const { generateAnalytics, computeTagCloud } = require('../analytics/analytics');
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
        safeReadBody(req, res, (body) => {
          sendJSON(res, oracleInstance.vote(body.patternId, body.voter || 'dashboard', body.vote || 1));
        });
        return;
      }

      if (pathname === '/api/top-voted') {
        sendJSON(res, oracleInstance.topVoted(parseInt(parsed.query.limit) || 20));
        return;
      }

      // ─── Reflection loop ───
      if (pathname === '/api/reflect' && req.method === 'POST') {
        safeReadBody(req, res, (body) => {
          const { reflectionLoop } = require('../core/reflection');
          sendJSON(res, reflectionLoop(body.code || '', {
            language: body.language,
            maxLoops: body.maxLoops || 3,
            targetCoherence: body.targetCoherence || 0.9,
            description: body.description || '',
            tags: body.tags || [],
          }));
        });
        return;
      }

      // ─── Covenant check ───
      if (pathname === '/api/covenant') {
        if (req.method === 'POST') {
          safeReadBody(req, res, (body) => {
            const { covenantCheck } = require('../core/covenant');
            sendJSON(res, covenantCheck(body.code || '', {
              description: body.description || '',
              tags: body.tags || [],
              language: body.language,
            }));
          });
          return;
        }
        const { getCovenant } = require('../core/covenant');
        sendJSON(res, getCovenant());
        return;
      }

      // ─── Debug search ───
      if (pathname === '/api/debug/search') {
        const query = parsed.query.q || '';
        if (!query) { sendJSON(res, []); return; }
        try {
          const { DebugOracle } = require('../debug/debug-oracle');
          const sqliteStore = oracleInstance.store.getSQLiteStore();
          if (!sqliteStore) { sendJSON(res, []); return; }
          const debugOracle = new DebugOracle(sqliteStore);
          sendJSON(res, debugOracle.search({ errorMessage: query, limit: parseInt(parsed.query.limit) || 10 }));
        } catch {
          sendJSON(res, []);
        }
        return;
      }

      // ─── Debug stats ───
      if (pathname === '/api/debug/stats') {
        try {
          const { DebugOracle } = require('../debug/debug-oracle');
          const sqliteStore = oracleInstance.store.getSQLiteStore();
          if (!sqliteStore) { sendJSON(res, { totalPatterns: 0 }); return; }
          sendJSON(res, new DebugOracle(sqliteStore).stats());
        } catch {
          sendJSON(res, { totalPatterns: 0, avgConfidence: 0, byCategory: {}, byLanguage: {} });
        }
        return;
      }

      // ─── Teams ───
      if (pathname === '/api/teams' && req.method === 'GET') {
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, []); return; }
        try {
          sqliteStore.db.exec(`
            CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', created_by TEXT DEFAULT '', created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS team_members (team_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member', joined_at TEXT NOT NULL, PRIMARY KEY (team_id, user_id));
            CREATE TABLE IF NOT EXISTS team_invites (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, role TEXT DEFAULT 'member', uses_remaining INTEGER DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT);
          `);
          const teams = sqliteStore.db.prepare('SELECT * FROM teams ORDER BY created_at DESC').all();
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
        safeReadBody(req, res, (body) => {
          sqliteStore.db.exec(`
            CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', created_by TEXT DEFAULT '', created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS team_members (team_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member', joined_at TEXT NOT NULL, PRIMARY KEY (team_id, user_id));
          `);
          const crypto = require('crypto');
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const name = body.name || 'Unnamed Team';
          const description = body.description || '';
          const createdBy = req.user?.id || 'anonymous';
          sqliteStore.db.prepare('INSERT INTO teams (id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, description, createdBy, now);
          sqliteStore.db.prepare('INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(id, createdBy, 'admin', now);
          sendJSON(res, { id, name, description, created_by: createdBy, created_at: now, memberCount: 1 });
        });
        return;
      }

      // ─── Team members ───
      const teamMembersMatch = pathname.match(/^\/api\/teams\/([^/]+)\/members$/);
      if (teamMembersMatch && req.method === 'POST') {
        const teamId = teamMembersMatch[1];
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, { error: 'Storage not available' }, 501); return; }
        safeReadBody(req, res, (body) => {
          const now = new Date().toISOString();
          sqliteStore.db.prepare('INSERT OR REPLACE INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(teamId, body.userId || body.user_id || '', body.role || 'member', now);
          sendJSON(res, { team_id: teamId, user_id: body.userId || body.user_id || '', role: body.role || 'member', joined_at: now });
        });
        return;
      }

      // ─── Team invites ───
      const teamInviteMatch = pathname.match(/^\/api\/teams\/([^/]+)\/invite$/);
      if (teamInviteMatch && req.method === 'POST') {
        const teamId = teamInviteMatch[1];
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, { error: 'Storage not available' }, 501); return; }
        safeReadBody(req, res, (body) => {
          sqliteStore.db.exec(`CREATE TABLE IF NOT EXISTS team_invites (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, role TEXT DEFAULT 'member', uses_remaining INTEGER DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT);`);
          const crypto = require('crypto');
          const id = crypto.randomUUID();
          const code = crypto.randomBytes(16).toString('hex');
          const now = new Date().toISOString();
          const role = body.role || 'member';
          const usesRemaining = body.uses || 1;
          const expiresAt = body.expiresAt || null;
          sqliteStore.db.prepare('INSERT INTO team_invites (id, team_id, code, role, uses_remaining, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, teamId, code, role, usesRemaining, now, expiresAt);
          sendJSON(res, { id, team_id: teamId, code, role, uses_remaining: usesRemaining, created_at: now, expires_at: expiresAt });
        });
        return;
      }

      // ─── Insights ───
      if (pathname === '/api/insights') {
        try {
          const { generateInsights } = require('../analytics/insights');
          sendJSON(res, generateInsights(oracleInstance, parsed.query));
        } catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }

      if (pathname === '/api/insights/act' && req.method === 'POST') {
        try {
          const { actOnInsights } = require('../analytics/actionable-insights');
          sendJSON(res, actOnInsights(oracleInstance));
        } catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }

      if (pathname === '/api/insights/boosts') {
        try {
          const { computeUsageBoosts } = require('../analytics/actionable-insights');
          const boosts = computeUsageBoosts(oracleInstance);
          sendJSON(res, Array.from(boosts.entries()).map(([id, boost]) => ({ id, boost })));
        } catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }

      // ─── Lifecycle ───
      if (pathname === '/api/lifecycle') { sendJSON(res, oracleInstance.lifecycleStatus()); return; }
      if (pathname === '/api/lifecycle/start' && req.method === 'POST') {
        safeReadBody(req, res, (body) => { sendJSON(res, oracleInstance.startLifecycle(body || {})); });
        return;
      }
      if (pathname === '/api/lifecycle/stop' && req.method === 'POST') { sendJSON(res, oracleInstance.stopLifecycle()); return; }
      if (pathname === '/api/lifecycle/run' && req.method === 'POST') { sendJSON(res, oracleInstance.getLifecycle().runCycle()); return; }
      if (pathname === '/api/lifecycle/history') { sendJSON(res, oracleInstance.getLifecycle().getHistory()); return; }

      // ─── Debug grow/patterns ───
      if (pathname === '/api/debug/grow' && req.method === 'POST') {
        try { sendJSON(res, oracleInstance.debugGrow(parsed.query || {})); }
        catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }
      if (pathname === '/api/debug/patterns') {
        try { sendJSON(res, oracleInstance.debugPatterns(parsed.query || {})); }
        catch { sendJSON(res, []); }
        return;
      }

      // ─── Smart search ───
      if (pathname === '/api/smart-search') {
        const query = parsed.query.q || '';
        if (!query) { sendJSON(res, { results: [], intent: {}, suggestions: [] }); return; }
        try {
          const { smartSearch } = require('../core/search-intelligence');
          sendJSON(res, smartSearch(oracleInstance, query, {
            limit: parseInt(parsed.query.limit) || 10,
            language: parsed.query.language,
            mode: parsed.query.mode || 'auto',
          }));
        } catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }

      // ─── Self-management ───
      if (pathname === '/api/self-improve' && req.method === 'POST') {
        try { sendJSON(res, oracleInstance.selfImprove()); } catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }
      if (pathname === '/api/self-optimize' && req.method === 'POST') {
        try { sendJSON(res, oracleInstance.selfOptimize()); } catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }
      if (pathname === '/api/full-cycle' && req.method === 'POST') {
        try { sendJSON(res, oracleInstance.fullOptimizationCycle()); } catch (err) { sendJSON(res, { error: err.message }, 500); }
        return;
      }

      // ─── Serve dashboard HTML ───
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHTML());
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  };
}

module.exports = { createRouteHandler, sendJSON, readBody, safeReadBody };
