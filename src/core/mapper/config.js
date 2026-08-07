'use strict';

/**
 * mapper/config.js — the mapper's shared ground: walk rules, categories,
 * namespace aliases, caps, and the tiny stats helpers.
 *
 * Extracted from coherency-mapper.js (1,179 lines) in the flagship
 * decomposition — one organ per module, coherency-mapper.js remains the
 * façade so every consumer and `--do call` reference keeps working.
 */

const path = require('node:path');
const { walkFiles } = require('../walk-files');

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.rb', '.java',
  '.md', '.json', '.toml', '.yaml', '.yml', '.css', '.html',
  '.sh', // harvest ingests shell scripts — walk parity, else they read as ghosts
];

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'target', 'dist', 'build',
  'vendor', '__pycache__', '.venv', 'venv', '.pytest_cache',
  'coverage', '.nyc_output', '.remembrance', '.cache',
]);

// Substrate namespaces that are THIS repo's subtrees under an older
// name. Without an alias, a renamed subtree's substrate memory reads as
// a 1.000 "cross-system bridge" to a phantom sibling project (the
// misreading that once diagnosed a nonexistent site fork from the
// cathedral's pre-move `website/*` entries — since re-ingested under
// oracle/digital-cathedral/* and retired from the index). Bridge scans
// treat an aliased self-match as identity, not bridge; drift lenses use
// it to find a file's memory. Empty today; register future renames here
// the moment they happen, not after the misreadings start.
const SUBSTRATE_PATH_ALIASES = {};

// Ceiling for the full-text coherence re-read of over-cap files. Source
// files beyond the encode cap (64k) still deserve a real intrinsic
// reading; multi-MB data blobs (patterns.json …) do not — their
// "structure" is a serialization format, and the read cost is real.
const FULL_COHERENCE_CAP = 512000;

/** Substrate names under which rel's own memory may live, aliases included. */
function substrateSelfNames(namespace, rel) {
  const names = [namespace + '/' + rel];
  for (const [ns, subtree] of Object.entries(SUBSTRATE_PATH_ALIASES)) {
    if (rel.startsWith(subtree + '/')) names.push(ns + '/' + rel.slice(subtree.length + 1));
  }
  return names;
}
substrateSelfNames.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'analysis',
};

const DEFAULT_CATEGORIZER = (rel) => {
  if (rel.startsWith('app/api/')) {
    if (rel.includes('/portal/') || rel.includes('/client/')) return 'api/portal';
    if (rel.includes('/leads/')) return 'api/leads';
    if (rel.includes('/admin/')) return 'api/admin';
    if (rel.includes('/stripe/') || rel.includes('/checkout/') || rel.includes('/webhook')) return 'api/payment';
    return 'api/other';
  }
  if (rel.startsWith('app/portal/')) return 'page/portal';
  if (rel.startsWith('app/admin/')) return 'page/admin';
  if (rel.startsWith('app/lib/') || rel.startsWith('app/utils/')) return 'lib';
  if (rel.startsWith('app/components/') || rel.includes('/components/')) return 'components';
  if (rel.startsWith('app/')) return 'page/marketing';
  if (rel.startsWith('lib/') || rel.startsWith('src/lib/')) return 'lib';
  if (rel.startsWith('src/')) return 'src';
  if (rel.startsWith('public/')) return 'public';
  if (rel.startsWith('scripts/')) return 'scripts';
  if (/\.(test|spec)\.(ts|tsx|js)$/.test(rel)) return 'tests';
  if (rel.endsWith('.md')) return 'docs';
  if (rel.endsWith('.json') || rel.endsWith('.toml') || rel.endsWith('.yaml') || rel.endsWith('.yml')) return 'config';
  if (/^(next|tailwind|tsconfig|package|postcss|jest|eslint|prettier|vite|webpack)/.test(rel)) return 'config';
  return 'other';
};

function _inferLang(rel) {
  const ext = path.extname(rel).toLowerCase();
  return ({
    '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.jsx': 'jsx', '.mjs': 'js', '.cjs': 'js',
    '.py': 'python', '.rs': 'rust', '.go': 'go', '.rb': 'ruby', '.java': 'java',
    '.md': 'markdown', '.json': 'json', '.toml': 'toml',
    '.yaml': 'yaml', '.yml': 'yaml', '.css': 'css', '.html': 'html',
    '.sh': 'bash',
  })[ext] || 'unknown';
}

// Routes to the canonical walker (ECOSYSTEM §7: one implementation). The
// mapper walks with its own DEFAULT_SKIP_DIRS/DEFAULT_EXTENSIONS, and does
// NOT skip hidden entries — a project's .github/ etc. are real files it
// must map — so skipHidden is off to preserve prior behaviour.
function _walk(dir, opts) {
  return walkFiles(dir, {
    skipDirs: opts.skipDirs || DEFAULT_SKIP_DIRS,
    extensions: opts.extensions || DEFAULT_EXTENSIONS,
    skipHidden: false,
  });
}

// Median of a set of readings. Deliberately NOT a mean: the median is a
// value some file in the set actually measured, so it is still a reading the
// compressor produced. A mean is a number no file has.
function _median(values) {
  if (!values || !values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

module.exports = {
  DEFAULT_EXTENSIONS,
  DEFAULT_SKIP_DIRS,
  DEFAULT_CATEGORIZER,
  SUBSTRATE_PATH_ALIASES,
  FULL_COHERENCE_CAP,
  substrateSelfNames,
  _inferLang,
  _walk,
  _median,
};
