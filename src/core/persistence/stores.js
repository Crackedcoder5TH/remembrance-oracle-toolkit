// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.

/**
 * Cross-Project Persistence — Personal & Community Stores
 *
 * Two-tier global architecture:
 *
 *   ~/.remembrance/
 *     personal/oracle.db  — YOUR private library, auto-syncs from all projects
 *     community/oracle.db — Shared library, patterns explicitly contributed
 *
 *   ./.remembrance/oracle.db — Project-local store (always present)
 *
 * The personal store grows automatically every time you sync.
 * The community store only grows when you explicitly `oracle share`.
 *
 * Federated search queries all three tiers: local → personal → community
 * with local taking priority for deduplication.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { covenantCheck, safeJsonParse } = require('../covenant');

const GLOBAL_DIR = path.join(os.homedir(), '.remembrance');
const PERSONAL_DIR = path.join(GLOBAL_DIR, 'personal');
const COMMUNITY_DIR = path.join(GLOBAL_DIR, 'community');

/**
 * Unified coherency accessor — eliminates repeated triple-check fallback chains.
 * Handles all three field name conventions: coherency_total, coherencyTotal, coherencyScore.total
 * @param {object} pattern - Pattern record from any store/format
 * @returns {number} Coherency score 0-1
 */
function getCoherency(pattern) {
  return pattern.coherency_total ?? pattern.coherencyTotal ?? pattern.coherencyScore?.total ?? 0;
}

/**
 * Build a dedup key from pattern name and language.
 * @param {object} pattern - Pattern record
 * @returns {string} Lowercase dedup key
 */
function dedupKey(pattern) {
  return `${(pattern.name || '').toLowerCase()}:${(pattern.language || 'unknown').toLowerCase()}`;
}

// ─── Store Openers ───

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getGlobalDir() {
  ensureDir(GLOBAL_DIR);
  return GLOBAL_DIR;
}

function openStore(baseDir) {
  const { SQLiteStore, DatabaseSync } = require('../../store/sqlite');
  if (!DatabaseSync) return null;
  ensureDir(path.join(baseDir, '.remembrance'));
  return new SQLiteStore(baseDir);
}

/**
 * Open the personal store at ~/.remembrance/personal/
 * This is the user's private cross-project library.
 */
function openPersonalStore() {
  ensureDir(PERSONAL_DIR);
  return openStore(PERSONAL_DIR);
}

/**
 * Open the community store at ~/.remembrance/community/
 * This is the shared library of explicitly contributed patterns.
 */
function openCommunityStore() {
  ensureDir(COMMUNITY_DIR);
  return openStore(COMMUNITY_DIR);
}

/**
 * Legacy compat: openGlobalStore maps to personal store.
 */
function openGlobalStore() {
  return openPersonalStore();
}

function hasGlobalStore() {
  return fs.existsSync(path.join(PERSONAL_DIR, '.remembrance', 'oracle.db'));
}


getGlobalDir.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
hasGlobalStore.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'odd', phase: 'gas',
  reactivity: 'low', electronegativity: 0, group: 3, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
openGlobalStore.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
openPersonalStore.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
openCommunityStore.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
getCoherency.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 1,
  harmPotential: 'none', alignment: 'healing', intention: 'neutral',
  domain: 'oracle',
};
dedupKey.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 3, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
ensureDir.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
openStore.atomicProperties = { charge: 0, valence: 1, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 1, group: 10, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { COMMUNITY_DIR, GLOBAL_DIR, PERSONAL_DIR, dedupKey, ensureDir, getCoherency, getGlobalDir, hasGlobalStore, openCommunityStore, openGlobalStore, openPersonalStore, openStore };
