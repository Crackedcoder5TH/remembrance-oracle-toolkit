/**
 * Cross-Project Persistence — Global Store + Sync Engine
 *
 * Makes the oracle's pattern library persist across projects and sessions.
 *
 * Architecture:
 *   - Global store: ~/.remembrance/oracle.db (shared across all projects)
 *   - Local store: ./.remembrance/oracle.db (project-specific)
 *   - Sync: proven patterns propagate local → global and global → local
 *   - Search: queries search both local and global stores
 *
 * The global store is the "long-term memory" that accumulates patterns
 * across every project the developer works on.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const GLOBAL_DIR = path.join(os.homedir(), '.remembrance');
const GLOBAL_DB = 'oracle.db';

/**
 * Get the global store directory path.
 * Creates it if it doesn't exist.
 */
function getGlobalDir() {
  if (!fs.existsSync(GLOBAL_DIR)) {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  }
  return GLOBAL_DIR;
}

/**
 * Check if a global store exists.
 */
function hasGlobalStore() {
  return fs.existsSync(path.join(GLOBAL_DIR, GLOBAL_DB));
}

/**
 * Open or create the global SQLite store.
 * Returns a SQLiteStore instance pointed at ~/.remembrance/
 */
function openGlobalStore() {
  const { SQLiteStore, DatabaseSync } = require('../store/sqlite');
  if (!DatabaseSync) return null;

  // SQLiteStore expects baseDir and creates .remembrance/ inside it.
  // For global, we want ~/.remembrance/oracle.db, so baseDir = ~
  const globalBase = os.homedir();
  return new SQLiteStore(globalBase);
}

/**
 * Sync proven patterns from local store to global store.
 * Only copies patterns that don't already exist in global (by name+language).
 *
 * @param {object} localStore - Local SQLiteStore instance
 * @param {object} options - { verbose?, dryRun?, minCoherency? }
 * @returns {{ synced, skipped, total }}
 */
function syncToGlobal(localStore, options = {}) {
  const { verbose = false, dryRun = false, minCoherency = 0.6 } = options;
  const globalStore = openGlobalStore();
  if (!globalStore) {
    return { synced: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  const localPatterns = localStore.getAllPatterns();
  const globalPatterns = globalStore.getAllPatterns();
  const globalIndex = new Set(globalPatterns.map(p => `${p.name}:${p.language}`));

  const report = { synced: 0, skipped: 0, duplicates: 0, total: localPatterns.length, details: [] };

  for (const pattern of localPatterns) {
    const key = `${pattern.name}:${pattern.language}`;

    if (globalIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    // Skip low-coherency patterns
    const coherency = pattern.coherency_total ?? pattern.coherencyTotal ?? 0;
    if (coherency < minCoherency) {
      report.skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        globalStore.addPattern({
          name: pattern.name,
          code: pattern.code,
          language: pattern.language,
          patternType: pattern.pattern_type || pattern.patternType || 'utility',
          complexity: pattern.complexity || 'composite',
          description: pattern.description || '',
          tags: typeof pattern.tags === 'string' ? JSON.parse(pattern.tags) : (pattern.tags || []),
          coherencyScore: typeof pattern.coherency_json === 'string'
            ? JSON.parse(pattern.coherency_json)
            : (pattern.coherencyScore || {}),
          testCode: pattern.test_code || pattern.testCode || null,
          evolutionHistory: typeof pattern.evolution_history === 'string'
            ? JSON.parse(pattern.evolution_history)
            : (pattern.evolutionHistory || []),
        });
      } catch (err) {
        if (verbose) console.log(`  [SKIP] ${pattern.name}: ${err.message}`);
        report.skipped++;
        continue;
      }
    }

    report.synced++;
    if (verbose) {
      console.log(`  [SYNC→] ${pattern.name} (${pattern.language}) coherency: ${coherency.toFixed ? coherency.toFixed(3) : coherency}`);
    }
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'to-global' });
  }

  return report;
}

/**
 * Sync proven patterns from global store to local store.
 * Pulls patterns that exist in global but not in local.
 *
 * @param {object} localStore - Local SQLiteStore instance
 * @param {object} options - { verbose?, dryRun?, language?, minCoherency?, maxPull? }
 * @returns {{ pulled, skipped, total }}
 */
function syncFromGlobal(localStore, options = {}) {
  const { verbose = false, dryRun = false, language, minCoherency = 0.6, maxPull = Infinity } = options;
  const globalStore = openGlobalStore();
  if (!globalStore) {
    return { pulled: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  const globalPatterns = globalStore.getAllPatterns();
  const localPatterns = localStore.getAllPatterns();
  const localIndex = new Set(localPatterns.map(p => `${p.name}:${p.language}`));

  const report = { pulled: 0, skipped: 0, duplicates: 0, total: globalPatterns.length, details: [] };

  for (const pattern of globalPatterns) {
    if (report.pulled >= maxPull) break;

    const key = `${pattern.name}:${pattern.language}`;
    if (localIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    // Filter by language if specified
    if (language && pattern.language !== language) {
      report.skipped++;
      continue;
    }

    const coherency = pattern.coherency_total ?? 0;
    if (coherency < minCoherency) {
      report.skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        localStore.addPattern({
          name: pattern.name,
          code: pattern.code,
          language: pattern.language,
          patternType: pattern.pattern_type || 'utility',
          complexity: pattern.complexity || 'composite',
          description: pattern.description || '',
          tags: typeof pattern.tags === 'string' ? JSON.parse(pattern.tags) : (pattern.tags || []),
          coherencyScore: typeof pattern.coherency_json === 'string'
            ? JSON.parse(pattern.coherency_json)
            : (pattern.coherencyScore || {}),
          testCode: pattern.test_code || null,
          evolutionHistory: typeof pattern.evolution_history === 'string'
            ? JSON.parse(pattern.evolution_history)
            : (pattern.evolutionHistory || []),
        });
      } catch (err) {
        if (verbose) console.log(`  [SKIP] ${pattern.name}: ${err.message}`);
        report.skipped++;
        continue;
      }
    }

    report.pulled++;
    if (verbose) {
      console.log(`  [←PULL] ${pattern.name} (${pattern.language}) coherency: ${coherency.toFixed ? coherency.toFixed(3) : coherency}`);
    }
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'from-global' });
  }

  return report;
}

/**
 * Bidirectional sync: push local → global, then pull global → local.
 *
 * @param {object} localStore - Local SQLiteStore instance
 * @param {object} options - { verbose?, dryRun? }
 * @returns {{ push, pull }}
 */
function syncBidirectional(localStore, options = {}) {
  const push = syncToGlobal(localStore, options);
  const pull = syncFromGlobal(localStore, options);
  return { push, pull };
}

/**
 * Search both local and global stores, deduplicated by name+language.
 * Returns merged results sorted by coherency.
 *
 * @param {object} localStore - Local SQLiteStore instance
 * @param {object} query - { language?, minCoherency? }
 * @returns {{ local, global, merged }}
 */
function federatedQuery(localStore, query = {}) {
  const globalStore = openGlobalStore();
  const localPatterns = localStore.getAllPatterns();

  let globalPatterns = [];
  if (globalStore) {
    globalPatterns = globalStore.getAllPatterns();
  }

  // Deduplicate: local takes priority
  const seen = new Set();
  const merged = [];

  for (const p of localPatterns) {
    const key = `${p.name}:${p.language}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'local' });
    }
  }

  for (const p of globalPatterns) {
    const key = `${p.name}:${p.language}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'global' });
    }
  }

  // Apply filters
  let results = merged;
  if (query.language) {
    results = results.filter(p => p.language === query.language);
  }
  if (query.minCoherency) {
    results = results.filter(p => (p.coherency_total ?? p.coherencyTotal ?? 0) >= query.minCoherency);
  }

  // Sort by coherency descending
  results.sort((a, b) => {
    const ca = a.coherency_total ?? a.coherencyTotal ?? 0;
    const cb = b.coherency_total ?? b.coherencyTotal ?? 0;
    return cb - ca;
  });

  return {
    localCount: localPatterns.length,
    globalCount: globalPatterns.length,
    mergedCount: results.length,
    globalOnly: results.filter(r => r.source === 'global').length,
    patterns: results,
  };
}

/**
 * Get global store stats.
 */
function globalStats() {
  const globalStore = openGlobalStore();
  if (!globalStore) {
    return { available: false, error: 'No SQLite or global store' };
  }

  const patterns = globalStore.getAllPatterns();
  const byLanguage = {};
  const byType = {};
  let totalCoherency = 0;

  for (const p of patterns) {
    const lang = p.language || 'unknown';
    const type = p.pattern_type || 'utility';
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    totalCoherency += p.coherency_total ?? 0;
  }

  return {
    available: true,
    path: path.join(GLOBAL_DIR, GLOBAL_DB),
    totalPatterns: patterns.length,
    avgCoherency: patterns.length > 0 ? Math.round(totalCoherency / patterns.length * 1000) / 1000 : 0,
    byLanguage,
    byType,
  };
}

module.exports = {
  getGlobalDir,
  hasGlobalStore,
  openGlobalStore,
  syncToGlobal,
  syncFromGlobal,
  syncBidirectional,
  federatedQuery,
  globalStats,
  GLOBAL_DIR,
};
