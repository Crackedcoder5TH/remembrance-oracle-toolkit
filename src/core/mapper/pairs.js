'use strict';

/**
 * mapper/pairs.js — duplicate-pair bookkeeping: dedupe, version-series
 * convention, and payload-identity annotation for data files.
 * Extracted from coherency-mapper.js in the flagship decomposition.
 */

const fs = require('node:fs');
const path = require('node:path');

function _dedupePairs(results) {
  const seen = new Map();
  for (const r of results) {
    for (const d of r.duplicates) {
      const key = [r.rel, d.name].sort().join(' ↔ ');
      if (!seen.has(key)) {
        seen.set(key, { a: r.rel, b: d.name, score: d.score });
      }
    }
  }
  return [...seen.values()];
}

/**
 * Annotate duplicate pairs of data files with payload identity.
 *
 * Vector duplicate detection reads files as TEXT — two data JSONs that
 * share a serialization schema (language substrates, versioned covenant
 * snapshots) can score ≥0.999 while their PAYLOADS differ entirely.
 * That shape-echo once misdiagnosed six distinct language substrates as
 * one corrupted vector. For .json↔.json pairs this stamps
 * `payloadIdentical` (canonicalized-JSON hash equality) so a reader can
 * tell a true content duplicate from a format echo. Non-JSON pairs and
 * unreadable payloads are left unannotated (vector verdict stands).
 */
function _annotateDataPairs(pairs, projectPath) {
  const crypto = require('node:crypto');
  const cache = new Map();
  const payloadHash = (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    let h = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(projectPath, rel), 'utf8'));
      h = crypto.createHash('md5')
        .update(JSON.stringify(_sortKeysDeep(parsed))).digest('hex');
    } catch { /* unreadable or not valid JSON — no verdict */ }
    cache.set(rel, h);
    return h;
  };
  const versionBase = (rel) => {
    const m = rel.match(/^(.*?)(?:_v\d+)?(\.[a-z]+)$/i);
    return m ? m[1] + m[2] : rel;
  };
  const realpathOf = (rel) => {
    try { return fs.realpathSync(path.join(projectPath, rel)); }
    catch { return null; }
  };
  const isSymlink = (rel) => {
    try { return fs.lstatSync(path.join(projectPath, rel)).isSymbolicLink(); }
    catch { return false; }
  };
  for (const p of pairs) {
    // Versioned-snapshot series (derived_covenant_v1..v7, …): members of
    // one series are EXPECTED to resemble each other — that is what a
    // snapshot is. Convention: same base name modulo _vN ⇒ versionSeries,
    // reported separately from organic duplication.
    if (versionBase(p.a) === versionBase(p.b) && p.a !== p.b) p.versionSeries = true;
    // Symlink-resolved pair: one member is a symlink whose realpath IS the
    // other member — the deduplication already happened on disk, and the
    // "duplicate" is one file with two names. The index may still carry the
    // old path's vector (the substrate keeps memory), so this is decided at
    // the byte level from the filesystem, not from resemblance.
    if ((isSymlink(p.a) || isSymlink(p.b))) {
      const ra = realpathOf(p.a);
      const rb = realpathOf(p.b);
      if (ra && rb && ra === rb) p.resolvedSymlink = true;
    }
    if (!p.a.endsWith('.json') || !p.b.endsWith('.json')) continue;
    const ha = payloadHash(p.a);
    const hb = payloadHash(p.b);
    if (ha && hb) p.payloadIdentical = ha === hb;
  }
  return pairs;
}

function _sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(_sortKeysDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = _sortKeysDeep(v[k]);
    return out;
  }
  return v;
}

module.exports = { _dedupePairs, _annotateDataPairs, _sortKeysDeep };
