'use strict';

/**
 * Fractal-Library Bridge — Connects the fractal compression/holographic encoding
 * system with the pattern library's decision engine.
 *
 * This module closes five gaps:
 * 1. Holographic embeddings inform PULL/EVOLVE/GENERATE decisions
 * 2. Fractal family membership provides stability signals
 * 3. Structured descriptions are encoded into holographic vectors
 * 4. Existing fractal deltas speed up similarity detection
 * 5. Family stability influences confidence decay rate
 *
 * All functions are designed to degrade gracefully — they return neutral
 * values if compression data doesn't exist (e.g., compression hasn't been run).
 */

const { cosineSimilarity } = require('../search/embedding-engine');

// Lazy-load compression modules to avoid circular deps
let _holoEmbed, _holoSearch;
function _loadCompression() {
  if (!_holoEmbed) {
    try {
      const holo = require('./holographic');
      _holoEmbed = holo.holoEmbed;
      _holoSearch = holo.holoSearch;
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[bridge] holographic not available:', e?.message);
    }
  }
}

// ─── 1. Holographic Boost for Decision Engine ────────────────────────────

/**
 * Compute a holographic similarity boost for a pattern against a search request.
 * Uses 128D embeddings when available, returns 0 otherwise.
 *
 * @param {object} request - { description, tags, language }
 * @param {object} pattern - Pattern object with code, name, etc.
 * @param {object} store - SQLiteStore (for cached embeddings)
 * @returns {{ boost: number, holoScore: number, fromCache: boolean }}
 */
function holoDecisionBoost(request, pattern, store) {
  _loadCompression();
  if (!_holoEmbed) return { boost: 0, holoScore: 0, fromCache: false };

  try {
    // Build a pseudo-pattern from the request for embedding
    const queryEmbedding = _holoEmbed({
      code: request.description || '',
      name: request.description || '',
      description: request.description || '',
      tags: request.tags || [],
    });

    // Try cached embedding first
    let patternEmbedding = null;
    let fromCache = false;

    if (store && store.getHoloEmbedding) {
      const cached = store.getHoloEmbedding(pattern.id);
      if (cached && cached.embeddingVec) {
        patternEmbedding = cached.embeddingVec;
        fromCache = true;
      }
    }

    // Compute on-the-fly if not cached
    if (!patternEmbedding) {
      patternEmbedding = _holoEmbed(pattern);
    }

    const holoScore = cosineSimilarity(queryEmbedding, patternEmbedding);

    // Only boost if score is meaningfully high (above noise floor)
    const boost = holoScore > 0.3 ? holoScore * 0.08 : 0;  // Up to 8% boost

    return { boost, holoScore, fromCache };
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[bridge:holoDecisionBoost]', e?.message);
    return { boost: 0, holoScore: 0, fromCache: false };
  }
}

// ─── 2. Family Stability Signal ──────────────────────────────────────────

/**
 * Compute a stability signal for a pattern based on its fractal family membership.
 * Patterns in stable families (high avg coherency, many members, low variance)
 * get a positive signal; lone patterns or unstable families get neutral.
 *
 * @param {string} patternId - Pattern ID to check
 * @param {object} store - SQLiteStore
 * @returns {{ stability: number, familySize: number, avgCoherency: number, inFamily: boolean }}
 */
function familyStabilitySignal(patternId, store) {
  if (!store) return _neutralStability();

  try {
    // Check if pattern has a fractal delta (meaning it's in a family)
    const delta = store.getDelta ? store.getDelta(patternId) : null;
    if (!delta) return _neutralStability();

    // Get the template to learn about the family
    const template = store.getTemplate ? store.getTemplate(delta.templateId) : null;
    if (!template) return _neutralStability();

    const familySize = template.memberCount || 1;
    const avgCoherency = template.avgCoherency || 0;

    // Stability = family size contribution + coherency contribution
    // Families with more members that all score well are very stable
    const sizeContrib = Math.min(familySize / 10, 1.0) * 0.4;
    const coherencyContrib = avgCoherency * 0.6;
    const stability = Math.min(1.0, sizeContrib + coherencyContrib);

    return { stability, familySize, avgCoherency, inFamily: true };
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[bridge:familyStabilitySignal]', e?.message);
    return _neutralStability();
  }
}

function _neutralStability() {
  return { stability: 0.5, familySize: 0, avgCoherency: 0, inFamily: false };
}

// ─── 3. Structured Description Embedding ─────────────────────────────────

/**
 * Encode a structured description into a vector that can augment
 * holographic embeddings. Returns a 16-dimension vector encoding
 * the structural properties.
 *
 * @param {object} structured - { inputs, transform, outputs, constraints, domain }
 * @returns {number[]} 16-dimensional vector
 */
function structuredDescriptionVector(structured) {
  const vec = new Float64Array(16);
  if (!structured) return Array.from(vec);

  // Dim 0-1: Input complexity
  const inputs = structured.inputs || [];
  vec[0] = Math.min(inputs.length / 5, 1.0);
  vec[1] = inputs.some(i => i.includes('<')) ? 1.0 : 0.0; // Generic types

  // Dim 2-3: Output complexity
  const outputs = structured.outputs || [];
  vec[2] = Math.min(outputs.length / 5, 1.0);
  vec[3] = outputs.some(o => o.includes('<')) ? 1.0 : 0.0;

  // Dim 4-6: Transform encoding (hash-based)
  const transform = structured.transform || '';
  const transformTokens = transform.split(/[-_\s]+/).filter(Boolean);
  vec[4] = Math.min(transformTokens.length / 3, 1.0);
  // Encode transform type via known categories
  const transformCategories = {
    'sort': 0.1, 'filter': 0.2, 'map': 0.3, 'reduce': 0.4,
    'merge': 0.5, 'split': 0.6, 'parse': 0.7, 'validate': 0.8,
    'encrypt': 0.9, 'cache': 0.15, 'retry': 0.25, 'batch': 0.35,
    'search': 0.45, 'compress': 0.55, 'transform': 0.65,
  };
  for (const token of transformTokens) {
    if (transformCategories[token]) {
      vec[5] = transformCategories[token];
      break;
    }
  }
  vec[6] = transform.length > 0 ? 1.0 : 0.0;

  // Dim 7-9: Constraint encoding
  const constraints = structured.constraints || [];
  vec[7] = Math.min(constraints.length / 4, 1.0);
  vec[8] = constraints.includes('pure') || constraints.includes('immutable') ? 1.0 : 0.0;
  vec[9] = constraints.includes('async') ? 1.0 : 0.0;

  // Dim 10-15: Domain encoding (one-hot-ish)
  const domainMap = {
    'algorithm': 10, 'data-structure': 11, 'string-processing': 11,
    'io': 12, 'network': 12, 'security': 13,
    'async': 14, 'validation': 14, 'utility': 15, 'general': 15,
  };
  const domainDim = domainMap[structured.domain] || 15;
  vec[domainDim] = 1.0;

  return Array.from(vec);
}

// ─── 4. Family-Aware Similarity Detection ────────────────────────────────

/**
 * Fast similarity check using fractal family membership.
 * If two patterns share a fractal template, they're structurally identical
 * (similarity = 1.0 for structure). This avoids recomputing fingerprints.
 *
 * @param {string} patternIdA - First pattern ID
 * @param {string} patternIdB - Second pattern ID
 * @param {object} store - SQLiteStore
 * @returns {{ sameFamily: boolean, templateId: string|null, similarity: number }}
 */
function familyAwareSimilarity(patternIdA, patternIdB, store) {
  if (!store || !store.getDelta) {
    return { sameFamily: false, templateId: null, similarity: 0 };
  }

  try {
    const deltaA = store.getDelta(patternIdA);
    const deltaB = store.getDelta(patternIdB);

    if (!deltaA || !deltaB) {
      return { sameFamily: false, templateId: null, similarity: 0 };
    }

    if (deltaA.templateId === deltaB.templateId) {
      // Same family — structurally identical
      // Compute delta similarity for a more nuanced score
      const deltaSim = _deltaSimilarity(deltaA.delta, deltaB.delta);
      return {
        sameFamily: true,
        templateId: deltaA.templateId,
        similarity: 0.4 + deltaSim * 0.6, // 40% base (same structure) + up to 60% from delta overlap
      };
    }

    return { sameFamily: false, templateId: null, similarity: 0 };
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[bridge:familyAwareSimilarity]', e?.message);
    return { sameFamily: false, templateId: null, similarity: 0 };
  }
}

/**
 * Compare two deltas (placeholder → value maps) for overlap.
 */
function _deltaSimilarity(deltaA, deltaB) {
  const a = typeof deltaA === 'string' ? _safeParseJSON(deltaA) : (deltaA || {});
  const b = typeof deltaB === 'string' ? _safeParseJSON(deltaB) : (deltaB || {});
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length === 0 && keysB.length === 0) return 1.0;
  if (keysA.length === 0 || keysB.length === 0) return 0.0;

  let matches = 0;
  for (const key of keysA) {
    if (b[key] && a[key] === b[key]) matches++;
  }
  return matches / Math.max(keysA.length, keysB.length);
}

// ─── 5. Family Stability for Confidence Decay ───────────────────────────

/**
 * Compute a decay rate modifier based on family stability.
 * Patterns in stable families decay slower (they're proven structures).
 *
 * @param {string} patternId - Pattern ID
 * @param {object} store - SQLiteStore
 * @returns {number} Multiplier for decay half-life (>1 = slower decay, 1 = normal)
 */
function familyDecayModifier(patternId, store) {
  const signal = familyStabilitySignal(patternId, store);
  if (!signal.inFamily) return 1.0; // No family, normal decay

  // Stable families decay 1.0-2.0x slower
  // A family with 5+ members and avg coherency 0.9 decays ~2x slower
  return 1.0 + signal.stability;
}

// ─── 6. Comprehensive Audit Report ───────────────────────────────────────

/**
 * Generate a comprehensive audit of fractal-library integration health.
 * Shows where compression data exists, where it's being used, and gaps.
 *
 * @param {object} store - SQLiteStore
 * @param {object} patterns - PatternLibrary
 * @returns {object} Audit report
 */
function auditIntegration(store, patterns) {
  const allPatterns = patterns.getAll ? patterns.getAll() : [];
  const report = {
    totalPatterns: allPatterns.length,
    withEmbeddings: 0,
    withFamilies: 0,
    withStructuredDesc: 0,
    orphanedEmbeddings: 0,
    staleEmbeddings: 0,
    familyStats: { totalFamilies: 0, avgSize: 0, avgCoherency: 0 },
    gaps: [],
    recommendations: [],
  };

  if (!store) {
    report.gaps.push('No SQLite store available — compression features disabled');
    return report;
  }

  // Count patterns with embeddings
  for (const p of allPatterns) {
    if (store.getHoloEmbedding) {
      const emb = store.getHoloEmbedding(p.id);
      if (emb) report.withEmbeddings++;
    }
    if (store.getDelta) {
      const delta = store.getDelta(p.id);
      if (delta) report.withFamilies++;
    }
    if (p.structuredDescription) {
      report.withStructuredDesc++;
    }
  }

  // Family statistics
  if (store.getAllTemplates) {
    const templates = store.getAllTemplates();
    report.familyStats.totalFamilies = templates.length;
    if (templates.length > 0) {
      const sizes = templates.map(t => t.memberCount || 0);
      const coherencies = templates.map(t => t.avgCoherency || 0);
      report.familyStats.avgSize = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length * 10) / 10;
      report.familyStats.avgCoherency = Math.round(coherencies.reduce((a, b) => a + b, 0) / coherencies.length * 1000) / 1000;
    }
  }

  // Identify gaps
  const embeddingCoverage = report.totalPatterns > 0 ? report.withEmbeddings / report.totalPatterns : 0;
  const familyCoverage = report.totalPatterns > 0 ? report.withFamilies / report.totalPatterns : 0;
  const structuredCoverage = report.totalPatterns > 0 ? report.withStructuredDesc / report.totalPatterns : 0;

  if (embeddingCoverage < 0.5) {
    report.gaps.push(`Only ${(embeddingCoverage * 100).toFixed(0)}% of patterns have holographic embeddings — run 'oracle compress' to generate`);
  }
  if (structuredCoverage < 0.3) {
    report.gaps.push(`Only ${(structuredCoverage * 100).toFixed(0)}% of patterns have structured descriptions — new patterns get them automatically`);
  }

  // Generate recommendations
  if (embeddingCoverage < 1.0) {
    report.recommendations.push('Run `oracle compress` to generate holographic embeddings for all patterns');
  }
  if (report.familyStats.totalFamilies > 0 && report.familyStats.avgCoherency < 0.7) {
    report.recommendations.push('Run `oracle maintain` to heal patterns in low-coherency families');
  }
  if (structuredCoverage < 0.5) {
    report.recommendations.push('Structured descriptions will be auto-generated for new patterns — existing patterns benefit from re-registration');
  }

  return report;
}

function _safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

module.exports = {
  holoDecisionBoost,
  familyStabilitySignal,
  structuredDescriptionVector,
  familyAwareSimilarity,
  familyDecayModifier,
  auditIntegration,
};
