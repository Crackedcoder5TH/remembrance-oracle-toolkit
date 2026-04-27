'use strict';

/**
 * Coherency Pattern URI — `coh://` scheme.
 *
 * JS twin of void's coherency_uri.py. See COHERENCY_URI_SPEC.md in the
 * Void-Data-Compressor repo for the full spec. Both modules MUST stay
 * in sync — same VALID_REPOS, VALID_DOMAINS, regex, and hash function
 * (md5 of the canonical content bytes, first 12 hex chars).
 */

const crypto = require('crypto');

const VALID_REPOS = new Set([
  'void', 'oracle', 'interface', 'blockchain', 'dialer',
  'reflector', 'swarm', 'moons', 'plugger', 'supabase',
]);

const VALID_DOMAINS = new Set([
  'code', 'cosmos', 'physics', 'framework', 'consciousness',
  'economy', 'applied', 'conflict', 'meta', 'builtin', 'unknown',
]);

const URI_RE =
  /^coh:\/\/([a-z][a-z0-9_-]*)\/([a-z][a-z0-9_-]*)\/([A-Za-z0-9_./:-]+?)(?:@([A-Za-z0-9_.-]+))?(?:#h:([0-9a-f]{12}))?$/;

function makeUri(repo, domain, path, { version = 'v1', waveform = null } = {}) {
  if (!VALID_REPOS.has(repo)) {
    throw new Error(`unknown repo ${JSON.stringify(repo)}`);
  }
  if (!VALID_DOMAINS.has(domain)) {
    throw new Error(`unknown domain ${JSON.stringify(domain)}`);
  }
  if (!path || path.startsWith('/') || path.endsWith('/')) {
    throw new Error(`path must be non-empty and not bordered by /: ${JSON.stringify(path)}`);
  }
  const base = `coh://${repo}/${domain}/${path}`;
  if (waveform) {
    return `${base}#h:${waveformHash(waveform)}`;
  }
  if (version) {
    return `${base}@${version}`;
  }
  return base;
}

function parseUri(uri) {
  const m = URI_RE.exec(uri);
  if (!m) throw new Error(`not a valid coh:// URI: ${JSON.stringify(uri)}`);
  const [, repo, domain, path, version, hash] = m;
  return {
    repo,
    domain,
    path,
    version: version || (hash ? null : 'v1'),
    hash: hash || null,
  };
}

function validate(uri) {
  try { parseUri(uri); return true; } catch { return false; }
}

function uriToFilename(uri) {
  const { repo, domain, path, version, hash } = parseUri(uri);
  const pieces = [repo, domain, path.replace(/\//g, '__')];
  if (hash) pieces.push(`h_${hash}`);
  else if (version) pieces.push(version);
  return pieces.join('__').replace(/[^A-Za-z0-9_.\-]/g, '_') + '.json';
}

/**
 * Canonical 12-hex content hash for waveform identity. Matches the
 * Python `waveform_hash()` byte-for-byte: md5 of the float64 raw
 * bytes in little-endian order, first 12 hex chars.
 */
function waveformHash(waveform) {
  // Accept Float64Array, regular array, or Buffer. Normalize to bytes.
  let bytes;
  if (Buffer.isBuffer(waveform)) {
    bytes = waveform;
  } else if (waveform instanceof Float64Array) {
    bytes = Buffer.from(waveform.buffer, waveform.byteOffset, waveform.byteLength);
  } else if (Array.isArray(waveform)) {
    const arr = new Float64Array(waveform);
    bytes = Buffer.from(arr.buffer);
  } else {
    throw new Error('waveformHash: expected Buffer, Float64Array, or Array');
  }
  return crypto.createHash('md5').update(bytes).digest('hex').slice(0, 12);
}

/**
 * Convert an oracle-side legacy pattern record to a coh:// URI.
 *
 * The oracle's patterns are code-shaped. Domain is forced to 'code'.
 * Path conventions mirror the Python labeler:
 *   {name, language}                    → code/<name>/<language>
 *   {name} only                         → code/<name>
 *
 * Pass `waveform` (an array of numbers) to pin with `#h:`. Otherwise
 * the URI is `@v1`.
 */
function labelOraclePattern(pattern) {
  const name = pattern.name || pattern.id;
  if (!name) throw new Error('labelOraclePattern: pattern.name required');
  const lang = pattern.language;
  const path = lang ? `${name}/${lang}` : name;
  return makeUri('oracle', 'code', path, { waveform: pattern.waveform || null });
}

module.exports = {
  VALID_REPOS,
  VALID_DOMAINS,
  makeUri,
  parseUri,
  validate,
  uriToFilename,
  waveformHash,
  labelOraclePattern,
};

makeUri.atomicProperties = {
  charge: 1, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 1,
  harmPotential: 'none', alignment: 'healing', intention: 'neutral',
  domain: 'core',
};
parseUri.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
