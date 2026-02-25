const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { join } = require('path');

const {
  gatherDashboardData,
  handleApiRequest,
  generateDashboardHTML,
  createReflectorDashboard,
} = require('../src/reflector/report');

// ─── Helpers ───

const TEST_ROOT = join(__dirname, '__tmp_dashboard_test__');

function setup() {
  mkdirSync(join(TEST_ROOT, '.remembrance'), { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

function seedHistory() {
  const history = {
    version: 2,
    runs: [
      { timestamp: '2025-01-01T00:00:00Z', trigger: 'live', durationMs: 5000, coherence: { before: 0.65, after: 0.72 }, healing: { filesScanned: 10, filesHealed: 3, avgImprovement: 0.07 } },
      { timestamp: '2025-01-02T00:00:00Z', trigger: 'live', durationMs: 4500, coherence: { before: 0.72, after: 0.78 }, healing: { filesScanned: 10, filesHealed: 2, avgImprovement: 0.06 } },
      { timestamp: '2025-01-03T00:00:00Z', trigger: 'dry-run', durationMs: 3000, coherence: { before: 0.78, after: 0.78 }, healing: { filesScanned: 10, filesHealed: 0, avgImprovement: 0 } },
    ],
    log: [],
  };
  writeFileSync(join(TEST_ROOT, '.remembrance', 'reflector-history-v2.json'), JSON.stringify(history));
}

// ─── gatherDashboardData ───

describe('gatherDashboardData', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should return dashboard data with empty history', () => {
    const data = gatherDashboardData(TEST_ROOT);
    assert.ok(data.repo);
    assert.ok(data.mode);
    assert.ok(data.thresholds);
    assert.ok(Array.isArray(data.trend));
    assert.ok(Array.isArray(data.recentRuns));
    assert.ok(data.autoCommit);
    assert.ok(data.notifications);
    assert.ok(data.generatedAt);
  });

  it('should include trend data from history', () => {
    seedHistory();
    const data = gatherDashboardData(TEST_ROOT, { bypassCache: true });
    assert.equal(data.trend.length, 3);
    assert.equal(data.trend[0].coherence, 0.72);
    assert.equal(data.trend[1].filesHealed, 2);
  });

  it('should include recent runs in reverse order', () => {
    seedHistory();
    const data = gatherDashboardData(TEST_ROOT, { bypassCache: true });
    assert.equal(data.recentRuns.length, 3);
    // Most recent first
    assert.equal(data.recentRuns[0].mode, 'dry-run');
    assert.equal(data.recentRuns[2].mode, 'live');
  });

  it('should include stats', () => {
    seedHistory();
    const data = gatherDashboardData(TEST_ROOT, { bypassCache: true });
    assert.ok(data.stats);
    assert.equal(data.stats.totalRuns, 3);
  });
});

// ─── handleApiRequest ───

describe('handleApiRequest', () => {
  beforeEach(() => { cleanup(); setup(); seedHistory(); });
  afterEach(() => { cleanup(); });

  it('should handle /api/dashboard', () => {
    const result = handleApiRequest(TEST_ROOT, '/api/dashboard');
    assert.ok(result);
    assert.ok(result.repo);
    assert.ok(result.trend);
    assert.ok(result.stats);
  });

  it('should handle /api/trend', () => {
    const result = handleApiRequest(TEST_ROOT, '/api/trend');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 3);
    assert.ok(result[0].timestamp);
    assert.ok(typeof result[0].coherence === 'number');
  });

  it('should handle /api/stats', () => {
    const result = handleApiRequest(TEST_ROOT, '/api/stats');
    assert.ok(result);
    assert.equal(result.totalRuns, 3);
  });

  it('should handle /api/config', () => {
    const result = handleApiRequest(TEST_ROOT, '/api/config');
    assert.ok(result);
    assert.ok(result.thresholds);
  });

  it('should handle /api/ascii-trend', () => {
    const result = handleApiRequest(TEST_ROOT, '/api/ascii-trend');
    assert.ok(result);
    assert.ok(typeof result.chart === 'string');
  });

  it('should return null for unknown path', () => {
    const result = handleApiRequest(TEST_ROOT, '/api/unknown');
    assert.equal(result, null);
  });
});

// ─── generateDashboardHTML ───

describe('generateDashboardHTML', () => {
  it('should generate valid HTML with repo name', () => {
    const html = generateDashboardHTML({
      repo: 'test-repo',
      mode: 'balanced',
      thresholds: { minCoherence: 0.7, autoMergeThreshold: 0.9, targetCoherence: 0.95 },
      trend: [],
      stats: { totalRuns: 5, totalFilesHealed: 12, avgCoherence: 0.82, avgImprovement: 0.06 },
      recentRuns: [],
      autoCommit: { totalRuns: 3, merged: 2, aborted: 1, successRate: 0.667 },
      notifications: { total: 5, sent: 4, failed: 1, successRate: 0.8 },
      generatedAt: '2025-01-01T00:00:00Z',
    });

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('test-repo'));
    assert.ok(html.includes('balanced'));
    assert.ok(html.includes('0.820'));
    assert.ok(html.includes('Remembrance Reflector BOT'));
  });

  it('should include trend chart canvas', () => {
    const html = generateDashboardHTML({
      repo: 'x', mode: 'strict', thresholds: {},
      trend: [{ timestamp: '2025-01-01', coherence: 0.7 }, { timestamp: '2025-01-02', coherence: 0.8 }],
      stats: {}, recentRuns: [], autoCommit: {}, notifications: {},
      generatedAt: '2025-01-01',
    });
    assert.ok(html.includes('<canvas id="trendChart"'));
    assert.ok(html.includes('Coherence Trend'));
  });

  it('should include thresholds table', () => {
    const html = generateDashboardHTML({
      repo: 'x', mode: 'custom', thresholds: { minCoherence: 0.75 },
      trend: [], stats: {}, recentRuns: [], autoCommit: {}, notifications: {},
      generatedAt: '2025-01-01',
    });
    assert.ok(html.includes('Min Coherence'));
    assert.ok(html.includes('0.750'));
  });

  it('should escape HTML in repo name', () => {
    const html = generateDashboardHTML({
      repo: '<script>alert(1)</script>', mode: 'custom', thresholds: {},
      trend: [], stats: {}, recentRuns: [], autoCommit: {}, notifications: {},
      generatedAt: '2025-01-01',
    });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('should handle missing stats gracefully', () => {
    const html = generateDashboardHTML({
      repo: 'x', mode: 'custom', thresholds: {},
      trend: [], stats: null, recentRuns: [], autoCommit: null, notifications: null,
      generatedAt: '2025-01-01',
    });
    assert.ok(html.includes('N/A'));
  });
});

// ─── createReflectorDashboard ───

describe('createReflectorDashboard', () => {
  beforeEach(() => { cleanup(); setup(); seedHistory(); });
  afterEach(() => { cleanup(); });

  it('should create an HTTP server', () => {
    const { server, port } = createReflectorDashboard(TEST_ROOT, { port: 0 });
    assert.ok(server);
    assert.ok(typeof port === 'number');
    assert.ok(typeof server.listen === 'function');
  });

  it('should respond to HTTP requests', (t, done) => {
    const { server } = createReflectorDashboard(TEST_ROOT);
    server.listen(0, () => {
      const addr = server.address();
      const req = require('http').get(`http://localhost:${addr.port}/`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          assert.equal(res.statusCode, 200);
          assert.ok(body.includes('<!DOCTYPE html>'));
          assert.ok(body.includes('Remembrance'));
          server.close(done);
        });
      });
      req.on('error', () => server.close(done));
    });
  });

  it('should serve API endpoint', (t, done) => {
    const { server } = createReflectorDashboard(TEST_ROOT);
    server.listen(0, () => {
      const addr = server.address();
      const req = require('http').get(`http://localhost:${addr.port}/api/dashboard`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          assert.equal(res.statusCode, 200);
          const data = JSON.parse(body);
          assert.ok(data.repo);
          assert.ok(data.trend);
          server.close(done);
        });
      });
      req.on('error', () => server.close(done));
    });
  });

  it('should return 404 for unknown API routes', (t, done) => {
    const { server } = createReflectorDashboard(TEST_ROOT);
    server.listen(0, () => {
      const addr = server.address();
      const req = require('http').get(`http://localhost:${addr.port}/api/fake`, (res) => {
        assert.equal(res.statusCode, 404);
        server.close(done);
      });
      req.on('error', () => server.close(done));
    });
  });
});

// ─── Exports ───

describe('Dashboard Integration — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorGatherDashboardData, 'function');
    assert.strictEqual(typeof index.reflectorGenerateDashboardHTML, 'function');
    assert.strictEqual(typeof index.reflectorCreateReflectorDashboard, 'function');
    assert.strictEqual(typeof index.reflectorStartReflectorDashboard, 'function');
    assert.strictEqual(typeof index.reflectorHandleApiRequest, 'function');
  });
});

// ─── Reflector functions accessible (MCP consolidated) ───

describe('Dashboard Integration — reflector functions (MCP consolidated)', () => {
  it('dashboard functions are directly importable from report', () => {
    const report = require('../src/reflector/report');
    assert.strictEqual(typeof report.gatherDashboardData, 'function');
    assert.strictEqual(typeof report.handleApiRequest, 'function');
    assert.strictEqual(typeof report.generateDashboardHTML, 'function');
    assert.strictEqual(typeof report.createReflectorDashboard, 'function');
    assert.strictEqual(typeof report.startReflectorDashboard, 'function');
  });

  it('MCP has 12 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 12);
  });
});
