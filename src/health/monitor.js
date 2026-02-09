/**
 * Health Monitor — Health checks and metrics collection for the Remembrance Oracle.
 *
 * Exposes:
 *   - health()  → { status, version, uptime, checks: { database, patterns, coherency } }
 *   - metrics() → { patterns, usage, candidates, coherencyDistribution, uptime }
 *
 * Designed to be consumed by the dashboard's /api/health and /api/metrics endpoints.
 */

const fs = require('fs');
const path = require('path');

const startTime = Date.now();

/**
 * Get the package version from package.json.
 */
function getVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check database health by running a simple query.
 */
function checkDatabase(oracle) {
  const start = Date.now();
  try {
    const stats = oracle.stats();
    const latencyMs = Date.now() - start;
    return {
      status: 'ok',
      latencyMs,
      totalEntries: stats.totalEntries || 0,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

/**
 * Check pattern library health.
 */
function checkPatterns(oracle) {
  try {
    const stats = oracle.patternStats();
    const total = stats.totalPatterns || stats.total || 0;
    return {
      status: total > 0 ? 'ok' : 'warning',
      count: total,
      byLanguage: stats.byLanguage || {},
      byType: stats.byType || {},
    };
  } catch (err) {
    return {
      status: 'error',
      count: 0,
      error: err.message,
    };
  }
}

/**
 * Check average coherency across patterns.
 */
function checkCoherency(oracle) {
  try {
    const patterns = oracle.patterns.getAll();
    if (patterns.length === 0) {
      return { status: 'warning', avgScore: 0, message: 'No patterns to score' };
    }
    let sum = 0;
    let count = 0;
    for (const p of patterns) {
      const score = p.coherencyScore?.total ?? p.coherency_total ?? 0;
      if (score > 0) {
        sum += score;
        count++;
      }
    }
    const avgScore = count > 0 ? Math.round((sum / count) * 1000) / 1000 : 0;
    return {
      status: avgScore >= 0.6 ? 'ok' : 'warning',
      avgScore,
      scoredPatterns: count,
    };
  } catch (err) {
    return {
      status: 'error',
      avgScore: 0,
      error: err.message,
    };
  }
}

/**
 * Run all health checks and return a summary.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @returns {{ status, version, uptime, timestamp, checks }}
 */
function health(oracle) {
  const database = checkDatabase(oracle);
  const patterns = checkPatterns(oracle);
  const coherency = checkCoherency(oracle);

  const checks = { database, patterns, coherency };

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  let status = 'healthy';
  if (statuses.includes('error')) status = 'unhealthy';
  else if (statuses.includes('warning')) status = 'degraded';

  return {
    status,
    version: getVersion(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * Compute coherency distribution buckets.
 * Returns counts for: [0-0.2), [0.2-0.4), [0.4-0.6), [0.6-0.8), [0.8-1.0]
 */
function coherencyDistribution(patterns) {
  const buckets = {
    '0.0-0.2': 0,
    '0.2-0.4': 0,
    '0.4-0.6': 0,
    '0.6-0.8': 0,
    '0.8-1.0': 0,
  };

  for (const p of patterns) {
    const score = p.coherencyScore?.total ?? p.coherency_total ?? 0;
    if (score < 0.2) buckets['0.0-0.2']++;
    else if (score < 0.4) buckets['0.2-0.4']++;
    else if (score < 0.6) buckets['0.4-0.6']++;
    else if (score < 0.8) buckets['0.6-0.8']++;
    else buckets['0.8-1.0']++;
  }

  return buckets;
}

/**
 * Collect comprehensive metrics snapshot.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @returns {{ patterns, usage, candidates, coherencyDistribution, uptime, timestamp }}
 */
function metrics(oracle) {
  // Pattern metrics
  const patternStats = oracle.patternStats();
  const allPatterns = oracle.patterns.getAll();
  const cohDist = coherencyDistribution(allPatterns);

  let cohSum = 0;
  let cohCount = 0;
  for (const p of allPatterns) {
    const score = p.coherencyScore?.total ?? p.coherency_total ?? 0;
    if (score > 0) { cohSum += score; cohCount++; }
  }

  // Usage metrics from pattern stats
  let totalUsage = 0;
  let totalSuccess = 0;
  for (const p of allPatterns) {
    totalUsage += p.usageCount || p.usage_count || 0;
    totalSuccess += p.successCount || p.success_count || 0;
  }

  // Candidate metrics
  let candidateStats = { total: 0, byMethod: {} };
  try {
    candidateStats = oracle.candidateStats();
  } catch { /* candidates might not be available */ }

  // Entry stats
  let entryStats = { totalEntries: 0 };
  try {
    entryStats = oracle.stats();
  } catch { /* stats might not be available */ }

  const pullRate = totalUsage > 0 ? Math.round((totalSuccess / totalUsage) * 1000) / 1000 : 0;

  return {
    patterns: {
      total: patternStats.totalPatterns || patternStats.total || 0,
      byLanguage: patternStats.byLanguage || {},
      byType: patternStats.byType || {},
      avgCoherency: cohCount > 0 ? Math.round((cohSum / cohCount) * 1000) / 1000 : 0,
      coherencyDistribution: cohDist,
    },
    usage: {
      totalQueries: totalUsage,
      totalSubmissions: entryStats.totalEntries || 0,
      totalFeedback: totalUsage,
      pullRate,
    },
    candidates: {
      total: candidateStats.total || 0,
      byMethod: candidateStats.byMethod || {},
    },
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  health,
  metrics,
  coherencyDistribution,
  checkDatabase,
  checkPatterns,
  checkCoherency,
  getVersion,
};
