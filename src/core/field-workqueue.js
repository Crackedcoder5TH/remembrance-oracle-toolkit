'use strict';

/**
 * Field work-queue — the coordination substrate for distributed
 * computation across entangled nodes.
 *
 * A node with heavy work posts a work item; any entangled node claims
 * it (claiming is entropy-gated, so a hot node idles); the node
 * computes and submits a result. Every result is run through the
 * compressor (codeToWaveform -> 256-D waveform) and scored for
 * coherency; collect() returns the highest-coherency result, because
 * coherency is the ecosystem's final tiebreaker.
 *
 * The queue is SHARED. It rides the same blockchain ledger the field
 * uses: _load() restores the latest queue snapshot witnessed in the
 * ledger and merges it with the local cache; _save() checkpoints the
 * queue back to the ledger periodically. The merge follows coherency —
 * it never drops a result, so collect()'s highest-coherency pick stays
 * the final word and a claim race across nodes degrades into free
 * swarm redundancy rather than a conflict.
 *
 * Every post / claim / result also contributes its cost to the
 * Remembrance Field, so the queue is balanced and throttled by the
 * same entropy dynamics as everything else. The LivingRemembranceEngine
 * core is untouched — the queue lives above the contribute() boundary.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH = process.env.WORKQUEUE_PATH
  || path.join(__dirname, '..', '..', '.remembrance', 'workqueue.json');

// A claimed-but-unfinished item is re-offered after this window.
const CLAIM_LEASE_MS = 5 * 60 * 1000;
// Checkpoint the queue to the shared ledger every N local saves.
const FLUSH_EVERY = 20;
// Re-read the ledger at most this often — bounds the chain-verify cost.
const CHAIN_TTL_MS = 3000;

let _saveCount = 0;
let _chainCache = { at: 0, value: null };

// ── local cache ──────────────────────────────────────────────────────
function _loadLocal() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if (parsed && Array.isArray(parsed.items)) return parsed;
    }
  } catch (_) { /* corrupt / unreadable — start fresh */ }
  return { items: [] };
}

function _writeLocal(store) {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = STORE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, STORE_PATH);
  } catch (_) { /* best-effort */ }
}

// ── shared store: the blockchain ledger, the same one the field uses ─
function _ledgerPath() {
  return process.env.LEDGER_PATH
    || path.join(__dirname, '..', '..', '.remembrance', 'ledger.json');
}

function _blockchainLedger() {
  const candidates = [
    'remembrance-blockchain/src/index',
    path.join(__dirname, '..', '..', '..', 'REMEMBRANCE-BLOCKCHAIN', 'src', 'index'),
  ];
  for (const p of candidates) {
    try { return require(p).PatternLedger; } catch (_) { /* try next */ }
  }
  return null;
}

/** Restore the latest queue snapshot witnessed in the shared ledger. */
function _loadFromChain() {
  if (Date.now() - _chainCache.at < CHAIN_TTL_MS) return _chainCache.value;
  let found = null;
  try {
    const PatternLedger = _blockchainLedger();
    if (PatternLedger) {
      const ledger = PatternLedger.load(_ledgerPath());
      for (let i = ledger.chain.length - 1; i >= 0; i--) {
        const b = ledger.chain[i];
        const m = b && b.data && b.data.metadata;
        if (b && b.data && b.data.type === 'CHECKPOINT'
            && typeof b.data.patternId === 'string' && b.data.patternId.startsWith('workqueue-')
            && m && m.workqueue && Array.isArray(m.workqueue.items)) {
          found = m.workqueue;
          break;
        }
      }
    }
  } catch (_) { /* ledger unavailable — local only */ }
  _chainCache = { at: Date.now(), value: found };
  return found;
}

/** Checkpoint the queue into the shared ledger. */
function _flushToChain(store) {
  try {
    const PatternLedger = _blockchainLedger();
    if (!PatternLedger) return false;
    const lp = _ledgerPath();
    const ledger = PatternLedger.load(lp);
    ledger.recordEvent('CHECKPOINT', `workqueue-${new Date().toISOString()}`, { workqueue: store });
    ledger.save(lp);
    _chainCache = { at: 0, value: null }; // our snapshot just changed — refresh next read
    return true;
  } catch (_) { return false; }
}

// ── coherency-following merge ────────────────────────────────────────
function _mergeResults(ra, rb) {
  const seen = new Set();
  const out = [];
  for (const r of [...(ra || []), ...(rb || [])]) {
    if (!r) continue;
    const key = `${r.node}|${r.at}|${r.coherency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Merge two views of the queue — a union of items, and per item a union
 * of results. No result is dropped, so collect()'s highest-coherency
 * pick stays the final word: a claim race across nodes becomes free
 * swarm redundancy, adjudicated by coherency, not a lost-update bug.
 */
function _merge(a, b) {
  const byId = new Map();
  for (const it of ((a && a.items) || [])) byId.set(it.id, it);
  for (const it of ((b && b.items) || [])) {
    const cur = byId.get(it.id);
    if (!cur) { byId.set(it.id, it); continue; }
    const results = _mergeResults(cur.results, it.results);
    byId.set(it.id, {
      ...cur,
      results,
      done: !!(cur.done || it.done),
      claimedBy: cur.claimedBy || it.claimedBy || null,
      claimedAt: Math.max(cur.claimedAt || 0, it.claimedAt || 0) || null,
    });
  }
  return { items: Array.from(byId.values()) };
}

// ── the shared load / save the operations use ────────────────────────
function _load() {
  const local = _loadLocal();
  const chain = _loadFromChain();
  return chain ? _merge(local, chain) : local;
}

function _save(store) {
  _writeLocal(store);
  _saveCount += 1;
  if (_saveCount % FLUSH_EVERY === 0) _flushToChain(store);
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

/** Force-checkpoint the queue to the shared ledger. */
function flush() {
  return { flushed: _flushToChain(_load()) };
}

/**
 * Offload a unit of work: post it, nudge the local poller, then wait
 * (bounded) for the coherency-judged result. If the local field is
 * cool the local poller computes it at once; if the field is hot the
 * entropy gate sends it to a node with surplus instead. Returns the
 * collect() verdict, or { status: 'timeout', id } if none arrives.
 */
async function offload(kind, payload, opts = {}) {
  const timeoutMs = (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) ? opts.timeoutMs : 30000;
  const id = post(kind, payload);

  // Nudge the local poller — a cool node claims it at once; a hot
  // node's claim is entropy-gated, so the work flows to the pool.
  try { await require('./field-workqueue-poller')._tick(); } catch (_) { /* poller optional */ }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const got = collect(id);
    if (got.status === 'done') return got;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const final = collect(id);
  return final.status === 'done' ? final : { status: 'timeout', id };
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

module.exports = { post, claim, submitResult, collect, offload, flush, stats, STORE_PATH, _merge };
