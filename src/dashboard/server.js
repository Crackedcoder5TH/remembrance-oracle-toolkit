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
    const ip = req.socket.remoteAddress || '127.0.0.1';
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
        sendJSON(res, { status: 'ok', wsClients: wsServer ? wsServer.clients.size : 0 });
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
        const data = JSON.parse(msg);
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
    try { callback(JSON.parse(body)); }
    catch { callback({}); }
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
    --bg: #1a1b26; --bg2: #24283b; --bg3: #2f3348;
    --fg: #c0caf5; --fg2: #a9b1d6; --fg3: #565f89;
    --accent: #7aa2f7; --green: #9ece6a; --red: #f7768e;
    --yellow: #e0af68; --purple: #bb9af7; --cyan: #7dcfff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'SF Mono', 'Fira Code', monospace; background: var(--bg); color: var(--fg); }
  .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
  h1 { color: var(--accent); margin-bottom: 5px; font-size: 1.4em; }
  .subtitle { color: var(--fg3); margin-bottom: 20px; font-size: 0.85em; }
  .ws-status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 8px; vertical-align: middle; }
  .ws-connected { background: var(--green); }
  .ws-disconnected { background: var(--red); }
  .toast { position: fixed; top: 20px; right: 20px; background: var(--bg2); border: 1px solid var(--accent);
           border-radius: 8px; padding: 12px 20px; color: var(--fg); font-size: 0.85em; z-index: 100;
           opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  .toast.show { opacity: 1; }
  .tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 2px solid var(--bg3); }
  .tab { padding: 10px 20px; cursor: pointer; color: var(--fg3); border: none; background: none;
         font-family: inherit; font-size: 0.9em; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tab:hover { color: var(--fg2); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .panel { display: none; }
  .panel.active { display: block; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
  .stat-card { background: var(--bg2); border-radius: 8px; padding: 15px; }
  .stat-label { color: var(--fg3); font-size: 0.8em; text-transform: uppercase; }
  .stat-value { font-size: 1.8em; color: var(--accent); margin-top: 5px; }
  .search-bar { display: flex; gap: 10px; margin-bottom: 20px; }
  .search-bar input { flex: 1; padding: 10px 15px; background: var(--bg2); border: 1px solid var(--bg3);
                       border-radius: 6px; color: var(--fg); font-family: inherit; font-size: 0.9em; }
  .search-bar input:focus { outline: none; border-color: var(--accent); }
  .search-bar select { padding: 10px; background: var(--bg2); border: 1px solid var(--bg3);
                        border-radius: 6px; color: var(--fg); font-family: inherit; }
  .card { background: var(--bg2); border-radius: 8px; padding: 15px; margin-bottom: 12px; border-left: 3px solid var(--bg3); }
  .card.highlight { border-left-color: var(--green); animation: flash 1s ease; }
  @keyframes flash { 0% { background: rgba(158,206,106,0.15); } 100% { background: var(--bg2); } }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .card-name { font-weight: bold; color: var(--accent); }
  .card-meta { font-size: 0.8em; color: var(--fg3); }
  .tag { display: inline-block; padding: 2px 8px; background: var(--bg3); border-radius: 4px;
         font-size: 0.75em; color: var(--purple); margin: 2px; }
  .lang { color: var(--cyan); }
  .type { color: var(--yellow); }
  .score { padding: 2px 8px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
  .score-high { background: rgba(158,206,106,0.2); color: var(--green); }
  .score-mid { background: rgba(224,175,104,0.2); color: var(--yellow); }
  .score-low { background: rgba(247,118,142,0.2); color: var(--red); }
  pre { background: var(--bg); padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.85em;
        margin-top: 8px; max-height: 300px; overflow-y: auto; line-height: 1.4; }
  .bar-container { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
  .bar-label { width: 140px; font-size: 0.8em; color: var(--fg2); text-align: right; }
  .bar { height: 18px; border-radius: 3px; background: var(--accent); transition: width 0.3s; }
  .bar-value { font-size: 0.8em; color: var(--fg3); width: 50px; }
  .audit-row { display: flex; gap: 15px; padding: 8px 12px; border-bottom: 1px solid var(--bg3); font-size: 0.85em; }
  .audit-time { color: var(--fg3); width: 180px; flex-shrink: 0; }
  .audit-action { width: 80px; flex-shrink: 0; font-weight: bold; }
  .audit-add { color: var(--green); }
  .audit-retire, .audit-prune { color: var(--red); }
  .audit-usage { color: var(--yellow); }
  .audit-detail { color: var(--fg3); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { text-align: center; color: var(--fg3); padding: 40px; }
  .loading { text-align: center; color: var(--fg3); padding: 20px; }
</style>
</head>
<body>
<div class="container">
  <h1>Remembrance Oracle <span id="ws-indicator" class="ws-status ws-disconnected" title="WebSocket disconnected"></span></h1>
  <p class="subtitle">Proven code memory — search, browse, and explore</p>
  <div id="toast" class="toast"></div>

  <div class="tabs">
    <button class="tab active" data-panel="patterns">Patterns</button>
    <button class="tab" data-panel="search">Search</button>
    <button class="tab" data-panel="history">History</button>
    <button class="tab" data-panel="vectors">Vectors</button>
    <button class="tab" data-panel="analytics">Analytics</button>
    <button class="tab" data-panel="audit">Audit Log</button>
  </div>

  <div id="patterns" class="panel active">
    <div class="stats-grid" id="stats-grid"></div>
    <div id="patterns-list"><p class="loading">Loading patterns...</p></div>
  </div>

  <div id="search" class="panel">
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Search for code patterns..." />
      <select id="search-mode"><option value="hybrid">Hybrid</option><option value="semantic">Semantic</option></select>
    </div>
    <div id="search-results"><p class="empty">Type a query to search</p></div>
  </div>

  <div id="history" class="panel">
    <div id="history-list"><p class="loading">Loading entries...</p></div>
  </div>

  <div id="vectors" class="panel">
    <div class="search-bar">
      <input type="text" id="vector-input" placeholder="Enter a term to find nearest vectors..." />
    </div>
    <div id="vector-results"><p class="empty">Type a term to explore the vector space</p></div>
  </div>

  <div id="analytics" class="panel">
    <div id="analytics-content"><p class="loading">Loading analytics...</p></div>
  </div>

  <div id="audit" class="panel">
    <div id="audit-list"><p class="loading">Loading audit log...</p></div>
  </div>
</div>

<script>
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel).classList.add('active');
    });
  });

  function scoreClass(s) { return s >= 0.7 ? 'score-high' : s >= 0.4 ? 'score-mid' : 'score-low'; }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // Toast notifications
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ─── WebSocket connection with auto-reconnect ───
  let ws = null;
  let wsReconnectTimer = null;

  function connectWS() {
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(proto + '//' + location.host);

      ws.onopen = function() {
        document.getElementById('ws-indicator').className = 'ws-status ws-connected';
        document.getElementById('ws-indicator').title = 'WebSocket connected';
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
      };

      ws.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          handleWSEvent(data);
        } catch {}
      };

      ws.onclose = function() {
        document.getElementById('ws-indicator').className = 'ws-status ws-disconnected';
        document.getElementById('ws-indicator').title = 'WebSocket disconnected';
        ws = null;
        // Auto-reconnect after 3 seconds
        if (!wsReconnectTimer) {
          wsReconnectTimer = setTimeout(connectWS, 3000);
        }
      };

      ws.onerror = function() {
        // Will trigger onclose
      };
    } catch {
      // WebSocket not available
    }
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
        showToast('Feedback received for ' + (data.id || '').slice(0,8));
        break;
      case 'stats_update':
        refreshStats();
        break;
      case 'clients':
        // Connection count update — no UI action needed
        break;
    }
  }

  connectWS();

  function renderPattern(p) {
    const score = p.coherencyScore?.total ?? 0;
    const tags = (p.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    return '<div class="card" data-id="' + esc(p.id) + '"><div class="card-header"><span class="card-name">' + esc(p.name) +
      '</span><span class="score ' + scoreClass(score) + '">' + score.toFixed(3) + '</span></div>' +
      '<div class="card-meta"><span class="lang">' + esc(p.language || 'unknown') + '</span> · ' +
      '<span class="type">' + esc(p.patternType || '') + '</span> · ' +
      esc(p.complexity || '') + '</div>' +
      '<div style="margin:5px 0">' + tags + '</div>' +
      '<pre>' + esc(p.code) + '</pre></div>';
  }

  function renderEntry(e) {
    const score = e.coherencyScore?.total ?? 0;
    const tags = (e.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    return '<div class="card"><div class="card-header"><span class="card-name">' + esc(e.description || e.id) +
      '</span><span class="score ' + scoreClass(score) + '">' + score.toFixed(3) + '</span></div>' +
      '<div class="card-meta"><span class="lang">' + esc(e.language || 'unknown') + '</span></div>' +
      '<div style="margin:5px 0">' + tags + '</div>' +
      '<pre>' + esc(e.code) + '</pre></div>';
  }

  function refreshStats() {
    fetch('/api/stats').then(r=>r.json()).then(stats => {
      const sg = document.getElementById('stats-grid');
      const ps = stats.patterns || {};
      sg.innerHTML =
        '<div class="stat-card"><div class="stat-label">Patterns</div><div class="stat-value">' + (ps.totalPatterns||0) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Entries</div><div class="stat-value">' + (stats.store?.totalEntries||0) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Coherency</div><div class="stat-value">' + (ps.avgCoherency||0).toFixed(3) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Languages</div><div class="stat-value">' + Object.keys(ps.byLanguage||{}).length + '</div></div>';
    });
  }

  function refreshPatterns() {
    fetch('/api/patterns').then(r=>r.json()).then(patterns => {
      document.getElementById('patterns-list').innerHTML = patterns.length > 0
        ? patterns.map(renderPattern).join('')
        : '<p class="empty">No patterns registered yet. Run: oracle seed</p>';
    });
  }

  // Load stats and patterns
  Promise.all([fetch('/api/stats').then(r=>r.json()), fetch('/api/patterns').then(r=>r.json())])
    .then(([stats, patterns]) => {
      const sg = document.getElementById('stats-grid');
      const ps = stats.patterns || {};
      sg.innerHTML =
        '<div class="stat-card"><div class="stat-label">Patterns</div><div class="stat-value">' + (ps.totalPatterns||0) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Entries</div><div class="stat-value">' + (stats.store?.totalEntries||0) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Coherency</div><div class="stat-value">' + (ps.avgCoherency||0).toFixed(3) + '</div></div>' +
        '<div class="stat-card"><div class="stat-label">Languages</div><div class="stat-value">' + Object.keys(ps.byLanguage||{}).length + '</div></div>';
      document.getElementById('patterns-list').innerHTML = patterns.length > 0
        ? patterns.map(renderPattern).join('')
        : '<p class="empty">No patterns registered yet. Run: oracle seed</p>';
    });

  // Search with debounce
  let searchTimer;
  document.getElementById('search-input').addEventListener('input', function() {
    clearTimeout(searchTimer);
    const q = this.value.trim();
    if (!q) { document.getElementById('search-results').innerHTML = '<p class="empty">Type a query to search</p>'; return; }
    searchTimer = setTimeout(() => {
      const mode = document.getElementById('search-mode').value;
      fetch('/api/search?q=' + encodeURIComponent(q) + '&mode=' + mode)
        .then(r => r.json())
        .then(results => {
          document.getElementById('search-results').innerHTML = results.length > 0
            ? results.map(r => {
                const score = r.matchScore || r.semanticScore || 0;
                return '<div class="card"><div class="card-header"><span class="card-name">' +
                  esc(r.name || r.description || r.id) + '</span><span class="score ' + scoreClass(score) +
                  '">match: ' + score.toFixed(3) + '</span></div>' +
                  '<div class="card-meta"><span class="lang">' + esc(r.language || '') + '</span>' +
                  (r.matchedConcepts?.length ? ' · concepts: ' + r.matchedConcepts.join(', ') : '') + '</div>' +
                  '<pre>' + esc(r.code) + '</pre></div>';
              }).join('')
            : '<p class="empty">No results found</p>';
        });
    }, 300);
  });

  // Vector nearest
  let vectorTimer;
  document.getElementById('vector-input').addEventListener('input', function() {
    clearTimeout(vectorTimer);
    const q = this.value.trim();
    if (!q) { document.getElementById('vector-results').innerHTML = '<p class="empty">Type a term to explore</p>'; return; }
    vectorTimer = setTimeout(() => {
      fetch('/api/nearest?q=' + encodeURIComponent(q))
        .then(r => r.json())
        .then(terms => {
          if (terms.length === 0) {
            document.getElementById('vector-results').innerHTML = '<p class="empty">No matching terms</p>';
            return;
          }
          const maxSim = terms[0]?.similarity || 1;
          document.getElementById('vector-results').innerHTML = terms.map(t =>
            '<div class="bar-container"><span class="bar-label">' + esc(t.term) +
            '</span><div style="flex:1;background:var(--bg3);border-radius:3px"><div class="bar" style="width:' +
            (t.similarity / maxSim * 100).toFixed(1) + '%"></div></div>' +
            '<span class="bar-value">' + t.similarity.toFixed(3) + '</span></div>'
          ).join('');
        });
    }, 300);
  });

  // History tab
  document.querySelector('[data-panel="history"]').addEventListener('click', function() {
    fetch('/api/entries').then(r => r.json()).then(entries => {
      document.getElementById('history-list').innerHTML = entries.length > 0
        ? entries.map(renderEntry).join('')
        : '<p class="empty">No entries in history</p>';
    });
  }, { once: true });

  // Analytics tab
  document.querySelector('[data-panel="analytics"]').addEventListener('click', function() {
    fetch('/api/analytics').then(r=>r.json()).then(data => {
      const ov = data.overview || {};
      const dist = data.coherencyDistribution || {};
      const health = data.healthReport || {};
      const langs = data.languageBreakdown || {};
      const cx = data.complexityBreakdown || {};
      const tags = data.tagCloud || [];
      const top = data.topPatterns || [];

      let html = '<div class="stats-grid">';
      html += '<div class="stat-card"><div class="stat-label">Patterns</div><div class="stat-value">' + (ov.totalPatterns||0) + '</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Avg Coherency</div><div class="stat-value">' + (ov.avgCoherency||0).toFixed(3) + '</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Quality Ratio</div><div class="stat-value">' + (ov.qualityRatio||0) + '%</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Languages</div><div class="stat-value">' + (ov.languages||0) + '</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Healthy</div><div class="stat-value" style="color:var(--green)">' + (health.healthy||0) + '</div></div>';
      html += '<div class="stat-card"><div class="stat-label">Critical</div><div class="stat-value" style="color:var(--red)">' + (health.critical||0) + '</div></div>';
      html += '</div>';

      // Coherency distribution
      html += '<h3 style="color:var(--accent);margin:15px 0 10px">Coherency Distribution</h3>';
      const maxBucket = Math.max(...Object.values(dist), 1);
      for (const [range, count] of Object.entries(dist)) {
        html += '<div class="bar-container"><span class="bar-label">' + esc(range) + '</span>';
        html += '<div style="flex:1;background:var(--bg3);border-radius:3px"><div class="bar" style="width:' + (count/maxBucket*100).toFixed(1) + '%"></div></div>';
        html += '<span class="bar-value">' + count + '</span></div>';
      }

      // Language breakdown
      html += '<h3 style="color:var(--accent);margin:15px 0 10px">Languages</h3>';
      for (const [lang, info] of Object.entries(langs)) {
        html += '<div class="bar-container"><span class="bar-label">' + esc(lang) + '</span>';
        html += '<div style="flex:1;background:var(--bg3);border-radius:3px"><div class="bar" style="width:' + (info.count/(ov.totalPatterns||1)*100).toFixed(1) + '%"></div></div>';
        html += '<span class="bar-value">' + info.count + ' (' + info.avgCoherency.toFixed(3) + ')</span></div>';
      }

      // Tag cloud
      if (tags.length > 0) {
        html += '<h3 style="color:var(--accent);margin:15px 0 10px">Top Tags</h3><div style="display:flex;flex-wrap:wrap;gap:6px">';
        const maxTag = tags[0].count;
        for (const t of tags) {
          const size = 0.7 + (t.count/maxTag) * 0.8;
          html += '<span class="tag" style="font-size:' + size.toFixed(2) + 'em">' + esc(t.tag) + ' (' + t.count + ')</span>';
        }
        html += '</div>';
      }

      // Top patterns
      if (top.length > 0) {
        html += '<h3 style="color:var(--accent);margin:15px 0 10px">Top Patterns</h3>';
        for (const p of top) {
          html += '<div class="card" style="padding:10px"><div class="card-header"><span class="card-name">' + esc(p.name) + '</span>';
          html += '<span class="score ' + scoreClass(p.coherency) + '">' + p.coherency.toFixed(3) + '</span></div>';
          html += '<div class="card-meta"><span class="lang">' + esc(p.language||'') + '</span> · <span class="type">' + esc(p.type||'') + '</span></div></div>';
        }
      }

      document.getElementById('analytics-content').innerHTML = html;
    });
  }, { once: true });

  // Audit tab
  document.querySelector('[data-panel="audit"]').addEventListener('click', function() {
    fetch('/api/audit').then(r => r.json()).then(logs => {
      document.getElementById('audit-list').innerHTML = logs.length > 0
        ? logs.map(l =>
            '<div class="audit-row"><span class="audit-time">' + esc(l.timestamp) +
            '</span><span class="audit-action audit-' + l.action + '">' + esc(l.action) +
            '</span><span class="audit-detail">' + esc(l.table + ' ' + l.id + ' ' + JSON.stringify(l.detail)) +
            '</span></div>'
          ).join('')
        : '<p class="empty">No audit log entries</p>';
    });
  }, { once: true });
</script>
</body>
</html>`;
}

module.exports = { createDashboardServer, startDashboard, getDashboardHTML, createRateLimiter };
