'use strict';
const { quiet } = require('../quiet');

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
    } catch (_e) { quiet('core:mapper:pairs:_sortKeysDeep', _e); /* unreadable or not valid JSON — no verdict */ }
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
  // Pair adjudications from the tracked store. `governed-vendored` is
  // verdict-plus-proof: it sticks ONLY while the two files are still
  // byte-identical — drift voids the adjudication on the spot and the
  // pair surfaces unverified again. Other verdicts (scaffold-convention)
  // are review-only classifications.
  let pairAdj = {};
  try {
    pairAdj = (JSON.parse(fs.readFileSync(path.join(projectPath, '.map-adjudications.json'), 'utf8')).pairs) || {};
  } catch (_e) { quiet('core:mapper:pairs:_sortKeysDeep', _e); /* no store */ }
  const pairKey = (a, b) => [a, b].sort().join(' ↔ ');
  const byteEqual = (a, b) => {
    try { return fs.readFileSync(path.join(projectPath, a)).equals(fs.readFileSync(path.join(projectPath, b))); }
    catch { return false; }
  };
  for (const p of pairs) {
    // Versioned-snapshot series (derived_covenant_v1..v7, …): members of
    // one series are EXPECTED to resemble each other — that is what a
    // snapshot is. Convention: same base name modulo _vN ⇒ versionSeries,
    // reported separately from organic duplication.
    if (versionBase(p.a) === versionBase(p.b) && p.a !== p.b) p.versionSeries = true;
    const adj = pairAdj[pairKey(p.a, p.b)];
    if (adj && adj.verdict === 'governed-vendored') {
      if (byteEqual(p.a, p.b)) p.adjudicated = adj.verdict;
      // else: governance broken — no annotation, the pair surfaces raw
    } else if (adj && adj.verdict) {
      p.adjudicated = adj.verdict;
    }
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

/**
 * Annotate orphan rows with human-reviewed verdicts from the tracked
 * adjudication store (.map-adjudications.json). An orphan is a
 * measurement, not a sin — this lets the map report REVIEWED structural
 * loneliness (wired-verified, singleton-by-design, corpus-content,
 * framework-wired, standalone-tool) separately from NEW orphans, so
 * fresh loneliness always surfaces while reviewed files stop counting
 * as open flags. The map only ever READS the store.
 */
function _annotateOrphans(orphans, projectPath) {
  let store = null;
  try {
    store = JSON.parse(fs.readFileSync(path.join(projectPath, '.map-adjudications.json'), 'utf8'));
  } catch { return orphans; /* no store — nothing adjudicated */ }
  const adj = (store && store.adjudications) || {};
  for (const o of orphans) {
    const a = adj[o.rel];
    if (a && a.verdict) o.adjudicated = { verdict: a.verdict, date: a.date };
  }
  return orphans;
}

module.exports = { _dedupePairs, _annotateDataPairs, _annotateOrphans, _sortKeysDeep };
