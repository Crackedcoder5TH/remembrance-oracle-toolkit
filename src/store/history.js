/**
 * Verified Code History Store
 *
 * Persistent JSON file that stores ONLY code that has proven itself.
 * Each entry includes:
 * - The code itself
 * - Coherency score breakdown
 * - Validation proof (test results)
 * - Metadata (language, tags, description, author)
 * - Timestamps and version tracking
 *
 * Storage file: .remembrance/verified-history.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_STORE_DIR = '.remembrance';
const HISTORY_FILE = 'verified-history.json';

class VerifiedHistoryStore {
  constructor(baseDir = process.cwd()) {
    this.storeDir = path.join(baseDir, DEFAULT_STORE_DIR);
    this.historyPath = path.join(this.storeDir, HISTORY_FILE);
    this._ensureStore();
  }

  _ensureStore() {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyPath)) {
      this._write({ entries: [], meta: { created: new Date().toISOString(), version: 1 } });
    }
  }

  _read() {
    const raw = fs.readFileSync(this.historyPath, 'utf-8');
    return JSON.parse(raw);
  }

  _write(data) {
    fs.writeFileSync(this.historyPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _hash(code) {
    return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
  }

  /**
   * Add a verified code entry to the store.
   * Only call this AFTER validation passes.
   */
  add(entry) {
    const data = this._read();
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
    this._write(data);
    return record;
  }

  /**
   * Get all entries, optionally filtered.
   */
  getAll(filters = {}) {
    const data = this._read();
    let entries = data.entries;

    if (filters.language) {
      entries = entries.filter(e =>
        e.language.toLowerCase() === filters.language.toLowerCase()
      );
    }
    if (filters.minCoherency != null) {
      entries = entries.filter(e =>
        (e.coherencyScore?.total ?? 0) >= filters.minCoherency
      );
    }
    if (filters.tags && filters.tags.length > 0) {
      const filterTags = new Set(filters.tags.map(t => t.toLowerCase()));
      entries = entries.filter(e =>
        e.tags.some(t => filterTags.has(t.toLowerCase()))
      );
    }

    return entries;
  }

  /**
   * Get a single entry by ID.
   */
  get(id) {
    const data = this._read();
    return data.entries.find(e => e.id === id) || null;
  }

  /**
   * Record that a snippet was used and whether it succeeded.
   * This updates the historical reliability score.
   */
  recordUsage(id, succeeded) {
    const data = this._read();
    const entry = data.entries.find(e => e.id === id);
    if (!entry) return null;

    entry.reliability.timesUsed += 1;
    if (succeeded) entry.reliability.timesSucceeded += 1;
    entry.reliability.historicalScore =
      entry.reliability.timesUsed > 0
        ? entry.reliability.timesSucceeded / entry.reliability.timesUsed
        : 0.5;
    entry.updatedAt = new Date().toISOString();

    this._write(data);
    return entry;
  }

  /**
   * Remove entries below a coherency threshold (cleanup).
   */
  prune(minCoherency = 0.4) {
    const data = this._read();
    const before = data.entries.length;
    data.entries = data.entries.filter(e =>
      (e.coherencyScore?.total ?? 0) >= minCoherency
    );
    this._write(data);
    return { removed: before - data.entries.length, remaining: data.entries.length };
  }

  /**
   * Export the store as a summary (for sharing/README generation).
   */
  summary() {
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

module.exports = { VerifiedHistoryStore, DEFAULT_STORE_DIR, HISTORY_FILE };
