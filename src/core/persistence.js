/**
 * Cross-Project Persistence — Personal & Community Stores.
 *
 * FAÇADE. The 1,962-line monolith was decomposed along its own section
 * seams into organs under src/core/persistence/ — every function moved
 * verbatim with its atomic self-description. This module remains the
 * stable public surface; the export list below is byte-compatible.
 *
 * The monolith carried a file-level infrastructure exemption for
 * ONE ungated write (registerRepo's repos.json). That write now passes a
 * real sealed covenant gate in persistence/repos.js, so no organ needs an
 * exemption — the decomposition SHRANK the exemption surface.
 */

const { getCoherency, dedupKey, ensureDir, getGlobalDir, openStore, openPersonalStore, openCommunityStore, openGlobalStore, hasGlobalStore, GLOBAL_DIR, PERSONAL_DIR, COMMUNITY_DIR } = require('./persistence/stores');
const { sanitizePatternForTransfer } = require('./persistence/transfer');
const { syncToGlobal, syncFromGlobal, syncBidirectional } = require('./persistence/sync');
const { shareToCommunity, pullFromCommunity, federatedQuery } = require('./persistence/community');
const { personalStats, communityStats, globalStats } = require('./persistence/stats');
const { shareDebugPatterns, pullDebugPatterns, syncDebugToPersonal, federatedDebugSearch, debugGlobalStats } = require('./persistence/debug-share');
const { discoverRepoStores, registerRepo, listRepos, crossRepoSearch } = require('./persistence/repos');

module.exports = {
  getGlobalDir,
  hasGlobalStore,
  openGlobalStore,
  openPersonalStore,
  openCommunityStore,
  syncToGlobal,
  syncFromGlobal,
  syncBidirectional,
  shareToCommunity,
  pullFromCommunity,
  federatedQuery,
  globalStats,
  personalStats,
  communityStats,
  shareDebugPatterns,
  pullDebugPatterns,
  syncDebugToPersonal,
  federatedDebugSearch,
  debugGlobalStats,
  discoverRepoStores,
  registerRepo,
  listRepos,
  crossRepoSearch,
  sanitizePatternForTransfer,
  getCoherency,
  dedupKey,
  GLOBAL_DIR,
  PERSONAL_DIR,
  COMMUNITY_DIR,
};
