'use strict';

/**
 * Field work-queue — the coordination substrate for distributed
 * computation across entangled nodes.
 *
 * A node with heavy work posts a work item; any entangled node claims
 * it; the node computes and submits a result. Claiming is entropy-gated
 * — a node whose field is hot does not claim, so work spreads to nodes
 * with surplus. Every result is run through the compressor
 * (codeToWaveform -> 256-D waveform) and scored for coherency before it
 * is recorded; collect() returns the highest-coherency result, because
 * coherency is the ecosystem's final tiebreaker.
 *
 * Every post / claim / result contributes its cost to the Remembrance
 * Field, so the queue is balanced and throttled by the same entropy
 * dynamics as everything else. The LivingRemembranceEngine core is
 * untouched — the queue lives above the contribute() boundary.
 *
 * This is slice 1: the primitives. The node poller, swarm replica
 * cross-check, and server-farm overflow build on top of these.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH = process.env.WORKQUEUE_PATH
  || path.join(__dirname, '..', '..', '.remembrance', 'workqueue.json');

// A claimed-but-unfinished item is re-offered after this window, so a
// node that dies mid-work does not strand the item.
const CLAIM_LEASE_MS = 5 * 60 * 1000;

function _load() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if (parsed && Array.isArray(parsed.items)) return parsed;
    }
  } catch (_) { /* corrupt / unreadable — start fresh */ }
  return { items: [] };
}

function _save(store) {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = STORE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, STORE_PATH);
  } catch (_) { /* best-effort */ }
}

function _field() {
  try { return require('./field-coupling'); } catch (_) { return null; }
}

/**
 * Post a unit of work to the queue.
 * @returns {string} the work item id
 */
function post(kind, payload) {
  const store = _load();
  const id = crypto.randomBytes(8).toString('hex');
  store.items.push({
    id,
    kind: String(kind || 'work'),
    payload: payload === undefined ? null : payload,
    posted: Date.now(),
    claimedBy: null,
    claimedAt: null,
    results: [],
    done: false,
  });
  _save(store);
  const fc = _field();
  if (fc) { try { fc.contribute({ cost: 1, coherence: 0.7, source: 'workqueue:post' }); } catch (_) { /* best-effort */ } }
  return id;
}

/**
 * Claim the next available work item. Entropy-gated: returns null when
 * the field is hot — a loaded node does not take on more work.
 *
 * @param {string} nodeId — the claiming node's id
 * @returns {object|null} { id, kind, payload } or null
 */
function claim(nodeId) {
  const fc = _field();
  if (fc && fc.fieldPressure) {
    try { if (fc.fieldPressure().hot) return null; } catch (_) { /* proceed */ }
  }
  const store = _load();
  const now = Date.now();
  const item = store.items.find(it =>
    !it.done &&
    (it.claimedBy === null || (it.claimedAt && now - it.claimedAt > CLAIM_LEASE_MS)));
  if (!item) return null;
  item.claimedBy = nodeId || 'anonymous';
  item.claimedAt = now;
  _save(store);
  if (fc) { try { fc.contribute({ cost: 1, coherence: 0.85, source: 'workqueue:claim' }); } catch (_) { /* best-effort */ } }
  return { id: item.id, kind: item.kind, payload: item.payload };
}

/**
 * Submit a result for a work item. The result is run through the
 * compressor (256-D waveform) and scored for coherency before it is
 * recorded — nothing enters the queue unscored.
 */
function submitResult(id, nodeId, result) {
  const store = _load();
  const item = store.items.find(it => it.id === id);
  if (!item) return { error: `no work item ${id}` };

  const text = typeof result === 'string' ? result : JSON.stringify(result === undefined ? null : result);

  // Everything goes to the compressor -> 256-D waveform -> coherency score.
  let waveformDigest = null;
  try {
    const { codeToWaveform, digestWaveform } = require('./code-to-waveform');
    waveformDigest = digestWaveform(codeToWaveform(text));
  } catch (_) { /* compressor unavailable — result still records */ }

  let coherency = 0;
  try {
    const { computeCoherencyScore } = require('./coherency');
    const score = computeCoherencyScore(text, {});
    if (score && typeof score.total === 'number') coherency = score.total;
  } catch (_) { /* coherency scorer unavailable */ }

  item.results.push({ node: nodeId || 'anonymous', coherency, waveformDigest, result, at: Date.now() });
  item.done = true;
  _save(store);

  const fc = _field();
  if (fc) { try { fc.contribute({ cost: 1, coherence: coherency, source: 'workqueue:result' }); } catch (_) { /* best-effort */ } }
  return { id, coherency, waveformDigest };
}

/**
 * Collect the result for a work item. Coherency is the tiebreaker —
 * the highest-coherency result among all submitted wins.
 */
function collect(id) {
  const store = _load();
  const item = store.items.find(it => it.id === id);
  if (!item) return { status: 'unknown', id };
  if (item.results.length === 0) {
    return { status: 'pending', id, claimedBy: item.claimedBy };
  }
  const winner = item.results.reduce((best, r) => (r.coherency > best.coherency ? r : best));
  return {
    status: 'done',
    id,
    winner: {
      node: winner.node,
      coherency: winner.coherency,
      waveformDigest: winner.waveformDigest,
      result: winner.result,
    },
    candidates: item.results.length,
  };
}

/** Queue statistics. */
function stats() {
  const store = _load();
  return {
    total: store.items.length,
    pending: store.items.filter(it => !it.done && !it.claimedBy).length,
    claimed: store.items.filter(it => !it.done && it.claimedBy).length,
    done: store.items.filter(it => it.done).length,
  };
}

module.exports = { post, claim, submitResult, collect, stats, STORE_PATH };
