'use strict';

/**
 * Dashboard middleware — rate limiting, CORS, auth setup.
 * Extracted from server.js for clarity.
 */

function createRateLimiter(options = {}) {
  const { windowMs = 60000, maxRequests = 100 } = options;
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of hits) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) hits.delete(ip);
      else hits.set(ip, valid);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  return function rateLimitMiddleware(req, res, next) {
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || '127.0.0.1');
    const now = Date.now();
    const timestamps = (hits.get(ip) || []).filter(t => now - t < windowMs);
    timestamps.push(now);
    hits.set(ip, timestamps);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - timestamps.length));

    if (timestamps.length > maxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil(windowMs / 1000) });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    next();
  };
}

function setupAuth(oracleInstance, options) {
  let authManager = options.authManager || null;
  let authMw = null;
  if (options.auth !== false) {
    try {
      const { AuthManager, authMiddleware } = require('../auth/auth');
      if (!authManager) {
        const sqliteStore = oracleInstance.store.getSQLiteStore();
        authManager = new AuthManager(sqliteStore);
      }
      authMw = authMiddleware(authManager);
    } catch {
      // Auth module not available
    }
  }
  return { authManager, authMw };
}

function setupVersionManager(oracleInstance) {
  try {
    const { VersionManager } = require('../core/versioning');
    const sqliteStore = oracleInstance.store.getSQLiteStore();
    return new VersionManager(sqliteStore);
  } catch {
    return null;
  }
}

function applyCORS(res, req) {
  const origin = req?.headers?.origin || '';
  // Only allow localhost origins — the dashboard is a local dev tool.
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'http://localhost');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (allowed) res.setHeader('Vary', 'Origin');
}

module.exports = { createRateLimiter, setupAuth, setupVersionManager, applyCORS };
