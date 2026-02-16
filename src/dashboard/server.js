/**
 * Web Dashboard for the Remembrance Oracle
 *
 * Self-contained HTTP server — no external dependencies.
 * Split into focused modules:
 * - middleware.js    — rate limiting, CORS, auth setup
 * - routes.js       — all /api/* endpoint handlers
 * - websocket.js    — real-time event forwarding
 * - styles.js       — dashboard CSS
 * - client-script.js — client-side JavaScript
 */

const http = require('http');
const url = require('url');
const { RemembranceOracle } = require('../api/oracle');
const { resilientFetchSource } = require('../core/resilience');

const { createRateLimiter, setupAuth, setupVersionManager, applyCORS } = require('./middleware');
const { createRouteHandler } = require('./routes');
const { setupWebSocket } = require('./websocket');
const { getDashboardCSS } = require('./styles');
const { getDashboardScript } = require('./client-script');

function createDashboardServer(oracle, options = {}) {
  const oracleInstance = oracle || new RemembranceOracle();

  const { authManager, authMw } = setupAuth(oracleInstance, options);
  const versionManager = setupVersionManager(oracleInstance);

  let rateLimiter = null;
  if (options.rateLimit !== false && options.auth !== false) {
    rateLimiter = createRateLimiter(options.rateLimitOptions || {});
  }

  // wsServer reference — will be set after server creation
  const ctx = { wsServer: null };

  const handleRequest = createRouteHandler(oracleInstance, {
    authManager,
    versionManager,
    get wsServer() { return ctx.wsServer; },
    getDashboardHTML,
  });

  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    applyCORS(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const proceed = () => {
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

  ctx.wsServer = setupWebSocket(server, oracleInstance);
  server.wsServer = ctx.wsServer;
  server.authManager = authManager;
  server.versionManager = versionManager;

  return server;
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
${getDashboardCSS()}
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
${getDashboardScript(resilientFetchSource)}
</script>
</body>
</html>`;
}

module.exports = { createDashboardServer, startDashboard, getDashboardHTML, createRateLimiter };
