'use strict';

/**
 * Unified Quantum Scorer — single measurement that fuses Quantum, Fractal, and Audit.
 *
 * Before this module, three systems ran as independent post-processing passes:
 *   1. Fractal alignment  → appended resonance info to resolve result
 *   2. Quantum observation → collapsed state and tracked amplitude
 *   3. Audit bug-class    → scanned for risky patterns and appended warnings
 *
 * They never talked to each other. This module unifies them into a single
 * quantum measurement where:
 *
 *   - COHERENCY (8 dims, includes fractal alignment) feeds the base amplitude
 *   - AUDIT findings act as DECOHERENCE — bugs reduce trustworthiness
 *   - FRACTAL dominant type determines the QUANTUM SECTOR — affecting sector weight
 *   - The final amplitude incorporates all three signals into ONE confidence number
 *   - The PULL/EVOLVE/GENERATE decision comes from that unified amplitude
 *
 * The individual engines (fractal math, quantum mechanics, audit checkers) are
 * unchanged — this module orchestrates their outputs into a single measurement.
 */

// ─── Quantum Core (the physics engine) ───
const {
  computeAmplitude,
  applyDecoherence,
  computePhase,
  applyFieldInterference,
  quantumDecision,
  observePattern,
  canTunnel,
  PLANCK_AMPLITUDE,
  PULL_THRESHOLD,
  EVOLVE_THRESHOLD,
  QUANTUM_STATES,
  FIELD_SECTORS,
} = require('../quantum/quantum-core');

// ─── Coherency (the 8-dimension scorer) ───
const { computeCoherencyScore } = require('./coherency');

// ─── Fractal alignment (graceful) ───
let _computeFractalAlignment, _selectResonantFractal;
try {
  ({
    computeFractalAlignment: _computeFractalAlignment,
    selectResonantFractal: _selectResonantFractal,
  } = require('../fractals'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[quantum-scorer:init] Fractal system not available:', e?.message || e);
}

// ─── Audit bug-class checker (graceful) ───
let _checkResolvedCode;
try {
  ({ checkResolvedCode: _checkResolvedCode } = require('../audit/resolve-hook'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[quantum-scorer:init] Audit system not available:', e?.message || e);
}

// ─── Audit Decoherence Mapping ───
// Bug class findings reduce amplitude proportionally to their severity.
// This models the physical reality: known defects reduce trustworthiness.

const AUDIT_DECOHERENCE = {
  'security':       0.15,  // High severity — crypto, injection, XSS
  'concurrency':    0.12,  // High severity — deadlocks, races
  'state-mutation': 0.08,  // Medium severity — .sort() without .slice()
  'type':           0.06,  // Medium severity — division by zero, unchecked JSON.parse
  'integration':    0.05,  // Low-medium — null returns not checked
  'edge-case':      0.03,  // Low severity — switch without default
};

// ─── Fractal-to-Sector Mapping ───
// The dominant fractal type determines the quantum field sector,
// which affects the sector weight in amplitude calculation.

const FRACTAL_SECTOR_MAP = {
  // By fractal name (from dominantFractal)
  sierpinski:  'algorithm',        // Sierpinski  → recursive/algorithmic code
  mandelbrot:  'validation',       // Mandelbrot  → boundary-checking/validation code
  barnsley:    'design-pattern',   // Barnsley    → branching/dispatch patterns
  julia:       'utility',          // Julia       → configurable/stable utility code
  lyapunov:    'transformation',   // Lyapunov    → sorting/ordering/normalization
  // By dimension name (alternative lookup)
  selfSimilarity:   'algorithm',
  boundaryDepth:    'validation',
  growthCascade:    'design-pattern',
  stabilityTuning:  'utility',
  orderNavigation:  'transformation',
};

// ─── Unified Measurement ───

/**
 * Perform a unified quantum measurement on code.
 *
 * This is the single function that replaces three separate passes. It:
 *   1. Computes coherency (8 dims, includes fractal alignment)
 *   2. Computes fractal alignment → determines quantum sector
 *   3. Runs audit bug-class check → converts to decoherence penalty
 *   4. Computes quantum amplitude incorporating all signals
 *   5. Returns unified confidence with sub-scores for transparency
 *
 * @param {string} code - The code to measure
 * @param {object} [options] - Measurement options
 * @param {string} [options.language] - Code language
 * @param {string} [options.description] - Task description (for fractal selection)
 * @param {object} [options.pattern] - Pattern metadata (id, name, tags, sector, usageCount, successCount)
 * @param {object} [options.quantumState] - Existing quantum state (amplitude, lastObservedAt, observationCount, phase)
 * @param {number} [options.relevance] - How relevant this pattern is to the query (0-1)
 * @param {boolean} [options.testPassed] - Did the code pass tests?
 * @param {string} [options.testCode] - Test code for coverage gate
 * @param {number} [options.historicalReliability] - Historical reliability (0-1)
 * @param {string} [options.preset] - Coherency weight preset ('oracle', 'reflector', 'full')
 * @returns {object} Unified measurement result
 */
function unifiedMeasurement(code, options = {}) {
  if (!code || typeof code !== 'string') {
    return {
      amplitude: PLANCK_AMPLITUDE,
      confidence: 0,
      decision: 'generate',
      coherency: { total: 0, breakdown: {} },
      fractal: null,
      audit: { warnings: [], decoherencePenalty: 0 },
      quantum: { state: QUANTUM_STATES.SUPERPOSITION, sector: null, sectorWeight: 0.8 },
      unified: true,
    };
  }

  const {
    language,
    description = '',
    pattern = {},
    quantumState = {},
    relevance = 0.5,
    testPassed,
    testCode,
    historicalReliability,
    preset = 'oracle',
  } = options;

  // ─── Step 1: Coherency (includes fractal as dimension 8) ───
  const coherency = computeCoherencyScore(code, {
    language,
    testPassed,
    testCode,
    historicalReliability,
    preset,
  });

  // ─── Step 2: Fractal Alignment → Quantum Sector ───
  let fractal = null;
  let sector = pattern.sector || null;
  let sectorWeight = 0.8; // default

  if (_computeFractalAlignment) {
    try {
      const alignment = _computeFractalAlignment(code, language);
      const resonant = _selectResonantFractal
        ? _selectResonantFractal(code, description)
        : null;

      fractal = {
        alignment: alignment.composite,
        dimensions: alignment.dimensions,
        dominantFractal: alignment.dominantFractal,
        resonantTemplate: resonant
          ? { fractal: resonant.fractal, resonance: resonant.resonance, reason: resonant.reason }
          : null,
      };

      // Map dominant fractal to quantum sector (if no sector already assigned)
      // dominantFractal can be a fractal name ("mandelbrot") or dimension name ("boundaryDepth")
      if (!sector && alignment.dominantFractal) {
        sector = FRACTAL_SECTOR_MAP[alignment.dominantFractal] || null;
      }

      // Use sector weight from FIELD_SECTORS
      if (sector && FIELD_SECTORS[sector]) {
        sectorWeight = FIELD_SECTORS[sector].weight;
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[quantum-scorer] Fractal alignment failed:', e?.message || e);
    }
  }

  // ─── Step 3: Audit Bug-Class Check → Decoherence Penalty ───
  let auditWarnings = [];
  let auditDecoherencePenalty = 0;

  if (_checkResolvedCode) {
    try {
      auditWarnings = _checkResolvedCode(code);
      // Each finding applies a decoherence penalty based on bug class severity
      for (const warning of auditWarnings) {
        const penalty = AUDIT_DECOHERENCE[warning.bugClass] || 0.03;
        auditDecoherencePenalty += penalty;
      }
      // Cap total penalty at 0.4 — even buggy code retains some signal
      auditDecoherencePenalty = Math.min(0.4, auditDecoherencePenalty);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[quantum-scorer] Audit check failed:', e?.message || e);
    }
  }

  // ─── Step 4: Compute Unified Amplitude ───
  // Base amplitude from coherency + reliability + sector
  const baseAmplitude = computeAmplitude({
    coherency: coherency.total,
    usageCount: pattern.usageCount || 0,
    successCount: pattern.successCount || 0,
    sector,
  });

  // Apply time-based decoherence
  const timeDecohered = quantumState.lastObservedAt
    ? applyDecoherence(baseAmplitude, quantumState.lastObservedAt)
    : baseAmplitude;

  // Apply audit decoherence (bug findings reduce amplitude)
  const auditDecohered = timeDecohered * (1 - auditDecoherencePenalty);

  // Final amplitude: clamped to [PLANCK_AMPLITUDE, 1.0]
  const finalAmplitude = Math.round(
    Math.max(PLANCK_AMPLITUDE, Math.min(1.0, auditDecohered)) * 1000
  ) / 1000;

  // ─── Step 5: Unified Decision ───
  const { decision, confidence } = quantumDecision(finalAmplitude, relevance);

  // Check for audit-driven override: security/concurrency bugs downgrade PULL → EVOLVE
  let auditOverride = null;
  if (decision === 'pull' && auditWarnings.length > 0) {
    const hasHighSeverity = auditWarnings.some(w =>
      w.bugClass === 'security' || w.bugClass === 'concurrency'
    );
    if (hasHighSeverity) {
      auditOverride = {
        originalDecision: 'pull',
        newDecision: 'evolve',
        reason: `Bug class warnings: ${auditWarnings.map(w => w.name).join(', ')}`,
      };
    }
  }

  const effectiveDecision = auditOverride ? auditOverride.newDecision : decision;

  return {
    // The unified output
    amplitude: finalAmplitude,
    confidence,
    decision: effectiveDecision,

    // Sub-scores for transparency (consumers can still inspect internals)
    coherency: {
      total: coherency.total,
      breakdown: coherency.breakdown,
      language: coherency.language,
    },
    fractal,
    audit: {
      warnings: auditWarnings,
      decoherencePenalty: Math.round(auditDecoherencePenalty * 1000) / 1000,
      override: auditOverride,
    },
    quantum: {
      state: quantumState.quantum_state || QUANTUM_STATES.SUPERPOSITION,
      baseAmplitude,
      timeDecohered: Math.round(timeDecohered * 1000) / 1000,
      sector,
      sectorWeight,
      phase: quantumState.phase || computePhase(pattern.id || code.slice(0, 64)),
    },

    // Flag that this came from the unified scorer
    unified: true,
  };
}

/**
 * Perform unified measurement on multiple candidate patterns and apply field interference.
 *
 * When resolving a query with multiple matches, patterns interfere:
 *   - Similar code constructively interferes (boosted)
 *   - Dissimilar code destructively interferes (reduced)
 *
 * @param {Array<{ code: string, options: object }>} candidates - Patterns to measure
 * @param {function} [similarityFn] - Code similarity function (codeA, codeB) → 0-1
 * @returns {Array<object>} Measured candidates sorted by amplitude (descending)
 */
function unifiedFieldMeasurement(candidates, similarityFn) {
  if (!candidates || candidates.length === 0) return [];

  // Measure each candidate independently
  const measured = candidates.map(({ code, options }) => {
    const result = unifiedMeasurement(code, options);
    return {
      ...result,
      code,
      matchScore: result.amplitude,
      phase: result.quantum.phase,
    };
  });

  // Apply field interference between all measured candidates
  if (measured.length >= 2) {
    applyFieldInterference(measured, similarityFn);
  }

  // Re-derive decisions after interference adjusts matchScores
  for (const m of measured) {
    m.amplitude = m.matchScore; // interference-adjusted
    const { decision, confidence } = quantumDecision(m.amplitude, m.confidence);
    m.decision = decision;
    m.confidence = confidence;

    // Re-check audit override after interference
    if (m.audit?.override && m.decision !== 'pull') {
      m.audit.override = null; // no longer needed if already not PULL
    }
  }

  // Sort by amplitude descending
  measured.sort((a, b) => b.amplitude - a.amplitude);

  return measured;
}

/**
 * Quick confidence check — compute unified amplitude without full measurement.
 * Useful for filtering candidates before expensive operations.
 *
 * @param {string} code - Code to check
 * @param {object} [options] - { language, sector }
 * @returns {number} Quick amplitude estimate (0-1)
 */
function quickAmplitude(code, options = {}) {
  if (!code || typeof code !== 'string') return PLANCK_AMPLITUDE;

  const coherency = computeCoherencyScore(code, {
    language: options.language,
    preset: 'oracle',
  });

  let auditPenalty = 0;
  if (_checkResolvedCode) {
    try {
      const warnings = _checkResolvedCode(code);
      for (const w of warnings) {
        auditPenalty += AUDIT_DECOHERENCE[w.bugClass] || 0.03;
      }
      auditPenalty = Math.min(0.4, auditPenalty);
    } catch (_) { /* graceful */ }
  }

  const base = computeAmplitude({
    coherency: coherency.total,
    sector: options.sector,
  });

  return Math.round(Math.max(PLANCK_AMPLITUDE, base * (1 - auditPenalty)) * 1000) / 1000;
}

module.exports = {
  unifiedMeasurement,
  unifiedFieldMeasurement,
  quickAmplitude,

  // Re-export constants for consumers
  AUDIT_DECOHERENCE,
  FRACTAL_SECTOR_MAP,
};

// ── Atomic self-description ─────────────────────────────────────────
// The oracle's own functions are elements in the periodic table.
// These declarations make the oracle atomically coded native —
// its structure IS its atomic description.

unifiedMeasurement.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'high', electronegativity: 0.9, group: 18, period: 7,
};
