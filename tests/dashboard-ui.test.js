const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createDashboardServer, getDashboardHTML } = require('../src/dashboard/server');

// ─── HTTP helpers ───

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── getDashboardHTML() unit tests ───

describe('getDashboardHTML — structure', () => {
  const html = getDashboardHTML();

  it('returns valid HTML document', () => {
    assert.ok(html.includes('<!DOCTYPE html>'), 'Should start with DOCTYPE');
    assert.ok(html.includes('<html lang="en">'), 'Should have html lang attribute');
    assert.ok(html.includes('</html>'), 'Should close html tag');
  });

  it('contains all 8 nav tabs', () => {
    assert.ok(html.includes('data-panel="patterns"'), 'Patterns tab');
    assert.ok(html.includes('data-panel="search"'), 'Search tab');
    assert.ok(html.includes('data-panel="debug"'), 'Debug Explorer tab');
    assert.ok(html.includes('data-panel="teams"'), 'Teams tab');
    assert.ok(html.includes('data-panel="history"'), 'History tab');
    assert.ok(html.includes('data-panel="vectors"'), 'Vectors tab');
    assert.ok(html.includes('data-panel="analytics"'), 'Analytics tab');
    assert.ok(html.includes('data-panel="admin"'), 'Admin tab');
  });

  it('contains Remembrance Oracle branding', () => {
    assert.ok(html.includes('Remembrance Oracle'));
  });

  it('includes WebSocket client code', () => {
    assert.ok(html.includes('connectWS'), 'Should have connectWS function');
    assert.ok(html.includes('WebSocket'), 'Should reference WebSocket');
    assert.ok(html.includes('ws-dot'), 'Should have ws-dot indicator');
  });

  it('includes toast notification system', () => {
    assert.ok(html.includes('showToast'), 'Should have showToast function');
    assert.ok(html.includes('toast-container'), 'Should have toast container');
  });

  it('includes glassmorphism CSS', () => {
    assert.ok(html.includes('backdrop-filter'), 'Should use backdrop-filter');
    assert.ok(html.includes('--bg-glass'), 'Should have glass CSS variable');
  });

  it('includes keyboard shortcut handler', () => {
    assert.ok(html.includes('cmd-palette'), 'Should have command palette');
    assert.ok(html.includes('Escape'), 'Should handle Escape key');
  });

  it('includes mobile responsive sidebar', () => {
    assert.ok(html.includes('mobile-toggle'), 'Should have mobile toggle button');
    assert.ok(html.includes('@media'), 'Should have media queries');
  });

  it('includes syntax highlighting classes', () => {
    assert.ok(html.includes('class="kw"') || html.includes('.kw'), 'Should have keyword class');
    assert.ok(html.includes('class="str"') || html.includes('.str'), 'Should have string class');
    assert.ok(html.includes('highlight('), 'Should have highlight function');
  });

  it('includes loading skeletons', () => {
    assert.ok(html.includes('skeleton'), 'Should have skeleton class');
    assert.ok(html.includes('shimmer'), 'Should have shimmer animation');
  });

  it('includes debounced search', () => {
    assert.ok(html.includes('debounce'), 'Should have debounce function');
    assert.ok(html.includes('search-input'), 'Should have search input');
  });

  it('includes pattern filter bar', () => {
    assert.ok(html.includes('filter-pill'), 'Should have filter pills');
    assert.ok(html.includes('pattern-filters'), 'Should have pattern filters container');
    assert.ok(html.includes('sort-btn') || html.includes('sort-toggle'), 'Should have sort toggle');
  });

  it('includes vector scatter visualization', () => {
    assert.ok(html.includes('scatter-container'), 'Should have scatter container');
    assert.ok(html.includes('scatter-point'), 'Should have scatter point class');
  });

  it('includes admin user management section', () => {
    assert.ok(html.includes('create-user-btn'), 'Should have create user button');
    assert.ok(html.includes('admin-table'), 'Should have admin table class');
    assert.ok(html.includes('gen-api-key-btn'), 'Should have API key generation button');
  });

  it('includes team creation form', () => {
    assert.ok(html.includes('create-team-btn'), 'Should have create team button');
    assert.ok(html.includes('team-name-input'), 'Should have team name input');
  });

  it('includes debug explorer search', () => {
    assert.ok(html.includes('debug-search-input'), 'Should have debug search input');
    assert.ok(html.includes('debug-results'), 'Should have debug results container');
  });
});

// ─── Server API endpoint tests ───

describe('Dashboard server — existing endpoints', () => {
  let server;
  let port;

  before(async () => {
    server = createDashboardServer(undefined, { auth: false });
    await new Promise(resolve => server.listen(0, resolve));
    port = server.address().port;
  });

  after(() => { if (server) server.close(); });

  it('serves HTML dashboard at /', async () => {
    const res = await httpGet(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.data.includes('Remembrance Oracle'));
  });

  it('serves /api/health', async () => {
    const res = await httpGet(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.equal(data.status, 'ok');
    assert.ok('wsClients' in data);
  });

  it('serves /api/stats', async () => {
    const res = await httpGet(`http://localhost:${port}/api/stats`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok('store' in data);
    assert.ok('patterns' in data);
  });

  it('serves /api/patterns', async () => {
    const res = await httpGet(`http://localhost:${port}/api/patterns`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

  it('serves /api/search with query', async () => {
    const res = await httpGet(`http://localhost:${port}/api/search?q=sort`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

  it('serves /api/search empty without query', async () => {
    const res = await httpGet(`http://localhost:${port}/api/search`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.deepStrictEqual(data, []);
  });

  it('serves /api/entries', async () => {
    const res = await httpGet(`http://localhost:${port}/api/entries`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });
});

// ─── New API endpoint tests ───

describe('Dashboard server — debug endpoints', () => {
  let server;
  let port;

  before(async () => {
    server = createDashboardServer(undefined, { auth: false });
    await new Promise(resolve => server.listen(0, resolve));
    port = server.address().port;
  });

  after(() => { if (server) server.close(); });

  it('GET /api/debug/stats returns debug statistics', async () => {
    const res = await httpGet(`http://localhost:${port}/api/debug/stats`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok('totalPatterns' in data, 'Should have totalPatterns');
  });

  it('GET /api/debug/search returns empty array without query', async () => {
    const res = await httpGet(`http://localhost:${port}/api/debug/search`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.deepStrictEqual(data, []);
  });

  it('GET /api/debug/search returns array with query', async () => {
    const res = await httpGet(`http://localhost:${port}/api/debug/search?q=TypeError`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });
});

describe('Dashboard server — teams endpoints', () => {
  let server;
  let port;

  before(async () => {
    server = createDashboardServer(undefined, { auth: false });
    await new Promise(resolve => server.listen(0, resolve));
    port = server.address().port;
  });

  after(() => { if (server) server.close(); });

  it('GET /api/teams returns array', async () => {
    const res = await httpGet(`http://localhost:${port}/api/teams`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

  it('POST /api/teams creates a team', async () => {
    const res = await httpPost(`http://localhost:${port}/api/teams`, {
      name: 'Test Team',
      description: 'A test team'
    });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(data.id, 'Should have id');
    assert.equal(data.name, 'Test Team');
    assert.equal(data.description, 'A test team');
    assert.ok(data.created_at, 'Should have created_at');
    assert.equal(data.memberCount, 1, 'Creator should be auto-added');
  });

  it('POST /api/teams/:id/members adds a member', async () => {
    // First create a team
    const teamRes = await httpPost(`http://localhost:${port}/api/teams`, {
      name: 'Members Test',
    });
    const team = JSON.parse(teamRes.data);

    // Now add a member
    const res = await httpPost(`http://localhost:${port}/api/teams/${team.id}/members`, {
      userId: 'test-user-123',
      role: 'member',
    });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.equal(data.team_id, team.id);
    assert.equal(data.user_id, 'test-user-123');
    assert.equal(data.role, 'member');
  });

  it('POST /api/teams/:id/invite creates an invite', async () => {
    // First create a team
    const teamRes = await httpPost(`http://localhost:${port}/api/teams`, {
      name: 'Invite Test',
    });
    const team = JSON.parse(teamRes.data);

    // Create invite
    const res = await httpPost(`http://localhost:${port}/api/teams/${team.id}/invite`, {
      role: 'viewer',
      uses: 5,
    });
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(data.id, 'Should have invite id');
    assert.ok(data.code, 'Should have invite code');
    assert.equal(data.team_id, team.id);
    assert.equal(data.role, 'viewer');
    assert.equal(data.uses_remaining, 5);
  });

  it('GET /api/teams lists created teams', async () => {
    const res = await httpGet(`http://localhost:${port}/api/teams`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 1, 'Should have at least one team from previous tests');
    // Check that teams have memberCount
    const team = data.find(t => t.name === 'Test Team');
    if (team) {
      assert.ok('memberCount' in team, 'Should have memberCount');
    }
  });
});
