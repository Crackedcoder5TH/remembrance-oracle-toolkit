'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

// Minimal test that verifies the new route handlers exist and respond correctly.
// We import createRouteHandler and wire up a tiny server.

describe('API Endpoints — submit, resolve, register, feedback', () => {
  let server;
  let port;

  // Mock oracle instance with the methods our routes call
  const mockOracle = {
    submit: (code, meta) => ({ success: true, accepted: true, code: code.slice(0, 20), meta }),
    resolve: (req) => ({ decision: 'generate', confidence: 0.5, description: req.description }),
    registerPattern: (pat) => ({ success: true, registered: true, name: pat.name }),
    feedback: (id, success) => ({ success: true, id, succeeded: success, newReliability: 0.85 }),
    search: () => [],
    stats: () => ({ total: 0 }),
    patternStats: () => ({ total: 0 }),
    patterns: { getAll: () => [] },
    store: { getAll: () => [], getSQLiteStore: () => null },
  };

  before(async () => {
    const { createRouteHandler } = require('../src/dashboard/routes');
    const { URL } = require('url');

    const handler = createRouteHandler(mockOracle, {
      authManager: null,
      versionManager: null,
      wsServer: null,
      getDashboardHTML: () => '<html></html>',
    });

    server = http.createServer((req, res) => {
      const parsed = new URL(req.url, `http://localhost`);
      const pathname = parsed.pathname;
      parsed.query = Object.fromEntries(parsed.searchParams.entries());
      handler(req, res, parsed, pathname);
    });

    await new Promise(resolve => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  function makeRequest(method, path, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  it('POST /api/submit — accepts code', async () => {
    const res = await makeRequest('POST', '/api/submit', {
      code: 'function hello() { return "world"; }',
      language: 'javascript',
      description: 'test function',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.accepted, true);
  });

  it('POST /api/submit — rejects missing code', async () => {
    const res = await makeRequest('POST', '/api/submit', { language: 'js' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('code'));
  });

  it('POST /api/resolve — returns decision', async () => {
    const res = await makeRequest('POST', '/api/resolve', {
      description: 'debounce function',
      tags: ['utility'],
      language: 'javascript',
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.decision);
    assert.strictEqual(res.body.description, 'debounce function');
  });

  it('POST /api/resolve — rejects missing description', async () => {
    const res = await makeRequest('POST', '/api/resolve', { tags: ['x'] });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('description'));
  });

  it('POST /api/register — registers pattern', async () => {
    const res = await makeRequest('POST', '/api/register', {
      name: 'test-pattern',
      code: 'function test() {}',
      language: 'javascript',
      description: 'A test pattern',
      tags: ['test'],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.name, 'test-pattern');
  });

  it('POST /api/register — rejects missing code', async () => {
    const res = await makeRequest('POST', '/api/register', { name: 'empty' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('code'));
  });

  it('POST /api/feedback — records feedback', async () => {
    const res = await makeRequest('POST', '/api/feedback', {
      id: 'test-id-123',
      success: true,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.id, 'test-id-123');
  });

  it('POST /api/feedback — rejects missing id', async () => {
    const res = await makeRequest('POST', '/api/feedback', { success: true });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('id'));
  });

  it('POST /api/feedback — rejects non-boolean success', async () => {
    const res = await makeRequest('POST', '/api/feedback', { id: 'x', success: 'yes' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('success'));
  });

  it('GET /api/health — still works', async () => {
    const res = await makeRequest('GET', '/api/health');
    assert.strictEqual(res.status, 200);
  });
});
