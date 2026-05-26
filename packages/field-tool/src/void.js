'use strict';

/**
 * void.js — optional connection to YOUR Void compressor / data hub.
 *
 * Everything in this package works standalone (offline coherency). When a
 * Void instance is reachable, these calls use your collected substrate — the
 * 77k+ pattern library — to score with real resonance instead of a bare
 * pairwise cosine, and to (optionally, with consent) contribute new patterns
 * to the canonical library.
 *
 * Targets Void's public api.py (default http://127.0.0.1:8080):
 *   POST /coherence        { text }                  -> { coherence, ... }
 *   POST /patterns/submit  { agent_id, name, code }  -> { accepted, coherence, tier, reasons }
 *   GET  /health
 *
 * Best-effort: a down/slow Void never throws — calls return a result object.
 */

const DEFAULT_VOID_URL = 'http://127.0.0.1:8080';

class VoidClient {
  /**
   * @param {object} [opts]
   * @param {string} [opts.url]      Void base URL (env REMEMBRANCE_VOID_URL)
   * @param {string} [opts.agentId]  stable submitter id (env REMEMBRANCE_AGENT_ID)
   * @param {number} [opts.timeoutMs=4000]
   */
  constructor({ url, agentId, timeoutMs = 4000 } = {}) {
    this.url = (url || process.env.REMEMBRANCE_VOID_URL || DEFAULT_VOID_URL).replace(/\/+$/, '');
    this.agentId = (agentId || process.env.REMEMBRANCE_AGENT_ID || '').trim();
    this.timeoutMs = timeoutMs;
  }

  async _req(method, pathname, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const opts = { method, headers: {}, signal: ctrl.signal };
      if (payload !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(payload); }
      const res = await fetch(this.url + pathname, opts);
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch { /* non-json */ }
      return { ok: res.ok, status: res.status, body: json != null ? json : text };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Is a Void instance reachable? */
  async available() {
    const r = await this._req('GET', '/health');
    return !!r.ok;
  }

  /**
   * Score text against your collected substrate (real resonance, not a bare
   * pairwise cosine). Returns the raw Void response, or { ok:false } offline.
   */
  coherence(text) {
    return this._req('POST', '/coherence', { text: text == null ? '' : String(text) });
  }

  /**
   * Submit a pattern to the canonical pattern library. NOTE: the CLI gates
   * this behind an explicit consent prompt — call this directly only when the
   * caller has already obtained consent.
   * @param {{name:string, code:string, language?:string, tags?:string[], description?:string, agentId?:string}} p
   */
  submitPattern(p = {}) {
    const agent_id = (p.agentId || this.agentId || '').trim();
    if (!agent_id) return Promise.resolve({ ok: false, error: 'agent_id required — set REMEMBRANCE_AGENT_ID or pass agentId' });
    if (!p.name || !String(p.name).trim()) return Promise.resolve({ ok: false, error: 'name required' });
    if (typeof p.code !== 'string' || p.code.length < 20) return Promise.resolve({ ok: false, error: 'code must be a string of at least 20 characters' });
    if (p.code.length > 200000) return Promise.resolve({ ok: false, error: 'code exceeds the 200KB limit' });
    const payload = { agent_id, name: String(p.name).trim(), code: p.code };
    if (p.language) payload.language = p.language;
    if (Array.isArray(p.tags)) payload.tags = p.tags;
    if (p.description) payload.description = p.description;
    return this._req('POST', '/patterns/submit', payload);
  }
}

module.exports = { VoidClient, DEFAULT_VOID_URL };
