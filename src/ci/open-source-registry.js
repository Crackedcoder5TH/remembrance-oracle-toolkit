/**
 * Open Source Registry — Import patterns from curated open source repositories.
 *
 * Six layers:
 * 1. Curated registry — recommended repos searchable by topic/language
 * 2. Batch import — harvest multiple repos in one call
 * 3. GitHub search — discover repos by stars/language/topic via GitHub API
 * 4. License checking — skip repos with incompatible licenses
 * 5. Provenance tracking — store repo URL, commit SHA, license in pattern metadata
 * 6. Deduplication — detect duplicate patterns across repos
 *
 * Usage:
 *   oracle registry list                          # List curated repos
 *   oracle registry search "data structures"       # Search registry by topic
 *   oracle registry import lodash                  # Import from a curated repo
 *   oracle registry batch --language javascript    # Batch import by language
 *   oracle registry discover "sorting algorithms"  # Search GitHub for repos
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

// ─── Layer 1: Curated Registry ───────────────────────────────────────────────

const CURATED_REPOS = [
  // JavaScript — Utilities
  { name: 'lodash', url: 'https://github.com/lodash/lodash', language: 'javascript', topics: ['utility', 'functional', 'array', 'object', 'string', 'collection'], license: 'MIT', stars: 58000, description: 'A modern JavaScript utility library delivering modularity, performance & extras' },
  { name: '30-seconds-of-code', url: 'https://github.com/Chalarangelo/30-seconds-of-code', language: 'javascript', topics: ['snippets', 'utility', 'algorithm', 'array', 'string', 'dom', 'math'], license: 'CC-BY-4.0', stars: 119000, description: 'Short JavaScript code snippets for all your development needs' },
  { name: 'ramda', url: 'https://github.com/ramda/ramda', language: 'javascript', topics: ['functional', 'utility', 'immutable', 'curry', 'compose', 'pipeline'], license: 'MIT', stars: 23000, description: 'Practical functional library for JavaScript programmers' },
  { name: 'date-fns', url: 'https://github.com/date-fns/date-fns', language: 'javascript', topics: ['date', 'time', 'utility', 'format', 'parse'], license: 'MIT', stars: 33000, description: 'Modern JavaScript date utility library' },
  { name: 'validator-js', url: 'https://github.com/validatorjs/validator.js', language: 'javascript', topics: ['validation', 'string', 'sanitize', 'email', 'url'], license: 'MIT', stars: 22000, description: 'String validation and sanitization' },

  // JavaScript — Data Structures & Algorithms
  { name: 'javascript-algorithms', url: 'https://github.com/trekhleb/javascript-algorithms', language: 'javascript', topics: ['algorithm', 'data-structure', 'sorting', 'searching', 'graph', 'tree', 'dynamic-programming'], license: 'MIT', stars: 181000, description: 'Algorithms and data structures implemented in JavaScript' },
  { name: 'mnemonist', url: 'https://github.com/Yomguithereal/mnemonist', language: 'javascript', topics: ['data-structure', 'trie', 'heap', 'queue', 'graph', 'bloom-filter', 'cache'], license: 'MIT', stars: 2700, description: 'Curated collection of data structures for the JavaScript/TypeScript language' },

  // TypeScript
  { name: 'ts-pattern', url: 'https://github.com/gvergnaud/ts-pattern', language: 'typescript', topics: ['pattern-matching', 'typescript', 'functional', 'type-safe'], license: 'MIT', stars: 10000, description: 'Exhaustive Pattern Matching library for TypeScript' },
  { name: 'zod', url: 'https://github.com/colinhacks/zod', language: 'typescript', topics: ['validation', 'schema', 'type-safe', 'parsing', 'typescript'], license: 'MIT', stars: 30000, description: 'TypeScript-first schema validation with static type inference' },
  { name: 'effect', url: 'https://github.com/Effect-TS/effect', language: 'typescript', topics: ['functional', 'effect-system', 'error-handling', 'concurrency', 'typescript'], license: 'MIT', stars: 6000, description: 'A fully-fledged functional effect system for TypeScript' },

  // Python — Utilities
  { name: 'more-itertools', url: 'https://github.com/more-itertools/more-itertools', language: 'python', topics: ['utility', 'iterator', 'functional', 'collection', 'combinatorics'], license: 'MIT', stars: 3400, description: 'More routines for operating on iterables, beyond itertools' },
  { name: 'toolz', url: 'https://github.com/pytoolz/toolz', language: 'python', topics: ['functional', 'utility', 'curry', 'compose', 'pipeline', 'immutable'], license: 'BSD-3-Clause', stars: 4500, description: 'A functional standard library for Python' },
  { name: 'python-patterns', url: 'https://github.com/faif/python-patterns', language: 'python', topics: ['design-pattern', 'creational', 'structural', 'behavioral', 'concurrency'], license: 'MIT', stars: 39000, description: 'Collection of design patterns and idioms in Python' },
  { name: 'algorithms-python', url: 'https://github.com/TheAlgorithms/Python', language: 'python', topics: ['algorithm', 'data-structure', 'sorting', 'searching', 'math', 'graph', 'dynamic-programming'], license: 'MIT', stars: 178000, description: 'All algorithms implemented in Python' },

  // Go
  { name: 'gods', url: 'https://github.com/emirpasber/gods', language: 'go', topics: ['data-structure', 'tree', 'map', 'set', 'stack', 'queue', 'list'], license: 'BSD-2-Clause', stars: 15000, description: 'GoDS — Go Data Structures' },
  { name: 'lo', url: 'https://github.com/samber/lo', language: 'go', topics: ['utility', 'functional', 'generics', 'collection', 'map', 'filter'], license: 'MIT', stars: 15000, description: 'A Lodash-style Go library based on Go 1.18+ Generics' },
  { name: 'golang-set', url: 'https://github.com/deckarep/golang-set', language: 'go', topics: ['data-structure', 'set', 'collection', 'generics'], license: 'MIT', stars: 3500, description: 'A simple, battle-tested and generic set type for the Go language' },

  // Rust
  { name: 'itertools-rs', url: 'https://github.com/rust-itertools/itertools', language: 'rust', topics: ['iterator', 'utility', 'functional', 'collection', 'combinatorics'], license: 'MIT', stars: 2500, description: 'Extra iterator adaptors, functions and macros for Rust' },
  { name: 'rayon', url: 'https://github.com/rayon-rs/rayon', language: 'rust', topics: ['parallel', 'concurrency', 'iterator', 'data-parallelism'], license: 'MIT', stars: 10000, description: 'Data parallelism library for Rust' },

  // Multi-language
  { name: 'the-algorithms-js', url: 'https://github.com/TheAlgorithms/JavaScript', language: 'javascript', topics: ['algorithm', 'data-structure', 'sorting', 'searching', 'math', 'graph', 'cipher'], license: 'GPL-3.0', stars: 31000, description: 'Algorithms and Data Structures implemented in JavaScript' },
  { name: 'the-algorithms-go', url: 'https://github.com/TheAlgorithms/Go', language: 'go', topics: ['algorithm', 'data-structure', 'sorting', 'searching', 'math', 'graph'], license: 'MIT', stars: 14000, description: 'Algorithms and Data Structures implemented in Go' },
  { name: 'the-algorithms-rust', url: 'https://github.com/TheAlgorithms/Rust', language: 'rust', topics: ['algorithm', 'data-structure', 'sorting', 'searching', 'math'], license: 'MIT', stars: 20000, description: 'All algorithms implemented in Rust' },
];

/**
 * List all curated repos, optionally filtered.
 */
function listRegistry(options = {}) {
  const { language, topic } = options;
  let repos = [...CURATED_REPOS];

  if (language) {
    repos = repos.filter(r => r.language === language);
  }
  if (topic) {
    const t = topic.toLowerCase();
    repos = repos.filter(r => r.topics.some(rt => rt.includes(t)) || r.description.toLowerCase().includes(t));
  }

  return repos;
}

/**
 * Search the curated registry by query string.
 * Scores each repo on name match, topic match, and description match.
 */
function searchRegistry(query, options = {}) {
  const { language, limit = 10 } = options;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let repos = [...CURATED_REPOS];

  if (language) {
    repos = repos.filter(r => r.language === language);
  }

  const scored = repos.map(repo => {
    let score = 0;
    for (const term of terms) {
      if (repo.name.toLowerCase().includes(term)) score += 3;
      if (repo.topics.some(t => t.includes(term))) score += 2;
      if (repo.description.toLowerCase().includes(term)) score += 1;
    }
    return { ...repo, score };
  });

  return scored
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get a curated repo by name.
 */
function getRegistryEntry(name) {
  return CURATED_REPOS.find(r => r.name.toLowerCase() === name.toLowerCase()) || null;
}

// ─── Layer 2: Batch Import ──────────────────────────────────────────────────

/**
 * Batch import from multiple repos.
 * @param {object} oracle — RemembranceOracle instance
 * @param {Array<string|object>} sources — Array of repo names (from registry) or { url, branch } objects
 * @param {object} options — { language, dryRun, splitMode, maxFiles, skipLicense, concurrency }
 * @returns {{ total, succeeded, failed, results: [] }}
 */
function batchImport(oracle, sources, options = {}) {
  const { language, dryRun = false, splitMode = 'file', maxFiles = 200, skipLicenseCheck = false } = options;
  const { harvest } = require('./harvest');

  const result = {
    total: sources.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    results: [],
  };

  for (const source of sources) {
    let url, branch, repoName, repoLicense;

    if (typeof source === 'string') {
      // Look up in registry first
      const entry = getRegistryEntry(source);
      if (entry) {
        url = entry.url;
        repoName = entry.name;
        repoLicense = entry.license;
      } else if (source.startsWith('http') || source.startsWith('git@') || source.includes('github.com')) {
        url = source;
        repoName = extractRepoName(source);
      } else {
        result.failed++;
        result.results.push({ source, status: 'failed', reason: 'Not found in registry and not a URL' });
        continue;
      }
    } else {
      url = source.url;
      branch = source.branch;
      repoName = source.name || extractRepoName(source.url);
      repoLicense = source.license;
    }

    // Layer 4: License check
    if (!skipLicenseCheck && repoLicense) {
      const licenseResult = checkLicense(repoLicense);
      if (!licenseResult.allowed) {
        result.skipped++;
        result.results.push({ source: repoName, status: 'skipped', reason: `Incompatible license: ${repoLicense} — ${licenseResult.reason}` });
        continue;
      }
    }

    try {
      const harvestResult = harvest(oracle, url, {
        language,
        dryRun,
        splitMode,
        branch,
        maxFiles,
      });

      // Layer 5: Track provenance
      if (!dryRun && harvestResult.registered > 0) {
        const commitHash = getRepoCommitHash(url, branch);
        trackProvenance(oracle, harvestResult, {
          repoUrl: url,
          repoName,
          license: repoLicense || detectLicenseFromClone(url),
          commitHash,
          branch: branch || 'main',
        });
      }

      result.succeeded++;
      result.results.push({
        source: repoName,
        status: 'success',
        harvested: harvestResult.harvested,
        registered: harvestResult.registered,
        skipped: harvestResult.skipped,
        failed: harvestResult.failed,
      });
    } catch (err) {
      result.failed++;
      result.results.push({ source: repoName, status: 'failed', reason: err.message });
    }
  }

  return result;
}

// ─── Layer 3: GitHub Search ─────────────────────────────────────────────────

/**
 * Search GitHub for repos by topic/language/stars via the GitHub API.
 * Requires network access; falls back gracefully if unavailable.
 *
 * @param {string} query — Search terms
 * @param {object} options — { language, minStars, sort, limit }
 * @returns {Promise<Array<{ name, url, description, stars, language, license, topics }>>}
 */
function discoverRepos(query, options = {}) {
  const { language, minStars = 100, sort = 'stars', limit = 10 } = options;

  let q = encodeURIComponent(query);
  if (language) q += `+language:${encodeURIComponent(language)}`;
  if (minStars > 0) q += `+stars:>=${minStars}`;

  const apiUrl = `https://api.github.com/search/repositories?q=${q}&sort=${sort}&order=desc&per_page=${Math.min(limit, 30)}`;

  return new Promise((resolve, reject) => {
    const req = https.get(apiUrl, {
      headers: {
        'User-Agent': 'remembrance-oracle-toolkit',
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.items) {
            resolve([]);
            return;
          }
          const repos = json.items.slice(0, limit).map(item => ({
            name: item.full_name?.split('/')[1] || item.name,
            fullName: item.full_name,
            url: item.html_url,
            description: item.description || '',
            stars: item.stargazers_count || 0,
            language: (item.language || 'unknown').toLowerCase(),
            license: item.license?.spdx_id || 'unknown',
            topics: item.topics || [],
            updatedAt: item.updated_at,
          }));
          resolve(repos);
        } catch (err) {
          reject(new Error('Failed to parse GitHub API response: ' + err.message));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error('GitHub API request failed: ' + err.message));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GitHub API request timed out'));
    });
  });
}

/**
 * Synchronous GitHub search fallback using `curl` (for CLI use).
 * Returns same shape as discoverRepos.
 */
function discoverReposSync(query, options = {}) {
  const { language, minStars = 100, sort = 'stars', limit = 10 } = options;

  let q = query;
  if (language) q += ` language:${language}`;
  if (minStars > 0) q += ` stars:>=${minStars}`;

  const encodedQ = encodeURIComponent(q);
  const apiUrl = `https://api.github.com/search/repositories?q=${encodedQ}&sort=${sort}&order=desc&per_page=${Math.min(limit, 30)}`;

  try {
    const response = execSync(
      `curl -s -H "User-Agent: remembrance-oracle-toolkit" -H "Accept: application/vnd.github.v3+json" "${apiUrl}"`,
      { timeout: 20000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const json = JSON.parse(response);
    if (!json.items) return [];

    return json.items.slice(0, limit).map(item => ({
      name: item.full_name?.split('/')[1] || item.name,
      fullName: item.full_name,
      url: item.html_url,
      description: item.description || '',
      stars: item.stargazers_count || 0,
      language: (item.language || 'unknown').toLowerCase(),
      license: item.license?.spdx_id || 'unknown',
      topics: item.topics || [],
      updatedAt: item.updated_at,
    }));
  } catch {
    return [];
  }
}

// ─── Layer 4: License Checking ──────────────────────────────────────────────

/**
 * SPDX license compatibility map.
 * Permissive licenses are always allowed.
 * Copyleft licenses are allowed with a warning.
 * Proprietary/unknown licenses are blocked.
 */
const LICENSE_CATEGORIES = {
  // Permissive — always safe
  'MIT': { allowed: true, category: 'permissive', reason: 'Permissive license — free to use' },
  'Apache-2.0': { allowed: true, category: 'permissive', reason: 'Permissive license — free to use' },
  'BSD-2-Clause': { allowed: true, category: 'permissive', reason: 'Permissive license — free to use' },
  'BSD-3-Clause': { allowed: true, category: 'permissive', reason: 'Permissive license — free to use' },
  'ISC': { allowed: true, category: 'permissive', reason: 'Permissive license — free to use' },
  'Unlicense': { allowed: true, category: 'permissive', reason: 'Public domain — free to use' },
  'CC0-1.0': { allowed: true, category: 'permissive', reason: 'Public domain — free to use' },
  'CC-BY-4.0': { allowed: true, category: 'permissive', reason: 'Creative Commons Attribution — free with attribution' },
  'Zlib': { allowed: true, category: 'permissive', reason: 'Permissive license — free to use' },
  'BSL-1.0': { allowed: true, category: 'permissive', reason: 'Boost Software License — free to use' },
  '0BSD': { allowed: true, category: 'permissive', reason: 'Zero-clause BSD — free to use' },

  // Weak copyleft — allowed with warning
  'LGPL-2.1': { allowed: true, category: 'weak-copyleft', reason: 'Weak copyleft — library use is fine, modifications must share' },
  'LGPL-3.0': { allowed: true, category: 'weak-copyleft', reason: 'Weak copyleft — library use is fine, modifications must share' },
  'MPL-2.0': { allowed: true, category: 'weak-copyleft', reason: 'Weak copyleft — file-level copyleft, rest is fine' },
  'EPL-2.0': { allowed: true, category: 'weak-copyleft', reason: 'Eclipse Public License — module-level copyleft' },

  // Strong copyleft — blocked by default (patterns become derivative works)
  'GPL-2.0': { allowed: false, category: 'strong-copyleft', reason: 'Strong copyleft — patterns may become derivative works' },
  'GPL-3.0': { allowed: false, category: 'strong-copyleft', reason: 'Strong copyleft — patterns may become derivative works' },
  'AGPL-3.0': { allowed: false, category: 'strong-copyleft', reason: 'Network copyleft — even server use triggers sharing requirement' },

  // Unknown
  'NOASSERTION': { allowed: false, category: 'unknown', reason: 'No license assertion — cannot determine usage rights' },
  'unknown': { allowed: false, category: 'unknown', reason: 'Unknown license — cannot determine usage rights' },
};

/**
 * Check if a license is compatible for pattern harvesting.
 * @param {string} spdxId — SPDX license identifier
 * @param {object} options — { allowCopyleft: false }
 * @returns {{ allowed: boolean, category: string, reason: string }}
 */
function checkLicense(spdxId, options = {}) {
  const { allowCopyleft = false } = options;
  const normalized = spdxId?.trim() || 'unknown';
  const entry = LICENSE_CATEGORIES[normalized];

  if (entry) {
    if (allowCopyleft && entry.category === 'strong-copyleft') {
      return { ...entry, allowed: true, reason: entry.reason + ' (override: allowCopyleft)' };
    }
    return entry;
  }

  // Fallback: check if it looks permissive
  const upper = normalized.toUpperCase();
  if (upper.includes('MIT') || upper.includes('BSD') || upper.includes('APACHE') || upper.includes('ISC')) {
    return { allowed: true, category: 'permissive', reason: 'Appears permissive based on name' };
  }

  return { allowed: false, category: 'unknown', reason: `Unrecognized license: ${normalized}` };
}

/**
 * Detect license from a cloned repo by reading LICENSE/COPYING file.
 */
function detectLicenseFromClone(repoUrl) {
  let tmpDir;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-license-'));
    execSync(`git clone --depth 1 --filter=blob:none --sparse ${repoUrl} ${tmpDir}`, {
      timeout: 30000, stdio: 'pipe', encoding: 'utf-8',
    });

    // Check out only license files
    try {
      execSync('git sparse-checkout set LICENSE LICENSE.md COPYING COPYING.md', {
        cwd: tmpDir, timeout: 5000, stdio: 'pipe', encoding: 'utf-8',
      });
    } catch {
      // sparse-checkout may not be available in all git versions
    }

    const licenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'COPYING.md'];
    for (const f of licenseFiles) {
      const fp = path.join(tmpDir, f);
      if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, 'utf-8').toLowerCase();
        if (content.includes('mit license')) return 'MIT';
        if (content.includes('apache license')) return 'Apache-2.0';
        if (content.includes('bsd 2-clause')) return 'BSD-2-Clause';
        if (content.includes('bsd 3-clause')) return 'BSD-3-Clause';
        if (content.includes('isc license')) return 'ISC';
        if (content.includes('gnu general public license') && content.includes('version 3')) return 'GPL-3.0';
        if (content.includes('gnu general public license') && content.includes('version 2')) return 'GPL-2.0';
        if (content.includes('gnu lesser general public')) return 'LGPL-3.0';
        if (content.includes('mozilla public license')) return 'MPL-2.0';
        if (content.includes('the unlicense')) return 'Unlicense';
        if (content.includes('creative commons')) return 'CC-BY-4.0';
      }
    }

    // Try package.json
    const pkgPath = path.join(tmpDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.license) return pkg.license;
      } catch { /* ignore */ }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

// ─── Layer 5: Provenance Tracking ───────────────────────────────────────────

/**
 * Store provenance metadata for harvested patterns.
 * Encodes source info into the pattern's tags and description.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {object} harvestResult — Result from harvest()
 * @param {object} provenance — { repoUrl, repoName, license, commitHash, branch }
 */
function trackProvenance(oracle, harvestResult, provenance) {
  const { repoUrl, repoName, license, commitHash, branch } = provenance;
  const provenanceTag = `source:${repoName}`;
  const licenseTag = license ? `license:${license}` : null;

  for (const p of harvestResult.patterns) {
    if (p.status !== 'registered') continue;

    // Find the pattern by name and update tags + description
    const existing = oracle.patterns.getAll().find(pat => pat.name === p.name);
    if (!existing) continue;

    const newTags = [...new Set([
      ...existing.tags,
      provenanceTag,
      licenseTag,
      'open-source',
    ].filter(Boolean))];

    const provenanceSuffix = ` [source: ${repoUrl}${commitHash ? '@' + commitHash.slice(0, 8) : ''}${license ? ', license: ' + license : ''}]`;
    const newDesc = existing.description.includes('[source:')
      ? existing.description
      : existing.description + provenanceSuffix;

    oracle.patterns.update(existing.id, {
      tags: newTags,
      description: newDesc,
    });
  }
}

/**
 * Get the latest commit hash from a repo URL.
 */
function getRepoCommitHash(repoUrl, branch) {
  try {
    const ref = branch || 'HEAD';
    const output = execSync(`git ls-remote ${repoUrl} ${ref}`, {
      timeout: 15000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const match = output.match(/^([0-9a-f]+)\s/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Query provenance info for patterns from a specific source.
 */
function getProvenance(oracle, options = {}) {
  const { source, license: licenseFilter } = options;
  const all = oracle.patterns.getAll();

  return all.filter(p => {
    if (source) {
      const hasSourceTag = p.tags.some(t => t.startsWith('source:') && t.includes(source));
      if (!hasSourceTag) return false;
    } else {
      if (!p.tags.some(t => t.startsWith('source:'))) return false;
    }
    if (licenseFilter) {
      const lf = licenseFilter.toLowerCase();
      if (!p.tags.some(t => t.toLowerCase() === `license:${lf}`)) return false;
    }
    return true;
  }).map(p => {
    const sourceTag = p.tags.find(t => t.startsWith('source:'));
    const licenseTag = p.tags.find(t => t.startsWith('license:'));
    return {
      id: p.id,
      name: p.name,
      language: p.language,
      source: sourceTag ? sourceTag.replace('source:', '') : 'unknown',
      license: licenseTag ? licenseTag.replace('license:', '') : 'unknown',
      coherency: p.coherencyScore?.total ?? 0,
    };
  });
}

// ─── Layer 6: Deduplication ─────────────────────────────────────────────────

/**
 * Compute a normalized fingerprint for code.
 * Strips whitespace, comments, and variable names to find structural duplicates.
 */
function codeFingerprint(code) {
  if (!code || typeof code !== 'string') return '';

  let normalized = code
    // Remove single-line comments
    .replace(/\/\/[^\n]*/g, '')
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove Python comments
    .replace(/#[^\n]*/g, '')
    // Collapse all whitespace to single space
    .replace(/\s+/g, ' ')
    // Remove spaces around punctuation (parens, braces, brackets, commas, semicolons)
    .replace(/\s*([(){}[\];,:.=+\-*/<>!&|^~?])\s*/g, '$1')
    // Remove string literals (replace with placeholder)
    .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '""')
    // Remove number literals
    .replace(/\b\d+\.?\d*\b/g, '0')
    .trim();

  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Compute structural similarity between two code strings.
 * Returns 0-1 score using token-level Jaccard similarity.
 */
function codeSimilarity(codeA, codeB) {
  if (!codeA || !codeB) return 0;

  const tokenize = (code) => {
    return code
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/#[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .split(/[\s{}()\[\];,.:=+\-*/<>!&|^~?@#]+/)
      .filter(t => t.length > 0);
  };

  const tokensA = new Set(tokenize(codeA));
  const tokensB = new Set(tokenize(codeB));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Find duplicate or near-duplicate patterns in the library.
 * @param {object} oracle — RemembranceOracle instance
 * @param {object} options — { threshold, language }
 * @returns {Array<{ pattern1, pattern2, similarity, fingerprint }>}
 */
function findDuplicates(oracle, options = {}) {
  const { threshold = 0.85, language } = options;
  const patterns = oracle.patterns.getAll(language ? { language } : {});
  const duplicates = [];
  const fingerprints = new Map();

  // Phase 1: Exact fingerprint matches
  for (const p of patterns) {
    const fp = codeFingerprint(p.code);
    if (fingerprints.has(fp)) {
      const existing = fingerprints.get(fp);
      duplicates.push({
        pattern1: { id: existing.id, name: existing.name },
        pattern2: { id: p.id, name: p.name },
        similarity: 1.0,
        type: 'exact',
      });
    } else {
      fingerprints.set(fp, p);
    }
  }

  // Phase 2: Near-duplicate detection (only if under 500 patterns to avoid O(n^2) blowup)
  if (patterns.length <= 500) {
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const sim = codeSimilarity(patterns[i].code, patterns[j].code);
        if (sim >= threshold && sim < 1.0) {
          // Check it's not already found as exact
          const alreadyFound = duplicates.some(d =>
            (d.pattern1.id === patterns[i].id && d.pattern2.id === patterns[j].id) ||
            (d.pattern1.id === patterns[j].id && d.pattern2.id === patterns[i].id)
          );
          if (!alreadyFound) {
            duplicates.push({
              pattern1: { id: patterns[i].id, name: patterns[i].name },
              pattern2: { id: patterns[j].id, name: patterns[j].name },
              similarity: Math.round(sim * 1000) / 1000,
              type: 'near-duplicate',
            });
          }
        }
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Check if code already exists in the library (before importing).
 * Returns the matching pattern if found, null otherwise.
 */
function isDuplicate(oracle, code, options = {}) {
  const { threshold = 0.85 } = options;
  const fp = codeFingerprint(code);
  const patterns = oracle.patterns.getAll();

  // Fast path: exact fingerprint match
  for (const p of patterns) {
    if (codeFingerprint(p.code) === fp) {
      return { duplicate: true, match: { id: p.id, name: p.name }, similarity: 1.0, type: 'exact' };
    }
  }

  // Slow path: similarity check (sample up to 100 for performance)
  const sample = patterns.length > 100 ? patterns.slice(0, 100) : patterns;
  for (const p of sample) {
    const sim = codeSimilarity(code, p.code);
    if (sim >= threshold) {
      return { duplicate: true, match: { id: p.id, name: p.name }, similarity: Math.round(sim * 1000) / 1000, type: 'near-duplicate' };
    }
  }

  return { duplicate: false };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractRepoName(url) {
  if (!url) return 'unknown';
  const match = url.match(/\/([^/]+?)(?:\.git)?$/);
  return match ? match[1] : 'unknown';
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Layer 1: Curated registry
  CURATED_REPOS,
  listRegistry,
  searchRegistry,
  getRegistryEntry,

  // Layer 2: Batch import
  batchImport,

  // Layer 3: GitHub search
  discoverRepos,
  discoverReposSync,

  // Layer 4: License checking
  LICENSE_CATEGORIES,
  checkLicense,
  detectLicenseFromClone,

  // Layer 5: Provenance tracking
  trackProvenance,
  getRepoCommitHash,
  getProvenance,

  // Layer 6: Deduplication
  codeFingerprint,
  codeSimilarity,
  findDuplicates,
  isDuplicate,

  // Helpers
  extractRepoName,
};
