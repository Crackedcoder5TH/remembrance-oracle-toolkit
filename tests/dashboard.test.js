const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createDashboardServer, getDashboardHTML } = require('../src/dashboard/server');

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

  it('starts server and serves HTML', async () => {
    server = createDashboardServer();
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

  after(() => {
    if (server) server.close();
  });
});

describe('getDashboardHTML', () => {
  it('returns valid HTML', () => {
    const html = getDashboardHTML();
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Remembrance Oracle'));
    assert.ok(html.includes('</html>'));
  });
});
