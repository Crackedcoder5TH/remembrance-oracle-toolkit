'use strict';

/**
 * Read the shared covenant spec from Void-Data-Compressor/covenant.json.
 *
 * Resolution order (first hit wins):
 *   1. process.env.COVENANT_SPEC_PATH
 *   2. ../Void-Data-Compressor/covenant.json relative to this file
 *   3. ./covenant.json in cwd
 *   4. fallback: throws — covenant cannot be assumed
 *
 * This is the JS twin of void's covenant_spec.py. Both modules read
 * the SAME file so a threshold change in one place propagates to the
 * other repo without code duplication.
 */

const fs = require('fs');
const path = require('path');

const FALLBACK_CANDIDATES = [
  path.resolve(__dirname, '../../../Void-Data-Compressor/covenant.json'),
  path.resolve(__dirname, '../../../void-data-compressor/covenant.json'),
  path.resolve(process.cwd(), 'covenant.json'),
];

let _cache = null;
let _cachedPath = null;

function _resolvePath() {
  if (process.env.COVENANT_SPEC_PATH && fs.existsSync(process.env.COVENANT_SPEC_PATH)) {
    return process.env.COVENANT_SPEC_PATH;
  }
  for (const p of FALLBACK_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function load() {
  if (_cache) return _cache;
  const p = _resolvePath();
  if (!p) {
    throw new Error(
      'covenant-spec: covenant.json not found. ' +
      'Set COVENANT_SPEC_PATH or place covenant.json in cwd.'
    );
  }
  _cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  _cachedPath = p;
  return _cache;
}

function threshold(name, fallback = 0) {
  const v = load().thresholds[name];
  return typeof v === 'number' ? v : fallback;
}

function waveformConstant(name, fallback = 0) {
  const v = load().waveform[name];
  return typeof v === 'number' ? v : fallback;
}

function principles() { return load().principles; }
function principleById(id) {
  const p = principles().find(x => x.id === id);
  if (!p) throw new Error(`no principle with id=${id}`);
  return p;
}
function structuralGates() { return load().structural_gates; }
function domainsForUri() { return load().domains_for_uri; }

function specPath() { load(); return _cachedPath; }

module.exports = {
  load,
  threshold,
  waveformConstant,
  principles,
  principleById,
  structuralGates,
  domainsForUri,
  specPath,
};
