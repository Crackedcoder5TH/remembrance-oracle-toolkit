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
    this.storeDir = path.join(baseDir, DEFAULT_STORE_DIR);
    this.dbPath = path.join(this.storeDir, DB_FILE);
    this._ensureDir();
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
    this.db.exec(`PRAGMA busy_timeout = 5000`);

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

    // Schema migration: add composition columns
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN requires TEXT DEFAULT '[]'`); } catch {}
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN composed_of TEXT DEFAULT '[]'`); } catch {}

    // Schema migration: add bug reports column for reliability tracking
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN bug_reports INTEGER DEFAULT 0`); } catch {}

    // Schema migration: add votes columns for community voting
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN upvotes INTEGER DEFAULT 0`); } catch {}
    try { this.db.exec(`ALTER TABLE patterns ADD COLUMN downvotes INTEGER DEFAULT 0`); } catch {}

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
    try { this.db.exec(`ALTER TABLE votes ADD COLUMN weight REAL DEFAULT 1.0`); } catch {}

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
        }
        // Rename old file so migration doesn't re-run
        fs.renameSync(historyPath, historyPath + '.migrated');
      } catch {
        // Migration is best-effort
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
          for (const p of data.patterns) {
            insert.run(
              p.id, p.name, p.code, p.language || 'unknown',
              p.patternType || 'utility', p.complexity || 'composite',
              p.description || '', JSON.stringify(p.tags || []),
              p.coherencyScore?.total ?? 0, JSON.stringify(p.coherencyScore || {}),
              JSON.stringify(p.variants || []), p.testCode || null,
              p.usageCount || 0, p.successCount || 0,
              JSON.stringify(p.evolutionHistory || []),
              p.createdAt || new Date().toISOString(), p.updatedAt || new Date().toISOString()
            );
          }
        }
        fs.renameSync(patternsPath, patternsPath + '.migrated');
      } catch {
        // Migration is best-effort
      }
    }
  }

  // ─── Hash helper ───

  _hash(input) {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
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
      detail: JSON.parse(r.detail || '{}'), actor: r.actor,
    }));
  }

  // ─── Entry (history) methods — same interface as VerifiedHistoryStore ───

  addEntry(entry) {
    const id = this._hash(entry.code + Date.now().toString());
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

  recordEntryUsage(id, succeeded) {
    const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!row) return null;

    const timesUsed = row.times_used + 1;
    const timesSucceeded = row.times_succeeded + (succeeded ? 1 : 0);
    const historicalScore = timesUsed > 0 ? timesSucceeded / timesUsed : 0.5;
    const version = (row.version || 1) + 1;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE entries SET times_used = ?, times_succeeded = ?, historical_score = ?,
        version = ?, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(timesUsed, timesSucceeded, historicalScore, version, now, id, row.version || 1);

    this._audit('usage', 'entries', id, { succeeded, timesUsed, historicalScore });
    return this._rowToEntry(this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
  }

  pruneEntries(minCoherency = 0.4) {
    const before = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    const pruned = this.db.prepare('SELECT id FROM entries WHERE coherency_total < ?').all(minCoherency);
    this.db.prepare('DELETE FROM entries WHERE coherency_total < ?').run(minCoherency);
    const after = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    for (const { id } of pruned) {
      this._audit('prune', 'entries', id, { minCoherency });
    }
    return { removed: before - after, remaining: after };
  }

  entrySummary() {
    const entries = this.getAllEntries();
    return {
      totalEntries: entries.length,
      languages: [...new Set(entries.map(e => e.language))],
      avgCoherency: entries.length > 0
        ? Math.round(entries.reduce((s, e) => s + (e.coherencyScore?.total ?? 0), 0) / entries.length * 1000) / 1000
        : 0,
      topTags: getTopTags(entries, 10),
    };
  }

  _rowToEntry(row) {
    return {
      id: row.id,
      code: row.code,
      language: row.language,
      description: row.description,
      tags: JSON.parse(row.tags || '[]'),
      author: row.author,
      coherencyScore: JSON.parse(row.coherency_json || '{}'),
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Pattern methods — same interface as PatternLibrary ───

  addPattern(pattern) {
    const id = this._hash(pattern.code + pattern.name + Date.now());
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO patterns (id, name, code, language, pattern_type, complexity,
        description, tags, coherency_total, coherency_json, variants, test_code,
        usage_count, success_count, evolution_history, requires, composed_of,
        version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '[]', ?, ?, 1, ?, ?)
    `).run(
      id, pattern.name, pattern.code, pattern.language || 'unknown',
      pattern.patternType || 'utility', pattern.complexity || 'composite',
      pattern.description || '', JSON.stringify(pattern.tags || []),
      pattern.coherencyScore?.total ?? 0, JSON.stringify(pattern.coherencyScore || {}),
      JSON.stringify(pattern.variants || []), pattern.testCode || null,
      JSON.stringify(pattern.requires || []), JSON.stringify(pattern.composedOf || []),
      now, now
    );

    this._audit('add', 'patterns', id, {
      name: pattern.name, language: pattern.language,
      coherency: pattern.coherencyScore?.total,
    });

    return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id));
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
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db.prepare(`UPDATE patterns SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id));
  }

  recordPatternUsage(id, succeeded) {
    const row = this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
    if (!row) return null;

    const usageCount = row.usage_count + 1;
    const successCount = row.success_count + (succeeded ? 1 : 0);
    const version = (row.version || 1) + 1;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE patterns SET usage_count = ?, success_count = ?, version = ?, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(usageCount, successCount, version, now, id, row.version || 1);

    this._audit('usage', 'patterns', id, { succeeded, usageCount, successCount });
    return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id));
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

    const voteVal = vote > 0 ? 1 : -1;
    const now = new Date().toISOString();
    const weight = this.getVoteWeight(voter);

    // Ensure voter profile exists and update stats
    const voterProfile = this.getVoter(voter);
    this.db.prepare('UPDATE voters SET total_votes = total_votes + 1, updated_at = ? WHERE id = ?').run(now, voter);

    // Check for existing vote
    const existing = this.db.prepare('SELECT * FROM votes WHERE pattern_id = ? AND voter = ?').get(patternId, voter);
    if (existing) {
      if (existing.vote === voteVal) {
        return { success: false, error: 'Already voted' };
      }
      // Change vote direction
      this.db.prepare('UPDATE votes SET vote = ?, weight = ?, created_at = ? WHERE id = ?').run(voteVal, weight, now, existing.id);
      if (voteVal === 1) {
        this.db.prepare('UPDATE patterns SET upvotes = upvotes + 1, downvotes = MAX(0, downvotes - 1) WHERE id = ?').run(patternId);
      } else {
        this.db.prepare('UPDATE patterns SET downvotes = downvotes + 1, upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(patternId);
      }
    } else {
      const id = require('crypto').randomUUID();
      this.db.prepare('INSERT INTO votes (id, pattern_id, voter, vote, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, patternId, voter, voteVal, weight, now);
      if (voteVal === 1) {
        this.db.prepare('UPDATE patterns SET upvotes = upvotes + 1 WHERE id = ?').run(patternId);
      } else {
        this.db.prepare('UPDATE patterns SET downvotes = downvotes + 1 WHERE id = ?').run(patternId);
      }
    }

    this._audit('vote', 'patterns', patternId, { voter, vote: voteVal, weight });
    const updated = this.db.prepare('SELECT upvotes, downvotes FROM patterns WHERE id = ?').get(patternId);
    const upvotes = updated.upvotes || 0;
    const downvotes = updated.downvotes || 0;
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
    const upvotes = row.upvotes || 0;
    const downvotes = row.downvotes || 0;

    // Calculate weighted score from individual votes
    const votes = this.db.prepare('SELECT vote, weight FROM votes WHERE pattern_id = ?').all(patternId);
    let weightedScore = 0;
    for (const v of votes) {
      weightedScore += v.vote * (v.weight || 1.0);
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
    const votes = this.db.prepare('SELECT voter, vote FROM votes WHERE pattern_id = ?').all(patternId);
    const now = new Date().toISOString();

    for (const v of votes) {
      const voter = this.getVoter(v.voter);
      let delta = 0;
      if (succeeded && v.vote === 1) {
        // Upvoted a pattern that succeeded — good judgment
        delta = 0.05;
      } else if (!succeeded && v.vote === -1) {
        // Downvoted a pattern that failed — good judgment
        delta = 0.05;
      } else if (succeeded && v.vote === -1) {
        // Downvoted a pattern that succeeded — poor judgment
        delta = -0.03;
      } else if (!succeeded && v.vote === 1) {
        // Upvoted a pattern that failed — poor judgment
        delta = -0.03;
      }

      if (delta !== 0) {
        const newRep = Math.min(3.0, Math.max(0.1, voter.reputation + delta));
        const accurate = delta > 0 ? voter.accurate_votes + 1 : voter.accurate_votes;
        this.db.prepare('UPDATE voters SET reputation = ?, accurate_votes = ?, updated_at = ? WHERE id = ?')
          .run(Math.round(newRep * 1000) / 1000, accurate, now, v.voter);
      }
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
    const rows = this.db.prepare('SELECT * FROM patterns').all();
    let retired = 0;
    for (const row of rows) {
      const coherency = row.coherency_total;
      const reliability = row.usage_count > 0 ? row.success_count / row.usage_count : 0.5;
      const composite = coherency * 0.6 + reliability * 0.4;
      if (composite < minScore) {
        this.db.prepare('DELETE FROM patterns WHERE id = ?').run(row.id);
        this._audit('retire', 'patterns', row.id, {
          name: row.name, coherency, reliability, composite,
        });
        retired++;
      }
    }
    const remaining = this.db.prepare('SELECT COUNT(*) as c FROM patterns').get().c;
    return { retired, remaining };
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
      tags: JSON.parse(row.tags || '[]'),
      coherencyScore: JSON.parse(row.coherency_json || '{}'),
      variants: JSON.parse(row.variants || '[]'),
      testCode: row.test_code,
      usageCount: row.usage_count,
      successCount: row.success_count,
      evolutionHistory: JSON.parse(row.evolution_history || '[]'),
      requires: JSON.parse(row.requires || '[]'),
      composedOf: JSON.parse(row.composed_of || '[]'),
      bugReports: row.bug_reports || 0,
      upvotes: row.upvotes || 0,
      downvotes: row.downvotes || 0,
      voteScore: (row.upvotes || 0) - (row.downvotes || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  _patternFieldToCol(field) {
    const map = {
      usageCount: 'usage_count', successCount: 'success_count',
      evolutionHistory: 'evolution_history', patternType: 'pattern_type',
      coherencyScore: 'coherency_json', coherencyTotal: 'coherency_total',
      testCode: 'test_code', tags: 'tags', description: 'description',
      updatedAt: 'updated_at', requires: 'requires', composedOf: 'composed_of',
      bugReports: 'bug_reports', code: 'code',
    };
    return map[field] || null;
  }

  // ─── Candidate methods — coherent-but-unproven patterns ───

  addCandidate(candidate) {
    const id = this._hash(candidate.code + candidate.name + Date.now());
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO candidates (id, name, code, language, pattern_type, complexity,
        description, tags, coherency_total, coherency_json, test_code,
        parent_pattern, generation_method, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, candidate.name, candidate.code, candidate.language || 'unknown',
      candidate.patternType || 'utility', candidate.complexity || 'composite',
      candidate.description || '', JSON.stringify(candidate.tags || []),
      candidate.coherencyTotal ?? 0, JSON.stringify(candidate.coherencyScore || {}),
      candidate.testCode || null,
      candidate.parentPattern || null, candidate.generationMethod || 'variant',
      now, now
    );

    this._audit('add', 'candidates', id, {
      name: candidate.name, language: candidate.language,
      coherency: candidate.coherencyTotal, parent: candidate.parentPattern,
      method: candidate.generationMethod,
    });

    return this._rowToCandidate(this.db.prepare('SELECT * FROM candidates WHERE id = ?').get(id));
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
    const pruned = this.db.prepare('SELECT id FROM candidates WHERE promoted_at IS NULL AND coherency_total < ?').all(minCoherency);
    this.db.prepare('DELETE FROM candidates WHERE promoted_at IS NULL AND coherency_total < ?').run(minCoherency);
    const after = this.db.prepare('SELECT COUNT(*) as c FROM candidates WHERE promoted_at IS NULL').get().c;
    for (const { id } of pruned) {
      this._audit('prune', 'candidates', id, { minCoherency });
    }
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
      tags: JSON.parse(row.tags || '[]'),
      coherencyTotal: row.coherency_total,
      coherencyScore: JSON.parse(row.coherency_json || '{}'),
      testCode: row.test_code,
      parentPattern: row.parent_pattern,
      generationMethod: row.generation_method,
      promotedAt: row.promoted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
    const current = parseInt(this.getMeta('decisions') || '0', 10);
    this.setMeta('decisions', current + 1);
    return current + 1;
  }

  /**
   * Close the database connection.
   */
  close() {
    this.db.close();
  }
}

// ─── Helpers ───

function getTopTags(entries, limit) {
  const counts = {};
  for (const e of entries) {
    for (const tag of e.tags) {
      const t = tag.toLowerCase();
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const val = item[key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

module.exports = { SQLiteStore, DatabaseSync };
