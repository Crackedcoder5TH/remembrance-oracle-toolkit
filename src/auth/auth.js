/**
 * Authentication & Authorization Module
 *
 * Token-based auth with role-based access control for the Oracle dashboard
 * and MCP server. Uses ONLY Node.js built-in crypto — no external dependencies.
 *
 * Storage: SQLite (node:sqlite DatabaseSync) when available, falls back to
 * in-memory Map for testing or environments without SQLite.
 *
 * Roles:
 *   admin       — full access (manage users, modify patterns, view everything)
 *   contributor — submit/register patterns, search, view
 *   viewer      — search and view only
 */

const crypto = require('crypto');

// ─── Constants ───

const ROLES = Object.freeze({
  ADMIN: 'admin',
  CONTRIBUTOR: 'contributor',
  VIEWER: 'viewer',
});

const VALID_ROLES = new Set([ROLES.ADMIN, ROLES.CONTRIBUTOR, ROLES.VIEWER]);

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

const DEFAULT_ADMIN_USERNAME = 'admin';

/** Admin password from env, or auto-generated if unset. */
function _getDefaultAdminPassword() {
  if (process.env.ORACLE_ADMIN_PASSWORD) return process.env.ORACLE_ADMIN_PASSWORD;
  // Generate a random password so we never ship with a known default
  return crypto.randomBytes(16).toString('hex');
}

/** Paths that don't require authentication. */
const publicPaths = ['/api/health', '/health', '/favicon.ico'];

// ─── Permission helpers ───

function canRead(user) {
  return user != null && VALID_ROLES.has(user.role);
}

function canWrite(user) {
  return user != null && (user.role === ROLES.ADMIN || user.role === ROLES.CONTRIBUTOR);
}

function canManageUsers(user) {
  return user != null && user.role === ROLES.ADMIN;
}

// ─── Crypto helpers ───

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(SALT_BYTES).toString('hex');
}

function hashPassword(password, salt) {
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return derived.toString('hex');
}

function verifyPassword(password, salt, storedHash) {
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const candidateHash = derived.toString('hex');
  // Constant-time comparison to prevent timing attacks
  if (candidateHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(candidateHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}

// ─── AuthManager ───

class AuthManager {
  /**
   * @param {object} [sqliteStore] — SQLiteStore instance (or any object exposing
   *   a `.db` property that is a DatabaseSync). When omitted, all user data lives
   *   in an in-memory Map and tokens in a Map — suitable for tests.
   */
  constructor(sqliteStore) {
    /** token -> userId */
    this._tokens = new Map();
    this._backend = 'memory';

    if (sqliteStore && sqliteStore.db) {
      this._db = sqliteStore.db;
      this._backend = 'sqlite';
      this._initSchema();
    } else {
      /** In-memory users store: id -> user object (with password_hash, salt) */
      this._users = new Map();
      /** Secondary index: username -> id */
      this._byUsername = new Map();
      /** Secondary index: apiKey -> id */
      this._byApiKey = new Map();
    }

    this._ensureDefaultAdmin();
  }

  // ─── Schema (SQLite) ───

  _initSchema() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT DEFAULT 'contributor',
        api_key TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // ─── Default admin bootstrap ───

  _ensureDefaultAdmin() {
    const users = this.listUsers();
    if (users.length === 0) {
      const password = _getDefaultAdminPassword();
      const admin = this.createUser(DEFAULT_ADMIN_USERNAME, password, ROLES.ADMIN);
      if (process.env.ORACLE_ADMIN_PASSWORD) {
        console.log(`[auth] Default admin created (password from ORACLE_ADMIN_PASSWORD). API key: ${admin.apiKey}`);
      } else {
        console.log(`[auth] Default admin created with generated password: ${password}`);
        console.log(`[auth] Set ORACLE_ADMIN_PASSWORD env var to use a fixed password. API key: ${admin.apiKey}`);
      }
    }
  }

  // ─── CRUD ───

  /**
   * Create a new user.
   * @param {string} username
   * @param {string} password
   * @param {string} [role='contributor']
   * @returns {{ id, username, role, apiKey }}
   */
  createUser(username, password, role = ROLES.CONTRIBUTOR) {
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required');
    }
    if (!password || typeof password !== 'string') {
      throw new Error('Password is required');
    }
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${[...VALID_ROLES].join(', ')}`);
    }

    const id = generateId();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const apiKey = generateToken();
    const now = new Date().toISOString();

    if (this._backend === 'sqlite') {
      try {
        this._db.prepare(`
          INSERT INTO users (id, username, password_hash, salt, role, api_key, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, username, passwordHash, salt, role, apiKey, now, now);
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint')) {
          throw new Error(`Username '${username}' already exists`);
        }
        throw err;
      }
    } else {
      // In-memory
      if (this._byUsername.has(username)) {
        throw new Error(`Username '${username}' already exists`);
      }
      this._users.set(id, {
        id, username, password_hash: passwordHash, salt, role, api_key: apiKey,
        created_at: now, updated_at: now,
      });
      this._byUsername.set(username, id);
      this._byApiKey.set(apiKey, id);
    }

    return { id, username, role, apiKey };
  }

  /**
   * Authenticate by username + password. Returns a token and user info, or null.
   * @returns {{ token, user: { id, username, role, apiKey } } | null}
   */
  authenticate(username, password) {
    const row = this._getUserRowByUsername(username);
    if (!row) return null;

    if (!verifyPassword(password, row.salt, row.password_hash)) {
      return null;
    }

    const token = generateToken();
    this._tokens.set(token, row.id);

    return {
      token,
      user: {
        id: row.id,
        username: row.username,
        role: row.role,
        apiKey: row.api_key,
      },
    };
  }

  /**
   * Validate a bearer token. Returns user object or null.
   * @returns {{ id, username, role, apiKey } | null}
   */
  validateToken(token) {
    if (!token) return null;
    const userId = this._tokens.get(token);
    if (!userId) return null;
    return this.getUser(userId);
  }

  /**
   * Validate an API key. Returns user object or null.
   * @returns {{ id, username, role, apiKey } | null}
   */
  validateApiKey(apiKey) {
    if (!apiKey) return null;

    if (this._backend === 'sqlite') {
      const row = this._db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey);
      return row ? this._sanitize(row) : null;
    }

    const userId = this._byApiKey.get(apiKey);
    if (!userId) return null;
    return this.getUser(userId);
  }

  /**
   * Get a user by id. Returns sanitized user object (no password) or null.
   * @returns {{ id, username, role, apiKey } | null}
   */
  getUser(id) {
    if (!id) return null;

    if (this._backend === 'sqlite') {
      const row = this._db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return row ? this._sanitize(row) : null;
    }

    const row = this._users.get(id);
    return row ? this._sanitize(row) : null;
  }

  /**
   * List all users (without passwords).
   * @returns {Array<{ id, username, role, apiKey, createdAt, updatedAt }>}
   */
  listUsers() {
    if (this._backend === 'sqlite') {
      const rows = this._db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
      return rows.map(r => this._sanitize(r));
    }

    return [...this._users.values()].map(r => this._sanitize(r));
  }

  /**
   * Update a user's role.
   * @returns {{ id, username, role, apiKey } | null}
   */
  updateRole(id, newRole) {
    if (!VALID_ROLES.has(newRole)) {
      throw new Error(`Invalid role: ${newRole}. Must be one of: ${[...VALID_ROLES].join(', ')}`);
    }

    if (this._backend === 'sqlite') {
      const row = this._db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!row) return null;
      const now = new Date().toISOString();
      this._db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(newRole, now, id);
      return this.getUser(id);
    }

    const row = this._users.get(id);
    if (!row) return null;
    row.role = newRole;
    row.updated_at = new Date().toISOString();
    return this._sanitize(row);
  }

  /**
   * Revoke the current API key and generate a new one.
   * Invalidates the old key immediately.
   * @returns {{ id, username, role, apiKey } | null}
   */
  revokeApiKey(id) {
    const newKey = generateToken();
    const now = new Date().toISOString();

    if (this._backend === 'sqlite') {
      const row = this._db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!row) return null;
      this._db.prepare('UPDATE users SET api_key = ?, updated_at = ? WHERE id = ?').run(newKey, now, id);
      return this.getUser(id);
    }

    const row = this._users.get(id);
    if (!row) return null;
    // Remove old key from secondary index
    this._byApiKey.delete(row.api_key);
    row.api_key = newKey;
    row.updated_at = now;
    this._byApiKey.set(newKey, id);
    return this._sanitize(row);
  }

  /**
   * Delete a user and invalidate all their tokens.
   * @returns {boolean} true if deleted, false if not found
   */
  deleteUser(id) {
    if (this._backend === 'sqlite') {
      const row = this._db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!row) return false;
      this._db.prepare('DELETE FROM users WHERE id = ?').run(id);
      // Purge any active tokens for this user
      this._purgeTokensForUser(id);
      return true;
    }

    const row = this._users.get(id);
    if (!row) return false;
    this._byUsername.delete(row.username);
    this._byApiKey.delete(row.api_key);
    this._users.delete(id);
    this._purgeTokensForUser(id);
    return true;
  }

  /**
   * Remove all active tokens for a given user id.
   */
  _purgeTokensForUser(userId) {
    for (const [token, uid] of this._tokens.entries()) {
      if (uid === userId) {
        this._tokens.delete(token);
      }
    }
  }

  // ─── Internal helpers ───

  _getUserRowByUsername(username) {
    if (this._backend === 'sqlite') {
      return this._db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
    }
    const id = this._byUsername.get(username);
    if (!id) return null;
    return this._users.get(id) || null;
  }

  /**
   * Strip sensitive fields (password_hash, salt) from a user row.
   */
  _sanitize(row) {
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      apiKey: row.api_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ─── HTTP Middleware ───

/**
 * Returns an Express/http-compatible middleware function that extracts auth
 * credentials from the request and populates `req.user`.
 *
 * Checks (in order):
 *   1. Authorization header: "Bearer <token>" or "ApiKey <key>"
 *   2. Query parameters: ?token=<token> or ?apiKey=<key>
 *
 * If the path is in `publicPaths`, the request is allowed through even
 * without credentials (req.user will be null).
 *
 * @param {AuthManager} authManager
 * @returns {function(req, res, next)}
 */
function authMiddleware(authManager) {
  return function middleware(req, res, next) {
    // Allow public paths through without auth
    const urlPath = (req.url || '').split('?')[0];
    if (publicPaths.includes(urlPath)) {
      req.user = null;
      return next();
    }

    let user = null;

    // 1. Check Authorization header
    const authHeader = req.headers && req.headers['authorization'];
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2) {
        const scheme = parts[0];
        const credential = parts[1];

        if (scheme === 'Bearer') {
          user = authManager.validateToken(credential);
        } else if (scheme === 'ApiKey') {
          user = authManager.validateApiKey(credential);
        }
      }
    }

    // 2. Fall back to query parameters
    if (!user) {
      const queryParams = parseQuery(req.url || '');
      if (queryParams.token) {
        user = authManager.validateToken(queryParams.token);
      } else if (queryParams.apiKey) {
        user = authManager.validateApiKey(queryParams.apiKey);
      }
    }

    if (user) {
      req.user = user;
      return next();
    }

    // No valid auth found — 401
    res.statusCode = 401;
    const body = JSON.stringify({ error: 'Unauthorized', message: 'Valid authentication required' });
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  };
}

/**
 * Minimal query string parser (no external deps).
 * Handles ?key=value&key2=value2
 */
function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const qs = url.slice(idx + 1);
  const params = {};
  for (const pair of qs.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      params[decodeURIComponent(pair)] = '';
    } else {
      params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
    }
  }
  return params;
}

// ─── Exports ───

module.exports = {
  AuthManager,
  authMiddleware,
  ROLES,
  canWrite,
  canManageUsers,
  canRead,
  publicPaths,
};
