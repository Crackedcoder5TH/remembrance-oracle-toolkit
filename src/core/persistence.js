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
  const patternData = {
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
  };

  // Use dedup-safe insert: skip if same (name, language) exists with equal/higher coherency
  if (typeof targetStore.addPatternIfNotExists === 'function') {
    return targetStore.addPatternIfNotExists(patternData);
  }
  // Fallback: addPattern now routes through addPatternIfNotExists internally,
  // but guard against truly raw stores by checking for existing pattern first
  if (typeof targetStore.getPatternByName === 'function') {
    const existing = targetStore.getPatternByName(patternData.name);
    if (existing) return null; // Skip duplicate
  }
  return targetStore.addPattern(patternData);
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

  // Auto-deduplicate the personal store before syncing (clean up historical cruft)
  if (typeof personalStore.deduplicatePatterns === 'function') {
    personalStore.deduplicatePatterns();
  }

  const localPatterns = localStore.getAllPatterns();
  const personalPatterns = personalStore.getAllPatterns();
  const personalIndex = new Set(personalPatterns.map(p => `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`));

  const report = { synced: 0, skipped: 0, duplicates: 0, total: localPatterns.length, details: [] };

  for (const pattern of localPatterns) {
    const key = `${pattern.name.toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;

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

    // Track what we just added so we don't re-add duplicates from the same batch
    personalIndex.add(key);

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

  // Deduplicate the personal store first (removes historical cruft)
  if (typeof personalStore.deduplicatePatterns === 'function') {
    personalStore.deduplicatePatterns();
  }

  // Deduplicate local store too
  if (typeof localStore.deduplicatePatterns === 'function') {
    localStore.deduplicatePatterns();
  }

  const personalPatterns = personalStore.getAllPatterns();
  const localPatterns = localStore.getAllPatterns();
  const localIndex = new Set(localPatterns.map(p => `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`));

  const report = { pulled: 0, skipped: 0, duplicates: 0, total: personalPatterns.length, details: [] };

  for (const pattern of personalPatterns) {
    if (report.pulled >= maxPull) break;

    const key = `${pattern.name.toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;
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

    // Track what we just added so duplicates in personal don't get re-pulled
    localIndex.add(key);

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
function shareToCommunity(localStore, options = {}) {
  const { verbose = false, dryRun = false, minCoherency = 0.7, patterns: nameFilter, tags: tagFilter } = options;
  const communityStore = openCommunityStore();
  if (!communityStore) {
    return { shared: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  let localPatterns = localStore.getAllPatterns();
  const communityPatterns = communityStore.getAllPatterns();
  const communityIndex = new Set(communityPatterns.map(p => `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`));

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

  // Deduplicate community store before sharing
  if (typeof communityStore.deduplicatePatterns === 'function') {
    communityStore.deduplicatePatterns();
  }

  const report = { shared: 0, skipped: 0, duplicates: 0, total: localPatterns.length, details: [] };

  for (const pattern of localPatterns) {
    const key = `${pattern.name.toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;

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

    // Track to prevent duplicates in same batch
    communityIndex.add(key);

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
  const localIndex = new Set(localPatterns.map(p => `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`));

  if (nameFilter && nameFilter.length > 0) {
    const nameSet = new Set(nameFilter.map(n => n.toLowerCase()));
    communityPatterns = communityPatterns.filter(p =>
      nameSet.has(p.name.toLowerCase()) || nameSet.has(p.id)
    );
  }

  // Deduplicate community store
  if (typeof communityStore.deduplicatePatterns === 'function') {
    communityStore.deduplicatePatterns();
  }

  const report = { pulled: 0, skipped: 0, duplicates: 0, total: communityPatterns.length, details: [] };

  for (const pattern of communityPatterns) {
    if (report.pulled >= maxPull) break;

    const key = `${pattern.name.toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;
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

    // Track to prevent duplicate pulls in same batch
    localIndex.add(key);

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

  // Local first (highest priority) — case-insensitive dedup keys
  for (const p of localPatterns) {
    const key = `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'local' });
    }
  }

  // Personal second
  for (const p of personalPatterns) {
    const key = `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'personal' });
    }
  }

  // Community last
  for (const p of communityPatterns) {
    const key = `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
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

// ─── Debug Pattern Community Layer ───

/**
 * Share debug patterns to the community store.
 * Higher bar than regular patterns: requires confidence >= 0.5 and at least 1 successful resolution.
 */
function shareDebugPatterns(localStore, options = {}) {
  const { verbose = false, dryRun = false, minConfidence = 0.5, category, language } = options;
  const communityStore = openCommunityStore();
  if (!communityStore) {
    return { shared: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  // Ensure debug_patterns table exists on community store
  _ensureDebugSchema(communityStore);

  let sql = 'SELECT * FROM debug_patterns WHERE confidence >= ?';
  const params = [minConfidence];
  if (category) { sql += ' AND error_category = ?'; params.push(category); }
  if (language) { sql += ' AND language = ?'; params.push(language); }
  sql += ' ORDER BY confidence DESC';

  let localDebug;
  try {
    localDebug = localStore.db.prepare(sql).all(...params);
  } catch {
    return { shared: 0, skipped: 0, total: 0, error: 'No debug_patterns table in local store' };
  }

  // Index existing community debug patterns by fingerprint+language
  let communityDebug;
  try {
    communityDebug = communityStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch {
    communityDebug = [];
  }
  const communityIndex = new Set(communityDebug.map(d => `${d.fingerprint_hash}:${d.language}`));

  const report = { shared: 0, skipped: 0, duplicates: 0, total: localDebug.length, details: [] };

  for (const dp of localDebug) {
    const key = `${dp.fingerprint_hash}:${dp.language}`;
    if (communityIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    // Must have at least 1 successful resolution
    if (dp.times_resolved < 1 && dp.generation_method === 'capture') {
      report.skipped++;
      if (verbose) console.log(`  [NO-RESOLVE] ${dp.error_class}: not yet proven`);
      continue;
    }

    if (!dryRun) {
      try {
        _transferDebugPattern(dp, communityStore);
      } catch (err) {
        if (verbose) console.log(`  [SKIP] ${dp.id}: ${err.message}`);
        report.skipped++;
        continue;
      }
    }

    report.shared++;
    if (verbose) {
      console.log(`  [SHARE-DEBUG→] ${dp.error_class}:${dp.error_category} (${dp.language}) confidence: ${dp.confidence}`);
    }
    report.details.push({
      errorClass: dp.error_class, category: dp.error_category,
      language: dp.language, confidence: dp.confidence, direction: 'to-community',
    });
  }

  return report;
}

/**
 * Pull debug patterns from community store into local.
 */
function pullDebugPatterns(localStore, options = {}) {
  const { verbose = false, dryRun = false, minConfidence = 0.3, category, language, limit = Infinity } = options;
  const communityStore = openCommunityStore();
  if (!communityStore) {
    return { pulled: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  _ensureDebugSchema(localStore);

  let communityDebug;
  try {
    let sql = 'SELECT * FROM debug_patterns WHERE confidence >= ?';
    const params = [minConfidence];
    if (category) { sql += ' AND error_category = ?'; params.push(category); }
    if (language) { sql += ' AND language = ?'; params.push(language); }
    sql += ' ORDER BY confidence DESC';
    communityDebug = communityStore.db.prepare(sql).all(...params);
  } catch {
    return { pulled: 0, skipped: 0, total: 0, error: 'No debug_patterns in community store' };
  }

  let localDebug;
  try {
    localDebug = localStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch {
    localDebug = [];
  }
  const localIndex = new Set(localDebug.map(d => `${d.fingerprint_hash}:${d.language}`));

  const report = { pulled: 0, skipped: 0, duplicates: 0, total: communityDebug.length, details: [] };

  for (const dp of communityDebug) {
    if (report.pulled >= limit) break;

    const key = `${dp.fingerprint_hash}:${dp.language}`;
    if (localIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (!dryRun) {
      try {
        _transferDebugPattern(dp, localStore);
      } catch (err) {
        if (verbose) console.log(`  [SKIP] ${dp.id}: ${err.message}`);
        report.skipped++;
        continue;
      }
    }

    report.pulled++;
    if (verbose) {
      console.log(`  [←DEBUG] ${dp.error_class}:${dp.error_category} (${dp.language}) confidence: ${dp.confidence}`);
    }
    report.details.push({
      errorClass: dp.error_class, category: dp.error_category,
      language: dp.language, confidence: dp.confidence, direction: 'from-community',
    });
  }

  return report;
}

/**
 * Sync debug patterns to personal store (private).
 */
function syncDebugToPersonal(localStore, options = {}) {
  const { verbose = false, dryRun = false, minConfidence = 0.2 } = options;
  const personalStore = openPersonalStore();
  if (!personalStore) {
    return { synced: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  _ensureDebugSchema(personalStore);

  let localDebug;
  try {
    localDebug = localStore.db.prepare(
      'SELECT * FROM debug_patterns WHERE confidence >= ? ORDER BY confidence DESC'
    ).all(minConfidence);
  } catch {
    return { synced: 0, skipped: 0, total: 0, error: 'No debug_patterns table' };
  }

  let personalDebug;
  try {
    personalDebug = personalStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch {
    personalDebug = [];
  }
  const personalIndex = new Set(personalDebug.map(d => `${d.fingerprint_hash}:${d.language}`));

  const report = { synced: 0, skipped: 0, duplicates: 0, total: localDebug.length, details: [] };

  for (const dp of localDebug) {
    const key = `${dp.fingerprint_hash}:${dp.language}`;
    if (personalIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (!dryRun) {
      try {
        _transferDebugPattern(dp, personalStore);
      } catch {
        report.skipped++;
        continue;
      }
    }

    // Track to prevent duplicates in same batch
    personalIndex.add(key);

    report.synced++;
    if (verbose) {
      console.log(`  [SYNC-DEBUG→] ${dp.error_class}:${dp.error_category} (${dp.language})`);
    }
  }

  return report;
}

/**
 * Federated debug search: search across local + personal + community.
 * Returns merged results, deduplicated, sorted by confidence.
 */
function federatedDebugSearch(localStore, params = {}) {
  const { errorMessage, stackTrace, language, limit = 10 } = params;

  const personalStore = openPersonalStore();
  const communityStore = openCommunityStore();

  const results = [];
  const seen = new Set();

  // Search each tier
  for (const [store, source] of [[localStore, 'local'], [personalStore, 'personal'], [communityStore, 'community']]) {
    if (!store) continue;
    try {
      const { DebugOracle } = require('./debug-oracle');
      const debugOracle = new DebugOracle(store);
      const matches = debugOracle.search({ errorMessage, stackTrace, language, limit });
      for (const match of matches) {
        const key = `${match.fingerprintHash}:${match.language}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ...match, source });
      }
    } catch {
      // Store doesn't have debug_patterns table yet, skip
    }
  }

  return results
    .sort((a, b) => b.matchScore - a.matchScore || b.confidence - a.confidence)
    .slice(0, limit);
}

/**
 * Get debug stats across all tiers.
 */
function debugGlobalStats() {
  const stats = { local: null, personal: null, community: null };

  try {
    const personalStore = openPersonalStore();
    if (personalStore) {
      const { DebugOracle } = require('./debug-oracle');
      stats.personal = new DebugOracle(personalStore).stats();
    }
  } catch {}

  try {
    const communityStore = openCommunityStore();
    if (communityStore) {
      const { DebugOracle } = require('./debug-oracle');
      stats.community = new DebugOracle(communityStore).stats();
    }
  } catch {}

  const totalPatterns = (stats.personal?.totalPatterns || 0) + (stats.community?.totalPatterns || 0);
  const totalApplied = (stats.personal?.totalApplied || 0) + (stats.community?.totalApplied || 0);
  const totalResolved = (stats.personal?.totalResolved || 0) + (stats.community?.totalResolved || 0);

  return {
    available: totalPatterns > 0,
    totalPatterns,
    totalApplied,
    totalResolved,
    resolutionRate: totalApplied > 0 ? Math.round(totalResolved / totalApplied * 1000) / 1000 : 0,
    personal: stats.personal,
    community: stats.community,
  };
}

// ─── Debug Helpers ───

function _ensureDebugSchema(store) {
  try {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS debug_patterns (
        id TEXT PRIMARY KEY,
        error_signature TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_class TEXT DEFAULT 'UnknownError',
        error_category TEXT DEFAULT 'runtime',
        stack_fingerprint TEXT DEFAULT '',
        fingerprint_hash TEXT NOT NULL,
        fix_code TEXT NOT NULL,
        fix_description TEXT DEFAULT '',
        language TEXT DEFAULT 'javascript',
        tags TEXT DEFAULT '[]',
        coherency_total REAL DEFAULT 0,
        coherency_json TEXT DEFAULT '{}',
        times_applied INTEGER DEFAULT 0,
        times_resolved INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0.2,
        parent_debug TEXT,
        generation_method TEXT DEFAULT 'capture',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_debug_fingerprint ON debug_patterns(fingerprint_hash);
      CREATE INDEX IF NOT EXISTS idx_debug_category ON debug_patterns(error_category);
      CREATE INDEX IF NOT EXISTS idx_debug_confidence ON debug_patterns(confidence);
    `);
  } catch {}
}

function _transferDebugPattern(dp, targetStore) {
  _ensureDebugSchema(targetStore);
  const crypto = require('crypto');
  const id = crypto.createHash('sha256')
    .update(dp.fix_code + dp.fingerprint_hash + dp.language + Date.now())
    .digest('hex').slice(0, 16);
  const now = new Date().toISOString();

  targetStore.db.prepare(`
    INSERT OR IGNORE INTO debug_patterns (
      id, error_signature, error_message, error_class, error_category,
      stack_fingerprint, fingerprint_hash, fix_code, fix_description,
      language, tags, coherency_total, coherency_json,
      times_applied, times_resolved, confidence,
      parent_debug, generation_method, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, dp.error_signature, dp.error_message, dp.error_class, dp.error_category,
    dp.stack_fingerprint || '', dp.fingerprint_hash, dp.fix_code, dp.fix_description || '',
    dp.language, dp.tags || '[]', dp.coherency_total || 0, dp.coherency_json || '{}',
    dp.times_applied || 0, dp.times_resolved || 0, dp.confidence || 0.2,
    dp.parent_debug, dp.generation_method || 'shared', now, now
  );
}

// ─── Cross-Repo Federated Search ───

const REPOS_CONFIG_PATH = path.join(GLOBAL_DIR, 'repos.json');

/**
 * Discover oracle stores in sibling directories and configured repo paths.
 * Searches parent directory for siblings with `.remembrance/` dirs.
 *
 * @param {object} options — { includeSiblings, additionalPaths, maxDepth }
 * @returns {string[]} Array of directory paths with oracle stores
 */
function discoverRepoStores(options = {}) {
  const { includeSiblings = true, additionalPaths = [], maxDepth = 1 } = options;
  const discovered = new Set();

  // Load configured repos
  try {
    if (fs.existsSync(REPOS_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(REPOS_CONFIG_PATH, 'utf-8'));
      (config.repos || []).forEach(r => {
        const rDir = path.resolve(r);
        if (fs.existsSync(path.join(rDir, '.remembrance'))) {
          discovered.add(rDir);
        }
      });
    }
  } catch { /* config read error */ }

  // Add explicit paths
  for (const p of additionalPaths) {
    const resolved = path.resolve(p);
    if (fs.existsSync(path.join(resolved, '.remembrance'))) {
      discovered.add(resolved);
    }
  }

  // Auto-discover siblings
  if (includeSiblings) {
    try {
      const cwd = process.cwd();
      const parent = path.dirname(cwd);
      const entries = fs.readdirSync(parent, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const siblingPath = path.join(parent, entry.name);
        if (siblingPath === cwd) continue; // Skip self
        if (fs.existsSync(path.join(siblingPath, '.remembrance'))) {
          discovered.add(siblingPath);
        }
      }
    } catch { /* permission or read error */ }
  }

  return Array.from(discovered);
}

/**
 * Register a repo path for cross-repo federated search.
 */
function registerRepo(repoPath) {
  ensureDir(GLOBAL_DIR);
  let config = { repos: [] };
  try {
    if (fs.existsSync(REPOS_CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(REPOS_CONFIG_PATH, 'utf-8'));
    }
  } catch { /* fresh config */ }

  const resolved = path.resolve(repoPath);
  if (!config.repos.includes(resolved)) {
    config.repos.push(resolved);
    fs.writeFileSync(REPOS_CONFIG_PATH, JSON.stringify(config, null, 2));
  }
  return { registered: true, path: resolved, totalRepos: config.repos.length };
}

/**
 * List configured repos.
 */
function listRepos() {
  try {
    if (fs.existsSync(REPOS_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(REPOS_CONFIG_PATH, 'utf-8'));
      return (config.repos || []).map(r => {
        const exists = fs.existsSync(path.join(r, '.remembrance'));
        return { path: r, name: path.basename(r), active: exists };
      });
    }
  } catch { /* config error */ }
  return [];
}

/**
 * Search patterns across multiple repo oracle stores.
 * Deduplicates by pattern name (first repo wins).
 *
 * @param {string} description — search query
 * @param {object} options — { language, limit, repos }
 * @returns {{ results, repos, totalSearched }}
 */
function crossRepoSearch(description, options = {}) {
  const { language, limit = 20, repos: explicitRepos } = options;
  const repoPaths = explicitRepos || discoverRepoStores();

  const allResults = [];
  const repoInfo = [];
  const seen = new Set();

  for (const repoPath of repoPaths) {
    try {
      const store = openStore(repoPath);
      if (!store) continue;

      const patterns = store.getPatterns ? store.getPatterns() : [];
      const repoName = path.basename(repoPath);
      let matchCount = 0;

      for (const p of patterns) {
        const key = `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
        if (seen.has(key)) continue;
        // Simple relevance scoring: check if description words match name/tags/description
        const text = `${p.name} ${(p.tags || []).join(' ')} ${p.description || ''}`.toLowerCase();
        const words = description.toLowerCase().split(/\s+/);
        const matches = words.filter(w => text.includes(w));
        if (matches.length === 0) continue;
        if (language && p.language !== language) continue;

        seen.add(key);
        allResults.push({
          ...p,
          _repo: repoName,
          _repoPath: repoPath,
          _matchScore: matches.length / words.length,
        });
        matchCount++;
      }

      repoInfo.push({ name: repoName, path: repoPath, patterns: patterns.length, matches: matchCount });
    } catch { /* store open failed — skip */ }
  }

  // Sort by match score
  allResults.sort((a, b) => b._matchScore - a._matchScore);

  return {
    results: allResults.slice(0, limit),
    repos: repoInfo,
    totalSearched: repoPaths.length,
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
  shareToCommunity,
  pullFromCommunity,
  federatedQuery,
  globalStats,
  personalStats,
  communityStats,
  shareDebugPatterns,
  pullDebugPatterns,
  syncDebugToPersonal,
  federatedDebugSearch,
  debugGlobalStats,
  discoverRepoStores,
  registerRepo,
  listRepos,
  crossRepoSearch,
  GLOBAL_DIR,
  PERSONAL_DIR,
  COMMUNITY_DIR,
};
