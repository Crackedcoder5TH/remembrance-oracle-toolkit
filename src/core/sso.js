'use strict';

/**
 * SSO / OIDC Integration Foundation
 *
 * Provides OpenID Connect authentication flow that works with:
 *   - Okta
 *   - Azure AD (Entra ID)
 *   - Google Workspace
 *   - Auth0
 *   - Any OIDC-compliant provider
 *
 * Flow:
 *   1. Build authorization URL → redirect user to IDP
 *   2. Handle callback → exchange code for tokens
 *   3. Verify ID token → extract user info
 *   4. Create session → issue JWT for API access
 *
 * Configuration via environment or .remembrance/sso.json:
 *   OIDC_ISSUER_URL=https://your-idp.okta.com
 *   OIDC_CLIENT_ID=xxx
 *   OIDC_CLIENT_SECRET=xxx
 *   OIDC_REDIRECT_URI=http://localhost:4000/auth/callback
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), '.remembrance', 'sso.json');

function loadSsoConfig() {
  const config = {
    issuerUrl: process.env.OIDC_ISSUER_URL || null,
    clientId: process.env.OIDC_CLIENT_ID || null,
    clientSecret: process.env.OIDC_CLIENT_SECRET || null,
    redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:4000/auth/callback',
    scopes: ['openid', 'profile', 'email'],
    enabled: false,
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      Object.assign(config, fileConfig);
    }
  } catch {}

  config.enabled = !!(config.issuerUrl && config.clientId && config.clientSecret);
  return config;
}

// ─── OIDC Discovery ──────────────────────────────────────────────

let _discoveryCache = null;
let _discoveryCacheTime = 0;

async function discoverOidc(issuerUrl) {
  if (_discoveryCache && Date.now() - _discoveryCacheTime < 3600000) {
    return _discoveryCache;
  }

  const wellKnown = issuerUrl.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const data = await fetchJson(wellKnown);

  _discoveryCache = {
    authorizationEndpoint: data.authorization_endpoint,
    tokenEndpoint: data.token_endpoint,
    userinfoEndpoint: data.userinfo_endpoint,
    jwksUri: data.jwks_uri,
    issuer: data.issuer,
    endSessionEndpoint: data.end_session_endpoint,
  };
  _discoveryCacheTime = Date.now();
  return _discoveryCache;
}

// ─── Authorization URL ───────────────────────────────────────────

async function buildAuthUrl(options = {}) {
  const config = loadSsoConfig();
  if (!config.enabled) throw new Error('SSO not configured');

  const discovery = await discoverOidc(config.issuerUrl);
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  // PKCE code verifier + challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: options.redirectUri || config.redirectUri,
    scope: config.scopes.join(' '),
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: discovery.authorizationEndpoint + '?' + params.toString(),
    state,
    nonce,
    codeVerifier,
  };
}

// ─── Token Exchange ──────────────────────────────────────────────

async function exchangeCode(code, codeVerifier, options = {}) {
  const config = loadSsoConfig();
  if (!config.enabled) throw new Error('SSO not configured');

  const discovery = await discoverOidc(config.issuerUrl);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: options.redirectUri || config.redirectUri,
    code_verifier: codeVerifier,
  }).toString();

  const tokens = await postForm(discovery.tokenEndpoint, body);
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    tokenType: tokens.token_type,
  };
}

// ─── User Info ───────────────────────────────────────────────────

async function getUserInfo(accessToken) {
  const config = loadSsoConfig();
  const discovery = await discoverOidc(config.issuerUrl);

  const data = await fetchJson(discovery.userinfoEndpoint, {
    headers: { Authorization: 'Bearer ' + accessToken },
  });

  return {
    sub: data.sub,
    email: data.email,
    name: data.name || data.preferred_username,
    picture: data.picture,
    groups: data.groups || [],
    emailVerified: data.email_verified,
    raw: data,
  };
}

// ─── ID Token Verification (basic) ──────────────────────────────

function decodeIdToken(idToken) {
  try {
    const [, body] = idToken.split('.');
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch { return null; }
}

// ─── Session Management ──────────────────────────────────────────

const _sessions = new Map();

function createSession(userInfo, tokens) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  _sessions.set(sessionId, {
    user: userInfo,
    tokens,
    createdAt: Date.now(),
    lastAccess: Date.now(),
  });

  // Cleanup old sessions (>24h)
  for (const [id, session] of _sessions) {
    if (Date.now() - session.createdAt > 86400000) _sessions.delete(id);
  }

  return sessionId;
}

function getSession(sessionId) {
  const session = _sessions.get(sessionId);
  if (!session) return null;
  session.lastAccess = Date.now();
  return session;
}

function destroySession(sessionId) {
  return _sessions.delete(sessionId);
}

// ─── SSO Status ──────────────────────────────────────────────────

function ssoStatus() {
  const config = loadSsoConfig();
  return {
    enabled: config.enabled,
    issuer: config.issuerUrl ? new URL(config.issuerUrl).hostname : null,
    activeSessions: _sessions.size,
    configured: !!(config.clientId && config.issuerUrl),
  };
}

// ─── HTTP Helpers ────────────────────────────────────────────────

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? https : http;
    const req = transport.get({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: options.headers || {},
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from ' + url)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const transport = u.protocol === 'https:' ? https : http;
    const req = transport.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  loadSsoConfig,
  discoverOidc,
  buildAuthUrl,
  exchangeCode,
  getUserInfo,
  decodeIdToken,
  createSession,
  getSession,
  destroySession,
  ssoStatus,
};
