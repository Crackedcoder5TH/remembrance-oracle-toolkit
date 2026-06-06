'use strict';

/**
 * agent-entanglement — coordination layer for parallel AI agents.
 *
 * Recommendation #4 — what was an ad-hoc /tmp/field-status.js script
 * during a single session is now a packaged library. The pattern is
 * general: any system spawning parallel AI agents wants a way for
 * each agent to see what every other agent is doing live, and to
 * (optionally) claim a file before editing it so they don't fight.
 *
 * The substrate's contribution is using a SHARED MEASUREMENT
 * (the field-goggles state file, plus our own JSONL logs) as the
 * mediator. Agents don't talk to each other or to a controller;
 * they all look at the same field. That's how the law of coherency
 * operates structurally — not orchestration, but a shared signal
 * everyone reads.
 *
 * Three storage files (all append-only or single-writer):
 *
 *   ENTANGLEMENT_LOG   /tmp/agent-entanglement.jsonl
 *     One JSON line per heartbeat: { ts, tag, pid, event:'heartbeat' }
 *
 *   CLAIMS_LOG         /tmp/agent-claims.jsonl
 *     One JSON line per claim/release: { ts, type, file, tag, ttlMs? }
 *     A claim is active when its ts+ttlMs is in the future AND no
 *     later release entry exists for the same file+tag.
 *
 *   GOGGLES_STATE      ~/.claude/.field-goggles-state.json
 *     Maintained by the field-goggles PostToolUse hook. Read-only
 *     from here. Carries the live session cognition trajectory.
 *
 * Public API:
 *   heartbeat(tag)                    — register agent presence
 *   snapshot([opts])                  — { cognition, peers, recent, claims }
 *   claim(file, opts)                 — try to atomically claim a file
 *   release(file, [opts])             — release a held claim
 *   isClaimed(file)                   — read-only check
 *   listClaims()                      — all currently-active claims
 *   listPeers([opts])                 — currently-active peers
 *   _resetState()                     — test-only; nukes both JSONL logs
 *
 * Best-effort throughout: a missing file, a malformed line, a stale
 * filesystem permission — all degrade silently rather than throw.
 * The entanglement layer is observational; if it can't be read it
 * just returns empty arrays.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── Paths (overridable via env for testing) ─────────────────────────

const ENTANGLEMENT_LOG = process.env.AGENT_ENTANGLEMENT_LOG
  || path.join(os.tmpdir(), 'agent-entanglement.jsonl');

const CLAIMS_LOG = process.env.AGENT_CLAIMS_LOG
  || path.join(os.tmpdir(), 'agent-claims.jsonl');

const GOGGLES_STATE = process.env.AGENT_GOGGLES_STATE
  || (function () {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return home ? path.join(home, '.claude', '.field-goggles-state.json') : null;
  })();

const DEFAULT_PEER_WINDOW_MS = 10 * 60 * 1000;   // 10 min
const DEFAULT_CLAIM_TTL_MS   = 5 * 60 * 1000;    // 5 min

// ── Internal helpers ────────────────────────────────────────────────

function _appendJsonl(filePath, entry) {
  if (!filePath) return false;
  try {
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
    return true;
  } catch { return false; }
}

function _readJsonl(filePath) {
  if (!filePath) return [];
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function _classifyTrajectory(scores) {
  const n = scores.length;
  if (n < 2) return { n, mean: scores[0] || 0, variance: 0, cls: 'insufficient' };
  const mean = scores.reduce((s, x) => s + x, 0) / n;
  const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  let cls;
  if (variance <= 0.0005) cls = 'constant';
  else if (variance <= 0.005) cls = 'narrow-band';
  else if (variance >= 0.15) cls = 'bimodal';
  else if (variance >= 0.05) cls = 'wide-uniform';
  else if (mean >= 0.85) cls = 'natural-high';
  else if (mean <= 0.15) cls = 'natural-low';
  else cls = 'natural-mid';
  return { n, mean, variance, cls };
}

function _loadGogglesState() {
  if (!GOGGLES_STATE) return { scores: [], files: [] };
  try {
    if (!fs.existsSync(GOGGLES_STATE)) return { scores: [], files: [] };
    return JSON.parse(fs.readFileSync(GOGGLES_STATE, 'utf8'));
  } catch { return { scores: [], files: [] }; }
}

// ── Heartbeat — agent presence registration ─────────────────────────

/**
 * Register the calling agent as active. Multiple heartbeats from the
 * same tag accumulate; snapshot() reports both count and last seen.
 * Returns the written entry (or null on failure — best-effort).
 *
 * @param {string} tag  identifier for this agent
 * @returns {object|null}
 */
function heartbeat(tag) {
  if (typeof tag !== 'string' || !tag) return null;
  const entry = { ts: Date.now(), tag, pid: process.pid, event: 'heartbeat' };
  const ok = _appendJsonl(ENTANGLEMENT_LOG, entry);
  return ok ? entry : null;
}

// ── Peer enumeration ────────────────────────────────────────────────

/**
 * List peers that have heartbeat'd within the recent window.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxAgeMs=600000]  default 10 min
 * @returns {Array<{tag, heartbeats, lastTs, lastAgeMs}>}
 */
function listPeers(opts = {}) {
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_PEER_WINDOW_MS;
  // Explicit "no window" -> exclude everything (semantic: nothing is fresher than 0 ms).
  if (maxAgeMs <= 0) return [];
  const cutoff = Date.now() - maxAgeMs;
  const lines = _readJsonl(ENTANGLEMENT_LOG).filter((l) => l.ts >= cutoff && l.event === 'heartbeat');
  const by = new Map();
  for (const l of lines) {
    const prev = by.get(l.tag) || { tag: l.tag, heartbeats: 0, lastTs: 0 };
    prev.heartbeats++;
    if (l.ts > prev.lastTs) prev.lastTs = l.ts;
    by.set(l.tag, prev);
  }
  const now = Date.now();
  return [...by.values()]
    .map((p) => ({ ...p, lastAgeMs: now - p.lastTs }))
    .sort((a, b) => b.lastTs - a.lastTs);
}

// ── File claims (the transactional layer) ───────────────────────────

/**
 * Walk the claims log and compute the current state for one file.
 * Returns the active-claim entry or null.
 *
 * Rule: the most recent claim for `file` is active iff
 *   - no release entry has been written for that file by the same tag
 *     after the claim's ts, AND
 *   - the claim's expiry (ts + ttlMs) is in the future.
 *
 * Important: only ONE tag can hold a file at a time. A subsequent
 * claim from a different tag while the first is still active fails.
 */
function _activeClaim(file, nowTs) {
  const log = _readJsonl(CLAIMS_LOG);
  const now = nowTs || Date.now();
  // Walk forward: last-write-wins for each (file) key.
  let active = null;
  for (const l of log) {
    if (l.file !== file) continue;
    if (l.type === 'claim') {
      const expiry = l.ts + (l.ttlMs || DEFAULT_CLAIM_TTL_MS);
      if (expiry > now) active = l;
      // If expired, this claim doesn't reset later claims — the loop
      // will overwrite `active` with any later live claim.
    } else if (l.type === 'release' && active && active.tag === l.tag) {
      // Release from the same tag clears the active claim.
      active = null;
    }
  }
  return active;
}

/**
 * Try to claim a file for editing.
 *
 * @param {string} file       absolute or repo-relative path
 * @param {object} [opts]
 * @param {string} opts.tag   agent identifier holding the claim
 * @param {number} [opts.ttlMs=300000]  claim lifetime (5 min default)
 * @param {boolean} [opts.force=false]  override existing claim (use sparingly)
 * @returns {{claimed:boolean, holder?:string, expiresAt?:number, ttlMs?:number}}
 */
function claim(file, opts = {}) {
  if (typeof file !== 'string' || !file) {
    return { claimed: false, holder: null, reason: 'invalid file' };
  }
  const tag = opts.tag;
  if (typeof tag !== 'string' || !tag) {
    return { claimed: false, holder: null, reason: 'missing tag' };
  }
  const ttlMs = opts.ttlMs || DEFAULT_CLAIM_TTL_MS;
  const now = Date.now();
  const active = _activeClaim(file, now);
  if (active && active.tag !== tag && !opts.force) {
    return {
      claimed: false,
      holder: active.tag,
      expiresAt: active.ts + (active.ttlMs || DEFAULT_CLAIM_TTL_MS),
      reason: 'held by another agent',
    };
  }
  const entry = { ts: now, type: 'claim', file, tag, ttlMs };
  _appendJsonl(CLAIMS_LOG, entry);
  return {
    claimed: true,
    holder: tag,
    expiresAt: now + ttlMs,
    ttlMs,
  };
}

/**
 * Release a claim early. No-op when the caller doesn't hold the claim.
 * Best-effort — returns true if the release entry was written.
 *
 * @param {string} file
 * @param {object} [opts]
 * @param {string} opts.tag
 * @returns {boolean}
 */
function release(file, opts = {}) {
  if (typeof file !== 'string' || !file) return false;
  const tag = opts.tag;
  if (typeof tag !== 'string' || !tag) return false;
  const active = _activeClaim(file);
  if (!active || active.tag !== tag) return false;
  return _appendJsonl(CLAIMS_LOG, { ts: Date.now(), type: 'release', file, tag });
}

/**
 * Read-only: is this file currently held?
 * @param {string} file
 * @returns {{claimed:boolean, holder?:string, expiresAt?:number}}
 */
function isClaimed(file) {
  const active = _activeClaim(file);
  if (!active) return { claimed: false };
  return {
    claimed: true,
    holder: active.tag,
    expiresAt: active.ts + (active.ttlMs || DEFAULT_CLAIM_TTL_MS),
  };
}

/** All currently-active claims (file -> {holder, expiresAt}). */
function listClaims() {
  const log = _readJsonl(CLAIMS_LOG);
  const now = Date.now();
  const byFile = new Map();
  for (const l of log) {
    if (l.type === 'claim') {
      const expiry = l.ts + (l.ttlMs || DEFAULT_CLAIM_TTL_MS);
      if (expiry > now) byFile.set(l.file, { holder: l.tag, expiresAt: expiry });
    } else if (l.type === 'release') {
      const cur = byFile.get(l.file);
      if (cur && cur.holder === l.tag) byFile.delete(l.file);
    }
  }
  return [...byFile.entries()].map(([file, info]) => ({ file, ...info }));
}

// ── Unified snapshot ────────────────────────────────────────────────

/**
 * One call that returns everything an agent might need to see:
 *   - cognition trajectory from the goggles
 *   - peers active in the recent window
 *   - active file claims
 *   - recent file edits across the session
 *
 * @param {object} [opts]
 * @param {number} [opts.peerWindowMs=600000]
 * @param {number} [opts.recentEditCount=10]
 */
function snapshot(opts = {}) {
  const state = _loadGogglesState();
  const trajectory = _classifyTrajectory(state.scores || []);
  const peers = listPeers({ maxAgeMs: opts.peerWindowMs });
  const claims = listClaims();
  const recent = (state.files || []).slice(-(opts.recentEditCount || 10));
  return { cognition: trajectory, peers, claims, recent };
}

// ── Test-only ───────────────────────────────────────────────────────

function _resetState() {
  for (const p of [ENTANGLEMENT_LOG, CLAIMS_LOG]) {
    try { fs.unlinkSync(p); } catch (_) { /* idempotent */ }
  }
}

module.exports = {
  heartbeat,
  snapshot,
  claim,
  release,
  isClaimed,
  listClaims,
  listPeers,
  _resetState,
  // Constants exposed for callers who want the defaults.
  DEFAULT_PEER_WINDOW_MS,
  DEFAULT_CLAIM_TTL_MS,
};
