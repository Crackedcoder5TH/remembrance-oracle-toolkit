/**
 * Remembrance Self-Reflector — Consolidated Scoring Module
 *
 * Merges 6 modules into a single file:
 *
 *   1. Shared Utilities (from utils.js)
 *      - ensureDir, loadJSON, saveJSON, trimArray
 *
 *   2. Central Configuration (from config.js)
 *      - CENTRAL_DEFAULTS, load/save/set/get/reset/validate config
 *      - deepMerge, deepClone, setNestedValue, getNestedValue
 *
 *   3. Modes & Presets (from modes.js)
 *      - PRESET_MODES, ENV_OVERRIDES, resolveConfig, shouldAutoCreatePR
 *      - Mode management (get/set/list/format)
 *
 *   4. Error Handling (from errorHandler.js)
 *      - ERROR_TYPES, classifyError
 *      - withErrorHandling, withRetry, withCircuitBreaker
 *      - buildErrorReport
 *
 *   5. Deep Code Analysis (from scoring.js)
 *      - Cyclomatic complexity, comment density, security scan
 *      - Nesting depth, code quality metrics
 *      - deepScore, repoScore
 *
 *   6. Coherence Scorer (from coherenceScorer.js)
 *      - Weighted coherence formula (syntax, readability, security, test proof, reliability)
 *      - computeCoherence, computeRepoCoherence
 *
 * Uses only Node.js built-ins — no external linting tools required.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join, extname, relative, dirname, basename } = require('path');
const { detectLanguage } = require('../core/coherency');
const { observeCoherence } = require('../core/reflection');
const { covenantCheck } = require('../core/covenant');

// ─── Lazy requires to avoid circular dependencies ───

let _multi, _report;
function getMulti() { return _multi || (_multi = require('./multi')); }
function getReport() { return _report || (_report = require('./report')); }

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: Shared Utilities (from utils.js)
// ═══════════════════════════════════════════════════════════════════

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Load and parse a JSON file with a fallback value.
 * Returns a deep copy of the fallback (not a reference).
 *
 * @param {string} filePath - Absolute path to JSON file
 * @param {*} fallback - Value to return if file doesn't exist or parse fails
 * @returns {*} Parsed JSON or fallback
 */
function loadJSON(filePath, fallback = null) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Fall through to fallback
  }
  // Return a deep copy of fallback to prevent mutation
  return fallback !== null ? structuredClone(fallback) : null;
}

/**
 * Save data as JSON, ensuring the parent directory exists.
 *
 * @param {string} filePath - Absolute path to JSON file
 * @param {*} data - Data to serialize
 * @returns {*} The data that was saved
 */
function saveJSON(filePath, data) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

/**
 * Trim an array to keep only the last `maxLength` items.
 * Mutates the array in place.
 *
 * @param {Array} arr - Array to trim
 * @param {number} maxLength - Maximum items to keep
 * @returns {Array} The trimmed array
 */
function trimArray(arr, maxLength) {
  while (arr.length > maxLength) arr.shift();
  return arr;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: Central Configuration (from config.js)
// ═══════════════════════════════════════════════════════════════════

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

  // ── Auto-Commit ──
  autoCommit: {
    enabled: false,
    testCommand: 'node --test',
    branchPrefix: 'remembrance/auto-heal',
  },

  // ── Notifications ──
  notifications: {
    enabled: false,
    webhookUrl: '',
    platform: '',       // 'discord', 'slack', or '' for auto-detect
    repoName: '',       // Override repo name in notifications
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

  // Auto-commit checks
  if (config.autoCommit) {
    if (config.autoCommit.testCommand && typeof config.autoCommit.testCommand !== 'string') {
      issues.push('autoCommit.testCommand must be a string');
    }
    if (config.autoCommit.branchPrefix && typeof config.autoCommit.branchPrefix !== 'string') {
      issues.push('autoCommit.branchPrefix must be a string');
    }
  }

  // Notifications checks
  if (config.notifications) {
    if (config.notifications.platform && !['', 'discord', 'slack'].includes(config.notifications.platform)) {
      issues.push('notifications.platform must be "discord", "slack", or empty for auto-detect');
    }
    if (config.notifications.webhookUrl && typeof config.notifications.webhookUrl !== 'string') {
      issues.push('notifications.webhookUrl must be a string');
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

// ─── Config Utilities ───

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

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: Modes & Presets (from modes.js)
// ═══════════════════════════════════════════════════════════════════

// ─── Preset Modes ───

const PRESET_MODES = {
  strict: {
    thresholds: {
      minCoherence: 0.8,
      autoMergeThreshold: 0.95,
      targetCoherence: 0.98,
      approvalFileThreshold: 5,
      minCoherenceForAutoPR: 0.85,
    },
    scanning: {
      maxFilesPerRun: 30,
    },
    safety: {
      autoRollback: true,
      requireApproval: true,
      dryRunByDefault: false,
    },
    github: {
      autoMerge: false,
      openPR: true,
    },
    autoCommit: {
      enabled: true,
      testRequired: true,
      buildRequired: true,
    },
  },

  balanced: {
    thresholds: {
      minCoherence: 0.7,
      autoMergeThreshold: 0.9,
      targetCoherence: 0.95,
      approvalFileThreshold: 10,
      minCoherenceForAutoPR: 0.75,
    },
    scanning: {
      maxFilesPerRun: 50,
    },
    safety: {
      autoRollback: true,
      requireApproval: false,
      dryRunByDefault: false,
    },
    github: {
      autoMerge: false,
      openPR: true,
    },
    autoCommit: {
      enabled: true,
      testRequired: true,
      buildRequired: false,
    },
  },

  relaxed: {
    thresholds: {
      minCoherence: 0.5,
      autoMergeThreshold: 0.8,
      targetCoherence: 0.9,
      approvalFileThreshold: 20,
      minCoherenceForAutoPR: 0.6,
    },
    scanning: {
      maxFilesPerRun: 100,
    },
    safety: {
      autoRollback: true,
      requireApproval: false,
      dryRunByDefault: false,
    },
    github: {
      autoMerge: true,
      openPR: true,
    },
    autoCommit: {
      enabled: true,
      testRequired: false,
      buildRequired: false,
    },
  },
};

// ─── Environment Variable Overrides ───

/**
 * Map of environment variable names to config paths.
 */
const ENV_OVERRIDES = {
  REFLECTOR_MIN_COHERENCE: { path: 'thresholds.minCoherence', type: 'number' },
  REFLECTOR_AUTO_MERGE_THRESHOLD: { path: 'thresholds.autoMergeThreshold', type: 'number' },
  REFLECTOR_TARGET_COHERENCE: { path: 'thresholds.targetCoherence', type: 'number' },
  REFLECTOR_MIN_COHERENCE_FOR_AUTO_PR: { path: 'thresholds.minCoherenceForAutoPR', type: 'number' },
  REFLECTOR_MAX_FILES: { path: 'scanning.maxFilesPerRun', type: 'number' },
  REFLECTOR_AUTO_MERGE: { path: 'github.autoMerge', type: 'boolean' },
  REFLECTOR_AUTO_ROLLBACK: { path: 'safety.autoRollback', type: 'boolean' },
  REFLECTOR_REQUIRE_APPROVAL: { path: 'safety.requireApproval', type: 'boolean' },
  REFLECTOR_DRY_RUN: { path: 'safety.dryRunByDefault', type: 'boolean' },
  REFLECTOR_MODE: { path: '_mode', type: 'string' },
  REFLECTOR_PUSH: { path: 'github.push', type: 'boolean' },
  REFLECTOR_OPEN_PR: { path: 'github.openPR', type: 'boolean' },
  REFLECTOR_TEST_COMMAND: { path: 'autoCommit.testCommand', type: 'string' },
  REFLECTOR_BUILD_COMMAND: { path: 'autoCommit.buildCommand', type: 'string' },
};

/**
 * Read environment variable overrides from process.env.
 *
 * @param {object} [env] - Environment (defaults to process.env)
 * @returns {object} Flat map of config path -> value
 */
function readEnvOverrides(env) {
  const source = env || process.env;
  const overrides = {};

  for (const [envVar, { path, type }] of Object.entries(ENV_OVERRIDES)) {
    const raw = source[envVar];
    if (raw === undefined || raw === '') continue;

    let value;
    if (type === 'number') {
      value = parseFloat(raw);
      if (isNaN(value)) continue;
    } else if (type === 'boolean') {
      value = raw === 'true' || raw === '1';
    } else {
      value = raw;
    }

    overrides[path] = value;
  }

  return overrides;
}

/**
 * Apply flat overrides (dot-notation paths) onto a config object.
 */
function applyOverrides(config, overrides) {
  const result = deepClone(config);
  for (const [path, value] of Object.entries(overrides)) {
    if (path === '_mode') continue; // Mode is handled separately
    setNestedValue(result, path, value);
  }
  return result;
}

// ─── Mode-Aware Config Resolution ───

/**
 * Resolve the full config by layering: defaults -> mode preset -> saved config -> env overrides.
 *
 * Resolution order (later wins):
 * 1. Central defaults (from config.js)
 * 2. Mode preset (if mode is set)
 * 3. Saved config (from .remembrance/reflector-central.json)
 * 4. Environment variable overrides (REFLECTOR_*)
 * 5. Manual overrides (from options parameter)
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { mode, overrides, env }
 * @returns {object} Fully resolved config
 */
function resolveConfig(rootDir, options = {}) {
  const { mode, overrides = {}, env } = options;

  // Step 1: Load central config (already has defaults merged)
  let config = loadCentralConfig(rootDir);

  // Step 2: Determine mode (priority: options.mode > env > saved config)
  const envOverrides = readEnvOverrides(env);
  const effectiveMode = mode || envOverrides._mode || config._mode || null;

  if (effectiveMode && PRESET_MODES[effectiveMode]) {
    config = deepMerge(config, PRESET_MODES[effectiveMode]);
    config._mode = effectiveMode;
  }

  // Step 3: Apply env overrides
  if (Object.keys(envOverrides).length > 0) {
    config = applyOverrides(config, envOverrides);
  }

  // Step 4: Apply manual overrides
  if (Object.keys(overrides).length > 0) {
    config = deepMerge(config, overrides);
  }

  return config;
}

// ─── Auto-PR Gate ───

/**
 * Check if a healing run qualifies for automatic PR creation.
 * Uses the minCoherenceForAutoPR threshold from the resolved config.
 *
 * @param {object} report - Reflector report or orchestration result
 * @param {object} config - Resolved configuration
 * @returns {object} { shouldOpenPR, reason, coherence, threshold }
 */
function shouldAutoCreatePR(report, config = {}) {
  const threshold = config.thresholds?.minCoherenceForAutoPR
    || config.thresholds?.minCoherence
    || 0.7;

  // Get post-heal coherence from various report formats
  const coherence = report.coherence?.after
    || report.safety?.coherenceGuard?.postCoherence
    || report.report?.avgImprovement
    || 0;

  const filesHealed = report.report?.filesHealed
    || report.healing?.filesHealed
    || report.changes?.length
    || 0;

  if (filesHealed === 0) {
    return {
      shouldOpenPR: false,
      reason: 'No files were healed — nothing to PR.',
      coherence,
      threshold,
    };
  }

  if (coherence >= threshold) {
    return {
      shouldOpenPR: true,
      reason: `Post-heal coherence ${coherence.toFixed(3)} meets threshold ${threshold}. PR recommended.`,
      coherence,
      threshold,
    };
  }

  return {
    shouldOpenPR: false,
    reason: `Post-heal coherence ${coherence.toFixed(3)} is below threshold ${threshold}. Manual review needed.`,
    coherence,
    threshold,
  };
}

// ─── Mode Info ───

/**
 * Get information about a preset mode.
 */
function getModeInfo(modeName) {
  const preset = PRESET_MODES[modeName];
  if (!preset) return null;
  return {
    name: modeName,
    description: getModeDescription(modeName),
    settings: preset,
  };
}

/**
 * Get a human-readable description of a mode.
 */
function getModeDescription(modeName) {
  switch (modeName) {
    case 'strict':
      return 'High standards. Requires approval, no auto-merge, stricter thresholds. Best for production repos.';
    case 'balanced':
      return 'Recommended default. Reasonable thresholds, auto-rollback, no auto-merge. Good for active development.';
    case 'relaxed':
      return 'Permissive. Lower thresholds, auto-merge enabled, more files per run. Good for experimental repos.';
    default:
      return 'Custom configuration.';
  }
}

/**
 * List all available modes with descriptions.
 */
function listModes() {
  return Object.keys(PRESET_MODES).map(name => ({
    name,
    description: getModeDescription(name),
  }));
}

/**
 * Set mode for a repo (persists to central config).
 */
function setMode(rootDir, modeName) {
  if (!PRESET_MODES[modeName]) {
    return { error: `Unknown mode: ${modeName}. Available: ${Object.keys(PRESET_MODES).join(', ')}` };
  }

  const config = resolveConfig(rootDir, { mode: modeName });
  config._mode = modeName;
  saveCentralConfig(rootDir, config);

  return {
    mode: modeName,
    description: getModeDescription(modeName),
    applied: true,
  };
}

/**
 * Get the currently active mode for a repo.
 */
function getCurrentMode(rootDir) {
  const config = loadCentralConfig(rootDir);
  return config._mode || 'custom';
}

/**
 * Format the resolved config as human-readable text.
 */
function formatResolvedConfig(config) {
  const lines = [];
  const mode = config._mode || 'custom';
  lines.push(`── Reflector Configuration (mode: ${mode}) ──`);
  lines.push('');

  const sections = ['thresholds', 'scanning', 'healing', 'safety', 'scoring', 'github', 'autoCommit', 'schedule', 'logging'];
  for (const section of sections) {
    if (!config[section]) continue;
    lines.push(`[${section}]`);
    const value = config[section];
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        const display = Array.isArray(v) ? v.join(', ') : String(v);
        lines.push(`  ${k.padEnd(28)} ${display}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: Error Handling (from errorHandler.js)
// ═══════════════════════════════════════════════════════════════════

// ─── Error Classification ───

const ERROR_TYPES = {
  TRANSIENT: 'transient',       // Git timeout, file lock, temp disk issue
  FATAL: 'fatal',               // Code bug, missing module, corrupt data
  CONFIG: 'configuration',      // Bad config values, missing paths
  PERMISSION: 'permission',     // File permission denied, git auth failure
  RESOURCE: 'resource',         // Out of memory, disk full, too many files
};

/**
 * Classify an error by type based on its message and code.
 *
 * @param {Error} err - The error to classify
 * @returns {string} Error type from ERROR_TYPES
 */
function classifyError(err) {
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';

  // Permission errors
  if (code === 'EACCES' || code === 'EPERM' || msg.includes('permission denied') || msg.includes('authentication failed')) {
    return ERROR_TYPES.PERMISSION;
  }

  // Transient errors
  if (code === 'EAGAIN' || code === 'EBUSY' || code === 'ECONNRESET' || code === 'ETIMEDOUT' ||
      msg.includes('timeout') || msg.includes('lock') || msg.includes('busy') ||
      msg.includes('network') || msg.includes('connection refused') || msg.includes('econnreset')) {
    return ERROR_TYPES.TRANSIENT;
  }

  // Resource errors
  if (code === 'ENOMEM' || code === 'ENOSPC' || msg.includes('out of memory') || msg.includes('disk full') || msg.includes('no space')) {
    return ERROR_TYPES.RESOURCE;
  }

  // Configuration errors
  if (msg.includes('config') || msg.includes('invalid') && msg.includes('option') ||
      msg.includes('not found') && (msg.includes('path') || msg.includes('directory')) ||
      code === 'ENOENT') {
    return ERROR_TYPES.CONFIG;
  }

  return ERROR_TYPES.FATAL;
}

// ─── Structured Error Wrapper ───

/**
 * Wrap an operation with try/catch, logging, and optional fallback.
 *
 * @param {string} operationName - Name for logging (e.g., 'snapshot', 'heal')
 * @param {Function} fn - The operation to execute
 * @param {object} options - { rootDir, fallback, context, logLevel }
 * @returns {object} { success, result, error, errorType, durationMs }
 */
function withErrorHandling(operationName, fn, options = {}) {
  const {
    rootDir = process.cwd(),
    fallback = null,
    context = {},
    logLevel = 'ERROR',
  } = options;

  const startTime = Date.now();

  try {
    const result = fn();
    const durationMs = Date.now() - startTime;

    // Log success if verbose
    if (options.verbose) {
      const { appendLog } = getReport();
      appendLog(rootDir, 'INFO', `${operationName} completed`, { durationMs, ...context });
    }

    return {
      success: true,
      result,
      error: null,
      errorType: null,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorType = classifyError(err);

    // Log the error
    const { appendLog } = getReport();
    appendLog(rootDir, logLevel, `${operationName} failed: ${err.message}`, {
      errorType,
      stack: err.stack?.split('\n').slice(0, 5).join(' | '),
      durationMs,
      ...context,
    });

    // Use fallback if provided
    const fallbackValue = typeof fallback === 'function' ? fallback(err) : fallback;

    return {
      success: false,
      result: fallbackValue,
      error: err.message,
      errorType,
      durationMs,
      stack: err.stack,
    };
  }
}

// ─── Retry with Exponential Backoff ───

/**
 * Retry a synchronous operation with exponential backoff.
 * Only retries transient errors.
 *
 * @param {string} operationName - Name for logging
 * @param {Function} fn - Operation to retry
 * @param {object} options - { maxRetries, baseDelayMs, rootDir, context }
 * @returns {object} { success, result, error, attempts, totalMs }
 */
function withRetry(operationName, fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 100,
    rootDir = process.cwd(),
    context = {},
  } = options;

  const startTime = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = fn();
      return {
        success: true,
        result,
        error: null,
        attempts: attempt,
        totalMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err;
      const errorType = classifyError(err);

      // Only retry transient errors
      if (errorType !== ERROR_TYPES.TRANSIENT || attempt > maxRetries) {
        const { appendLog } = getReport();
        appendLog(rootDir, 'ERROR', `${operationName} failed (${errorType}, attempt ${attempt}/${maxRetries + 1})`, {
          error: err.message,
          errorType,
          attempt,
          ...context,
        });
        break;
      }

      // Exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      const { appendLog } = getReport();
      appendLog(rootDir, 'WARN', `${operationName} transient failure, retrying in ${delay}ms (attempt ${attempt})`, {
        error: err.message,
        delay,
        ...context,
      });

      // Synchronous sleep via Atomics.wait (non-spinning, CPU-friendly)
      try {
        const buf = new SharedArrayBuffer(4);
        Atomics.wait(new Int32Array(buf), 0, 0, delay);
      } catch {
        // Fallback for environments without SharedArrayBuffer
        const waitUntil = Date.now() + delay;
        while (Date.now() < waitUntil) { /* spin fallback */ }
      }
    }
  }

  return {
    success: false,
    result: null,
    error: lastError?.message || 'Unknown error',
    errorType: classifyError(lastError),
    attempts: maxRetries + 1,
    totalMs: Date.now() - startTime,
  };
}

// ─── Circuit Breaker ───

// In-memory state (resets on process restart)
const circuitState = new Map();

/**
 * Circuit breaker for operations that fail repeatedly.
 * After `threshold` consecutive failures, the circuit opens for `cooldownMs`.
 *
 * @param {string} operationName - Unique operation identifier
 * @param {Function} fn - Operation to execute
 * @param {object} options - { threshold, cooldownMs, rootDir }
 * @returns {object} { success, result, circuitOpen, failures }
 */
function withCircuitBreaker(operationName, fn, options = {}) {
  const {
    threshold = 5,
    cooldownMs = 60000,
    rootDir = process.cwd(),
  } = options;

  // Get or initialize circuit state
  if (!circuitState.has(operationName)) {
    circuitState.set(operationName, { failures: 0, lastFailure: 0, open: false });
  }
  const state = circuitState.get(operationName);

  // Check if circuit is open
  if (state.open) {
    if (Date.now() - state.lastFailure < cooldownMs) {
      return {
        success: false,
        result: null,
        error: `Circuit breaker open for "${operationName}". ${state.failures} consecutive failures. Cooldown: ${Math.round((cooldownMs - (Date.now() - state.lastFailure)) / 1000)}s remaining.`,
        circuitOpen: true,
        failures: state.failures,
      };
    }
    // Cooldown expired — try half-open
    state.open = false;
  }

  try {
    const result = fn();
    // Success — reset failures
    state.failures = 0;
    state.open = false;
    return { success: true, result, circuitOpen: false, failures: 0 };
  } catch (err) {
    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= threshold) {
      state.open = true;
      const { appendLog } = getReport();
      appendLog(rootDir, 'ERROR', `Circuit breaker opened for "${operationName}" after ${state.failures} failures`, {
        error: err.message,
        cooldownMs,
      });
    }

    return {
      success: false,
      result: null,
      error: err.message,
      circuitOpen: state.open,
      failures: state.failures,
    };
  }
}

/**
 * Reset circuit breaker state for an operation (or all operations).
 */
function resetCircuitBreaker(operationName) {
  if (operationName) {
    circuitState.delete(operationName);
  } else {
    circuitState.clear();
  }
}

/**
 * Get circuit breaker status for an operation.
 */
function getCircuitStatus(operationName) {
  return circuitState.get(operationName) || { failures: 0, lastFailure: 0, open: false };
}

// ─── Error Report ───

/**
 * Build a structured error report from recent log entries.
 *
 * @param {string} rootDir - Repository root
 * @param {number} lastN - Number of log entries to scan
 * @returns {object} Error summary
 */
function buildErrorReport(rootDir, lastN = 50) {
  const { readLogTail } = getReport();
  const lines = readLogTail(rootDir, lastN);
  const errors = lines.filter(l => l.includes('[ERROR]'));
  const warnings = lines.filter(l => l.includes('[WARN]'));

  // Count by error type
  const typeCounts = {};
  for (const line of errors) {
    // Try to extract error type from log data
    const typeMatch = line.match(/"errorType":"(\w+)"/);
    const type = typeMatch ? typeMatch[1] : 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  return {
    totalErrors: errors.length,
    totalWarnings: warnings.length,
    errorsByType: typeCounts,
    recentErrors: errors.slice(-5),
    recentWarnings: warnings.slice(-5),
    healthScore: errors.length === 0 ? 1.0 :
                 errors.length <= 2 ? 0.8 :
                 errors.length <= 5 ? 0.5 : 0.2,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: Deep Code Analysis (from scoring.js)
// ═══════════════════════════════════════════════════════════════════

// ─── Cyclomatic Complexity ───

/**
 * Calculate cyclomatic complexity for a code string.
 *
 * Counts decision points:
 *   if, else if, for, while, do, case, catch, &&, ||, ternary (?:)
 *
 * Starts at 1 (the base linear path). Each decision point adds 1.
 *
 * @param {string} code - Source code
 * @returns {object} { total, perFunction[], avgPerFunction, maxPerFunction }
 */
function calculateCyclomaticComplexity(code) {
  // Strip strings and comments to avoid false positives
  const stripped = stripStringsAndComments(code);

  // Count total decision points
  const decisionPoints = countDecisionPoints(stripped);

  // Extract per-function complexity
  const functions = extractFunctionBodies(code);
  const perFunction = functions.map(fn => {
    const fnStripped = stripStringsAndComments(fn.body);
    const points = countDecisionPoints(fnStripped);
    return {
      name: fn.name,
      complexity: 1 + points, // Base 1 + decision points
      line: fn.line,
    };
  });

  const total = 1 + decisionPoints;
  const avgPerFunction = perFunction.length > 0
    ? perFunction.reduce((s, f) => s + f.complexity, 0) / perFunction.length
    : total;
  const maxPerFunction = perFunction.length > 0
    ? Math.max(...perFunction.map(f => f.complexity))
    : total;

  return {
    total,
    perFunction,
    avgPerFunction: Math.round(avgPerFunction * 100) / 100,
    maxPerFunction,
    functionCount: functions.length,
  };
}

/**
 * Count decision points in stripped code.
 */
function countDecisionPoints(code) {
  let count = 0;

  // Control flow keywords
  const keywords = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcase\s+/g,
    /\bcatch\s*[({]/g,
  ];

  for (const pattern of keywords) {
    const matches = code.match(pattern);
    if (matches) count += matches.length;
  }

  // Logical operators (short-circuit = branching)
  const logicalOps = code.match(/&&|\|\|/g);
  if (logicalOps) count += logicalOps.length;

  // Ternary operator
  // Match ? that's not part of ?. (optional chaining) or ?? (nullish coalescing)
  const ternaries = code.match(/\?(?![\?.:])/g);
  if (ternaries) count += ternaries.length;

  return count;
}

/**
 * Extract function bodies with names and line numbers.
 */
function extractFunctionBodies(code) {
  const functions = [];
  const lines = code.split('\n');

  // Patterns to match function declarations
  const patterns = [
    // function name(...)
    /(?:^|\s)function\s+(\w+)\s*\([^)]*\)\s*\{/,
    // const/let/var name = function(...)
    /(?:const|let|var)\s+(\w+)\s*=\s*function\s*\([^)]*\)\s*\{/,
    // const/let/var name = (...) =>
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/,
    // method: name(...) { (class methods)
    /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
    // Python: def name(...)
    /def\s+(\w+)\s*\([^)]*\)\s*:/,
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern);
      if (match) {
        const name = match[1];
        // Find the function body (rough extraction)
        const body = extractBody(lines, i);
        if (body) {
          functions.push({ name, body, line: i + 1 });
        }
        break;
      }
    }
  }

  return functions;
}

/**
 * Extract a function body starting from a line (brace counting).
 */
function extractBody(lines, startLine) {
  let depth = 0;
  let started = false;
  const bodyLines = [];

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    bodyLines.push(line);

    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') depth--;
    }

    if (started && depth <= 0) break;

    // Python: use indentation (rough)
    if (i > startLine && !started) {
      // Check if this is a Python def (colon at end)
      if (lines[startLine].trim().endsWith(':')) {
        started = true;
        const baseIndent = lines[startLine].match(/^(\s*)/)[1].length;
        // Collect indented lines
        for (let j = i; j < lines.length; j++) {
          const indent = lines[j].match(/^(\s*)/)[1].length;
          if (lines[j].trim() === '') { bodyLines.push(lines[j]); continue; }
          if (indent > baseIndent) bodyLines.push(lines[j]);
          else break;
        }
        break;
      }
    }
  }

  return bodyLines.length > 0 ? bodyLines.join('\n') : null;
}

// ─── Comment Density ───

/**
 * Analyze comment density and quality.
 *
 * @param {string} code - Source code
 * @returns {object} { density, commentLines, codeLines, quality, docstrings }
 */
function analyzeCommentDensity(code) {
  const lines = code.split('\n');
  let commentLines = 0;
  let codeLines = 0;
  let blankLines = 0;
  let inBlockComment = false;
  let docstrings = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      blankLines++;
      continue;
    }

    // Block comment tracking
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      commentLines++;
      if (trimmed.startsWith('/**')) docstrings++;
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }

    // Single-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      commentLines++;
      continue;
    }

    // JSDoc/docstring continuation
    if (trimmed.startsWith('*')) {
      commentLines++;
      continue;
    }

    // Python docstrings
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      commentLines++;
      docstrings++;
      continue;
    }

    codeLines++;
  }

  const totalMeaningful = commentLines + codeLines;
  const density = totalMeaningful > 0 ? commentLines / totalMeaningful : 0;

  // Quality score based on comment density
  // Ideal: 15-30% comments for production code
  let quality;
  if (density === 0 && codeLines > 10) {
    quality = 0.3; // No comments in substantial code
  } else if (density < 0.05 && codeLines > 10) {
    quality = 0.5; // Very few comments
  } else if (density >= 0.05 && density <= 0.4) {
    quality = 0.9; // Good range
  } else if (density > 0.4 && density <= 0.6) {
    quality = 0.7; // Heavily commented but ok
  } else if (density > 0.6) {
    quality = 0.5; // More comments than code
  } else {
    quality = 0.8; // Small files, acceptable
  }

  // Bonus for JSDoc/docstrings
  if (docstrings > 0) quality = Math.min(1, quality + 0.05);

  return {
    density: Math.round(density * 1000) / 1000,
    commentLines,
    codeLines,
    blankLines,
    totalLines: lines.length,
    quality: Math.round(quality * 1000) / 1000,
    docstrings,
  };
}

// ─── Security Pattern Scan ───

/**
 * Scan code for security anti-patterns and vulnerabilities.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} { score, findings[], riskLevel }
 */
function securityScan(code, language) {
  const findings = [];
  const lang = (language || '').toLowerCase();

  // ─── Universal patterns ───

  // Hardcoded secrets
  const secretPatterns = [
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9+/=]{16,}['"]/gi, severity: 'high', message: 'Possible hardcoded API key' },
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi, severity: 'high', message: 'Possible hardcoded password' },
    { pattern: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{16,}['"]/gi, severity: 'high', message: 'Possible hardcoded secret/token' },
    { pattern: /(?:aws_access_key|aws_secret)\s*[:=]\s*['"][A-Z0-9]{16,}['"]/gi, severity: 'critical', message: 'Possible hardcoded AWS credential' },
    { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, severity: 'critical', message: 'Private key in source code' },
  ];

  for (const { pattern, severity, message } of secretPatterns) {
    const matches = code.match(pattern);
    if (matches) {
      findings.push({ severity, message, count: matches.length });
    }
  }

  // ─── JavaScript / TypeScript patterns ───

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    if (/\beval\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of eval() — code injection risk', count: 1 });
    }
    if (/new\s+Function\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of new Function() — code injection risk', count: 1 });
    }
    if (/innerHTML\s*=/.test(code)) {
      findings.push({ severity: 'medium', message: 'Direct innerHTML assignment — XSS risk', count: 1 });
    }
    if (/document\.write\s*\(/.test(code)) {
      findings.push({ severity: 'medium', message: 'document.write() — XSS risk', count: 1 });
    }
    if (/child_process.*exec(?:Sync)?\s*\(/.test(code)) {
      // Only flag if user input might flow into it
      if (/\$\{|` \+|req\.|args|input|param/i.test(code)) {
        findings.push({ severity: 'high', message: 'Shell command execution with possible user input — command injection risk', count: 1 });
      }
    }
    if (/\.createReadStream\s*\([^)]*(?:req|param|input|args)/i.test(code)) {
      findings.push({ severity: 'medium', message: 'File access with user-controlled path — path traversal risk', count: 1 });
    }
    if (/\bvar\b/.test(code)) {
      const varCount = (code.match(/\bvar\b/g) || []).length;
      findings.push({ severity: 'low', message: `Use of var (${varCount}x) — prefer const/let for block scoping`, count: varCount });
    }
    // SQL injection
    if (/['"`]\s*\+\s*(?:req|args|param|input|query)/i.test(code) && /(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i.test(code)) {
      findings.push({ severity: 'high', message: 'Possible SQL injection — string concatenation in query', count: 1 });
    }
    // Prototype pollution
    if (/\[(?:req|args|param|input|key)\b[^]]*\]\s*=/.test(code)) {
      findings.push({ severity: 'medium', message: 'Dynamic property assignment — possible prototype pollution', count: 1 });
    }
  }

  // ─── Python patterns ───

  if (lang === 'python' || lang === 'py') {
    if (/\bexec\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of exec() — code injection risk', count: 1 });
    }
    if (/\bos\.system\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of os.system() — command injection risk', count: 1 });
    }
    if (/subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True/.test(code)) {
      findings.push({ severity: 'high', message: 'subprocess with shell=True — command injection risk', count: 1 });
    }
    if (/pickle\.load/.test(code)) {
      findings.push({ severity: 'high', message: 'Unpickling untrusted data — arbitrary code execution risk', count: 1 });
    }
    if (/yaml\.load\s*\([^)]*(?!Loader)/.test(code) && !/SafeLoader|safe_load/.test(code)) {
      findings.push({ severity: 'medium', message: 'yaml.load without SafeLoader — arbitrary code execution risk', count: 1 });
    }
  }

  // ─── Scoring ───

  let score = 1.0;
  for (const finding of findings) {
    if (finding.severity === 'critical') score -= 0.3;
    else if (finding.severity === 'high') score -= 0.2;
    else if (finding.severity === 'medium') score -= 0.1;
    else if (finding.severity === 'low') score -= 0.02;
  }

  score = Math.max(0, Math.min(1, score));

  const riskLevel = score >= 0.9 ? 'low'
    : score >= 0.7 ? 'medium'
    : score >= 0.5 ? 'high'
    : 'critical';

  return {
    score: Math.round(score * 1000) / 1000,
    riskLevel,
    findings,
    totalFindings: findings.length,
  };
}

// ─── Nesting Depth Analysis ───

/**
 * Analyze nesting depth of code.
 *
 * @param {string} code - Source code
 * @returns {object} { maxDepth, avgDepth, depthDistribution, score }
 */
function analyzeNestingDepth(code) {
  const stripped = stripStringsAndComments(code);

  let currentDepth = 0;
  let maxDepth = 0;
  const depths = [];
  const distribution = {};

  // Track depth character-by-character to handle single-line code
  for (const ch of stripped) {
    if (ch === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    if (ch === '}') currentDepth = Math.max(0, currentDepth - 1);
  }

  // Also compute per-line depths for distribution
  currentDepth = 0;
  const lines = stripped.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const ch of trimmed) {
      if (ch === '{') currentDepth++;
      if (ch === '}') currentDepth = Math.max(0, currentDepth - 1);
    }

    depths.push(currentDepth);
    distribution[currentDepth] = (distribution[currentDepth] || 0) + 1;
  }

  const avgDepth = depths.length > 0
    ? depths.reduce((s, d) => s + d, 0) / depths.length
    : 0;

  // Score: penalize excessive nesting
  let score = 1.0;
  if (maxDepth > 4) score -= (maxDepth - 4) * 0.1;
  if (avgDepth > 3) score -= (avgDepth - 3) * 0.15;
  score = Math.max(0, Math.min(1, score));

  return {
    maxDepth,
    avgDepth: Math.round(avgDepth * 100) / 100,
    depthDistribution: distribution,
    score: Math.round(score * 1000) / 1000,
  };
}

// ─── Code Quality Metrics ───

/**
 * Compute aggregate code quality metrics.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} Quality metrics
 */
function computeQualityMetrics(code, language) {
  const lines = code.split('\n');
  const nonBlankLines = lines.filter(l => l.trim());

  // Line length statistics
  const lineLengths = nonBlankLines.map(l => l.length);
  const avgLineLength = lineLengths.length > 0
    ? lineLengths.reduce((s, l) => s + l, 0) / lineLengths.length
    : 0;
  const maxLineLength = lineLengths.length > 0 ? Math.max(...lineLengths) : 0;
  const longLines = lineLengths.filter(l => l > 120).length;
  const veryLongLines = lineLengths.filter(l => l > 200).length;

  // Function length (extracted)
  const functions = extractFunctionBodies(code);
  const functionLengths = functions.map(f => f.body.split('\n').length);
  const avgFunctionLength = functionLengths.length > 0
    ? functionLengths.reduce((s, l) => s + l, 0) / functionLengths.length
    : 0;
  const maxFunctionLength = functionLengths.length > 0 ? Math.max(...functionLengths) : 0;

  // Parameter count
  const paramCounts = functions.map(fn => {
    const paramMatch = fn.body.match(/(?:function\s+\w+|=>)\s*\(([^)]*)\)/);
    if (paramMatch && paramMatch[1].trim()) {
      return paramMatch[1].split(',').length;
    }
    return 0;
  }).filter(c => c > 0);
  const maxParams = paramCounts.length > 0 ? Math.max(...paramCounts) : 0;
  const avgParams = paramCounts.length > 0
    ? paramCounts.reduce((s, c) => s + c, 0) / paramCounts.length
    : 0;

  // Duplicate code detection (simple: find repeated lines > 3)
  const lineSet = {};
  let duplicateLines = 0;
  for (const line of nonBlankLines) {
    const trimmed = line.trim();
    if (trimmed.length < 10) continue; // Skip short lines
    lineSet[trimmed] = (lineSet[trimmed] || 0) + 1;
  }
  for (const count of Object.values(lineSet)) {
    if (count > 1) duplicateLines += count - 1;
  }

  // Compute composite quality score
  let score = 1.0;
  if (avgLineLength > 100) score -= 0.1;
  if (longLines > 5) score -= 0.1;
  if (veryLongLines > 0) score -= 0.1;
  if (maxFunctionLength > 50) score -= 0.1;
  if (maxFunctionLength > 100) score -= 0.1;
  if (maxParams > 5) score -= 0.1;
  if (duplicateLines > 5) score -= 0.1;
  score = Math.max(0, Math.min(1, score));

  return {
    totalLines: lines.length,
    codeLines: nonBlankLines.length,
    avgLineLength: Math.round(avgLineLength),
    maxLineLength,
    longLines,
    veryLongLines,
    functionCount: functions.length,
    avgFunctionLength: Math.round(avgFunctionLength),
    maxFunctionLength,
    maxParams,
    avgParams: Math.round(avgParams * 10) / 10,
    duplicateLines,
    score: Math.round(score * 1000) / 1000,
  };
}

// ─── Aggregate File Score ───

/**
 * Compute a deep coherence score for a single file.
 * Combines the base SERF observation with deeper analysis.
 *
 * @param {string} code - Source code
 * @param {object} options - { language, weights }
 * @returns {object} Deep coherence score
 */
function deepScore(code, options = {}) {
  const language = options.language || detectLanguage(code);

  // Base SERF coherence
  const observation = observeCoherence(code, { language });

  // Deep analyses
  const complexity = calculateCyclomaticComplexity(code);
  const comments = analyzeCommentDensity(code);
  const security = securityScan(code, language);
  const nesting = analyzeNestingDepth(code);
  const quality = computeQualityMetrics(code, language);
  const covenant = covenantCheck(code, { language });

  // Compute complexity score (inverse — lower complexity = higher score)
  let complexityScore = 1.0;
  if (complexity.avgPerFunction > 10) complexityScore -= 0.2;
  if (complexity.avgPerFunction > 20) complexityScore -= 0.2;
  if (complexity.maxPerFunction > 15) complexityScore -= 0.15;
  if (complexity.maxPerFunction > 30) complexityScore -= 0.15;
  complexityScore = Math.max(0, Math.min(1, complexityScore));

  // Weights for aggregate scoring
  const weights = options.weights || {
    serfCoherence: 0.30,   // Base SERF multi-dimensional score
    complexity: 0.15,       // Cyclomatic complexity
    commentQuality: 0.10,  // Comment density and quality
    security: 0.20,         // Security scan score
    nesting: 0.10,          // Nesting depth score
    quality: 0.15,          // Code quality metrics
  };

  const aggregate =
    observation.composite * weights.serfCoherence +
    complexityScore * weights.complexity +
    comments.quality * weights.commentQuality +
    security.score * weights.security +
    nesting.score * weights.nesting +
    quality.score * weights.quality;

  return {
    language,
    aggregate: Math.round(aggregate * 1000) / 1000,
    serfCoherence: Math.round(observation.composite * 1000) / 1000,
    serfDimensions: observation.dimensions,
    complexity: {
      score: Math.round(complexityScore * 1000) / 1000,
      total: complexity.total,
      avgPerFunction: complexity.avgPerFunction,
      maxPerFunction: complexity.maxPerFunction,
      functionCount: complexity.functionCount,
    },
    comments: {
      score: comments.quality,
      density: comments.density,
      commentLines: comments.commentLines,
      codeLines: comments.codeLines,
      docstrings: comments.docstrings,
    },
    security: {
      score: security.score,
      riskLevel: security.riskLevel,
      findings: security.findings,
    },
    nesting: {
      score: nesting.score,
      maxDepth: nesting.maxDepth,
      avgDepth: nesting.avgDepth,
    },
    quality: {
      score: quality.score,
      avgLineLength: quality.avgLineLength,
      maxLineLength: quality.maxLineLength,
      functionCount: quality.functionCount,
      maxFunctionLength: quality.maxFunctionLength,
      duplicateLines: quality.duplicateLines,
    },
    covenantSealed: covenant.sealed,
    weights,
  };
}

// ─── Repo-Level Aggregate Score ───

/**
 * Compute aggregate coherence scores for an entire repository.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration
 * @returns {object} Repo-level coherence report
 */
function repoScore(rootDir, config = {}) {
  const { scanDirectory, DEFAULT_CONFIG } = getMulti();
  const opts = { ...DEFAULT_CONFIG, ...config };
  const filePaths = scanDirectory(rootDir, opts);
  const fileScores = [];

  for (const filePath of filePaths) {
    let code;
    try {
      code = readFileSync(filePath, 'utf-8');
    } catch { continue; }

    if (!code.trim()) continue;

    const result = deepScore(code, { language: detectLanguage(code), weights: opts.weights });
    fileScores.push({
      path: relative(rootDir, filePath),
      ...result,
    });
  }

  if (fileScores.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      rootDir,
      totalFiles: 0,
      aggregate: 0,
      dimensions: {},
      files: [],
    };
  }

  // Compute repo-level averages
  const avgAggregate = fileScores.reduce((s, f) => s + f.aggregate, 0) / fileScores.length;
  const avgComplexity = fileScores.reduce((s, f) => s + f.complexity.score, 0) / fileScores.length;
  const avgComments = fileScores.reduce((s, f) => s + f.comments.score, 0) / fileScores.length;
  const avgSecurity = fileScores.reduce((s, f) => s + f.security.score, 0) / fileScores.length;
  const avgNesting = fileScores.reduce((s, f) => s + f.nesting.score, 0) / fileScores.length;
  const avgQuality = fileScores.reduce((s, f) => s + f.quality.score, 0) / fileScores.length;
  const avgSerf = fileScores.reduce((s, f) => s + f.serfCoherence, 0) / fileScores.length;

  // Find worst files
  const sorted = [...fileScores].sort((a, b) => a.aggregate - b.aggregate);
  const worst = sorted.slice(0, 5);
  const best = sorted.slice(-5).reverse();

  // Security findings across repo
  const allFindings = fileScores.flatMap(f =>
    f.security.findings.map(finding => ({
      ...finding,
      file: f.path,
    }))
  );

  return {
    timestamp: new Date().toISOString(),
    rootDir,
    totalFiles: fileScores.length,
    aggregate: Math.round(avgAggregate * 1000) / 1000,
    dimensions: {
      serfCoherence: Math.round(avgSerf * 1000) / 1000,
      complexity: Math.round(avgComplexity * 1000) / 1000,
      commentQuality: Math.round(avgComments * 1000) / 1000,
      security: Math.round(avgSecurity * 1000) / 1000,
      nesting: Math.round(avgNesting * 1000) / 1000,
      quality: Math.round(avgQuality * 1000) / 1000,
    },
    health: avgAggregate >= 0.8 ? 'healthy' : avgAggregate >= 0.6 ? 'stable' : 'needs attention',
    worstFiles: worst.map(f => ({ path: f.path, score: f.aggregate })),
    bestFiles: best.map(f => ({ path: f.path, score: f.aggregate })),
    securityFindings: allFindings,
    files: fileScores,
  };
}

// ─── Deep Score Utilities ───

/**
 * Strip strings and comments from code for analysis.
 */
function stripStringsAndComments(code) {
  return code
    .replace(/\/\/[^\n]*/g, '')           // Single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // Block comments
    .replace(/#[^\n]*/g, '')              // Python/shell comments
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '') // Template literals
    .replace(/"(?:\\.|[^"\\])*"/g, '""')  // Double-quoted strings
    .replace(/'(?:\\.|[^'\\])*'/g, "''"); // Single-quoted strings
}

/**
 * Format a deep score result as human-readable text.
 */
function formatDeepScore(result) {
  const lines = [];
  lines.push('── Deep Coherence Score ──');
  lines.push(`  Aggregate:     ${result.aggregate.toFixed(3)}`);
  lines.push(`  SERF:          ${result.serfCoherence.toFixed(3)}`);
  lines.push(`  Complexity:    ${result.complexity.score.toFixed(3)} (avg: ${result.complexity.avgPerFunction}, max: ${result.complexity.maxPerFunction})`);
  lines.push(`  Comments:      ${result.comments.score.toFixed(3)} (density: ${result.comments.density.toFixed(3)}, docstrings: ${result.comments.docstrings})`);
  lines.push(`  Security:      ${result.security.score.toFixed(3)} (${result.security.riskLevel})`);
  lines.push(`  Nesting:       ${result.nesting.score.toFixed(3)} (max: ${result.nesting.maxDepth}, avg: ${result.nesting.avgDepth})`);
  lines.push(`  Quality:       ${result.quality.score.toFixed(3)} (fns: ${result.quality.functionCount}, maxLen: ${result.quality.maxFunctionLength})`);

  if (result.security.findings.length > 0) {
    lines.push('');
    lines.push('  Security Findings:');
    for (const f of result.security.findings) {
      const icon = f.severity === 'critical' ? '[!!]' : f.severity === 'high' ? '[!]' : f.severity === 'medium' ? '[~]' : '[.]';
      lines.push(`    ${icon} ${f.message} (${f.severity})`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 6: Coherence Scorer (from coherenceScorer.js)
// ═══════════════════════════════════════════════════════════════════

// ─── Default Weights ───

const DEFAULT_WEIGHTS = {
  syntaxValidity: 0.25,
  readability: 0.20,
  security: 0.15,
  testProof: 0.30,
  historicalReliability: 0.10,
};

// ─── Syntax Validity ───

/**
 * Score syntax validity of a source file.
 * Checks: parseable structure, covenant compliance, balanced braces/brackets.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} { score, details }
 */
function scoreSyntaxValidity(code, language) {
  let score = 1.0;
  const details = [];

  // Check balanced braces/brackets/parens
  const braces = countBalanced(code, '{', '}');
  const brackets = countBalanced(code, '[', ']');
  const parens = countBalanced(code, '(', ')');

  if (braces !== 0) { score -= 0.3; details.push(`Unbalanced braces (${braces > 0 ? '+' : ''}${braces})`); }
  if (brackets !== 0) { score -= 0.15; details.push(`Unbalanced brackets (${brackets > 0 ? '+' : ''}${brackets})`); }
  if (parens !== 0) { score -= 0.15; details.push(`Unbalanced parentheses (${parens > 0 ? '+' : ''}${parens})`); }

  // Covenant check
  const covenant = covenantCheck(code, { language });
  if (!covenant.sealed) {
    score -= 0.2;
    details.push(`Covenant violations: ${covenant.violations?.length || 'unknown'}`);
  }

  // Check for obvious syntax issues
  const lang = (language || '').toLowerCase();
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    // Check for dangling commas in bad positions, incomplete statements
    if (/\)\s*\{[^}]*$/.test(code.split('\n').pop()?.trim() || '')) {
      // Last line opens a brace but never closes — possibly incomplete
      // Only flag if truly unbalanced (already caught above)
    }
  }

  // Empty file penalty
  const nonBlank = code.split('\n').filter(l => l.trim()).length;
  if (nonBlank === 0) { score = 0; details.push('Empty file'); }
  else if (nonBlank < 3) { score -= 0.1; details.push('Very small file (< 3 lines)'); }

  return {
    score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)),
    details,
  };
}

/**
 * Count imbalance for paired characters (positive = more opens, negative = more closes).
 */
function countBalanced(code, open, close) {
  // Strip strings and comments first to avoid false positives
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '``');

  let count = 0;
  for (const ch of stripped) {
    if (ch === open) count++;
    if (ch === close) count--;
  }
  return count;
}

// ─── Readability ───

/**
 * Score readability of source code.
 * Combines: comment density, nesting depth, line length, naming quality.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} { score, details }
 */
function scoreReadability(code, language) {
  const details = [];

  // Comment density (0-1)
  const comments = analyzeCommentDensity(code);
  const commentScore = comments.quality;
  details.push(`Comment density: ${(comments.density * 100).toFixed(0)}% (score: ${commentScore.toFixed(3)})`);

  // Nesting depth (0-1)
  const nesting = analyzeNestingDepth(code);
  const nestingScore = nesting.score;
  details.push(`Max nesting: ${nesting.maxDepth} (score: ${nestingScore.toFixed(3)})`);

  // Line length / quality (0-1)
  const quality = computeQualityMetrics(code, language);
  const qualityScore = quality.score;
  details.push(`Code quality: ${qualityScore.toFixed(3)} (avg line: ${quality.avgLineLength}, max fn: ${quality.maxFunctionLength})`);

  // Naming quality heuristic — check for good naming conventions
  const namingScore = scoreNamingQuality(code, language);
  details.push(`Naming quality: ${namingScore.toFixed(3)}`);

  // Weighted combination
  const score = (commentScore * 0.30) + (nestingScore * 0.25) + (qualityScore * 0.25) + (namingScore * 0.20);

  return {
    score: Math.round(score * 1000) / 1000,
    commentScore,
    nestingScore,
    qualityScore,
    namingScore,
    details,
  };
}

/**
 * Heuristic for naming quality.
 * Checks: consistent casing, descriptive names (length > 2), no single-letter vars in non-loop contexts.
 */
function scoreNamingQuality(code, language) {
  const lang = (language || '').toLowerCase();
  let score = 1.0;

  // Extract identifiers (function names, variable names)
  const funcNames = (code.match(/(?:function|const|let|var)\s+(\w+)/g) || [])
    .map(m => m.replace(/(?:function|const|let|var)\s+/, ''));

  if (funcNames.length === 0) return 0.8; // Can't assess, neutral

  // Check for very short names (single char, not loop vars)
  const shortNames = funcNames.filter(n => n.length <= 1 && !['i', 'j', 'k', 'n', 'x', 'y', '_'].includes(n));
  if (shortNames.length > 0) {
    score -= 0.1 * Math.min(shortNames.length, 3);
  }

  // Check for consistent casing (camelCase for JS, snake_case for Python)
  if (lang === 'python' || lang === 'py') {
    const nonSnake = funcNames.filter(n => n.length > 1 && /[A-Z]/.test(n) && !n.startsWith('_'));
    if (nonSnake.length > funcNames.length * 0.3) score -= 0.15;
  } else {
    // JS/TS — expect camelCase or PascalCase
    const nonCamel = funcNames.filter(n => n.length > 1 && n.includes('_') && !n.startsWith('_'));
    if (nonCamel.length > funcNames.length * 0.3) score -= 0.1;
  }

  // Descriptive names (avg length > 4)
  const avgLen = funcNames.reduce((s, n) => s + n.length, 0) / funcNames.length;
  if (avgLen < 3) score -= 0.15;
  else if (avgLen >= 6) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

// ─── Coherence Security ───

/**
 * Score security using the existing security scan.
 */
function scoreSecurity(code, language) {
  const scan = securityScan(code, language);
  return {
    score: scan.score,
    riskLevel: scan.riskLevel,
    findings: scan.findings,
    details: scan.findings.map(f => `[${f.severity}] ${f.message}`),
  };
}

// ─── Test Proof ───

/**
 * Score test proof — does this file have corresponding tests?
 *
 * Heuristics:
 * 1. Look for a test file with matching name (e.g., foo.js -> foo.test.js, tests/foo.test.js)
 * 2. Check if the test file imports/requires this module
 * 3. Count test assertions as a coverage proxy
 *
 * @param {string} filePath - Absolute path to the source file
 * @param {string} rootDir - Repository root
 * @returns {object} { score, testFile, assertions, details }
 */
function scoreTestProof(filePath, rootDir) {
  const details = [];
  const base = basename(filePath, extname(filePath));
  const dir = dirname(filePath);
  const rel = relative(rootDir, filePath);

  // Possible test file locations
  const candidates = [
    join(dir, `${base}.test${extname(filePath)}`),
    join(dir, `${base}.spec${extname(filePath)}`),
    join(rootDir, 'tests', `${base}.test${extname(filePath)}`),
    join(rootDir, 'test', `${base}.test${extname(filePath)}`),
    join(rootDir, '__tests__', `${base}.test${extname(filePath)}`),
    join(rootDir, 'tests', `${base}.test.js`),
    join(rootDir, 'test', `${base}.test.js`),
  ];

  let testFile = null;
  let testCode = null;

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      testFile = candidate;
      try { testCode = readFileSync(candidate, 'utf-8'); } catch { continue; }
      break;
    }
  }

  if (!testFile) {
    details.push('No test file found');
    return { score: 0.0, testFile: null, assertions: 0, details };
  }

  details.push(`Test file: ${relative(rootDir, testFile)}`);

  // Check if test file references the source
  const importMatch = testCode.includes(base) || testCode.includes(rel);
  if (!importMatch) {
    details.push('Test file does not reference source module');
    return { score: 0.3, testFile: relative(rootDir, testFile), assertions: 0, details };
  }

  // Count assertions as coverage proxy
  const assertPatterns = [
    /assert\.\w+/g,
    /expect\(/g,
    /\.toBe\(/g,
    /\.toEqual\(/g,
    /\.toStrictEqual\(/g,
    /\.toThrow\(/g,
    /\.rejects\./g,
    /\.resolves\./g,
    /should\.\w+/g,
  ];

  let assertions = 0;
  for (const pat of assertPatterns) {
    const matches = testCode.match(pat);
    if (matches) assertions += matches.length;
  }

  details.push(`Assertions found: ${assertions}`);

  // Score based on assertion count
  let score;
  if (assertions >= 10) score = 1.0;
  else if (assertions >= 5) score = 0.85;
  else if (assertions >= 2) score = 0.7;
  else if (assertions >= 1) score = 0.5;
  else score = 0.3; // Test file exists but no assertions

  return {
    score: Math.round(score * 1000) / 1000,
    testFile: relative(rootDir, testFile),
    assertions,
    details,
  };
}

// ─── Historical Reliability ───

/**
 * Score historical reliability based on past run data.
 *
 * @param {string} filePath - File path (relative to rootDir)
 * @param {string} rootDir - Repository root
 * @returns {object} { score, details }
 */
function scoreHistoricalReliability(filePath, rootDir) {
  const { loadHistoryV2 } = getReport();
  const details = [];
  const history = loadHistoryV2(rootDir);
  const runs = history.runs || [];

  if (runs.length === 0) {
    details.push('No run history available');
    return { score: 0.7, details }; // Neutral — no data
  }

  const rel = relative(rootDir, filePath);

  // Count how many times this file was healed
  let healCount = 0;
  let totalRuns = 0;
  for (const run of runs) {
    totalRuns++;
    if (run.changes) {
      for (const change of run.changes) {
        if (change.path === rel) healCount++;
      }
    }
  }

  details.push(`Run history: ${totalRuns} runs, healed ${healCount} time(s)`);

  // Reliability: fewer heals = more reliable
  if (healCount === 0) {
    details.push('Never needed healing — highly reliable');
    return { score: 1.0, details };
  }

  const healRate = healCount / totalRuns;
  let score;
  if (healRate > 0.5) { score = 0.3; details.push(`Healed in ${(healRate * 100).toFixed(0)}% of runs — unstable`); }
  else if (healRate > 0.2) { score = 0.6; details.push(`Healed occasionally — moderate reliability`); }
  else { score = 0.8; details.push(`Rarely healed — good reliability`); }

  // Trend check — was it healed recently?
  const recentRuns = runs.slice(-5);
  const recentHeals = recentRuns.filter(r =>
    r.changes?.some(c => c.path === rel)
  ).length;
  if (recentHeals > 0) {
    score -= 0.1;
    details.push(`Healed in ${recentHeals} of last 5 runs — recent instability`);
  }

  return { score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), details };
}

// ─── Combined Coherence Score ───

/**
 * Compute the full coherence score for a single file.
 *
 * @param {string} filePath - Absolute path
 * @param {object} options - { rootDir, weights }
 * @returns {object} Full coherence breakdown
 */
function computeCoherence(filePath, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const weights = options.weights || DEFAULT_WEIGHTS;

  let code;
  try {
    code = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { error: err.message, score: 0 };
  }

  // Accept pre-detected language to avoid redundant regex parsing
  const language = options.language || detectLanguage(code);

  // Compute each dimension
  const syntax = scoreSyntaxValidity(code, language);
  const readability = scoreReadability(code, language);
  const security = scoreSecurity(code, language);
  const testProof = scoreTestProof(filePath, rootDir);
  const reliability = scoreHistoricalReliability(filePath, rootDir);

  // Weighted aggregate
  const score =
    syntax.score * weights.syntaxValidity +
    readability.score * weights.readability +
    security.score * weights.security +
    testProof.score * weights.testProof +
    reliability.score * weights.historicalReliability;

  return {
    filePath: relative(rootDir, filePath),
    language,
    score: Math.round(score * 1000) / 1000,
    dimensions: {
      syntaxValidity: { score: syntax.score, weight: weights.syntaxValidity, details: syntax.details },
      readability: { score: readability.score, weight: weights.readability, details: readability.details },
      security: { score: security.score, weight: weights.security, riskLevel: security.riskLevel, findings: security.findings },
      testProof: { score: testProof.score, weight: weights.testProof, testFile: testProof.testFile, assertions: testProof.assertions, details: testProof.details },
      historicalReliability: { score: reliability.score, weight: weights.historicalReliability, details: reliability.details },
    },
    weights,
  };
}

/**
 * Compute coherence for an entire repository.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration overrides
 * @returns {object} Repo-level coherence report
 */
function computeRepoCoherence(rootDir, config = {}) {
  const { scanDirectory, DEFAULT_CONFIG } = getMulti();
  const opts = { ...DEFAULT_CONFIG, ...config };
  const filePaths = scanDirectory(rootDir, opts);
  const fileScores = [];

  for (const filePath of filePaths) {
    const result = computeCoherence(filePath, { rootDir, weights: opts.weights || DEFAULT_WEIGHTS });
    if (!result.error) fileScores.push(result);
  }

  if (fileScores.length === 0) {
    return { totalFiles: 0, aggregate: 0, dimensions: {}, files: [] };
  }

  const avgScore = fileScores.reduce((s, f) => s + f.score, 0) / fileScores.length;

  // Per-dimension averages
  const dimNames = ['syntaxValidity', 'readability', 'security', 'testProof', 'historicalReliability'];
  const dimAvgs = {};
  for (const dim of dimNames) {
    dimAvgs[dim] = Math.round(
      (fileScores.reduce((s, f) => s + (f.dimensions[dim]?.score || 0), 0) / fileScores.length) * 1000
    ) / 1000;
  }

  const sorted = [...fileScores].sort((a, b) => a.score - b.score);

  return {
    timestamp: new Date().toISOString(),
    rootDir,
    totalFiles: fileScores.length,
    aggregate: Math.round(avgScore * 1000) / 1000,
    dimensions: dimAvgs,
    health: avgScore >= 0.8 ? 'healthy' : avgScore >= 0.6 ? 'stable' : 'needs attention',
    formula: 'coherence = (0.25 * syntax) + (0.20 * readability) + (0.15 * security) + (0.30 * test_proof) + (0.10 * reliability)',
    worstFiles: sorted.slice(0, 5).map(f => ({ path: f.filePath, score: f.score })),
    bestFiles: sorted.slice(-5).reverse().map(f => ({ path: f.filePath, score: f.score })),
    files: fileScores,
  };
}

/**
 * Format a coherence result as human-readable text.
 */
function formatCoherence(result) {
  const lines = [];
  lines.push(`Coherence: ${result.filePath}`);
  lines.push(`  Score:    ${result.score.toFixed(3)}`);
  lines.push(`  Language: ${result.language}`);
  lines.push('');
  lines.push('  Dimensions:');
  for (const [dim, data] of Object.entries(result.dimensions)) {
    lines.push(`    ${dim.padEnd(24)} ${data.score.toFixed(3)} (weight: ${data.weight})`);
    if (data.details) {
      for (const d of data.details) lines.push(`      ${d}`);
    }
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  // ── Section 1: Shared Utilities (from utils.js) ──
  ensureDir,
  loadJSON,
  saveJSON,
  trimArray,

  // ── Section 2: Central Configuration (from config.js) ──
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
  deepMerge,
  deepClone,
  setNestedValue,
  getNestedValue,

  // ── Section 3: Modes & Presets (from modes.js) ──
  PRESET_MODES,
  ENV_OVERRIDES,
  readEnvOverrides,
  applyOverrides,
  resolveConfig,
  shouldAutoCreatePR,
  getModeInfo,
  listModes,
  setMode,
  getCurrentMode,
  formatResolvedConfig,

  // ── Section 4: Error Handling (from errorHandler.js) ──
  ERROR_TYPES,
  classifyError,
  withErrorHandling,
  withRetry,
  withCircuitBreaker,
  resetCircuitBreaker,
  getCircuitStatus,
  buildErrorReport,

  // ── Section 5: Deep Code Analysis (from scoring.js) ──
  calculateCyclomaticComplexity,
  analyzeCommentDensity,
  securityScan,
  analyzeNestingDepth,
  computeQualityMetrics,
  deepScore,
  repoScore,
  formatDeepScore,
  stripStringsAndComments,
  countDecisionPoints,
  extractFunctionBodies,

  // ── Section 6: Coherence Scorer (from coherenceScorer.js) ──
  DEFAULT_WEIGHTS,
  scoreSyntaxValidity,
  scoreReadability,
  scoreNamingQuality,
  scoreSecurity,
  scoreTestProof,
  scoreHistoricalReliability,
  computeCoherence,
  computeRepoCoherence,
  formatCoherence,
};
