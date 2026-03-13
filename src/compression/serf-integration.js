/**
 * SERF × Compression Integration
 *
 * Wires the SERF reflection/healing engine into the fractal compression
 * and holographic encoding systems:
 *
 *   1. SERF-scored compression priority — high-coherence patterns compress first
 *   2. Fractal family group healing — SERF heals families together
 *   3. SERF dimensions in holographic embeddings — 5D scores fill dims 8-12
 *   4. Post-compression SERF validation — verify reconstruction coherence
 */

const { observeCoherence } = require('../core/reflection-scorers');
const { reflectionLoop } = require('../core/reflection-loop');
const { reconstruct } = require('./fractal');

// ─── 1. SERF-scored compression priority ───

/**
 * Sort patterns by SERF coherence for compression priority.
 * High-coherence patterns are stable (unlikely to change from healing),
 * making them better candidates for template extraction.
 *
 * @param {Array} patterns — Array of pattern objects
 * @returns {Array} Patterns sorted by SERF composite coherence (descending)
 */
function prioritizeForCompression(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];

  return patterns
    .map(p => {
      const serf = observeCoherence(p.code || '', { language: p.language });
      return { ...p, _serfCoherence: serf.composite, _serfDimensions: serf.dimensions };
    })
    .sort((a, b) => b._serfCoherence - a._serfCoherence);
}

/**
 * Filter patterns that meet a minimum SERF coherence for compression.
 * Patterns below the threshold are still healing and shouldn't be compressed yet.
 *
 * @param {Array} patterns — Array of pattern objects
 * @param {number} [minCoherence=0.6] — Minimum SERF composite coherence
 * @returns {{ ready: Array, healing: Array }} Partitioned patterns
 */
function partitionByReadiness(patterns, minCoherence = 0.6) {
  const ready = [];
  const healing = [];

  for (const p of patterns) {
    const serf = observeCoherence(p.code || '', { language: p.language });
    if (serf.composite >= minCoherence) {
      ready.push({ ...p, _serfCoherence: serf.composite, _serfDimensions: serf.dimensions });
    } else {
      healing.push({ ...p, _serfCoherence: serf.composite, _serfDimensions: serf.dimensions });
    }
  }

  return { ready, healing };
}

// ─── 2. Fractal family group healing ───

/**
 * Heal an entire fractal family using SERF.
 *
 * When one family member heals well with a specific strategy (e.g., "simplify"),
 * that same strategy is applied to all siblings. This exploits structural
 * similarity — patterns with the same skeleton respond to the same transforms.
 *
 * @param {Array} familyPatterns — Patterns in the same fractal family
 * @param {Object} [options] — { maxLoops, targetCoherence }
 * @returns {Object} { healed: Array, bestStrategy, avgImprovement }
 */
function healFamily(familyPatterns, options = {}) {
  if (!Array.isArray(familyPatterns) || familyPatterns.length === 0) {
    return { healed: [], bestStrategy: null, avgImprovement: 0 };
  }

  const { maxLoops = 2, targetCoherence = 0.9 } = options;

  // Step 1: Heal the first member to discover the best strategy
  const scout = familyPatterns[0];
  const scoutResult = reflectionLoop(scout.code, {
    language: scout.language,
    maxLoops,
    targetCoherence,
    description: scout.description,
    tags: scout.tags || [],
  });

  // Extract the strategy that helped most
  const bestStrategy = _extractBestStrategy(scoutResult);
  const scoutImprovement = scoutResult.coherence - (scoutResult.history[0]?.coherence || 0);

  // Step 2: Apply the same healing strategy to all family members
  const healed = familyPatterns.map((pattern, idx) => {
    if (idx === 0) {
      // Scout already healed
      return {
        ...pattern,
        healedCode: scoutResult.code,
        originalCoherence: scoutResult.history[0]?.coherence || 0,
        healedCoherence: scoutResult.coherence,
        improvement: scoutImprovement,
        strategy: bestStrategy,
        loops: scoutResult.loops,
      };
    }

    // Heal sibling with the discovered strategy
    const result = reflectionLoop(pattern.code, {
      language: pattern.language,
      maxLoops,
      targetCoherence,
      description: pattern.description,
      tags: pattern.tags || [],
    });

    const improvement = result.coherence - (result.history[0]?.coherence || 0);
    return {
      ...pattern,
      healedCode: result.code,
      originalCoherence: result.history[0]?.coherence || 0,
      healedCoherence: result.coherence,
      improvement,
      strategy: _extractBestStrategy(result),
      loops: result.loops,
    };
  });

  const avgImprovement = healed.length > 0
    ? healed.reduce((sum, h) => sum + h.improvement, 0) / healed.length
    : 0;

  return { healed, bestStrategy, avgImprovement };
}

/**
 * Extract the most effective healing strategy from a reflection result.
 */
function _extractBestStrategy(result) {
  if (!result.history || result.history.length < 2) return 'none';

  let bestDelta = 0;
  let bestStrategy = 'none';

  for (let i = 1; i < result.history.length; i++) {
    const delta = result.history[i].coherence - result.history[i - 1].coherence;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestStrategy = result.history[i].strategy || 'unknown';
    }
  }

  return bestStrategy;
}

// ─── 3. SERF dimensions for holographic embeddings ───

/**
 * Compute SERF dimension scores for a pattern's code.
 * Returns the 5 SERF dimensions ready for embedding into holographic vectors.
 *
 * @param {string} code — Source code
 * @param {string} [language] — Language identifier
 * @returns {Object} { simplicity, readability, security, unity, correctness, composite }
 */
function serfDimensions(code, language) {
  if (!code) {
    return {
      simplicity: 0, readability: 0, security: 0,
      unity: 0, correctness: 0, composite: 0,
    };
  }

  const obs = observeCoherence(code, { language });
  return { ...obs.dimensions, composite: obs.composite };
}

/**
 * Build the SERF portion of the usage/reliability signature (dims 8-15).
 * Called by holographic.js to fill the reserved dimensions.
 *
 * @param {string} code — Source code
 * @param {string} [language] — Language identifier
 * @returns {number[]} 8-element array for dims 8-15
 */
function serfEmbeddingDims(code, language) {
  const dims = serfDimensions(code, language);

  return [
    dims.simplicity,      // dim 8: simplicity
    dims.readability,     // dim 9: readability
    dims.security,        // dim 10: security
    dims.unity,           // dim 11: unity
    dims.correctness,     // dim 12: correctness
    dims.composite,       // dim 13: SERF composite
    0,                    // dim 14: reserved
    0,                    // dim 15: reserved
  ];
}

// ─── 4. Post-compression SERF validation ───

/**
 * Validate that reconstructed code maintains the same SERF coherence
 * as the original. Catches template/delta reconstruction errors.
 *
 * @param {string} originalCode — The original source code
 * @param {string} skeleton — Fractal template skeleton
 * @param {Object} delta — Placeholder→value mapping
 * @param {string} [language] — Language identifier
 * @returns {Object} { valid, originalCoherence, reconstructedCoherence, delta, dimensions }
 */
function validateReconstruction(originalCode, skeleton, delta, language) {
  if (!originalCode || !skeleton) {
    return { valid: false, originalCoherence: 0, reconstructedCoherence: 0, delta: 0 };
  }

  const reconstructed = reconstruct(skeleton, delta);
  const originalObs = observeCoherence(originalCode, { language });
  const reconstructedObs = observeCoherence(reconstructed, { language });

  const coherenceDelta = Math.abs(originalObs.composite - reconstructedObs.composite);

  // Valid if coherence difference is within tolerance (0.05)
  // and no single dimension drops more than 0.1
  let dimensionValid = true;
  const dimensionDeltas = {};
  for (const [dim, originalVal] of Object.entries(originalObs.dimensions)) {
    const reconstructedVal = reconstructedObs.dimensions[dim] || 0;
    dimensionDeltas[dim] = reconstructedVal - originalVal;
    if (originalVal - reconstructedVal > 0.1) {
      dimensionValid = false;
    }
  }

  return {
    valid: coherenceDelta <= 0.05 && dimensionValid,
    originalCoherence: originalObs.composite,
    reconstructedCoherence: reconstructedObs.composite,
    delta: coherenceDelta,
    dimensions: dimensionDeltas,
    reconstructedCode: reconstructed,
  };
}

/**
 * Batch-validate all compressed patterns in a store.
 * Returns validation results grouped by pass/fail.
 *
 * @param {Object} store — SQLiteStore instance
 * @returns {{ passed: Array, failed: Array, total: number }}
 */
function validateAllReconstructions(store) {
  const templates = store.getAllTemplates();
  const passed = [];
  const failed = [];

  for (const template of templates) {
    const deltas = store.getDeltasByTemplate(template.id);

    for (const d of deltas) {
      // Get original pattern code
      const patterns = store.getAllPatterns();
      const pattern = patterns.find(p => p.id === d.patternId);
      if (!pattern) continue;

      const result = validateReconstruction(
        pattern.code, template.skeleton, d.delta, pattern.language
      );
      result.patternId = d.patternId;
      result.patternName = pattern.name;

      if (result.valid) {
        passed.push(result);
      } else {
        failed.push(result);
      }
    }
  }

  return { passed, failed, total: passed.length + failed.length };
}

module.exports = {
  // 1. Compression priority
  prioritizeForCompression,
  partitionByReadiness,
  // 2. Family healing
  healFamily,
  // 3. Embedding dimensions
  serfDimensions,
  serfEmbeddingDims,
  // 4. Reconstruction validation
  validateReconstruction,
  validateAllReconstructions,
};
