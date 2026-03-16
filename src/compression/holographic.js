/**
 * Holographic Encoding — Dense multi-dimensional pattern embeddings with
 * family-level "pages" for faster, multi-angle search.
 *
 * Extends the existing 64-dim builtinEmbed() to 128 dimensions by adding:
 *   Dims 64-79:  Fractal family signature (structural identity)
 *   Dims 80-95:  Behavioral signature (what the pattern does)
 *   Dims 96-111: Dependency signature (composition graph position)
 *   Dims 112-127: Usage/reliability + SERF signature (empirical quality + healing dimensions)
 *
 * Holographic pages group related patterns and store superposed embeddings
 * (centroids) + interference matrices for fast two-pass retrieval.
 */

const crypto = require('crypto');
const { builtinEmbed, cosineSimilarity } = require('../search/embedding-engine');

// SERF integration — fills dims 8-15 of usage/reliability signature
let _serfEmbeddingDims;
try {
  ({ serfEmbeddingDims: _serfEmbeddingDims } = require('./serf-integration'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[holographic:init] silent failure:', e?.message || e);
  _serfEmbeddingDims = null;
}

const HOLO_DIMS = 128;

// Structured description integration (graceful)
let _structuredDescriptionVector;
try {
  ({ structuredDescriptionVector: _structuredDescriptionVector } = require('./fractal-library-bridge'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[holographic:init] bridge not available:', e?.message || e);
}

// ─── Behavioral feature detectors ───

const BEHAVIOR_PATTERNS = [
  { name: 'transforms-data', pattern: /\b(map|filter|reduce|transform|convert|parse|format)\b/i },
  { name: 'validates', pattern: /\b(valid|check|verify|assert|ensure|confirm|test)\b/i },
  { name: 'side-effects', pattern: /\b(write|save|send|emit|log|print|push|delete|remove)\b/i },
  { name: 'reads-data', pattern: /\b(read|get|fetch|load|find|query|select|retrieve)\b/i },
  { name: 'error-handling', pattern: /\b(try|catch|throw|error|exception|fail)\b/i },
  { name: 'async-flow', pattern: /\b(async|await|promise|callback|then|resolve|reject)\b/i },
  { name: 'iteration', pattern: /\b(for|while|each|iterate|loop|forEach|map)\b/i },
  { name: 'recursion', pattern: /function\s+(\w+)[^]*?\b\1\s*\(/i },
  { name: 'string-ops', pattern: /\b(split|join|replace|trim|substring|slice|concat|match)\b/i },
  { name: 'math-ops', pattern: /\b(Math\.|sum|avg|min|max|ceil|floor|round|sqrt|pow)\b/i },
  { name: 'sorting', pattern: /\b(sort|order|rank|compare|swap)\b/i },
  { name: 'caching', pattern: /\b(cache|memo|store|remember|lru|ttl)\b/i },
  { name: 'auth', pattern: /\b(auth|login|token|credential|session|permission|role)\b/i },
  { name: 'crypto', pattern: /\b(hash|encrypt|decrypt|sign|verify|hmac|cipher|digest)\b/i },
  { name: 'networking', pattern: /\b(http|request|response|fetch|url|api|endpoint|socket)\b/i },
  { name: 'dom-ui', pattern: /\b(render|component|element|style|css|html|dom|view)\b/i },
];

/**
 * Generate a 128-dimensional holographic embedding for a pattern.
 *
 * @param {Object} pattern — { code, name, description, tags, language, testCode, requires, composedOf, usageCount, successCount }
 * @param {Object} [options] — { familyHash }
 * @returns {number[]} 128-dimensional unit vector
 */
function holoEmbed(pattern, options = {}) {
  const vec = new Float64Array(HOLO_DIMS);
  const code = pattern.code || '';
  const text = [pattern.name || '', pattern.description || '', (pattern.tags || []).join(' '), code.slice(0, 500)].join(' ');

  // Dims 0-63: Base embedding from existing engine
  const base = builtinEmbed(text);
  for (let i = 0; i < 64 && i < base.length; i++) {
    vec[i] = base[i];
  }

  // Dims 64-79: Fractal family signature (16D)
  // Hash the structural family into 16 dimensions via consistent hashing
  const familyHash = options.familyHash || _hashToVec(code, 16);
  for (let i = 0; i < 16; i++) {
    vec[64 + i] = familyHash[i];
  }

  // Dims 80-95: Behavioral signature (16D)
  // When structured description is available, blend it in for richer behavioral encoding
  const behaviorVec = _behaviorSignature(code + ' ' + (pattern.testCode || ''));
  if (_structuredDescriptionVector && pattern.structuredDescription) {
    const structVec = _structuredDescriptionVector(pattern.structuredDescription);
    // Blend: 70% behavioral detectors + 30% structured description
    for (let i = 0; i < 16; i++) {
      vec[80 + i] = behaviorVec[i] * 0.7 + (structVec[i] || 0) * 0.3;
    }
  } else {
    for (let i = 0; i < 16; i++) {
      vec[80 + i] = behaviorVec[i];
    }
  }

  // Dims 96-111: Dependency signature (16D)
  const depVec = _dependencySignature(pattern.requires, pattern.composedOf);
  for (let i = 0; i < 16; i++) {
    vec[96 + i] = depVec[i];
  }

  // Dims 112-127: Usage/reliability signature (16D)
  const usageVec = _usageSignature(pattern);
  for (let i = 0; i < 16; i++) {
    vec[112 + i] = usageVec[i];
  }

  // L2 normalize to unit vector
  let mag = 0;
  for (let i = 0; i < vec.length; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag);
  if (mag > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= mag;
  }

  return Array.from(vec);
}

/**
 * Create a holographic page from a family of patterns.
 * The page stores a superposed centroid + interference matrix.
 *
 * @param {string} pageId — Unique page identifier
 * @param {Array<{ patternId: string, embedding: number[] }>} members
 * @param {string} [templateId] — Associated fractal template ID
 * @returns {Object} { id, templateId, centroidVec, interferenceMatrix, memberIds, memberCount }
 */
function createPage(pageId, members, templateId = null) {
  if (!members || members.length === 0) {
    return null;
  }

  const dims = members[0].embedding.length;

  // Validate all members have the same embedding dimensions
  for (let i = 1; i < members.length; i++) {
    if (!members[i].embedding || members[i].embedding.length !== dims) {
      throw new Error(
        `createPage: dimension mismatch — member ${i} has ${members[i].embedding?.length ?? 0} dims, expected ${dims}`
      );
    }
  }

  const centroid = new Float64Array(dims);

  // Compute centroid (element-wise mean)
  for (const m of members) {
    for (let i = 0; i < dims; i++) {
      centroid[i] += m.embedding[i];
    }
  }
  for (let i = 0; i < dims; i++) {
    centroid[i] /= members.length;
  }

  // L2 normalize centroid
  let mag = 0;
  for (let i = 0; i < dims; i++) mag += centroid[i] * centroid[i];
  mag = Math.sqrt(mag);
  if (mag > 0) {
    for (let i = 0; i < dims; i++) centroid[i] /= mag;
  }

  // Compute interference matrix (NxN pairwise cosine similarities)
  const matrix = [];
  for (let i = 0; i < members.length; i++) {
    const row = [];
    for (let j = 0; j < members.length; j++) {
      row.push(i === j ? 1.0 : cosineSimilarity(members[i].embedding, members[j].embedding));
    }
    matrix.push(row);
  }

  return {
    id: pageId,
    templateId,
    centroidVec: Array.from(centroid),
    interferenceMatrix: matrix,
    memberIds: members.map(m => m.patternId),
    memberCount: members.length,
  };
}

/**
 * Two-pass holographic search.
 *
 * Pass 1: Compare query embedding against page centroids → select top-K families.
 * Pass 2: Within selected families, rank individual patterns by similarity to query.
 *
 * @param {number[]} queryEmbedding — 128-dim query vector
 * @param {Array} pages — Array of holographic page objects
 * @param {Map<string, number[]>} embeddingMap — patternId → embedding vector
 * @param {Object} [options] — { topK: number, minScore: number }
 * @returns {Array<{ patternId: string, score: number, pageId: string }>}
 */
function holoSearch(queryEmbedding, pages, embeddingMap, options = {}) {
  const { topK = 5, minScore = 0.05 } = options;

  if (!pages || pages.length === 0) return [];

  // Pass 1: Rank pages by centroid similarity
  const pageScores = pages.map(page => ({
    page,
    score: cosineSimilarity(queryEmbedding, page.centroidVec),
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, topK);

  // Pass 2: Within selected pages, rank individual patterns
  // Uses the interference matrix (when available) to boost patterns
  // that are similar to the best match within the same family.
  const results = [];
  const seen = new Set();
  const INTERFERENCE_BOOST = 0.1;

  for (const { page, score: pageScore } of pageScores) {
    if (pageScore < minScore) continue;

    // Score all unseen patterns in this page against the query
    const pageResults = [];
    for (let idx = 0; idx < page.memberIds.length; idx++) {
      const patternId = page.memberIds[idx];
      if (seen.has(patternId)) continue;

      const embedding = embeddingMap.get(patternId);
      if (!embedding) continue;

      const patternScore = cosineSimilarity(queryEmbedding, embedding);
      pageResults.push({ patternId, score: patternScore, idx });
    }

    // Apply interference matrix re-ranking if the matrix is present
    const matrix = page.interferenceMatrix;
    if (matrix && pageResults.length > 1) {
      // Find the best-scoring pattern in this page
      let bestIdx = 0;
      for (let i = 1; i < pageResults.length; i++) {
        if (pageResults[i].score > pageResults[bestIdx].score) bestIdx = i;
      }
      const bestResult = pageResults[bestIdx];

      // Boost other patterns proportional to their intra-family similarity
      // to the best match (via the interference matrix)
      for (const pr of pageResults) {
        if (pr === bestResult) continue;
        const similarity = matrix[pr.idx]?.[bestResult.idx];
        if (typeof similarity === 'number' && similarity > 0) {
          pr.score += INTERFERENCE_BOOST * similarity * bestResult.score;
        }
      }
    }

    // Add qualifying results
    for (const pr of pageResults) {
      if (pr.score >= minScore) {
        seen.add(pr.patternId);
        results.push({ patternId: pr.patternId, score: pr.score, pageId: page.id });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Internal helpers ───

/**
 * Hash a string into an N-dimensional vector via consistent hashing.
 * Each dimension is derived from a different slice of the SHA-256 hash.
 */
function _hashToVec(str, dims) {
  const hash = crypto.createHash('sha256').update(str || '').digest('hex');
  const vec = new Float64Array(dims);
  for (let i = 0; i < dims; i++) {
    // Take 4 hex chars per dimension → 16-bit value → normalize to [-1, 1]
    const start = (i * 4) % hash.length;
    const hexSlice = hash.slice(start, start + 4).padEnd(4, '0');
    vec[i] = (parseInt(hexSlice, 16) / 65535) * 2 - 1;
  }
  return Array.from(vec);
}

/**
 * Extract behavioral signature from code.
 * 16 dimensions, each corresponding to a behavior pattern detector.
 */
function _behaviorSignature(text) {
  const vec = new Float64Array(16);
  for (let i = 0; i < BEHAVIOR_PATTERNS.length && i < 16; i++) {
    vec[i] = BEHAVIOR_PATTERNS[i].pattern.test(text) ? 1.0 : 0.0;
  }
  return Array.from(vec);
}

/**
 * Extract dependency signature from requires/composedOf fields.
 * 16 dimensions encoding the pattern's position in the composition graph.
 */
function _dependencySignature(requires, composedOf) {
  const vec = new Float64Array(16);

  const reqArr = Array.isArray(requires) ? requires : _safeParseArray(requires);
  const compArr = Array.isArray(composedOf) ? composedOf : _safeParseArray(composedOf);

  // Dim 0: has dependencies
  vec[0] = reqArr.length > 0 ? 1.0 : 0.0;
  // Dim 1: dependency count (normalized)
  vec[1] = Math.min(reqArr.length / 10, 1.0);
  // Dim 2: is composed
  vec[2] = compArr.length > 0 ? 1.0 : 0.0;
  // Dim 3: composition count (normalized)
  vec[3] = Math.min(compArr.length / 10, 1.0);
  // Dims 4-15: hash-based encoding of dependency names for identity
  const depStr = [...reqArr, ...compArr].join(',');
  if (depStr) {
    const depHash = _hashToVec(depStr, 12);
    for (let i = 0; i < 12; i++) vec[4 + i] = depHash[i];
  }

  return Array.from(vec);
}

/**
 * Extract usage/reliability signature from pattern stats.
 * 16 dimensions encoding empirical quality signals.
 */
function _usageSignature(pattern) {
  const vec = new Float64Array(16);

  const usageCount = pattern.usageCount || 0;
  const successCount = pattern.successCount || 0;
  const coherency = pattern.coherencyTotal || pattern.coherencyScore?.total || 0;
  const bugReports = pattern.bugReports || 0;
  const upvotes = pattern.upvotes || 0;
  const downvotes = pattern.downvotes || 0;

  // Dim 0: usage volume (log-scaled, normalized)
  vec[0] = usageCount > 0 ? Math.min(Math.log2(usageCount + 1) / 10, 1.0) : 0;
  // Dim 1: success rate
  vec[1] = usageCount > 0 ? successCount / usageCount : 0.5;
  // Dim 2: coherency score
  vec[2] = coherency;
  // Dim 3: has tests
  vec[3] = pattern.testCode ? 1.0 : 0.0;
  // Dim 4: bug penalty
  vec[4] = Math.max(0, 1 - bugReports * 0.1);
  // Dim 5: vote sentiment
  vec[5] = (upvotes + downvotes) > 0 ? upvotes / (upvotes + downvotes) : 0.5;
  // Dim 6: vote volume (normalized)
  vec[6] = Math.min((upvotes + downvotes) / 20, 1.0);
  // Dim 7: version maturity (normalized)
  vec[7] = Math.min((pattern.version || 1) / 10, 1.0);
  // Dims 8-15: SERF healing dimensions (simplicity, readability, security, unity, correctness, composite)
  if (_serfEmbeddingDims && pattern.code) {
    const serfDims = _serfEmbeddingDims(pattern.code, pattern.language);
    for (let i = 0; i < 8 && i < serfDims.length; i++) {
      vec[8 + i] = serfDims[i];
    }
  }

  return Array.from(vec);
}

function _safeParseArray(val) {
  if (!val) return [];
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[holographic:_safeParseArray] returning empty array on error:', e?.message || e);
      return [];
    }
  }
  return [];
}

module.exports = {
  holoEmbed,
  createPage,
  holoSearch,
  cosineSimilarity,
  HOLO_DIMS,
};
