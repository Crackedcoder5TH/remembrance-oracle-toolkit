'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

describe('OracleClient', () => {
  let server;
  let port;

  before(async () => {
    // Tiny mock Oracle server
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const pathname = url.pathname;

        // Check auth header
        const auth = req.headers['authorization'];

        res.setHeader('Content-Type', 'application/json');

        if (pathname === '/api/health') {
          res.end(JSON.stringify({ status: 'healthy' }));
        } else if (pathname === '/api/stats') {
          res.end(JSON.stringify({ total: 42 }));
        } else if (pathname === '/api/search') {
          const q = url.searchParams.get('q');
          res.end(JSON.stringify([{ name: 'result', query: q }]));
        } else if (pathname === '/api/resolve') {
          const parsed = JSON.parse(body);
          res.end(JSON.stringify({ decision: 'generate', description: parsed.description }));
        } else if (pathname === '/api/submit') {
          const parsed = JSON.parse(body);
          res.end(JSON.stringify({ success: true, code: parsed.code.slice(0, 10) }));
        } else if (pathname === '/api/register') {
          const parsed = JSON.parse(body);
          res.end(JSON.stringify({ success: true, name: parsed.name }));
        } else if (pathname === '/api/feedback') {
          const parsed = JSON.parse(body);
          res.end(JSON.stringify({ success: true, id: parsed.id }));
        } else if (pathname === '/api/covenant') {
          res.end(JSON.stringify({ passes: true, score: 0.95 }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });

    await new Promise(resolve => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(() => { server.close(); });

  it('health() returns status', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}`, apiKey: 'test-key' });
    const result = await client.health();
    assert.strictEqual(result.status, 'healthy');
  });

  it('stats() returns data', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}` });
    const result = await client.stats();
    assert.strictEqual(result.total, 42);
  });

  it('search() passes query params', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}` });
    const results = await client.search('debounce');
    assert.ok(Array.isArray(results));
    assert.strictEqual(results[0].query, 'debounce');
  });

  it('resolve() sends POST with description', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}` });
    const result = await client.resolve('test utility', { tags: ['util'] });
    assert.strictEqual(result.decision, 'generate');
    assert.strictEqual(result.description, 'test utility');
  });

  it('submit() sends code', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}` });
    const result = await client.submit('function x() {}', { language: 'js' });
    assert.strictEqual(result.success, true);
  });

  it('register() sends pattern', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}` });
    const result = await client.register({ name: 'my-pattern', code: 'x', language: 'js' });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.name, 'my-pattern');
  });

  it('feedback() sends id and success', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}` });
    const result = await client.feedback('abc', true);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.id, 'abc');
  });

  it('covenant() sends code', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: `http://localhost:${port}` });
    const result = await client.covenant('function x() {}');
    assert.strictEqual(result.passes, true);
  });

  it('handles connection errors gracefully', async () => {
    const { OracleClient } = require('../src/client/oracle-client');
    const client = new OracleClient({ baseUrl: 'http://localhost:1' }); // bad port
    await assert.rejects(() => client.health(), { message: /ECONNREFUSED|connect/ });
  });
});
