'use strict';

/**
 * pattern-resonance.js — score code against the oracle's proven library.
 *
 * Lexical TF-IDF over the proven-pattern library: how much of the input's
 * token vocabulary appears in code we've already proven correct? Real
 * code reuses real identifiers (`clearTimeout`, `setTimeout`, `apply`);
 * hallucinated code reaches for invented APIs (`debounceWith`, `flushAsync`,
 * `magicTimer.schedule`) that match nothing in the library. The top-K mean
 * cosine in [0,1] separates them.
 *
 * This is the anti-hallucination signal the fractal-waveform encoder does
 * NOT provide. Fractal coherency measures structural shape — a
 * structurally-identical hallucination scores ~0.99 fractal coherency to
 * real code. Lexical resonance measures vocabulary against the proven
 * substrate, and that's where the invented-identifier tell shows up.
 *
 * Port of /home/user/REMEMBRANCE-AGENT-Swarm-/src/swarm/pattern-resonance.js
 * with two upgrades: reads from the live sqlite store first (currently
 * 1.3k+ patterns), falls back to patterns.json if sqlite is unreachable.
 * Same return shape as the swarm version so callers are interoperable.
 *
 * Best-effort: any failure returns null and the caller proceeds without
 * resonance. The library being empty is honest, not an error.
 */

const fs = require('node:fs');
const path = require('node:path');

let _index = null;  // { docs: {name, lang, toks:Set, l2:number}[], idf: Map }
let _loadError = null;

const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Binary presence (a Set), not term-frequency: counting repeats amplifies
 * shared boilerplate (`function`, `return`) and masks the signal. With each
 * token weighted once by its IDF, a hallucination's distinctive invented
 * identifiers — high IDF, matching nothing — correctly drag its score down. */
function _tokenize(code) {
  const set = new Set();
  const m = String(code || '').match(TOKEN_RE);
  if (!m) return set;
  for (const raw of m) set.add(raw.toLowerCase());
  return set;
}

function _buildIndex(rawPatterns) {
  const docs = [];
  const df = new Map();
  for (const p of rawPatterns) {
    const code = typeof p.code === 'string' ? p.code : '';
    if (!code) continue;
    const toks = _tokenize(code);
    if (toks.size === 0) continue;
    docs.push({
      name: p.name || p.id || 'pattern',
      lang: (p.language || '').toLowerCase(),
      toks,
    });
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  if (docs.length === 0) return null;

  const N = docs.length;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 1)) + 1);

  for (const d of docs) {
    let s = 0;
    for (const t of d.toks) { const w = idf.get(t) || 0; s += w * w; }
    d.l2 = Math.sqrt(s) || 1e-9;
  }
  return { docs, idf };
}

function _loadFromSqlite() {
  const { SQLiteStore } = require('../store/sqlite');
  const root = path.join(__dirname, '..', '..');
  const store = new SQLiteStore(root);
  const rows = store.db.prepare(
    "SELECT id, name, code, language FROM patterns WHERE code IS NOT NULL AND length(code) > 0"
  ).all();
  store.close && store.close();
  return _buildIndex(rows);
}

function _loadFromPatternsJson() {
  const candidates = [
    path.join(__dirname, '..', '..', 'patterns.json'),
    path.join(process.cwd(), 'patterns.json'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const entries = Array.isArray(raw) ? raw : (Array.isArray(raw.patterns) ? raw.patterns : []);
    if (entries.length > 0) return _buildIndex(entries);
  }
  return null;
}

function _load() {
  if (_index !== null) return _index;
  if (_loadError !== null) return null;
  try {
    _index = _loadFromSqlite();
    if (_index && _index.docs.length > 0) return _index;
  } catch (e) {
    // sqlite unreachable — fall through to JSON
  }
  try {
    _index = _loadFromPatternsJson();
    if (_index && _index.docs.length > 0) return _index;
  } catch (e) {
    _loadError = String((e && e.message) || e);
  }
  if (!_index) _loadError = _loadError || 'no patterns available (sqlite + patterns.json both empty/missing)';
  return _index;
}

function _cosine(qToks, qL2, doc, idf) {
  let inter = 0;
  for (const t of qToks) {
    if (!doc.toks.has(t)) continue;
    const w = idf.get(t) || 0;
    inter += w * w;
  }
  const den = qL2 * doc.l2;
  return den < 1e-12 ? 0 : inter / den;
}

/**
 * Score `text` (typically code) by lexical TF-IDF resonance against the
 * proven library. Returns blended top-K cosine in [0,1] or null when the
 * library is unavailable.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.k=5] - top-K patterns to average
 * @param {string} [opts.language] - prefer patterns of this language
 * @returns {{score:number, meanTopK:number, bestMatch:number, k:number,
 *            topMatches:{name:string,similarity:number}[]} | null}
 */
function scoreResonance(text, opts = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  const idx = _load();
  if (!idx) return null;

  const qToks = _tokenize(text);
  if (qToks.size === 0) return null;
  const { idf, docs } = idx;

  let qs = 0;
  for (const t of qToks) { const w = idf.get(t) || 0; qs += w * w; }
  const qL2 = Math.sqrt(qs) || 1e-9;

  const k = Math.max(1, Math.min(20, opts.k || 5));
  const lang = opts.language ? String(opts.language).toLowerCase() : null;
  const pool = lang ? docs.filter((d) => d.lang === lang) : docs;
  const effective = pool.length >= 3 ? pool : docs;

  const sims = effective.map((d) => ({ name: d.name, similarity: _cosine(qToks, qL2, d, idf) }));
  sims.sort((a, b) => b.similarity - a.similarity);
  const top = sims.slice(0, k);
  const meanTopK = top.reduce((acc, x) => acc + x.similarity, 0) / top.length;
  const bestMatch = top.length ? top[0].similarity : 0;

  // bestMatch is the cleanest hallucination tell — real code finds at
  // least ONE strong family member, invented code matches nothing
  // strongly. meanTopK tempers it with the neighborhood. The 50/50 blend
  // separates real-from-bad ~2x on held-out tests.
  const score = Math.max(0, Math.min(1, 0.5 * meanTopK + 0.5 * bestMatch));

  return {
    score: Math.round(score * 10000) / 10000,
    meanTopK: Math.round(meanTopK * 10000) / 10000,
    bestMatch: Math.round(Math.max(0, Math.min(1, bestMatch)) * 10000) / 10000,
    k: top.length,
    topMatches: top.map((t) => ({
      name: t.name,
      similarity: Math.round(t.similarity * 10000) / 10000,
    })),
  };
}

/** Diagnostics: library size + any load error (null if healthy). */
function libraryStatus() {
  const idx = _load();
  return {
    loaded: !!idx,
    count: idx ? idx.docs.length : 0,
    error: _loadError,
  };
}

/** Test-only: drop the cache. */
function _resetCache() { _index = null; _loadError = null; }

module.exports = { scoreResonance, libraryStatus, _resetCache };
