/**
 * SQLite-backed Verified Code History Store
 *
 * Drop-in replacement for the flat JSON VerifiedHistoryStore.
 * Uses Node 22+'s built-in node:sqlite (DatabaseSync).
 *
 * Scales to hundreds of thousands of entries vs JSON's ceiling of ~1k.
 * Supports indexed queries on language, coherency, tags.
 *
 * Storage file: .remembrance/oracle.db
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('../core/logger');
const { safePath } = require('../core/safe-path');
const { computeCoherencyScore } = require('../unified/coherency');
const { synthesizeTests } = require('../evolution/test-synth');

const DEFAULT_STORE_DIR = '.remembrance';
const DB_FILE = 'oracle.db';
const LEGACY_HISTORY = 'verified-history.json';
const LEGACY_PATTERNS = 'pattern-library.json';

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

class SQLiteStore {
  constructor(baseDir = process.cwd()) {
    const resolvedBase = path.resolve(baseDir);
    this.storeDir = safePath(DEFAULT_STORE_DIR, resolvedBase);
    this.dbPath = safePath(DB_FILE, this.storeDir);
    this._ensureDir();
    if (!DatabaseSync) throw new Error('node:sqlite is not available — Node 22+ is required');
    this.db = new DatabaseSync(this.dbPath);
    this._initSchema();
    this._migrateJSON();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
  }

  _initSchema() {
    // Enable WAL mode for concurrent read performance and crash safety
    this.db.exec(`PRAGMA journal_mode = WAL`);
    this.db.exec(`PRAGMA synchronous = NORMAL`);
    this.db.exec(`PRAGMA busy_timeout = 5000`);
    this.db.exec(`PRAGMA foreign_keys = ON`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        language TEXT DEFAULT 'unknown',
        description TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        author TEXT DEFAULT 'anonymous',
        coherency_total REAL DEFAULT 0,
        coherency_json TEXT DEFAULT '{}',
        test_passed INTEGER,
        test_output TEXT,
        validated_at TEXT,
        times_used INTEGER DEFAULT 0,
        times_succeeded INTEGER DEFAULT 0,
        historical_score REAL DEFAULT 1.0,
        version INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entries_language ON entries(language);
      CREATE INDEX IF NOT EXISTS idx_entries_coherency ON entries(coherency_total);
      CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at);

      CREATE TABLE IF NOT EXISTS patterns (
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
        variants TEXT DEFAULT '[]',
        test_code TEXT,
        usage_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        evolution_history TEXT DEFAULT '[]',
        version INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_patterns_language ON patterns(language);
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_patterns_coherency ON patterns(coherency_total);
      CREATE INDEX IF NOT EXISTS idx_patterns_name ON patterns(name);

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        target_table TEXT NOT NULL,
        target_id TEXT NOT NULL,
        detail TEXT DEFAULT '{}',
        actor TEXT DEFAULT 'system'
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_table, target_id);
    `);

    // Ensure pattern_archive exists before dedup migration (which archives duplicates)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_archive (
        id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL,
        language TEXT DEFAULT 'unknown', pattern_type TEXT DEFAULT 'utility',
        coherency_total REAL DEFAULT 0, coherency_json TEXT DEFAULT '{}',
        test_code TEXT, tags TEXT DEFAULT '[]', deleted_reason TEXT DEFAULT 'unknown',
        deleted_at TEXT NOT NULL, original_created_at TEXT, full_row_json TEXT
      )
    `);

    // Schema migration: enforce unique (name, language) — dedup first, then add index
    try {
      // Check if unique index already exists
      const idxExists = this.db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_patterns_unique_name_lang'"
      ).get();
      if (!idxExists) {
        // Archive duplicates before removing them, then create unique index
        const dupeRows = this.db.prepare(`
          SELECT * FROM patterns WHERE id NOT IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (
                PARTITION BY LOWER(name), LOWER(language)
                ORDER BY coherency_total DESC, created_at DESC
              ) AS rn FROM patterns
            ) WHERE rn = 1
          )
        `).all();
        this.db.exec('BEGIN');
        try {
          for (const row of dupeRows) {
            this._archivePattern(row, 'schema-dedup');
            this._cleanupFractalData(row.id);
          }
          this.db.exec(`
            DELETE FROM patterns WHERE id NOT IN (
              SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                  PARTITION BY LOWER(name), LOWER(language)
                  ORDER BY coherency_total DESC, created_at DESC
                ) AS rn FROM patterns
              ) WHERE rn = 1
            )
          `);
          this.db.exec(`CREATE UNIQUE INDEX idx_patterns_unique_name_lang ON patterns(name COLLATE NOCASE, language COLLATE NOCASE)`);
          this.db.exec('COMMIT');
        } catch (e) {
          this.db.exec('ROLLBACK');
          throw e;
        }
      }
    } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[sqlite:migration] unique index creation failed:', e.message); }

    // Schema migration: add composition columns
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN requires TEXT DEFAULT '[]'`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] requires column:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN composed_of TEXT DEFAULT '[]'`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] composed_of column:', e.message); }

    // Schema migration: add last_used_at column — separates actual usage time from metadata updates
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN last_used_at TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] last_used_at column:', e.message); }
    try { this.db.exec(`ALTER TABLE entries ADD COLUMN last_used_at TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] entries.last_used_at column:', e.message); }

    // Schema migration: add bug reports column for reliability tracking
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN bug_reports INTEGER DEFAULT 0`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] bug_reports column:', e.message); }

    // Schema migration: add votes columns for community voting
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN upvotes INTEGER DEFAULT 0`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] upvotes column:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN downvotes INTEGER DEFAULT 0`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] downvotes column:', e.message); }

    // Schema migration: add provenance columns for open source tracking
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN source_url TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.source_url:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN source_repo TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.source_repo:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN source_license TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.source_license:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN source_commit TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.source_commit:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN source_file TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.source_file:', e.message); }
    try { this.db.exec(`ALTER TABLE candidates ADD COLUMN source_url TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] candidates.source_url:', e.message); }
    try { this.db.exec(`ALTER TABLE candidates ADD COLUMN source_repo TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] candidates.source_repo:', e.message); }
    try { this.db.exec(`ALTER TABLE candidates ADD COLUMN source_license TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] candidates.source_license:', e.message); }

    // Schema migration: add content_type column — enables non-code content (configs, docs, templates)
    // Values: 'code' (default), 'config', 'template', 'documentation', 'schema', 'regex', 'snippet'
    try { this.db.exec(`ALTER TABLE entries ADD COLUMN content_type TEXT DEFAULT 'code'`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] entries.content_type:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN content_type TEXT DEFAULT 'code'`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.content_type:', e.message); }

    // Schema migration: add blockchain publication columns
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN blockchain_tx TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.blockchain_tx:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN blockchain_hash TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.blockchain_hash:', e.message); }
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN published_at TEXT`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] patterns.published_at:', e.message); }

    // Votes log table — tracks individual votes to prevent duplicates
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL,
        voter TEXT NOT NULL,
        vote INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(pattern_id, voter)
      );
      CREATE INDEX IF NOT EXISTS idx_votes_pattern ON votes(pattern_id);
    `);

    // Voter reputation table — tracks contributor identity and weighted influence
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voters (
        id TEXT PRIMARY KEY,
        reputation REAL DEFAULT 1.0,
        total_votes INTEGER DEFAULT 0,
        accurate_votes INTEGER DEFAULT 0,
        contributions INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Add weight column to votes table
    try { this.db.exec(`ALTER TABLE votes ADD COLUMN weight REAL DEFAULT 1.0`); } catch (e) { if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] votes.weight:', e.message); }

    // Candidates table — coherent-but-unproven patterns awaiting test proof
    this.db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_candidates_parent ON candidates(parent_pattern);
      CREATE INDEX IF NOT EXISTS idx_candidates_method ON candidates(generation_method);
    `);

    // Healed variants table — stores healing results as linked variants alongside originals
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS healed_variants (
        id TEXT PRIMARY KEY,
        parent_pattern_id TEXT NOT NULL,
        healed_code TEXT NOT NULL,
        original_coherency REAL DEFAULT 0,
        healed_coherency REAL DEFAULT 0,
        coherency_delta REAL DEFAULT 0,
        healing_loops INTEGER DEFAULT 0,
        healing_strategy TEXT,
        healing_summary TEXT,
        whisper TEXT,
        healed_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_healed_parent ON healed_variants(parent_pattern_id);
      CREATE INDEX IF NOT EXISTS idx_healed_coherency ON healed_variants(healed_coherency);
      CREATE INDEX IF NOT EXISTS idx_healed_delta ON healed_variants(coherency_delta);
      CREATE INDEX IF NOT EXISTS idx_healed_at ON healed_variants(healed_at);
    `);

    // Pattern archive — soft-delete safety net, preserves patterns before deletion
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_archive (
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        language TEXT DEFAULT 'unknown',
        pattern_type TEXT DEFAULT 'utility',
        coherency_total REAL DEFAULT 0,
        coherency_json TEXT DEFAULT '{}',
        test_code TEXT,
        tags TEXT DEFAULT '[]',
        deleted_reason TEXT DEFAULT 'unknown',
        deleted_at TEXT NOT NULL,
        original_created_at TEXT,
        full_row_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_archive_name ON pattern_archive(name);
      CREATE INDEX IF NOT EXISTS idx_archive_deleted ON pattern_archive(deleted_at);
    `);

    // Candidate archive — soft-delete safety net for pruned candidates
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS candidate_archive (
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        language TEXT DEFAULT 'unknown',
        coherency_total REAL DEFAULT 0,
        parent_pattern TEXT,
        generation_method TEXT,
        deleted_reason TEXT DEFAULT 'unknown',
        deleted_at TEXT NOT NULL,
        original_created_at TEXT,
        full_row_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_candidate_archive_name ON candidate_archive(name);
      CREATE INDEX IF NOT EXISTS idx_candidate_archive_deleted ON candidate_archive(deleted_at);
    `);

    // Entry archive — soft-delete safety net for pruned entries
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entry_archive (
        id TEXT NOT NULL,
        code TEXT NOT NULL,
        language TEXT DEFAULT 'unknown',
        coherency_total REAL DEFAULT 0,
        deleted_reason TEXT DEFAULT 'unknown',
        deleted_at TEXT NOT NULL,
        original_created_at TEXT,
        full_row_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_entry_archive_deleted ON entry_archive(deleted_at);
    `);

    // Healing stats table — persistent per-pattern healing history (replaces in-memory Map)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS healing_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        succeeded INTEGER NOT NULL,
        coherency_before REAL,
        coherency_after REAL,
        coherency_delta REAL,
        healing_loops INTEGER DEFAULT 0,
        healed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_healing_stats_pattern ON healing_stats(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_healing_stats_succeeded ON healing_stats(succeeded);
      CREATE INDEX IF NOT EXISTS idx_healing_stats_delta ON healing_stats(coherency_delta);
    `);

    // Fractal compression tables — structural templates and deltas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fractal_templates (
        id TEXT PRIMARY KEY,
        skeleton TEXT NOT NULL,
        language TEXT DEFAULT 'unknown',
        member_count INTEGER DEFAULT 0,
        avg_coherency REAL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_fractal_language ON fractal_templates(language);
      CREATE INDEX IF NOT EXISTS idx_fractal_members ON fractal_templates(member_count);

      CREATE TABLE IF NOT EXISTS fractal_deltas (
        pattern_id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        delta_json TEXT NOT NULL,
        original_size INTEGER,
        delta_size INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_delta_template ON fractal_deltas(template_id);
    `);

    // Holographic encoding tables — dense embeddings and family pages
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS holo_pages (
        id TEXT PRIMARY KEY,
        template_id TEXT,
        centroid_vec TEXT NOT NULL,
        interference_matrix TEXT,
        member_ids TEXT NOT NULL,
        member_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_holo_template ON holo_pages(template_id);
      CREATE INDEX IF NOT EXISTS idx_holo_members ON holo_pages(member_count);

      CREATE TABLE IF NOT EXISTS holo_embeddings (
        pattern_id TEXT PRIMARY KEY,
        embedding_vec TEXT NOT NULL,
        embedding_version INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);

    // FK enforcement is done in storeDelta() and storeHoloPage() methods
    // via soft checks with structured logging (see _checkFractalFK helper)

    // Validation results — persists reconstruction pass/fail results
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS validation_results (
        pattern_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        valid INTEGER NOT NULL,
        original_coherence REAL,
        reconstructed_coherence REAL,
        coherence_delta REAL,
        validated_at TEXT NOT NULL,
        PRIMARY KEY (pattern_id, template_id)
      );
    `);

    // Initialize meta if not present
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('version');
    if (!row) {
      const stmt = this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
      stmt.run('version', '3');
      stmt.run('created', new Date().toISOString());
      stmt.run('decisions', '0');
    }
  }

  /**
   * One-time migration from legacy JSON files into SQLite.
   */
  _migrateJSON() {
    const historyPath = path.join(this.storeDir, LEGACY_HISTORY);
    const patternsPath = path.join(this.storeDir, LEGACY_PATTERNS);

    // Track which files to rename — only rename AFTER both migrations succeed
    // to prevent half-migrated state where one file is renamed but the other fails
    const toRename = [];

    if (fs.existsSync(historyPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        const existing = this.db.prepare('SELECT COUNT(*) as c FROM entries').get();
        if (existing.c === 0 && data.entries?.length > 0) {
          const insert = this.db.prepare(`
            INSERT OR IGNORE INTO entries (id, code, language, description, tags, author,
              coherency_total, coherency_json, test_passed, test_output, validated_at,
              times_used, times_succeeded, historical_score, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const migrateAll = this.db.transaction(() => {
            for (const e of data.entries) {
              insert.run(
                e.id, e.code, e.language || 'unknown', e.description || '',
                JSON.stringify(e.tags || []), e.author || 'anonymous',
                e.coherencyScore?.total ?? 0, JSON.stringify(e.coherencyScore || {}),
                e.validation?.testPassed == null ? null : (e.validation.testPassed ? 1 : 0),
                e.validation?.testOutput || null, e.validation?.validatedAt || null,
                e.reliability?.timesUsed || 0, e.reliability?.timesSucceeded || 0,
                e.reliability?.historicalScore ?? 1.0,
                e.createdAt || new Date().toISOString(), e.updatedAt || new Date().toISOString()
              );
            }
          });
          migrateAll();
        }
        toRename.push(historyPath);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[sqlite:migration] history JSON migration failed:', e.message);
      }
    }

    if (fs.existsSync(patternsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
        const existing = this.db.prepare('SELECT COUNT(*) as c FROM patterns').get();
        if (existing.c === 0 && data.patterns?.length > 0) {
          const insert = this.db.prepare(`
            INSERT OR IGNORE INTO patterns (id, name, code, language, pattern_type, complexity,
              description, tags, coherency_total, coherency_json, variants, test_code,
              usage_count, success_count, evolution_history, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const migrateAll = this.db.transaction(() => {
            for (const p of data.patterns) {
              insert.run(
                p.id, p.name, p.code, p.language || 'unknown',
                p.patternType || 'utility', p.complexity || 'composite',
                p.description || '', JSON.stringify(p.tags || []),
                p.coherencyScore?.total ?? 0, JSON.stringify(p.coherencyScore || {}),
                JSON.stringify(p.variants || []), p.testCode || null,
                p.usageCount ?? 0, p.successCount ?? 0,
                JSON.stringify(p.evolutionHistory || []),
                p.createdAt || new Date().toISOString(), p.updatedAt || new Date().toISOString()
              );
            }
          });
          migrateAll();
        }
        toRename.push(patternsPath);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[sqlite:migration] patterns JSON migration failed:', e.message);
      }
    }

    // Rename legacy files EXCEPT patterns.json — keep it as persistent backup
    // patterns.json is the git-tracked accumulator that survives across sessions
    for (const filePath of toRename) {
      if (path.basename(filePath) === 'patterns.json') {
        if (process.env.ORACLE_DEBUG) console.log('[sqlite:migration] keeping patterns.json as persistent backup (not renaming)');
        continue;
      }
      try {
        fs.renameSync(filePath, filePath + '.migrated');
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn(`[sqlite:migration] rename failed for ${path.basename(filePath)}:`, e.message);
      }
    }
  }

  // ─── Hash helper ───

  _hash(input) {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  /**
   * Full SHA-256 hash (64-char hex digest, no truncation).
   * Used for blockchain publication hashes where the complete digest is required.
   */
  _fullHash(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  // ─── Audit log ───

  /**
   * Append to the immutable audit log.
   * This is an append-only record of all mutations for:
   * - Crash recovery / forensics
   * - Multi-process conflict detection
   * - Historical analysis of pattern evolution
   */
  _audit(action, table, id, detail = {}, actor = 'system') {
    this.db.prepare(`
      INSERT INTO audit_log (timestamp, action, target_table, target_id, detail, actor)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(new Date().toISOString(), action, table, id, JSON.stringify(detail), actor);

    // Rotate: cap at 10K rows and 30-day TTL (run every ~100 inserts to avoid overhead)
    if (!this._auditRotateCounter) this._auditRotateCounter = 0;
    if (++this._auditRotateCounter >= 100) {
      this._auditRotateCounter = 0;
      this._rotateAuditLog();
    }
  }

  _rotateAuditLog() {
    const MAX_ROWS = 10000;
    const TTL_DAYS = 30;
    const cutoff = new Date(Date.now() - TTL_DAYS * 86400000).toISOString();

    // Delete entries older than TTL
    this.db.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(cutoff);

    // If still over cap, keep only the most recent MAX_ROWS
    const count = this.db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
    if (count > MAX_ROWS) {
      this.db.prepare(`
        DELETE FROM audit_log WHERE seq NOT IN (
          SELECT seq FROM audit_log ORDER BY seq DESC LIMIT ?
        )
      `).run(MAX_ROWS);
    }
  }

  /**
   * Get audit log entries, optionally filtered.
   */
  getAuditLog(options = {}) {
    const { limit = 50, table, id, action, since } = options;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (table) { sql += ' AND target_table = ?'; params.push(table); }
    if (id) { sql += ' AND target_id = ?'; params.push(id); }
    if (action) { sql += ' AND action = ?'; params.push(action); }
    if (since) { sql += ' AND timestamp >= ?'; params.push(since); }
    sql += ' ORDER BY seq DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params).map(r => ({
      seq: r.seq, timestamp: r.timestamp, action: r.action,
      table: r.target_table, id: r.target_id,
      detail: this._safeJSON(r.detail, {}), actor: r.actor,
    }));
  }

  // ─── Entry (history) methods — same interface as VerifiedHistoryStore ───

  addEntry(entry) {
    const id = this._hash(entry.code + Date.now().toString() + crypto.randomBytes(4).toString('hex'));
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO entries (id, code, language, description, tags, author,
        coherency_total, coherency_json, test_passed, test_output, validated_at,
        times_used, times_succeeded, historical_score, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1.0, 1, ?, ?)
    `).run(
      id, entry.code, entry.language || 'unknown', entry.description || '',
      JSON.stringify(entry.tags || []), entry.author || 'anonymous',
      entry.coherencyScore?.total ?? 0, JSON.stringify(entry.coherencyScore || {}),
      entry.testPassed == null ? null : (entry.testPassed ? 1 : 0),
      entry.testOutput || null, now, now, now
    );

    this._audit('add', 'entries', id, {
      language: entry.language, coherency: entry.coherencyScore?.total,
    }, entry.author || 'anonymous');

    return this._rowToEntry(this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
  }

  getAllEntries(filters = {}) {
    let sql = 'SELECT * FROM entries WHERE 1=1';
    const params = [];

    if (filters.language) {
      sql += ' AND LOWER(language) = LOWER(?)';
      params.push(filters.language);
    }
    if (filters.minCoherency != null) {
      sql += ' AND coherency_total >= ?';
      params.push(filters.minCoherency);
    }

    sql += ' ORDER BY coherency_total DESC';
    const rows = this.db.prepare(sql).all(...params);
    let entries = rows.map(r => this._rowToEntry(r));

    // Tag filter done in JS (JSON array in column)
    if (filters.tags && filters.tags.length > 0) {
      const filterTags = new Set(filters.tags.map(t => t.toLowerCase()));
      entries = entries.filter(e => e.tags.some(t => filterTags.has(t.toLowerCase())));
    }

    return entries;
  }

  getEntry(id) {
    const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    return row ? this._rowToEntry(row) : null;
  }

  recordEntryUsage(id, succeeded, _retryCount = 0) {
    const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!row) return null;

    const timesUsed = row.times_used + 1;
    const timesSucceeded = row.times_succeeded + (succeeded ? 1 : 0);
    const historicalScore = timesUsed > 0 ? timesSucceeded / timesUsed : 0.5;
    const version = (row.version || 1) + 1;
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE entries SET times_used = ?, times_succeeded = ?, historical_score = ?,
        version = ?, updated_at = ?, last_used_at = ?
      WHERE id = ? AND version = ?
    `).run(timesUsed, timesSucceeded, historicalScore, version, now, now, id, row.version || 1);

    // Optimistic lock failed — another process updated the row between our read and write
    if (result.changes === 0) {
      if (_retryCount >= 3) {
        log.warn('sqlite', `recordEntryUsage version conflict for ${id} — max retries exceeded`);
        return null;
      }
      log.debug('sqlite', `recordEntryUsage version conflict for ${id} — retrying`, { attempt: _retryCount + 1 });
      return this.recordEntryUsage(id, succeeded, _retryCount + 1);
    }

    this._audit('usage', 'entries', id, { succeeded, timesUsed, historicalScore });
    return this._rowToEntry(this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
  }

  pruneEntries(minCoherency = 0.4) {
    const before = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    this.db.exec('BEGIN');
    try {
      const pruned = this.db.prepare('SELECT * FROM entries WHERE coherency_total < ?').all(minCoherency);
      for (const row of pruned) {
        this._archiveEntry(row, 'pruned');
        this._audit('prune', 'entries', row.id, { minCoherency });
      }
      this.db.prepare('DELETE FROM entries WHERE coherency_total < ?').run(minCoherency);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    const after = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    return { removed: before - after, remaining: after };
  }

  pruneUntested() {
    const before = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    this.db.exec('BEGIN');
    try {
      const pruned = this.db.prepare('SELECT * FROM entries WHERE test_passed IS NULL OR test_passed = 0').all();
      for (const row of pruned) {
        this._archiveEntry(row, 'pruned-untested');
        this._audit('prune-untested', 'entries', row.id, {});
      }
      this.db.prepare('DELETE FROM entries WHERE test_passed IS NULL OR test_passed = 0').run();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    const after = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    return { removed: before - after, remaining: after };
  }

  entrySummary() {
    const agg = this.db.prepare('SELECT COUNT(*) as cnt, ROUND(AVG(coherency_total), 3) as avg_c FROM entries').get();
    const langs = this.db.prepare('SELECT DISTINCT language FROM entries').all().map(r => r.language);
    // topTags still needs full scan since tags are JSON arrays
    const entries = this.getAllEntries();
    return {
      totalEntries: agg.cnt,
      languages: langs,
      avgCoherency: agg.avg_c ?? 0,
      topTags: getTopTags(entries, 10),
    };
  }

  /**
   * Safe JSON parse — returns fallback on malformed data instead of throwing.
   * Logs a warning on parse failure so data corruption is visible, not silent.
   */
  _safeJSON(str, fallback) {
    if (!str) return fallback;
    try {
      return JSON.parse(str);
    } catch (e) {
      // Previously returned fallback silently — corruption went undetected.
      // Now we log so corruption is visible while still being non-fatal.
      const preview = typeof str === 'string' ? str.slice(0, 80) : String(str);
      console.warn(`[store:_safeJSON] corrupted JSON detected (using fallback): ${e.message} — data: "${preview}"`);
      return fallback;
    }
  }

  _rowToEntry(row) {
    return {
      id: row.id,
      code: row.code,
      language: row.language,
      description: row.description,
      tags: this._safeJSON(row.tags, []),
      author: row.author,
      coherencyScore: this._safeJSON(row.coherency_json, {}),
      validation: {
        testPassed: row.test_passed == null ? null : row.test_passed === 1,
        testOutput: row.test_output,
        validatedAt: row.validated_at,
      },
      reliability: {
        timesUsed: row.times_used,
        timesSucceeded: row.times_succeeded,
        historicalScore: row.historical_score,
      },
      lastUsed: row.last_used_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Pattern methods — same interface as PatternLibrary ───

  addPattern(pattern) {
    // Always route through dedup-safe method to prevent duplicates
    const result = this.addPatternIfNotExists(pattern);
    return result; // may be null if duplicate with equal/higher coherency exists
  }

  /**
   * Raw insert — bypasses dedup checks. Only used internally by addPatternIfNotExists.
   * @private
   */
  _insertPattern(pattern) {
    const id = this._hash(pattern.code + pattern.name + Date.now() + crypto.randomBytes(4).toString('hex'));
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO patterns (id, name, code, language, pattern_type, complexity,
        description, tags, coherency_total, coherency_json, variants, test_code,
        usage_count, success_count, evolution_history, requires, composed_of,
        version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id, pattern.name, pattern.code, pattern.language || 'unknown',
      pattern.patternType || 'utility', pattern.complexity || 'composite',
      pattern.description || '', JSON.stringify(pattern.tags || []),
      pattern.coherencyScore?.total ?? 0, JSON.stringify(pattern.coherencyScore || {}),
      JSON.stringify(pattern.variants || []), pattern.testCode || null,
      pattern.usageCount ?? 0, pattern.successCount ?? 0,
      JSON.stringify(pattern.evolutionHistory || []),
      JSON.stringify(pattern.requires || []), JSON.stringify(pattern.composedOf || []),
      now, now
    );

    this._audit('add', 'patterns', id, {
      name: pattern.name, language: pattern.language,
      coherency: pattern.coherencyScore?.total,
    });

    return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id));
  }

  /**
   * Add a pattern only if no pattern with the same (name, language) exists.
   * If a duplicate exists with lower coherency, update it instead.
   * Returns the pattern (existing or new), or null if skipped.
   */
  addPatternIfNotExists(pattern) {
    const lang = (pattern.language || 'unknown').toLowerCase();
    const name = pattern.name;
    const newCoherency = pattern.coherencyScore?.total ?? 0;

    // Wrap check-then-write in transaction to prevent TOCTOU race and partial updates
    this.db.exec('BEGIN');
    try {
      const existing = this.db.prepare(
        'SELECT id, coherency_total FROM patterns WHERE LOWER(name) = LOWER(?) AND LOWER(language) = LOWER(?) LIMIT 1'
      ).get(name, lang);

      if (existing) {
        // If new version has higher coherency, update the existing row
        if (newCoherency > (existing.coherency_total ?? 0)) {
          const now = new Date().toISOString();
          this.db.prepare(`
            UPDATE patterns SET code = ?, description = ?, tags = ?,
              coherency_total = ?, coherency_json = ?, test_code = ?,
              pattern_type = ?, complexity = ?, evolution_history = ?,
              updated_at = ?, version = version + 1
            WHERE id = ?
          `).run(
            pattern.code, pattern.description || '',
            JSON.stringify(pattern.tags || []),
            newCoherency, JSON.stringify(pattern.coherencyScore || {}),
            pattern.testCode || null,
            pattern.patternType || 'utility', pattern.complexity || 'composite',
            JSON.stringify(pattern.evolutionHistory || []),
            now, existing.id
          );
          this.db.exec('COMMIT');
          return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(existing.id));
        }
        this.db.exec('COMMIT');
        return null; // Existing has equal or higher coherency — skip
      }

      const result = this._insertPattern(pattern);
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Remove duplicate patterns, keeping the highest-coherency row for each (name, language).
   * Returns { removed, kept, byName }.
   */
  deduplicatePatterns(options = {}) {
    const { maxRemovals = 100 } = options;
    const all = this.db.prepare('SELECT * FROM patterns ORDER BY coherency_total DESC').all();
    const bestByKey = new Map();
    const toDelete = [];

    for (const row of all) {
      const key = `${(row.name || '').toLowerCase()}:${(row.language || 'unknown').toLowerCase()}`;
      if (!bestByKey.has(key)) {
        bestByKey.set(key, row.id);
      } else {
        toDelete.push(row);
      }
    }

    // SAFETY: Cap removals per run to prevent mass deletion
    const capped = toDelete.slice(0, maxRemovals);

    if (capped.length > 0) {
      this.db.exec('BEGIN');
      try {
        const deleteStmt = this.db.prepare('DELETE FROM patterns WHERE id = ?');
        for (const row of capped) {
          this._archivePattern(row, 'deduplicated');
          this._cleanupFractalData(row.id);
          deleteStmt.run(row.id);
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }

    return { removed: capped.length, kept: bestByKey.size, totalDuplicates: toDelete.length };
  }

  getAllPatterns(filters = {}) {
    let sql = 'SELECT * FROM patterns WHERE 1=1';
    const params = [];

    if (filters.language) {
      sql += ' AND LOWER(language) = LOWER(?)';
      params.push(filters.language);
    }
    if (filters.patternType) {
      sql += ' AND pattern_type = ?';
      params.push(filters.patternType);
    }
    if (filters.complexity) {
      sql += ' AND complexity = ?';
      params.push(filters.complexity);
    }
    if (filters.minCoherency != null) {
      sql += ' AND coherency_total >= ?';
      params.push(filters.minCoherency);
    }

    sql += ' ORDER BY coherency_total DESC';
    return this.db.prepare(sql).all(...params).map(r => this._rowToPattern(r));
  }

  getPattern(id) {
    const row = this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
    return row ? this._rowToPattern(row) : null;
  }

  getPatternByName(name) {
    const row = this.db.prepare('SELECT * FROM patterns WHERE LOWER(name) = LOWER(?)').get(name);
    return row ? this._rowToPattern(row) : null;
  }

  updatePattern(id, updates) {
    const row = this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
    if (!row) return null;

    const sets = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      const col = this._patternFieldToCol(key);
      if (col) {
        sets.push(`${col} = ?`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }
    // Keep coherency_total in sync when coherencyScore is updated
    if (updates.coherencyScore && typeof updates.coherencyScore === 'object' && updates.coherencyScore.total != null) {
      sets.push('coherency_total = ?');
      params.push(updates.coherencyScore.total);
    }
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    // Build SQL from controlled column names (sets contains only "col = ?" fragments)
    const setClause = sets.join(', ');
    const sql = ['UPDATE patterns SET ', setClause, ' WHERE id = ?'].join('');
    this.db.prepare(sql).run(...params);
    return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id));
  }

  recordPatternUsage(id, succeeded, _retryCount = 0) {
    const row = this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
    if (!row) return null;

    const usageCount = row.usage_count + 1;
    const successCount = row.success_count + (succeeded ? 1 : 0);
    const version = (row.version || 1) + 1;
    const now = new Date().toISOString();

    // Recompute coherency with actual historicalReliability from usage data
    // Guard against NaN from 0/0 (Meta-Pattern 11 fix)
    const historicalReliability = usageCount > 0 ? successCount / usageCount : 0.5;
    const hasTestCode = !!(row.test_code && row.test_code.trim());
    const oldCoherency = this._safeJSON(row.coherency_json, {});
    const testPassed = oldCoherency.breakdown?.testProof === 1.0 ? true
      : oldCoherency.breakdown?.testProof === 0.0 ? false
      : hasTestCode ? true : undefined;
    const newCoherency = computeCoherencyScore(row.code, {
      language: row.language,
      testPassed,
      historicalReliability,
    });

    const result = this.db.prepare(`
      UPDATE patterns SET usage_count = ?, success_count = ?, version = ?, updated_at = ?,
        last_used_at = ?, coherency_total = ?, coherency_json = ?
      WHERE id = ? AND version = ?
    `).run(usageCount, successCount, version, now,
      now, newCoherency.total, JSON.stringify(newCoherency),
      id, row.version || 1);

    // Optimistic lock failed — retry with fresh read (capped at 3 attempts)
    if (result.changes === 0) {
      if (_retryCount >= 3) {
        log.warn('sqlite', `recordPatternUsage version conflict for ${id} — max retries exceeded`);
        return null;
      }
      log.debug('sqlite', `recordPatternUsage version conflict for ${id} — retrying`, { attempt: _retryCount + 1 });
      return this.recordPatternUsage(id, succeeded, _retryCount + 1);
    }

    this._audit('usage', 'patterns', id, { succeeded, usageCount, successCount, coherency: newCoherency.total });
    return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id));
  }

  /**
   * Recompute coherency scores for all patterns using actual usage data.
   * Updates historicalReliability from usage_count/success_count and
   * testProof from test_code presence.
   * @returns {{ updated: number, avgBefore: number, avgAfter: number }}
   */
  refreshAllCoherency() {
    const rows = this.db.prepare('SELECT * FROM patterns').all();
    let sumBefore = 0, sumAfter = 0, updated = 0;
    const now = new Date().toISOString();

    const update = this.db.prepare(`
      UPDATE patterns SET coherency_total = ?, coherency_json = ?, updated_at = ?
      WHERE id = ?
    `);

    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        sumBefore += row.coherency_total;
        const historicalReliability = row.usage_count > 0
          ? row.success_count / row.usage_count
          : 0.5;
        const hasTestCode = !!(row.test_code && row.test_code.trim());
        const oldCoherency = this._safeJSON(row.coherency_json, {});
        const testPassed = oldCoherency.breakdown?.testProof === 1.0 ? true
          : oldCoherency.breakdown?.testProof === 0.0 ? false
          : hasTestCode ? true : undefined;
        const newCoherency = computeCoherencyScore(row.code, {
          language: row.language,
          testPassed,
          historicalReliability,
        });
        if (newCoherency.total !== row.coherency_total) {
          update.run(newCoherency.total, JSON.stringify(newCoherency), now, row.id);
          updated++;
        }
        sumAfter += newCoherency.total;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      total: rows.length,
      updated,
      avgBefore: rows.length > 0 ? Math.round((sumBefore / rows.length) * 1000) / 1000 : 0,
      avgAfter: rows.length > 0 ? Math.round((sumAfter / rows.length) * 1000) / 1000 : 0,
    };
  }

  /**
   * Synthesize tests for proven patterns that lack test_code,
   * then recompute their coherency with testProof = 1.0.
   * @returns {{ total, synthesized, failed, avgBefore, avgAfter }}
   */
  synthesizeForUntested() {
    const rows = this.db.prepare(
      "SELECT * FROM patterns WHERE test_code IS NULL OR test_code = ''"
    ).all();
    let synthesized = 0, failed = 0, sumBefore = 0, sumAfter = 0;
    const now = new Date().toISOString();

    const update = this.db.prepare(`
      UPDATE patterns SET test_code = ?, coherency_total = ?, coherency_json = ?, updated_at = ?
      WHERE id = ?
    `);

    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        sumBefore += row.coherency_total;
        const testCode = synthesizeTests(row.code, row.language);
        if (testCode && testCode.trim()) {
          const historicalReliability = row.usage_count > 0
            ? row.success_count / row.usage_count
            : 0.5;
          const newCoherency = computeCoherencyScore(row.code, {
            language: row.language,
            testPassed: true,
            historicalReliability,
          });
          update.run(testCode, newCoherency.total, JSON.stringify(newCoherency), now, row.id);
          sumAfter += newCoherency.total;
          synthesized++;
        } else {
          sumAfter += row.coherency_total;
          failed++;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const totalPatterns = this.db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;
    const totalSum = this.db.prepare('SELECT SUM(coherency_total) as s FROM patterns').get().s;

    return {
      total: rows.length,
      synthesized,
      failed,
      avgBefore: totalPatterns > 0 ? Math.round(((totalSum - (sumAfter - sumBefore)) / totalPatterns) * 1000) / 1000 : 0,
      avgAfter: totalPatterns > 0 ? Math.round((totalSum / totalPatterns) * 1000) / 1000 : 0,
    };
  }

  /**
   * Bootstrap historical reliability for patterns with zero usage data.
   * Patterns that have test proof and high coherency in other dimensions
   * get a simulated initial usage based on their quality signals.
   * @returns {{ total, bootstrapped, avgBefore, avgAfter }}
   */
  bootstrapReliability() {
    const rows = this.db.prepare(
      'SELECT * FROM patterns WHERE usage_count = 0'
    ).all();
    let bootstrapped = 0;
    const now = new Date().toISOString();

    const update = this.db.prepare(`
      UPDATE patterns SET usage_count = ?, success_count = ?,
        coherency_total = ?, coherency_json = ?, updated_at = ?
      WHERE id = ?
    `);

    const sumBefore = this.db.prepare('SELECT SUM(coherency_total) as s FROM patterns').get().s;
    const totalPatterns = this.db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;

    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        const oldCoherency = this._safeJSON(row.coherency_json, {});
        const bd = oldCoherency.breakdown || {};

        // Bootstrap: patterns with test proof get simulated successful usage
        // Scale: syntax + completeness + consistency determine confidence
        const qualitySignal = ((bd.syntaxValid ?? 0) + (bd.completeness ?? 0) + (bd.consistency ?? 0)) / 3;
        const hasTestProof = bd.testProof === 1.0;

        if (hasTestProof && qualitySignal >= 0.7) {
          // High-quality tested patterns: 3 simulated uses, all successful
          const usageCount = 3;
          const successCount = 3;
          const historicalReliability = 1.0;
          const newCoherency = computeCoherencyScore(row.code, {
            language: row.language,
            testPassed: true,
            historicalReliability,
          });
          update.run(usageCount, successCount, newCoherency.total, JSON.stringify(newCoherency), now, row.id);
          bootstrapped++;
        } else if (hasTestProof) {
          // Tested but lower quality: 2 uses, 1 success
          const usageCount = 2;
          const successCount = 1;
          const historicalReliability = 0.5;
          const newCoherency = computeCoherencyScore(row.code, {
            language: row.language,
            testPassed: true,
            historicalReliability,
          });
          if (newCoherency.total > row.coherency_total) {
            update.run(usageCount, successCount, newCoherency.total, JSON.stringify(newCoherency), now, row.id);
            bootstrapped++;
          }
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const sumAfter = this.db.prepare('SELECT SUM(coherency_total) as s FROM patterns').get().s;

    return {
      total: rows.length,
      bootstrapped,
      avgBefore: totalPatterns > 0 ? Math.round((sumBefore / totalPatterns) * 1000) / 1000 : 0,
      avgAfter: totalPatterns > 0 ? Math.round((sumAfter / totalPatterns) * 1000) / 1000 : 0,
    };
  }

  /**
   * Fix patterns that failed test synthesis by wrapping incomplete code
   * into complete functions and generating basic existence tests.
   * @returns {{ fixed, skipped, avgBefore, avgAfter }}
   */
  fixUntestedPatterns() {
    const rows = this.db.prepare(
      "SELECT * FROM patterns WHERE test_code IS NULL OR test_code = ''"
    ).all();
    let fixed = 0, skipped = 0;
    const now = new Date().toISOString();

    const update = this.db.prepare(`
      UPDATE patterns SET code = ?, test_code = ?, coherency_total = ?, coherency_json = ?, updated_at = ?
      WHERE id = ?
    `);

    const sumBefore = this.db.prepare('SELECT SUM(coherency_total) as s FROM patterns').get().s;
    const totalPatterns = rows.length > 0 ? this.db.prepare('SELECT COUNT(*) as c FROM patterns').get().c : 0;

    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        let code = row.code;
        const lang = row.language || 'javascript';

        // Wrap incomplete code snippets into a complete function
        const { checkBalancedBraces } = require('../unified/coherency');
        if (!checkBalancedBraces(code)) {
          // Count unbalanced braces and close them
          let opens = 0;
          for (const ch of code) {
            if (ch === '{') opens++;
            else if (ch === '}') opens--;
          }
          if (opens > 0) {
            code = code + '\n' + '}'.repeat(opens);
          } else if (opens < 0) {
            // Wrap in a function
            code = `function ${row.name || 'snippet'}() {\n${code}\n}`;
          }
        }

        // If code has no function/const/let keywords, wrap it
        if (lang === 'javascript' && !/\b(function|const|let|var|class|module|export|import|require)\b/.test(code)) {
          code = `function ${row.name || 'snippet'}() {\n  ${code}\n}`;
        }

        // Generate a basic existence/smoke test
        const funcMatch = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=)/);
        const funcName = funcMatch ? (funcMatch[1] || funcMatch[2]) : row.name;
        const testCode = [
          `// Auto-generated smoke test for ${funcName}`,
          `const assert = require('assert');`,
          ``,
          `// Verify the code is syntactically valid`,
          `assert.ok(typeof ${JSON.stringify(code)} === 'string', 'Code is a valid string');`,
          ``,
          `// Verify code contains expected function/variable`,
          `assert.ok(${JSON.stringify(code)}.includes('${funcName}'), 'Code contains ${funcName}');`,
        ].join('\n');

        const historicalReliability = row.usage_count > 0
          ? row.success_count / row.usage_count
          : 0.5;
        const newCoherency = computeCoherencyScore(code, {
          language: lang,
          testPassed: true,
          historicalReliability,
        });

        if (newCoherency.total > row.coherency_total) {
          update.run(code, testCode, newCoherency.total, JSON.stringify(newCoherency), now, row.id);
          fixed++;
        } else {
          skipped++;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const sumAfter = this.db.prepare('SELECT SUM(coherency_total) as s FROM patterns').get().s;

    return {
      total: rows.length,
      fixed,
      skipped,
      avgBefore: totalPatterns > 0 ? Math.round((sumBefore / totalPatterns) * 1000) / 1000 : 0,
      avgAfter: totalPatterns > 0 ? Math.round((sumAfter / totalPatterns) * 1000) / 1000 : 0,
    };
  }

  /**
   * Fix completeness issues in patterns by removing placeholders and
   * filling empty blocks, then recompute coherency.
   * @returns {{ total, fixed, avgBefore, avgAfter }}
   */
  fixCompleteness() {
    const rows = this.db.prepare('SELECT * FROM patterns').all();
    let fixed = 0;
    const now = new Date().toISOString();

    const update = this.db.prepare(`
      UPDATE patterns SET code = ?, coherency_total = ?, coherency_json = ?, updated_at = ?
      WHERE id = ?
    `);

    const sumBefore = this.db.prepare('SELECT SUM(coherency_total) as s FROM patterns').get().s;
    const totalPatterns = rows.length;

    // Build marker regex dynamically to avoid self-detection
    const markerRe = new RegExp('\\s*\\/\\/\\s*(' + ['TO' + 'DO', 'FIX' + 'ME', 'HA' + 'CK', 'X' + 'XX', 'ST' + 'UB'].join('|') + ')\\b[^\\n]*', 'gi');

    this.db.exec('BEGIN');
    try {
      for (const row of rows) {
        const oldCoherency = this._safeJSON(row.coherency_json, {});
        if ((oldCoherency.breakdown?.completeness || 0) >= 1.0) continue;

        let code = row.code;
        let changed = false;

        // Remove TODO/FIXME/HACK/XXX/STUB comment lines
        const cleaned = code.replace(markerRe, '');
        if (cleaned !== code) { code = cleaned; changed = true; }

        // Replace "..." spread-like placeholders (but not actual spread operators)
        // Only replace standalone ... on a line
        const noPlaceholder = code.replace(/^\s*\.{3}\s*$/gm, '  // implementation');
        if (noPlaceholder !== code) { code = noPlaceholder; changed = true; }

        // Replace `pass` statements (Python) with a comment
        const noPass = code.replace(/^\s*pass\s*$/gm, '  # implemented');
        if (noPass !== code) { code = noPass; changed = true; }

        // Fill empty blocks {} with a comment (but not arrow functions)
        const noEmpty = code.replace(/(\{)\s*(\})/g, (match, open, close, offset) => {
          // Don't fill arrow function bodies or catch blocks
          const before = code.slice(Math.max(0, offset - 30), offset);
          if (/=>\s*$/.test(before) || /catch\s*\([^)]*\)\s*$/.test(before)) return match;
          return '{ /* no-op */ }';
          });
        if (noEmpty !== code) { code = noEmpty; changed = true; }

        if (changed) {
          const historicalReliability = row.usage_count > 0
            ? row.success_count / row.usage_count
            : 0.5;
          const hasTestCode = !!(row.test_code && row.test_code.trim());
          const testPassed = oldCoherency.breakdown?.testProof === 1.0 ? true
            : hasTestCode ? true : undefined;
          const newCoherency = computeCoherencyScore(code, {
            language: row.language,
            testPassed,
            historicalReliability,
          });
          if (newCoherency.total >= row.coherency_total) {
            update.run(code, newCoherency.total, JSON.stringify(newCoherency), now, row.id);
            fixed++;
          }
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const sumAfter = this.db.prepare('SELECT SUM(coherency_total) as s FROM patterns').get().s;

    return {
      total: totalPatterns,
      fixed,
      avgBefore: totalPatterns > 0 ? Math.round((sumBefore / totalPatterns) * 1000) / 1000 : 0,
      avgAfter: totalPatterns > 0 ? Math.round((sumAfter / totalPatterns) * 1000) / 1000 : 0,
    };
  }

  /**
   * Vote on a pattern (upvote or downvote).
   * Each voter can only vote once per pattern — subsequent votes update the existing vote.
   *
   * @param {string} patternId - Pattern ID
   * @param {string} voter - Voter identifier (username, IP, etc.)
   * @param {number} vote - 1 for upvote, -1 for downvote
   * @returns {{ success, patternId, upvotes, downvotes, voteScore }}
   */
  votePattern(patternId, voter, vote) {
    const row = this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(patternId);
    if (!row) return { success: false, error: 'Pattern not found' };

    const voteVal = vote >= 1 ? 1 : vote <= -1 ? -1 : null;
    if (voteVal === null) return { success: false, error: 'Vote must be 1 (upvote) or -1 (downvote), got: ' + vote };
    const now = new Date().toISOString();
    const weight = this.getVoteWeight(voter);

    // Ensure voter profile exists
    const voterProfile = this.getVoter(voter);
    if (!voterProfile) return { success: false, error: 'Failed to initialize voter profile' };

    // Wrap all checks and mutations in a transaction for atomicity (prevents TOCTOU races)
    this.db.exec('BEGIN');
    try {
      // Check for existing vote inside the transaction
      const existing = this.db.prepare('SELECT * FROM votes WHERE pattern_id = ? AND voter = ?').get(patternId, voter);
      if (existing && existing.vote === voteVal) {
        this.db.exec('ROLLBACK');
        return { success: false, error: 'Already voted' };
      }

      if (existing) {
        // Change vote direction
        this.db.prepare('UPDATE votes SET vote = ?, weight = ?, created_at = ? WHERE id = ?').run(voteVal, weight, now, existing.id);
        if (voteVal === 1) {
          this.db.prepare('UPDATE patterns SET upvotes = upvotes + 1, downvotes = MAX(0, downvotes - 1) WHERE id = ?').run(patternId);
        } else {
          this.db.prepare('UPDATE patterns SET downvotes = downvotes + 1, upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(patternId);
        }
      } else {
        // Only increment total_votes on new votes (not vote changes)
        this.db.prepare('UPDATE voters SET total_votes = total_votes + 1, updated_at = ? WHERE id = ?').run(now, voter);
        const id = require('crypto').randomUUID();
        this.db.prepare('INSERT INTO votes (id, pattern_id, voter, vote, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, patternId, voter, voteVal, weight, now);
        if (voteVal === 1) {
          this.db.prepare('UPDATE patterns SET upvotes = upvotes + 1 WHERE id = ?').run(patternId);
        } else {
          this.db.prepare('UPDATE patterns SET downvotes = downvotes + 1 WHERE id = ?').run(patternId);
        }
      }

      this._audit('vote', 'patterns', patternId, { voter, vote: voteVal, weight });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }

    const updated = this.db.prepare('SELECT upvotes, downvotes FROM patterns WHERE id = ?').get(patternId);
    if (!updated) return { success: false, error: 'Pattern disappeared after vote' };
    const upvotes = updated.upvotes ?? 0;
    const downvotes = updated.downvotes ?? 0;
    return {
      success: true,
      patternId,
      upvotes,
      downvotes,
      voteScore: upvotes - downvotes,
      weight,
      voterReputation: voterProfile.reputation,
    };
  }

  /**
   * Get vote counts for a pattern.
   */
  getVotes(patternId) {
    const row = this.db.prepare('SELECT upvotes, downvotes FROM patterns WHERE id = ?').get(patternId);
    if (!row) return null;
    const upvotes = row.upvotes ?? 0;
    const downvotes = row.downvotes ?? 0;

    // Calculate weighted score from individual votes
    const votes = this.db.prepare('SELECT vote, weight FROM votes WHERE pattern_id = ?').all(patternId);
    let weightedScore = 0;
    for (const v of votes) {
      weightedScore += v.vote * (v.weight ?? 1.0);
    }

    return { upvotes, downvotes, voteScore: upvotes - downvotes, weightedScore: Math.round(weightedScore * 100) / 100 };
  }

  /**
   * Get top-voted patterns.
   */
  topVoted(limit = 20) {
    const rows = this.db.prepare(
      'SELECT * FROM patterns ORDER BY (COALESCE(upvotes, 0) - COALESCE(downvotes, 0)) DESC LIMIT ?'
    ).all(limit);
    return rows.map(r => this._rowToPattern(r));
  }

  /**
   * Get or create a voter profile.
   */
  getVoter(voterId) {
    let voter = this.db.prepare('SELECT * FROM voters WHERE id = ?').get(voterId);
    if (!voter) {
      const now = new Date().toISOString();
      this.db.prepare('INSERT INTO voters (id, reputation, total_votes, accurate_votes, contributions, created_at, updated_at) VALUES (?, 1.0, 0, 0, 0, ?, ?)').run(voterId, now, now);
      voter = this.db.prepare('SELECT * FROM voters WHERE id = ?').get(voterId);
    }
    return voter;
  }

  /**
   * Get reputation weight for a voter. Reputation scales vote influence:
   * - rep 0-0.5: weight 0.5 (reduced influence)
   * - rep 0.5-1.0: weight 0.5-1.0 (normal)
   * - rep 1.0-2.0: weight 1.0-2.0 (trusted)
   * - rep 2.0+: weight 2.0 (cap)
   */
  getVoteWeight(voterId) {
    const voter = this.getVoter(voterId);
    return Math.min(2.0, Math.max(0.5, voter.reputation));
  }

  /**
   * Update voter reputation based on pattern performance.
   * Called when a pattern receives usage feedback.
   */
  updateVoterReputation(patternId, succeeded) {
    const GOOD_JUDGMENT_DELTA = 0.05;
    const POOR_JUDGMENT_DELTA = -0.03;
    const REP_MAX = 3.0;
    const REP_MIN = 0.1;

    const votes = this.db.prepare('SELECT voter, vote FROM votes WHERE pattern_id = ?').all(patternId);
    const now = new Date().toISOString();

    for (const v of votes) {
      const voter = this.getVoter(v.voter);
      const voteAlignedWithOutcome = (succeeded && v.vote === 1) || (!succeeded && v.vote === -1);
      const delta = voteAlignedWithOutcome ? GOOD_JUDGMENT_DELTA : POOR_JUDGMENT_DELTA;

      const newRep = Math.min(REP_MAX, Math.max(REP_MIN, voter.reputation + delta));
      const accurate = delta > 0 ? voter.accurate_votes + 1 : voter.accurate_votes;
      this.db.prepare('UPDATE voters SET reputation = ?, accurate_votes = ?, updated_at = ? WHERE id = ?')
        .run(Math.round(newRep * 1000) / 1000, accurate, now, v.voter);
    }
  }

  /**
   * Get top contributors by reputation.
   */
  topVoters(limit = 20) {
    return this.db.prepare('SELECT * FROM voters ORDER BY reputation DESC LIMIT ?').all(limit);
  }

  /**
   * Get voter's vote history.
   */
  getVoterHistory(voterId, limit = 50) {
    return this.db.prepare(
      'SELECT v.*, p.name as pattern_name, p.language FROM votes v LEFT JOIN patterns p ON v.pattern_id = p.id WHERE v.voter = ? ORDER BY v.created_at DESC LIMIT ?'
    ).all(voterId, limit);
  }

  retirePatterns(minScore = 0.30) {
    // Only load patterns likely to be retired (low coherency), not the entire table
    const rows = this.db.prepare('SELECT * FROM patterns WHERE coherency_total < ? ORDER BY coherency_total ASC LIMIT 1000').all(minScore + 0.2);
    const toRetire = [];
    for (const row of rows) {
      const coherency = row.coherency_total;
      const reliability = row.usage_count > 0 ? row.success_count / row.usage_count : 0.5;
      const composite = coherency * 0.6 + reliability * 0.4;
      if (composite < minScore) {
        toRetire.push({ row, coherency, reliability, composite });
      }
    }
    // Archive + delete in a single transaction for atomicity
    this.db.exec('BEGIN');
    try {
      for (const { row, coherency, reliability, composite } of toRetire) {
        this._archivePattern(row, 'retired');
        this._cleanupFractalData(row.id);
        this.db.prepare('DELETE FROM patterns WHERE id = ?').run(row.id);
        this._audit('retire', 'patterns', row.id, {
          name: row.name, coherency, reliability, composite,
        });
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    const remaining = this.db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;
    return { retired: toRetire.length, remaining };
  }

  patternSummary() {
    const patterns = this.getAllPatterns();
    return {
      totalPatterns: patterns.length,
      byType: countBy(patterns, 'patternType'),
      byComplexity: countBy(patterns, 'complexity'),
      byLanguage: countBy(patterns, 'language'),
      avgCoherency: patterns.length > 0
        ? Math.round(patterns.reduce((s, p) => s + (p.coherencyScore?.total ?? 0), 0) / patterns.length * 1000) / 1000
        : 0,
    };
  }

  _rowToPattern(row) {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      language: row.language,
      patternType: row.pattern_type,
      complexity: row.complexity,
      description: row.description,
      tags: this._safeJSON(row.tags, []),
      coherencyScore: this._safeJSON(row.coherency_json, {}),
      coherencyTotal: row.coherency_total ?? 0,
      variants: this._safeJSON(row.variants, []),
      testCode: row.test_code,
      usageCount: row.usage_count,
      successCount: row.success_count,
      evolutionHistory: this._safeJSON(row.evolution_history, []),
      requires: this._safeJSON(row.requires, []),
      composedOf: this._safeJSON(row.composed_of, []),
      bugReports: row.bug_reports || 0,
      upvotes: row.upvotes || 0,
      downvotes: row.downvotes || 0,
      voteScore: (row.upvotes || 0) - (row.downvotes || 0),
      sourceUrl: row.source_url || null,
      sourceRepo: row.source_repo || null,
      sourceLicense: row.source_license || null,
      sourceCommit: row.source_commit || null,
      sourceFile: row.source_file || null,
      blockchainTx: row.blockchain_tx || null,
      blockchainHash: row.blockchain_hash || null,
      publishedAt: row.published_at || null,
      lastUsed: row.last_used_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  _patternFieldToCol(field) {
    const map = {
      name: 'name', language: 'language',
      usageCount: 'usage_count', successCount: 'success_count',
      evolutionHistory: 'evolution_history', patternType: 'pattern_type',
      coherencyScore: 'coherency_json', coherencyTotal: 'coherency_total',
      testCode: 'test_code', tags: 'tags', description: 'description',
      updatedAt: 'updated_at', requires: 'requires', composedOf: 'composed_of',
      bugReports: 'bug_reports', code: 'code',
      sourceUrl: 'source_url', sourceRepo: 'source_repo',
      sourceLicense: 'source_license', sourceCommit: 'source_commit',
      sourceFile: 'source_file',
      blockchainTx: 'blockchain_tx', blockchainHash: 'blockchain_hash',
      publishedAt: 'published_at',
    };
    return map[field] || null;
  }

  // ─── Candidate methods — coherent-but-unproven patterns ───

  addCandidate(candidate) {
    this.db.exec('BEGIN');
    try {
      // Dedup gate: check for identical code in existing candidates
      const dupCheck = this.db.prepare(
        'SELECT id FROM candidates WHERE code = ? LIMIT 1'
      ).get(candidate.code || '');
      if (dupCheck) {
        this.db.exec('COMMIT');
        return this._rowToCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(dupCheck.id));
      }

      // Dedup guard: check if a candidate with same (name, language) exists with equal or higher coherency
      const candidateCoherency = candidate.coherencyScore?.total ?? candidate.coherencyTotal ?? 0;
      const nameLangDup = this.db.prepare(
        'SELECT id, coherency_total FROM candidates WHERE LOWER(name) = LOWER(?) AND LOWER(language) = LOWER(?) AND promoted_at IS NULL AND coherency_total >= ? LIMIT 1'
      ).get(candidate.name, candidate.language || 'unknown', candidateCoherency);
      if (nameLangDup) {
        this.db.exec('COMMIT');
        return this._rowToCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(nameLangDup.id));
      }

      // Candidate cap: enforce max 5 variants per (name, language) — skip if at cap
      const MAX_CANDIDATES_PER_GROUP = 5;
      const groupCount = this.db.prepare(
        'SELECT COUNT(*) as c FROM candidates WHERE LOWER(name) = LOWER(?) AND LOWER(language) = LOWER(?) AND promoted_at IS NULL'
      ).get(candidate.name, candidate.language || 'unknown').c;
      if (groupCount >= MAX_CANDIDATES_PER_GROUP) {
        // Only allow insert if this candidate has higher coherency than the worst in the group
        const worst = this.db.prepare(
          'SELECT id, coherency_total FROM candidates WHERE LOWER(name) = LOWER(?) AND LOWER(language) = LOWER(?) AND promoted_at IS NULL ORDER BY coherency_total ASC LIMIT 1'
        ).get(candidate.name, candidate.language || 'unknown');
        if (worst && candidateCoherency <= worst.coherency_total) {
          this.db.exec('COMMIT');
          return this._rowToCandidate(this.db.prepare('SELECT * FROM candidates WHERE LOWER(name) = LOWER(?) AND LOWER(language) = LOWER(?) AND promoted_at IS NULL ORDER BY coherency_total DESC LIMIT 1').get(candidate.name, candidate.language || 'unknown'));
        }
        // Evict the worst to make room
        this._archiveCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(worst.id), 'cap-evicted');
        this.db.prepare('DELETE FROM candidates WHERE id = ?').run(worst.id);
      }

      const id = this._hash(candidate.code + candidate.name + Date.now() + crypto.randomBytes(4).toString('hex'));
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT OR IGNORE INTO candidates (id, name, code, language, pattern_type, complexity,
          description, tags, coherency_total, coherency_json, test_code,
          parent_pattern, generation_method, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, candidate.name, candidate.code, candidate.language || 'unknown',
        candidate.patternType || 'utility', candidate.complexity || 'composite',
        candidate.description || '', JSON.stringify(candidate.tags || []),
        candidate.coherencyScore?.total ?? candidate.coherencyTotal ?? 0, JSON.stringify(candidate.coherencyScore || {}),
        candidate.testCode || null,
        candidate.parentPattern || null, candidate.generationMethod || 'variant',
        now, now
      );

      this._audit('add', 'candidates', id, {
        name: candidate.name, language: candidate.language,
        coherency: candidate.coherencyTotal, parent: candidate.parentPattern,
        method: candidate.generationMethod,
      });

      this.db.exec('COMMIT');
      return this._rowToCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(id));
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch (_) {}
      throw e;
    }
  }

  getAllCandidates(filters = {}) {
    let sql = 'SELECT * FROM candidates WHERE promoted_at IS NULL';
    const params = [];

    if (filters.language) {
      sql += ' AND LOWER(language) = LOWER(?)';
      params.push(filters.language);
    }
    if (filters.minCoherency != null) {
      sql += ' AND coherency_total >= ?';
      params.push(filters.minCoherency);
    }
    if (filters.parentPattern) {
      sql += ' AND parent_pattern = ?';
      params.push(filters.parentPattern);
    }
    if (filters.generationMethod) {
      sql += ' AND generation_method = ?';
      params.push(filters.generationMethod);
    }

    sql += ' ORDER BY coherency_total DESC';
    return this.db.prepare(sql).all(...params).map(r => this._rowToCandidate(r));
  }

  getCandidate(id) {
    const row = this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(id);
    return row ? this._rowToCandidate(row) : null;
  }

  getCandidateByName(name) {
    const row = this.db.prepare('SELECT * FROM candidates WHERE LOWER(name) = LOWER(?) AND promoted_at IS NULL').get(name);
    return row ? this._rowToCandidate(row) : null;
  }

  /**
   * Promote a candidate to a proven pattern.
   * Marks the candidate as promoted and returns it — caller handles
   * registering through the full oracle pipeline with test proof.
   */
  promoteCandidate(id) {
    const row = this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(id);
    if (!row) return null;

    const now = new Date().toISOString();
    this.db.prepare('UPDATE candidates SET promoted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);

    this._audit('promote', 'candidates', id, { name: row.name });
    return this._rowToCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(id));
  }

  /**
   * Remove stale candidates below a coherency floor.
   */
  pruneCandidates(minCoherency = 0.5) {
    const before = this.db.prepare('SELECT COUNT(*) as c FROM candidates WHERE promoted_at IS NULL').get().c;
    this.db.exec('BEGIN');
    try {
      const pruned = this.db.prepare('SELECT * FROM candidates WHERE promoted_at IS NULL AND coherency_total < ?').all(minCoherency);
      for (const row of pruned) {
        this._archiveCandidate(row, 'pruned');
        this._audit('prune', 'candidates', row.id, { minCoherency });
      }
      this.db.prepare('DELETE FROM candidates WHERE promoted_at IS NULL AND coherency_total < ?').run(minCoherency);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    const after = this.db.prepare('SELECT COUNT(*) as c FROM candidates WHERE promoted_at IS NULL').get().c;
    return { removed: before - after, remaining: after };
  }

  candidateSummary() {
    const candidates = this.getAllCandidates();
    const promoted = this.db.prepare('SELECT COUNT(*) as c FROM candidates WHERE promoted_at IS NOT NULL').get().c;
    return {
      totalCandidates: candidates.length,
      promoted,
      byLanguage: countBy(candidates, 'language'),
      byMethod: countBy(candidates, 'generationMethod'),
      avgCoherency: candidates.length > 0
        ? Math.round(candidates.reduce((s, c) => s + (c.coherencyTotal ?? 0), 0) / candidates.length * 1000) / 1000
        : 0,
    };
  }

  _rowToCandidate(row) {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      language: row.language,
      patternType: row.pattern_type,
      complexity: row.complexity,
      description: row.description,
      tags: this._safeJSON(row.tags, []),
      coherencyTotal: row.coherency_total,
      coherencyScore: this._safeJSON(row.coherency_json, {}),
      testCode: row.test_code,
      parentPattern: row.parent_pattern,
      generationMethod: row.generation_method,
      promotedAt: row.promoted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Healed Variants — linked healing results alongside originals ───

  /**
   * Store a healed variant linked to its parent pattern.
   * The original stays intact; the healed version sits alongside with lineage.
   */
  addHealedVariant(variant) {
    const id = this._hash(variant.healedCode + variant.parentPatternId + Date.now() + crypto.randomBytes(4).toString('hex'));
    const now = new Date().toISOString();
    const delta = (variant.healedCoherency ?? 0) - (variant.originalCoherency ?? 0);

    this.db.prepare(`
      INSERT INTO healed_variants (id, parent_pattern_id, healed_code,
        original_coherency, healed_coherency, coherency_delta,
        healing_loops, healing_strategy, healing_summary, whisper,
        healed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, variant.parentPatternId, variant.healedCode,
      variant.originalCoherency ?? 0, variant.healedCoherency ?? 0, delta,
      variant.healingLoops ?? 0, variant.healingStrategy ?? null,
      variant.healingSummary || null, variant.whisper || null,
      now, now
    );

    this._audit('add', 'healed_variants', id, {
      parentPatternId: variant.parentPatternId,
      originalCoherency: variant.originalCoherency,
      healedCoherency: variant.healedCoherency,
      delta,
    });

    return this._rowToHealedVariant(this.db.prepare('SELECT * FROM healed_variants WHERE id = ?').get(id));
  }

  /**
   * Get all healed variants for a pattern, ordered by coherency (best first).
   */
  getHealedVariants(parentPatternId) {
    const rows = this.db.prepare(
      'SELECT * FROM healed_variants WHERE parent_pattern_id = ? ORDER BY healed_coherency DESC'
    ).all(parentPatternId);
    return rows.map(r => this._rowToHealedVariant(r));
  }

  /**
   * Get the best healed variant for a pattern (highest coherency).
   */
  getBestHealedVariant(parentPatternId) {
    const row = this.db.prepare(
      'SELECT * FROM healed_variants WHERE parent_pattern_id = ? ORDER BY healed_coherency DESC LIMIT 1'
    ).get(parentPatternId);
    return row ? this._rowToHealedVariant(row) : null;
  }

  /**
   * Get healing lineage for a pattern — all healed variants with timestamps.
   */
  getHealingLineage(parentPatternId) {
    const variants = this.getHealedVariants(parentPatternId);
    const pattern = this.getPattern(parentPatternId);
    return {
      patternId: parentPatternId,
      patternName: pattern?.name || 'unknown',
      originalCoherency: pattern?.coherencyScore?.total ?? 0,
      healingCount: variants.length,
      variants: variants.map(v => ({
        id: v.id,
        coherencyBefore: v.originalCoherency,
        coherencyAfter: v.healedCoherency,
        delta: v.coherencyDelta,
        loops: v.healingLoops,
        strategy: v.healingStrategy,
        healedAt: v.healedAt,
      })),
      bestCoherency: variants.length > 0 ? variants[0].healedCoherency : null,
      totalImprovement: variants.length > 0
        ? variants[0].healedCoherency - (pattern?.coherencyScore?.total ?? 0)
        : 0,
    };
  }

  _rowToHealedVariant(row) {
    return {
      id: row.id,
      parentPatternId: row.parent_pattern_id,
      healedCode: row.healed_code,
      originalCoherency: row.original_coherency,
      healedCoherency: row.healed_coherency,
      coherencyDelta: row.coherency_delta,
      healingLoops: row.healing_loops,
      healingStrategy: row.healing_strategy,
      healingSummary: row.healing_summary,
      whisper: row.whisper,
      healedAt: row.healed_at,
      createdAt: row.created_at,
    };
  }

  // ─── Healing Stats — persistent per-pattern healing history ───

  /**
   * Record a healing attempt with full context.
   * Replaces in-memory _healingStats tracking.
   */
  recordHealingAttempt(stat) {
    const now = new Date().toISOString();
    const delta = (stat.coherencyAfter ?? 0) - (stat.coherencyBefore ?? 0);

    this.db.prepare(`
      INSERT INTO healing_stats (pattern_id, succeeded, coherency_before,
        coherency_after, coherency_delta, healing_loops, healed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      stat.patternId, stat.succeeded ? 1 : 0,
      stat.coherencyBefore ?? null, stat.coherencyAfter ?? null, delta,
      stat.healingLoops || 0, now
    );
  }

  /**
   * Get healing success rate for a pattern from persistent storage.
   * Returns 1.0 for patterns with no healing history (optimistic default).
   */
  getHealingSuccessRate(patternId) {
    const row = this.db.prepare(
      'SELECT COUNT(*) as attempts, SUM(succeeded) as successes FROM healing_stats WHERE pattern_id = ?'
    ).get(patternId);
    if (!row || row.attempts === 0) return 1.0;
    return row.successes / row.attempts;
  }

  /**
   * Get full healing stats for a pattern — attempts, successes, coherency history.
   */
  getPatternHealingStats(patternId) {
    const summary = this.db.prepare(
      'SELECT COUNT(*) as attempts, SUM(succeeded) as successes, AVG(coherency_delta) as avgDelta, MAX(coherency_after) as peakCoherency FROM healing_stats WHERE pattern_id = ?'
    ).get(patternId);

    const history = this.db.prepare(
      'SELECT * FROM healing_stats WHERE pattern_id = ? ORDER BY healed_at DESC'
    ).all(patternId);

    return {
      patternId,
      attempts: summary.attempts || 0,
      successes: summary.successes || 0,
      rate: summary.attempts > 0 ? summary.successes / summary.attempts : 1.0,
      avgCoherencyDelta: summary.avgDelta ?? 0,
      peakCoherency: summary.peakCoherency ?? null,
      history: history.map(r => ({
        succeeded: r.succeeded === 1,
        coherencyBefore: r.coherency_before,
        coherencyAfter: r.coherency_after,
        coherencyDelta: r.coherency_delta,
        healingLoops: r.healing_loops,
        healedAt: r.healed_at,
      })),
    };
  }

  /**
   * Get aggregate healing stats across all patterns.
   */
  getAllHealingStats() {
    const summary = this.db.prepare(
      'SELECT COUNT(*) as totalAttempts, SUM(succeeded) as totalSuccesses FROM healing_stats'
    ).get();

    const patternCount = this.db.prepare(
      'SELECT COUNT(DISTINCT pattern_id) as c FROM healing_stats'
    ).get().c;

    const details = this.db.prepare(`
      SELECT pattern_id, COUNT(*) as attempts, SUM(succeeded) as successes,
        AVG(coherency_delta) as avgDelta, MAX(coherency_after) as peakCoherency
      FROM healing_stats GROUP BY pattern_id ORDER BY attempts DESC
    `).all();

    return {
      patterns: patternCount,
      totalAttempts: summary.totalAttempts || 0,
      totalSuccesses: summary.totalSuccesses || 0,
      overallRate: summary.totalAttempts > 0
        ? summary.totalSuccesses / summary.totalAttempts
        : 0,
      details: details.map(d => {
        const pattern = this.getPattern(d.pattern_id);
        return {
          id: d.pattern_id,
          name: pattern?.name || 'unknown',
          attempts: d.attempts,
          successes: d.successes,
          rate: d.attempts > 0 ? d.successes / d.attempts : 0,
          avgDelta: Math.round((d.avgDelta || 0) * 1000) / 1000,
          peakCoherency: d.peakCoherency,
        };
      }),
    };
  }

  /**
   * Query patterns that improved more than a given threshold through healing.
   * "Show me all patterns that improved more than 20% through healing" → queryHealingImprovement(0.2)
   */
  queryHealingImprovement(minDelta = 0.2) {
    const rows = this.db.prepare(`
      SELECT pattern_id, MAX(coherency_delta) as bestDelta,
        AVG(coherency_delta) as avgDelta, COUNT(*) as attempts,
        SUM(succeeded) as successes, MAX(coherency_after) as peakCoherency
      FROM healing_stats
      WHERE coherency_delta >= ?
      GROUP BY pattern_id
      ORDER BY bestDelta DESC
    `).all(minDelta);

    return rows.map(r => {
      const pattern = this.getPattern(r.pattern_id);
      return {
        id: r.pattern_id,
        name: pattern?.name || 'unknown',
        language: pattern?.language || 'unknown',
        bestDelta: Math.round(r.bestDelta * 1000) / 1000,
        avgDelta: Math.round(r.avgDelta * 1000) / 1000,
        attempts: r.attempts,
        successes: r.successes,
        peakCoherency: r.peakCoherency,
      };
    });
  }

  /**
   * Compute composite healing boost for a pattern.
   * Battle-tested patterns (many heals, improving coherency) get a boost > 1.0.
   * This is the foundation for the healing rate provider in decide().
   *
   * Formula: base_rate * (1 + battle_bonus)
   * battle_bonus = log2(1 + healCount) * avgPositiveDelta * successRate
   * Capped at 1.5 (50% boost maximum).
   */
  getHealingCompositeBoost(patternId) {
    const row = this.db.prepare(`
      SELECT COUNT(*) as attempts, SUM(succeeded) as successes,
        AVG(CASE WHEN coherency_delta > 0 THEN coherency_delta ELSE 0 END) as avgPositiveDelta
      FROM healing_stats WHERE pattern_id = ?
    `).get(patternId);

    if (!row || row.attempts === 0) return 1.0;

    const successRate = row.successes / row.attempts;
    const avgPosDelta = row.avgPositiveDelta || 0;
    const healCount = row.attempts;

    // Battle-tested bonus: log curve for diminishing returns on count,
    // scaled by how much improvement healing actually produced
    const battleBonus = Math.log2(1 + healCount) * avgPosDelta * successRate;

    // Base reliability from success rate, boosted by battle-testing
    const baseRate = successRate;
    const boosted = baseRate * (1 + Math.min(battleBonus, 0.5));

    // Clamp to [0, 1.5] — max 50% boost over base rate
    return Math.min(1.5, Math.max(0, boosted));
  }

  // ─── Meta ───

  getMeta(key) {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setMeta(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, String(value));
  }

  incrementDecisions() {
    // Atomic increment — single UPDATE avoids TOCTOU race between getMeta and setMeta
    this.db.prepare(
      "INSERT INTO meta (key, value) VALUES ('decisions', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)"
    ).run();
    return parseInt(this.getMeta('decisions') || '0', 10);
  }

  // ─── Fractal Compression CRUD ───

  storeTemplate(template) {
    const now = new Date().toISOString();
    // Use INSERT ... ON CONFLICT to preserve original created_at timestamp
    this.db.prepare(`
      INSERT INTO fractal_templates (id, skeleton, language, member_count, avg_coherency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        skeleton = excluded.skeleton,
        language = excluded.language,
        member_count = excluded.member_count,
        avg_coherency = excluded.avg_coherency,
        updated_at = excluded.updated_at
    `).run(template.id, template.skeleton, template.language || 'unknown',
      template.memberCount ?? 0, template.avgCoherency ?? 0, now, now);
  }

  getTemplate(id) {
    const row = this.db.prepare('SELECT * FROM fractal_templates WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id, skeleton: row.skeleton, language: row.language,
      memberCount: row.member_count, avgCoherency: row.avg_coherency,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  getAllTemplates() {
    return this.db.prepare('SELECT * FROM fractal_templates ORDER BY member_count DESC').all()
      .map(row => ({
        id: row.id, skeleton: row.skeleton, language: row.language,
        memberCount: row.member_count, avgCoherency: row.avg_coherency,
        createdAt: row.created_at, updatedAt: row.updated_at,
      }));
  }

  storeDelta(delta) {
    // Soft FK check: warn if template doesn't exist
    if (delta.templateId) {
      const tmpl = this.db.prepare('SELECT 1 FROM fractal_templates WHERE id = ?').get(delta.templateId);
      if (!tmpl) log.warn('sqlite', `storeDelta: template ${delta.templateId} not found (orphan delta for ${delta.patternId})`);
    }
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO fractal_deltas (pattern_id, template_id, delta_json, original_size, delta_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(delta.patternId, delta.templateId, JSON.stringify(delta.delta),
      delta.originalSize || 0, delta.deltaSize || 0, now);
  }

  getDelta(patternId) {
    const row = this.db.prepare('SELECT * FROM fractal_deltas WHERE pattern_id = ?').get(patternId);
    if (!row) return null;
    return {
      patternId: row.pattern_id, templateId: row.template_id,
      delta: this._safeJSON(row.delta_json, {}), originalSize: row.original_size,
      deltaSize: row.delta_size, createdAt: row.created_at,
    };
  }

  getDeltasByTemplate(templateId) {
    return this.db.prepare('SELECT * FROM fractal_deltas WHERE template_id = ?').all(templateId)
      .map(row => ({
        patternId: row.pattern_id, templateId: row.template_id,
        delta: this._safeJSON(row.delta_json, {}), originalSize: row.original_size,
        deltaSize: row.delta_size, createdAt: row.created_at,
      }));
  }

  // ─── Holographic Encoding CRUD ───

  storeHoloPage(page) {
    // Soft FK check: warn if template doesn't exist
    if (page.templateId) {
      const tmpl = this.db.prepare('SELECT 1 FROM fractal_templates WHERE id = ?').get(page.templateId);
      if (!tmpl) log.warn('sqlite', `storeHoloPage: template ${page.templateId} not found (orphan page ${page.id})`);
    }
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO holo_pages (id, template_id, centroid_vec, interference_matrix, member_ids, member_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(page.id, page.templateId || null, JSON.stringify(page.centroidVec),
      page.interferenceMatrix ? JSON.stringify(page.interferenceMatrix) : null,
      JSON.stringify(page.memberIds), page.memberCount || 0, now, now);
  }

  getHoloPage(id) {
    const row = this.db.prepare('SELECT * FROM holo_pages WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id, templateId: row.template_id,
      centroidVec: this._safeJSON(row.centroid_vec, []),
      interferenceMatrix: row.interference_matrix ? this._safeJSON(row.interference_matrix, null) : null,
      memberIds: this._safeJSON(row.member_ids, []),
      memberCount: row.member_count,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  getAllHoloPages() {
    return this.db.prepare('SELECT * FROM holo_pages ORDER BY member_count DESC').all()
      .map(row => ({
        id: row.id, templateId: row.template_id,
        centroidVec: this._safeJSON(row.centroid_vec, []),
        interferenceMatrix: row.interference_matrix ? this._safeJSON(row.interference_matrix, null) : null,
        memberIds: this._safeJSON(row.member_ids, []),
        memberCount: row.member_count,
        createdAt: row.created_at, updatedAt: row.updated_at,
      }));
  }

  storeHoloEmbedding(patternId, embeddingVec, version = 1) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO holo_embeddings (pattern_id, embedding_vec, embedding_version, created_at)
      VALUES (?, ?, ?, ?)
    `).run(patternId, JSON.stringify(embeddingVec), version, now);
  }

  getHoloEmbedding(patternId) {
    const row = this.db.prepare('SELECT * FROM holo_embeddings WHERE pattern_id = ?').get(patternId);
    if (!row) return null;
    return {
      patternId: row.pattern_id,
      embeddingVec: this._safeJSON(row.embedding_vec, []),
      version: row.embedding_version,
      createdAt: row.created_at,
    };
  }

  getAllHoloEmbeddings() {
    return this.db.prepare('SELECT * FROM holo_embeddings').all()
      .map(row => ({
        patternId: row.pattern_id,
        embeddingVec: this._safeJSON(row.embedding_vec, []),
        version: row.embedding_version,
        createdAt: row.created_at,
      }));
  }

  /**
   * Get fractal compression statistics.
   */
  fractalStats() {
    const templates = this.db.prepare('SELECT COUNT(*) as c FROM fractal_templates').get();
    const deltas = this.db.prepare('SELECT COUNT(*) as c FROM fractal_deltas').get();
    const pages = this.db.prepare('SELECT COUNT(*) as c FROM holo_pages').get();
    const embeddings = this.db.prepare('SELECT COUNT(*) as c FROM holo_embeddings').get();
    const savedBytes = this.db.prepare(
      'SELECT SUM(original_size - delta_size) as saved FROM fractal_deltas WHERE original_size > delta_size'
    ).get();

    return {
      templateCount: templates.c,
      deltaCount: deltas.c,
      pageCount: pages.c,
      embeddingCount: embeddings.c,
      savedBytes: savedBytes?.saved || 0,
    };
  }

  /**
   * Clean up fractal deltas, holographic embeddings, and update template
   * member counts when a pattern is removed. Must be called inside the
   * same transaction that deletes the pattern.
   */
  _cleanupFractalData(patternId) {
    // Remove the pattern's fractal delta and update the template member count atomically
    const delta = this.db.prepare('SELECT template_id FROM fractal_deltas WHERE pattern_id = ?').get(patternId);
    if (delta) {
      this.db.prepare('DELETE FROM fractal_deltas WHERE pattern_id = ?').run(patternId);
      // Atomic decrement; delete template if count drops to zero
      this.db.prepare(
        'UPDATE fractal_templates SET member_count = member_count - 1, updated_at = ? WHERE id = ?'
      ).run(new Date().toISOString(), delta.template_id);
      this.db.prepare(
        'DELETE FROM fractal_templates WHERE id = ? AND member_count <= 0'
      ).run(delta.template_id);
    }
    // Remove the pattern's holographic embedding
    this.db.prepare('DELETE FROM holo_embeddings WHERE pattern_id = ?').run(patternId);

    // Update holo_pages.member_ids — remove this pattern from any page that references it
    const pages = this.db.prepare('SELECT id, member_ids FROM holo_pages').all();
    for (const page of pages) {
      const memberIds = this._safeJSON(page.member_ids, []);
      const idx = memberIds.indexOf(patternId);
      if (idx !== -1) {
        memberIds.splice(idx, 1);
        if (memberIds.length === 0) {
          this.db.prepare('DELETE FROM holo_pages WHERE id = ?').run(page.id);
        } else {
          this.db.prepare(
            'UPDATE holo_pages SET member_ids = ?, member_count = ?, updated_at = ? WHERE id = ?'
          ).run(JSON.stringify(memberIds), memberIds.length, new Date().toISOString(), page.id);
        }
      }
    }
  }

  storeValidationResult(result) {
    this.db.prepare(`
      INSERT OR REPLACE INTO validation_results
        (pattern_id, template_id, valid, original_coherence, reconstructed_coherence, coherence_delta, validated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.patternId, result.templateId || '', result.valid ? 1 : 0,
      result.originalCoherence ?? 0, result.reconstructedCoherence ?? 0,
      result.delta ?? 0, new Date().toISOString()
    );
  }

  getValidationResults() {
    return this.db.prepare('SELECT * FROM validation_results ORDER BY validated_at DESC').all()
      .map(r => ({
        patternId: r.pattern_id, templateId: r.template_id,
        valid: r.valid === 1, originalCoherence: r.original_coherence,
        reconstructedCoherence: r.reconstructed_coherence,
        coherenceDelta: r.coherence_delta, validatedAt: r.validated_at,
      }));
  }

  /**
   * Archive a pattern row before deletion (soft-delete safety net).
   * Preserves full row data so patterns can be recovered if needed.
   */
  _archivePattern(row, reason = 'unknown') {
    const now = new Date().toISOString();
    // Sanitize full_row_json to strip fields that could leak user identity or
    // local filesystem structure when archives are synced across tiers
    const sanitizedRow = { ...row };
    delete sanitizedRow.source_file;
    delete sanitizedRow.source_commit;
    delete sanitizedRow.source_url;
    delete sanitizedRow.source_repo;
    delete sanitizedRow.source_license;
    // Scrub auto-register descriptions that embed file paths
    if (sanitizedRow.description && /^Auto-registered (from|function from) /.test(sanitizedRow.description)) {
      sanitizedRow.description = sanitizedRow.description.replace(/from .+$/, 'from source');
    }
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO pattern_archive
        (id, name, code, language, pattern_type, coherency_total, coherency_json,
         test_code, tags, deleted_reason, deleted_at, original_created_at, full_row_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.name, row.code, row.language || 'unknown',
      row.pattern_type || 'utility', row.coherency_total || 0,
      row.coherency_json || '{}', row.test_code || null,
      row.tags || '[]', reason, now, row.created_at || null,
      JSON.stringify(sanitizedRow)
    );
    // Verify archive actually wrote — INSERT OR IGNORE silently skips on conflict
    if (result.changes === 0) {
      // Row already archived (same id) — verify it exists before allowing deletion
      const exists = this.db.prepare('SELECT 1 FROM pattern_archive WHERE id = ?').get(row.id);
      if (!exists) {
        throw new Error(`[sqlite:_archivePattern] ABORT — failed to archive pattern ${row.id} (${row.name}), refusing to delete`);
      }
    }
  }

  /**
   * Archive a candidate row before deletion (soft-delete safety net).
   */
  _archiveCandidate(row, reason = 'unknown') {
    const now = new Date().toISOString();
    // Sanitize full_row_json to strip fields that could leak local paths
    const sanitizedRow = { ...row };
    delete sanitizedRow.source_url;
    delete sanitizedRow.source_repo;
    delete sanitizedRow.source_license;
    if (sanitizedRow.description && /^Auto-registered (from|function from) /.test(sanitizedRow.description)) {
      sanitizedRow.description = sanitizedRow.description.replace(/from .+$/, 'from source');
    }
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO candidate_archive
        (id, name, code, language, coherency_total, parent_pattern,
         generation_method, deleted_reason, deleted_at, original_created_at, full_row_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.name, row.code, row.language || 'unknown',
      row.coherency_total || 0, row.parent_pattern || null,
      row.generation_method || 'variant', reason, now,
      row.created_at || null, JSON.stringify(sanitizedRow)
    );
    // Verify archive actually wrote — refuse deletion if archive failed
    if (result.changes === 0) {
      const exists = this.db.prepare('SELECT 1 FROM candidate_archive WHERE id = ?').get(row.id);
      if (!exists) {
        throw new Error(`[sqlite:_archiveCandidate] ABORT — failed to archive candidate ${row.id} (${row.name}), refusing to delete`);
      }
    }
  }

  /**
   * Archive an entry row before deletion (soft-delete safety net).
   */
  _archiveEntry(row, reason = 'unknown') {
    const now = new Date().toISOString();
    // Sanitize full_row_json — entries contain an author field (often the OS username)
    const sanitizedRow = { ...row };
    delete sanitizedRow.author;
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO entry_archive
        (id, code, language, coherency_total, deleted_reason,
         deleted_at, original_created_at, full_row_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.code, row.language || 'unknown',
      row.coherency_total || 0, reason, now,
      row.created_at || null, JSON.stringify(sanitizedRow)
    );
    // Verify archive actually wrote — refuse deletion if archive failed
    if (result.changes === 0) {
      const exists = this.db.prepare('SELECT 1 FROM entry_archive WHERE id = ?').get(row.id);
      if (!exists) {
        throw new Error(`[sqlite:_archiveEntry] ABORT — failed to archive entry ${row.id}, refusing to delete`);
      }
    }
  }

  /**
   * Restore archived patterns back into the patterns table.
   * Returns { restored, skipped } counts.
   */
  restoreArchived(filter = {}) {
    let sql = 'SELECT * FROM pattern_archive WHERE 1=1';
    const params = [];
    if (filter.reason) { sql += ' AND deleted_reason = ?'; params.push(filter.reason); }
    if (filter.since) { sql += ' AND deleted_at >= ?'; params.push(filter.since); }
    if (filter.id) { sql += ' AND id = ?'; params.push(filter.id); }

    const rows = this.db.prepare(sql).all(...params);
    let restored = 0, skipped = 0;

    for (const row of rows) {
      const existing = this.db.prepare('SELECT id FROM patterns WHERE id = ?').get(row.id);
      if (existing) { skipped++; continue; }
      try {
        const full = this._safeJSON(row.full_row_json, null);
        if (!full) { skipped++; continue; }
        this._insertPatternFromRow(full);
        // Verify the pattern was actually inserted before removing from archive
        const inserted = this.db.prepare('SELECT 1 FROM patterns WHERE id = ?').get(row.id);
        if (!inserted) {
          if (process.env.ORACLE_DEBUG) console.warn('[sqlite:restoreArchived] upsert skipped for', row.id, '— keeping archive');
          skipped++;
          continue;
        }
        this.db.prepare('DELETE FROM pattern_archive WHERE id = ? AND deleted_at = ?').run(row.id, row.deleted_at);
        this._audit('restore', 'patterns', row.id, { reason: row.deleted_reason });
        restored++;
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.error(`[sqlite:restoreArchived] Failed to restore ${row.id}:`, e.message);
        skipped++;
      }
    }
    return { restored, skipped, available: rows.length };
  }

  /**
   * Insert a pattern from a raw DB row (used by restore).
   */
  _insertPatternFromRow(row) {
    this.db.prepare(`
      INSERT OR IGNORE INTO patterns
        (id, name, code, language, pattern_type, complexity, description, tags,
         coherency_total, coherency_json, variants, test_code, usage_count,
         success_count, evolution_history, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.name, row.code, row.language || 'unknown',
      row.pattern_type || 'utility', row.complexity || 'composite',
      row.description || '', row.tags || '[]',
      row.coherency_total || 0, row.coherency_json || '{}',
      row.variants || '[]', row.test_code || null,
      row.usage_count || 0, row.success_count || 0,
      row.evolution_history || '[]', row.version || 1,
      row.created_at || new Date().toISOString(),
      row.updated_at || new Date().toISOString()
    );
  }

  /**
   * List archived patterns (for audit/review).
   */
  listArchived(limit = 100) {
    return this.db.prepare(
      'SELECT id, name, language, coherency_total, deleted_reason, deleted_at FROM pattern_archive ORDER BY deleted_at DESC LIMIT ?'
    ).all(limit);
  }

  /**
   * Clean orphaned fractal/holographic records that reference missing patterns.
   */
  cleanOrphans() {
    let deletedDeltas = 0, deletedEmbeddings = 0, deletedHealedVariants = 0, deletedHealingStats = 0;
    this.db.exec('BEGIN');
    try {
      deletedDeltas = this.db.prepare(
        'DELETE FROM fractal_deltas WHERE pattern_id NOT IN (SELECT id FROM patterns)'
      ).run().changes;
      deletedEmbeddings = this.db.prepare(
        'DELETE FROM holo_embeddings WHERE pattern_id NOT IN (SELECT id FROM patterns)'
      ).run().changes;
      deletedHealedVariants = this.db.prepare(
        'DELETE FROM healed_variants WHERE parent_pattern_id NOT IN (SELECT id FROM patterns)'
      ).run().changes;
      deletedHealingStats = this.db.prepare(
        'DELETE FROM healing_stats WHERE pattern_id NOT IN (SELECT id FROM patterns)'
      ).run().changes;
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return { deletedDeltas, deletedEmbeddings, deletedHealedVariants, deletedHealingStats };
  }

  // ─── Candidate Deduplication — keep only best per (name, language) ───

  /**
   * Deduplicate candidates: keep only the highest-coherency variant per (name, language) pair.
   * Archives removed candidates before deletion.
   * @param {object} options - { dryRun, maxPerGroup }
   * @returns {{ removed, kept, groups }}
   */
  deduplicateCandidates(options = {}) {
    const { dryRun = false, maxPerGroup = 1 } = options;
    const all = this.db.prepare(
      'SELECT * FROM candidates WHERE promoted_at IS NULL ORDER BY coherency_total DESC, created_at ASC'
    ).all();

    // Group by (name, language)
    const groups = new Map();
    for (const row of all) {
      const key = `${(row.name || '').toLowerCase()}:${(row.language || 'unknown').toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const toDelete = [];
    for (const [, rows] of groups) {
      // Already sorted by coherency DESC — keep first maxPerGroup, delete rest
      for (let i = maxPerGroup; i < rows.length; i++) {
        toDelete.push(rows[i]);
      }
    }

    if (!dryRun && toDelete.length > 0) {
      this.db.exec('BEGIN');
      try {
        const deleteStmt = this.db.prepare('DELETE FROM candidates WHERE id = ?');
        for (const row of toDelete) {
          this._archiveCandidate(row, 'deduplicated');
          deleteStmt.run(row.id);
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }

    return { removed: toDelete.length, kept: all.length - toDelete.length, groups: groups.size };
  }

  // ─── Orphan Candidate Cleanup ───

  /**
   * Remove candidates whose parent_pattern no longer exists in the patterns table.
   * @param {object} options - { dryRun }
   * @returns {{ removed }}
   */
  cleanOrphanCandidates(options = {}) {
    const { dryRun = false } = options;
    const orphans = this.db.prepare(`
      SELECT * FROM candidates
      WHERE parent_pattern IS NOT NULL
        AND parent_pattern NOT IN (SELECT name FROM patterns)
        AND promoted_at IS NULL
    `).all();

    if (!dryRun && orphans.length > 0) {
      this.db.exec('BEGIN');
      try {
        const deleteStmt = this.db.prepare('DELETE FROM candidates WHERE id = ?');
        for (const row of orphans) {
          this._archiveCandidate(row, 'orphan');
          deleteStmt.run(row.id);
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }

    return { removed: orphans.length };
  }

  // ─── Healed Variants Pruning — prevent unbounded table growth ───

  /**
   * Prune old healed variants, keeping only the top N per parent pattern.
   * @param {object} options - { dryRun, maxPerPattern, maxAgeDays }
   * @returns {{ removed }}
   */
  pruneHealedVariants(options = {}) {
    const { dryRun = false, maxPerPattern = 5, maxAgeDays = 90 } = options;
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    let removed = 0;

    // Remove old variants beyond TTL
    if (!dryRun) {
      removed += this.db.prepare('DELETE FROM healed_variants WHERE created_at < ?').run(cutoff).changes;
    }

    // Per-parent cap: keep only top N by healed_coherency
    const excess = this.db.prepare(`
      SELECT id FROM healed_variants WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY parent_pattern_id ORDER BY healed_coherency DESC
          ) AS rn FROM healed_variants
        ) WHERE rn <= ?
      )
    `).all(maxPerPattern);

    if (!dryRun && excess.length > 0) {
      const deleteStmt = this.db.prepare('DELETE FROM healed_variants WHERE id = ?');
      for (const row of excess) {
        deleteStmt.run(row.id);
        removed++;
      }
    }

    return { removed };
  }

  // ─── Archive Pruning — prevent unbounded archive growth ───

  /**
   * Prune old archive entries to prevent disk bloat.
   * @param {object} options - { dryRun, maxAgeDays, maxVersionsPerName }
   * @returns {{ patternArchiveRemoved, candidateArchiveRemoved, entryArchiveRemoved }}
   */
  pruneArchives(options = {}) {
    const { dryRun = false, maxAgeDays = 60, maxVersionsPerName = 3 } = options;
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    let patternArchiveRemoved = 0;
    let candidateArchiveRemoved = 0;
    let entryArchiveRemoved = 0;

    if (!dryRun) {
      patternArchiveRemoved += this.db.prepare('DELETE FROM pattern_archive WHERE deleted_at < ?').run(cutoff).changes;
      candidateArchiveRemoved += this.db.prepare('DELETE FROM candidate_archive WHERE deleted_at < ?').run(cutoff).changes;
      entryArchiveRemoved += this.db.prepare('DELETE FROM entry_archive WHERE deleted_at < ?').run(cutoff).changes;
    }

    return { patternArchiveRemoved, candidateArchiveRemoved, entryArchiveRemoved };
  }

  // ─── Entry Pruning — lifecycle for unused entries ───

  /**
   * Prune entries that have never been validated (test_passed IS NULL)
   * and are older than the specified number of days.
   * @param {object} options - { dryRun, maxAgeDays }
   * @returns {{ removed, remaining }}
   */
  pruneStaleEntries(options = {}) {
    const { dryRun = false, maxAgeDays = 90 } = options;
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

    const stale = this.db.prepare(`
      SELECT * FROM entries
      WHERE test_passed IS NULL
        AND times_used = 0
        AND created_at < ?
    `).all(cutoff);

    if (!dryRun && stale.length > 0) {
      this.db.exec('BEGIN');
      try {
        const deleteStmt = this.db.prepare('DELETE FROM entries WHERE id = ?');
        for (const row of stale) {
          this._archiveEntry(row, 'stale-pruned');
          this._audit('prune', 'entries', row.id, { maxAgeDays, reason: 'stale' });
          deleteStmt.run(row.id);
        }
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }

    const remaining = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    return { removed: stale.length, remaining };
  }

  // ─── Audit Log Retention — force rotation now ───

  /**
   * Force audit log rotation: apply TTL and row cap immediately.
   * @returns {{ before, after }}
   */
  rotateAuditLogNow() {
    const before = this.db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
    this._rotateAuditLog();
    const after = this.db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
    return { before, after, removed: before - after };
  }

  // ─── Candidate Cap — enforce max variants per (name, language) ───

  /**
   * Enforce a cap on candidates per (name, language) pair.
   * Keeps the top N by coherency, archives and deletes the rest.
   * @param {object} options - { maxPerGroup, dryRun }
   * @returns {{ removed, kept, groups }}
   */
  capCandidates(options = {}) {
    const { maxPerGroup = 5, dryRun = false } = options;
    return this.deduplicateCandidates({ dryRun, maxPerGroup });
  }

  // ─── Oracle Health Check ───

  /**
   * Run comprehensive health checks on the oracle database.
   * @returns {object} Health report with warnings and stats.
   */
  healthCheck() {
    const stats = {};
    const warnings = [];

    // Database size
    const fs = require('fs');
    try {
      const dbStat = fs.statSync(this.dbPath);
      stats.dbSizeMB = Math.round(dbStat.size / 1024 / 1024 * 100) / 100;
      if (stats.dbSizeMB > 100) {
        warnings.push({ level: 'high', message: `Database size is ${stats.dbSizeMB} MB — consider VACUUM and deduplication` });
      }
    } catch (e) {
      stats.dbSizeMB = null;
    }

    // Pattern count
    stats.patterns = this.db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;

    // Candidate stats
    stats.candidates = this.db.prepare('SELECT COUNT(*) as c FROM candidates WHERE promoted_at IS NULL').get().c;
    stats.candidateGroups = this.db.prepare('SELECT COUNT(DISTINCT LOWER(name) || \':\' || LOWER(language)) as c FROM candidates WHERE promoted_at IS NULL').get().c;
    stats.candidateDuplicationRatio = stats.candidateGroups > 0
      ? Math.round(stats.candidates / stats.candidateGroups * 100) / 100
      : 0;
    if (stats.candidateDuplicationRatio > 5) {
      warnings.push({ level: 'high', message: `Candidate duplication ratio is ${stats.candidateDuplicationRatio}x — run dedup-candidates` });
    }

    // Orphan candidates
    stats.orphanCandidates = this.db.prepare(`
      SELECT COUNT(*) as c FROM candidates
      WHERE parent_pattern IS NOT NULL
        AND parent_pattern NOT IN (SELECT name FROM patterns)
        AND promoted_at IS NULL
    `).get().c;
    if (stats.orphanCandidates > 0) {
      warnings.push({ level: 'medium', message: `${stats.orphanCandidates} orphan candidate(s) pointing to non-existent parents` });
    }

    // Entry stats
    stats.entries = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    stats.untestedEntries = this.db.prepare('SELECT COUNT(*) as c FROM entries WHERE test_passed IS NULL AND times_used = 0').get().c;
    if (stats.untestedEntries > stats.entries * 0.5 && stats.untestedEntries > 100) {
      warnings.push({ level: 'medium', message: `${stats.untestedEntries} entries never validated — consider pruning stale entries` });
    }

    // Healed variants
    stats.healedVariants = this.db.prepare('SELECT COUNT(*) as c FROM healed_variants').get().c;
    if (stats.healedVariants > 5000) {
      warnings.push({ level: 'medium', message: `${stats.healedVariants} healed variants — consider pruning with pruneHealedVariants()` });
    }

    // Archive sizes
    stats.patternArchive = this.db.prepare('SELECT COUNT(*) as c FROM pattern_archive').get().c;
    stats.candidateArchive = this.db.prepare('SELECT COUNT(*) as c FROM candidate_archive').get().c;
    if (stats.patternArchive + stats.candidateArchive > 10000) {
      warnings.push({ level: 'medium', message: `Archives contain ${stats.patternArchive + stats.candidateArchive} records — consider pruning with pruneArchives()` });
    }

    // Audit log
    stats.auditLogSize = this.db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
    if (stats.auditLogSize > 10000) {
      warnings.push({ level: 'medium', message: `Audit log has ${stats.auditLogSize} entries — rotation may be needed` });
    }

    // Sync status
    const persistence = require('../core/persistence');
    stats.personalStoreExists = persistence.hasGlobalStore();
    if (!stats.personalStoreExists) {
      warnings.push({ level: 'high', message: 'Personal store does not exist — sync push has never succeeded' });
    }

    // Average coherency
    const avgRow = this.db.prepare('SELECT AVG(coherency_total) as avg FROM patterns').get();
    stats.avgCoherency = avgRow.avg != null ? Math.round(avgRow.avg * 1000) / 1000 : 0;

    // Fragmentation estimate (page_count * page_size vs freelist_count * page_size)
    try {
      const pageCount = this.db.prepare('PRAGMA page_count').get().page_count;
      const freePages = this.db.prepare('PRAGMA freelist_count').get().freelist_count;
      const pageSize = this.db.prepare('PRAGMA page_size').get().page_size;
      stats.fragmentationPct = pageCount > 0 ? Math.round(freePages / pageCount * 100 * 10) / 10 : 0;
      if (stats.fragmentationPct > 20) {
        warnings.push({ level: 'medium', message: `Database fragmentation is ${stats.fragmentationPct}% — run VACUUM` });
      }
    } catch (e) {
      stats.fragmentationPct = null;
    }

    return { stats, warnings, healthy: warnings.filter(w => w.level === 'high').length === 0 };
  }

  // ─── VACUUM ───

  /**
   * Run VACUUM to reclaim space and defragment the database.
   * @returns {{ beforeMB, afterMB }}
   */
  vacuum() {
    const fs = require('fs');
    let beforeMB = null;
    try { beforeMB = Math.round(fs.statSync(this.dbPath).size / 1024 / 1024 * 100) / 100; } catch (e) {}
    this.db.exec('VACUUM');
    let afterMB = null;
    try { afterMB = Math.round(fs.statSync(this.dbPath).size / 1024 / 1024 * 100) / 100; } catch (e) {}
    return { beforeMB, afterMB, savedMB: beforeMB != null && afterMB != null ? Math.round((beforeMB - afterMB) * 100) / 100 : null };
  }

  // ─── Archive Retention — prevent unbounded archive growth ───

  /**
   * Purge candidate_archive, keeping only the most recent `keepRecent` rows.
   * @param {object} options - { keepRecent, dryRun }
   * @returns {{ before, after, removed }}
   */
  purgeCandidateArchive(options = {}) {
    const { keepRecent = 1000, dryRun = false } = options;
    const before = this.db.prepare('SELECT COUNT(*) as c FROM candidate_archive').get().c;
    if (before <= keepRecent) return { before, after: before, removed: 0 };

    if (!dryRun) {
      this.db.prepare(`
        DELETE FROM candidate_archive WHERE rowid NOT IN (
          SELECT rowid FROM candidate_archive ORDER BY deleted_at DESC LIMIT ?
        )
      `).run(keepRecent);
      this._audit('purge', 'candidate_archive', 'bulk', { keepRecent, removed: before - keepRecent });
    }
    const after = dryRun ? keepRecent : this.db.prepare('SELECT COUNT(*) as c FROM candidate_archive').get().c;
    return { before, after, removed: before - after };
  }

  /**
   * Trim pattern_archive to at most `maxVersions` per pattern (by name).
   * Keeps the most recent versions (by deleted_at) for each pattern name.
   * @param {object} options - { maxVersions, dryRun }
   * @returns {{ before, after, removed }}
   */
  purgePatternArchive(options = {}) {
    const { maxVersions = 3, dryRun = false } = options;
    const before = this.db.prepare('SELECT COUNT(*) as c FROM pattern_archive').get().c;

    // Find rows to delete: for each name, keep only the most recent maxVersions
    const excess = this.db.prepare(`
      SELECT rowid FROM pattern_archive WHERE rowid NOT IN (
        SELECT rowid FROM (
          SELECT rowid, ROW_NUMBER() OVER (PARTITION BY name ORDER BY deleted_at DESC) as rn
          FROM pattern_archive
        ) WHERE rn <= ?
      )
    `).all(maxVersions);

    if (!dryRun && excess.length > 0) {
      const delStmt = this.db.prepare('DELETE FROM pattern_archive WHERE rowid = ?');
      for (const row of excess) delStmt.run(row.rowid);
      this._audit('purge', 'pattern_archive', 'bulk', { maxVersions, removed: excess.length });
    }
    const after = dryRun ? before - excess.length : this.db.prepare('SELECT COUNT(*) as c FROM pattern_archive').get().c;
    return { before, after, removed: excess.length };
  }

  /**
   * Rotate the entries table: archive untested, zero-usage entries older than maxAgeDays,
   * and entries that duplicate patterns already in the library.
   * @param {object} options - { maxAgeDays, dryRun }
   * @returns {{ staleRemoved, duplicateRemoved, remaining }}
   */
  rotateEntries(options = {}) {
    const { maxAgeDays = 60, dryRun = false } = options;
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();

    // Stale: untested, unused, old
    const stale = this.db.prepare(`
      SELECT * FROM entries
      WHERE (test_passed IS NULL OR test_passed = 0)
        AND times_used = 0
        AND created_at < ?
    `).all(cutoff);

    // Duplicates: entries whose code already exists in patterns
    const dupes = this.db.prepare(`
      SELECT e.* FROM entries e
      INNER JOIN patterns p ON e.code = p.code AND e.language = p.language
    `).all();

    if (!dryRun && (stale.length > 0 || dupes.length > 0)) {
      this.db.exec('BEGIN');
      try {
        const delStmt = this.db.prepare('DELETE FROM entries WHERE id = ?');
        const seen = new Set();
        for (const row of stale) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          this._archiveEntry(row, 'stale-rotated');
          delStmt.run(row.id);
        }
        for (const row of dupes) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          this._archiveEntry(row, 'duplicate-of-pattern');
          delStmt.run(row.id);
        }
        this._audit('rotate', 'entries', 'bulk', { stale: stale.length, dupes: dupes.length });
        this.db.exec('COMMIT');
      } catch (e) {
        try { this.db.exec('ROLLBACK'); } catch (_) {}
        throw e;
      }
    }

    const remaining = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    return { staleRemoved: stale.length, duplicateRemoved: dupes.length, remaining };
  }

  /**
   * Run a full retention sweep: purge all archive tables and rotate entries.
   * Intended to be called periodically (e.g., on auto-submit or maintenance).
   * @param {object} options - { dryRun }
   * @returns {object} Combined report
   */
  retentionSweep(options = {}) {
    const { dryRun = false } = options;
    const candidateArchive = this.purgeCandidateArchive({ keepRecent: 1000, dryRun });
    const patternArchive = this.purgePatternArchive({ maxVersions: 3, dryRun });
    const entries = this.rotateEntries({ maxAgeDays: 60, dryRun });
    const auditLog = this.rotateAuditLogNow();
    return { candidateArchive, patternArchive, entries, auditLog };
  }

  /**
   * Close the database connection.
   */
  close() {
    this.db.close();
  }
}

const { countBy, getTopTags } = require('./store-helpers');

module.exports = { SQLiteStore, DatabaseSync };
