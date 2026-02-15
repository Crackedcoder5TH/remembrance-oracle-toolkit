/**
 * GitHub OAuth Identity — Links GitHub accounts to oracle voter identity.
 *
 * Supports two flows:
 *   1. Device Flow (CLI) — no browser redirect needed, polls for approval
 *   2. Token Flow — direct GitHub personal access token verification
 *
 * This gives community voting real identity: voter_id is tied to a verified
 * GitHub username, so reputation can't be faked.
 *
 * No external dependencies — uses Node built-in https.
 */

const https = require('https');
const crypto = require('crypto');

// ─── HTTP Helper ───

function githubRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const method = options.method || 'GET';
    const headers = {
      'User-Agent': 'remembrance-oracle/3.0',
      'Accept': 'application/json',
      ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const hostname = options.hostname || 'api.github.com';
    const req = https.request({ hostname, path, method, headers, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          // Parse URL-encoded response (device flow returns this)
          const parsed = {};
          data.split('&').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k) parsed[decodeURIComponent(k)] = decodeURIComponent(v || '');
          });
          resolve({ status: res.statusCode, data: parsed });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// ─── GitHub Identity Verifier ───

class GitHubIdentity {
  /**
   * @param {object} options
   *   - clientId: GitHub OAuth App client ID (for device flow)
   *   - store: SQLite store for persisting identity links
   */
  constructor(options = {}) {
    this.clientId = options.clientId || process.env.GITHUB_OAUTH_CLIENT_ID || null;
    this.store = options.store || null;
    this._identities = new Map(); // fallback in-memory store

    if (this.store && this.store.db) {
      this._initSchema();
    }
  }

  _initSchema() {
    this.store.db.exec(`
      CREATE TABLE IF NOT EXISTS github_identities (
        voter_id TEXT PRIMARY KEY,
        github_username TEXT UNIQUE NOT NULL,
        github_id INTEGER NOT NULL,
        avatar_url TEXT DEFAULT '',
        verified_at TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        contributions INTEGER DEFAULT 0
      );
    `);
  }

  /**
   * Verify a GitHub personal access token and link to voter identity.
   * @param {string} token - GitHub PAT
   * @returns {{ success, voterId, username, avatarUrl, error? }}
   */
  async verifyToken(token) {
    try {
      const res = await githubRequest('/user', { token });

      if (res.status !== 200) {
        return { success: false, error: 'Invalid GitHub token' };
      }

      const { login, id, avatar_url } = res.data;
      const voterId = `github:${login}`;

      this._saveIdentity({
        voterId,
        githubUsername: login,
        githubId: id,
        avatarUrl: avatar_url || '',
      });

      return {
        success: true,
        voterId,
        username: login,
        githubId: id,
        avatarUrl: avatar_url || '',
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Start the GitHub Device Flow for CLI authentication.
   * Returns a user code and verification URL — user enters code in browser.
   * @returns {{ deviceCode, userCode, verificationUrl, expiresIn, interval, error? }}
   */
  async startDeviceFlow() {
    if (!this.clientId) {
      return { error: 'GitHub OAuth Client ID not configured. Set GITHUB_OAUTH_CLIENT_ID env var.' };
    }

    try {
      const res = await githubRequest('/login/device/code', {
        hostname: 'github.com',
        method: 'POST',
        body: {
          client_id: this.clientId,
          scope: 'read:user',
        },
      });

      if (res.status !== 200 || !res.data.device_code) {
        return { error: 'Failed to start device flow: ' + JSON.stringify(res.data) };
      }

      return {
        deviceCode: res.data.device_code,
        userCode: res.data.user_code,
        verificationUrl: res.data.verification_uri || 'https://github.com/login/device',
        expiresIn: parseInt(res.data.expires_in) || 900,
        interval: parseInt(res.data.interval) || 5,
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Poll for device flow completion.
   * @param {string} deviceCode
   * @returns {{ success, token, voterId, username, error? }}
   */
  async pollDeviceFlow(deviceCode) {
    if (!this.clientId) {
      return { error: 'GitHub OAuth Client ID not configured' };
    }

    try {
      const res = await githubRequest('/login/oauth/access_token', {
        hostname: 'github.com',
        method: 'POST',
        body: {
          client_id: this.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        },
      });

      if (res.data.error === 'authorization_pending') {
        return { pending: true };
      }

      if (res.data.error === 'slow_down') {
        return { pending: true, slowDown: true };
      }

      if (res.data.error) {
        return { success: false, error: res.data.error_description || res.data.error };
      }

      if (res.data.access_token) {
        // Verify the token and link identity
        const identity = await this.verifyToken(res.data.access_token);
        return {
          success: true,
          token: res.data.access_token,
          ...identity,
        };
      }

      return { success: false, error: 'Unexpected response' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get the GitHub identity for a voter ID.
   */
  getIdentity(voterId) {
    if (this.store && this.store.db) {
      try {
        const row = this.store.db.prepare(
          'SELECT * FROM github_identities WHERE voter_id = ?'
        ).get(voterId);
        return row || null;
      } catch { return null; }
    }
    return this._identities.get(voterId) || null;
  }

  /**
   * Get identity by GitHub username.
   */
  getByUsername(username) {
    const voterId = `github:${username}`;
    return this.getIdentity(voterId);
  }

  /**
   * List all verified GitHub identities.
   */
  listIdentities(limit = 50) {
    if (this.store && this.store.db) {
      try {
        return this.store.db.prepare(
          'SELECT * FROM github_identities ORDER BY contributions DESC LIMIT ?'
        ).all(limit);
      } catch { return []; }
    }
    return Array.from(this._identities.values()).slice(0, limit);
  }

  /**
   * Check if a voter ID is a verified GitHub identity.
   */
  isVerified(voterId) {
    return !!this.getIdentity(voterId);
  }

  /**
   * Increment contributions count for a verified identity.
   */
  recordContribution(voterId) {
    if (this.store && this.store.db) {
      try {
        this.store.db.prepare(
          'UPDATE github_identities SET contributions = contributions + 1, last_seen = ? WHERE voter_id = ?'
        ).run(new Date().toISOString(), voterId);
      } catch (e) { /* ignore */ if (process.env.ORACLE_DEBUG) console.warn('contribution recording failed:', e.message); }
    }
    const identity = this._identities.get(voterId);
    if (identity) {
      identity.contributions = (identity.contributions || 0) + 1;
      identity.lastSeen = new Date().toISOString();
    }
  }

  /**
   * Unlink a GitHub identity.
   */
  removeIdentity(voterId) {
    if (this.store && this.store.db) {
      try {
        this.store.db.prepare('DELETE FROM github_identities WHERE voter_id = ?').run(voterId);
        return true;
      } catch { return false; }
    }
    return this._identities.delete(voterId);
  }

  // ─── Internal ───

  _saveIdentity(identity) {
    const now = new Date().toISOString();

    if (this.store && this.store.db) {
      try {
        this.store.db.prepare(`
          INSERT INTO github_identities (voter_id, github_username, github_id, avatar_url, verified_at, last_seen, contributions)
          VALUES (?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(voter_id) DO UPDATE SET last_seen = ?, avatar_url = ?
        `).run(
          identity.voterId, identity.githubUsername, identity.githubId,
          identity.avatarUrl, now, now, now, identity.avatarUrl
        );
      } catch (e) { /* ignore duplicate */ if (process.env.ORACLE_DEBUG) console.warn('identity save failed (duplicate):', e.message); }
    }

    this._identities.set(identity.voterId, {
      ...identity,
      verifiedAt: now,
      lastSeen: now,
      contributions: 0,
    });
  }
}

module.exports = { GitHubIdentity, githubRequest };
