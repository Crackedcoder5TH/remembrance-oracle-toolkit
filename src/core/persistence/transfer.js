// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.
const { safeJsonParse } = require('../covenant');

// ─── Pattern Transfer Helper ───

/**
 * Extract safe, portable pattern data from a raw row/pattern object.
 * Strips user-identifiable fields (author, voter, source paths) by default.
 * @param {object} pattern - Raw pattern object from DB
 * @param {object} options
 *   - stripIdentity: remove author/voter references (default: false)
 *   - stripSourcePaths: remove sourceFile/sourceCommit/sourceUrl/sourceRepo (default: false)
 */
function sanitizePatternForTransfer(pattern, options = {}) {
  const { stripIdentity = false, stripSourcePaths = false } = options;

  const patternData = {
    name: pattern.name,
    code: pattern.code,
    language: pattern.language,
    patternType: pattern.pattern_type || pattern.patternType || 'utility',
    complexity: pattern.complexity || 'composite',
    description: pattern.description || '',
    tags: typeof pattern.tags === 'string' ? safeJsonParse(pattern.tags, []) : (pattern.tags || []),
    coherencyScore: typeof pattern.coherency_json === 'string'
      ? safeJsonParse(pattern.coherency_json, {})
      : (pattern.coherencyScore || {}),
    testCode: pattern.test_code || pattern.testCode || null,
    evolutionHistory: typeof pattern.evolution_history === 'string'
      ? safeJsonParse(pattern.evolution_history, [])
      : (pattern.evolutionHistory || []),
  };

  // Strip identity-revealing fields for community/public sharing
  if (stripIdentity) {
    patternData.author = 'anonymous';
    // Scrub auto-register descriptions that embed file paths
    if (patternData.description && /^Auto-registered (from|function from) /.test(patternData.description)) {
      patternData.description = patternData.description.replace(/from .+$/, 'from source');
    }
  }

  // Strip source metadata that could leak repo structure or commit history
  if (stripSourcePaths) {
    // Explicitly do NOT copy these fields — they stay null/undefined
    // sourceFile, sourceUrl, sourceRepo, sourceCommit, sourceLicense
  }

  return patternData;
}

function transferPattern(pattern, targetStore, options = {}) {
  const patternData = sanitizePatternForTransfer(pattern, options);

  // Use dedup-safe insert: skip if same (name, language) exists with equal/higher coherency
  if (typeof targetStore.addPatternIfNotExists === 'function') {
    return targetStore.addPatternIfNotExists(patternData);
  }
  // Fallback: addPattern now routes through addPatternIfNotExists internally,
  // but guard against truly raw stores by checking for existing pattern first
  if (typeof targetStore.getPatternByName === 'function') {
    const existing = targetStore.getPatternByName(patternData.name);
    if (existing) return null; // Skip duplicate
  }
  return targetStore.addPattern(patternData);
}


sanitizePatternForTransfer.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
transferPattern.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 10, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { sanitizePatternForTransfer, transferPattern };
