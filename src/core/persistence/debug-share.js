const { quiet } = require('../quiet');
// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.
const { openCommunityStore, openPersonalStore } = require('./stores');
const { _ensureDebugSchema, _transferDebugPattern } = require('./sync-debug-archive');

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
      const { DebugOracle } = require('../../debug/debug-oracle');
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
      try {
        const { DebugOracle } = require('../../debug/debug-oracle');
        stats.personal = new DebugOracle(personalStore).stats();
      } finally {
        if (typeof personalStore.close === 'function') try { personalStore.close(); } catch (_) { quiet('core:persistence:debug-share:require', _);}
      }
    }
  } catch (err) { if (process.env.ORACLE_DEBUG) console.error('[persistence]', err.message); }

  try {
    const communityStore = openCommunityStore();
    if (communityStore) {
      try {
        const { DebugOracle } = require('../../debug/debug-oracle');
        stats.community = new DebugOracle(communityStore).stats();
      } finally {
        if (typeof communityStore.close === 'function') try { communityStore.close(); } catch (_) { quiet('core:persistence:debug-share:require', _);}
      }
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

shareDebugPatterns.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
pullDebugPatterns.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
syncDebugToPersonal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
federatedDebugSearch.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
debugGlobalStats.atomicProperties = {
  charge: 0, valence: 2, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'low', electronegativity: 1, group: 10, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};

module.exports = { debugGlobalStats, federatedDebugSearch, pullDebugPatterns, shareDebugPatterns, syncDebugToPersonal };
