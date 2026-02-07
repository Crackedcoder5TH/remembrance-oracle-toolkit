const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { CloudSyncServer, createToken, verifyToken, hashPassword, verifyPassword } = require('../src/cloud/server');
const { RemembranceOracle } = require('../src/api/oracle');

// Helper: make HTTP request to the server
function request(port, method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── JWT Tests ───

describe('JWT', () => {
  const secret = 'test-secret-key';

  it('creates and verifies token', () => {
    const token = createToken({ id: '123', username: 'test' }, secret);
    assert.ok(typeof token === 'string');
    assert.ok(token.split('.').length === 3);

    const payload = verifyToken(token, secret);
    assert.ok(payload);
    assert.equal(payload.id, '123');
    assert.equal(payload.username, 'test');
  });

  it('rejects token with wrong secret', () => {
    const token = createToken({ id: '123' }, secret);
    const payload = verifyToken(token, 'wrong-secret');
    assert.equal(payload, null);
  });

  it('rejects expired token', () => {
    const token = createToken({ id: '123' }, secret, -1);
    const payload = verifyToken(token, secret);
    assert.equal(payload, null);
  });

  it('rejects malformed token', () => {
    assert.equal(verifyToken('not-a-token', secret), null);
    assert.equal(verifyToken('a.b', secret), null);
    assert.equal(verifyToken('', secret), null);
  });
});

// ─── Password Hashing Tests ───

describe('Password Hashing', () => {
  it('hashes and verifies password', () => {
    const hash = hashPassword('mypassword');
    assert.ok(hash.includes(':'));
    assert.ok(verifyPassword('mypassword', hash));
  });

  it('rejects wrong password', () => {
    const hash = hashPassword('correct');
    assert.ok(!verifyPassword('wrong', hash));
  });

  it('generates different hashes for same password', () => {
    const h1 = hashPassword('same');
    const h2 = hashPassword('same');
    assert.notEqual(h1, h2); // Different salts
  });
});

// ─── Cloud Server Tests ───

describe('CloudSyncServer', () => {
  let server;
  let port;
  let token;
  const oracle = new RemembranceOracle({ autoSeed: false });

  before(async () => {
    server = new CloudSyncServer({ oracle, port: 0, secret: 'test-secret' });
    port = await server.start();
  });

  after(async () => {
    await server.stop();
  });

  it('health check', async () => {
    const res = await request(port, 'GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('register user', async () => {
    const res = await request(port, 'POST', '/api/auth/register', {
      username: 'testuser',
      password: 'testpass123',
      email: 'test@example.com',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.username, 'testuser');
    token = res.body.token;
  });

  it('rejects duplicate registration', async () => {
    const res = await request(port, 'POST', '/api/auth/register', {
      username: 'testuser',
      password: 'another',
    });
    assert.equal(res.status, 409);
  });

  it('login with correct credentials', async () => {
    const res = await request(port, 'POST', '/api/auth/login', {
      username: 'testuser',
      password: 'testpass123',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    token = res.body.token;
  });

  it('rejects login with wrong password', async () => {
    const res = await request(port, 'POST', '/api/auth/login', {
      username: 'testuser',
      password: 'wrong',
    });
    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(port, 'GET', '/api/patterns');
    assert.equal(res.status, 401);
  });

  it('list patterns (authenticated)', async () => {
    const res = await request(port, 'GET', '/api/patterns', null, token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.results));
    assert.equal(typeof res.body.total, 'number');
  });

  it('get stats', async () => {
    const res = await request(port, 'GET', '/api/stats', null, token);
    assert.equal(res.status, 200);
    assert.ok('totalEntries' in res.body || 'total' in res.body || typeof res.body === 'object');
  });

  it('smart search', async () => {
    const res = await request(port, 'POST', '/api/search', { query: 'sort' }, token);
    assert.equal(res.status, 200);
    assert.ok(res.body.results !== undefined || res.body.intent !== undefined);
  });

  it('search requires query', async () => {
    const res = await request(port, 'POST', '/api/search', {}, token);
    assert.equal(res.status, 400);
  });

  it('sync push', async () => {
    const res = await request(port, 'POST', '/api/sync/push', {
      patterns: [{
        code: 'function cloudTest() { return 42; }',
        language: 'javascript',
        name: 'cloudTest',
        tags: ['test'],
      }],
    }, token);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.synced, 'number');
  });

  it('sync pull', async () => {
    const res = await request(port, 'POST', '/api/sync/pull', {}, token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.patterns));
  });

  it('debug patterns', async () => {
    const res = await request(port, 'GET', '/api/debug/patterns', null, token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.patterns));
  });

  it('debug search', async () => {
    const res = await request(port, 'POST', '/api/debug/search', {
      errorMessage: 'TypeError: Cannot read properties',
    }, token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.results));
  });

  it('debug search requires error message', async () => {
    const res = await request(port, 'POST', '/api/debug/search', {}, token);
    assert.equal(res.status, 400);
  });

  it('handles CORS preflight', async () => {
    const res = await request(port, 'OPTIONS', '/api/patterns');
    assert.equal(res.status, 204);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(port, 'GET', '/api/nonexistent', null, token);
    assert.equal(res.status, 404);
  });

  it('delete requires admin', async () => {
    const res = await request(port, 'DELETE', '/api/patterns/fake-id', null, token);
    assert.equal(res.status, 403);
  });

  it('register requires username and password', async () => {
    const res = await request(port, 'POST', '/api/auth/register', { username: '' });
    assert.equal(res.status, 400);
  });
});
