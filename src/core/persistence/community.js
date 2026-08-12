const { quiet } = require('../quiet');
// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.
const { covenantCheck } = require('../covenant');
const { getCoherency, openCommunityStore, openPersonalStore } = require('./stores');
const { transferPattern } = require('./transfer');

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

    const coherency = Number(getCoherency(pattern)) || 0;
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

    // Pattern passes the gate — check for duplicates after gate validation
    if (communityIndex.has(key)) {
      report.duplicates++;
      report.shared++;
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

  if (typeof communityStore.close === 'function') {
    try { communityStore.close(); } catch (_) { quiet('core:persistence:community:transferPattern', _);}
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

    const coherency = Number(pattern.coherency_total ?? pattern.coherencyScore?.total ?? 0) || 0;
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

  if (typeof communityStore.close === 'function') {
    try { communityStore.close(); } catch (_) { quiet('core:persistence:community:transferPattern', _);}
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

  try {
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
    results = results.filter(p => getCoherency(p) >= query.minCoherency);
  }
  if (query.source) {
    results = results.filter(p => p.source === query.source);
  }

  results.sort((a, b) => {
    const ca = getCoherency(a);
    const cb = getCoherency(b);
    return cb - ca;
  });

  const result = {
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

  return result;
  } finally {
    if (personalStore && typeof personalStore.close === 'function') {
      try { personalStore.close(); } catch (_) { quiet('core:persistence:community:getCoherency', _);}
    }
    if (communityStore && typeof communityStore.close === 'function') {
      try { communityStore.close(); } catch (_) { quiet('core:persistence:community:getCoherency', _);}
    }
  }
}

// ─── Stats ───

/**
 * Get stats for personal store.
 */

shareToCommunity.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
pullFromCommunity.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
federatedQuery.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};

module.exports = { federatedQuery, pullFromCommunity, shareToCommunity };
