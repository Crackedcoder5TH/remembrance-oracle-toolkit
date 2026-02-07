/**
 * Cross-Project Persistence — Personal & Community Stores
 *
 * Two-tier global architecture:
 *
 *   ~/.remembrance/
 *     personal/oracle.db  — YOUR private library, auto-syncs from all projects
 *     community/oracle.db — Shared library, patterns explicitly contributed
 *
 *   ./.remembrance/oracle.db — Project-local store (always present)
 *
 * The personal store grows automatically every time you sync.
 * The community store only grows when you explicitly `oracle share`.
 *
 * Federated search queries all three tiers: local → personal → community
 * with local taking priority for deduplication.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const GLOBAL_DIR = path.join(os.homedir(), '.remembrance');
const PERSONAL_DIR = path.join(GLOBAL_DIR, 'personal');
const COMMUNITY_DIR = path.join(GLOBAL_DIR, 'community');

// ─── Store Openers ───

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getGlobalDir() {
  ensureDir(GLOBAL_DIR);
  return GLOBAL_DIR;
}

function openStore(baseDir) {
  const { SQLiteStore, DatabaseSync } = require('../store/sqlite');
  if (!DatabaseSync) return null;
  ensureDir(path.join(baseDir, '.remembrance'));
  return new SQLiteStore(baseDir);
}

/**
 * Open the personal store at ~/.remembrance/personal/
 * This is the user's private cross-project library.
 */
function openPersonalStore() {
  ensureDir(PERSONAL_DIR);
  return openStore(PERSONAL_DIR);
}

/**
 * Open the community store at ~/.remembrance/community/
 * This is the shared library of explicitly contributed patterns.
 */
function openCommunityStore() {
  ensureDir(COMMUNITY_DIR);
  return openStore(COMMUNITY_DIR);
}

/**
 * Legacy compat: openGlobalStore maps to personal store.
 */
function openGlobalStore() {
  return openPersonalStore();
}

function hasGlobalStore() {
  return fs.existsSync(path.join(PERSONAL_DIR, '.remembrance', 'oracle.db'));
}

// ─── Pattern Transfer Helper ───

function transferPattern(pattern, targetStore) {
  targetStore.addPattern({
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
}

// ─── Sync: Local ↔ Personal (Private, Automatic) ───

/**
 * Sync proven patterns from local store to personal store.
 * This is the automatic private sync — runs on every `oracle sync`.
 */
function syncToGlobal(localStore, options = {}) {
  const { verbose = false, dryRun = false, minCoherency = 0.6 } = options;
  const personalStore = openPersonalStore();
  if (!personalStore) {
    return { synced: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  const localPatterns = localStore.getAllPatterns();
  const personalPatterns = personalStore.getAllPatterns();
  const personalIndex = new Set(personalPatterns.map(p => `${p.name}:${p.language}`));

  const report = { synced: 0, skipped: 0, duplicates: 0, total: localPatterns.length, details: [] };

  for (const pattern of localPatterns) {
    const key = `${pattern.name}:${pattern.language}`;

    if (personalIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    const coherency = pattern.coherency_total ?? pattern.coherencyTotal ?? pattern.coherencyScore?.total ?? 0;
    if (coherency < minCoherency) {
      report.skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        transferPattern(pattern, personalStore);
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
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'to-personal' });
  }

  return report;
}

/**
 * Pull patterns from personal store into local store.
 */
function syncFromGlobal(localStore, options = {}) {
  const { verbose = false, dryRun = false, language, minCoherency = 0.6, maxPull = Infinity } = options;
  const personalStore = openPersonalStore();
  if (!personalStore) {
    return { pulled: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  const personalPatterns = personalStore.getAllPatterns();
  const localPatterns = localStore.getAllPatterns();
  const localIndex = new Set(localPatterns.map(p => `${p.name}:${p.language}`));

  const report = { pulled: 0, skipped: 0, duplicates: 0, total: personalPatterns.length, details: [] };

  for (const pattern of personalPatterns) {
    if (report.pulled >= maxPull) break;

    const key = `${pattern.name}:${pattern.language}`;
    if (localIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (language && pattern.language !== language) {
      report.skipped++;
      continue;
    }

    const coherency = pattern.coherency_total ?? pattern.coherencyScore?.total ?? 0;
    if (coherency < minCoherency) {
      report.skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        transferPattern(pattern, localStore);
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
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'from-personal' });
  }

  return report;
}

/**
 * Bidirectional sync with personal store.
 */
function syncBidirectional(localStore, options = {}) {
  const push = syncToGlobal(localStore, options);
  const pull = syncFromGlobal(localStore, options);
  return { push, pull };
}

// ─── Share: Local → Community (Public, Explicit) ───

/**
 * Share specific patterns to the community store.
 * This is an explicit action — only patterns the user chooses get shared.
 *
 * @param {object} localStore - Local SQLiteStore
 * @param {object} options - { patterns?, language?, minCoherency?, verbose?, dryRun?, tags? }
 *   patterns: array of pattern names/IDs to share (if empty, shares all above threshold)
 *   tags: filter by tags
 */
function shareToCommuntiy(localStore, options = {}) {
  const { verbose = false, dryRun = false, minCoherency = 0.7, patterns: nameFilter, tags: tagFilter } = options;
  const communityStore = openCommunityStore();
  if (!communityStore) {
    return { shared: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  let localPatterns = localStore.getAllPatterns();
  const communityPatterns = communityStore.getAllPatterns();
  const communityIndex = new Set(communityPatterns.map(p => `${p.name}:${p.language}`));

  // Filter by name if specified
  if (nameFilter && nameFilter.length > 0) {
    const nameSet = new Set(nameFilter.map(n => n.toLowerCase()));
    localPatterns = localPatterns.filter(p =>
      nameSet.has(p.name.toLowerCase()) || nameSet.has(p.id)
    );
  }

  // Filter by tags if specified
  if (tagFilter && tagFilter.length > 0) {
    const tagSet = new Set(tagFilter.map(t => t.toLowerCase()));
    localPatterns = localPatterns.filter(p => {
      const pTags = (typeof p.tags === 'string' ? JSON.parse(p.tags) : (p.tags || []));
      return pTags.some(t => tagSet.has(t.toLowerCase()));
    });
  }

  const report = { shared: 0, skipped: 0, duplicates: 0, total: localPatterns.length, details: [] };

  for (const pattern of localPatterns) {
    const key = `${pattern.name}:${pattern.language}`;

    if (communityIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    const coherency = pattern.coherency_total ?? pattern.coherencyTotal ?? pattern.coherencyScore?.total ?? 0;
    if (coherency < minCoherency) {
      report.skipped++;
      if (verbose) console.log(`  [LOW] ${pattern.name}: coherency ${coherency.toFixed(3)} < ${minCoherency}`);
      continue;
    }

    // Community patterns must have test code
    const testCode = pattern.test_code || pattern.testCode;
    if (!testCode) {
      report.skipped++;
      if (verbose) console.log(`  [NO-TEST] ${pattern.name}: no test code, cannot share`);
      continue;
    }

    if (!dryRun) {
      try {
        transferPattern(pattern, communityStore);
      } catch (err) {
        if (verbose) console.log(`  [SKIP] ${pattern.name}: ${err.message}`);
        report.skipped++;
        continue;
      }
    }

    report.shared++;
    if (verbose) {
      console.log(`  [SHARE→] ${pattern.name} (${pattern.language}) coherency: ${coherency.toFixed(3)}`);
    }
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'to-community' });
  }

  return report;
}

/**
 * Pull patterns from the community store into local.
 * Users can browse and selectively pull community patterns.
 */
function pullFromCommunity(localStore, options = {}) {
  const { verbose = false, dryRun = false, language, minCoherency = 0.6, maxPull = Infinity, nameFilter } = options;
  const communityStore = openCommunityStore();
  if (!communityStore) {
    return { pulled: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  let communityPatterns = communityStore.getAllPatterns();
  const localPatterns = localStore.getAllPatterns();
  const localIndex = new Set(localPatterns.map(p => `${p.name}:${p.language}`));

  if (nameFilter && nameFilter.length > 0) {
    const nameSet = new Set(nameFilter.map(n => n.toLowerCase()));
    communityPatterns = communityPatterns.filter(p =>
      nameSet.has(p.name.toLowerCase()) || nameSet.has(p.id)
    );
  }

  const report = { pulled: 0, skipped: 0, duplicates: 0, total: communityPatterns.length, details: [] };

  for (const pattern of communityPatterns) {
    if (report.pulled >= maxPull) break;

    const key = `${pattern.name}:${pattern.language}`;
    if (localIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (language && pattern.language !== language) {
      report.skipped++;
      continue;
    }

    const coherency = pattern.coherency_total ?? pattern.coherencyScore?.total ?? 0;
    if (coherency < minCoherency) {
      report.skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        transferPattern(pattern, localStore);
      } catch (err) {
        if (verbose) console.log(`  [SKIP] ${pattern.name}: ${err.message}`);
        report.skipped++;
        continue;
      }
    }

    report.pulled++;
    if (verbose) {
      console.log(`  [←COMMUNITY] ${pattern.name} (${pattern.language}) coherency: ${coherency.toFixed ? coherency.toFixed(3) : coherency}`);
    }
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'from-community' });
  }

  return report;
}

// ─── Federated Query: Local + Personal + Community ───

/**
 * Search across all three tiers, deduplicated.
 * Priority: local > personal > community
 */
function federatedQuery(localStore, query = {}) {
  const personalStore = openPersonalStore();
  const communityStore = openCommunityStore();

  const localPatterns = localStore.getAllPatterns();
  const personalPatterns = personalStore ? personalStore.getAllPatterns() : [];
  const communityPatterns = communityStore ? communityStore.getAllPatterns() : [];

  const seen = new Set();
  const merged = [];

  // Local first (highest priority)
  for (const p of localPatterns) {
    const key = `${p.name}:${p.language}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'local' });
    }
  }

  // Personal second
  for (const p of personalPatterns) {
    const key = `${p.name}:${p.language}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'personal' });
    }
  }

  // Community last
  for (const p of communityPatterns) {
    const key = `${p.name}:${p.language}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'community' });
    }
  }

  // Apply filters
  let results = merged;
  if (query.language) {
    results = results.filter(p => p.language === query.language);
  }
  if (query.minCoherency) {
    results = results.filter(p => (p.coherency_total ?? p.coherencyTotal ?? p.coherencyScore?.total ?? 0) >= query.minCoherency);
  }
  if (query.source) {
    results = results.filter(p => p.source === query.source);
  }

  results.sort((a, b) => {
    const ca = a.coherency_total ?? a.coherencyTotal ?? a.coherencyScore?.total ?? 0;
    const cb = b.coherency_total ?? b.coherencyTotal ?? b.coherencyScore?.total ?? 0;
    return cb - ca;
  });

  return {
    localCount: localPatterns.length,
    personalCount: personalPatterns.length,
    communityCount: communityPatterns.length,
    mergedCount: results.length,
    personalOnly: results.filter(r => r.source === 'personal').length,
    communityOnly: results.filter(r => r.source === 'community').length,
    // Legacy compat
    globalCount: personalPatterns.length + communityPatterns.length,
    globalOnly: results.filter(r => r.source !== 'local').length,
    patterns: results,
  };
}

// ─── Stats ───

/**
 * Get stats for personal store.
 */
function personalStats() {
  const store = openPersonalStore();
  if (!store) return { available: false, error: 'No SQLite available' };
  return _storeStats(store, PERSONAL_DIR, 'personal');
}

/**
 * Get stats for community store.
 */
function communityStats() {
  const store = openCommunityStore();
  if (!store) return { available: false, error: 'No SQLite available' };
  return _storeStats(store, COMMUNITY_DIR, 'community');
}

/**
 * Legacy compat: globalStats maps to combined personal + community.
 */
function globalStats() {
  const personal = personalStats();
  const community = communityStats();

  if (!personal.available && !community.available) {
    return { available: false, error: 'No SQLite or global store' };
  }

  const byLanguage = { ...(personal.byLanguage || {}) };
  const byType = { ...(personal.byType || {}) };
  for (const [k, v] of Object.entries(community.byLanguage || {})) {
    byLanguage[k] = (byLanguage[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(community.byType || {})) {
    byType[k] = (byType[k] || 0) + v;
  }

  const totalPatterns = (personal.totalPatterns || 0) + (community.totalPatterns || 0);
  const weightedCoherency = (personal.avgCoherency || 0) * (personal.totalPatterns || 0)
    + (community.avgCoherency || 0) * (community.totalPatterns || 0);

  return {
    available: true,
    path: GLOBAL_DIR,
    totalPatterns,
    avgCoherency: totalPatterns > 0 ? Math.round(weightedCoherency / totalPatterns * 1000) / 1000 : 0,
    byLanguage,
    byType,
    personal,
    community,
  };
}

function _storeStats(store, dir, label) {
  const patterns = store.getAllPatterns();
  const byLanguage = {};
  const byType = {};
  let totalCoherency = 0;

  for (const p of patterns) {
    const lang = p.language || 'unknown';
    const type = p.pattern_type || p.patternType || 'utility';
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    totalCoherency += p.coherency_total ?? p.coherencyScore?.total ?? 0;
  }

  return {
    available: true,
    label,
    path: path.join(dir, '.remembrance', 'oracle.db'),
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
  openPersonalStore,
  openCommunityStore,
  syncToGlobal,
  syncFromGlobal,
  syncBidirectional,
  shareToCommuntiy,
  pullFromCommunity,
  federatedQuery,
  globalStats,
  personalStats,
  communityStats,
  GLOBAL_DIR,
  PERSONAL_DIR,
  COMMUNITY_DIR,
};
