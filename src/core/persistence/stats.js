const { quiet } = require('../quiet');
// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.
const path = require('path');
const { COMMUNITY_DIR, GLOBAL_DIR, PERSONAL_DIR, openCommunityStore, openPersonalStore } = require('./stores');

function personalStats() {
  const store = openPersonalStore();
  if (!store) return { available: false, error: 'No SQLite available' };
  try {
    return _storeStats(store, PERSONAL_DIR, 'personal');
  } finally {
    if (typeof store.close === 'function') try { store.close(); } catch (_) { quiet('core:persistence:stats:openPersonalStore', _);}
  }
}

/**
 * Get stats for community store.
 */
function communityStats() {
  const store = openCommunityStore();
  if (!store) return { available: false, error: 'No SQLite available' };
  try {
    return _storeStats(store, COMMUNITY_DIR, 'community');
  } finally {
    if (typeof store.close === 'function') try { store.close(); } catch (_) { quiet('core:persistence:stats:openCommunityStore', _);}
  }
}

/**
 * Legacy compat: globalStats maps to combined personal + community.
 */
function globalStats() {
  const personal = personalStats();
  const community = communityStats();

  if (!personal.available && !community.available) {
    return { available: false, error: 'No SQLite or global store' };
  }

  const byLanguage = { ...(personal.byLanguage || {}) };
  const byType = { ...(personal.byType || {}) };
  for (const [k, v] of Object.entries(community.byLanguage || {})) {
    byLanguage[k] = (byLanguage[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(community.byType || {})) {
    byType[k] = (byType[k] || 0) + v;
  }

  const totalPatterns = (personal.totalPatterns ?? 0) + (community.totalPatterns ?? 0);
  const weightedCoherency = (personal.avgCoherency ?? 0) * (personal.totalPatterns ?? 0)
    + (community.avgCoherency ?? 0) * (community.totalPatterns ?? 0);

  return {
    available: true,
    path: GLOBAL_DIR,
    totalPatterns,
    avgCoherency: totalPatterns > 0 ? Math.round(weightedCoherency / totalPatterns * 1000) / 1000 : 0,
    byLanguage,
    byType,
    personal,
    community,
  };
}

function _storeStats(store, dir, label) {
  const patterns = store.getAllPatterns();
  const byLanguage = {};
  const byType = {};
  let totalCoherency = 0;

  for (const p of patterns) {
    const lang = p.language || 'unknown';
    const type = p.pattern_type || p.patternType || 'utility';
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    totalCoherency += p.coherency_total ?? p.coherencyScore?.total ?? 0;
  }

  return {
    available: true,
    label,
    path: path.join(dir, '.remembrance', 'oracle.db'),
    totalPatterns: patterns.length,
    avgCoherency: patterns.length > 0 ? Math.round(totalCoherency / patterns.length * 1000) / 1000 : 0,
    byLanguage,
    byType,
  };
}

// ─── Debug Pattern Community Layer ───

/**
 * Share debug patterns to the community store.
 * Higher bar than regular patterns: requires confidence >= 0.5 and at least 1 successful resolution.
 */

globalStats.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 5, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'neutral',
  domain: 'oracle',
};
personalStats.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
communityStats.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 10, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};

module.exports = { _storeStats, communityStats, globalStats, personalStats };
