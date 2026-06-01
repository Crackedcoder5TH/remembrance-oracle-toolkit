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

const fs = require('node:fs');
const path = require('node:path');

class Field {
  /**
   * @param {object} [opts]
   * @param {string} [opts.url]   field endpoint (env REMEMBRANCE_FIELD_URL)
   * @param {string} [opts.token] bearer token (env REMEMBRANCE_FIELD_TOKEN)
   * @param {number} [opts.timeoutMs=1500]
   * @param {string} [opts.queuePath] local offline queue file (env
   *        REMEMBRANCE_FIELD_QUEUE). When set, contributions that can't reach
   *        the field are saved here and flushed later via sync() — so anyone
   *        can work offline and sync up when they have internet, if they choose.
   */
  constructor({ url, token, timeoutMs = 1500, queuePath } = {}) {
    this.url = url || process.env.REMEMBRANCE_FIELD_URL || DEFAULT_FIELD_URL;
    this.token = (token || process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();
    this.timeoutMs = timeoutMs;
    this.queuePath = (queuePath || process.env.REMEMBRANCE_FIELD_QUEUE || '').trim() || null;
  }

  /** Low-level: call the legacy `field` tool with an action. Kept for the
   * existing contribute/queue/sync flow. Never throws. */
  async call(action, args = {}) {
    return this._rpc({ name: 'field', arguments: { action, ...args } });
  }

  /** Call any field-server MCP tool by name. Unwraps the MCP envelope
   * ({ result: { content: [{ text: '<json>' }] } }) into a plain result
   * object when present. Never throws.
   *
   * @param {string} name - MCP tool name (e.g. 'pattern_resonance', 'safety_check')
   * @param {object} args - tool arguments
   * @returns {Promise<{ok:boolean, result?:any, error?:string, status?:number, body?:any}>}
   */
  async callTool(name, args = {}) {
    return this._rpc({ name, arguments: args }, { unwrap: true });
  }

  /** Shared HTTP/JSON-RPC plumbing. Returns { ok, result|body, status, error }. */
  async _rpc(params, opts = {}) {
    let u;
    try { u = new URL(this.url); } catch { return { ok: false, error: 'invalid field url' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'field url must be http(s)' };

    const headers = { 'content-type': 'application/json' };
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(u.hostname);
    if (this.token && (u.protocol === 'https:' || loopback)) headers.authorization = 'Bearer ' + this.token;

    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, { method: 'POST', headers, body, signal: ctrl.signal });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch { /* non-json */ }
      if (opts.unwrap && json && json.result && Array.isArray(json.result.content)
          && json.result.content[0] && typeof json.result.content[0].text === 'string') {
        const isErr = !!json.result.isError;
        let result;
        try { result = JSON.parse(json.result.content[0].text); }
        catch { result = json.result.content[0].text; }
        return { ok: res.ok && !isErr, result, status: res.status };
      }
      return { ok: res.ok, status: res.status, body: json != null ? json : text };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Score `code` by lexical TF-IDF resonance against the proven pattern
   * library on the field-server. High score = code reuses real proven
   * vocabulary; low score = invented identifiers (a hallucination tell).
   * Returns the tool's result object or { ok:false, error } on transport
   * failure. Best-effort; never throws.
   *
   * @param {string} code
   * @param {object} [opts]
   * @param {string} [opts.language] - preferred language filter
   * @param {number} [opts.k] - top-K patterns to average (default 5, max 20)
   */
  async resonance(code, opts = {}) {
    const r = await this.callTool('pattern_resonance', {
      code: String(code || ''),
      language: opts.language,
      k: opts.k,
    });
    return r.ok ? r.result : r;
  }

  /** Run the combined safety check (covenant principles + security pattern
   * scanner) on the field-server. sealed:true only when both layers pass.
   * Returns the tool's result object or { ok:false, error } on transport
   * failure. Best-effort; never throws.
   *
   * @param {string} code
   * @param {object} [opts]
   * @param {string} [opts.language]
   * @param {string} [opts.description]
   * @param {string[]} [opts.tags]
   */
  async safety(code, opts = {}) {
    const r = await this.callTool('safety_check', {
      code: String(code || ''),
      language: opts.language,
      description: opts.description,
      tags: opts.tags,
    });
    return r.ok ? r.result : r;
  }

  /** Execute code in the server's sandbox and report whether it works.
   * Requires the bearer token (server runs untrusted code). Returns
   * { status, signal, detail } or { ok:false, error } on transport failure.
   * status ∈ {pass, smoke-pass, fail, timeout, blocked, skipped, error}.
   *
   * Compose `safety()` before `verify()` — safety screens by static patterns,
   * verify proves execution. A code blob that passes both is far harder to
   * hallucinate than one that passes either alone.
   *
   * @param {string} code
   * @param {object} [opts]
   * @param {string} [opts.language] - 'javascript'|'js'|'python'|'py'
   * @param {string} [opts.testCode]  - optional test referencing the code's symbols
   * @param {number} [opts.timeoutMs] - hard timeout (server clamps 500..30000)
   */
  async verify(code, opts = {}) {
    const r = await this.callTool('exec_verify', {
      code: String(code || ''),
      language: opts.language,
      testCode: opts.testCode,
      timeoutMs: opts.timeoutMs,
    });
    return r.ok ? r.result : r;
  }

  /** Normalize an observation to {coherence, source, cost} or return an error. */
  _normObs({ coherence, source, cost = 1.0 } = {}) {
    if (typeof source !== 'string' || !source) return { error: 'source (non-empty string) is required' };
    let c = Number(coherence); if (!Number.isFinite(c)) c = 0; c = Math.max(0, Math.min(1, c));
    let k = Number(cost); if (!Number.isFinite(k)) k = 1.0;
    return { coherence: c, source, cost: k };
  }

  /** Append an observation to the local offline queue. Returns true on success. */
  _enqueue(obs) {
    if (!this.queuePath) return false;
    try {
      fs.mkdirSync(path.dirname(this.queuePath), { recursive: true });
      fs.appendFileSync(this.queuePath, JSON.stringify({ ...obs, ts: Date.now() }) + '\n');
      return true;
    } catch { return false; }
  }

  /**
   * Contribute one observation to the field. Best-effort; never throws. When a
   * queuePath is configured and the field is unreachable, the observation is
   * saved locally (queued:true) to be flushed later by sync().
   * @param {{coherence:number, source:string, cost?:number}} obs
   */
  async contribute(obs = {}) {
    const n = this._normObs(obs);
    if (n.error) return { ok: false, error: n.error };
    const res = await this.call('contribute', n);
    if (!res.ok && this.queuePath) return { ...res, queued: this._enqueue(n) };
    return res;
  }

  /**
   * Queue an observation locally WITHOUT contacting the field (explicit offline
   * mode). Flush later with sync(). Requires a queuePath.
   * @param {{coherence:number, source:string, cost?:number}} obs
   */
  queue(obs = {}) {
    const n = this._normObs(obs);
    if (n.error) return { ok: false, error: n.error };
    if (!this.queuePath) return { ok: false, error: 'no queue path (set REMEMBRANCE_FIELD_QUEUE or pass queuePath)' };
    return this._enqueue(n) ? { ok: true, queued: true } : { ok: false, error: 'failed to write queue' };
  }

  /**
   * Flush the local offline queue to the field. Each observation is sent; those
   * that succeed are removed, those that fail stay queued for the next sync.
   * Best-effort; never throws. Requires a queuePath.
   * @param {{max?:number}} [opts]
   * @returns {Promise<{ok:boolean, synced:number, remaining:number, error?:string}>}
   */
  async sync({ max = Infinity } = {}) {
    if (!this.queuePath) return { ok: false, synced: 0, remaining: 0, error: 'no queue path configured' };
    let lines;
    try {
      lines = fs.readFileSync(this.queuePath, 'utf8').split('\n').filter((l) => l.trim());
    } catch (e) {
      if (e && e.code === 'ENOENT') return { ok: true, synced: 0, remaining: 0 };
      return { ok: false, synced: 0, remaining: 0, error: String((e && e.message) || e) };
    }
    let synced = 0;
    const keep = [];
    for (const line of lines) {
      let obs; try { obs = JSON.parse(line); } catch { continue; } // drop corrupt lines
      if (synced >= max) { keep.push(line); continue; }
      const res = await this.call('contribute', { coherence: obs.coherence, source: obs.source, cost: obs.cost });
      if (res.ok) synced++; else keep.push(line);
    }
    try {
      fs.writeFileSync(this.queuePath, keep.length ? keep.join('\n') + '\n' : '');
    } catch (e) {
      return { ok: false, synced, remaining: keep.length, error: 'queue rewrite failed: ' + String((e && e.message) || e) };
    }
    return { ok: true, synced, remaining: keep.length };
  }
}

module.exports = { Field, DEFAULT_FIELD_URL };
