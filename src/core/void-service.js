'use strict';

/**
 * void-service.js — the one way to ask the Void compressor for a coherency.
 *
 * There is exactly one producer of coherency in this ecosystem: the Void
 * compressor. This module is the single client for it, so that "ask the
 * instrument" is implemented once rather than once per caller.
 *
 * It exists because it was already implemented twice. scripts/goggle-web.js
 * knew how to start the service and wait for it; the reader added to
 * field-tool.js did not, and simply gave up when the service was cold. Same
 * job, two behaviours, and the weaker one sat on the hottest read path — the
 * same class of drift the one-encoder rule (Void C-53) exists to prevent.
 *
 * Contract:
 *   - Reads the artifact's OWN BYTES as a uint8 waveform, quantised the way
 *     goggle-web.js quantises, so every reading in the ecosystem is the same
 *     measurement taken the same way.
 *   - Starts the service if it is cold and waits for it. A cold start loads
 *     the pattern library (~65-100s); warm reads are ~1.5s.
 *   - Returns null when no reading could be taken. NEVER a substitute number.
 *     Absence of a reading is not a reading of zero.
 *   - Caches by content hash, so a re-read of unchanged content is free.
 */

const crypto = require('crypto');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const PORT = process.env.VOID_SVC_PORT || '8765';
const VOID_ROOT = process.env.VOID_ROOT
  || path.resolve(__dirname, '..', '..', '..', 'Void-Data-Compressor');

const CACHE = new Map();               // sha1(content) → number | null

// The provenance of the most recent reading — which patterns the compressor
// blended to reconstruct the content, and whether that blend was the content
// itself. Set by every uncached read.
let LAST_READING = null;

// A blend is a self-match when a single pattern reconstructs the content
// essentially alone: alpha (or beta) carries the whole weight and the residual
// is negligible. That is the signature of "this IS the pattern", as distinct
// from "this is shaped like these two patterns".
function _isSelfMatch(blend) {
  if (!blend) return false;
  const one = (b) => {
    const a = Number(b.alpha), bb = Number(b.beta), res = Number(b.residual);
    if (!isFinite(a) || !isFinite(bb)) return false;
    const dominant = Math.max(Math.abs(a), Math.abs(bb));
    const other = Math.min(Math.abs(a), Math.abs(bb));
    // One pattern carries the chunk alone and nothing meaningful is left over:
    // the signature of "this IS the pattern", not "this is shaped like it".
    return dominant >= 0.999 && other <= 0.01
      && (!isFinite(res) || Math.abs(res) <= 1e-6);
  };
  // Chunked reads report one blend per chunk. A read is self-matched when
  // EVERY chunk reconstructs from a single pattern alone — one such chunk is
  // ordinary, all of them means the library already holds this artifact.
  if (Array.isArray(blend)) return blend.length > 0 && blend.every(one);
  return one(blend);
}

/** The distinct pattern names a reading blended from. */
function _blendNames(blend) {
  if (!blend) return [];
  const arr = Array.isArray(blend) ? blend : [blend];
  const names = new Set();
  for (const b of arr) { if (b.name1) names.add(b.name1); if (b.name2) names.add(b.name2); }
  return [...names];
}
const CACHE_MAX = 5000;

let _startAttempted = false;
let _unavailable = false;

function _post(series) {
  try {
    return execFileSync('curl', [
      '-s', '--noproxy', '127.0.0.1', '--max-time', '120',
      '-H', 'Content-Type: application/json', '--data-binary', '@-',
      `http://127.0.0.1:${PORT}/compress_signal`,
    ], { input: JSON.stringify({ series }), maxBuffer: 1 << 26, encoding: 'utf8' });
  } catch (_) {
    return '';
  }
}

/** Is the service answering right now? */
function isUp() {
  try {
    const r = execFileSync('curl', [
      '-s', '--noproxy', '127.0.0.1', '--max-time', '3',
      '-X', 'POST', '--data-binary', '{}',
      `http://127.0.0.1:${PORT}/health`,
    ], { encoding: 'utf8' });
    return !!r && r.includes('"status"');
  } catch (_) {
    return false;
  }
}

/**
 * Start the service if it is not already up, and wait for it to answer.
 * Attempted at most once per process — if it will not come up, further reads
 * report no reading rather than re-paying the timeout on every call.
 *
 * @param {object} [opts] — { waitMs?: number, quiet?: boolean }
 * @returns {boolean} true when the service is answering.
 */
function ensureUp(opts = {}) {
  if (isUp()) return true;
  if (_startAttempted) return false;
  _startAttempted = true;

  const waitMs = typeof opts.waitMs === 'number' ? opts.waitMs : 180000;
  if (!opts.quiet) {
    console.error('[void] compressor service cold — starting it '
      + '(first start loads the pattern library, ~65-100s; then reads are ~1.5s)');
  }
  try {
    spawn('python3', [path.join(VOID_ROOT, 'compressor_service.py'),
      '--host', '127.0.0.1', '--port', String(PORT)],
    { cwd: VOID_ROOT, detached: true, stdio: 'ignore' }).unref();
  } catch (e) {
    if (!opts.quiet) console.error('[void] could not start the service — ' + e.message);
    return false;
  }

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try { execFileSync('sleep', ['3']); } catch (_) { /* pacing only */ }
    if (isUp()) return true;
  }
  if (!opts.quiet) console.error('[void] service did not come up within ' + waitMs + 'ms');
  return false;
}

/**
 * THE coherency reading for a piece of content.
 *
 * @param {string} content
 * @param {object} [opts]
 *   autoStart?  — start the service if cold (default true)
 *   quiet?      — suppress the cold-start notice
 *   cachedOnly? — NEVER block. Return a reading only if one is already held;
 *                 otherwise null. For hot paths (see below).
 * @returns {number|null} the compressor's reading, or null if none was taken.
 */
function coherencyOf(content, opts = {}) {
  if (typeof content !== 'string' || content.length === 0) return null;

  const key = crypto.createHash('sha1').update(content).digest('hex');
  if (CACHE.has(key)) return CACHE.get(key);

  // HOT PATHS MUST NOT PAY FOR A ROUND TRIP.
  //
  // A warm read is ~1.5-2s. That is fine when an artifact is being witnessed
  // and catastrophic inside a scorer called per pattern: wiring a blocking
  // read into computeCoherencyScore took a 20-pattern compression pass from
  // under 5s to 39.7s, which its own performance test caught.
  //
  // `cachedOnly` is how a hot caller stays honest without paying: it uses a
  // reading if the instrument has already produced one for this exact content
  // (the goggles, field-tool and harvest all populate this cache when they
  // witness an artifact), and otherwise contributes NOTHING. Sparse real
  // readings beat dense invented ones — the alternative was never "fast and
  // correct", it was "fast and fabricated".
  if (opts.cachedOnly) return null;
  if (_unavailable) return null;

  const bytes = Buffer.from(content, 'utf8').slice(0, 16384);
  if (bytes.length < 8) return null;          // no signal to read
  const series = Array.from(bytes);

  let raw = _post(series);
  if (!raw && opts.autoStart !== false) {
    if (ensureUp({ quiet: opts.quiet })) raw = _post(series);
  }
  if (!raw) {
    _unavailable = true;
    return null;
  }

  let value = null;
  let blend = null;
  try {
    const r = JSON.parse(raw);
    if (typeof r.avg_coherence === 'number' && isFinite(r.avg_coherence)) {
      value = r.avg_coherence;
    }
    // Chunked path reports per-chunk blends; single-shot path reports one.
    blend = r.blend || (Array.isArray(r.blends) && r.blends.length ? r.blends : null) || null;
  } catch (_) { /* unparseable → no reading */ }

  // ── SELF-MATCH: the reading that measures library membership ──────────────
  //
  // avg_coherence is the coherence of the two-pattern blend that reconstructs
  // the content. When the content is ALREADY IN THE LIBRARY, the blend that
  // reconstructs it is itself, and the reading goes to ~1.0 for a reason that
  // has nothing to do with the artifact's shape.
  //
  // Measured: site/escape-html-standalone.js read 0.9999916893505959 while
  // every other one of 3,734 substrate readings topped out at 0.6238 — a
  // seeded pattern named `escape-html-standalone` sits in the library
  // byte-identical to it. Control: site/escape-html.js has a seeded twin that
  // is NOT byte-identical and reads 0.480. Same size, same domain, same
  // author. The difference is membership, not coherency.
  //
  // Anything the substrate has ingested verbatim would read ~1.0 forever
  // after, so the more the substrate grows the more inflated it becomes — the
  // failure mode gets worse with use.
  //
  // A self-match is NOT silently corrected to some other number: inventing a
  // replacement would be the same sin. It is DETECTED and reported, and the
  // caller decides. `coherencyOf` keeps returning the reading; `readingOf`
  // returns the reading with its provenance so a caller can refuse it.
  const selfMatched = _isSelfMatch(blend);
  LAST_READING = {
    coherence: value,
    blend,
    selfMatched,
    matchedPatterns: _blendNames(blend),
    // A reading that came from matching the content against itself describes
    // the library, not the content.
    measures: selfMatched ? 'library-membership' : 'artifact-shape',
  };

  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(key, value);
  return value;
}

/** Test helper: forget cached readings and re-enable start attempts. */
function _reset() {
  CACHE.clear();
  _startAttempted = false;
  _unavailable = false;
}

/**
 * The reading WITH its provenance: what the compressor matched, and whether
 * that match was the content itself. Reflects the most recent uncached read.
 *
 * @returns {{coherence, blend, selfMatched, measures}|null}
 */
function readingOf(content, opts = {}) {
  const c = coherencyOf(content, opts);
  if (LAST_READING && LAST_READING.coherence === c) return LAST_READING;
  return { coherence: c, blend: null, selfMatched: null, measures: null };
}

module.exports = { coherencyOf, readingOf, ensureUp, isUp, _reset };
