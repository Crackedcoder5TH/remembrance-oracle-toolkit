'use strict';

/**
 * Quantum Core — The unified quantum mechanics engine for the entire Oracle.
 *
 * The Oracle operates as a quantum field where ALL patterns (code patterns,
 * debug fixes, candidates, history entries) are quantum states. This is not
 * a metaphor — it IS the computational model:
 *
 *   SUPERPOSITION:    A pattern exists in all possible states (useful/not useful)
 *                     until observed. Unobserved patterns have probability amplitudes.
 *
 *   OBSERVATION:      Searching for, resolving, or using a pattern is a measurement.
 *                     Measurement collapses superposition into a definite state
 *                     and updates the pattern's amplitude based on the outcome.
 *
 *   ENTANGLEMENT:     Related patterns (variants, same tags, same language family,
 *                     parent/child, debug↔main) are entangled. When one entangled
 *                     pattern's state changes, all linked patterns shift proportionally.
 *
 *   DECOHERENCE:      Patterns that haven't been observed lose coherence over time.
 *                     Their amplitude decays, modeling the reality that unused code
 *                     becomes less trustworthy as codebases evolve.
 *
 *   TUNNELING:        During observation (search/resolve), low-amplitude patterns
 *                     have a small probability of "tunneling" through the confidence
 *                     barrier to appear in results — enabling serendipitous discovery.
 *
 *   INTERFERENCE:     When multiple patterns match a query, their amplitudes interfere.
 *                     Agreeing patterns constructively interfere (boosted).
 *                     Conflicting patterns destructively interfere (reduced).
 *
 * Quantum state lifecycle for ALL patterns:
 *   1. CAPTURE    → Pattern enters the field in |superposition⟩ with initial amplitude
 *   2. OBSERVE    → Measurement collapses state, returns ranked results with interference
 *   3. FEEDBACK   → Outcome updates amplitude, propagates entanglement to linked patterns
 *   4. GROW       → Creates entangled variants, expanding the quantum field
 *   5. DECOHERE   → Time-based amplitude decay for unobserved patterns
 *
 * Amplitude formula:
 *   amplitude = coherencyScore × reliabilityFactor × freshnessBoost
 *   probability = amplitude² (Born rule)
 *   where freshnessBoost decays as e^(-λt)
 */

const crypto = require('crypto');

// ─── Quantum Constants ───

/** Minimum observable amplitude — below this, patterns are effectively invisible */
const PLANCK_AMPLITUDE = 0.2;

/** Decay rate per day (exponential model, half-life ≈ 139 days) */
const DECOHERENCE_LAMBDA = 0.005;

/** Probability of low-amplitude patterns tunneling through the barrier */
const TUNNELING_PROBABILITY = 0.08;

/** How strongly entangled states couple (amplitude shift factor) */
const ENTANGLEMENT_STRENGTH = 0.3;

/** Maximum amplitude shift from constructive/destructive interference */
const INTERFERENCE_RADIUS = 0.15;

/** Amplitude boost from being observed (measurement effect) */
const COLLAPSE_BOOST = 0.05;

/** Phase drift rate per day (affects interference calculations) */
const PHASE_DRIFT_RATE = 0.01;

/** Amplitude threshold for PULL decision (use pattern as-is) */
const PULL_THRESHOLD = 0.68;

/** Amplitude threshold for EVOLVE decision (fork & improve) */
const EVOLVE_THRESHOLD = 0.50;

/** Amplitude below which a pattern decoheres (effectively dead) */
const DECOHERENCE_FLOOR = 0.05;

/** Cascade growth trigger — amplitude above this spawns new entangled variants */
const CASCADE_THRESHOLD = 0.70;

// ─── Quantum States ───

const QUANTUM_STATES = {
  /** Not yet observed — exists in all possible states */
  SUPERPOSITION: 'superposition',
  /** Observed — definite state from measurement */
  COLLAPSED: 'collapsed',
  /** Lost coherence — amplitude below threshold */
  DECOHERED: 'decohered',
};

// ─── Field Sectors (Error/Pattern Categories) ───

/**
 * Field sectors organize the quantum field into regions.
 * For debug patterns, these map to error categories.
 * For code patterns, these map to pattern types.
 * Each sector has a weight that affects amplitude calculations.
 */
const FIELD_SECTORS = {
  // Debug sectors (error categories)
  syntax:     { weight: 1.0, type: 'debug' },
  type:       { weight: 0.9, type: 'debug' },
  reference:  { weight: 0.9, type: 'debug' },
  logic:      { weight: 0.7, type: 'debug' },
  runtime:    { weight: 0.8, type: 'debug' },
  build:      { weight: 0.6, type: 'debug' },
  network:    { weight: 0.5, type: 'debug' },
  permission: { weight: 0.5, type: 'debug' },
  async:      { weight: 0.8, type: 'debug' },
  data:       { weight: 0.7, type: 'debug' },

  // Pattern sectors (code pattern types)
  algorithm:        { weight: 0.9, type: 'pattern' },
  'data-structure': { weight: 0.9, type: 'pattern' },
  utility:          { weight: 0.8, type: 'pattern' },
  'design-pattern': { weight: 0.85, type: 'pattern' },
  validation:       { weight: 0.7, type: 'pattern' },
  transformation:   { weight: 0.7, type: 'pattern' },
  io:               { weight: 0.6, type: 'pattern' },
  concurrency:      { weight: 0.8, type: 'pattern' },
  testing:          { weight: 0.75, type: 'pattern' },
};

// ─── Amplitude Computation ───

/**
 * Compute the probability amplitude from coherency and reliability metrics.
 * This replaces the classical "composite score" with a unified quantum measurement.
 *
 * amplitude = coherency × reliabilityFactor × sectorWeight
 * where reliabilityFactor = min(1, log2(uses + 1) / 5)
 *
 * @param {object} metrics - { coherency, usageCount, successCount, sector }
 * @returns {number} Amplitude (0-1)
 */
function computeAmplitude(metrics = {}) {
  const {
    coherency = 0,
    usageCount = 0,
    successCount = 0,
    sector = null,
  } = metrics;

  if (coherency <= 0) return PLANCK_AMPLITUDE;

  // Success rate: how often does this pattern succeed when used?
  const successRate = usageCount > 0
    ? successCount / usageCount
    : 0.5; // Unknown = 50/50

  // Maturity: more uses = more trust, logarithmic saturation
  const maturity = usageCount > 0
    ? Math.min(1, Math.log2(usageCount + 1) / 5)
    : 0.3; // Unproven = low maturity

  // Sector weight
  const sectorWeight = sector && FIELD_SECTORS[sector]
    ? FIELD_SECTORS[sector].weight
    : 0.8;

  // Amplitude = coherency × (reliability blend) × sector
  const reliability = successRate * maturity;
  const amplitude = coherency * (0.6 + 0.4 * reliability) * sectorWeight;

  return Math.round(Math.max(PLANCK_AMPLITUDE, Math.min(1, amplitude)) * 1000) / 1000;
}

/**
 * Convert a classical coherency score to an initial quantum amplitude.
 * Used when bringing existing patterns into the quantum field.
 *
 * @param {number} coherencyTotal - Classical coherency score (0-1)
 * @param {object} [metadata] - { usageCount, successCount, sector }
 * @returns {number} Initial amplitude (0-1)
 */
function coherencyToAmplitude(coherencyTotal, metadata = {}) {
  return computeAmplitude({
    coherency: coherencyTotal,
    ...metadata,
  });
}

/**
 * Convert a quantum amplitude back to a classical coherency-like score.
 * Used for backward compatibility with systems expecting coherency values.
 *
 * @param {number} amplitude - Quantum amplitude (0-1)
 * @returns {number} Equivalent coherency (0-1)
 */
function amplitudeToCoherency(amplitude) {
  // Amplitude already captures quality signal, just scale it
  return Math.round(Math.min(1, amplitude * 1.1) * 1000) / 1000;
}

// ─── Decoherence (Time-Based Decay) ───

/**
 * Apply decoherence — amplitude decays exponentially with time since last observation.
 *
 * decoheredAmplitude = amplitude × e^(-λt)
 * where t = days since last observation, λ = DECOHERENCE_LAMBDA
 *
 * @param {number} amplitude - Current amplitude
 * @param {string|Date} lastObservedAt - Timestamp of last observation
 * @param {Date} [now] - Current time (default: now)
 * @returns {number} Decohered amplitude
 */
function applyDecoherence(amplitude, lastObservedAt, now) {
  if (!lastObservedAt || !amplitude) return amplitude || PLANCK_AMPLITUDE;

  const observedDate = new Date(lastObservedAt);
  const nowDate = now ? new Date(now) : new Date();
  const daysSince = Math.max(0, (nowDate.getTime() - observedDate.getTime()) / 86400000);

  if (daysSince <= 0) return amplitude;

  const factor = Math.exp(-DECOHERENCE_LAMBDA * daysSince);
  return Math.round(Math.max(0, amplitude * factor) * 1000) / 1000;
}

/**
 * Determine quantum state based on amplitude.
 *
 * @param {number} amplitude - Current amplitude
 * @param {boolean} hasBeenObserved - Whether the pattern has been observed
 * @returns {string} One of QUANTUM_STATES
 */
function determineState(amplitude, hasBeenObserved = false) {
  if (amplitude < DECOHERENCE_FLOOR) return QUANTUM_STATES.DECOHERED;
  if (hasBeenObserved) return QUANTUM_STATES.COLLAPSED;
  return QUANTUM_STATES.SUPERPOSITION;
}

// ─── Phase & Interference ───

/**
 * Compute the initial phase for a pattern — used in interference calculations.
 * Phase is derived deterministically from an identifier to ensure varied but stable phases.
 *
 * @param {string} identifier - Pattern ID, fingerprint hash, or any unique string
 * @returns {number} Phase angle (0 to 2π)
 */
function computePhase(identifier) {
  if (!identifier) return 0;
  const hex = crypto.createHash('md5').update(String(identifier)).digest('hex').slice(0, 8);
  const hashNum = parseInt(hex, 16);
  return (hashNum / 0xFFFFFFFF) * 2 * Math.PI;
}

/**
 * Compute interference between two quantum patterns.
 * Similar patterns constructively interfere (boost), different ones destructively interfere (reduce).
 *
 * @param {object} patternA - { phase, code, amplitude }
 * @param {object} patternB - { phase, code, amplitude }
 * @param {function} [similarityFn] - Optional similarity function(codeA, codeB) → 0-1
 * @returns {number} Amplitude adjustment (-INTERFERENCE_RADIUS to +INTERFERENCE_RADIUS)
 */
function computeInterference(patternA, patternB, similarityFn) {
  const phaseA = patternA.phase || 0;
  const phaseB = patternB.phase || 0;
  const phaseDiff = phaseA - phaseB;

  // Code similarity determines constructive vs destructive interference
  // Support both .code (main patterns) and .fixCode (debug patterns)
  const codeA = patternA.code || patternA.fixCode;
  const codeB = patternB.code || patternB.fixCode;
  let similarity = 0;
  if (similarityFn && codeA && codeB) {
    similarity = similarityFn(codeA, codeB);
  } else if (codeA && codeB) {
    // Inline simple Jaccard as fallback
    const setA = new Set(codeA.split(/\s+/));
    const setB = new Set(codeB.split(/\s+/));
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    similarity = union > 0 ? intersection / union : 0;
  }

  // Similar code → constructive (phases align), different → destructive
  const effectivePhase = similarity > 0.5
    ? Math.abs(phaseDiff) * 0.5
    : Math.PI - Math.abs(phaseDiff) * 0.5;

  return INTERFERENCE_RADIUS * Math.cos(effectivePhase);
}

/**
 * Apply interference from all other matches to a scored pattern.
 * Modifies the pattern's matchScore in-place.
 *
 * @param {Array} scored - Array of scored patterns with { matchScore, phase, code|fixCode }
 * @param {function} [similarityFn] - Optional similarity function
 */
function applyFieldInterference(scored, similarityFn) {
  if (scored.length < 2) return;

  for (let i = 0; i < scored.length; i++) {
    let interferenceSum = 0;
    let interferenceCount = 0;
    for (let j = 0; j < scored.length; j++) {
      if (i === j) continue;
      const interference = computeInterference(scored[i], scored[j], similarityFn);
      interferenceSum += interference;
      interferenceCount++;
    }
    if (interferenceCount > 0) {
      const avgInterference = interferenceSum / interferenceCount;
      scored[i].matchScore = Math.round(
        Math.max(0, Math.min(1, scored[i].matchScore + avgInterference)) * 1000
      ) / 1000;
      scored[i].interference = Math.round(avgInterference * 1000) / 1000;
    }
  }
}

// ─── Tunneling ───

/**
 * Quantum tunneling — can a low-amplitude pattern surface through the barrier?
 * Uses the WKB approximation: P(tunnel) ∝ e^(-2κa)
 *
 * @param {number} amplitude - Pattern's current amplitude
 * @param {number} threshold - Barrier height (minimum amplitude to appear)
 * @returns {boolean} Whether the pattern tunnels through
 */
function canTunnel(amplitude, threshold) {
  if (amplitude >= threshold) return true; // No barrier
  const barrierHeight = threshold - amplitude;
  const tunnelingProb = TUNNELING_PROBABILITY * Math.exp(-2 * barrierHeight / 0.3);
  return Math.random() < tunnelingProb;
}

// ─── Entanglement ───

/**
 * Compute entanglement shift for linked patterns when a source pattern changes.
 *
 * @param {boolean} sourceSucceeded - Did the source pattern succeed?
 * @param {number} [strength] - Entanglement coupling strength
 * @returns {number} Amplitude delta to apply to entangled patterns
 */
function computeEntanglementDelta(sourceSucceeded, strength) {
  const s = strength ?? ENTANGLEMENT_STRENGTH;
  return sourceSucceeded
    ? s * 0.1    // Positive shift on success
    : -s * 0.05; // Smaller negative shift on failure
}

/**
 * Determine if two patterns should be entangled based on their relationship.
 *
 * @param {object} patternA - { language, tags, sector, parentId }
 * @param {object} patternB - { language, tags, sector, parentId, id }
 * @returns {boolean}
 */
function shouldEntangle(patternA, patternB) {
  // Parent-child relationship
  if (patternA.parentId && patternA.parentId === patternB.id) return true;
  if (patternB.parentId && patternB.parentId === patternA.id) return true;

  // Same language + overlapping tags
  if (patternA.language === patternB.language) {
    const tagsA = new Set(patternA.tags || []);
    const tagsB = new Set(patternB.tags || []);
    const overlap = [...tagsA].filter(t => tagsB.has(t)).length;
    if (overlap >= 2) return true;
  }

  // Same field sector
  if (patternA.sector && patternA.sector === patternB.sector) return true;

  return false;
}

// ─── Decision Engine (Quantum Version) ───

/**
 * Make a PULL/EVOLVE/GENERATE decision based on quantum amplitude.
 * This replaces the classical composite-score-based decision.
 *
 * @param {number} amplitude - Pattern's decohered amplitude
 * @param {number} relevance - How relevant this pattern is to the query (0-1)
 * @returns {{ decision: string, confidence: number }}
 */
function quantumDecision(amplitude, relevance) {
  // Effective amplitude = amplitude weighted by relevance
  const effective = amplitude * (0.6 + 0.4 * relevance);

  if (effective >= PULL_THRESHOLD) {
    const __retVal = { decision: 'pull', confidence: effective };
    // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.confidence || 0)), source: 'oracle:quantum-core:shouldEntangle' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
    return __retVal;
  }
  if (effective >= EVOLVE_THRESHOLD) {
    return { decision: 'evolve', confidence: effective };
  }
  return { decision: 'generate', confidence: effective };
}

// ─── Observation (Measurement) ───

/**
 * Score a pattern during observation (search/resolve).
 * Applies decoherence, Born rule, and returns an observation-ready score.
 *
 * @param {object} pattern - { amplitude, lastObservedAt, observationCount, phase }
 * @param {number} baseRelevance - How relevant this pattern is (0-1)
 * @param {object} [options] - { now, languageMatch }
 * @returns {{ observedAmplitude: number, matchScore: number, bornProbability: number }}
 */
function observePattern(pattern, baseRelevance, options = {}) {
  const now = options.now || new Date().toISOString();
  const rawAmplitude = pattern.amplitude || PLANCK_AMPLITUDE;
  const decohered = applyDecoherence(rawAmplitude, pattern.lastObservedAt, now);

  // Born rule: probability ∝ amplitude²
  const bornProbability = decohered * decohered;

  // Observation boost for frequently-observed patterns
  const observationBoost = Math.min(0.1, (pattern.observationCount || 0) * 0.01);

  // Language match bonus
  const languageBonus = options.languageMatch ? 0.15 : 0;

  // Final match score
  const matchScore = Math.round(
    Math.min(1, baseRelevance + bornProbability * 0.3 + observationBoost + languageBonus) * 1000
  ) / 1000;

  return { observedAmplitude: decohered, matchScore, bornProbability };
}

// ─── Exports ───

module.exports = {
  // Constants
  PLANCK_AMPLITUDE,
  DECOHERENCE_LAMBDA,
  TUNNELING_PROBABILITY,
  ENTANGLEMENT_STRENGTH,
  INTERFERENCE_RADIUS,
  COLLAPSE_BOOST,
  PHASE_DRIFT_RATE,
  PULL_THRESHOLD,
  EVOLVE_THRESHOLD,
  DECOHERENCE_FLOOR,
  CASCADE_THRESHOLD,
  QUANTUM_STATES,
  FIELD_SECTORS,

  // Amplitude
  computeAmplitude,
  coherencyToAmplitude,
  amplitudeToCoherency,

  // Decoherence
  applyDecoherence,
  determineState,

  // Phase & Interference
  computePhase,
  computeInterference,
  applyFieldInterference,

  // Tunneling
  canTunnel,

  // Entanglement
  computeEntanglementDelta,
  shouldEntangle,

  // Decision
  quantumDecision,

  // Observation
  observePattern,
};
