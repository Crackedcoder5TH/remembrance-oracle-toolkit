const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { GitHubApp, webhookRoutes, setupGitHubApp } = require('../src/github/app');

// ─── Generate a test RSA key pair ───

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_APP_ID = '12345';
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-abc123';

// ─── Mock helpers ───

function mockReq(options = {}) {
  const { method = 'GET', url = '/', headers = {}, body = '' } = options;
  const req = {
    method,
    url,
    headers: { ...headers },
    _listeners: {},
    on(event, cb) {
      this._listeners[event] = cb;
      return this;
    },
    emit(event, data) {
      if (this._listeners[event]) this._listeners[event](data);
    },
    simulateBody(content) {
      if (this._listeners['data']) this._listeners['data'](content);
      if (this._listeners['end']) this._listeners['end']();
    },
  };
  return req;
}

function mockRes() {
  const res = {
    statusCode: 200,
    _headers: {},
    body: '',
    setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
    writeHead(code, headers) {
      this.statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          this._headers[k.toLowerCase()] = v;
        }
      }
    },
    end(body) { this.body = body || ''; },
  };
  return res;
}

function computeSignature(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ─── GitHubApp Construction ───

describe('GitHubApp construction', () => {
  it('reads from options', () => {
    const app = new GitHubApp({
      appId: '999',
      privateKey: 'fake-key',
      webhookSecret: 'my-secret',
      clientId: 'client-1',
      clientSecret: 'secret-1',
    });

    assert.equal(app.appId, '999');
    assert.equal(app.privateKey, 'fake-key');
    assert.equal(app.webhookSecret, 'my-secret');
    assert.equal(app.clientId, 'client-1');
    assert.equal(app.clientSecret, 'secret-1');
  });

  it('reads from env vars', () => {
    const origAppId = process.env.GITHUB_APP_ID;
    const origKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const origSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
    const origClientId = process.env.GITHUB_APP_CLIENT_ID;
    const origClientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

    try {
      process.env.GITHUB_APP_ID = 'env-app-id';
      process.env.GITHUB_APP_PRIVATE_KEY = 'env-private-key';
      process.env.GITHUB_APP_WEBHOOK_SECRET = 'env-secret';
      process.env.GITHUB_APP_CLIENT_ID = 'env-client-id';
      process.env.GITHUB_APP_CLIENT_SECRET = 'env-client-secret';

      const app = new GitHubApp();
      assert.equal(app.appId, 'env-app-id');
      assert.equal(app.privateKey, 'env-private-key');
      assert.equal(app.webhookSecret, 'env-secret');
      assert.equal(app.clientId, 'env-client-id');
      assert.equal(app.clientSecret, 'env-client-secret');
    } finally {
      // Restore original env
      if (origAppId === undefined) delete process.env.GITHUB_APP_ID;
      else process.env.GITHUB_APP_ID = origAppId;
      if (origKey === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY;
      else process.env.GITHUB_APP_PRIVATE_KEY = origKey;
      if (origSecret === undefined) delete process.env.GITHUB_APP_WEBHOOK_SECRET;
      else process.env.GITHUB_APP_WEBHOOK_SECRET = origSecret;
      if (origClientId === undefined) delete process.env.GITHUB_APP_CLIENT_ID;
      else process.env.GITHUB_APP_CLIENT_ID = origClientId;
      if (origClientSecret === undefined) delete process.env.GITHUB_APP_CLIENT_SECRET;
      else process.env.GITHUB_APP_CLIENT_SECRET = origClientSecret;
    }
  });

  it('options override env vars', () => {
    const origAppId = process.env.GITHUB_APP_ID;
    try {
      process.env.GITHUB_APP_ID = 'from-env';
      const app = new GitHubApp({ appId: 'from-options' });
      assert.equal(app.appId, 'from-options');
    } finally {
      if (origAppId === undefined) delete process.env.GITHUB_APP_ID;
      else process.env.GITHUB_APP_ID = origAppId;
    }
  });

  it('defaults to null when no options or env vars', () => {
    const origAppId = process.env.GITHUB_APP_ID;
    const origKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const origSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;
    const origClientId = process.env.GITHUB_APP_CLIENT_ID;
    const origClientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
    try {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_PRIVATE_KEY;
      delete process.env.GITHUB_APP_WEBHOOK_SECRET;
      delete process.env.GITHUB_APP_CLIENT_ID;
      delete process.env.GITHUB_APP_CLIENT_SECRET;

      const app = new GitHubApp();
      assert.equal(app.appId, null);
      assert.equal(app.privateKey, null);
      assert.equal(app.webhookSecret, null);
      assert.equal(app.clientId, null);
      assert.equal(app.clientSecret, null);
    } finally {
      if (origAppId !== undefined) process.env.GITHUB_APP_ID = origAppId;
      if (origKey !== undefined) process.env.GITHUB_APP_PRIVATE_KEY = origKey;
      if (origSecret !== undefined) process.env.GITHUB_APP_WEBHOOK_SECRET = origSecret;
      if (origClientId !== undefined) process.env.GITHUB_APP_CLIENT_ID = origClientId;
      if (origClientSecret !== undefined) process.env.GITHUB_APP_CLIENT_SECRET = origClientSecret;
    }
  });
});

// ─── JWT Generation ───

describe('JWT generation', () => {
  it('generateJWT() returns valid JWT format (3 dot-separated base64url segments)', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });
    const jwt = app.generateJWT();

    const parts = jwt.split('.');
    assert.equal(parts.length, 3, 'JWT must have 3 segments');

    // Each segment should be valid base64url (no =, +, /)
    for (const part of parts) {
      assert.ok(part.length > 0, 'Each JWT segment must be non-empty');
      assert.ok(!/[=+/]/.test(part), 'JWT segments must be base64url encoded (no =, +, /)');
    }
  });

  it('JWT header has alg: RS256', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });
    const jwt = app.generateJWT();

    const headerB64 = jwt.split('.')[0];
    // Restore base64 padding for decoding
    const padded = headerB64.replace(/-/g, '+').replace(/_/g, '/');
    const header = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));

    assert.equal(header.alg, 'RS256');
    assert.equal(header.typ, 'JWT');
  });

  it('JWT payload has iss (app ID) and exp', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });
    const jwt = app.generateJWT();

    const payloadB64 = jwt.split('.')[1];
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));

    assert.equal(payload.iss, TEST_APP_ID);
    assert.ok(typeof payload.exp === 'number', 'exp must be a number');
    assert.ok(typeof payload.iat === 'number', 'iat must be a number');
    assert.ok(payload.exp > payload.iat, 'exp must be after iat');
  });

  it('throws when appId is not configured', () => {
    const app = new GitHubApp({ privateKey });
    app.appId = null;
    assert.throws(
      () => app.generateJWT(),
      (err) => err.message.includes('App ID not configured')
    );
  });

  it('throws when privateKey is not configured', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID });
    app.privateKey = null;
    assert.throws(
      () => app.generateJWT(),
      (err) => err.message.includes('private key not configured')
    );
  });

  it('JWT signature is verifiable with the public key', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });
    const jwt = app.generateJWT();

    const parts = jwt.split('.');
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signatureB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const pad = 4 - (signatureB64.length % 4);
    const paddedSig = pad < 4 ? signatureB64 + '='.repeat(pad) : signatureB64;
    const signature = Buffer.from(paddedSig, 'base64');

    const isValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      publicKey,
      signature
    );
    assert.equal(isValid, true, 'JWT signature should verify with the public key');
  });
});

// ─── Installation Tracking ───

describe('Installation tracking', () => {
  it('handleInstallation() tracks created events', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });

    const result = app.handleInstallation({
      action: 'created',
      installation: {
        id: 100,
        account: { login: 'test-org' },
        app_slug: 'remembrance-oracle',
        permissions: { contents: 'read' },
        repository_selection: 'all',
      },
    });

    assert.equal(result.action, 'created');
    assert.equal(result.installationId, 100);
    assert.equal(result.account, 'test-org');
    assert.equal(app._installations.size, 1);
    assert.ok(app._installations.has('100'));

    const stored = app._installations.get('100');
    assert.equal(stored.account, 'test-org');
    assert.equal(stored.appSlug, 'remembrance-oracle');
  });

  it('handleInstallation() removes deleted events', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });

    // Create first
    app.handleInstallation({
      action: 'created',
      installation: {
        id: 200,
        account: { login: 'org-to-delete' },
      },
    });
    assert.equal(app._installations.size, 1);

    // Delete
    const result = app.handleInstallation({
      action: 'deleted',
      installation: {
        id: 200,
        account: { login: 'org-to-delete' },
      },
    });

    assert.equal(result.action, 'deleted');
    assert.equal(result.installationId, 200);
    assert.equal(app._installations.size, 0);
    assert.ok(!app._installations.has('200'));
  });

  it('deleted event also clears token cache', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });

    // Simulate a cached token
    app._tokenCache.set('300', { token: 'cached-token', expiresAt: Date.now() + 600000 });
    app._installations.set('300', { id: 300, account: 'cached-org' });

    app.handleInstallation({
      action: 'deleted',
      installation: {
        id: 300,
        account: { login: 'cached-org' },
      },
    });

    assert.equal(app._tokenCache.size, 0);
    assert.equal(app._installations.size, 0);
  });

  it('getStatus() reflects installation count', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });

    app.handleInstallation({
      action: 'created',
      installation: { id: 400, account: { login: 'org-a' } },
    });
    app.handleInstallation({
      action: 'created',
      installation: { id: 401, account: { login: 'org-b' } },
    });

    const status = app.getStatus();
    assert.equal(status.installations, 2);
    assert.equal(status.configured, true);
    assert.equal(status.appId, TEST_APP_ID);
  });
});

// ─── Webhook Signature Verification ───

describe('Webhook signature verification', () => {
  it('valid signature passes verification', (_, done) => {
    const app = new GitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      webhookSecret: TEST_WEBHOOK_SECRET,
    });

    const payload = JSON.stringify({ action: 'created', installation: { id: 1, account: { login: 'test' } } });
    const signature = computeSignature(TEST_WEBHOOK_SECRET, payload);

    const req = mockReq({
      method: 'POST',
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'installation',
        'content-type': 'application/json',
      },
    });
    const res = mockRes();

    const origEnd = res.end.bind(res);
    res.end = (body) => {
      origEnd(body);
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.received, true);
      assert.equal(data.event, 'installation');
      done();
    };

    app.handleWebhook(req, res);
    req.simulateBody(payload);
  });

  it('invalid signature returns 401', (_, done) => {
    const app = new GitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      webhookSecret: TEST_WEBHOOK_SECRET,
    });

    const payload = JSON.stringify({ action: 'created' });
    const badSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

    const req = mockReq({
      method: 'POST',
      headers: {
        'x-hub-signature-256': badSignature,
        'x-github-event': 'push',
        'content-type': 'application/json',
      },
    });
    const res = mockRes();

    const origEnd = res.end.bind(res);
    res.end = (body) => {
      origEnd(body);
      assert.equal(res.statusCode, 401);
      const data = JSON.parse(res.body);
      assert.ok(data.error.includes('Invalid signature'));
      done();
    };

    app.handleWebhook(req, res);
    req.simulateBody(payload);
  });

  it('missing signature returns 401', (_, done) => {
    const app = new GitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      webhookSecret: TEST_WEBHOOK_SECRET,
    });

    const payload = JSON.stringify({ action: 'created' });

    const req = mockReq({
      method: 'POST',
      headers: {
        'x-github-event': 'push',
        'content-type': 'application/json',
      },
    });
    const res = mockRes();

    const origEnd = res.end.bind(res);
    res.end = (body) => {
      origEnd(body);
      assert.equal(res.statusCode, 401);
      const data = JSON.parse(res.body);
      assert.ok(data.error.includes('Missing signature'));
      done();
    };

    app.handleWebhook(req, res);
    req.simulateBody(payload);
  });

  it('passes when no webhook secret is configured (skips verification)', (_, done) => {
    const app = new GitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      webhookSecret: null,
    });

    const payload = JSON.stringify({ action: 'opened', installation: { id: 5, account: { login: 'x' } } });

    const req = mockReq({
      method: 'POST',
      headers: {
        'x-github-event': 'installation',
        'content-type': 'application/json',
      },
    });
    const res = mockRes();

    const origEnd = res.end.bind(res);
    res.end = (body) => {
      origEnd(body);
      assert.equal(res.statusCode, 200);
      done();
    };

    app.handleWebhook(req, res);
    req.simulateBody(payload);
  });
});

// ─── webhookRoutes ───

describe('webhookRoutes', () => {
  it('returns false for non-matching routes', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });
    const routes = webhookRoutes(app);

    const req = mockReq({ method: 'GET', url: '/api/other' });
    const res = mockRes();
    const handled = routes(req, res, '/api/other', 'GET');
    assert.equal(handled, false);
  });

  it('GET /api/github/status returns app info', () => {
    const app = new GitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      webhookSecret: TEST_WEBHOOK_SECRET,
    });
    const routes = webhookRoutes(app);

    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    const handled = routes(req, res, '/api/github/status', 'GET');

    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.configured, true);
    assert.equal(data.appId, TEST_APP_ID);
    assert.equal(data.hasWebhookSecret, true);
    assert.equal(typeof data.installations, 'number');
  });

  it('POST /api/github/webhook with valid signature processes event', (_, done) => {
    const app = new GitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      webhookSecret: TEST_WEBHOOK_SECRET,
    });
    const routes = webhookRoutes(app);

    const payload = JSON.stringify({
      action: 'created',
      installation: { id: 500, account: { login: 'webhook-test-org' } },
    });
    const signature = computeSignature(TEST_WEBHOOK_SECRET, payload);

    const req = mockReq({
      method: 'POST',
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'installation',
        'content-type': 'application/json',
      },
    });
    const res = mockRes();

    const origEnd = res.end.bind(res);
    res.end = (body) => {
      origEnd(body);
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.equal(data.received, true);
      assert.equal(data.event, 'installation');
      assert.equal(data.action, 'created');
      done();
    };

    const handled = routes(req, res, '/api/github/webhook', 'POST');
    assert.equal(handled, true);
    req.simulateBody(payload);
  });

  it('handles CORS OPTIONS request', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });
    const routes = webhookRoutes(app);

    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    const handled = routes(req, res, '/api/github/webhook', 'OPTIONS');

    assert.equal(handled, true);
    assert.equal(res.statusCode, 204);
  });

  it('returns false for non-github API paths', () => {
    const app = new GitHubApp({ appId: TEST_APP_ID, privateKey });
    const routes = webhookRoutes(app);

    const req = mockReq({ method: 'GET' });
    const res = mockRes();

    assert.equal(routes(req, res, '/api/patterns', 'GET'), false);
    assert.equal(routes(req, res, '/', 'GET'), false);
    assert.equal(routes(req, res, '/health', 'GET'), false);
  });
});

// ─── setupGitHubApp ───

describe('setupGitHubApp', () => {
  it('returns app and routes', () => {
    const result = setupGitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      webhookSecret: TEST_WEBHOOK_SECRET,
    });

    assert.ok(result.app instanceof GitHubApp);
    assert.equal(typeof result.routes, 'function');
    assert.equal(result.app.appId, TEST_APP_ID);
    assert.equal(result.app.webhookSecret, TEST_WEBHOOK_SECRET);
  });

  it('routes returned by setupGitHubApp work correctly', () => {
    const { app, routes } = setupGitHubApp({
      appId: TEST_APP_ID,
      privateKey,
    });

    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    const handled = routes(req, res, '/api/github/status', 'GET');

    assert.equal(handled, true);
    const data = JSON.parse(res.body);
    assert.equal(data.appId, TEST_APP_ID);
    assert.equal(data.configured, true);
  });

  it('accepts oracle option', () => {
    const fakeOracle = { search: () => [], stats: () => ({}) };
    const { app } = setupGitHubApp({
      appId: TEST_APP_ID,
      privateKey,
      oracle: fakeOracle,
    });

    assert.equal(app.oracle, fakeOracle);
    const status = app.getStatus();
    assert.equal(status.hasOracle, true);
  });
});
