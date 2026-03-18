const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDashboardServer, getDashboardHTML } = require('../src/dashboard/server');
const { RemembranceOracle } = require('../src/api/oracle');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

describe('Dashboard', () => {
  let server;
  let port;
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'));
  });

  after(() => {
    if (server) {
      if (server.wsServer) server.wsServer.close?.();
      server.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts server and serves HTML', async () => {
    const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });
    server = createDashboardServer(oracle, { auth: false });
    await new Promise(resolve => server.listen(0, resolve));
    port = server.address().port;

    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    assert.ok(res.data.includes('Remembrance Oracle'));
    assert.ok(res.headers['content-type'].includes('text/html'));
  });

  it('serves /api/stats', async () => {
    const res = await fetch(`http://localhost:${port}/api/stats`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok('store' in data);
    assert.ok('patterns' in data);
  });

  it('serves /api/patterns', async () => {
    const res = await fetch(`http://localhost:${port}/api/patterns`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

  it('serves /api/search with query', async () => {
    const res = await fetch(`http://localhost:${port}/api/search?q=sort`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

  it('serves /api/search empty without query', async () => {
    const res = await fetch(`http://localhost:${port}/api/search`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.deepStrictEqual(data, []);
  });

  it('serves /api/nearest', async () => {
    const res = await fetch(`http://localhost:${port}/api/nearest?q=cache`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
  });

  it('serves /api/audit', async () => {
    const res = await fetch(`http://localhost:${port}/api/audit`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

  it('serves /api/entries', async () => {
    const res = await fetch(`http://localhost:${port}/api/entries`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

});

describe('getDashboardHTML', () => {
  it('returns valid HTML', () => {
    const html = getDashboardHTML();
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Remembrance Oracle'));
    assert.ok(html.includes('</html>'));
  });

  it('includes WebSocket client code', () => {
    const html = getDashboardHTML();
    assert.ok(html.includes('connectWS'));
    assert.ok(html.includes('ws-dot'));
    assert.ok(html.includes('WebSocket'));
  });

  it('includes toast notification system', () => {
    const html = getDashboardHTML();
    assert.ok(html.includes('showToast'));
    assert.ok(html.includes('toast'));
  });
});

describe('Dashboard server features', () => {
  let server;
  let port;
  let tmpDir2;

  before(() => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test2-'));
  });

  after(() => {
    if (server) {
      if (server.wsServer) server.wsServer.close?.();
      server.close();
    }
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });

  it('has broadcast method', () => {
    const oracle = new RemembranceOracle({ baseDir: tmpDir2, autoSeed: false });
    server = createDashboardServer(oracle, { auth: false });
    assert.ok(typeof server.broadcast === 'function');
  });

  it('has wsServer attached', async () => {
    await new Promise(resolve => server.listen(0, resolve));
    port = server.address().port;
    assert.ok(server.wsServer !== undefined);
  });

  it('serves /api/health', async () => {
    const res = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(['ok', 'healthy', 'degraded'].includes(data.status));
    assert.ok('wsClients' in data);
  });

  it('serves /api/versions (empty)', async () => {
    const res = await fetch(`http://localhost:${port}/api/versions?id=nonexistent`);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.data);
    assert.ok(Array.isArray(data));
  });

});
