// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.

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




module.exports = { _ensureArchiveSchema, _ensureDebugSchema, _syncArchivesFromPersonal, _syncArchivesToPersonal, _syncDebugFromPersonal, _syncDebugToPersonal, _transferDebugPattern };
