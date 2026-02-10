const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  AuthManager,
  authMiddleware,
  ROLES,
  canWrite,
  canManageUsers,
  canRead,
  publicPaths,
} = require('../src/auth/auth');

// ─── Mock helpers ───

function mockReq(headers = {}, url = '/api/test') {
  return { headers, url };
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.writeHead = (code) => { res.statusCode = code; };
  res.end = (body) => { res.body = body; };
  return res;
}

// ─── AuthManager ───

describe('AuthManager', () => {
  let auth;

  beforeEach(() => {
    auth = new AuthManager();
  });

  it('creates with no args and uses memory backend', () => {
    // The constructor should succeed and have already bootstrapped the default admin
    const users = auth.listUsers();
    assert.ok(users.length >= 1, 'should have at least the default admin');
  });

  it('createUser returns id, username, role, and apiKey', () => {
    const user = auth.createUser('alice', 'password123', ROLES.CONTRIBUTOR);
    assert.ok(user.id, 'should have an id');
    assert.equal(user.username, 'alice');
    assert.equal(user.role, ROLES.CONTRIBUTOR);
    assert.ok(user.apiKey, 'should have an apiKey');
  });

  it('createUser throws on duplicate username', () => {
    auth.createUser('bob', 'pass1', ROLES.VIEWER);
    assert.throws(
      () => auth.createUser('bob', 'pass2', ROLES.VIEWER),
      (err) => err.message.includes('already exists')
    );
  });

  it('createUser throws on invalid role', () => {
    assert.throws(
      () => auth.createUser('charlie', 'pass', 'superuser'),
      (err) => err.message.includes('Invalid role')
    );
  });

  it('authenticate returns token and user for valid credentials', () => {
    auth.createUser('dana', 'secret', ROLES.CONTRIBUTOR);
    const result = auth.authenticate('dana', 'secret');
    assert.ok(result, 'should not be null');
    assert.ok(result.token, 'should have a token');
    assert.equal(result.user.username, 'dana');
    assert.equal(result.user.role, ROLES.CONTRIBUTOR);
  });

  it('authenticate returns null for wrong password', () => {
    auth.createUser('eve', 'correct', ROLES.VIEWER);
    const result = auth.authenticate('eve', 'wrong');
    assert.equal(result, null);
  });

  it('authenticate returns null for unknown user', () => {
    const result = auth.authenticate('nonexistent', 'anything');
    assert.equal(result, null);
  });

  it('validateToken returns user for valid token', () => {
    auth.createUser('frank', 'pass', ROLES.CONTRIBUTOR);
    const { token } = auth.authenticate('frank', 'pass');
    const user = auth.validateToken(token);
    assert.ok(user, 'should return user');
    assert.equal(user.username, 'frank');
  });

  it('validateToken returns null for invalid token', () => {
    const result = auth.validateToken('not-a-real-token');
    assert.equal(result, null);
  });

  it('validateApiKey returns user for valid API key', () => {
    const created = auth.createUser('grace', 'pass', ROLES.VIEWER);
    const user = auth.validateApiKey(created.apiKey);
    assert.ok(user, 'should return user');
    assert.equal(user.username, 'grace');
  });

  it('listUsers returns all users without passwords', () => {
    // Default admin is already present from beforeEach
    auth.createUser('hank', 'pass', ROLES.CONTRIBUTOR);
    auth.createUser('iris', 'pass', ROLES.VIEWER);
    const users = auth.listUsers();
    assert.ok(users.length >= 3, 'should have admin + 2 created users');
    for (const u of users) {
      assert.ok(u.id, 'each user should have id');
      assert.ok(u.username, 'each user should have username');
      assert.ok(u.role, 'each user should have role');
      assert.equal(u.password_hash, undefined, 'should not expose password_hash');
      assert.equal(u.salt, undefined, 'should not expose salt');
    }
  });

  it('updateRole changes the user role', () => {
    const created = auth.createUser('jack', 'pass', ROLES.VIEWER);
    const updated = auth.updateRole(created.id, ROLES.ADMIN);
    assert.ok(updated, 'should return updated user');
    assert.equal(updated.role, ROLES.ADMIN);
    // Confirm via getUser
    const fetched = auth.getUser(created.id);
    assert.equal(fetched.role, ROLES.ADMIN);
  });

  it('revokeApiKey generates a new key and old one stops working', () => {
    const created = auth.createUser('karen', 'pass', ROLES.CONTRIBUTOR);
    const oldKey = created.apiKey;

    const updated = auth.revokeApiKey(created.id);
    assert.ok(updated, 'should return updated user');
    assert.notEqual(updated.apiKey, oldKey, 'new key should differ from old key');

    // Old key no longer valid
    const oldResult = auth.validateApiKey(oldKey);
    assert.equal(oldResult, null, 'old API key should be invalid');

    // New key works
    const newResult = auth.validateApiKey(updated.apiKey);
    assert.ok(newResult, 'new API key should be valid');
    assert.equal(newResult.username, 'karen');
  });

  it('deleteUser removes the user and invalidates tokens', () => {
    const created = auth.createUser('leo', 'pass', ROLES.VIEWER);
    const { token } = auth.authenticate('leo', 'pass');

    // Verify token works before deletion
    assert.ok(auth.validateToken(token), 'token should work before delete');

    const deleted = auth.deleteUser(created.id);
    assert.equal(deleted, true);

    // User no longer findable
    assert.equal(auth.getUser(created.id), null);
    // Token invalidated
    assert.equal(auth.validateToken(token), null);
  });

  it('auto-creates default admin on first run', () => {
    // A fresh AuthManager with no users should create 'admin' automatically
    const fresh = new AuthManager();
    const users = fresh.listUsers();
    const admin = users.find((u) => u.username === 'admin');
    assert.ok(admin, 'default admin should exist');
    assert.equal(admin.role, ROLES.ADMIN);
  });
});

// ─── Permission helpers ───

describe('Permission helpers', () => {
  it('canWrite returns true for admin', () => {
    assert.equal(canWrite({ role: ROLES.ADMIN }), true);
  });

  it('canWrite returns true for contributor', () => {
    assert.equal(canWrite({ role: ROLES.CONTRIBUTOR }), true);
  });

  it('canWrite returns false for viewer', () => {
    assert.equal(canWrite({ role: ROLES.VIEWER }), false);
  });

  it('canManageUsers returns true only for admin', () => {
    assert.equal(canManageUsers({ role: ROLES.ADMIN }), true);
    assert.equal(canManageUsers({ role: ROLES.CONTRIBUTOR }), false);
    assert.equal(canManageUsers({ role: ROLES.VIEWER }), false);
  });

  it('canRead returns true for all valid roles', () => {
    assert.equal(canRead({ role: ROLES.ADMIN }), true);
    assert.equal(canRead({ role: ROLES.CONTRIBUTOR }), true);
    assert.equal(canRead({ role: ROLES.VIEWER }), true);
  });

  it('canRead returns false for null user', () => {
    assert.equal(canRead(null), false);
  });
});

// ─── authMiddleware ───

describe('authMiddleware', () => {
  let auth;
  let mw;

  beforeEach(() => {
    auth = new AuthManager();
    mw = authMiddleware(auth);
  });

  it('calls next with req.user set on valid Bearer token', (_, done) => {
    const created = auth.createUser('mia', 'pass', ROLES.CONTRIBUTOR);
    const { token } = auth.authenticate('mia', 'pass');

    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();

    mw(req, res, () => {
      assert.ok(req.user, 'req.user should be set');
      assert.equal(req.user.username, 'mia');
      done();
    });
  });

  it('returns 401 on invalid auth', () => {
    const req = mockReq({ authorization: 'Bearer invalid-token' });
    const res = mockRes();
    let nextCalled = false;

    mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'next should not be called');
    assert.equal(res.statusCode, 401);
    assert.ok(res.body.includes('Unauthorized'));
  });

  it('allows public paths through without auth', () => {
    for (const pubPath of publicPaths) {
      const req = mockReq({}, pubPath);
      const res = mockRes();
      let nextCalled = false;

      mw(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, true, `next should be called for public path ${pubPath}`);
      assert.equal(req.user, null, `req.user should be null for public path ${pubPath}`);
    }
  });

  it('authenticates via ApiKey header', () => {
    const created = auth.createUser('nina', 'pass', ROLES.VIEWER);
    const req = mockReq({ authorization: `ApiKey ${created.apiKey}` });
    const res = mockRes();
    let nextCalled = false;

    mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'next should be called');
    assert.ok(req.user, 'req.user should be set');
    assert.equal(req.user.username, 'nina');
  });

  it('returns 401 when no auth is provided on protected path', () => {
    const req = mockReq({}, '/api/patterns');
    const res = mockRes();
    let nextCalled = false;

    mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'next should not be called');
    assert.equal(res.statusCode, 401);
  });
});
