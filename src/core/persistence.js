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
const { covenantCheck, safeJsonParse } = require('./covenant');

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

/**
 * Extract safe, portable pattern data from a raw row/pattern object.
 * Strips user-identifiable fields (author, voter, source paths) by default.
 * @param {object} pattern - Raw pattern object from DB
 * @param {object} options
 *   - stripIdentity: remove author/voter references (default: false)
 *   - stripSourcePaths: remove sourceFile/sourceCommit/sourceUrl/sourceRepo (default: false)
 */
function sanitizePatternForTransfer(pattern, options = {}) {
  const { stripIdentity = false, stripSourcePaths = false } = options;

  const patternData = {
    name: pattern.name,
    code: pattern.code,
    language: pattern.language,
    patternType: pattern.pattern_type || pattern.patternType || 'utility',
    complexity: pattern.complexity || 'composite',
    description: pattern.description || '',
    tags: typeof pattern.tags === 'string' ? safeJsonParse(pattern.tags, []) : (pattern.tags || []),
    coherencyScore: typeof pattern.coherency_json === 'string'
      ? safeJsonParse(pattern.coherency_json, {})
      : (pattern.coherencyScore || {}),
    testCode: pattern.test_code || pattern.testCode || null,
    evolutionHistory: typeof pattern.evolution_history === 'string'
      ? safeJsonParse(pattern.evolution_history, [])
      : (pattern.evolutionHistory || []),
  };

  // Strip identity-revealing fields for community/public sharing
  if (stripIdentity) {
    patternData.author = 'anonymous';
    // Scrub auto-register descriptions that embed file paths
    if (patternData.description && /^Auto-registered (from|function from) /.test(patternData.description)) {
      patternData.description = patternData.description.replace(/from .+$/, 'from source');
    }
  }

  // Strip source metadata that could leak repo structure or commit history
  if (stripSourcePaths) {
    // Explicitly do NOT copy these fields — they stay null/undefined
    // sourceFile, sourceUrl, sourceRepo, sourceCommit, sourceLicense
  }

  return patternData;
}

function transferPattern(pattern, targetStore, options = {}) {
  const patternData = sanitizePatternForTransfer(pattern, options);

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
  const { verbose = false, dryRun = false, minCoherency = 0.0 } = options;
  const personalStore = openPersonalStore();
  if (!personalStore) {
    return { synced: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  const localPatterns = localStore.getAllPatterns();
  const personalPatterns = personalStore.getAllPatterns();
  // Build coherency index so we can detect when local has improved over personal
  const personalCoherencyIndex = new Map();
  for (const p of personalPatterns) {
    const key = `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
    personalCoherencyIndex.set(key, p.coherency_total ?? p.coherencyTotal ?? p.coherencyScore?.total ?? 0);
  }

  const report = { synced: 0, upgraded: 0, skipped: 0, duplicates: 0, total: localPatterns.length, candidates: { synced: 0, duplicates: 0 }, debug: { synced: 0, duplicates: 0 }, details: [] };

  for (const pattern of localPatterns) {
    const key = `${(pattern.name || '').toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;
    const coherency = pattern.coherency_total ?? pattern.coherencyTotal ?? pattern.coherencyScore?.total ?? 0;

    if (personalCoherencyIndex.has(key)) {
      const personalCoherency = personalCoherencyIndex.get(key);
      if (coherency > personalCoherency) {
        // Local version improved — update personal store with higher-coherency version
        if (!dryRun) {
          try {
            transferPattern(pattern, personalStore);
          } catch (err) {
            if (verbose) console.log(`  [SKIP-UPGRADE] ${pattern.name}: ${err.message}`);
            report.skipped++;
            continue;
          }
        }
        report.upgraded++;
        if (verbose) {
          console.log(`  [UPGRADE→] ${pattern.name} (${pattern.language}) coherency: ${personalCoherency.toFixed ? personalCoherency.toFixed(3) : personalCoherency} → ${coherency.toFixed ? coherency.toFixed(3) : coherency}`);
        }
        report.details.push({ name: pattern.name, language: pattern.language, direction: 'to-personal', action: 'upgrade' });
      } else {
        report.duplicates++;
      }
      continue;
    }

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
    personalCoherencyIndex.set(key, coherency);

    report.synced++;
    if (verbose) {
      console.log(`  [SYNC→] ${pattern.name} (${pattern.language}) coherency: ${coherency.toFixed ? coherency.toFixed(3) : coherency}`);
    }
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'to-personal' });
  }

  // Sync candidates to personal store (prevents loss on .remembrance/ deletion)
  try {
    report.candidates = _syncCandidatesToPersonal(localStore, personalStore, { verbose, dryRun });
  } catch (err) {
    if (verbose) console.log(`  [WARN] candidate sync failed: ${err.message}`);
  }

  // Sync debug patterns to personal store
  try {
    report.debug = _syncDebugToPersonal(localStore, personalStore, { verbose, dryRun });
  } catch (err) {
    if (verbose) console.log(`  [WARN] debug sync failed: ${err.message}`);
  }

  // Sync pattern archives to personal store (safety net for deleted patterns)
  try {
    report.archives = _syncArchivesToPersonal(localStore, personalStore, { verbose, dryRun });
  } catch (err) {
    if (verbose) console.log(`  [WARN] archive sync failed: ${err.message}`);
  }

  return report;
}

/**
 * Pull patterns from personal store into local store.
 */
function syncFromGlobal(localStore, options = {}) {
  const { verbose = false, dryRun = false, language, minCoherency = 0.0, maxPull = 999999 } = options;
  const personalStore = openPersonalStore();
  if (!personalStore) {
    return { pulled: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  const personalPatterns = personalStore.getAllPatterns();
  const localPatterns = localStore.getAllPatterns();
  // Build coherency index so we can detect when personal has improved over local
  const localCoherencyIndex = new Map();
  for (const p of localPatterns) {
    const key = `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
    localCoherencyIndex.set(key, p.coherency_total ?? p.coherencyTotal ?? p.coherencyScore?.total ?? 0);
  }

  const report = { pulled: 0, upgraded: 0, skipped: 0, duplicates: 0, total: personalPatterns.length, candidates: { pulled: 0, duplicates: 0 }, debug: { pulled: 0, duplicates: 0 }, details: [] };

  for (const pattern of personalPatterns) {
    if ((report.pulled + report.upgraded) >= maxPull) break;

    if (!pattern.name) { report.skipped++; continue; }
    const key = `${(pattern.name || '').toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;
    const coherency = pattern.coherency_total ?? pattern.coherencyScore?.total ?? 0;

    if (localCoherencyIndex.has(key)) {
      const localCoherency = localCoherencyIndex.get(key);
      if (coherency > localCoherency) {
        // Personal version is better — update local store
        if (!dryRun) {
          try {
            transferPattern(pattern, localStore);
          } catch (err) {
            if (verbose) console.log(`  [SKIP-UPGRADE] ${pattern.name}: ${err.message}`);
            report.skipped++;
            continue;
          }
        }
        report.upgraded++;
        if (verbose) {
          console.log(`  [←UPGRADE] ${pattern.name} (${pattern.language}) coherency: ${localCoherency.toFixed ? localCoherency.toFixed(3) : localCoherency} → ${coherency.toFixed ? coherency.toFixed(3) : coherency}`);
        }
        report.details.push({ name: pattern.name, language: pattern.language, direction: 'from-personal', action: 'upgrade' });
      } else {
        report.duplicates++;
      }
      continue;
    }

    if (language && pattern.language !== language) {
      report.skipped++;
      continue;
    }

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
    localCoherencyIndex.set(key, coherency);

    report.pulled++;
    if (verbose) {
      console.log(`  [←PULL] ${pattern.name} (${pattern.language}) coherency: ${coherency.toFixed ? coherency.toFixed(3) : coherency}`);
    }
    report.details.push({ name: pattern.name, language: pattern.language, direction: 'from-personal' });
  }

  // Pull candidates from personal store
  try {
    report.candidates = _syncCandidatesFromPersonal(localStore, personalStore, { verbose, dryRun });
  } catch (err) {
    if (verbose) console.log(`  [WARN] candidate pull failed: ${err.message}`);
  }

  // Pull debug patterns from personal store
  try {
    report.debug = _syncDebugFromPersonal(localStore, personalStore, { verbose, dryRun });
  } catch (err) {
    if (verbose) console.log(`  [WARN] debug pull failed: ${err.message}`);
  }

  // Pull archives from personal store
  try {
    report.archives = _syncArchivesFromPersonal(localStore, personalStore, { verbose, dryRun });
  } catch (err) {
    if (verbose) console.log(`  [WARN] archive pull failed: ${err.message}`);
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
  const communityIndex = new Set(communityPatterns.map(p => `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`));

  // Filter by name if specified
  if (nameFilter && nameFilter.length > 0) {
    const nameSet = new Set(nameFilter.map(n => n.toLowerCase()));
    localPatterns = localPatterns.filter(p =>
      nameSet.has((p.name || '').toLowerCase()) || nameSet.has(p.id)
    );
  }

  // Filter by tags if specified
  if (tagFilter && tagFilter.length > 0) {
    const tagSet = new Set(tagFilter.map(t => t.toLowerCase()));
    localPatterns = localPatterns.filter(p => {
      let pTags;
      try {
        pTags = (typeof p.tags === 'string' ? JSON.parse(p.tags) : (p.tags || []));
      } catch {
        pTags = [];
      }
      return pTags.some(t => tagSet.has(t.toLowerCase()));
    });
  }

  // Deduplicate community store before sharing
  if (typeof communityStore.deduplicatePatterns === 'function') {
    communityStore.deduplicatePatterns();
  }

  const report = { shared: 0, skipped: 0, duplicates: 0, total: localPatterns.length, details: [] };

  for (const pattern of localPatterns) {
    const key = `${(pattern.name || '').toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;

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
        // Strip identity and source paths when sharing to community store
        // This prevents leaking author names, file paths, and repo structure
        transferPattern(pattern, communityStore, {
          stripIdentity: true,
          stripSourcePaths: true,
        });
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
  const { verbose = false, dryRun = false, language, minCoherency = 0.0, maxPull = 999999, nameFilter } = options;
  const communityStore = openCommunityStore();
  if (!communityStore) {
    return { pulled: 0, skipped: 0, total: 0, error: 'No SQLite available' };
  }

  let communityPatterns = communityStore.getAllPatterns();
  const localPatterns = localStore.getAllPatterns();
  const localIndex = new Set(localPatterns.map(p => `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`));

  if (nameFilter && nameFilter.length > 0) {
    const nameSet = new Set(nameFilter.map(n => n.toLowerCase()));
    communityPatterns = communityPatterns.filter(p =>
      nameSet.has((p.name || '').toLowerCase()) || nameSet.has(p.id)
    );
  }

  // Deduplicate community store
  if (typeof communityStore.deduplicatePatterns === 'function') {
    communityStore.deduplicatePatterns();
  }

  const report = { pulled: 0, skipped: 0, duplicates: 0, total: communityPatterns.length, details: [] };

  for (const pattern of communityPatterns) {
    if (report.pulled >= maxPull) break;

    const key = `${(pattern.name || '').toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;
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

    // Re-validate community patterns against the Covenant before accepting
    if (pattern.code) {
      try {
        const check = covenantCheck(pattern.code, { description: pattern.name, trusted: false });
        if (!check.sealed) {
          if (verbose) {
            const reasons = (check.violations || []).map(v => v.reason).join('; ');
            console.log(`  [REJECT] ${pattern.name}: Covenant violation — ${reasons}`);
          }
          report.skipped++;
          continue;
        }
      } catch (err) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:pullFromCommunity] covenant check failed:', err?.message || err);
        report.skipped++;
        continue;
      }
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
    const key = `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'local' });
    }
  }

  // Personal second
  for (const p of personalPatterns) {
    const key = `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...p, source: 'personal' });
    }
  }

  // Community last
  for (const p of communityPatterns) {
    const key = `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:shareDebugPatterns] silent failure:', e?.message || e);
    return { shared: 0, skipped: 0, total: 0, error: 'No debug_patterns table in local store' };
  }

  // Index existing community debug patterns by fingerprint+language
  let communityDebug;
  try {
    communityDebug = communityStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:shareDebugPatterns] falling back to empty array:', e?.message || e);
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
    if (process.env.ORACLE_DEBUG) {
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
  const { verbose = false, dryRun = false, minConfidence = 0.3, category, language, limit = 999999 } = options;
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:pullDebugPatterns] silent failure:', e?.message || e);
    return { pulled: 0, skipped: 0, total: 0, error: 'No debug_patterns in community store' };
  }

  let localDebug;
  try {
    localDebug = localStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:pullDebugPatterns] falling back to empty array:', e?.message || e);
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:syncDebugToPersonal] silent failure:', e?.message || e);
    return { synced: 0, skipped: 0, total: 0, error: 'No debug_patterns table' };
  }

  let personalDebug;
  try {
    personalDebug = personalStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:syncDebugToPersonal] falling back to empty array:', e?.message || e);
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
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:syncDebugToPersonal] skipping item:', e?.message || e);
        report.skipped++;
        continue;
      }
    }

    // Track to prevent duplicates in same batch
    personalIndex.add(key);

    report.synced++;
    if (process.env.ORACLE_DEBUG) {
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
      const { DebugOracle } = require('../debug/debug-oracle');
      const debugOracle = new DebugOracle(store);
      const matches = debugOracle.search({ errorMessage, stackTrace, language, limit });
      for (const match of matches) {
        const key = `${match.fingerprintHash}:${match.language}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ...match, source });
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[persistence:federatedDebugSearch] silent failure:', e?.message || e);
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
      const { DebugOracle } = require('../debug/debug-oracle');
      stats.personal = new DebugOracle(personalStore).stats();
    }
  } catch (err) { if (process.env.ORACLE_DEBUG) console.error('[persistence]', err.message); }

  try {
    const communityStore = openCommunityStore();
    if (communityStore) {
      const { DebugOracle } = require('../debug/debug-oracle');
      stats.community = new DebugOracle(communityStore).stats();
    }
  } catch (err) { if (process.env.ORACLE_DEBUG) console.error('[persistence]', err.message); }

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

// ─── Candidate Sync Helpers ───

/**
 * Sync candidates from local to personal store (push direction).
 * Prevents candidate loss when .remembrance/ is deleted.
 */
function _syncCandidatesToPersonal(localStore, personalStore, options = {}) {
  const { verbose = false, dryRun = false } = options;
  const report = { synced: 0, duplicates: 0 };

  // Ensure candidates table exists on personal store
  _ensureCandidatesSchema(personalStore);

  let localCandidates;
  try {
    // Sync ALL candidates (including promoted) to prevent data loss if .remembrance/ is deleted
    localCandidates = localStore.db.prepare(
      'SELECT * FROM candidates ORDER BY coherency_total DESC'
    ).all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncCandidatesToPersonal] returning partial report on error:', e?.message || e);
    return report;
  }

  if (localCandidates.length === 0) return report;

  let personalCandidates;
  try {
    personalCandidates = personalStore.db.prepare(
      'SELECT id, name, language, promoted_at FROM candidates'
    ).all();
  } catch (e) {
    // Log error visibly — falling back to empty array risks skipping existing data
    console.warn('[persistence:_syncCandidatesToPersonal] WARNING: personal DB read failed, falling back to empty array:', e?.message || e);
    personalCandidates = [];
  }

  // Use ID-based dedup (name:language has many duplicate candidates by design)
  const personalIdIndex = new Set(personalCandidates.map(c => c.id));
  // Also track promoted_at so we can update personal when local promotes a candidate
  const personalPromotedIndex = new Map(personalCandidates.map(
    c => [c.id, c.promoted_at]
  ));

  for (const candidate of localCandidates) {
    if (personalIdIndex.has(candidate.id)) {
      // If local has promoted_at but personal doesn't, update personal
      if (candidate.promoted_at && !personalPromotedIndex.get(candidate.id)) {
        if (!dryRun) {
          try {
            personalStore.db.prepare(
              'UPDATE candidates SET promoted_at = ? WHERE id = ?'
            ).run(candidate.promoted_at, candidate.id);
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncCandidatesToPersonal] promotion update failed:', e?.message || e);
          }
        }
        report.synced++;
      } else {
        report.duplicates++;
      }
      continue;
    }

    if (!dryRun) {
      try {
        _transferCandidate(candidate, personalStore);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncCandidatesToPersonal] skipping item:', e?.message || e);
        continue;
      }
    }

    personalIdIndex.add(candidate.id);
    report.synced++;
    if (verbose) console.log(`  [SYNC→ candidate] ${candidate.name} (${candidate.language})`);
  }

  return report;
}

/**
 * Sync candidates from personal to local store (pull direction).
 */
function _syncCandidatesFromPersonal(localStore, personalStore, options = {}) {
  const { verbose = false, dryRun = false } = options;
  const report = { pulled: 0, duplicates: 0 };

  let personalCandidates;
  try {
    // Pull ALL candidates (including promoted) — mirrors push behavior
    personalCandidates = personalStore.db.prepare(
      'SELECT * FROM candidates ORDER BY coherency_total DESC'
    ).all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncCandidatesFromPersonal] returning partial report on error:', e?.message || e);
    return report;
  }

  if (personalCandidates.length === 0) return report;

  // Ensure candidates table exists on local store (it should, but be safe)
  _ensureCandidatesSchema(localStore);

  let localCandidates;
  try {
    localCandidates = localStore.db.prepare('SELECT id, promoted_at FROM candidates').all();
  } catch (e) {
    console.warn('[persistence:_syncCandidatesFromPersonal] WARNING: local DB read failed, falling back to empty array:', e?.message || e);
    localCandidates = [];
  }

  // Use ID-based dedup to match push behavior
  const localIdIndex = new Set(localCandidates.map(c => c.id));
  const localPromotedIndex = new Map(localCandidates.map(c => [c.id, c.promoted_at]));

  for (const candidate of personalCandidates) {
    if (localIdIndex.has(candidate.id)) {
      // If personal has promoted_at but local doesn't, update local
      if (candidate.promoted_at && !localPromotedIndex.get(candidate.id)) {
        if (!dryRun) {
          try {
            localStore.db.prepare(
              'UPDATE candidates SET promoted_at = ? WHERE id = ?'
            ).run(candidate.promoted_at, candidate.id);
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncCandidatesFromPersonal] promotion update failed:', e?.message || e);
          }
        }
        report.pulled++;
      } else {
        report.duplicates++;
      }
      continue;
    }

    if (!dryRun) {
      try {
        _transferCandidate(candidate, localStore);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncCandidatesFromPersonal] skipping item:', e?.message || e);
        continue;
      }
    }

    localIdIndex.add(candidate.id);
    report.pulled++;
    if (verbose) console.log(`  [←PULL candidate] ${candidate.name} (${candidate.language})`);
  }

  return report;
}

function _ensureCandidatesSchema(store) {
  try {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        language TEXT DEFAULT 'unknown',
        pattern_type TEXT DEFAULT 'utility',
        complexity TEXT DEFAULT 'composite',
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        coherency_total REAL DEFAULT 0,
        coherency_json TEXT DEFAULT '{}',
        test_code TEXT,
        parent_pattern TEXT,
        generation_method TEXT DEFAULT 'variant',
        promoted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_candidates_language ON candidates(language);
      CREATE INDEX IF NOT EXISTS idx_candidates_coherency ON candidates(coherency_total);
    `);
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_ensureCandidatesSchema] table already exists:', e?.message || e);
  }
}

function _transferCandidate(candidate, targetStore) {
  // Sanitize description to strip file paths that could leak local directory structure
  let description = candidate.description || '';
  if (/^Auto-registered (from|function from) /.test(description)) {
    description = description.replace(/from .+$/, 'from source');
  }
  targetStore.db.prepare(`
    INSERT OR IGNORE INTO candidates (id, name, code, language, pattern_type, complexity,
      description, tags, coherency_total, coherency_json, test_code,
      parent_pattern, generation_method, promoted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    candidate.id, candidate.name, candidate.code, candidate.language || 'unknown',
    candidate.pattern_type || 'utility', candidate.complexity || 'composite',
    description, candidate.tags || '[]',
    candidate.coherency_total ?? 0, candidate.coherency_json || '{}',
    candidate.test_code || null,
    candidate.parent_pattern || null, candidate.generation_method || 'variant',
    candidate.promoted_at || null, candidate.created_at, candidate.updated_at
  );
}

/**
 * Inline debug sync for syncToGlobal (avoids calling the heavier syncDebugToPersonal).
 */
function _syncDebugToPersonal(localStore, personalStore, options = {}) {
  const { verbose = false, dryRun = false } = options;
  const report = { synced: 0, duplicates: 0 };

  _ensureDebugSchema(personalStore);

  let localDebug;
  try {
    localDebug = localStore.db.prepare('SELECT * FROM debug_patterns ORDER BY confidence DESC').all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncDebugToPersonal] returning partial report on error:', e?.message || e);
    return report;
  }

  if (localDebug.length === 0) return report;

  let personalDebug;
  try {
    personalDebug = personalStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch (e) {
    console.warn('[persistence:_syncDebugToPersonal] WARNING: personal debug DB read failed, falling back to empty array:', e?.message || e);
    personalDebug = [];
  }

  const personalIndex = new Set(personalDebug.map(d => `${d.fingerprint_hash}:${d.language}`));

  for (const dp of localDebug) {
    const key = `${dp.fingerprint_hash}:${dp.language}`;
    if (personalIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (!dryRun) {
      try {
        _transferDebugPattern(dp, personalStore);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncDebugToPersonal] skipping item:', e?.message || e);
        continue;
      }
    }

    personalIndex.add(key);
    report.synced++;
    if (verbose) console.log(`  [SYNC→ debug] ${dp.error_class}:${dp.error_category} (${dp.language})`);
  }

  return report;
}

/**
 * Inline debug pull for syncFromGlobal.
 */
function _syncDebugFromPersonal(localStore, personalStore, options = {}) {
  const { verbose = false, dryRun = false } = options;
  const report = { pulled: 0, duplicates: 0 };

  _ensureDebugSchema(localStore);

  let personalDebug;
  try {
    personalDebug = personalStore.db.prepare('SELECT * FROM debug_patterns ORDER BY confidence DESC').all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncDebugFromPersonal] returning partial report on error:', e?.message || e);
    return report;
  }

  if (personalDebug.length === 0) return report;

  let localDebug;
  try {
    localDebug = localStore.db.prepare('SELECT fingerprint_hash, language FROM debug_patterns').all();
  } catch (e) {
    console.warn('[persistence:_syncDebugFromPersonal] WARNING: local debug DB read failed, falling back to empty array:', e?.message || e);
    localDebug = [];
  }

  const localIndex = new Set(localDebug.map(d => `${d.fingerprint_hash}:${d.language}`));

  for (const dp of personalDebug) {
    const key = `${dp.fingerprint_hash}:${dp.language}`;
    if (localIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (!dryRun) {
      try {
        _transferDebugPattern(dp, localStore);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncDebugFromPersonal] skipping item:', e?.message || e);
        continue;
      }
    }

    localIndex.add(key);
    report.pulled++;
    if (verbose) console.log(`  [←PULL debug] ${dp.error_class}:${dp.error_category} (${dp.language})`);
  }

  return report;
}

// ─── Archive Sync Helpers ───

function _ensureArchiveSchema(store) {
  try {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_archive (
        id TEXT NOT NULL,
        name TEXT,
        code TEXT,
        language TEXT,
        pattern_type TEXT,
        coherency_total REAL,
        coherency_json TEXT,
        test_code TEXT,
        tags TEXT,
        deleted_reason TEXT,
        deleted_at TEXT,
        original_created_at TEXT,
        full_row_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_archive_name ON pattern_archive(name);
      CREATE INDEX IF NOT EXISTS idx_archive_deleted_at ON pattern_archive(deleted_at);
    `);
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_ensureArchiveSchema] table may already exist:', e?.message || e);
  }
}

/**
 * Sync pattern archives from local to personal store.
 * Archives are the safety net for deleted patterns — losing them means losing recovery ability.
 */
function _syncArchivesToPersonal(localStore, personalStore, options = {}) {
  const { verbose = false, dryRun = false } = options;
  const report = { synced: 0, duplicates: 0 };

  _ensureArchiveSchema(personalStore);

  let localArchives;
  try {
    localArchives = localStore.db.prepare('SELECT * FROM pattern_archive ORDER BY deleted_at DESC').all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncArchivesToPersonal] no archive table:', e?.message || e);
    return report;
  }

  if (localArchives.length === 0) return report;

  let personalArchives;
  try {
    personalArchives = personalStore.db.prepare('SELECT id, deleted_at FROM pattern_archive').all();
  } catch (e) {
    personalArchives = [];
  }

  // Dedup by id + deleted_at (same pattern can be archived multiple times)
  const personalIndex = new Set(personalArchives.map(a => `${a.id}:${a.deleted_at}`));

  for (const archive of localArchives) {
    const key = `${archive.id}:${archive.deleted_at}`;
    if (personalIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (!dryRun) {
      try {
        personalStore.db.prepare(`
          INSERT OR IGNORE INTO pattern_archive (id, name, code, language, pattern_type,
            coherency_total, coherency_json, test_code, tags,
            deleted_reason, deleted_at, original_created_at, full_row_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          archive.id, archive.name, archive.code, archive.language,
          archive.pattern_type, archive.coherency_total ?? 0,
          archive.coherency_json || '{}', archive.test_code || null,
          archive.tags || '[]', archive.deleted_reason || 'unknown',
          archive.deleted_at, archive.original_created_at,
          archive.full_row_json || null
        );
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncArchivesToPersonal] skipping:', e?.message || e);
        continue;
      }
    }

    personalIndex.add(key);
    report.synced++;
    if (verbose) console.log(`  [SYNC→ archive] ${archive.name} (deleted: ${archive.deleted_at})`);
  }

  return report;
}

/**
 * Pull pattern archives from personal to local store.
 */
function _syncArchivesFromPersonal(localStore, personalStore, options = {}) {
  const { verbose = false, dryRun = false } = options;
  const report = { pulled: 0, duplicates: 0 };

  _ensureArchiveSchema(localStore);

  let personalArchives;
  try {
    personalArchives = personalStore.db.prepare('SELECT * FROM pattern_archive ORDER BY deleted_at DESC').all();
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncArchivesFromPersonal] no archive table:', e?.message || e);
    return report;
  }

  if (personalArchives.length === 0) return report;

  let localArchives;
  try {
    localArchives = localStore.db.prepare('SELECT id, deleted_at FROM pattern_archive').all();
  } catch (e) {
    localArchives = [];
  }

  const localIndex = new Set(localArchives.map(a => `${a.id}:${a.deleted_at}`));

  for (const archive of personalArchives) {
    const key = `${archive.id}:${archive.deleted_at}`;
    if (localIndex.has(key)) {
      report.duplicates++;
      continue;
    }

    if (!dryRun) {
      try {
        localStore.db.prepare(`
          INSERT OR IGNORE INTO pattern_archive (id, name, code, language, pattern_type,
            coherency_total, coherency_json, test_code, tags,
            deleted_reason, deleted_at, original_created_at, full_row_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          archive.id, archive.name, archive.code, archive.language,
          archive.pattern_type, archive.coherency_total ?? 0,
          archive.coherency_json || '{}', archive.test_code || null,
          archive.tags || '[]', archive.deleted_reason || 'unknown',
          archive.deleted_at, archive.original_created_at,
          archive.full_row_json || null
        );
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[persistence:_syncArchivesFromPersonal] skipping:', e?.message || e);
        continue;
      }
    }

    localIndex.add(key);
    report.pulled++;
    if (verbose) console.log(`  [←PULL archive] ${archive.name} (deleted: ${archive.deleted_at})`);
  }

  return report;
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
  } catch (err) { if (process.env.ORACLE_DEBUG) console.error('[persistence]', err.message); }
}

function _transferDebugPattern(dp, targetStore) {
  _ensureDebugSchema(targetStore);
  const crypto = require('crypto');
  const id = crypto.createHash('sha256')
    .update(dp.fix_code + dp.fingerprint_hash + dp.language + Date.now())
    .digest('hex').slice(0, 16);
  const now = new Date().toISOString();

  // Sanitize stack fingerprints and error signatures to strip absolute file paths
  // that could leak local filesystem structure when shared across tiers
  const pathPattern = /(?:\/[\w.-]+){2,}(?:\.(?:js|ts|py|go|rs|java|rb|c|cpp|h))?/g;
  const sanitizedStackFp = (dp.stack_fingerprint || '').replace(pathPattern, '<path>');
  const sanitizedErrSig = (dp.error_signature || '').replace(pathPattern, '<path>');
  const sanitizedErrMsg = (dp.error_message || '').replace(pathPattern, '<path>');

  targetStore.db.prepare(`
    INSERT OR IGNORE INTO debug_patterns (
      id, error_signature, error_message, error_class, error_category,
      stack_fingerprint, fingerprint_hash, fix_code, fix_description,
      language, tags, coherency_total, coherency_json,
      times_applied, times_resolved, confidence,
      parent_debug, generation_method, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, sanitizedErrSig, sanitizedErrMsg, dp.error_class, dp.error_category,
    sanitizedStackFp, dp.fingerprint_hash, dp.fix_code, dp.fix_description || '',
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:discoverRepoStores] config read error:', e?.message || e);
  }

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
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[persistence:discoverRepoStores] permission or read error:', e?.message || e);
    }
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:registerRepo] fresh config:', e?.message || e);
  }

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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:listRepos] config error:', e?.message || e);
  }
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

      const patterns = store.getAllPatterns ? store.getAllPatterns() : [];
      const repoName = path.basename(repoPath);
      let matchCount = 0;

      for (const p of patterns) {
        const key = `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
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
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[persistence:crossRepoSearch] store open failed — skip:', e?.message || e);
    }
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
  sanitizePatternForTransfer,
  GLOBAL_DIR,
  PERSONAL_DIR,
  COMMUNITY_DIR,
};
