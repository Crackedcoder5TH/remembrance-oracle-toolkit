/**
 * Verified Code History Store
 *
 * Persistent store for code that has PROVEN itself (passed validation + coherency).
 *
 * Backend: SQLite (Node 22+ built-in) when available, falls back to flat JSON.
 *
 * Each entry includes:
 * - The code itself
 * - Coherency score breakdown
 * - Validation proof (test results)
 * - Metadata (language, tags, description, author)
 * - Timestamps and reliability tracking
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STORE_DIR = '.remembrance';
const HISTORY_FILE = 'verified-history.json';

/**
 * Try to load SQLiteStore. Returns null if node:sqlite unavailable.
 */
function tryLoadSQLite() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (DatabaseSync) {
      const { SQLiteStore } = require('./sqlite');
      return SQLiteStore;
    }
  } catch (err) { if (process.env.ORACLE_DEBUG) console.error('[history]', err.message); }
  return null;
}

class VerifiedHistoryStore {
  constructor(baseDir = process.cwd()) {
    this.storeDir = path.join(baseDir, DEFAULT_STORE_DIR);
    this._backend = 'json'; // default

    const SQLiteStoreClass = tryLoadSQLite();
    if (SQLiteStoreClass) {
      try {
        // Shared SQLite instance — keyed by storeDir
        if (!VerifiedHistoryStore._sqliteInstances) {
          VerifiedHistoryStore._sqliteInstances = new Map();
        }
        if (VerifiedHistoryStore._sqliteInstances.has(this.storeDir)) {
          this._sqlite = VerifiedHistoryStore._sqliteInstances.get(this.storeDir);
        } else {
          this._sqlite = new SQLiteStoreClass(baseDir);
          VerifiedHistoryStore._sqliteInstances.set(this.storeDir, this._sqlite);
        }
        this._backend = 'sqlite';
      } catch {
        this._ensureJSONStore();
      }
    } else {
      this._ensureJSONStore();
    }
  }

  get backend() { return this._backend; }

  // ─── JSON fallback methods ───

  _ensureJSONStore() {
    this.historyPath = path.join(this.storeDir, HISTORY_FILE);
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyPath)) {
      this._writeJSON({ entries: [], meta: { created: new Date().toISOString(), version: 1 } });
    }
  }

  _readJSON() {
    return JSON.parse(fs.readFileSync(this.historyPath, 'utf-8'));
  }

  _writeJSON(data) {
    fs.writeFileSync(this.historyPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _hash(code) {
    return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
  }

  // ─── Public API ───

  add(entry) {
    if (this._backend === 'sqlite') {
      return this._sqlite.addEntry(entry);
    }
    return this._addJSON(entry);
  }

  getAll(filters = {}) {
    if (this._backend === 'sqlite') {
      return this._sqlite.getAllEntries(filters);
    }
    return this._getAllJSON(filters);
  }

  get(id) {
    if (this._backend === 'sqlite') {
      return this._sqlite.getEntry(id);
    }
    return this._getJSON(id);
  }

  recordUsage(id, succeeded) {
    if (this._backend === 'sqlite') {
      return this._sqlite.recordEntryUsage(id, succeeded);
    }
    return this._recordUsageJSON(id, succeeded);
  }

  prune(minCoherency = 0.4) {
    if (this._backend === 'sqlite') {
      return this._sqlite.pruneEntries(minCoherency);
    }
    return this._pruneJSON(minCoherency);
  }

  summary() {
    if (this._backend === 'sqlite') {
      return this._sqlite.entrySummary();
    }
    return this._summaryJSON();
  }

  /**
   * Get the shared SQLite store instance (for PatternLibrary to share).
   */
  getSQLiteStore() {
    return this._sqlite || null;
  }

  // ─── JSON implementations (fallback) ───

  _addJSON(entry) {
    const data = this._readJSON();
    const id = this._hash(entry.code + Date.now().toString());
    const record = {
      id,
      code: entry.code,
      language: entry.language || 'unknown',
      description: entry.description || '',
      tags: entry.tags || [],
      author: entry.author || 'anonymous',
      coherencyScore: entry.coherencyScore,
      validation: {
        testPassed: entry.testPassed ?? null,
        testOutput: entry.testOutput || null,
        validatedAt: new Date().toISOString(),
      },
      reliability: {
        timesUsed: 0,
        timesSucceeded: 0,
        historicalScore: 1.0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.entries.push(record);
    this._writeJSON(data);
    return record;
  }

  _getAllJSON(filters = {}) {
    const data = this._readJSON();
    let entries = data.entries;
    if (filters.language) {
      entries = entries.filter(e => e.language.toLowerCase() === filters.language.toLowerCase());
    }
    if (filters.minCoherency != null) {
      entries = entries.filter(e => (e.coherencyScore?.total ?? 0) >= filters.minCoherency);
    }
    if (filters.tags && filters.tags.length > 0) {
      const filterTags = new Set(filters.tags.map(t => t.toLowerCase()));
      entries = entries.filter(e => e.tags.some(t => filterTags.has(t.toLowerCase())));
    }
    return entries;
  }

  _getJSON(id) {
    const data = this._readJSON();
    return data.entries.find(e => e.id === id) || null;
  }

  _recordUsageJSON(id, succeeded) {
    const data = this._readJSON();
    const entry = data.entries.find(e => e.id === id);
    if (!entry) return null;
    entry.reliability.timesUsed += 1;
    if (succeeded) entry.reliability.timesSucceeded += 1;
    entry.reliability.historicalScore =
      entry.reliability.timesUsed > 0
        ? entry.reliability.timesSucceeded / entry.reliability.timesUsed
        : 0.5;
    entry.updatedAt = new Date().toISOString();
    this._writeJSON(data);
    return entry;
  }

  _pruneJSON(minCoherency = 0.4) {
    const data = this._readJSON();
    const before = data.entries.length;
    data.entries = data.entries.filter(e => (e.coherencyScore?.total ?? 0) >= minCoherency);
    this._writeJSON(data);
    return { removed: before - data.entries.length, remaining: data.entries.length };
  }

  _summaryJSON() {
    const entries = this.getAll();
    return {
      totalEntries: entries.length,
      languages: [...new Set(entries.map(e => e.language))],
      avgCoherency: entries.length > 0
        ? Math.round(entries.reduce((s, e) => s + (e.coherencyScore?.total ?? 0), 0) / entries.length * 1000) / 1000
        : 0,
      topTags: getTopTags(entries, 10),
    };
  }
}

const { getTopTags } = require('./store-helpers');

module.exports = { VerifiedHistoryStore, DEFAULT_STORE_DIR, HISTORY_FILE };
