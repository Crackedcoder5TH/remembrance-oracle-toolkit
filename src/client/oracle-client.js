'use strict';

/**
 * OracleClient — zero-dependency HTTP client for the Remembrance Oracle REST API.
 * Uses node:http / node:https only.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class OracleClient {
  constructor({ baseUrl = 'http://localhost:3333', apiKey } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey || null;
  }

  /** @private */
  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const transport = url.protocol === 'https:' ? https : http;

      const headers = { 'Accept': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `ApiKey ${this.apiKey}`;

      let payload;
      if (body !== undefined) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = transport.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              const err = new Error(parsed.error || `HTTP ${res.statusCode}`);
              err.status = res.statusCode;
              err.body = parsed;
              reject(err);
            } else {
              resolve(parsed);
            }
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[oracle-client:_request] silent failure:', e?.message || e);
            if (res.statusCode >= 400) {
              const err = new Error(`HTTP ${res.statusCode}`);
              err.status = res.statusCode;
              reject(err);
            } else {
              resolve(data);
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });

      if (payload) req.write(payload);
      req.end();
    });
  }

  /** GET /api/health */
  health() {
    return this._request('GET', '/api/health');
  }

  /** GET /api/stats */
  stats() {
    return this._request('GET', '/api/stats');
  }

  /** GET /api/search?q=...&mode=...&limit=... */
  search(query, { mode = 'hybrid', limit = 10 } = {}) {
    const params = new URLSearchParams({ q: query, mode, limit: String(limit) });
    return this._request('GET', `/api/search?${params}`);
  }

  /** POST /api/resolve */
  resolve(description, { tags, language, minCoherency } = {}) {
    return this._request('POST', '/api/resolve', {
      description,
      tags,
      language,
      minCoherency,
    });
  }

  /** POST /api/submit */
  submit(code, { language, description, tags, testCode } = {}) {
    return this._request('POST', '/api/submit', {
      code,
      language,
      description,
      tags,
      testCode,
    });
  }

  /** POST /api/register */
  register(pattern) {
    return this._request('POST', '/api/register', pattern);
  }

  /** POST /api/feedback */
  feedback(id, success) {
    return this._request('POST', '/api/feedback', { id, success });
  }

  /** POST /api/covenant */
  covenant(code, { description, tags, language } = {}) {
    return this._request('POST', '/api/covenant', {
      code,
      description,
      tags,
      language,
    });
  }
}

module.exports = { OracleClient };
