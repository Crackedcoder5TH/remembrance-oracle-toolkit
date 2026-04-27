'use strict';

/**
 * Pattern lookup by canonical coh:// URI.
 *
 * Both `patterns` (oracle's native table) and `void_patterns` (the bridge
 * table populated by ingest-void-patterns.js) are searched. Returns the
 * first hit with the source repo identified.
 *
 * Lookup strategies, in order:
 *   1. Exact URI match (with #h: pin)
 *   2. Same-base match: ignore #h: and @v suffix; match the
 *      coh://<repo>/<domain>/<path> part. Useful for "this URI but the
 *      latest content version"
 *   3. None — return null
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { parseUri, validate } = require('./coherency-uri');

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../.remembrance/oracle.db');

function _baseOf(uri) {
  return uri.split('#')[0].split('@')[0];
}

class PatternUriLookup {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.db = new DatabaseSync(dbPath, { readonly: true });
    this._stmt_exact_pat = this.db.prepare(
      `SELECT id, name, language, code, coherency_total, uri
       FROM patterns WHERE uri = ? LIMIT 1`
    );
    this._stmt_exact_void = this.db.prepare(
      `SELECT uri, name, module, language, source, coherency_unified
       FROM void_patterns WHERE uri = ? LIMIT 1`
    );
    this._stmt_base_pat = this.db.prepare(
      `SELECT id, name, language, code, coherency_total, uri
       FROM patterns
       WHERE substr(uri, 1, ?) = ? LIMIT 1`
    );
    this._stmt_base_void = this.db.prepare(
      `SELECT uri, name, module, language, source, coherency_unified
       FROM void_patterns
       WHERE substr(uri, 1, ?) = ? LIMIT 1`
    );
  }

  /**
   * Look up a pattern by URI. Returns
   *   { source: 'oracle' | 'void', uri, ...row }
   * on hit, null on miss.
   */
  lookup(uri) {
    if (!uri || !validate(uri)) return null;

    let r = this._stmt_exact_pat.get(uri);
    if (r) return { source: 'oracle', ...r };
    r = this._stmt_exact_void.get(uri);
    if (r) return { source: 'void', ...r };

    const base = _baseOf(uri);
    const baseLen = base.length;
    r = this._stmt_base_pat.get(baseLen, base);
    if (r) return { source: 'oracle', ...r };
    r = this._stmt_base_void.get(baseLen, base);
    if (r) return { source: 'void', ...r };
    return null;
  }

  /** Return URIs for every pattern in either table — both oracle/* and void/*. */
  listAll() {
    const oracleUris = this.db.prepare(`SELECT uri FROM patterns WHERE uri IS NOT NULL`).all();
    const voidUris = this.db.prepare(`SELECT uri FROM void_patterns`).all();
    return [
      ...oracleUris.map(r => r.uri),
      ...voidUris.map(r => r.uri),
    ];
  }

  countByRepo() {
    const counts = {};
    for (const uri of this.listAll()) {
      try { counts[parseUri(uri).repo] = (counts[parseUri(uri).repo] || 0) + 1; }
      catch { /* skip malformed */ }
    }
    return counts;
  }

  close() { this.db.close(); }
}

module.exports = { PatternUriLookup };
