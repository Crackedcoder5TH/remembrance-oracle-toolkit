'use strict';

/**
 * @oracle-infrastructure — goggles learned-memory persistence across
 * hosts, via the blockchain ledger. Internal, not user-input-driven.
 *
 * goggles-memory — checkpoint the goggles' learned wisdom to the chain,
 * and restore it on a fresh oracle.
 *
 * The goggles LEARN: the defect-signature library grows with every
 * taught shape, and the finding-amplitude ledger records which findings
 * matter and which are noise. That wisdom lived only in local
 * .remembrance/*.json — so a container restart or a fresh clone started
 * the instrument from zero. Under a covenant whose first law is
 * remembrance, learning cannot be mortal while data is immortal.
 *
 * This module makes the LEDGER the memory of what the instrument
 * learned. checkpoint() bundles the two learned-state files and writes
 * them into a LEARNING block (full state in the block, digest anchored
 * on-chain). restore() reads the latest LEARNING block and rehydrates
 * the local files — so a blank oracle inherits the collected remembrance
 * of everyone who came before it. Abundance as knowledge first.
 *
 * Merge semantics on restore: the union of signatures (by id), keeping
 * the higher hit/resolved counts; the field learns from every host, so
 * pulling the chain never DISCARDS local wisdom, only adds to it.
 *
 * Best-effort throughout: no blockchain reachable → the goggles still
 * work, they just don't persist their learning across hosts.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.GOGGLES_LEARNING_ROOT || path.join(__dirname, '..', '..');
const SIGS_PATH = path.join(ROOT, '.remembrance', 'defect-signatures.json');
const LEARN_PATH = path.join(ROOT, '.remembrance', 'goggles-learning.json');

function _readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}
function _writeJson(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj));
    return true;
  } catch (_) { return false; }
}

/**
 * Resolve the REMEMBRANCE-BLOCKCHAIN Publisher — the same sibling-clone
 * resolution the MCP checkpoint handler uses. Null when unreachable.
 */
function _publisher() {
  const candidates = [
    process.env.REMEMBRANCE_BLOCKCHAIN_PATH
      ? path.join(process.env.REMEMBRANCE_BLOCKCHAIN_PATH, 'src', 'publisher')
      : null,
    path.join(ROOT, '..', 'REMEMBRANCE-BLOCKCHAIN', 'src', 'publisher'),
    'remembrance-blockchain/src/publisher',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const { Publisher } = require(c);
      if (Publisher) return new Publisher({ oracleRoot: ROOT });
    } catch (_) { /* try next */ }
  }
  return null;
}

/**
 * Bundle the goggles' current learned state from the local files.
 * @returns {{ signatures: Array, learning: object, meta: object }}
 */
function collectLocalMemory() {
  const sigLib = _readJson(SIGS_PATH) || { signatures: [] };
  const learning = _readJson(LEARN_PATH) || {};
  return {
    signatures: Array.isArray(sigLib.signatures) ? sigLib.signatures : [],
    learning,
    meta: { host: process.env.HOSTNAME || 'unknown', root: ROOT },
  };
}

/**
 * Merge two signature lists by id, keeping the higher hit/resolved
 * counts. The union never shrinks — every host's taught shapes survive.
 */
function _mergeSignatures(a, b) {
  const byId = new Map();
  for (const s of [...a, ...b]) {
    if (!s || !s.id) continue;
    const prev = byId.get(s.id);
    if (!prev) { byId.set(s.id, { ...s }); continue; }
    prev.hits = Math.max(prev.hits || 0, s.hits || 0);
    prev.resolved = Math.max(prev.resolved || 0, s.resolved || 0);
  }
  return [...byId.values()];
}

/**
 * Merge two learning ledgers: union of patterns and remembered
 * false-positives, summed resolutions. Learning accumulates.
 */
function _mergeLearning(local, remote) {
  const out = { ...remote, ...local };
  out.patterns = { ...(remote.patterns || {}), ...(local.patterns || {}) };
  out.falsePositives = { ...(remote.falsePositives || {}), ...(local.falsePositives || {}) };
  out.files = { ...(remote.files || {}), ...(local.files || {}) };
  out.resolutions = Math.max(local.resolutions || 0, remote.resolutions || 0);
  return out;
}

/**
 * Checkpoint the goggles' learned memory to the chain.
 *
 * @returns {Promise<{ok:boolean, reason?:string, digest?:string,
 *   signatureCount?:number, bridgeStatus?:string, signature?:string}>}
 */
async function checkpoint() {
  const pub = _publisher();
  if (!pub) return { ok: false, reason: 'REMEMBRANCE-BLOCKCHAIN Publisher not reachable' };
  const memory = collectLocalMemory();
  if (!memory.signatures.length && !Object.keys(memory.learning).length) {
    return { ok: false, reason: 'no learned state to checkpoint yet' };
  }
  const r = await pub.publishGogglesMemory(memory);
  return {
    ok: true,
    digest: r.digest,
    signatureCount: r.signatureCount,
    bridgeStatus: r.bridgeStatus,
    signature: r.signature,
    ledgerIndex: r.ledgerBlock && r.ledgerBlock.index,
  };
}

/**
 * Restore the goggles' learned memory from the chain, merging it into
 * the local state (union — the chain adds to local wisdom, never
 * discards it). A blank oracle calls this to inherit everything.
 *
 * @param {object} [opts] — { merge=true } — set false to overwrite local.
 * @returns {{ok:boolean, reason?:string, signatureCount?:number,
 *   added?:number, from?:string}}
 */
function restore(opts = {}) {
  const merge = opts.merge !== false;
  const pub = _publisher();
  if (!pub) return { ok: false, reason: 'REMEMBRANCE-BLOCKCHAIN Publisher not reachable' };
  const remote = pub.getLatestGogglesMemory();
  if (!remote) return { ok: false, reason: 'the chain carries no learning checkpoint yet' };

  const localSigLib = _readJson(SIGS_PATH) || { signatures: [] };
  const localLearn = _readJson(LEARN_PATH) || {};
  const beforeCount = (localSigLib.signatures || []).length;

  let signatures = remote.signatures;
  let learning = remote.learning;
  if (merge) {
    signatures = _mergeSignatures(localSigLib.signatures || [], remote.signatures);
    learning = _mergeLearning(localLearn, remote.learning);
  }

  _writeJson(SIGS_PATH, { version: 1, signatures });
  _writeJson(LEARN_PATH, learning);

  return {
    ok: true,
    signatureCount: signatures.length,
    added: signatures.length - beforeCount,
    from: remote.timestamp,
    digest: remote.digest,
  };
}

module.exports = { checkpoint, restore, collectLocalMemory, SIGS_PATH, LEARN_PATH };
