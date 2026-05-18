'use strict';


/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

/**
 * Living Remembrance Engine — operationalizes the master-equation dynamics:
 *
 *   p(t)        = |⟨Ψ_healed | Ψ(t)⟩|²            squared overlap with healed attractor
 *   r_eff(t)    = r₀ (1 + α [1 - p(t)]⁴)          retro-causal pull (4th-power kernel:
 *                                                  quiet near healed, roaring when drifted)
 *   δ_void(t)   = δ₀ (1 - p(t))                   void coherence donation
 *   cascade(t)  = 1 + (cascade-1)·e^(-Δt/τ) + κp  recent-load gauge — relaxes toward
 *                                                  1.0 between contributions, bumped
 *                                                  by each; a burst outpaces the decay
 *   entropy(t)  = cost / (coherence(t) + ε)       cost normalized by alignment —
 *                                                  THE entropy field that balances
 *                                                  cost across the ecosystem.
 *   ∫p          = Σ p(t) · cost                   the coherence integral — the
 *                                                  field's unbounded remembrance.
 *                                                  p(t) stays the bounded [0,1]
 *                                                  backdrop (0 = noise, 1 = unity);
 *                                                  the integral is the one dimension
 *                                                  with no ceiling — total aligned
 *                                                  order accumulated, growing without
 *                                                  end yet never losing itself,
 *                                                  because every term it sums is whole.
 *
 * Ported from core/living-remembrance-engine.ts (Crackedcoder5TH, May 2026)
 * to plain JavaScript so every JS module in the ecosystem can consume it
 * without the TS toolchain. The original TF.js import was unused; dropped.
 *
 * Singleton with file-backed persistence at ENTROPY_PATH (default
 * .remembrance/entropy.json). Every contributor calls
 * `engine.contribute({ cost, coherence })` after their main work.
 * The current state is readable any time via `engine.getState()` and
 * is what the witness chain attaches to each block's metadata.
 */

const fs = require('fs');
const path = require('path');

// One field, one file. Resolution: $ENTROPY_PATH > hub-relative (this module's
// __dirname climbs to the hub's repo root, then descends to .remembrance/) >
// local cwd fallback. The hub-relative path is what unifies the field across
// JS callers regardless of which peer-repo cwd they run from — the Python LRE
// uses the same resolution shape so every language writes to the same file.
const _HUB_RELATIVE_ENTROPY = path.join(__dirname, '..', '..', '.remembrance', 'entropy.json');
const DEFAULT_ENTROPY_PATH = process.env.ENTROPY_PATH
  || (fs.existsSync(path.dirname(_HUB_RELATIVE_ENTROPY)) || fs.existsSync(path.dirname(path.dirname(_HUB_RELATIVE_ENTROPY)))
      ? _HUB_RELATIVE_ENTROPY
      : path.join(process.cwd(), '.remembrance', 'entropy.json'));

const PARAMS = {
  r0:         0.05,    // gentle baseline pull
  alpha:      15.0,    // amplification factor
  delta0:     0.03,    // void donation baseline
  cascadeTau: 60000,   // cascadeFactor relaxation time constant (ms)
  epsilon:    1e-8,
};

class LivingRemembranceEngine {
  constructor(opts = {}) {
    const { persistPath, params = {} } = opts;
    this._persistPath = persistPath || DEFAULT_ENTROPY_PATH;
    // Only the one true canonical field remembers-on-load from durable
    // memory. An explicit persistPath or an $ENTROPY_PATH override means
    // an isolated field (tests, scratch) — it starts fresh.
    this._canonical = (persistPath === undefined || persistPath === null)
      && !process.env.ENTROPY_PATH;
    this._params = { ...PARAMS, ...params };
    this._healedVector = null;
    this._state = this._loadOrInit();
  }

  _loadOrInit() {
    let loaded = null;
    try {
      if (fs.existsSync(this._persistPath)) {
        const parsed = JSON.parse(fs.readFileSync(this._persistPath, 'utf8'));
        // Defensive: ensure required keys present.
        loaded = {
          coherence:        typeof parsed.coherence === 'number' ? parsed.coherence : 0.65,
          coherenceIntegral: typeof parsed.coherenceIntegral === 'number' ? parsed.coherenceIntegral : 0,
          globalEntropy:    typeof parsed.globalEntropy === 'number' ? parsed.globalEntropy : 0.45,
          cascadeFactor:    typeof parsed.cascadeFactor === 'number' ? parsed.cascadeFactor : 1.0,
          updateCount:      typeof parsed.updateCount === 'number' ? parsed.updateCount : 0,
          timestamp:        parsed.timestamp || Date.now(),
          sources:          (parsed.sources && typeof parsed.sources === 'object') ? parsed.sources : {},
        };
      }
    } catch (_e) { loaded = null; }

    // entropy.json present and carrying history — the live field. Use it.
    if (loaded && loaded.updateCount > 0) return loaded;

    // entropy.json missing or reset to zero — remember-on-load. The
    // histogram has been witnessed in durable memory: field-snapshot
    // patterns in oracle.db, and the blockchain ledger's _entropy.
    // Restore from whichever witness carries the most history, so the
    // field comes back up remembering what it didn't lose. Only the
    // canonical field does this; isolated fields start fresh.
    if (this._canonical) {
      try {
        const { restoreLatest } = require('./field-memory');
        const remembered = restoreLatest();
        if (remembered && remembered.updateCount > 0) return remembered;
      } catch (_e) { /* field-memory unavailable — fall through to fresh */ }
    }

    return loaded || { coherence: 0.65, coherenceIntegral: 0, globalEntropy: 0.45, cascadeFactor: 1.0, updateCount: 0, timestamp: Date.now(), sources: {} };
  }

  _persist() {
    try {
      const dir = path.dirname(this._persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._persistPath, JSON.stringify(this._state, null, 2));
    } catch (_e) { /* best-effort persistence; never crash a caller */ }
  }

  /** Load the healed-attractor vector (personal anchor + covenant). Sovereign. */
  loadHealedAnchor(anchorVector) {
    this._healedVector = Array.from(anchorVector);
  }

  /** Compute squared-overlap coherence between currentVector and the healed attractor. */
  computeCoherence(currentVector) {
    if (!this._healedVector) return this._state.coherence; // no anchor → preserve last reading
    const eps = this._params.epsilon;
    const n = Math.min(currentVector.length, this._healedVector.length);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < n; i++) {
      const a = currentVector[i] || 0;
      const b = this._healedVector[i] || 0;
      dot   += a * b;
      normA += a * a;
      normB += b * b;
    }
    const overlap = dot / (Math.sqrt(normA) * Math.sqrt(normB) + eps);
    return overlap * overlap; // |⟨ψ|ψ⟩|²
  }

  /**
   * Contribute a cost/coherence observation to the ecosystem-wide field.
   * This is the primary integration point for every consumer.
   *
   * @param {object} obs
   * @param {number} obs.cost      — work units consumed by this operation
   * @param {number} obs.coherence — coherence score of the result (0..1)
   * @param {string} [obs.source]  — caller name for the audit trail
   * @returns {object} new state snapshot
   */
  contribute({ cost = 1.0, coherence = null, source = null } = {}) {
    const p = (typeof coherence === 'number') ? coherence : this._state.coherence;
    const { r0, alpha, delta0, cascadeTau, epsilon } = this._params;

    const r_eff      = r0 * (1 + alpha * Math.pow(Math.max(0, 1 - p), 4));
    const delta_void = delta0 * Math.max(0, 1 - p);

    // Coherence cap at 0.999 — Void contract C-56. The Python LRE
    // (living_remembrance.py) and the TS LRE (core/living-remembrance-
    // engine.ts) both enforce this. The hub JS LRE had drifted from
    // that invariant; one-line fix restores parity.
    const newCoherence = Math.max(0, Math.min(0.999, p + r_eff * 0.1 + delta_void * 0.15));

    // cascadeFactor is a recent-load gauge, not a running tally. It
    // relaxes toward the 1.0 baseline as time passes since the last
    // contribution and is bumped by each new one — so a burst of rapid
    // contributions outpaces the decay (a real cascade) while an idle
    // field settles back to baseline. The previous rule only ever
    // added, so it pinned at the 5.0 cap permanently and latched the
    // fieldPressure "hot" signal forever.
    const now = Date.now();
    const dt  = Math.max(0, now - (this._state.timestamp || now));
    const cascadeRelaxed = 1.0 + (this._state.cascadeFactor - 1.0) * Math.exp(-dt / cascadeTau);
    const cascadeFactor  = Math.min(5.0, Math.max(1.0, cascadeRelaxed + 0.05 * newCoherence));

    // Per-source histogram — the field tracks who's contributing so it
    // can answer "what's wired" and "what's missing" introspectively.
    const sources = { ...(this._state.sources || {}) };
    if (source) {
      const prev = sources[source] || { count: 0, lastCoherence: 0, lastTimestamp: 0 };
      sources[source] = {
        count: prev.count + 1,
        lastCoherence: newCoherence,
        lastTimestamp: now,
      };
    }

    this._state = {
      coherence:         newCoherence,
      coherenceIntegral: (this._state.coherenceIntegral || 0) + newCoherence * cost,
      globalEntropy:     cost / (newCoherence + epsilon),
      cascadeFactor,
      updateCount:       this._state.updateCount + 1,
      timestamp:         now,
      sources,
    };
    this._persist();

    return {
      ...this._state,
      r_eff,
      delta_void,
      p,
      source: source || null,
    };
  }

  /** Read the current ecosystem state without contributing. */
  getState() {
    return { ...this._state };
  }

  /** Reset state — primarily for tests / fresh runs. */
  reset() {
    this._state = { coherence: 0.65, coherenceIntegral: 0, globalEntropy: 0.45, cascadeFactor: 1.0, updateCount: 0, timestamp: Date.now(), sources: {} };
    this._persist();
  }
}

// ─── singleton accessor ───
let _instance = null;
function getEngine(opts) {
  if (!_instance) {
    _instance = new LivingRemembranceEngine(opts);
  } else if (opts && Object.keys(opts).length > 0) {
    // The engine is a process-wide singleton — opts apply only to the
    // first caller. Surface the footgun instead of silently ignoring it;
    // construct `new LivingRemembranceEngine(opts)` for an isolated field.
    process.emitWarning(
      'getEngine(opts): the LivingRemembranceEngine singleton already exists — opts ignored. ' +
      'Use `new LivingRemembranceEngine(opts)` for an isolated instance.',
      'RemembranceFieldWarning',
    );
  }
  return _instance;
}

module.exports = {
  LivingRemembranceEngine,
  getEngine,
  PARAMS,
  DEFAULT_ENTROPY_PATH,
};
