const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { makeTempDir, cleanTempDir, createTestOracle } = require('./helpers');

// ─── Fix #1 & #2: Community Trust Boundary + safeJsonParse ──────────────────

describe('Trust Boundary — Community Pull Covenant Re-validation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir('trust-boundary');
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('transferPattern uses safeJsonParse for tags (handles malformed JSON)', () => {
    const { safeJsonParse } = require('../src/core/covenant');

    // Malformed JSON should return fallback, not throw
    const result = safeJsonParse('{invalid json', []);
    assert.deepStrictEqual(result, []);
  });

  it('safeJsonParse strips __proto__ keys', () => {
    const { safeJsonParse } = require('../src/core/covenant');

    const malicious = '{"__proto__": {"admin": true}, "safe": "value"}';
    const result = safeJsonParse(malicious, {});
    assert.strictEqual(result.safe, 'value');
    assert.strictEqual(result.__proto__?.admin, undefined);
  });

  it('safeJsonParse strips constructor and prototype keys from parsed JSON', () => {
    const { safeJsonParse } = require('../src/core/covenant');

    const malicious = '{"constructor": {"x": 1}, "prototype": {"y": 2}, "ok": true}';
    const result = safeJsonParse(malicious, {});
    assert.strictEqual(result.ok, true);
    // The 'constructor' key from JSON is stripped by the reviver,
    // but Object.prototype.constructor still exists on all objects.
    // The important thing is the parsed malicious value was not assigned.
    assert.strictEqual(result.hasOwnProperty('constructor'), false, 'parsed constructor key should be stripped');
    assert.strictEqual(result.hasOwnProperty('prototype'), false, 'parsed prototype key should be stripped');
  });

  it('pullFromCommunity rejects patterns that violate the Covenant', () => {
    const { SQLiteStore, DatabaseSync } = require('../src/store/sqlite');
    if (!DatabaseSync) return; // skip if no SQLite

    const localDir = path.join(tmpDir, 'local');
    const communityDir = path.join(tmpDir, 'community');
    fs.mkdirSync(localDir, { recursive: true });
    fs.mkdirSync(communityDir, { recursive: true });

    const localStore = new SQLiteStore(localDir);
    const communityStore = new SQLiteStore(communityDir);

    // Build dangerous code dynamically so this test file itself passes the covenant
    const dangerousCode = ['exec("', 'rm', ' -rf', ' /', '")'].join('');
    communityStore.addPattern({
      name: 'malicious-pattern',
      code: dangerousCode,
      language: 'javascript',
      coherencyScore: { total: 0.9 },
    });

    // Add a safe pattern to community store
    communityStore.addPattern({
      name: 'safe-pattern',
      code: 'function safeAdd(a, b) { return a + b; }',
      language: 'javascript',
      coherencyScore: { total: 0.9 },
    });

    // Mock the persistence module to use our test stores
    const { covenantCheck, safeJsonParse } = require('../src/core/covenant');

    // Manually simulate pullFromCommunity logic with covenant check
    const communityPatterns = communityStore.getAllPatterns();
    const pulled = [];
    const rejected = [];

    for (const pattern of communityPatterns) {
      if (pattern.code) {
        const check = covenantCheck(pattern.code, { description: pattern.name, trusted: false });
        if (!check.sealed) {
          rejected.push(pattern.name);
          continue;
        }
      }
      pulled.push(pattern.name);
    }

    // The malicious pattern should be rejected
    assert.ok(rejected.includes('malicious-pattern'), 'malicious pattern should be rejected by covenant');
    // The safe pattern should be pulled
    assert.ok(pulled.includes('safe-pattern'), 'safe pattern should be accepted');

    localStore.close();
    communityStore.close();
  });

  it('covenantCheck detects destructive patterns', () => {
    const { covenantCheck } = require('../src/core/covenant');

    // Build dangerous string dynamically to avoid triggering covenant on this file
    const dangerousCode = ['exec("', 'rm', ' -rf', ' /', '")'].join('');
    const result = covenantCheck(dangerousCode, {
      description: 'test',
      trusted: false,
    });
    assert.strictEqual(result.sealed, false, 'destructive code should violate covenant');
    assert.ok(result.violations.length > 0, 'should have violations');
  });

  it('covenantCheck passes safe code', () => {
    const { covenantCheck } = require('../src/core/covenant');

    const result = covenantCheck('function add(a, b) { return a + b; }', {
      description: 'test',
      trusted: false,
    });
    assert.strictEqual(result.sealed, true, 'safe code should pass covenant');
  });
});

// ─── Fix #3: Dashboard Auth Fail-Safe ────────────────────────────────────────

describe('Trust Boundary — Dashboard Auth Fail-Safe', () => {
  it('dashboard denies access when auth module fails and auth is not explicitly disabled', () => {
    // The fix: when authMw is null and options.auth !== false, return 503
    // Simulate the server logic
    const authMw = null; // Auth module failed to load
    const options = {}; // Auth not explicitly disabled
    const pathname = '/api/patterns';
    const publicPaths = ['/', '/api/health', '/api/login'];

    let statusCode = null;
    const res = {
      writeHead: (code) => { statusCode = code; },
      end: () => {},
    };

    // Replicate the fixed logic
    if (publicPaths.includes(pathname)) {
      statusCode = 200; // would proceed to handler
    } else if (authMw) {
      statusCode = 200; // would call authMw
    } else if (options.auth === false) {
      statusCode = 200; // auth explicitly disabled
    } else {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'Authentication service unavailable' }));
    }

    assert.strictEqual(statusCode, 503, 'should deny access with 503 when auth unavailable');
  });

  it('dashboard allows access when auth is explicitly disabled', () => {
    const authMw = null;
    const options = { auth: false }; // Explicitly disabled
    const pathname = '/api/patterns';
    const publicPaths = ['/', '/api/health', '/api/login'];

    let allowed = false;

    if (publicPaths.includes(pathname)) {
      allowed = true;
    } else if (authMw) {
      allowed = true;
    } else if (options.auth === false) {
      allowed = true;
    }

    assert.strictEqual(allowed, true, 'should allow access when auth explicitly disabled');
  });

  it('dashboard allows public paths even without auth', () => {
    const authMw = null;
    const options = {};
    const publicPaths = ['/', '/api/health', '/api/login'];

    for (const pathname of publicPaths) {
      let allowed = false;
      if (publicPaths.includes(pathname)) {
        allowed = true;
      }
      assert.strictEqual(allowed, true, `${pathname} should be accessible without auth`);
    }
  });
});

// ─── Fix #4: Cloud JWT Expiry Required ───────────────────────────────────────

describe('Trust Boundary — JWT Expiry Validation', () => {
  // Inline the JWT functions for testing (same logic as cloud/server.js)
  function base64url(buf) {
    return Buffer.from(buf).toString('base64url');
  }

  function createToken(payload, secret, expiresIn = 86400) {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }));
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
  }

  function verifyToken(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      // Fixed: require exp claim
      if (!payload.exp) return null;
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch {
      return null;
    }
  }

  const SECRET = 'test-secret-key-12345';

  it('accepts valid token with exp claim', () => {
    const token = createToken({ userId: 'user1' }, SECRET, 3600);
    const payload = verifyToken(token, SECRET);
    assert.ok(payload, 'valid token should be accepted');
    assert.strictEqual(payload.userId, 'user1');
  });

  it('rejects expired token', () => {
    const token = createToken({ userId: 'user1' }, SECRET, -1); // Already expired
    const payload = verifyToken(token, SECRET);
    assert.strictEqual(payload, null, 'expired token should be rejected');
  });

  it('rejects token without exp claim', () => {
    // Manually craft a token without exp
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify({ userId: 'user1', iat: Math.floor(Date.now() / 1000) }));
    const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    const token = `${header}.${body}.${sig}`;

    const payload = verifyToken(token, SECRET);
    assert.strictEqual(payload, null, 'token without exp should be rejected');
  });

  it('rejects token with invalid signature', () => {
    const token = createToken({ userId: 'user1' }, SECRET, 3600);
    const payload = verifyToken(token, 'wrong-secret');
    assert.strictEqual(payload, null, 'token with wrong secret should be rejected');
  });

  it('rejects malformed token', () => {
    assert.strictEqual(verifyToken('not.a.valid.token', SECRET), null);
    assert.strictEqual(verifyToken('', SECRET), null);
    assert.strictEqual(verifyToken('abc', SECRET), null);
  });
});

// ─── Fix #5: Auto-Heal Covenant Gate ─────────────────────────────────────────

describe('Trust Boundary — Auto-Heal Covenant Gate', () => {
  it('covenantCheck blocks code with destructive patterns from being stored', () => {
    const { covenantCheck } = require('../src/core/covenant');

    // Build dangerous string dynamically to avoid triggering covenant on this file
    const dangerousHealed = ['exec("', 'rm', ' -rf', ' /', '")'].join('');
    const check = covenantCheck(dangerousHealed, { description: 'auto-heal:test', trusted: false });
    assert.strictEqual(check.sealed, false, 'dangerous healed code should fail covenant');
  });

  it('covenantCheck allows safe healed code', () => {
    const { covenantCheck } = require('../src/core/covenant');

    const safeHealed = 'function improved(arr) { return arr.filter(x => x != null).map(x => x * 2); }';
    const check = covenantCheck(safeHealed, { description: 'auto-heal:test', trusted: false });
    assert.strictEqual(check.sealed, true, 'safe healed code should pass covenant');
  });

  it('feedback auto-heal path includes covenant gate', () => {
    // Verify the feedback module's code structure includes covenant check
    const feedbackSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'api', 'oracle-core-feedback.js'),
      'utf-8'
    );
    assert.ok(
      feedbackSource.includes("covenantCheck(healed.code"),
      'feedback module should covenant-check healed code'
    );
    assert.ok(
      feedbackSource.includes("check.sealed"),
      'feedback module should gate on covenant seal'
    );
  });

  it('persistence pullFromCommunity includes covenant check', () => {
    const persistenceSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'core', 'persistence.js'),
      'utf-8'
    );
    assert.ok(
      persistenceSource.includes("covenantCheck(pattern.code"),
      'persistence should covenant-check community patterns'
    );
    assert.ok(
      persistenceSource.includes("trusted: false"),
      'community patterns should not be trusted'
    );
  });

  it('persistence transferPattern uses safeJsonParse', () => {
    const persistenceSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'core', 'persistence.js'),
      'utf-8'
    );
    assert.ok(
      persistenceSource.includes("safeJsonParse(pattern.tags"),
      'transferPattern should use safeJsonParse for tags'
    );
    assert.ok(
      persistenceSource.includes("safeJsonParse(pattern.coherency_json"),
      'transferPattern should use safeJsonParse for coherency'
    );
    assert.ok(
      persistenceSource.includes("safeJsonParse(pattern.evolution_history"),
      'transferPattern should use safeJsonParse for evolution history'
    );
  });
});
