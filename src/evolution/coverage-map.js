/**
 * Coverage Map — The Missing Mirror
 *
 * Self-awareness of gaps. The oracle knows what it HAS but not what it's MISSING.
 * This module generates a capability map — a knowledge of coverage, blind spots,
 * and strengths.
 *
 * "My validation patterns are 96% coherent but I have no WebSocket patterns.
 *  My Go coverage is 3 patterns — practically nonexistent."
 *
 * Uses the same CONCEPT_CLUSTERS from the embedding engine as the canonical
 * domain taxonomy. If a cluster has few/no patterns, it's a blind spot.
 */

const { CONCEPT_CLUSTERS, identifyConcepts } = require('../search/embeddings');

// Canonical domain taxonomy — broader than concept clusters
const DOMAINS = [
  { id: 'algorithms', keywords: ['sort', 'search', 'graph', 'tree', 'dynamic', 'greedy', 'recursion', 'traverse'] },
  { id: 'data-structures', keywords: ['stack', 'queue', 'linked', 'heap', 'trie', 'hashmap', 'set', 'array', 'list'] },
  { id: 'concurrency', keywords: ['async', 'parallel', 'worker', 'mutex', 'semaphore', 'channel', 'promise', 'race'] },
  { id: 'networking', keywords: ['http', 'fetch', 'socket', 'websocket', 'api', 'rest', 'graphql', 'tcp', 'udp'] },
  { id: 'security', keywords: ['encrypt', 'decrypt', 'auth', 'jwt', 'hash', 'sanitize', 'csrf', 'xss', 'sql-injection'] },
  { id: 'persistence', keywords: ['database', 'sql', 'file', 'storage', 'cache', 'redis', 'sqlite', 'read', 'write'] },
  { id: 'validation', keywords: ['validate', 'check', 'schema', 'guard', 'assert', 'sanitize', 'regex', 'format'] },
  { id: 'testing', keywords: ['test', 'mock', 'stub', 'fixture', 'benchmark', 'coverage', 'spec', 'assert'] },
  { id: 'error-handling', keywords: ['error', 'exception', 'try', 'catch', 'retry', 'fallback', 'recover', 'circuit'] },
  { id: 'functional', keywords: ['compose', 'pipe', 'curry', 'map', 'reduce', 'filter', 'monad', 'functor', 'pure'] },
  { id: 'string-processing', keywords: ['string', 'regex', 'parse', 'format', 'template', 'encode', 'decode', 'replace'] },
  { id: 'design-patterns', keywords: ['singleton', 'factory', 'observer', 'decorator', 'strategy', 'proxy', 'builder', 'adapter'] },
  { id: 'rate-limiting', keywords: ['throttle', 'debounce', 'rate', 'limit', 'cooldown', 'interval', 'timer'] },
  { id: 'cryptography', keywords: ['encrypt', 'decrypt', 'cipher', 'aes', 'rsa', 'hmac', 'signature', 'key'] },
  { id: 'serialization', keywords: ['json', 'xml', 'yaml', 'protobuf', 'serialize', 'deserialize', 'marshal', 'encode'] },
  { id: 'math', keywords: ['fibonacci', 'factorial', 'prime', 'matrix', 'gcd', 'permutation', 'combination', 'random'] },
];

/**
 * Generate a full coverage map for the oracle.
 * Returns domain coverage, language distribution, blind spots, and strengths.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @returns {object} coverageMap
 */
function generateCoverageMap(oracle) {
  // Cache: reuse if <5 min old and pattern count unchanged
  const patterns = oracle.patterns ? oracle.patterns.getAll() : [];
  if (oracle._coverageCache &&
      oracle._coverageCache.patternCount === patterns.length &&
      Date.now() - oracle._coverageCache.timestamp < 300000) {
    return oracle._coverageCache.data;
  }

  // Initialize temporal memory for health-aware scoring
  let temporal = null;
  try { temporal = oracle.getTemporalMemory?.(); } catch { /* unavailable */ }

  // Domain coverage
  const domainCoverage = {};
  for (const domain of DOMAINS) {
    domainCoverage[domain.id] = {
      patterns: [],
      count: 0,
      avgCoherency: 0,
      healthAdjustedCoherency: 0,
      languages: {},
      hasTests: 0,
      regressedCount: 0,
    };
  }

  // Classify each pattern into domains
  for (const p of patterns) {
    const text = [p.name, p.description, ...(p.tags || []), (p.code || '').slice(0, 300)].join(' ').toLowerCase();

    // Get temporal health multiplier (healthy=1.0, regressed=0.5, unknown=1.0)
    let healthMultiplier = 1.0;
    if (temporal) {
      try {
        const health = temporal.analyzeHealth(p.id);
        if (health.status === 'regressed') healthMultiplier = 0.5;
        else if (health.status === 'recovered') healthMultiplier = 0.9;
      } catch { /* skip */ }
    }

    for (const domain of DOMAINS) {
      const hits = domain.keywords.filter(k => text.includes(k)).length;
      if (hits >= 1) {
        const d = domainCoverage[domain.id];
        d.patterns.push(p.name || p.id);
        d.count++;
        const coherency = p.coherencyScore?.total ?? 0;
        d.avgCoherency += coherency;
        d.healthAdjustedCoherency += coherency * healthMultiplier;
        if (healthMultiplier < 1.0) d.regressedCount++;
        const lang = p.language || 'unknown';
        d.languages[lang] = (d.languages[lang] || 0) + 1;
        if (p.testCode) d.hasTests++;
      }
    }
  }

  // Normalize averages
  for (const domain of DOMAINS) {
    const d = domainCoverage[domain.id];
    if (d.count > 0) {
      d.avgCoherency = +(d.avgCoherency / d.count).toFixed(3);
      d.healthAdjustedCoherency = +(d.healthAdjustedCoherency / d.count).toFixed(3);
    }
    // Trim pattern list to top 10
    d.patterns = d.patterns.slice(0, 10);
  }

  // Language distribution
  const languages = {};
  for (const p of patterns) {
    const lang = p.language || 'unknown';
    if (!languages[lang]) languages[lang] = { count: 0, avgCoherency: 0, total: 0 };
    languages[lang].count++;
    languages[lang].total += (p.coherencyScore?.total ?? 0);
  }
  for (const lang of Object.keys(languages)) {
    languages[lang].avgCoherency = +(languages[lang].total / languages[lang].count).toFixed(3);
    delete languages[lang].total;
  }

  // Identify blind spots (domains with <3 patterns)
  const blindSpots = DOMAINS
    .filter(d => domainCoverage[d.id].count < 3)
    .map(d => ({
      domain: d.id,
      count: domainCoverage[d.id].count,
      severity: domainCoverage[d.id].count === 0 ? 'critical' : 'low',
      suggestion: `Consider adding ${d.keywords.slice(0, 3).join(', ')} patterns`,
    }));

  // Identify strengths (domains with >10 patterns and avg coherency > 0.85)
  const strengths = DOMAINS
    .filter(d => domainCoverage[d.id].count >= 10 && domainCoverage[d.id].avgCoherency >= 0.85)
    .map(d => ({
      domain: d.id,
      count: domainCoverage[d.id].count,
      avgCoherency: domainCoverage[d.id].avgCoherency,
    }));

  // Language gaps (languages with <5 patterns)
  const languageGaps = Object.entries(languages)
    .filter(([, v]) => v.count < 5)
    .map(([lang, v]) => ({ language: lang, count: v.count, suggestion: `Only ${v.count} ${lang} pattern(s) — consider adding more` }));

  // Overall health score (0-1)
  const domainsCovered = DOMAINS.filter(d => domainCoverage[d.id].count >= 3).length;
  const healthScore = domainsCovered / DOMAINS.length;

  // Generate narrative
  const narrative = _generateNarrative(patterns.length, domainsCovered, DOMAINS.length, blindSpots, strengths, languageGaps);

  const result = {
    totalPatterns: patterns.length,
    domainsCovered,
    totalDomains: DOMAINS.length,
    healthScore: +healthScore.toFixed(3),
    domains: domainCoverage,
    languages,
    blindSpots,
    strengths,
    languageGaps,
    narrative,
  };

  // Cache result on oracle instance
  if (oracle) {
    oracle._coverageCache = { timestamp: Date.now(), patternCount: patterns.length, data: result };
  }

  return result;
}

function _generateNarrative(total, covered, totalDomains, blindSpots, strengths, langGaps) {
  const lines = [];
  lines.push(`The oracle holds ${total} patterns across ${covered}/${totalDomains} domains.`);

  if (strengths.length > 0) {
    lines.push(`Strengths: ${strengths.map(s => `${s.domain} (${s.count} patterns, ${s.avgCoherency} avg)`).join(', ')}.`);
  }

  if (blindSpots.length > 0) {
    const critical = blindSpots.filter(b => b.severity === 'critical');
    const low = blindSpots.filter(b => b.severity === 'low');
    if (critical.length > 0) {
      lines.push(`Blind spots (no coverage): ${critical.map(b => b.domain).join(', ')}.`);
    }
    if (low.length > 0) {
      lines.push(`Weak areas (<3 patterns): ${low.map(b => `${b.domain} (${b.count})`).join(', ')}.`);
    }
  }

  if (langGaps.length > 0) {
    lines.push(`Language gaps: ${langGaps.map(g => `${g.language} (${g.count})`).join(', ')}.`);
  }

  if (blindSpots.length === 0 && langGaps.length === 0) {
    lines.push('The oracle has comprehensive coverage across all domains and languages.');
  }

  return lines.join(' ');
}

module.exports = {
  generateCoverageMap,
  DOMAINS,
};
