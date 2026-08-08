'use strict';

/**
 * field-coupling/bridge.js — the live-field HTTP bridge: server-role opt-out, target resolution, fire-and-forget observation mirroring.
 * Extracted verbatim from src/core/field-coupling.js in decomposition #4;
 * inline requires repathed one level deeper.
 */


// ── Live-field HTTP bridge ───────────────────────────────────────────────
// Historically `contribute()` only updated this process's in-memory engine, so
// a repo running on its own (a CLI, a CI job, another service) fed a local,
// ephemeral field that the shared LIVE field never saw. When REMEMBRANCE_FIELD_URL
// is set, mirror each observation to that live field over HTTP — the same
// JSON-RPC contract Void's field_contribute.py uses — so every JS repo's numbers
// funnel into the one shared field the interface reads. Best-effort and
// fire-and-forget: a down or slow field never blocks or breaks a contribute.
let _isFieldServerProcess = false;

/**
 * Mark THIS process as the field server, which disables the outbound HTTP
 * bridge. The server absorbs incoming contributions into its own engine; it
 * must never echo them back to itself (that would be an infinite self-feeding
 * loop). Called by scripts/field-server.js at boot.
 */
function markFieldServer() { _isFieldServerProcess = true; }

markFieldServer.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Resolve the live field's MCP endpoint, or null when the bridge is disabled:
 * we are the server, an explicit role opt-out, or no URL configured.
 */
function _liveFieldTarget() {
  if (_isFieldServerProcess) return null;
  const role = (process.env.REMEMBRANCE_FIELD_ROLE || '').toLowerCase();
  if (role === 'server' || process.env.REMEMBRANCE_FIELD_SERVER === '1') return null;
  let raw = (process.env.REMEMBRANCE_FIELD_URL || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw; // scheme-less → https
  let u;
  try { u = new URL(raw); } catch (_) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!/\/mcp\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/+$/, '') + '/mcp';
  return u;
}

/** Fire-and-forget POST of one observation to the live field. Never throws. */
function _bridgeToLiveField(obs) {
  const u = _liveFieldTarget();
  if (!u) return;
  let lib;
  try { lib = u.protocol === 'http:' ? require('node:http') : require('node:https'); }
  catch (_) { return; }
  let body;
  try {
    body = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'field', arguments: { action: 'contribute', coherence: obs.coherence, source: obs.source || 'unknown', cost: obs.cost } },
    });
  } catch (_) { return; }
  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
  const token = (process.env.REMEMBRANCE_FIELD_TOKEN || process.env.FIELD_TOKEN || '').trim();
  const host = (u.hostname || '').toLowerCase();
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  // Never send the bearer in cleartext to a remote host (mirror Void's guard).
  if (token && (u.protocol === 'https:' || isLoopback)) headers.Authorization = 'Bearer ' + token;
  try {
    // http.request does not follow redirects, so the bearer is never replayed
    // to another host.
    const req = lib.request({
      method: 'POST', protocol: u.protocol, hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + (u.search || ''), headers,
    }, (res) => { res.on('data', () => {}); res.on('end', () => {}); res.on('error', () => {}); });
    req.on('error', () => {}); // a down field must never surface
    req.setTimeout(1500, () => { try { req.destroy(); } catch (_) {} });
    req.end(body);
  } catch (_) { /* best-effort */ }
}

module.exports = { markFieldServer, _liveFieldTarget, _bridgeToLiveField };
