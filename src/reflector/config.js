/**
 * Remembrance Self-Reflector — Central Configuration
 *
 * A unified configuration system for all reflector features:
 *
 * 1. Thresholds — coherence, auto-merge, approval
 * 2. Exclusions — directories, files, extensions
 * 3. Scoring Weights — how dimensions contribute to aggregate score
 * 4. Safety — backup strategy, auto-rollback, approval gate
 * 5. Schedule — interval, max files, skip-if-open
 * 6. GitHub — push, open PR, labels, auto-merge
 *
 * Config is stored as JSON in `.remembrance/reflector-central.json`.
 * CLI commands: `reflector central`, `reflector central-set`, `reflector central-reset`
 *
 * Uses only Node.js built-ins.
 */

const { join } = require('path');
const { loadJSON, saveJSON } = require('./utils');

// ─── Default Configuration ───

const CENTRAL_DEFAULTS = {
  // ── Thresholds ──
  thresholds: {
    minCoherence: 0.7,           // Files below this get healed
    autoMergeThreshold: 0.9,     // Auto-merge PRs above this
    targetCoherence: 0.95,       // SERF target per file
    approvalFileThreshold: 10,   // Require approval if more files than this
  },

  // ── Scanning ──
  scanning: {
    maxFilesPerRun: 50,
    maxFileSizeBytes: 100000,    // 100KB
    includeExtensions: ['.js', '.ts', '.py', '.go', '.rs', '.java', '.jsx', '.tsx'],
    excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.remembrance', 'vendor', '__pycache__'],
    excludeFiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
  },

  // ── Healing ──
  healing: {
    maxSerfLoops: 3,             // Max SERF iterations per file
    enabled: true,               // Enable/disable healing
  },

  // ── Safety ──
  safety: {
    backupStrategy: 'git-branch', // 'git-branch' or 'file-copy'
    autoRollback: true,           // Auto-rollback on coherence drop
    requireApproval: false,       // Require manual approval before merge
    dryRunByDefault: false,       // Default to dry-run mode
  },

  // ── Scoring Weights ──
  scoring: {
    serfCoherence: 0.30,
    complexity: 0.15,
    commentQuality: 0.10,
    security: 0.20,
    nesting: 0.10,
    quality: 0.15,
  },

  // ── Schedule ──
  schedule: {
    enabled: true,
    intervalHours: 6,
    skipIfPROpen: true,
    maxRunHistory: 50,
  },

  // ── GitHub ──
  github: {
    push: false,
    openPR: false,
    autoMerge: false,
    labels: 'remembrance,auto-heal',
    prTitlePrefix: 'Remembrance Pull: Healed Refinement',
  },

  // ── Logging ──
  logging: {
    verbose: false,
    logToFile: true,
    logFilePath: '.remembrance/reflector.log',
    maxLogSizeMB: 10,
  },
};

// ─── Config Path ───

function getCentralConfigPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-central.json');
}

// ─── Load / Save ───

/**
 * Load the central configuration, merging with defaults.
 * Missing fields are filled from CENTRAL_DEFAULTS.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} Merged configuration
 */
function loadCentralConfig(rootDir) {
  const raw = loadJSON(getCentralConfigPath(rootDir), null);
  if (raw) return deepMerge(CENTRAL_DEFAULTS, raw);
  return deepClone(CENTRAL_DEFAULTS);
}

/**
 * Save the central configuration.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration object
 * @returns {object} Saved configuration
 */
function saveCentralConfig(rootDir, config) {
  return saveJSON(getCentralConfigPath(rootDir), config);
}

/**
 * Update specific fields in the central config using dot-notation paths.
 *
 * Examples:
 *   setCentralValue(rootDir, 'thresholds.minCoherence', 0.8)
 *   setCentralValue(rootDir, 'safety.autoRollback', false)
 *   setCentralValue(rootDir, 'scanning.excludeDirs', ['node_modules', '.git', 'dist'])
 *
 * @param {string} rootDir - Repository root
 * @param {string} path - Dot-notation path (e.g., 'thresholds.minCoherence')
 * @param {*} value - Value to set
 * @returns {object} Updated configuration
 */
function setCentralValue(rootDir, path, value) {
  const config = loadCentralConfig(rootDir);
  setNestedValue(config, path, value);
  return saveCentralConfig(rootDir, config);
}

/**
 * Get a specific field from the central config using dot-notation.
 *
 * @param {string} rootDir - Repository root
 * @param {string} path - Dot-notation path
 * @returns {*} Value at path
 */
function getCentralValue(rootDir, path) {
  const config = loadCentralConfig(rootDir);
  return getNestedValue(config, path);
}

/**
 * Reset the central config to defaults.
 *
 * @param {string} rootDir - Repository root
 * @param {string} [section] - Optional section to reset (e.g., 'thresholds')
 * @returns {object} Reset configuration
 */
function resetCentralConfig(rootDir, section) {
  if (section) {
    const config = loadCentralConfig(rootDir);
    if (section in CENTRAL_DEFAULTS) {
      config[section] = deepClone(CENTRAL_DEFAULTS[section]);
    }
    return saveCentralConfig(rootDir, config);
  }
  return saveCentralConfig(rootDir, deepClone(CENTRAL_DEFAULTS));
}

/**
 * Validate a configuration object against the schema.
 * Returns a list of issues found.
 *
 * @param {object} config - Configuration to validate
 * @returns {object} { valid, issues[] }
 */
function validateConfig(config) {
  const issues = [];

  // Threshold checks
  if (config.thresholds) {
    const t = config.thresholds;
    if (typeof t.minCoherence === 'number' && (t.minCoherence < 0 || t.minCoherence > 1)) {
      issues.push('thresholds.minCoherence must be between 0 and 1');
    }
    if (typeof t.autoMergeThreshold === 'number' && (t.autoMergeThreshold < 0 || t.autoMergeThreshold > 1)) {
      issues.push('thresholds.autoMergeThreshold must be between 0 and 1');
    }
    if (typeof t.targetCoherence === 'number' && (t.targetCoherence < 0 || t.targetCoherence > 1)) {
      issues.push('thresholds.targetCoherence must be between 0 and 1');
    }
    if (typeof t.approvalFileThreshold === 'number' && t.approvalFileThreshold < 1) {
      issues.push('thresholds.approvalFileThreshold must be at least 1');
    }
  }

  // Scanning checks
  if (config.scanning) {
    const s = config.scanning;
    if (typeof s.maxFilesPerRun === 'number' && s.maxFilesPerRun < 1) {
      issues.push('scanning.maxFilesPerRun must be at least 1');
    }
    if (typeof s.maxFileSizeBytes === 'number' && s.maxFileSizeBytes < 100) {
      issues.push('scanning.maxFileSizeBytes must be at least 100');
    }
    if (s.includeExtensions && !Array.isArray(s.includeExtensions)) {
      issues.push('scanning.includeExtensions must be an array');
    }
    if (s.excludeDirs && !Array.isArray(s.excludeDirs)) {
      issues.push('scanning.excludeDirs must be an array');
    }
  }

  // Scoring weight checks
  if (config.scoring) {
    const weights = Object.values(config.scoring);
    if (weights.some(w => typeof w === 'number' && (w < 0 || w > 1))) {
      issues.push('scoring weights must be between 0 and 1');
    }
    const sum = weights.filter(w => typeof w === 'number').reduce((s, w) => s + w, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      issues.push(`scoring weights should sum to 1.0 (current sum: ${sum.toFixed(3)})`);
    }
  }

  // Schedule checks
  if (config.schedule) {
    if (typeof config.schedule.intervalHours === 'number' && config.schedule.intervalHours < 0.1) {
      issues.push('schedule.intervalHours must be at least 0.1');
    }
  }

  // Safety checks
  if (config.safety) {
    if (config.safety.backupStrategy && !['git-branch', 'file-copy'].includes(config.safety.backupStrategy)) {
      issues.push('safety.backupStrategy must be "git-branch" or "file-copy"');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Convert central config to flat engine config for reflect()/takeSnapshot() etc.
 * Maps central config sections to the flat format used by engine.js.
 *
 * @param {object} centralConfig - Central configuration
 * @returns {object} Flat engine configuration
 */
function toEngineConfig(centralConfig) {
  const c = centralConfig;
  return {
    minCoherence: c.thresholds?.minCoherence,
    autoMergeThreshold: c.thresholds?.autoMergeThreshold,
    targetCoherence: c.thresholds?.targetCoherence,
    maxFilesPerRun: c.scanning?.maxFilesPerRun,
    maxFileSizeBytes: c.scanning?.maxFileSizeBytes,
    includeExtensions: c.scanning?.includeExtensions,
    excludeDirs: c.scanning?.excludeDirs,
    excludeFiles: c.scanning?.excludeFiles,
    maxSerfLoops: c.healing?.maxSerfLoops,
    push: c.github?.push,
    openPR: c.github?.openPR,
    autoMerge: c.github?.autoMerge,
    // Safety
    dryRunMode: c.safety?.dryRunByDefault,
    requireApproval: c.safety?.requireApproval,
    autoRollback: c.safety?.autoRollback,
    approvalFileThreshold: c.thresholds?.approvalFileThreshold,
    // Scoring weights
    weights: c.scoring,
  };
}

/**
 * List all available configuration keys with their current values and types.
 *
 * @param {object} config - Configuration object
 * @param {string} [prefix] - Key prefix for recursion
 * @returns {object[]} Array of { key, value, type, section }
 */
function listConfigKeys(config, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(config)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...listConfigKeys(value, fullKey));
    } else {
      keys.push({
        key: fullKey,
        value,
        type: Array.isArray(value) ? 'array' : typeof value,
        section: prefix || key,
      });
    }
  }
  return keys;
}

// ─── Utilities ───

/**
 * Deep merge source into target (non-destructive).
 */
function deepMerge(target, source) {
  const result = deepClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
        key in result && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = deepClone(value);
    }
  }
  return result;
}

/**
 * Deep clone a value.
 */
function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = deepClone(v);
  }
  return result;
}

/**
 * Set a value at a dot-notation path in an object.
 */
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Get a value at a dot-notation path from an object.
 */
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Format the central config as human-readable text.
 */
function formatCentralConfig(config) {
  const lines = [];
  lines.push('── Remembrance Reflector Central Configuration ──');
  lines.push('');

  const sections = Object.keys(config);
  for (const section of sections) {
    lines.push(`[${section}]`);
    const value = config[section];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        const display = Array.isArray(v) ? v.join(', ') : String(v);
        lines.push(`  ${k.padEnd(24)} ${display}`);
      }
    } else {
      lines.push(`  ${String(value)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  CENTRAL_DEFAULTS,
  getCentralConfigPath,
  loadCentralConfig,
  saveCentralConfig,
  setCentralValue,
  getCentralValue,
  resetCentralConfig,
  validateConfig,
  toEngineConfig,
  listConfigKeys,
  formatCentralConfig,
  // Utilities exposed for testing
  deepMerge,
  deepClone,
  setNestedValue,
  getNestedValue,
};
