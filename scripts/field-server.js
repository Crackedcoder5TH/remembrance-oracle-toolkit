#!/usr/bin/env node
'use strict';

/**
 * Lean Living Remembrance Engine HTTP server.
 *
 * Starts ONLY the field endpoint — no full-oracle bootstrap, no autoSync — so
 * it is reliable to host (Railway / Fly / a VPS). Binds 0.0.0.0:$PORT (the
 * platform-injected port), persists to $ENTROPY_PATH (point this at a volume
 * in production), and optionally requires a bearer token via $FIELD_TOKEN.
 *
 * Wire contract (matches Void's field_contribute.py and the swarm field bridge):
 *   POST /mcp  { "jsonrpc":"2.0","id":1,"method":"tools/call",
 *                "params":{"name":"field","arguments":{
 *                  "action":"contribute","coherence":0..1,"source":"...","cost":1}}}
 *   GET  /     -> { ok, field: <state> }   (health check / quick peek)
 */

const http = require('node:http');
const { contribute, peekField } = require('../src/core/field-coupling');

const PORT = parseInt(process.env.PORT, 10) || 7787;
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = (process.env.FIELD_TOKEN || process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Health / quick peek — also what a browser hitting the URL will see.
  if (req.method === 'GET') {
    let field = null;
    try { field = peekField(); } catch (_e) { /* best-effort */ }
    return send(res, 200, { ok: true, service: 'remembrance-field', field });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST (contribute) or GET (health)' });

  if (TOKEN && (req.headers['authorization'] || '') !== 'Bearer ' + TOKEN) {
    return send(res, 401, { error: 'unauthorized' });
  }

  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', () => {
    let msg;
    try { msg = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'invalid JSON' }); }
    const id = msg.id != null ? msg.id : 1;
    const args = (msg.params && msg.params.arguments) || msg.arguments || {};
    const action = args.action || 'contribute';
    try {
      if (action === 'read' || action === 'peek' || action === 'state') {
        return send(res, 200, { jsonrpc: '2.0', id, result: peekField() });
      }
      const coherence = Number(args.coherence);
      const source = typeof args.source === 'string' ? args.source.trim() : '';
      if (!Number.isFinite(coherence) || !source) {
        return send(res, 400, { jsonrpc: '2.0', id, error: { message: 'coherence (number) and source (non-empty string) are required' } });
      }
      contribute({ cost: Number(args.cost) || 1, coherence: Math.max(0, Math.min(1, coherence)), source });
      return send(res, 200, { jsonrpc: '2.0', id, result: peekField() });
    } catch (e) {
      return send(res, 500, { jsonrpc: '2.0', id, error: { message: String((e && e.message) || e) } });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[field-server] Living Remembrance Engine on ${HOST}:${PORT}` +
    (TOKEN ? ' (bearer auth on)' : ' (no auth — set FIELD_TOKEN)') +
    ` | persist: ${process.env.ENTROPY_PATH || '.remembrance/entropy.json (ephemeral without a volume)'}`);
});
