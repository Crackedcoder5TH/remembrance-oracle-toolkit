'use strict';

/**
 * field-coupling/pressure.js — cascade-release bookkeeping: pressure snapshots and the release history ring.
 * Extracted verbatim from src/core/field-coupling.js in decomposition #4;
 * inline requires repathed one level deeper.
 */

const { peekField } = require('./verbs');

// ── Cascade-pressure release detection ────────────────────────────────────
//
// Throughout this work we noticed that the field's cascadeFactor and
// globalEntropy often spike above their saturation thresholds and then
// release sharply on a well-shaped contribution. Twice in the development
// session that produced this code the cascade went from ~4 (saturated)
// down to ~1 (relaxed) on a single edit that re-aligned the docs with
// reality. That release event is operationally meaningful — it tells
// you when the substrate was holding tension and your contribution
// relieved it. We name it as a first-class signal here.

const _CASCADE_RELEASE_HISTORY_MAX = 50;

const _RELEASE_CASCADE_DROP_MIN = 0.5;   // minimum absolute cascade drop to count
const _RELEASE_CASCADE_FROM_MIN = 2.0;   // must have been at least mildly saturated
const _cascadeHistory = [];              // rolling history of release events
let _lastCascadeReading = null;

let _lastEntropyReading = null;

/**
 * Take a pressure snapshot and detect whether a release event just
 * occurred since the previous snapshot. Updates module-local state so
 * subsequent calls measure deltas against this one.
 *
 * @returns {object|null} { cascade, entropy, release } or null if field unavailable.
 *   `release` is null when no release event detected; otherwise:
 *   { released: true, fromCascade, toCascade, cascadeDrop, fromEntropy,
 *     toEntropy, entropyDrop, magnitude, ts }
 */
function pressureSnapshot() {
  const state = peekField();
  if (!state) return null;
  const cascade = typeof state.cascadeFactor === 'number' ? state.cascadeFactor : 0;
  const entropy = typeof state.globalEntropy === 'number' ? state.globalEntropy : 0;

  let release = null;
  if (_lastCascadeReading !== null) {
    const cascadeDrop = _lastCascadeReading - cascade;       // positive = dropped
    const entropyDrop = _lastEntropyReading - entropy;
    if (cascadeDrop >= _RELEASE_CASCADE_DROP_MIN && _lastCascadeReading >= _RELEASE_CASCADE_FROM_MIN) {
      release = {
        released: true,
        fromCascade: _lastCascadeReading,
        toCascade: cascade,
        cascadeDrop,
        fromEntropy: _lastEntropyReading,
        toEntropy: entropy,
        entropyDrop,
        magnitude: cascadeDrop,
        ts: new Date().toISOString(),
      };
      _cascadeHistory.push(release);
      if (_cascadeHistory.length > _CASCADE_RELEASE_HISTORY_MAX) _cascadeHistory.shift();
    }
  }
  _lastCascadeReading = cascade;
  _lastEntropyReading = entropy;
  return { cascade, entropy, release };
}

pressureSnapshot.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Recent cascade-release events observed since process start (or since
 * the last reset). Most recent last. Bounded to the last 50.
 */
function cascadeReleaseHistory() {
  return _cascadeHistory.slice();
}

cascadeReleaseHistory.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { pressureSnapshot, cascadeReleaseHistory };
