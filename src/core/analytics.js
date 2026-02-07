/**
 * Pattern Analytics — Tracks usage, trends, and insights for the pattern library.
 *
 * Provides:
 * - Top patterns by pulls/usage
 * - Coherency distribution
 * - Language breakdown over time
 * - Pattern health (reliability trend)
 * - Search query tracking
 * - Growth metrics
 */

/**
 * Generate full analytics report from an Oracle instance.
 */
function generateAnalytics(oracle) {
  const patterns = oracle.patterns.getAll();
  const entries = oracle.store.getAll();

  return {
    overview: computeOverview(patterns, entries),
    coherencyDistribution: computeCoherencyDistribution(patterns),
    languageBreakdown: computeLanguageBreakdown(patterns),
    topPatterns: computeTopPatterns(patterns),
    complexityBreakdown: computeComplexityBreakdown(patterns),
    healthReport: computeHealthReport(patterns),
    recentActivity: computeRecentActivity(patterns, entries),
  };
}

function computeOverview(patterns, entries) {
  const totalPatterns = patterns.length;
  const totalEntries = entries.length;
  const avgCoherency = totalPatterns > 0
    ? patterns.reduce((sum, p) => sum + (p.coherencyScore?.total || 0), 0) / totalPatterns
    : 0;
  const languages = new Set(patterns.map(p => p.language).filter(Boolean));
  const withTests = patterns.filter(p => p.tags?.includes('test-backed')).length;
  const highQuality = patterns.filter(p => (p.coherencyScore?.total || 0) >= 0.7).length;

  return {
    totalPatterns,
    totalEntries,
    avgCoherency: Math.round(avgCoherency * 1000) / 1000,
    languages: languages.size,
    languageList: [...languages],
    withTests,
    highQuality,
    qualityRatio: totalPatterns > 0 ? Math.round(highQuality / totalPatterns * 100) : 0,
  };
}

function computeCoherencyDistribution(patterns) {
  const buckets = { '0.0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6-0.8': 0, '0.8-1.0': 0 };
  for (const p of patterns) {
    const score = p.coherencyScore?.total || 0;
    if (score < 0.2) buckets['0.0-0.2']++;
    else if (score < 0.4) buckets['0.2-0.4']++;
    else if (score < 0.6) buckets['0.4-0.6']++;
    else if (score < 0.8) buckets['0.6-0.8']++;
    else buckets['0.8-1.0']++;
  }
  return buckets;
}

function computeLanguageBreakdown(patterns) {
  const breakdown = {};
  for (const p of patterns) {
    const lang = p.language || 'unknown';
    if (!breakdown[lang]) breakdown[lang] = { count: 0, avgCoherency: 0, totalCoherency: 0 };
    breakdown[lang].count++;
    breakdown[lang].totalCoherency += p.coherencyScore?.total || 0;
  }
  for (const lang of Object.keys(breakdown)) {
    breakdown[lang].avgCoherency = breakdown[lang].count > 0
      ? Math.round(breakdown[lang].totalCoherency / breakdown[lang].count * 1000) / 1000
      : 0;
    delete breakdown[lang].totalCoherency;
  }
  return breakdown;
}

function computeTopPatterns(patterns) {
  return [...patterns]
    .sort((a, b) => (b.coherencyScore?.total || 0) - (a.coherencyScore?.total || 0))
    .slice(0, 20)
    .map(p => ({
      id: p.id,
      name: p.name,
      language: p.language,
      coherency: p.coherencyScore?.total || 0,
      type: p.patternType,
      complexity: p.complexity,
      tags: (p.tags || []).slice(0, 5),
    }));
}

function computeComplexityBreakdown(patterns) {
  const breakdown = {};
  for (const p of patterns) {
    const cx = p.complexity || 'unknown';
    if (!breakdown[cx]) breakdown[cx] = 0;
    breakdown[cx]++;
  }
  return breakdown;
}

function computeHealthReport(patterns) {
  const total = patterns.length;
  if (total === 0) return { healthy: 0, warning: 0, critical: 0, patterns: [] };

  const healthy = patterns.filter(p => (p.coherencyScore?.total || 0) >= 0.6).length;
  const warning = patterns.filter(p => {
    const s = p.coherencyScore?.total || 0;
    return s >= 0.4 && s < 0.6;
  }).length;
  const critical = patterns.filter(p => (p.coherencyScore?.total || 0) < 0.4).length;

  const criticalPatterns = patterns
    .filter(p => (p.coherencyScore?.total || 0) < 0.4)
    .map(p => ({ id: p.id, name: p.name, coherency: p.coherencyScore?.total || 0 }));

  return { healthy, warning, critical, criticalPatterns };
}

function computeRecentActivity(patterns, entries) {
  // Sort by timestamp, most recent first
  const sorted = [...patterns]
    .filter(p => p.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  return sorted.map(p => ({
    id: p.id,
    name: p.name,
    language: p.language,
    coherency: p.coherencyScore?.total || 0,
    timestamp: p.timestamp,
  }));
}

/**
 * Compute tag cloud — most common tags with counts.
 */
function computeTagCloud(patterns) {
  const tagCounts = {};
  for (const p of patterns) {
    for (const tag of (p.tags || [])) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, count]) => ({ tag, count }));
}

module.exports = { generateAnalytics, computeTagCloud };
