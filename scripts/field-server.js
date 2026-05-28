#!/usr/bin/env node
'use strict';

/**
 * Remembrance Field — hostable server for any caller (MCP, REST, browser, human).
 *
 * Starts ONLY the Living Remembrance Engine field surface — no full-oracle
 * bootstrap, no autoSync — so it's reliable to host (Railway / Fly / a VPS).
 * Binds 0.0.0.0:$PORT, persists to $ENTROPY_PATH (point at a volume), optional
 * bearer auth via $FIELD_TOKEN.
 *
 * Faces:
 *   1. MCP (Streamable HTTP, JSON-RPC 2.0) at POST /mcp: `initialize`,
 *      `tools/list`, `tools/call` for field_contribute · field_read · coherency.
 *      Register the URL in Claude Desktop / Cursor / the API MCP connector.
 *   2. Plain REST (for agents/humans that don't speak MCP):
 *        GET  /field           -> field state
 *        POST /coherency       {a,b} -> {coherency}
 *        POST /contribute      {coherence,source,cost} -> field state  (write)
 *   3. GET /  — health/peek JSON.  GET /.well-known/mcp — discovery manifest.
 *   4. Legacy webhook: tools/call name "field" + {action:"contribute"}.
 *
 * Auth model: reads (field_read/coherency/GET) are OPEN; writes
 * (field_contribute / POST /contribute) require Bearer $FIELD_TOKEN when one is
 * set. CORS is enabled so browsers and web agents can call it directly.
 * Per-IP rate limit via $RATE_LIMIT_PER_MIN (default 120; 0 disables).
 */

const http = require('node:http');
const { contribute, peekField } = require('../src/core/field-coupling');
const { codeToWaveform } = require('../src/core/code-to-waveform');

const PORT = parseInt(process.env.PORT, 10) || 7787;
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = (process.env.FIELD_TOKEN || process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();
const DEFAULT_PROTOCOL = '2025-06-18';
const RATE_LIMIT_PER_MIN = (() => { const n = parseInt(process.env.RATE_LIMIT_PER_MIN, 10); return Number.isFinite(n) ? n : 120; })();

const TOOLS = [
  {
    name: 'field_contribute',
    description: 'Contribute one coherence observation (0..1) to the shared Remembrance field.',
    inputSchema: {
      type: 'object',
      properties: {
        coherence: { type: 'number', description: 'alignment reading in [0,1]' },
        source: { type: 'string', description: 'source label, e.g. "my-app:event"' },
        cost: { type: 'number', description: 'work units', default: 1 },
      },
      required: ['coherence', 'source'],
    },
  },
  {
    name: 'field_read',
    description: 'Read the current Remembrance field state (coherence, integral, cascade, per-source histogram).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'coherency',
    description: 'Cosine coherency in [0,1] between two texts — "do these mean the same thing?". Offline, no field write.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      required: ['a', 'b'],
    },
  },
];

function cosine(x, y) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) { const u = x[i] || 0, v = y[i] || 0; dot += u * v; na += u * u; nb += v * v; }
  const da = Math.sqrt(na), db = Math.sqrt(nb);
  return (da < 1e-12 || db < 1e-12) ? 0 : dot / (da * db);
}

// Is this tool call a WRITE (mutates the field)? Writes are token-gated.
function isWriteTool(name, action) {
  return name === 'field_contribute' || (name === 'field' && (action || 'contribute') === 'contribute');
}

// Dispatch a tool call. Accepts the new tool names AND the legacy "field"
// tool (with an `action` argument) so existing webhook producers keep working.
function callTool(name, args = {}) {
  const action = args.action;
  if (isWriteTool(name, action)) {
    const coherence = Number(args.coherence);
    const source = typeof args.source === 'string' ? args.source.trim() : '';
    if (!Number.isFinite(coherence) || !source) throw new Error('coherence (number) and source (non-empty string) are required');
    contribute({ cost: Number(args.cost) || 1, coherence: Math.max(0, Math.min(1, coherence)), source });
    return peekField();
  }
  if (name === 'field_read' || (name === 'field' && ['read', 'peek', 'state'].includes(action))) {
    return peekField();
  }
  if (name === 'coherency') {
    const a = args.a == null ? '' : String(args.a);
    const b = args.b == null ? '' : String(args.b);
    return { coherency: cosine(codeToWaveform(a), codeToWaveform(b)) };
  }
  throw new Error('unknown tool: ' + name);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

function send(res, code, obj) {
  const body = obj === null ? '' : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...CORS });
  res.end(body);
}
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

// Reads are open; writes require the bearer token when one is configured.
function isAuthed(req) {
  if (!TOKEN) return true;
  return (req.headers['authorization'] || '') === 'Bearer ' + TOKEN;
}

// ── Per-IP fixed-window rate limit (in-memory, best-effort). ──
const _hits = new Map();
function rateLimited(req) {
  if (RATE_LIMIT_PER_MIN <= 0) return false;
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  const win = Math.floor(Date.now() / 60000);
  let e = _hits.get(ip);
  if (!e || e.win !== win) { e = { win, n: 0 }; _hits.set(ip, e); }
  e.n++;
  if (_hits.size > 5000) { for (const [k, v] of _hits) if (v.win !== win) _hits.delete(k); } // prune stale windows
  return e.n > RATE_LIMIT_PER_MIN;
}

function manifest() {
  return {
    service: 'remembrance-field',
    version: '0.2.0',
    description: 'Shared conserved-scalar Remembrance field + offline coherency. Callable via MCP or plain REST.',
    mcp: { endpoint: '/mcp', transport: 'streamable-http (JSON-RPC 2.0)', protocolVersion: DEFAULT_PROTOCOL, tools: TOOLS },
    rest: {
      'GET /': 'health + field peek',
      'GET /field': 'read current field state',
      'POST /coherency': '{ a, b } -> { coherency }  (open)',
      'POST /contribute': '{ coherence, source, cost? } -> field state  (write — bearer token if configured)',
    },
    auth: TOKEN
      ? 'public reads; writes (field_contribute / POST /contribute) require Authorization: Bearer <FIELD_TOKEN>'
      : 'open (no FIELD_TOKEN set — anyone can read and write)',
    cors: 'enabled (*)',
  };
}

function handleRpc(msg, res, authed) {
  const { id, method, params } = msg || {};
  if (id === undefined || id === null) return send(res, 202, null); // notification
  try {
    if (method === 'initialize') {
      const pv = (params && params.protocolVersion) || DEFAULT_PROTOCOL;
      return send(res, 200, ok(id, { protocolVersion: pv, capabilities: { tools: {} }, serverInfo: { name: 'remembrance-field', version: '0.2.0' } }));
    }
    if (method === 'ping') return send(res, 200, ok(id, {}));
    if (method === 'tools/list') return send(res, 200, ok(id, { tools: TOOLS }));
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      if (isWriteTool(name, args.action) && !authed) {
        return send(res, 200, ok(id, { content: [{ type: 'text', text: 'Error: unauthorized — a bearer token is required to write to the field' }], isError: true }));
      }
      try {
        const out = callTool(name, args);
        return send(res, 200, ok(id, { content: [{ type: 'text', text: JSON.stringify(out) }] }));
      } catch (e) {
        return send(res, 200, ok(id, { content: [{ type: 'text', text: 'Error: ' + ((e && e.message) || e) }], isError: true }));
      }
    }
    return send(res, 200, err(id, -32601, 'method not found: ' + method));
  } catch (e) {
    return send(res, 200, err(id, -32603, String((e && e.message) || e)));
  }
}

function readBody(req, cb) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on('end', () => cb(raw));
}

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (rateLimited(req)) return send(res, 429, { error: 'rate limit exceeded — try again shortly' });

  if (req.method === 'GET') {
    if (path === '/mcp') return send(res, 405, { error: 'MCP endpoint — POST JSON-RPC here' });
    if (path === '/.well-known/mcp' || path === '/manifest') return send(res, 200, manifest());
    let field = null; try { field = peekField(); } catch (_e) { /* best-effort */ }
    if (path === '/field') return send(res, 200, { ok: true, field });
    return send(res, 200, { ok: true, service: 'remembrance-field', mcp: '/mcp', manifest: '/.well-known/mcp', tools: TOOLS.map((t) => t.name), field });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST (MCP/REST) or GET (health)' });

  const authed = isAuthed(req);

  // ── Plain-REST shim (no JSON-RPC envelope) ──
  if (path === '/coherency') {
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('coherency', { a: p.a, b: p.b })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }
  if (path === '/contribute') {
    if (!authed) return send(res, 401, { error: 'unauthorized — bearer token required to write' });
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('field_contribute', { coherence: p.coherence, source: p.source, cost: p.cost })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }

  // ── MCP / JSON-RPC (POST /mcp or root) ──
  readBody(req, (raw) => {
    let msg;
    try { msg = JSON.parse(raw || '{}'); } catch { return send(res, 400, err(null, -32700, 'parse error')); }
    if (Array.isArray(msg)) {
      const out = msg.filter((m) => m && m.id != null).map((m) => new Promise((r) => handleRpc(m, { writeHead() {}, end(b) { r(b ? JSON.parse(b) : null); } }, authed)));
      return Promise.all(out).then((arr) => send(res, 200, arr.filter(Boolean)));
    }
    return handleRpc(msg, res, authed);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[field-server] Remembrance Field on ${HOST}:${PORT}` +
    (TOKEN ? ' (public read; bearer write)' : ' (open — set FIELD_TOKEN to gate writes)') +
    ` | MCP: /mcp · REST: /coherency,/contribute,/field · manifest: /.well-known/mcp` +
    ` | rate: ${RATE_LIMIT_PER_MIN > 0 ? RATE_LIMIT_PER_MIN + '/min/ip' : 'off'}` +
    ` | persist: ${process.env.ENTROPY_PATH || '.remembrance/entropy.json (ephemeral without a volume)'}`);
});
