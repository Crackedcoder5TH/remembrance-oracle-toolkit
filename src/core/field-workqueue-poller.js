'use strict';

/**
 * Work-queue poller — turns a node into a worker.
 *
 * engage() starts a loop that claims work from the field work-queue
 * (claiming is entropy-gated inside claim(), so a hot node simply
 * idles), runs the executor registered for the work's `kind`, and
 * submits the result. Auto-engages when the MCP server starts, so
 * every connected node is a worker — that is the distribution.
 *
 * Executors are registered by work `kind`. Built-in: `audit` (static
 * analysis via the analyze envelope) and `echo` (diagnostic). An
 * executor must never run a claimed payload as code — claimed work is
 * untrusted; only static analysis of payload.code is safe. The `audit`
 * executor reads no files: cross-node work carries its content, never
 * a path.
 *
 * Best-effort throughout — a poll failure never crashes the host.
 */

const wq = require('./field-workqueue');

const POLL_INTERVAL_MS = 4000;

let _engaged = false;
let _timer = null;
let _busy = false;
let _nodeId = null;
const _executors = new Map();

function _resolveNodeId() {
  if (_nodeId) return _nodeId;
  try {
    const id = require('./entangle').status().nodeId; // share one node identity
    if (id) { _nodeId = id; return _nodeId; }
  } catch (_) { /* fall through */ }
  const os = require('os');
  const crypto = require('crypto');
  _nodeId = crypto.createHash('sha256')
    .update(`${os.hostname()}|${process.pid}|${process.cwd()}`)
    .digest('hex').slice(0, 12);
  return _nodeId;
}

/** Register an executor for a work kind: fn(payload) -> result. */
function register(kind, fn) {
  if (typeof kind === 'string' && typeof fn === 'function') _executors.set(kind, fn);
}

// ── built-in executor: static audit (no code execution, no file reads) ──
function _auditExecutor(payload) {
  if (!payload || typeof payload.code !== 'string') {
    return { error: 'audit work item needs payload.code (string)' };
  }
  const { analyze } = require('./analyze');
  const env = analyze(payload.code, null, {});
  return {
    coherency: env.coherency,
    audit: env.audit,
    covenant: { sealed: env.covenant.sealed },
  };
}

function _echoExecutor(payload) {
  return { echo: payload === undefined ? null : payload, at: Date.now() };
}

_executors.set('audit', _auditExecutor);
_executors.set('echo', _echoExecutor);

/** One poll cycle: claim -> execute -> submit. */
async function _tick() {
  if (!_engaged || _busy) return;
  _busy = true;
  try {
    const item = wq.claim(_resolveNodeId()); // entropy-gated inside claim()
    if (!item) return;                       // hot field, or nothing to do
    const executor = _executors.get(item.kind);
    let result;
    if (!executor) {
      result = { error: `no executor for work kind "${item.kind}"` };
    } else {
      try { result = await executor(item.payload); }
      catch (e) { result = { error: `executor failed: ${e.message}` }; }
    }
    wq.submitResult(item.id, _resolveNodeId(), result);
  } catch (_) {
    /* best-effort — a poll failure never crashes the host */
  } finally {
    _busy = false;
  }
}

/** Start polling the work-queue. Idempotent. Auto-called on MCP server start. */
function engage(opts = {}) {
  if (_engaged) return { engaged: true, already: true, nodeId: _resolveNodeId() };
  _engaged = true;
  const interval = (typeof opts.intervalMs === 'number' && opts.intervalMs > 0)
    ? opts.intervalMs : POLL_INTERVAL_MS;
  _timer = setInterval(() => { _tick(); }, interval);
  if (_timer.unref) _timer.unref();
  return { engaged: true, nodeId: _resolveNodeId(), intervalMs: interval };
}

/** Stop polling. Idempotent. */
function disengage() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _engaged = false;
  return { engaged: false };
}

/** Current poller state. */
function status() {
  return { engaged: _engaged, nodeId: _resolveNodeId(), kinds: Array.from(_executors.keys()) };
}

module.exports = { engage, disengage, register, status, _tick };
