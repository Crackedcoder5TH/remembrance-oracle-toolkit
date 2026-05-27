#!/usr/bin/env node
'use strict';

/**
 * Remembrance Field — hostable MCP server (+ webhook + health).
 *
 * Starts ONLY the Living Remembrance Engine field surface — no full-oracle
 * bootstrap, no autoSync — so it's reliable to host (Railway / Fly / a VPS).
 * Binds 0.0.0.0:$PORT, persists to $ENTROPY_PATH (point at a volume), optional
 * bearer auth via $FIELD_TOKEN.
 *
 * Three faces on one endpoint (POST /mcp):
 *   1. MCP (Streamable HTTP, JSON-RPC 2.0): `initialize`, `tools/list`,
 *      `tools/call` for tools  field_contribute · field_read · coherency.
 *      Register the URL in Claude Desktop / Cursor / the API MCP connector.
 *   2. Legacy webhook: `tools/call` with name "field" + {action:"contribute"}
 *      — what Void's field_contribute.py and the swarm field bridge already post.
 *   3. GET /  — health/peek JSON (open in a browser to confirm it's live).
 */

const http = require('node:http');
const { contribute, peekField } = require('../src/core/field-coupling');
const { codeToWaveform } = require('../src/core/code-to-waveform');

const PORT = parseInt(process.env.PORT, 10) || 7787;
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = (process.env.FIELD_TOKEN || process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();
const DEFAULT_PROTOCOL = '2025-06-18';

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

// Dispatch a tool call. Accepts the new tool names AND the legacy "field"
// tool (with an `action` argument) so existing webhook producers keep working.
function callTool(name, args = {}) {
  const action = args.action;
  if (name === 'field_contribute' || (name === 'field' && (action || 'contribute') === 'contribute')) {
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

function send(res, code, obj) {
  const body = obj === null ? '' : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

function handleRpc(msg, res) {
  const { id, method, params } = msg || {};
  // JSON-RPC notifications (no id) get no response body.
  if (id === undefined || id === null) return send(res, 202, null);
  try {
    if (method === 'initialize') {
      const pv = (params && params.protocolVersion) || DEFAULT_PROTOCOL;
      return send(res, 200, ok(id, {
        protocolVersion: pv,
        capabilities: { tools: {} },
        serverInfo: { name: 'remembrance-field', version: '0.2.0' },
      }));
    }
    if (method === 'ping') return send(res, 200, ok(id, {}));
    if (method === 'tools/list') return send(res, 200, ok(id, { tools: TOOLS }));
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
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

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];

  if (req.method === 'GET') {
    if (path === '/mcp') return send(res, 405, { error: 'MCP endpoint — POST JSON-RPC here' });
    let field = null; try { field = peekField(); } catch (_e) { /* best-effort */ }
    return send(res, 200, { ok: true, service: 'remembrance-field', mcp: '/mcp', tools: TOOLS.map((t) => t.name), field });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST (MCP/JSON-RPC) or GET (health)' });

  if (TOKEN && (req.headers['authorization'] || '') !== 'Bearer ' + TOKEN) {
    return send(res, 401, { error: 'unauthorized' });
  }

  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on('end', () => {
    let msg;
    try { msg = JSON.parse(raw || '{}'); } catch { return send(res, 400, err(null, -32700, 'parse error')); }
    if (Array.isArray(msg)) { // JSON-RPC batch
      const out = msg.filter((m) => m && m.id != null).map((m) => new Promise((r) => handleRpc(m, { writeHead() {}, end(b) { r(b ? JSON.parse(b) : null); } })));
      return Promise.all(out).then((arr) => send(res, 200, arr.filter(Boolean)));
    }
    return handleRpc(msg, res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[field-server] Remembrance Field MCP server on ${HOST}:${PORT}` +
    (TOKEN ? ' (bearer auth on)' : ' (no auth — set FIELD_TOKEN)') +
    ` | tools: ${TOOLS.map((t) => t.name).join(', ')}` +
    ` | persist: ${process.env.ENTROPY_PATH || '.remembrance/entropy.json (ephemeral without a volume)'}`);
});
