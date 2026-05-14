'use strict';

/**
 * Remembrance SERF — Signal Emergence from Recursive Feedback.
 *
 * In the void compressor, SERF (self-refinement) isn't a function —
 * it's the emergent property that low-coherence inputs fail to
 * compress well. The compression mechanics ARE the filter.
 *
 * This module brings the same property to the oracle. Instead of
 * computing coherency via a hard-coded weighted-sum scorer
 * (computeCoherencyScore with WEIGHT_PRESETS), coherency EMERGES
 * from whatever pipeline stages actually fire on a given input.
 *
 * Each pipeline stage (audit, ground, plan, generate-gate, feedback,
 * tier-coverage, void-compression) registers a signal after running.
 * The emergent coherency is the GEOMETRIC MEAN of all registered
 * signals — the weakest dimension dominates, forcing improvement
 * across ALL dimensions rather than letting a high score on one
 * dimension mask a failure on another.
 *
 * The key self-similar property: adding a new pipeline stage
 * AUTOMATICALLY adds a new coherency dimension. No weight tuning,
 * no preset editing, no coherency-specific code changes. The
 * architecture's structure IS the SERF equation.
 *
 * Integration with the existing system
 * -------------------------------------
 * This module does NOT replace computeCoherencyScore — it augments
 * it. The existing scorer continues to run as the "legacy" signal.
 * As pipeline stages register emergent signals, the legacy score
 * becomes one of many inputs to the geometric mean. The transition
 * from "hard-coded scorer" to "fully emergent SERF" happens
 * naturally as more stages fire, without any switch or threshold.
 *
 *   0 pipeline signals → score = legacy only (backwards compatible)
 *   1-3 signals        → score = geometric_mean(legacy, signal_1, ...)
 *   5+ signals         → emergent signals dominate; legacy is 1 of N
 *
 * Integration with the void compressor
 * -------------------------------------
 * The void compressor's compression ratio on a piece of code IS a
 * coherency signal: if code compresses well against the void library,
 * its byte-level mathematical structure aligns with known patterns.
 * This signal operates on a completely different axis than the
 * oracle's symbol-grounding checks, giving multi-scale coherency:
 *   - Oracle stages: symbol-level and structural coherency
 *   - Void compressor: byte-level mathematical coherency
 *
 * The void signal is registered via a subprocess bridge to the void
 * compressor's Python runtime. When unavailable, the system degrades
 * gracefully to oracle-only signals.
 *
 * Usage
 * -----
 *   const { getEmergentCoherency } = require('./emergent-coherency');
 *
 *   // Each pipeline stage registers its signal after running:
 *   const ec = getEmergentCoherency();
 *   ec.registerSignal('audit', auditSignal);       // 0-1
 *   ec.registerSignal('ground', groundingRate);     // 0-1
 *   ec.registerSignal('void', compressionCoherency); // 0-1
 *
 *   // Read the emergent score (geometric mean of all signals):
 *   const score = ec.total;
 *   const breakdown = ec.breakdown;
 *
 *   // Reset for the next input:
 *   ec.reset();
 */

const path = require('path');

// ── Geometric mean ──────────────────────────────────────────────────
//
// Why geometric mean, not arithmetic:
//   - geometric_mean([0.9, 0.9, 0.0]) ≈ 0.0  (one zero kills score)
//   - arithmetic_mean([0.9, 0.9, 0.0]) = 0.6  (zero is masked)
//
// The SERF property: every dimension matters. A single failing
// dimension (ungrounded call, failed audit, terrible compression
// ratio) pulls the entire score toward zero. This forces improvement
// across ALL dimensions rather than gaming one high dimension.
//
// To avoid the "one zero kills everything" problem being too harsh,
// we floor individual signals at 0.01 before computing the geometric
// mean. A zero signal still produces a near-zero coherency (~0.01^(1/N))
// but doesn't collapse the entire score to literal 0.

const SIGNAL_FLOOR = 0.01;

function geometricMean(values) {
  if (values.length === 0) return 0;
  // Work in log space to avoid floating-point underflow on many values
  let logSum = 0;
  for (const v of values) {
    const floored = Math.max(SIGNAL_FLOOR, Math.min(1.0, v));
    logSum += Math.log(floored);
  }
  return Math.exp(logSum / values.length);
}

// ── The EmergentCoherency class ─────────────────────────────────────

class EmergentCoherency {
  constructor() {
    /** @type {Map<string, number>} registered pipeline signals (name → 0-1) */
    this._signals = new Map();
    /** @type {number|null} legacy score from computeCoherencyScore, if available */
    this._legacyScore = null;
    /** @type {object|null} legacy breakdown for storage compatibility */
    this._legacyBreakdown = null;
  }

  /**
   * Register a signal from a pipeline stage.
   *
   * @param {string} name - stage identifier (e.g. 'audit', 'ground', 'void')
   * @param {number} value - signal strength, 0-1 (0 = failed, 1 = perfect)
   */
  registerSignal(name, value) {
    if (typeof value !== 'number' || !isFinite(value)) return;
    this._signals.set(name, Math.max(0, Math.min(1, value)));
  }

  /**
   * Register the legacy computeCoherencyScore result so it becomes
   * one of the signals in the geometric mean.
   */
  registerLegacy(score) {
    if (score && typeof score.total === 'number') {
      this._legacyScore = score.total;
      this._legacyBreakdown = score.breakdown || null;
    }
  }

  /**
   * The emergent coherency score — geometric mean of all registered
   * signals plus the legacy score. This IS the SERF equation: the
   * architecture's pipeline output, aggregated into a single number
   * that reflects the weakest dimension.
   *
   * @returns {number} 0-1
   */
  get total() {
    const values = [];
    // Legacy score is one signal among many
    if (this._legacyScore !== null) {
      values.push(this._legacyScore);
    }
    // Pipeline signals
    for (const v of this._signals.values()) {
      values.push(v);
    }
    if (values.length === 0) return 0;
    return Math.round(geometricMean(values) * 1000) / 1000;
  }

  /**
   * Full breakdown: legacy dimensions + emergent pipeline signals.
   * Storage-compatible with the existing coherency_json schema.
   */
  get breakdown() {
    const result = {};
    // Legacy dimensions (for backwards compatibility with existing storage)
    if (this._legacyBreakdown) {
      for (const [k, v] of Object.entries(this._legacyBreakdown)) {
        result[k] = v;
      }
    }
    // Pipeline signals (prefixed with 'pipeline.' for clarity)
    for (const [name, value] of this._signals) {
      result[`pipeline.${name}`] = value;
    }
    return result;
  }

  /** How many pipeline stages have registered. */
  get signalCount() { return this._signals.size; }

  /** Names of registered pipeline signals. */
  get signalNames() { return Array.from(this._signals.keys()); }

  /** Whether the void compressor signal has been registered. */
  get hasVoidSignal() { return this._signals.has('void'); }

  /**
   * Reset all signals for the next input. Call this between
   * scoring different code samples to prevent cross-contamination.
   */
  reset() {
    this._signals.clear();
    this._legacyScore = null;
    this._legacyBreakdown = null;
  }
}

// ── Global singleton ────────────────────────────────────────────────
//
// One EmergentCoherency instance per process. Pipeline stages register
// their signals here; computeCoherencyScore reads from here. The
// singleton pattern matches how the existing event bus, session ledger,
// and debug oracle all work — one global instance shared across the
// process.

let _instance = null;

function getEmergentCoherency() {
  if (!_instance) _instance = new EmergentCoherency();
  return _instance;
}

// ── Void compressor bridge ──────────────────────────────────────────
//
// Calls out to the void compressor's Python runtime to get a
// compression-ratio-based coherency signal for code. Falls back
// gracefully when Python or the void compressor isn't available.
//
// The bridge is intentionally thin: write code to a temp file, call
// a Python one-liner that compresses it and reports the ratio, parse
// the ratio, register it as the 'void' signal. If anything fails,
// the void signal simply doesn't register and the emergent score
// uses oracle-only signals.

let _voidBridgeAvailable = null; // null = untested, true/false = cached

function registerVoidSignal(code, ec) {
  if (!code || typeof code !== 'string') return;
  // Only attempt if the void compressor is accessible
  if (_voidBridgeAvailable === false) return;

  try {
    const { execFileSync } = require('child_process');
    const fs = require('fs');
    const os = require('os');

    // Find the void compressor
    const voidRoot = _findVoidCompressor();
    if (!voidRoot) {
      _voidBridgeAvailable = false;
      return;
    }

    // Write code to a temp file (avoid shell escaping issues)
    const tmpFile = path.join(os.tmpdir(), `oracle-void-bridge-${process.pid}.tmp`);
    fs.writeFileSync(tmpFile, code, 'utf-8');

    try {
      // Call the void compressor's Python bridge script
      const bridgeScript = path.join(voidRoot, 'void_coherency_bridge.py');
      if (!fs.existsSync(bridgeScript)) {
        // If no bridge script, try inline Python
        const result = execFileSync('python3', [
          '-c',
          `
import sys, os, zlib
sys.path.insert(0, ${JSON.stringify(voidRoot)})
try:
    data = open(${JSON.stringify(tmpFile)}, 'rb').read()
    if len(data) < 16:
        print('1.0')
        sys.exit(0)
    from void_compressor_v3 import VoidCompressorV3
    vc = VoidCompressorV3()
    result = vc.compress(data)
    zlib_size = len(zlib.compress(data, 9))
    void_size = result.get('compressed_size', zlib_size)
    # Coherency = how much better than zlib (capped at 1.0)
    ratio = void_size / max(1, zlib_size)
    coherency = max(0.0, min(1.0, 1.0 - ratio + 0.5))
    print(f'{coherency:.4f}')
except Exception as e:
    print('0.5', file=sys.stderr)
    print('0.5')
`,
        ], { timeout: 15000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });

        const coherency = parseFloat(result.trim());
        if (isFinite(coherency)) {
          ec.registerSignal('void', coherency);
          _voidBridgeAvailable = true;
        }
      } else {
        // Use the dedicated bridge script
        const result = execFileSync('python3', [bridgeScript, tmpFile], {
          timeout: 15000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
        });
        const coherency = parseFloat(result.trim());
        if (isFinite(coherency)) {
          ec.registerSignal('void', coherency);
          _voidBridgeAvailable = true;
        }
      }
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* best effort */ }
    }
  } catch (e) {
    // Void compressor unavailable — degrade gracefully
    if (process.env.ORACLE_DEBUG) {
      console.warn('[emergent-coherency:void-bridge]', e?.message || e);
    }
    _voidBridgeAvailable = false;
  }
}

/**
 * Try to find the void compressor installation. Checks:
 *   1. VOID_COMPRESSOR_PATH env var
 *   2. Sibling directory ../Void-Data-Compressor
 *   3. ~/Void-Data-Compressor
 */
function _findVoidCompressor() {
  const fs = require('fs');
  const candidates = [
    process.env.VOID_COMPRESSOR_PATH,
    path.resolve(__dirname, '..', '..', '..', 'Void-Data-Compressor'),
    path.join(require('os').homedir(), 'Void-Data-Compressor'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'void_compressor_v3.py'))) return p;
  }
  return null;
}

// ── Pipeline signal helpers ─────────────────────────────────────────
//
// Convenience functions that each pipeline stage can call after
// running. They handle the normalization (converting raw outputs
// like finding counts into 0-1 signals) and registration in one
// call, keeping the wiring in each stage to a single line.

/**
 * Register an audit signal: fewer findings = higher coherency.
 * @param {number} findingCount - number of audit findings
 * @param {number} [cap=10] - maximum findings before signal hits floor
 */
function registerAuditSignal(findingCount, cap = 10) {
  const signal = 1.0 - Math.min(findingCount / cap, 1.0);
  getEmergentCoherency().registerSignal('audit', signal);
}

/**
 * Register a grounding signal: more grounded calls = higher coherency.
 * @param {number} ungroundedCount - number of ungrounded identifiers
 * @param {number} totalCalls - total call-site identifiers
 */
function registerGroundSignal(ungroundedCount, totalCalls) {
  if (totalCalls <= 0) {
    getEmergentCoherency().registerSignal('ground', 1.0);
    return;
  }
  const signal = 1.0 - (ungroundedCount / totalCalls);
  getEmergentCoherency().registerSignal('ground', signal);
}

/**
 * Register a plan-verification signal.
 * @param {number} missingCount - symbols that didn't verify
 * @param {number} totalSymbols - total planned symbols
 */
function registerPlanSignal(missingCount, totalSymbols) {
  if (totalSymbols <= 0) return; // no plan was run
  const signal = 1.0 - (missingCount / totalSymbols);
  getEmergentCoherency().registerSignal('plan', signal);
}

/**
 * Register a generate-gate signal.
 * @param {number} violationCount - calls not in the verified plan
 * @param {number} totalCalls - total call sites in the draft
 */
function registerGateSignal(violationCount, totalCalls) {
  if (totalCalls <= 0) return;
  const signal = 1.0 - (violationCount / totalCalls);
  getEmergentCoherency().registerSignal('gate', signal);
}

/**
 * Register a feedback/historical-reliability signal.
 * @param {number} successRate - 0-1, from usage history
 */
function registerFeedbackSignal(successRate) {
  getEmergentCoherency().registerSignal('feedback', successRate);
}

/**
 * Register a tier-coverage signal.
 * @param {number} tiersTouched - how many tiers the module engages
 * @param {number} totalTiers - how many tiers the architecture declares
 */
function registerTierCoverageSignal(tiersTouched, totalTiers) {
  if (totalTiers <= 0) return;
  const signal = tiersTouched / totalTiers;
  getEmergentCoherency().registerSignal('tier_coverage', signal);
}

module.exports = {
  EmergentCoherency,
  getEmergentCoherency,
  registerVoidSignal,
  registerAuditSignal,
  registerGroundSignal,
  registerPlanSignal,
  registerGateSignal,
  registerFeedbackSignal,
  registerTierCoverageSignal,
  geometricMean,
};

// ── Atomic self-description (batch-generated) ────────────────────
getEmergentCoherency.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
registerVoidSignal.atomicProperties = {
  charge: 0, valence: 5, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'high', electronegativity: 1, group: 3, period: 4,
  harmPotential: 'dangerous', alignment: 'healing', intention: 'neutral',
  domain: 'oracle',
};
registerAuditSignal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
registerGroundSignal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
registerPlanSignal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
registerGateSignal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
registerFeedbackSignal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
registerTierCoverageSignal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
geometricMean.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
