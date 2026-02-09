/**
 * Pattern Insights — Deep analytics for the pattern library.
 *
 * Tracks and reports on:
 * - Usage trends: which patterns get pulled most, feedback rates
 * - Evolve tracking: patterns that get forked repeatedly → need improvement
 * - Coherency trends over time: is the library getting better?
 * - Search analytics: what queries are most common, what has no results
 * - Staleness detection: patterns that haven't been used in a long time
 * - Growth metrics: patterns added per period, candidates promoted
 *
 * All insights are computed from SQLite data — no external dependencies.
 */

/**
 * Get the SQLite store from an oracle instance.
 * Tries multiple paths since the store structure varies.
 */
function _getDB(oracle) {
  // Try pattern library's SQLite store first
  if (oracle.patterns?._sqlite?.db) return oracle.patterns._sqlite.db;
  // Try the history store
  if (oracle.store?.db) return oracle.store.db;
  // Try getSQLiteStore method
  if (typeof oracle.store?.getSQLiteStore === 'function') {
    const s = oracle.store.getSQLiteStore();
    if (s?.db) return s.db;
  }
  return null;
}

/**
 * Track an event in the insights log.
 * Creates the insights_events table if needed.
 */
function trackEvent(oracle, event) {
  const db = _getDB(oracle);
  if (!db) return false;

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS insights_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        pattern_id TEXT,
        query TEXT,
        detail TEXT DEFAULT '{}',
        outcome TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_insights_type ON insights_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_insights_ts ON insights_events(timestamp);
    `);
  } catch { /* table already exists */ }

  try {
    db.prepare(`
      INSERT INTO insights_events (timestamp, event_type, pattern_id, query, detail, outcome)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      event.type || 'unknown',
      event.patternId || null,
      event.query || null,
      JSON.stringify(event.detail || {}),
      event.outcome || null,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Most pulled patterns — sorted by usage_count descending.
 */
function mostPulledPatterns(oracle, limit = 20) {
  const db = _getDB(oracle);
  if (!db) {
    // Fallback: compute from in-memory data
    return oracle.patterns.getAll()
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        name: p.name,
        language: p.language,
        usageCount: p.usageCount || 0,
        successCount: p.successCount || 0,
        successRate: p.usageCount > 0 ? Math.round((p.successCount || 0) / p.usageCount * 100) : 0,
        coherency: p.coherencyScore?.total || 0,
      }));
  }

  try {
    const rows = db.prepare(`
      SELECT id, name, language, usage_count, success_count, coherency_total
      FROM patterns
      WHERE usage_count > 0
      ORDER BY usage_count DESC
      LIMIT ?
    `).all(limit);

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      language: r.language,
      usageCount: r.usage_count,
      successCount: r.success_count,
      successRate: r.usage_count > 0 ? Math.round(r.success_count / r.usage_count * 100) : 0,
      coherency: r.coherency_total,
    }));
  } catch {
    return [];
  }
}

/**
 * Evolve frequency — patterns that get forked (EVOLVE decision) repeatedly.
 * High evolve count = the original isn't good enough, needs improvement.
 */
function evolveFrequency(oracle, limit = 20) {
  const patterns = oracle.patterns.getAll();
  const evolveMap = {};

  for (const p of patterns) {
    const history = p.evolutionHistory || [];
    if (history.length > 0) {
      // This pattern was evolved FROM another
      for (const entry of history) {
        const parentId = entry.parentId || entry.parent;
        if (parentId) {
          evolveMap[parentId] = (evolveMap[parentId] || 0) + 1;
        }
      }
    }
  }

  // Also check patterns with variants array
  for (const p of patterns) {
    const variants = p.variants || [];
    if (variants.length > 0) {
      evolveMap[p.id] = (evolveMap[p.id] || 0) + variants.length;
    }
  }

  return Object.entries(evolveMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id, count]) => {
      const p = patterns.find(x => x.id === id);
      return {
        id,
        name: p?.name || 'unknown',
        language: p?.language || 'unknown',
        evolveCount: count,
        coherency: p?.coherencyScore?.total || 0,
        needsImprovement: count >= 3,
      };
    });
}

/**
 * Coherency trend over time — average coherency grouped by time period.
 */
function coherencyTrend(oracle, periodDays = 7) {
  const db = _getDB(oracle);
  const patterns = oracle.patterns.getAll().filter(p => p.timestamp || p.createdAt);

  if (patterns.length === 0) return [];

  // Group patterns by period
  const periods = {};
  const now = Date.now();

  for (const p of patterns) {
    const ts = new Date(p.timestamp || p.createdAt).getTime();
    if (isNaN(ts)) continue;
    const daysAgo = Math.floor((now - ts) / (86400000));
    const periodKey = Math.floor(daysAgo / periodDays) * periodDays;
    const periodLabel = periodKey === 0 ? 'current'
      : `${periodKey}-${periodKey + periodDays}d ago`;

    if (!periods[periodKey]) {
      periods[periodKey] = { label: periodLabel, daysAgo: periodKey, totalCoherency: 0, count: 0, patterns: 0 };
    }
    periods[periodKey].totalCoherency += p.coherencyScore?.total || 0;
    periods[periodKey].count++;
    periods[periodKey].patterns++;
  }

  return Object.values(periods)
    .map(p => ({
      period: p.label,
      daysAgo: p.daysAgo,
      avgCoherency: p.count > 0 ? Math.round(p.totalCoherency / p.count * 1000) / 1000 : 0,
      patternsAdded: p.patterns,
    }))
    .sort((a, b) => a.daysAgo - b.daysAgo);
}

/**
 * Stale patterns — patterns not used in a long time.
 * "Staleness" = days since last usage feedback, or since creation if never used.
 */
function stalePatterns(oracle, maxDays = 90, limit = 20) {
  const patterns = oracle.patterns.getAll();
  const now = Date.now();

  return patterns
    .map(p => {
      const created = new Date(p.timestamp || p.createdAt || 0).getTime();
      const lastUsed = p.lastUsed ? new Date(p.lastUsed).getTime() : created;
      const daysSinceUse = Math.floor((now - lastUsed) / 86400000);
      return {
        id: p.id,
        name: p.name,
        language: p.language,
        coherency: p.coherencyScore?.total || 0,
        daysSinceUse,
        usageCount: p.usageCount || 0,
        isStale: daysSinceUse >= maxDays,
      };
    })
    .filter(p => p.isStale)
    .sort((a, b) => b.daysSinceUse - a.daysSinceUse)
    .slice(0, limit);
}

/**
 * Search analytics — most common queries and zero-result queries.
 * Reads from insights_events table if available.
 */
function searchAnalytics(oracle, limit = 20) {
  const db = _getDB(oracle);
  if (!db) return { topQueries: [], zeroResults: [] };

  try {
    // Ensure table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS insights_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        pattern_id TEXT,
        query TEXT,
        detail TEXT DEFAULT '{}',
        outcome TEXT
      );
    `);

    const topQueries = db.prepare(`
      SELECT query, COUNT(*) as count,
             SUM(CASE WHEN outcome = 'found' THEN 1 ELSE 0 END) as found_count
      FROM insights_events
      WHERE event_type = 'search' AND query IS NOT NULL
      GROUP BY query
      ORDER BY count DESC
      LIMIT ?
    `).all(limit);

    const zeroResults = db.prepare(`
      SELECT query, COUNT(*) as count
      FROM insights_events
      WHERE event_type = 'search' AND outcome = 'no_results' AND query IS NOT NULL
      GROUP BY query
      ORDER BY count DESC
      LIMIT ?
    `).all(limit);

    return {
      topQueries: topQueries.map(r => ({ query: r.query, count: r.count, foundRate: r.count > 0 ? Math.round(r.found_count / r.count * 100) : 0 })),
      zeroResults: zeroResults.map(r => ({ query: r.query, count: r.count })),
    };
  } catch {
    return { topQueries: [], zeroResults: [] };
  }
}

/**
 * Growth metrics — patterns added/removed per period.
 */
function growthMetrics(oracle) {
  const db = _getDB(oracle);
  if (!db) {
    const all = oracle.patterns.getAll();
    return { totalPatterns: all.length, periods: [] };
  }

  try {
    // Group by week
    const rows = db.prepare(`
      SELECT
        strftime('%Y-W%W', created_at) as week,
        COUNT(*) as added,
        AVG(coherency_total) as avg_coherency
      FROM patterns
      WHERE created_at IS NOT NULL
      GROUP BY week
      ORDER BY week DESC
      LIMIT 52
    `).all();

    return {
      totalPatterns: oracle.patterns.getAll().length,
      periods: rows.map(r => ({
        week: r.week,
        added: r.added,
        avgCoherency: Math.round((r.avg_coherency || 0) * 1000) / 1000,
      })),
    };
  } catch {
    return { totalPatterns: oracle.patterns.getAll().length, periods: [] };
  }
}

/**
 * Feedback success rates — patterns with the best and worst success rates.
 */
function feedbackRates(oracle, limit = 10) {
  const patterns = oracle.patterns.getAll()
    .filter(p => (p.usageCount || 0) >= 2); // Only patterns with enough data

  const best = [...patterns]
    .sort((a, b) => {
      const rateA = a.usageCount > 0 ? (a.successCount || 0) / a.usageCount : 0;
      const rateB = b.usageCount > 0 ? (b.successCount || 0) / b.usageCount : 0;
      return rateB - rateA;
    })
    .slice(0, limit)
    .map(p => ({
      id: p.id,
      name: p.name,
      language: p.language,
      usageCount: p.usageCount || 0,
      successRate: p.usageCount > 0 ? Math.round((p.successCount || 0) / p.usageCount * 100) : 0,
    }));

  const worst = [...patterns]
    .sort((a, b) => {
      const rateA = a.usageCount > 0 ? (a.successCount || 0) / a.usageCount : 1;
      const rateB = b.usageCount > 0 ? (b.successCount || 0) / b.usageCount : 1;
      return rateA - rateB;
    })
    .slice(0, limit)
    .map(p => ({
      id: p.id,
      name: p.name,
      language: p.language,
      usageCount: p.usageCount || 0,
      successRate: p.usageCount > 0 ? Math.round((p.successCount || 0) / p.usageCount * 100) : 0,
    }));

  return { best, worst };
}

/**
 * Full insights report — all analytics in one call.
 */
function generateInsights(oracle, options = {}) {
  const { topLimit = 20, trendPeriod = 7, staleDays = 90 } = options;

  return {
    mostPulled: mostPulledPatterns(oracle, topLimit),
    evolveFrequency: evolveFrequency(oracle, topLimit),
    coherencyTrend: coherencyTrend(oracle, trendPeriod),
    stalePatterns: stalePatterns(oracle, staleDays, topLimit),
    searchAnalytics: searchAnalytics(oracle, topLimit),
    growthMetrics: growthMetrics(oracle),
    feedbackRates: feedbackRates(oracle),
  };
}

module.exports = {
  generateInsights,
  trackEvent,
  mostPulledPatterns,
  evolveFrequency,
  coherencyTrend,
  stalePatterns,
  searchAnalytics,
  growthMetrics,
  feedbackRates,
};
