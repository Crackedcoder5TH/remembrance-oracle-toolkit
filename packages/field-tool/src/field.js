'use strict';

/**
 * field.js — best-effort client for the shared Remembrance Field.
 *
 * Mirrors Void's `field_contribute.py`: a JSON-RPC 2.0 `tools/call` to the
 * field endpoint's `field` tool. Contributions are best-effort — a down or
 * slow field never throws; the caller gets a result object instead.
 *
 * Contract (default http://127.0.0.1:7787/mcp):
 *   { jsonrpc:"2.0", id:1, method:"tools/call",
 *     params:{ name:"field", arguments:{ action:"contribute",
 *              coherence:<0..1>, source:"<label>", cost:<number> } } }
 *   Auth: if a token is configured, Authorization: Bearer <token> — sent only
 *   to https or loopback hosts, never cleartext to a remote host.
 */

const DEFAULT_FIELD_URL = 'http://127.0.0.1:7787/mcp';

class Field {
  /**
   * @param {object} [opts]
   * @param {string} [opts.url]   field endpoint (env REMEMBRANCE_FIELD_URL)
   * @param {string} [opts.token] bearer token (env REMEMBRANCE_FIELD_TOKEN)
   * @param {number} [opts.timeoutMs=1500]
   */
  constructor({ url, token, timeoutMs = 1500 } = {}) {
    this.url = url || process.env.REMEMBRANCE_FIELD_URL || DEFAULT_FIELD_URL;
    this.token = (token || process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();
    this.timeoutMs = timeoutMs;
  }

  /** Low-level: call the field tool with any action. Never throws. */
  async call(action, args = {}) {
    let u;
    try { u = new URL(this.url); } catch { return { ok: false, error: 'invalid field url' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'field url must be http(s)' };

    const headers = { 'content-type': 'application/json' };
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(u.hostname);
    if (this.token && (u.protocol === 'https:' || loopback)) headers.authorization = 'Bearer ' + this.token;

    const body = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'field', arguments: { action, ...args } },
    });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, { method: 'POST', headers, body, signal: ctrl.signal });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch { /* non-json */ }
      return { ok: res.ok, status: res.status, body: json != null ? json : text };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Contribute one observation to the field. Best-effort; never throws.
   * @param {{coherence:number, source:string, cost?:number}} obs
   */
  contribute({ coherence, source, cost = 1.0 } = {}) {
    if (typeof source !== 'string' || !source) {
      return Promise.resolve({ ok: false, error: 'source (non-empty string) is required' });
    }
    let c = Number(coherence);
    if (!Number.isFinite(c)) c = 0;
    c = Math.max(0, Math.min(1, c));
    let k = Number(cost);
    if (!Number.isFinite(k)) k = 1.0;
    return this.call('contribute', { coherence: c, source, cost: k });
  }
}

module.exports = { Field, DEFAULT_FIELD_URL };
