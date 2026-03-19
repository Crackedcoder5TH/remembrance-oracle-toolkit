'use strict';

/**
 * Cross-Reference Engine — correlates audit findings with known debug pattern fixes.
 *
 * When a static checker finds an assumption mismatch, this module searches
 * the debug pattern library for fixes that address the same bug class.
 * This turns audit warnings into actionable fix suggestions backed by
 * proven patterns from real debugging sessions.
 *
 * Usage:
 *   const { crossReference } = require('./cross-reference');
 *   const enriched = crossReference(auditFindings, oracle);
 */

const { BUG_CLASSES } = require('./static-checkers');

// ─── Bug Class → Debug Category Mapping ───

/**
 * Map audit bug classes to debug pattern categories/error classes.
 * A single bug class may map to multiple debug categories.
 */
const BUG_CLASS_TO_DEBUG_CATEGORIES = {
  [BUG_CLASSES.STATE_MUTATION]: {
    categories: ['logic', 'data'],
    keywords: ['mutate', 'mutation', 'sort', 'reverse', 'in-place', 'immutable', 'copy', 'clone', 'shared', 'reference'],
  },
  [BUG_CLASSES.SECURITY]: {
    categories: ['runtime', 'data'],
    keywords: ['timing', 'secret', 'injection', 'eval', 'xss', 'sql', 'sanitize', 'escape', 'unsafe'],
  },
  [BUG_CLASSES.CONCURRENCY]: {
    categories: ['async', 'runtime'],
    keywords: ['lock', 'mutex', 'deadlock', 'race', 'concurrent', 'finally', 'release', 'acquire', 'semaphore'],
  },
  [BUG_CLASSES.TYPE]: {
    categories: ['type', 'syntax'],
    keywords: ['parse', 'NaN', 'undefined', 'null', 'coerce', 'cast', 'radix', 'parseInt', 'division', 'zero'],
  },
  [BUG_CLASSES.INTEGRATION]: {
    categories: ['reference', 'type'],
    keywords: ['null', 'undefined', 'return', 'caller', 'contract', 'interface', 'api', 'missing'],
  },
  [BUG_CLASSES.EDGE_CASE]: {
    categories: ['logic', 'data'],
    keywords: ['default', 'switch', 'boundary', 'empty', 'edge', 'corner', 'overflow', 'underflow'],
  },
};

// ─── Core Cross-Reference ───

/**
 * Enrich audit findings with matching debug patterns.
 *
 * For each finding, searches the debug pattern library for fixes that
 * address the same bug class. Returns the original findings augmented
 * with a `relatedFixes` array.
 *
 * @param {Array} findings - Audit findings from static checkers
 * @param {object} oracle - RemembranceOracle instance (with debugPatterns method)
 * @param {object} [options] - { maxFixesPerFinding, minAmplitude }
 * @returns {Array} Enriched findings with relatedFixes
 */
function crossReference(findings, oracle, options = {}) {
  if (!findings || !Array.isArray(findings) || findings.length === 0) return findings || [];
  if (!oracle) return findings;

  const { maxFixesPerFinding = 3, minAmplitude = 0.5 } = options;

  // Check if oracle has debug pattern search capability
  const hasDebugSearch = typeof oracle.debugPatterns === 'function' ||
    (oracle.debug && typeof oracle.debug.search === 'function');

  if (!hasDebugSearch) return findings;

  return findings.map(finding => {
    const fixes = findRelatedFixes(finding, oracle, maxFixesPerFinding, minAmplitude);
    if (fixes.length > 0) {
      return { ...finding, relatedFixes: fixes };
    }
    return finding;
  });
}

/**
 * Find debug patterns that fix the same kind of bug as this finding.
 */
function findRelatedFixes(finding, oracle, maxFixes, minAmplitude) {
  const mapping = BUG_CLASS_TO_DEBUG_CATEGORIES[finding.bugClass];
  if (!mapping) return [];

  const fixes = [];
  const seen = new Set();

  // Strategy 1: Search by category
  for (const category of mapping.categories) {
    try {
      const patterns = searchDebugPatterns(oracle, { category });
      for (const pattern of patterns) {
        if (seen.has(pattern.id)) continue;
        if ((pattern.amplitude || 0) < minAmplitude) continue;
        seen.add(pattern.id);

        const relevance = scoreRelevance(finding, pattern, mapping);
        if (relevance > 0.3) {
          fixes.push({
            patternId: pattern.id,
            fixCode: pattern.fixCode,
            fixDescription: pattern.fixDescription,
            errorMessage: pattern.errorMessage,
            relevance,
            amplitude: pattern.amplitude,
            timesApplied: pattern.timesApplied,
          });
        }
      }
    } catch (_) {
      // Search may fail — non-critical
    }
  }

  // Strategy 2: Search by keywords from the finding's assumption text
  const keywords = extractKeywords(finding.assumption, finding.suggestion);
  for (const keyword of keywords.slice(0, 3)) {
    try {
      const patterns = searchDebugPatterns(oracle, { query: keyword });
      for (const pattern of patterns) {
        if (seen.has(pattern.id)) continue;
        if ((pattern.amplitude || 0) < minAmplitude) continue;
        seen.add(pattern.id);

        const relevance = scoreRelevance(finding, pattern, mapping);
        if (relevance > 0.3) {
          fixes.push({
            patternId: pattern.id,
            fixCode: pattern.fixCode,
            fixDescription: pattern.fixDescription,
            errorMessage: pattern.errorMessage,
            relevance,
            amplitude: pattern.amplitude,
            timesApplied: pattern.timesApplied,
          });
        }
      }
    } catch (_) {
      // Search may fail — non-critical
    }
  }

  // Sort by relevance * amplitude, take top N
  fixes.sort((a, b) => ((b.relevance || 0) * (b.amplitude || 0)) - ((a.relevance || 0) * (a.amplitude || 0)));
  return fixes.slice(0, maxFixes);
}

/**
 * Search debug patterns through whatever API the oracle exposes.
 */
function searchDebugPatterns(oracle, query) {
  let result;
  // Try the unified debug search
  if (typeof oracle.debugPatterns === 'function') {
    if (query.category) {
      result = oracle.debugPatterns({ category: query.category });
    } else {
      result = oracle.debugPatterns({ error: query.query });
    }
  } else if (oracle.debug && typeof oracle.debug.search === 'function') {
    // Try the debug sub-object
    if (query.category) {
      result = oracle.debug.search({ category: query.category });
    } else {
      result = oracle.debug.search(query.query);
    }
  }
  return Array.isArray(result) ? result : [];
}

/**
 * Score how relevant a debug pattern is to an audit finding.
 * Returns 0-1.
 */
function scoreRelevance(finding, pattern, mapping) {
  let score = 0;

  // Category match is the baseline
  if (mapping.categories.includes(pattern.errorCategory)) {
    score += 0.3;
  }

  // Keyword overlap between finding text and pattern text
  const findingText = `${finding.assumption} ${finding.reality} ${finding.suggestion}`.toLowerCase();
  const patternText = `${pattern.errorMessage || ''} ${pattern.fixDescription || ''} ${pattern.fixCode || ''}`.toLowerCase();

  let keywordHits = 0;
  for (const keyword of mapping.keywords) {
    if (patternText.includes(keyword)) {
      keywordHits++;
    }
  }
  score += Math.min(keywordHits / mapping.keywords.length, 0.4);

  // Direct text overlap (finding assumption words in pattern fix)
  const findingWords = findingText.split(/\W+/).filter(w => w.length > 3);
  let wordHits = 0;
  for (const word of findingWords) {
    if (patternText.includes(word)) wordHits++;
  }
  if (findingWords.length > 0) {
    score += Math.min(wordHits / findingWords.length, 0.3);
  }

  return Math.min(score, 1);
}

/**
 * Extract searchable keywords from finding text.
 */
function extractKeywords(assumption, suggestion) {
  const text = `${assumption || ''} ${suggestion || ''}`;
  const words = text.split(/\W+/).filter(w => w.length > 3);
  // Deduplicate and prioritize longer words
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

// ─── Summary Report ───

/**
 * Generate a cross-reference summary from enriched findings.
 *
 * @param {Array} enrichedFindings - Findings with relatedFixes
 * @returns {object} Summary with stats and actionable items
 */
function crossReferenceSummary(enrichedFindings) {
  if (!enrichedFindings || enrichedFindings.length === 0) {
    return { totalFindings: 0, withFixes: 0, actionable: [], coverage: {} };
  }

  const withFixes = enrichedFindings.filter(f => f.relatedFixes && f.relatedFixes.length > 0);
  const actionable = withFixes.map(f => ({
    bugClass: f.bugClass,
    line: f.line,
    assumption: f.assumption,
    topFix: f.relatedFixes[0],
    alternativeFixes: f.relatedFixes.length - 1,
  }));

  // Coverage by bug class
  const coverage = {};
  for (const f of enrichedFindings) {
    const cls = f.bugClass;
    if (!coverage[cls]) coverage[cls] = { total: 0, withFix: 0 };
    coverage[cls].total++;
    if (f.relatedFixes && f.relatedFixes.length > 0) coverage[cls].withFix++;
  }

  return {
    totalFindings: enrichedFindings.length,
    withFixes: withFixes.length,
    fixRate: enrichedFindings.length > 0 ? (withFixes.length / enrichedFindings.length).toFixed(2) : '0',
    actionable,
    coverage,
  };
}

module.exports = {
  crossReference,
  crossReferenceSummary,
  BUG_CLASS_TO_DEBUG_CATEGORIES,
  scoreRelevance,
  extractKeywords,
};
