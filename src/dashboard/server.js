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
 */

const http = require('http');
const url = require('url');
const { RemembranceOracle } = require('../api/oracle');

function createDashboardServer(oracle, options = {}) {
  const oracleInstance = oracle || new RemembranceOracle();

  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // API routes
      if (pathname === '/api/stats') {
        const storeStats = oracleInstance.stats();
        const patternStats = oracleInstance.patternStats();
        sendJSON(res, { store: storeStats, patterns: patternStats });
        return;
      }

      if (pathname === '/api/patterns') {
        const patterns = oracleInstance.patterns.getAll();
        sendJSON(res, patterns);
        return;
      }

      if (pathname === '/api/search') {
        const query = parsed.query.q || '';
        const mode = parsed.query.mode || 'hybrid';
        const limit = parseInt(parsed.query.limit) || 10;
        if (!query) { sendJSON(res, []); return; }
        const results = oracleInstance.search(query, { mode, limit });
        sendJSON(res, results);
        return;
      }

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

      if (pathname === '/api/audit') {
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        if (!sqliteStore) { sendJSON(res, []); return; }
        const limit = parseInt(parsed.query.limit) || 50;
        sendJSON(res, sqliteStore.getAuditLog({ limit }));
        return;
      }

      if (pathname === '/api/entries') {
        const entries = oracleInstance.store.getAll();
        sendJSON(res, entries);
        return;
      }

      // Serve dashboard HTML
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHTML());
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  return server;
}

function sendJSON(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function startDashboard(oracle, options = {}) {
  const port = options.port || 3333;
  const server = createDashboardServer(oracle, options);
  server.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
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
  <h1>Remembrance Oracle</h1>
  <p class="subtitle">Proven code memory — search, browse, and explore</p>

  <div class="tabs">
    <button class="tab active" data-panel="patterns">Patterns</button>
    <button class="tab" data-panel="search">Search</button>
    <button class="tab" data-panel="history">History</button>
    <button class="tab" data-panel="vectors">Vectors</button>
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

  function renderPattern(p) {
    const score = p.coherencyScore?.total ?? 0;
    const tags = (p.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    return '<div class="card"><div class="card-header"><span class="card-name">' + esc(p.name) +
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

module.exports = { createDashboardServer, startDashboard, getDashboardHTML };
