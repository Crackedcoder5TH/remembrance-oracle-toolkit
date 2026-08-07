// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.

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



module.exports = { _ensureCandidatesSchema, _syncCandidatesFromPersonal, _syncCandidatesToPersonal, _transferCandidate };
