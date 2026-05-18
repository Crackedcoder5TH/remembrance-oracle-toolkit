'use strict';

/**
 * Field entanglement — an ambient sensor layer that couples the host
 * runtime to the Remembrance Field.
 *
 * engage() attaches passive process listeners; each sensed event
 * contributes a { cost, coherence } observation to the field through
 * field-coupling. The LivingRemembranceEngine core is untouched —
 * entanglement lives entirely above the contribute() boundary.
 *
 * Cost is abundance-amortized: with N nodes entangled, each node's
 * per-event cost is baseCost / N, so the field's total entanglement
 * burden stays bounded however many nodes connect — adding a node
 * lowers the cost for every node (non-zero-sum).
 *
 * The throttle is the entropy field itself: a sense is skipped when
 * fieldPressure() reports the field hot. No rate-limit knob.
 *
 * Best-effort throughout — entanglement never breaks or alters the
 * host. uncaughtExceptionMonitor observes crashes without changing
 * exit behavior; the unhandledRejection sensor attaches only when the
 * host already handles rejections (attaching otherwise would suppress
 * the host's default crash).
 */

const fc = require('./field-coupling');

const BASE_COST = 1.0;
const HEARTBEAT_MS = 60000;

let _engaged = false;
let _listeners = [];
let _heartbeat = null;
let _nodeId = null;

function _resolveNodeId() {
  if (_nodeId) return _nodeId;
  const os = require('os');
  const crypto = require('crypto');
  const seed = `${os.hostname()}|${process.pid}|${process.cwd()}`;
  _nodeId = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
  return _nodeId;
}

/** Count of distinct nodes currently entangled with the field. */
function _entangledNodeCount() {
  try {
    const state = fc.peekField();
    if (state && state.sources) {
      const n = Object.keys(state.sources).filter(k => k.startsWith('entangle:node:')).length;
      if (n > 0) return n;
    }
  } catch (_) { /* field unreachable */ }
  return 1;
}

/**
 * Abundance amortization — the abundance equation made concrete: with
 * N nodes entangled, each carries baseCost / N. The field's total
 * entanglement cost stays ~baseCost however many nodes connect, so it
 * costs less per node as the ecosystem scales — adding a node lightens
 * the load for every node.
 */
function _abundanceCost() {
  const n = _entangledNodeCount();
  return n > 0 ? BASE_COST / n : BASE_COST;
}

/** Contribute one observation — abundance-amortized, entropy-throttled. */
function _sense(coherence, kind) {
  if (!_engaged) return;
  try {
    const pressure = fc.fieldPressure ? fc.fieldPressure() : null;
    if (pressure && pressure.hot) return; // entropy field is the throttle
    fc.contribute({
      cost: _abundanceCost(),
      coherence,
      source: `entangle:${kind}:${_resolveNodeId()}`,
    });
  } catch (_) { /* best-effort — entanglement never breaks the host */ }
}

/**
 * Engage entanglement. Idempotent. Registers this node in the field
 * and attaches passive sensors. Auto-called when the MCP server starts.
 */
function engage() {
  if (_engaged) return { engaged: true, already: true, nodeId: _resolveNodeId() };
  _engaged = true;
  const nodeId = _resolveNodeId();

  // Register this node so peers can count N for abundance amortization.
  try {
    fc.contribute({ cost: _abundanceCost(), coherence: 0.9, source: `entangle:node:${nodeId}` });
  } catch (_) { /* best-effort */ }

  const onWarning   = () => _sense(0.5, 'warning');
  const onUncaught  = () => _sense(0.05, 'uncaught-exception');
  const onRejection = () => _sense(0.2, 'unhandled-rejection');

  process.on('warning', onWarning);
  process.on('uncaughtExceptionMonitor', onUncaught);
  _listeners = [['warning', onWarning], ['uncaughtExceptionMonitor', onUncaught]];

  // unhandledRejection: attach only if the host already handles it.
  // Attaching when it does not would suppress the host's default crash.
  if (process.listenerCount('unhandledRejection') > 0) {
    process.on('unhandledRejection', onRejection);
    _listeners.push(['unhandledRejection', onRejection]);
  }

  // Heartbeat — a quiet, healthy host still reads coherent.
  _heartbeat = setInterval(() => _sense(0.95, 'heartbeat'), HEARTBEAT_MS);
  if (_heartbeat.unref) _heartbeat.unref();

  return { engaged: true, nodeId };
}

/** Detach all sensors. Idempotent. */
function disengage() {
  if (!_engaged) return { engaged: false };
  for (const [event, fn] of _listeners) {
    try { process.removeListener(event, fn); } catch (_) { /* ignore */ }
  }
  _listeners = [];
  if (_heartbeat) { clearInterval(_heartbeat); _heartbeat = null; }
  _engaged = false;
  return { engaged: false };
}

/** Current entanglement state. */
function status() {
  const n = _entangledNodeCount();
  return {
    engaged: _engaged,
    nodeId: _resolveNodeId(),
    entangledNodes: n,
    costShare: n > 0 ? BASE_COST / n : BASE_COST,
  };
}

module.exports = { engage, disengage, status };
