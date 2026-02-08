/**
 * Remembrance Self-Reflector — Dashboard Integration
 *
 * A lightweight dashboard showing:
 * 1. Repo coherence trend over time (from history v2)
 * 2. Recent healing pulls (files healed, improvements)
 * 3. Healing history timeline
 * 4. Current config mode & thresholds
 * 5. Auto-commit & notification stats
 *
 * Serves a single-page HTML dashboard via Node's built-in http module.
 * Zero external dependencies.
 */

const http = require('http');
const { join } = require('path');
const { loadHistoryV2, computeStats, generateTrendChart } = require('./history');
const { loadAutoCommitHistory, autoCommitStats } = require('./autoCommit');
const { notificationStats } = require('./notifications');
const { getCurrentMode, resolveConfig } = require('./modes');
const { patternHookStats } = require('./patternHook');

// ─── Data Aggregation ───

/**
 * Gather all dashboard data for a repo.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} Dashboard data
 */
function gatherDashboardData(rootDir) {
  const history = loadHistoryV2(rootDir);
  const stats = computeStats(rootDir);
  const config = resolveConfig(rootDir, { env: process.env });
  const mode = config._mode || getCurrentMode(rootDir);
  const autoCommit = autoCommitStats(rootDir);
  const notifications = notificationStats(rootDir);
  const patternHook = patternHookStats(rootDir);

  // Build coherence trend from history
  const trend = history.runs
    .slice(-30) // Last 30 runs
    .map(r => ({
      timestamp: r.timestamp,
      coherence: r.coherence?.after ?? 0,
      filesHealed: r.healing?.filesHealed ?? 0,
      improvement: r.healing?.avgImprovement ?? 0,
    }));

  // Recent healings
  const recentRuns = history.runs.slice(-10).reverse().map(r => ({
    timestamp: r.timestamp,
    mode: r.trigger || 'live',
    filesScanned: r.healing?.filesScanned ?? 0,
    filesHealed: r.healing?.filesHealed ?? 0,
    coherenceBefore: r.coherence?.before ?? 0,
    coherenceAfter: r.coherence?.after ?? 0,
    avgImprovement: r.healing?.avgImprovement ?? 0,
    durationMs: r.durationMs ?? 0,
  }));

  return {
    repo: rootDir.split('/').pop(),
    mode,
    thresholds: config.thresholds || {},
    trend,
    stats,
    recentRuns,
    autoCommit,
    notifications,
    patternHook,
    generatedAt: new Date().toISOString(),
  };
}

// ─── JSON API ───

/**
 * Handle API requests for the dashboard.
 *
 * @param {string} rootDir - Repository root
 * @param {string} path - Request path
 * @returns {object|null} JSON response or null for unmatched paths
 */
function handleApiRequest(rootDir, path) {
  if (path === '/api/dashboard') {
    return gatherDashboardData(rootDir);
  }
  if (path === '/api/trend') {
    const history = loadHistoryV2(rootDir);
    return history.runs.slice(-50).map(r => ({
      timestamp: r.timestamp,
      coherence: r.coherence?.after ?? r.coherence?.before ?? 0,
      filesHealed: r.healing?.filesHealed ?? 0,
    }));
  }
  if (path === '/api/stats') {
    return computeStats(rootDir);
  }
  if (path === '/api/config') {
    return resolveConfig(rootDir, { env: process.env });
  }
  if (path === '/api/ascii-trend') {
    return { chart: generateTrendChart(rootDir) };
  }
  return null;
}

// ─── HTML Dashboard ───

/**
 * Generate the full HTML for the reflector dashboard.
 * Single-page app with inline CSS and JS — no external dependencies.
 *
 * @param {object} data - Dashboard data from gatherDashboardData()
 * @returns {string} HTML string
 */
function generateDashboardHTML(data) {
  const trendJSON = JSON.stringify(data.trend || []);
  const recentJSON = JSON.stringify(data.recentRuns || []);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Remembrance Reflector — ${escapeHTML(data.repo)}</title>
<style>
  :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #c9d1d9; --green: #3fb950; --yellow: #d29922; --red: #f85149; --blue: #58a6ff; --dim: #8b949e; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; padding: 24px; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 18px; color: var(--blue); margin-bottom: 12px; }
  .subtitle { color: var(--dim); font-size: 14px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .stat-value { font-size: 32px; font-weight: 700; }
  .stat-label { color: var(--dim); font-size: 13px; margin-top: 4px; }
  .stat-green { color: var(--green); }
  .stat-yellow { color: var(--yellow); }
  .stat-red { color: var(--red); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); color: var(--dim); font-weight: 600; }
  td { padding: 8px; border-bottom: 1px solid var(--border); }
  .bar-container { width: 100%; height: 20px; background: #21262d; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .chart-area { width: 100%; height: 200px; position: relative; background: #0d1117; border-radius: 4px; padding: 8px; }
  canvas { width: 100% !important; height: 100% !important; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-strict { background: #f851491a; color: var(--red); }
  .badge-balanced { background: #d299221a; color: var(--yellow); }
  .badge-relaxed { background: #3fb9501a; color: var(--green); }
  .badge-custom { background: #58a6ff1a; color: var(--blue); }
  .footer { text-align: center; color: var(--dim); font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<h1>Remembrance Self-Reflector</h1>
<p class="subtitle">${escapeHTML(data.repo)} &middot; Mode: <span class="badge badge-${escapeHTML(data.mode)}">${escapeHTML(data.mode)}</span> &middot; Generated: ${escapeHTML(data.generatedAt)}</p>

<div class="grid">
  <div class="card">
    <div class="stat-value ${getCoherenceClass(data.stats?.avgCoherenceAfter)}">${formatNum(data.stats?.avgCoherenceAfter)}</div>
    <div class="stat-label">Current Avg Coherence</div>
  </div>
  <div class="card">
    <div class="stat-value">${data.stats?.totalRuns ?? 0}</div>
    <div class="stat-label">Total Healing Runs</div>
  </div>
  <div class="card">
    <div class="stat-value">${data.stats?.totalFilesHealed ?? 0}</div>
    <div class="stat-label">Total Files Healed</div>
  </div>
  <div class="card">
    <div class="stat-value stat-green">+${formatNum(data.stats?.avgImprovement)}</div>
    <div class="stat-label">Avg Improvement per Run</div>
  </div>
</div>

<div class="card" style="margin-bottom: 24px;">
  <h2>Coherence Trend</h2>
  <div class="chart-area"><canvas id="trendChart"></canvas></div>
</div>

<div class="card" style="margin-bottom: 24px;">
  <h2>Recent Healing Runs</h2>
  <table>
    <thead><tr><th>Time</th><th>Mode</th><th>Scanned</th><th>Healed</th><th>Before</th><th>After</th><th>Improvement</th><th>Duration</th></tr></thead>
    <tbody id="runsTable"></tbody>
  </table>
</div>

<div class="grid">
  <div class="card">
    <h2>Thresholds</h2>
    <table>
      <tr><td>Min Coherence</td><td>${formatNum(data.thresholds?.minCoherence)}</td></tr>
      <tr><td>Auto-Merge Threshold</td><td>${formatNum(data.thresholds?.autoMergeThreshold)}</td></tr>
      <tr><td>Target Coherence</td><td>${formatNum(data.thresholds?.targetCoherence)}</td></tr>
      <tr><td>Approval File Threshold</td><td>${data.thresholds?.approvalFileThreshold ?? 'N/A'}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Auto-Commit Safety</h2>
    <table>
      <tr><td>Total Runs</td><td>${data.autoCommit?.totalRuns ?? 0}</td></tr>
      <tr><td>Merged</td><td class="stat-green">${data.autoCommit?.merged ?? 0}</td></tr>
      <tr><td>Aborted</td><td class="stat-red">${data.autoCommit?.aborted ?? 0}</td></tr>
      <tr><td>Success Rate</td><td>${formatPercent(data.autoCommit?.successRate)}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Notifications</h2>
    <table>
      <tr><td>Total Sent</td><td>${data.notifications?.total ?? 0}</td></tr>
      <tr><td>Successful</td><td class="stat-green">${data.notifications?.sent ?? 0}</td></tr>
      <tr><td>Failed</td><td class="stat-red">${data.notifications?.failed ?? 0}</td></tr>
      <tr><td>Success Rate</td><td>${formatPercent(data.notifications?.successRate)}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>Pattern Hook</h2>
    <table>
      <tr><td>Total Healings</td><td>${data.patternHook?.totalHealings ?? 0}</td></tr>
      <tr><td>Pattern-Guided</td><td class="stat-green">${data.patternHook?.patternGuided ?? 0}</td></tr>
      <tr><td>Guided Rate</td><td>${formatPercent(data.patternHook?.patternGuidedRate)}</td></tr>
      <tr><td>Avg Improvement (Guided)</td><td>${formatNum(data.patternHook?.avgImprovement?.guided)}</td></tr>
      <tr><td>Avg Improvement (Unguided)</td><td>${formatNum(data.patternHook?.avgImprovement?.unguided)}</td></tr>
    </table>
  </div>
</div>

<div class="footer">Remembrance Self-Reflector Bot &middot; Zero Dependencies &middot; Powered by Node.js</div>

<script>
const trend = ${trendJSON};
const runs = ${recentJSON};

// Populate runs table
const tbody = document.getElementById('runsTable');
runs.forEach(r => {
  const tr = document.createElement('tr');
  const delta = (r.coherenceAfter - r.coherenceBefore).toFixed(3);
  const deltaColor = delta > 0 ? 'stat-green' : delta < 0 ? 'stat-red' : '';
  tr.innerHTML = \`
    <td>\${new Date(r.timestamp).toLocaleString()}</td>
    <td>\${r.mode}</td>
    <td>\${r.filesScanned}</td>
    <td>\${r.filesHealed}</td>
    <td>\${r.coherenceBefore.toFixed(3)}</td>
    <td>\${r.coherenceAfter.toFixed(3)}</td>
    <td class="\${deltaColor}">+\${r.avgImprovement.toFixed(3)}</td>
    <td>\${(r.durationMs / 1000).toFixed(1)}s</td>
  \`;
  tbody.appendChild(tr);
});

// Draw trend chart (simple canvas)
const canvas = document.getElementById('trendChart');
if (canvas && trend.length > 1) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const w = canvas.width;
  const h = canvas.height;
  const pad = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const values = trend.map(t => t.coherence);
  const minV = Math.min(...values) * 0.95;
  const maxV = Math.max(...values, 1.0);
  const rangeV = maxV - minV || 1;

  // Grid lines
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.fillText((maxV - (rangeV * i / 4)).toFixed(2), 4, y + 4);
  }

  // Line
  ctx.strokeStyle = '#3fb950';
  ctx.lineWidth = 2;
  ctx.beginPath();
  trend.forEach((t, i) => {
    const x = pad.left + (plotW * i / (trend.length - 1));
    const y = pad.top + plotH - (plotH * (t.coherence - minV) / rangeV);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = '#3fb950';
  trend.forEach((t, i) => {
    const x = pad.left + (plotW * i / (trend.length - 1));
    const y = pad.top + plotH - (plotH * (t.coherence - minV) / rangeV);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}
</script>
</body>
</html>`;
}

// ─── HTML Helpers ───

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatNum(n) {
  if (typeof n !== 'number') return 'N/A';
  return n.toFixed(3);
}

function formatPercent(n) {
  if (typeof n !== 'number') return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

function getCoherenceClass(n) {
  if (typeof n !== 'number') return '';
  if (n >= 0.8) return 'stat-green';
  if (n >= 0.6) return 'stat-yellow';
  return 'stat-red';
}

// ─── HTTP Server ───

/**
 * Create a dashboard HTTP server.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { port }
 * @returns {object} { server, port }
 */
function createReflectorDashboard(rootDir, options = {}) {
  const { port = 3456 } = options;

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    // API routes
    if (url.startsWith('/api/')) {
      const apiResult = handleApiRequest(rootDir, url);
      if (apiResult) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(apiResult, null, 2));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Dashboard HTML
    const data = gatherDashboardData(rootDir);
    const html = generateDashboardHTML(data);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  return { server, port };
}

/**
 * Start the reflector dashboard server.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { port }
 * @returns {object} { server, port, url }
 */
function startReflectorDashboard(rootDir, options = {}) {
  const { server, port } = createReflectorDashboard(rootDir, options);
  server.listen(port);
  return { server, port, url: `http://localhost:${port}` };
}

module.exports = {
  gatherDashboardData,
  handleApiRequest,
  generateDashboardHTML,
  createReflectorDashboard,
  startReflectorDashboard,
};
