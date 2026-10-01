'use strict';

/**
 * void-data-series.js — the container rule: which numeric series a record's
 * content holds. Pure functions, no instrument; the one door
 * (void-service.js) reads each series this finds through /compress_signal.
 * Split out of void-service.js when the door grew a provenance-carrying read
 * (readingOf) and crossed the size cap; the rule itself is unchanged.
 */

// ── THE DATA A RECORD HOLDS (the container rule, at the field's door) ────
//
// The operator's ruling (2026-09-14, read-signal.py): "if you tell it to
// look at a file it will tell you it's a file; you have to run the data of
// the file into the instrument to have it read the data." coherencyOf()
// reads a record's UTF-8 BYTES — the reading of the file, which stays. A
// record whose content is a JSON value holding numeric series (a God's Eye
// View layer snapshot: latitudes, magnitudes, depths) ALSO carries data, and
// the data is read as a SIGNAL, series by series, through /compress_signal —
// never averaged, never taught (ingest off: the no-auto-teaching ruling),
// never contributed (the record's one reading is the field's observation;
// series read-backs entering the field were the 19,800-reading flood).
//
// The rule mirrors Void scripts/read-signal.py _container/_walk/_columns for
// a JSON value: a numeric array of >= MIN_POINTS finite, non-constant values
// is a series; an array of records yields each numeric key present in >=
// MIN_POINTS records as a column. read-signal is the canonical statement of
// the rule; this is its face at the field's door, kept to the same constants.
const DATA_MIN_POINTS = 8;
const DATA_MAX_SERIES = 16;     // one record never holds the field's door open longer than this

function _finiteSeries(v) {
  if (!Array.isArray(v) || v.length < DATA_MIN_POINTS) return null;
  const out = [];
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return null;
    out.push(x);
  }
  return Math.max(...out) === Math.min(...out) ? null : out;
}

function _columnsOf(records, path, found) {
  const cols = new Map();
  for (const r of records) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    for (const [k, x] of Object.entries(r)) {
      if (typeof x === 'number') {
        if (!cols.has(k)) cols.set(k, []);
        cols.get(k).push(x);
      }
    }
  }
  for (const [k, col] of cols) {
    const s = _finiteSeries(col);
    if (s) found.push([`${path}[*].${k}`, s]);
  }
}

function _walkData(node, path, found) {
  if (Array.isArray(node)) {
    const s = _finiteSeries(node);
    if (s) { found.push([path, s]); return; }
    if (node.some((x) => x && typeof x === 'object' && !Array.isArray(x))) _columnsOf(node, path, found);
    node.forEach((x, i) => { if (x && typeof x === 'object') _walkData(x, `${path}[${i}]`, found); });
  } else if (node && typeof node === 'object') {
    for (const [k, x] of Object.entries(node)) {
      if (x && typeof x === 'object') _walkData(x, `${path}.${k}`, found);
    }
  }
}

/** The numeric series a record's content holds, by the container rule; [] when none. */
function dataSeriesOf(content) {
  const t = String(content || '').trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return [];
  let doc;
  try { doc = JSON.parse(t); } catch (_) { return []; }
  const found = [];
  _walkData(doc, '$', found);
  return found;
}

module.exports = { dataSeriesOf, DATA_MAX_SERIES };
