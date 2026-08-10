const { quiet } = require('../quiet');
// mapper-style organ of the former persistence.js monolith (1,962 lines).
// Extracted VERBATIM along the file's own section seams; persistence.js
// remains the façade with a byte-compatible export surface.
const path = require('path');
const fs = require('fs');
const { GLOBAL_DIR, ensureDir, openStore } = require('./stores');
// The monolith carried a file-level exemption for this ONE write. A real
// sealed covenant gate replaces it (fractal covenant, byte scale): the
// write to the repos config passes requireGate or throws.
const { createGate, requireGate } = require('../covenant-fractal');
const _writeRepoConfig = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.2, group: 12, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'persistence',
});

// ─── Cross-Repo Federated Search ───

const REPOS_CONFIG_PATH = path.join(GLOBAL_DIR, 'repos.json');

/**
 * Discover oracle stores in sibling directories and configured repo paths.
 * Searches parent directory for siblings with `.remembrance/` dirs.
 *
 * @param {object} options — { includeSiblings, additionalPaths, maxDepth }
 * @returns {string[]} Array of directory paths with oracle stores
 */
function discoverRepoStores(options = {}) {
  const { includeSiblings = true, additionalPaths = [], maxDepth = 1 } = options;
  const discovered = new Set();

  // Load configured repos
  try {
    if (fs.existsSync(REPOS_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(REPOS_CONFIG_PATH, 'utf-8'));
      (config.repos || []).forEach(r => {
        const rDir = path.resolve(r);
        if (fs.existsSync(path.join(rDir, '.remembrance'))) {
          discovered.add(rDir);
        }
      });
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:discoverRepoStores] config read error:', e?.message || e);
  }

  // Add explicit paths
  for (const p of additionalPaths) {
    const resolved = path.resolve(p);
    if (fs.existsSync(path.join(resolved, '.remembrance'))) {
      discovered.add(resolved);
    }
  }

  // Auto-discover siblings
  if (includeSiblings) {
    try {
      const cwd = process.cwd();
      const parent = path.dirname(cwd);
      const entries = fs.readdirSync(parent, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const siblingPath = path.join(parent, entry.name);
        if (siblingPath === cwd) continue; // Skip self
        if (fs.existsSync(path.join(siblingPath, '.remembrance'))) {
          discovered.add(siblingPath);
        }
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[persistence:discoverRepoStores] permission or read error:', e?.message || e);
    }
  }

  return Array.from(discovered);
}

/**
 * Register a repo path for cross-repo federated search.
 */
function registerRepo(repoPath) {
  ensureDir(GLOBAL_DIR);
  let config = { repos: [] };
  try {
    if (fs.existsSync(REPOS_CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(REPOS_CONFIG_PATH, 'utf-8'));
      if (!Array.isArray(config.repos)) config.repos = [];
    }
  } catch (e) {
    if (fs.existsSync(REPOS_CONFIG_PATH)) {
      // Config file exists but is corrupted — don't silently overwrite
      if (process.env.ORACLE_DEBUG) console.warn('[persistence:registerRepo] corrupted config, preserving:', e?.message || e);
      return { registered: false, error: 'Repos config file is corrupted — fix or delete manually', path: REPOS_CONFIG_PATH };
    }
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:registerRepo] fresh config:', e?.message || e);
  }

  const resolved = path.resolve(repoPath);
  if (!config.repos.includes(resolved)) {
    config.repos.push(resolved);
    _writeRepoConfig(_sealedGate(), REPOS_CONFIG_PATH, JSON.stringify(config, null, 2));
  }
  return { registered: true, path: resolved, totalRepos: config.repos.length };
}

/**
 * List configured repos.
 */
function listRepos() {
  try {
    if (fs.existsSync(REPOS_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(REPOS_CONFIG_PATH, 'utf-8'));
      return (config.repos || []).map(r => {
        const exists = fs.existsSync(path.join(r, '.remembrance'));
        return { path: r, name: path.basename(r), active: exists };
      });
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[persistence:listRepos] config error:', e?.message || e);
  }
  return [];
}

/**
 * Search patterns across multiple repo oracle stores.
 * Deduplicates by pattern name (first repo wins).
 *
 * @param {string} description — search query
 * @param {object} options — { language, limit, repos }
 * @returns {{ results, repos, totalSearched }}
 */
function crossRepoSearch(description, options = {}) {
  const { language, limit = 20, repos: explicitRepos } = options;
  const repoPaths = explicitRepos || discoverRepoStores();

  const allResults = [];
  const repoInfo = [];
  const seen = new Set();

  for (const repoPath of repoPaths) {
    let store;
    try {
      store = openStore(repoPath);
      if (!store) continue;

      const patterns = store.getAllPatterns ? store.getAllPatterns() : [];
      const repoName = path.basename(repoPath);
      let matchCount = 0;

      for (const p of patterns) {
        const key = `${(p.name || '').toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
        if (seen.has(key)) continue;
        // Simple relevance scoring: check if description words match name/tags/description
        const text = `${p.name} ${(p.tags || []).join(' ')} ${p.description || ''}`.toLowerCase();
        const words = description.toLowerCase().split(/\s+/);
        const matches = words.filter(w => text.includes(w));
        if (matches.length === 0) continue;
        if (language && p.language !== language) continue;

        seen.add(key);
        allResults.push({
          ...p,
          _repo: repoName,
          _repoPath: repoPath,
          _matchScore: matches.length / words.length,
        });
        matchCount++;
      }

      repoInfo.push({ name: repoName, path: repoPath, patterns: patterns.length, matches: matchCount });
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[persistence:crossRepoSearch] store open failed — skip:', e?.message || e);
    } finally {
      if (store && typeof store.close === 'function') {
        try { store.close(); } catch (_) { quiet('core:persistence:repos:openStore', _);}
      }
    }
  }

  // Sort by match score
  allResults.sort((a, b) => b._matchScore - a._matchScore);

  return {
    results: allResults.slice(0, limit),
    repos: repoInfo,
    totalSearched: repoPaths.length,
  };
}


discoverRepoStores.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
registerRepo.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'odd', phase: 'gas',
  reactivity: 'high', electronegativity: 0, group: 6, period: 3,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
listRepos.atomicProperties = {
  charge: 0, valence: 0, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'medium', electronegativity: 0, group: 6, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
crossRepoSearch.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};

module.exports = { REPOS_CONFIG_PATH, crossRepoSearch, discoverRepoStores, listRepos, registerRepo };
