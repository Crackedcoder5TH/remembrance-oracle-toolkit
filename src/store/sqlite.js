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
    `);

    // Initialize meta if not present
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('version');
    if (!row) {
      const stmt = this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
      stmt.run('version', '2');
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

  // ─── Entry (history) methods — same interface as VerifiedHistoryStore ───

  addEntry(entry) {
    const id = this._hash(entry.code + Date.now().toString());
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO entries (id, code, language, description, tags, author,
        coherency_total, coherency_json, test_passed, test_output, validated_at,
        times_used, times_succeeded, historical_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1.0, ?, ?)
    `).run(
      id, entry.code, entry.language || 'unknown', entry.description || '',
      JSON.stringify(entry.tags || []), entry.author || 'anonymous',
      entry.coherencyScore?.total ?? 0, JSON.stringify(entry.coherencyScore || {}),
      entry.testPassed == null ? null : (entry.testPassed ? 1 : 0),
      entry.testOutput || null, now, now, now
    );

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
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE entries SET times_used = ?, times_succeeded = ?, historical_score = ?, updated_at = ?
      WHERE id = ?
    `).run(timesUsed, timesSucceeded, historicalScore, now, id);

    return this._rowToEntry(this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id));
  }

  pruneEntries(minCoherency = 0.4) {
    const before = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
    this.db.prepare('DELETE FROM entries WHERE coherency_total < ?').run(minCoherency);
    const after = this.db.prepare('SELECT COUNT(*) as c FROM entries').get().c;
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
        usage_count, success_count, evolution_history, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '[]', ?, ?)
    `).run(
      id, pattern.name, pattern.code, pattern.language || 'unknown',
      pattern.patternType || 'utility', pattern.complexity || 'composite',
      pattern.description || '', JSON.stringify(pattern.tags || []),
      pattern.coherencyScore?.total ?? 0, JSON.stringify(pattern.coherencyScore || {}),
      JSON.stringify(pattern.variants || []), pattern.testCode || null,
      now, now
    );

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
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE patterns SET usage_count = ?, success_count = ?, updated_at = ? WHERE id = ?
    `).run(usageCount, successCount, now, id);

    return this._rowToPattern(this.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id));
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
      updatedAt: 'updated_at',
    };
    return map[field] || null;
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
