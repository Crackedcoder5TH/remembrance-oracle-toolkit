// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.
const { dedupKey, getCoherency, openPersonalStore } = require('./stores');
const { _syncCandidatesFromPersonal, _syncCandidatesToPersonal } = require('./sync-candidates');
const { _syncArchivesFromPersonal, _syncArchivesToPersonal, _syncDebugFromPersonal, _syncDebugToPersonal } = require('./sync-debug-archive');
const { transferPattern } = require('./transfer');

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

  try {
  const localPatterns = localStore.getAllPatterns();
  const personalPatterns = personalStore.getAllPatterns();
  // Build coherency index so we can detect when local has improved over personal
  const personalCoherencyIndex = new Map();
  for (const p of personalPatterns) {
    personalCoherencyIndex.set(dedupKey(p), getCoherency(p));
  }

  const report = { synced: 0, upgraded: 0, skipped: 0, duplicates: 0, total: localPatterns.length, candidates: { synced: 0, duplicates: 0 }, debug: { synced: 0, duplicates: 0 }, details: [] };

  for (const pattern of localPatterns) {
    const key = dedupKey(pattern);
    const coherency = getCoherency(pattern);

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
  } finally {
    if (personalStore && typeof personalStore.close === 'function') {
      try { personalStore.close(); } catch (_) {}
    }
  }
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

  try {
  const personalPatterns = personalStore.getAllPatterns();
  const localPatterns = localStore.getAllPatterns();
  // Build coherency index so we can detect when personal has improved over local
  const localCoherencyIndex = new Map();
  for (const p of localPatterns) {
    localCoherencyIndex.set(dedupKey(p), getCoherency(p));
  }

  const report = { pulled: 0, upgraded: 0, skipped: 0, duplicates: 0, total: personalPatterns.length, candidates: { pulled: 0, duplicates: 0 }, debug: { pulled: 0, duplicates: 0 }, details: [] };

  for (const pattern of personalPatterns) {
    if ((report.pulled + report.upgraded) >= maxPull) break;

    if (!pattern.name) { report.skipped++; continue; }
    const key = dedupKey(pattern);
    const coherency = getCoherency(pattern);

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
  } finally {
    if (personalStore && typeof personalStore.close === 'function') {
      try { personalStore.close(); } catch (_) {}
    }
  }
}

/**
 * Bidirectional sync with personal store.
 */
function syncBidirectional(localStore, options = {}) {
  const push = syncToGlobal(localStore, options);
  const pull = syncFromGlobal(localStore, options);
  return { push, pull };
}


syncToGlobal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
syncFromGlobal.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
syncBidirectional.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};

module.exports = { syncBidirectional, syncFromGlobal, syncToGlobal };
