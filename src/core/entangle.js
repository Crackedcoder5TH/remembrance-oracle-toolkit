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

/**
 * Count of distinct nodes currently entangled with the field.
 *
 * Reads the engine's node REGISTRY. This used to count sources beginning
 * with `entangle:node:` in the coherency field's histogram — so the census
 * was a side effect of a flat `coherence: 0.9` heartbeat, and the registry
 * lived inside the field it was supposed to be independent of.
 *
 * Two things that fixes. The heartbeat no longer moves the global EMA by a
 * constant that describes nothing about the node. And the census is now
 * TTL-scoped: the old count included every machine that ever ran, so a
 * one-off node inflated the abundance divisor permanently and every later
 * node under-reported its cost.
 */
function _entangledNodeCount() {
  try {
    const { getEngine } = require('./living-remembrance');
    return getEngine().nodeCount();
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
    // Announce presence to the REGISTRY, not to the coherency field.
    //
    // This was `contribute({ coherence: 0.9, source: 'entangle:node:<id>' })`
    // — a flat constant that moved the global EMA on every heartbeat while
    // saying nothing about the node, and which the census then counted. The
    // registry was riding inside the field it was meant to be independent of,
    // so presence and measurement distorted each other in both directions.
    //
    // Registering is now presence only: it touches no equation term.
    require('./living-remembrance').getEngine().registerNode(nodeId);
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

// nodeId is exported so the node's identity has ONE definition. field-tool
// needs it to register presence on read, and a second copy of
// `hash(hostname|pid|cwd)` is exactly the kind of duplicate that drifts
// until two parts of the system disagree about who they are.
module.exports = { engage, disengage, status, nodeId: _resolveNodeId };
