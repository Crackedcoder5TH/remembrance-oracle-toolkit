'use strict';

/**
 * Unified Oracle storage interface.
 *
 * Every subsystem (audit baseline, audit feedback, audit history, pattern
 * library, healing lineage, covenant cache, debug-oracle quantum field,
 * etc.) currently reaches for its own file path under `.remembrance/`.
 * That led to the backend-mismatch bug class I spent most of a session
 * fixing — different subsystems picked different backends for the same
 * repo and each saw an empty store.
 *
 * This module centralizes storage behind a single interface:
 *
 *   const storage = createStorage(repoRoot);
 *   const audit = storage.namespace('audit');
 *   audit.set('baseline', { ... });
 *   audit.get('baseline');
 *   audit.append('history', { at, total });
 *
 * Two backends are supported today:
 *
 *   json     → one file per key under `.remembrance/<namespace>/<key>.json`
 *   sqlite   → rows in a `oracle_storage` table keyed by (namespace, key)
 *
 * Backend selection:
 *
 *   1. Explicit via `createStorage(root, { backend })`
 *   2. Env: `ORACLE_STORAGE_BACKEND=json|sqlite`
 *   3. Auto: sqlite if node:sqlite is available AND a `.remembrance/`
 *      exists with a `*.db` file, else json.
 *
 * The interface guarantees:
 *
 *   - Atomic writes (tmp + rename for JSON; transactions for sqlite)
 *   - Namespace isolation (no collisions between subsystems)
 *   - Consistent shape: get(key, fallback), set(key, value), delete(key),
 *     all(), keys(), append(key, entry), list(keyPrefix)
 *   - Serializable: everything passes through JSON.stringify/parse, so
 *     both backends store the same payloads
 */

const fs = require('fs');
const path = require('path');

const BACKEND_JSON = 'json';
const BACKEND_SQLITE = 'sqlite';

// ─── Public factory ─────────────────────────────────────────────────────────

function createStorage(repoRoot, options = {}) {
  const backend = pickBackend(repoRoot, options);
  if (backend === BACKEND_SQLITE) {
    try { return new SqliteStorage(repoRoot, options); }
    catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[storage] sqlite init failed, falling back to json:', e?.message || e);
    }
  }
  return new JsonStorage(repoRoot, options);
}

function pickBackend(repoRoot, options) {
  if (options.backend) return options.backend;
  const env = (process.env.ORACLE_STORAGE_BACKEND || '').toLowerCase();
  if (env === BACKEND_JSON || env === BACKEND_SQLITE) return env;
  // Auto: prefer sqlite if a .db already lives under .remembrance
  try {
    const dir = path.join(repoRoot, '.remembrance');
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      if (entries.some(e => e.endsWith('.db'))) return BACKEND_SQLITE;
    }
  } catch { /* ignore */ }
  return BACKEND_JSON;
}

// ─── Base namespace handle ──────────────────────────────────────────────────

class StorageNamespace {
  constructor(storage, name) {
    this.storage = storage;
    this.name = name;
  }
  get(key, fallback) { return this.storage._get(this.name, key, fallback); }
  set(key, value)    { return this.storage._set(this.name, key, value); }
  delete(key)        { return this.storage._delete(this.name, key); }
  keys()             { return this.storage._keys(this.name); }
  all()              { return this.storage._all(this.name); }
  append(key, entry) { return this.storage._append(this.name, key, entry); }
  list(keyPrefix)    { return this.storage._list(this.name, keyPrefix); }
}

// ─── JSON backend ───────────────────────────────────────────────────────────

class JsonStorage {
  constructor(repoRoot, options = {}) {
    this.repoRoot = repoRoot;
    this.baseDir = options.baseDir || path.join(repoRoot, '.remembrance');
    this.backend = BACKEND_JSON;
  }

  namespace(name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new TypeError(`invalid namespace: ${name}`);
    return new StorageNamespace(this, name);
  }

  _nsDir(namespace) {
    return path.join(this.baseDir, namespace);
  }
  _pathFor(namespace, key) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new TypeError(`invalid key: ${key}`);
    return path.join(this._nsDir(namespace), `${key}.json`);
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _get(namespace, key, fallback) {
    const p = this._pathFor(namespace, key);
    if (!fs.existsSync(p)) return fallback === undefined ? null : fallback;
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
    catch { return fallback === undefined ? null : fallback; }
  }

  _set(namespace, key, value) {
    const p = this._pathFor(namespace, key);
    this._ensureDir(path.dirname(p));
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, p);
    return true;
  }

  _delete(namespace, key) {
    const p = this._pathFor(namespace, key);
    if (fs.existsSync(p)) { fs.unlinkSync(p); return true; }
    return false;
  }

  _keys(namespace) {
    const dir = this._nsDir(namespace);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => f.slice(0, -5));
  }

  _all(namespace) {
    const out = {};
    for (const k of this._keys(namespace)) out[k] = this._get(namespace, k);
    return out;
  }

  _append(namespace, key, entry) {
    // Append-only line log: one JSON object per line.
    const p = this._pathFor(namespace, key + '.log');
    this._ensureDir(path.dirname(p));
    const line = JSON.stringify({ ...entry, _at: entry._at || new Date().toISOString() });
    fs.appendFileSync(p, line + '\n', 'utf-8');
    return true;
  }

  _list(namespace, keyPrefix) {
    if (!keyPrefix) return this._keys(namespace);
    return this._keys(namespace).filter(k => k.startsWith(keyPrefix));
  }
}

// ─── SQLite backend ─────────────────────────────────────────────────────────

class SqliteStorage {
  constructor(repoRoot, options = {}) {
    this.repoRoot = repoRoot;
    this.backend = BACKEND_SQLITE;
    const { DatabaseSync } = require('node:sqlite');
    const baseDir = options.baseDir || path.join(repoRoot, '.remembrance');
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    const dbPath = options.dbPath || path.join(baseDir, 'oracle.db');
    this.db = new DatabaseSync(dbPath);
    this._initSchema();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oracle_storage (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace, key)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oracle_storage_log (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        entry TEXT NOT NULL,
        at TEXT NOT NULL
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_oracle_storage_log_ns_key ON oracle_storage_log(namespace, key, at)`);
  }

  namespace(name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new TypeError(`invalid namespace: ${name}`);
    return new StorageNamespace(this, name);
  }

  _get(namespace, key, fallback) {
    const row = this.db.prepare('SELECT value FROM oracle_storage WHERE namespace = ? AND key = ?').get(namespace, key);
    if (!row) return fallback === undefined ? null : fallback;
    try { return JSON.parse(row.value); }
    catch { return fallback === undefined ? null : fallback; }
  }

  _set(namespace, key, value) {
    const now = new Date().toISOString();
    const json = JSON.stringify(value);
    this.db.prepare(`
      INSERT INTO oracle_storage (namespace, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(namespace, key, json, now);
    return true;
  }

  _delete(namespace, key) {
    const r = this.db.prepare('DELETE FROM oracle_storage WHERE namespace = ? AND key = ?').run(namespace, key);
    return r.changes > 0;
  }

  _keys(namespace) {
    const rows = this.db.prepare('SELECT key FROM oracle_storage WHERE namespace = ? ORDER BY key').all(namespace);
    return rows.map(r => r.key);
  }

  _all(namespace) {
    const out = {};
    for (const k of this._keys(namespace)) out[k] = this._get(namespace, k);
    return out;
  }

  _append(namespace, key, entry) {
    const at = entry._at || new Date().toISOString();
    const json = JSON.stringify({ ...entry, _at: at });
    this.db.prepare('INSERT INTO oracle_storage_log (namespace, key, entry, at) VALUES (?, ?, ?, ?)').run(namespace, key, json, at);
    return true;
  }

  _list(namespace, keyPrefix) {
    if (!keyPrefix) return this._keys(namespace);
    const rows = this.db.prepare('SELECT key FROM oracle_storage WHERE namespace = ? AND key LIKE ? ORDER BY key').all(namespace, keyPrefix + '%');
    return rows.map(r => r.key);
  }
}

// ─── Process-level singleton ────────────────────────────────────────────────
//
// Many subsystems just want "the storage for cwd". We memoize a single
// instance per (repoRoot, backend) tuple so they don't each open their
// own database handle.

const _cache = new Map();

function getStorage(repoRoot, options = {}) {
  const root = repoRoot || process.cwd();
  const key = `${root}::${options.backend || 'auto'}`;
  if (_cache.has(key)) return _cache.get(key);
  const storage = createStorage(root, options);
  _cache.set(key, storage);
  return storage;
}

function resetStorageCache() { _cache.clear(); }

module.exports = {
  createStorage,
  getStorage,
  resetStorageCache,
  JsonStorage,
  SqliteStorage,
  BACKEND_JSON,
  BACKEND_SQLITE,
};
