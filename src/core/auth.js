'use strict';

/**
 * Production API Authentication & Security Middleware
 *
 * Provides:
 *   1. API Key authentication (header: X-API-Key or Authorization: ApiKey <key>)
 *   2. JWT token authentication (Authorization: Bearer <token>)
 *   3. Rate limiting per key/IP (sliding window)
 *   4. Audit logging (immutable append-only log)
 *   5. RBAC role checking (admin, user, readonly)
 *
 * Used by Oracle API and can be shared across ecosystem services.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── API Key Store ───────────────────────────────────────────────

const KEYS_PATH = process.env.ORACLE_KEYS_PATH || path.join(process.cwd(), '.remembrance', 'api-keys.json');
const AUDIT_PATH = process.env.ORACLE_AUDIT_PATH || path.join(process.cwd(), '.remembrance', 'audit.log');

const ROLES = {
  admin: { level: 3, can: ['read', 'write', 'admin', 'delete'] },
  user: { level: 2, can: ['read', 'write'] },
  readonly: { level: 1, can: ['read'] },
};

const RATE_LIMITS = {
  admin: { requests: 1000, windowMs: 60000 },
  user: { requests: 200, windowMs: 60000 },
  readonly: { requests: 100, windowMs: 60000 },
  anonymous: { requests: 30, windowMs: 60000 },
};

function loadKeys() {
  try {
    const dir = path.dirname(KEYS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(KEYS_PATH)) return {};
    return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
  } catch { return {}; }
}

function saveKeys(keys) {
  const dir = path.dirname(KEYS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), { mode: 0o600 });
}

function generateApiKey(role = 'user', label = '') {
  const key = 'rmb_' + crypto.randomBytes(24).toString('hex');
  const keys = loadKeys();
  keys[key] = {
    role,
    label,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    requestCount: 0,
    active: true,
  };
  saveKeys(keys);
  return key;
}

function validateApiKey(key) {
  if (!key) return null;
  const keys = loadKeys();
  const entry = keys[key];
  if (!entry || !entry.active) return null;
  entry.lastUsed = new Date().toISOString();
  entry.requestCount = (entry.requestCount || 0) + 1;
  saveKeys(keys);
  return { key, role: entry.role, label: entry.label };
}

function revokeApiKey(key) {
  const keys = loadKeys();
  if (!keys[key]) return false;
  keys[key].active = false;
  keys[key].revokedAt = new Date().toISOString();
  saveKeys(keys);
  return true;
}

function listApiKeys() {
  const keys = loadKeys();
  return Object.entries(keys).map(([key, entry]) => ({
    key: key.slice(0, 8) + '...' + key.slice(-4),
    role: entry.role,
    label: entry.label,
    active: entry.active,
    createdAt: entry.createdAt,
    lastUsed: entry.lastUsed,
    requestCount: entry.requestCount,
  }));
}

// ─── JWT Token Handling ──────────────────────────────────────────

const JWT_SECRET = process.env.ORACLE_JWT_SECRET || crypto.randomBytes(32).toString('hex');

function createJwt(payload, expiresInSeconds = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + signature;
}

function verifyJwt(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ─── Rate Limiter ────────────────────────────────────────────────

const _rateBuckets = new Map();

function checkRateLimit(identifier, role = 'anonymous') {
  const limits = RATE_LIMITS[role] || RATE_LIMITS.anonymous;
  const now = Date.now();
  const key = identifier + ':' + role;

  if (!_rateBuckets.has(key)) {
    _rateBuckets.set(key, []);
  }

  const bucket = _rateBuckets.get(key);
  // Evict old entries
  while (bucket.length > 0 && now - bucket[0] > limits.windowMs) {
    bucket.shift();
  }

  if (bucket.length >= limits.requests) {
    return { allowed: false, remaining: 0, resetMs: limits.windowMs - (now - bucket[0]) };
  }

  bucket.push(now);
  return { allowed: true, remaining: limits.requests - bucket.length, resetMs: 0 };
}

// ─── Audit Logger ────────────────────────────────────────────────

function auditLog(event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  try {
    const dir = path.dirname(AUDIT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(AUDIT_PATH, JSON.stringify(entry) + '\n');
  } catch { /* audit logging should never crash the app */ }
}

function readAuditLog(options = {}) {
  const { limit = 100, event: filterEvent } = options;
  try {
    if (!fs.existsSync(AUDIT_PATH)) return [];
    const lines = fs.readFileSync(AUDIT_PATH, 'utf8').trim().split('\n');
    let entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (filterEvent) entries = entries.filter(e => e.event === filterEvent);
    return entries.slice(-limit);
  } catch { return []; }
}

// ─── Authentication Middleware ───────────────────────────────────

/**
 * Extract authentication from request headers.
 *
 * Supports:
 *   - X-API-Key: rmb_xxx
 *   - Authorization: ApiKey rmb_xxx
 *   - Authorization: Bearer <jwt>
 *
 * @param {object} headers - Request headers
 * @returns {{ authenticated: boolean, role: string, identity: string, method: string }}
 */
function authenticate(headers) {
  // 1. Check X-API-Key header
  const apiKey = headers['x-api-key'];
  if (apiKey) {
    const valid = validateApiKey(apiKey);
    if (valid) {
      return { authenticated: true, role: valid.role, identity: valid.label || valid.key, method: 'api-key' };
    }
    return { authenticated: false, role: 'anonymous', identity: null, method: 'api-key', error: 'Invalid API key' };
  }

  // 2. Check Authorization header
  const auth = headers['authorization'] || headers['Authorization'];
  if (auth) {
    if (auth.startsWith('ApiKey ')) {
      const key = auth.slice(7);
      const valid = validateApiKey(key);
      if (valid) {
        return { authenticated: true, role: valid.role, identity: valid.label || valid.key, method: 'api-key' };
      }
      return { authenticated: false, role: 'anonymous', identity: null, method: 'api-key', error: 'Invalid API key' };
    }

    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const payload = verifyJwt(token);
      if (payload) {
        return { authenticated: true, role: payload.role || 'user', identity: payload.sub || payload.email || 'jwt-user', method: 'jwt' };
      }
      return { authenticated: false, role: 'anonymous', identity: null, method: 'jwt', error: 'Invalid or expired token' };
    }
  }

  // 3. Anonymous
  return { authenticated: false, role: 'anonymous', identity: null, method: 'none' };
}

/**
 * Check if a role has permission for an action.
 */
function authorize(role, action) {
  const roleConfig = ROLES[role];
  if (!roleConfig) return false;
  return roleConfig.can.includes(action);
}

/**
 * Full auth middleware: authenticate → rate limit → authorize → audit.
 *
 * @param {object} req - { headers, method, path, ip }
 * @param {string} requiredAction - 'read', 'write', 'admin', 'delete'
 * @returns {{ ok: boolean, status: number, error?: string, auth?: object }}
 */
function authMiddleware(req, requiredAction = 'read') {
  const auth = authenticate(req.headers || {});
  const ip = req.ip || req.headers?.['x-forwarded-for'] || 'unknown';

  // Rate limit check
  const rateResult = checkRateLimit(auth.identity || ip, auth.role);
  if (!rateResult.allowed) {
    auditLog('rate_limited', { ip, identity: auth.identity, role: auth.role });
    return {
      ok: false,
      status: 429,
      error: 'Rate limit exceeded. Try again in ' + Math.ceil(rateResult.resetMs / 1000) + 's',
      headers: { 'X-RateLimit-Remaining': '0', 'Retry-After': Math.ceil(rateResult.resetMs / 1000).toString() },
    };
  }

  // Public endpoints don't require auth
  const publicPaths = ['/health', '/status', '/api/stats'];
  if (publicPaths.some(p => req.path?.startsWith(p))) {
    return { ok: true, status: 200, auth, rateLimit: rateResult };
  }

  // Read endpoints allow anonymous with rate limiting
  if (requiredAction === 'read' && !auth.authenticated) {
    auditLog('anonymous_access', { ip, path: req.path, method: req.method });
    return { ok: true, status: 200, auth, rateLimit: rateResult };
  }

  // Write/admin endpoints require authentication
  if (requiredAction !== 'read' && !auth.authenticated) {
    auditLog('auth_required', { ip, path: req.path, action: requiredAction });
    return { ok: false, status: 401, error: 'Authentication required. Use X-API-Key header or Authorization: Bearer <token>' };
  }

  // Authorization check
  if (auth.authenticated && !authorize(auth.role, requiredAction)) {
    auditLog('forbidden', { ip, identity: auth.identity, role: auth.role, action: requiredAction });
    return { ok: false, status: 403, error: 'Insufficient permissions. Role "' + auth.role + '" cannot perform "' + requiredAction + '"' };
  }

  // Audit successful access
  auditLog('access', { ip, identity: auth.identity, role: auth.role, path: req.path, method: req.method, action: requiredAction });

  return { ok: true, status: 200, auth, rateLimit: rateResult };
}

// ─── Setup: Create initial admin key if none exists ──────────────

function ensureAdminKey() {
  const keys = loadKeys();
  const hasAdmin = Object.values(keys).some(k => k.role === 'admin' && k.active);
  if (!hasAdmin) {
    const key = generateApiKey('admin', 'initial-admin');
    console.log('[auth] Created initial admin API key: ' + key);
    console.log('[auth] Save this key — it will not be shown again.');
    return key;
  }
  return null;
}

module.exports = {
  // API Keys
  generateApiKey,
  validateApiKey,
  revokeApiKey,
  listApiKeys,
  // JWT
  createJwt,
  verifyJwt,
  // Rate Limiting
  checkRateLimit,
  RATE_LIMITS,
  // Audit
  auditLog,
  readAuditLog,
  // Auth Middleware
  authenticate,
  authorize,
  authMiddleware,
  // Setup
  ensureAdminKey,
  // Constants
  ROLES,
};
