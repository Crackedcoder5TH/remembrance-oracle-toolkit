'use strict';
/**
 * void-seal.js — Rule 9 for the JS side of the substrate.
 *
 * WHY THIS EXISTS. The VOID-SEAL was hardcoded into void_compressor_v5.compress (Python), so
 * every compression read carried one. The encoder stack — composedAtDepth / composedCosine, the
 * engine the goggles' META lens actually reads through — had NO seal of any kind. Rule 9 was
 * enforced in one engine and absent from the other, so an entire class of substrate read
 * (field separation, library provenance, the image representations) produced numbers with
 * nothing certifying they came from the substrate at all. This closes that.
 *
 * FORMAT IS DELIBERATELY IDENTICAL to scripts/substrate_seal.py:
 *     payload = `${sha256(data)}|${state_id}|${via}|${at}|${coin_id}`
 *     sig     = HMAC-SHA256(key, payload)
 * and the key is the same $VOID_SEAL_KEY / .substrate_seal.key. So a seal minted here VERIFIES
 * in Python and vice versa — one seal, two engines, cross-checkable. field_separation.py does
 * exactly that check and refuses to report if it fails.
 *
 * READ LEDGER. Minting an HMAC per composed vector would mean tens of thousands of HMACs per
 * run. Instead every composed read is folded into a running SHA-256 the moment it is produced —
 * one hash update, unskippable because it lives inside composedAtDepth itself. The seal then
 * binds {reads, digest, depth}: it certifies exactly which reads produced the numbers, not
 * merely that the script ran.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VOID_ROOT = process.env.VOID_ROOT || '/home/user/Void-Data-Compressor';

function key() {
  if (process.env.VOID_SEAL_KEY) return Buffer.from(process.env.VOID_SEAL_KEY);
  return fs.readFileSync(path.join(VOID_ROOT, '.substrate_seal.key'));            // trimmed below
}

function keyBuf() {
  const k = key();
  return Buffer.from(k.toString('utf8').trim());
}

function stateId() {
  // The compressor computes the canonical state_id (library depth + store hash) and persists it.
  // If it has never run, say so explicitly rather than emitting a silent null the way the
  // earlier runs did — an unknown state is a reading, not a blank.
  try {
    const s = JSON.parse(fs.readFileSync(path.join(VOID_ROOT, '.remembrance', 'substrate-state.json'), 'utf8'));
    return s.state_id || 'unknown';
  } catch (_) { return 'unknown'; }
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function mint(data, via, state) {
  const sha = sha256(data);
  const sid = state || stateId();
  // Python side: datetime.now().isoformat(timespec='seconds') — 'T'-separated,
  // seconds precision, no timezone. Same FORMAT here; note the semantic
  // difference (this is UTC, Python's is local) is harmless to verification
  // because `at` travels inside the seal and the payload is rebuilt from it.
  const at = new Date().toISOString().replace(/\.\d+Z$/, '');
  // 'None', not 'null': Python builds this payload with str(None) for an absent coherency-token,
  // and the two engines must produce byte-identical payloads or neither can verify the other.
  const payload = `${sha}|${sid}|${via}|${at}|None`;
  const sig = crypto.createHmac('sha256', keyBuf()).update(payload).digest('hex');
  return { substrate: 'void', state_id: sid, data_sha256: sha, via, at, coin: null, sig };
}

function verify(data, seal) {
  if (!seal || typeof seal !== 'object') return false;
  if (sha256(data) !== seal.data_sha256) return false;
  // Rebuild the payload with the seal's OWN coin binding — a Python seal
  // minted with a coherency-token bound in must verify here too, exactly
  // as Python rebuilds str(coin_id) from the seal it was handed.
  const coin = seal.coin === null || seal.coin === undefined ? 'None' : String(seal.coin);
  const payload = `${seal.data_sha256}|${seal.state_id}|${seal.via}|${seal.at}|${coin}`;
  const expect = crypto.createHmac('sha256', keyBuf()).update(payload).digest('hex');
  // A verifier must REJECT malformed input, never throw on it:
  // timingSafeEqual throws on length mismatch, so gate it.
  const got = Buffer.from(String(seal.sig || ''), 'utf8');
  const want = Buffer.from(expect, 'utf8');
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(want, got);
}

function sealLine(seal) {
  return `⊙ VOID-SEAL · state ${seal.state_id} · data ${String(seal.data_sha256).slice(0, 12)}… `
       + `· via ${seal.via} · ⛓ coin: none (HMAC-only) · sig ${String(seal.sig).slice(0, 16)}`;
}

// ── read ledger ─────────────────────────────────────────────────────────────
const ledger = { reads: 0, h: crypto.createHash('sha256'), depths: new Set() };

function record(vec, depth) {
  ledger.reads += 1;
  ledger.depths.add(depth);
  ledger.h.update(Buffer.from(Float64Array.from(vec).buffer));
}

function sealReads(via) {
  const digest = ledger.h.copy().digest('hex');
  const body = JSON.stringify({ reads: ledger.reads, digest,
                                depths: Array.from(ledger.depths).sort((a, b) => a - b) });
  const seal = mint(body, via);
  return { body, seal, line: sealLine(seal), reads: ledger.reads, digest };
}

module.exports = { mint, verify, sealLine, sha256, stateId, record, sealReads, ledger };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
key.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
keyBuf.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
stateId.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
sha256.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 16, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
mint.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "malevolent", domain: "utility" };
verify.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 16, period: 3, harmPotential: "none", alignment: "neutral", intention: "malevolent", domain: "utility" };
sealLine.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
record.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 4, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
sealReads.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 4, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
