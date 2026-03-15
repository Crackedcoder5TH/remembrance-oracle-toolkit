'use strict';

/**
 * Similarity Clustering — groups patterns by structural similarity across domains.
 *
 * Periodically run to discover isomorphisms: patterns that solve the same structural
 * problem in different domains (e.g., retry logic in network code ≈ retry logic in DB code).
 *
 * Uses a single-pass agglomerative approach with the structured description layer
 * and code-level similarity to form clusters.
 */

const { parseStructuredDescription, structuralSimilarity } = require('../core/structured-description');

/**
 * Compute text-based similarity between two code strings using bigram overlap.
 * @param {string} a - First code string
 * @param {string} b - Second code string
 * @returns {number} Similarity 0-1
 */
function codeSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  const bigramsA = toBigrams(a);
  const bigramsB = toBigrams(b);

  if (bigramsA.size === 0 && bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  const union = new Set([...bigramsA, ...bigramsB]).size;
  return union > 0 ? intersection / union : 0;
}

function toBigrams(text) {
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  const bigrams = new Set();
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Compute combined similarity between two patterns.
 * Blends structural description similarity with code similarity.
 * @param {object} a - Pattern a
 * @param {object} b - Pattern b
 * @returns {{ total: number, structural: number, code: number }}
 */
function patternSimilarity(a, b) {
  const descA = a.structuredDescription || parseStructuredDescription(a.description || '', { code: a.code, tags: a.tags || [] });
  const descB = b.structuredDescription || parseStructuredDescription(b.description || '', { code: b.code, tags: b.tags || [] });

  const structural = structuralSimilarity(descA, descB);
  const code = codeSimilarity(a.code || '', b.code || '');

  // Structural similarity matters more for cross-domain matching
  const total = structural * 0.60 + code * 0.40;

  return { total, structural, code };
}

/**
 * Cluster patterns by similarity using single-linkage agglomerative clustering.
 * @param {Array} patterns - Array of pattern objects
 * @param {object} [options] - Clustering options
 * @param {number} [options.threshold=0.45] - Minimum similarity to join a cluster
 * @param {number} [options.maxClusters=50] - Maximum clusters to return
 * @returns {Array<{ id: string, centroid: object, members: Array, crossDomain: boolean, avgSimilarity: number }>}
 */
function clusterPatterns(patterns, options = {}) {
  const { threshold = 0.45, maxClusters = 50 } = options;

  if (!patterns || patterns.length === 0) return [];
  if (patterns.length === 1) {
    return [{
      id: 'cluster-0',
      centroid: patterns[0],
      members: [patterns[0]],
      crossDomain: false,
      avgSimilarity: 1.0,
    }];
  }

  // Assign each pattern to a cluster
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < patterns.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [i];
    assigned.add(i);

    for (let j = i + 1; j < patterns.length; j++) {
      if (assigned.has(j)) continue;

      const sim = patternSimilarity(patterns[i], patterns[j]);
      if (sim.total >= threshold) {
        cluster.push(j);
        assigned.add(j);
      }
    }

    const members = cluster.map(idx => patterns[idx]);
    const domains = new Set(members.map(m =>
      (m.structuredDescription?.domain) ||
      inferDomainFromTags(m.tags || []) ||
      'general'
    ));

    // Compute average pairwise similarity
    let simSum = 0;
    let simCount = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        simSum += patternSimilarity(members[a], members[b]).total;
        simCount++;
      }
    }

    clusters.push({
      id: `cluster-${clusters.length}`,
      centroid: members[0],
      members,
      crossDomain: domains.size > 1,
      domains: [...domains],
      avgSimilarity: simCount > 0 ? simSum / simCount : 1.0,
    });

    if (clusters.length >= maxClusters) break;
  }

  return clusters;
}

/**
 * Find cross-domain isomorphisms — patterns that are structurally similar
 * but come from different domains.
 * @param {Array} patterns - Array of pattern objects
 * @param {object} [options] - Options
 * @param {number} [options.threshold=0.5] - Minimum structural similarity
 * @returns {Array<{ patternA: object, patternB: object, similarity: object }>}
 */
function findIsomorphisms(patterns, options = {}) {
  const { threshold = 0.5 } = options;
  const results = [];

  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const a = patterns[i];
      const b = patterns[j];

      // Only interested in cross-domain matches
      const domainA = a.structuredDescription?.domain ||
        inferDomainFromTags(a.tags || []) || 'general';
      const domainB = b.structuredDescription?.domain ||
        inferDomainFromTags(b.tags || []) || 'general';

      if (domainA === domainB) continue;

      const sim = patternSimilarity(a, b);
      if (sim.structural >= threshold) {
        results.push({
          patternA: { id: a.id, name: a.name, domain: domainA },
          patternB: { id: b.id, name: b.name, domain: domainB },
          similarity: sim,
        });
      }
    }
  }

  return results.sort((a, b) => b.similarity.structural - a.similarity.structural);
}

function inferDomainFromTags(tags) {
  const tagStr = tags.join(' ').toLowerCase();
  if (/\b(sort|search|graph|tree|algorithm)\b/.test(tagStr)) return 'algorithm';
  if (/\b(http|fetch|api|request|network)\b/.test(tagStr)) return 'network';
  if (/\b(encrypt|hash|auth|security|token)\b/.test(tagStr)) return 'security';
  if (/\b(string|text|regex|parse)\b/.test(tagStr)) return 'string-processing';
  if (/\b(file|read|write|stream)\b/.test(tagStr)) return 'io';
  if (/\b(async|promise|event|debounce)\b/.test(tagStr)) return 'async';
  if (/\b(validate|check|schema)\b/.test(tagStr)) return 'validation';
  return 'general';
}

module.exports = {
  clusterPatterns,
  findIsomorphisms,
  patternSimilarity,
  codeSimilarity,
  toBigrams,
  inferDomainFromTags,
};
