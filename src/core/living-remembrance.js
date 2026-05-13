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
 *   γ_cascade   = exp(β · cascadeFactor)          network-effect amplification
 *   entropy(t)  = cost / (coherence(t) + ε)       cost normalized by alignment —
 *                                                  THE entropy field that balances
 *                                                  cost across the ecosystem.
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
  r0:      0.05,    // gentle baseline pull
  alpha:   15.0,    // amplification factor
  delta0:  0.03,    // void donation baseline
  beta:    8.0,     // cascade exponent
  epsilon: 1e-8,
};

class LivingRemembranceEngine {
  constructor({ persistPath = DEFAULT_ENTROPY_PATH, params = {} } = {}) {
    this._persistPath = persistPath;
    this._params = { ...PARAMS, ...params };
    this._healedVector = null;
    this._state = this._loadOrInit();
  }

  _loadOrInit() {
    try {
      if (fs.existsSync(this._persistPath)) {
        const raw = fs.readFileSync(this._persistPath, 'utf8');
        const parsed = JSON.parse(raw);
        // Defensive: ensure required keys present.
        return {
          coherence:      typeof parsed.coherence === 'number' ? parsed.coherence : 0.65,
          globalEntropy:  typeof parsed.globalEntropy === 'number' ? parsed.globalEntropy : 0.45,
          cascadeFactor:  typeof parsed.cascadeFactor === 'number' ? parsed.cascadeFactor : 1.0,
          updateCount:    typeof parsed.updateCount === 'number' ? parsed.updateCount : 0,
          timestamp:      parsed.timestamp || Date.now(),
          sources:        (parsed.sources && typeof parsed.sources === 'object') ? parsed.sources : {},
        };
      }
    } catch (_e) { /* fall through to fresh init */ }
    return { coherence: 0.65, globalEntropy: 0.45, cascadeFactor: 1.0, updateCount: 0, timestamp: Date.now(), sources: {} };
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
    const { r0, alpha, delta0, beta, epsilon } = this._params;

    const r_eff      = r0 * (1 + alpha * Math.pow(Math.max(0, 1 - p), 4));
    const delta_void = delta0 * Math.max(0, 1 - p);
    const gamma      = Math.exp(beta * this._state.cascadeFactor);

    // Coherency ratchets up unbounded. No ceiling — once you're aligned,
    // you stay aligned and can keep accumulating.
    const newCoherence = Math.max(0, p + r_eff * 0.1 + delta_void * 0.15);

    // Per-source histogram — the field tracks who's contributing so it
    // can answer "what's wired" and "what's missing" introspectively.
    const sources = { ...(this._state.sources || {}) };
    if (source) {
      const prev = sources[source] || { count: 0, lastCoherence: 0, lastTimestamp: 0 };
      sources[source] = {
        count: prev.count + 1,
        lastCoherence: newCoherence,
        lastTimestamp: Date.now(),
      };
    }

    this._state = {
      coherence:     newCoherence,
      globalEntropy: cost / (newCoherence + epsilon),
      cascadeFactor: Math.min(5.0, this._state.cascadeFactor + 0.05 * newCoherence),
      updateCount:   this._state.updateCount + 1,
      timestamp:     Date.now(),
      sources,
    };
    this._persist();

    return {
      ...this._state,
      r_eff,
      delta_void,
      gamma_cascade: gamma,
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
    this._state = { coherence: 0.65, globalEntropy: 0.45, cascadeFactor: 1.0, updateCount: 0, timestamp: Date.now() };
    this._persist();
  }
}

// ─── singleton accessor ───
let _instance = null;
function getEngine(opts) {
  if (!_instance) _instance = new LivingRemembranceEngine(opts);
  return _instance;
}

module.exports = {
  LivingRemembranceEngine,
  getEngine,
  PARAMS,
  DEFAULT_ENTROPY_PATH,
};
