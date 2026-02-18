/**
 * Reflector — Central Configuration
 *
 * CENTRAL_DEFAULTS, load/save/set/get/reset/validate config.
 */

const { join } = require('path');
const { deepMerge, deepClone, setNestedValue, getNestedValue, loadJSON, saveJSON } = require('./scoring-utils');

const CENTRAL_DEFAULTS = {
  thresholds: {
    minCoherence: 0.7,
    autoMergeThreshold: 0.9,
    targetCoherence: 0.95,
    approvalFileThreshold: 10,
  },
  scanning: {
    maxFilesPerRun: 50,
    maxFileSizeBytes: 100000,
    includeExtensions: ['.js', '.ts', '.py', '.go', '.rs', '.java', '.jsx', '.tsx'],
    excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.remembrance', 'vendor', '__pycache__'],
    excludeFiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
  },
  healing: {
    maxSerfLoops: 3,
    enabled: true,
  },
  safety: {
    backupStrategy: 'git-branch',
    autoRollback: true,
    requireApproval: false,
    dryRunByDefault: false,
  },
  scoring: {
    serfCoherence: 0.30,
    complexity: 0.15,
    commentQuality: 0.10,
    security: 0.20,
    nesting: 0.10,
    quality: 0.15,
  },
  schedule: {
    enabled: true,
    intervalHours: 6,
    skipIfPROpen: true,
    maxRunHistory: 50,
  },
  github: {
    push: false,
    openPR: false,
    autoMerge: false,
    labels: 'remembrance,auto-heal',
    prTitlePrefix: 'Remembrance Pull: Healed Refinement',
  },
  autoCommit: {
    enabled: false,
    testCommand: 'node --test',
    branchPrefix: 'remembrance/auto-heal',
  },
  notifications: {
    enabled: false,
    webhookUrl: '',
    platform: '',
    repoName: '',
  },
  logging: {
    verbose: false,
    logToFile: true,
    logFilePath: '.remembrance/reflector.log',
    maxLogSizeMB: 10,
  },
};

function getCentralConfigPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-central.json');
}

function loadCentralConfig(rootDir) {
  const raw = loadJSON(getCentralConfigPath(rootDir), null);
  if (raw) return deepMerge(CENTRAL_DEFAULTS, raw);
  return deepClone(CENTRAL_DEFAULTS);
}

function saveCentralConfig(rootDir, config) {
  return saveJSON(getCentralConfigPath(rootDir), config);
}

function setCentralValue(rootDir, path, value) {
  const config = loadCentralConfig(rootDir);
  setNestedValue(config, path, value);
  return saveCentralConfig(rootDir, config);
}

function getCentralValue(rootDir, path) {
  const config = loadCentralConfig(rootDir);
  return getNestedValue(config, path);
}

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

function validateConfig(config) {
  const issues = [];

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

  if (config.schedule) {
    if (typeof config.schedule.intervalHours === 'number' && config.schedule.intervalHours < 0.1) {
      issues.push('schedule.intervalHours must be at least 0.1');
    }
  }

  if (config.safety) {
    if (config.safety.backupStrategy && !['git-branch', 'file-copy'].includes(config.safety.backupStrategy)) {
      issues.push('safety.backupStrategy must be "git-branch" or "file-copy"');
    }
  }

  if (config.autoCommit) {
    if (config.autoCommit.testCommand && typeof config.autoCommit.testCommand !== 'string') {
      issues.push('autoCommit.testCommand must be a string');
    }
    if (config.autoCommit.branchPrefix && typeof config.autoCommit.branchPrefix !== 'string') {
      issues.push('autoCommit.branchPrefix must be a string');
    }
  }

  if (config.notifications) {
    if (config.notifications.platform && !['', 'discord', 'slack'].includes(config.notifications.platform)) {
      issues.push('notifications.platform must be "discord", "slack", or empty for auto-detect');
    }
    if (config.notifications.webhookUrl && typeof config.notifications.webhookUrl !== 'string') {
      issues.push('notifications.webhookUrl must be a string');
    }
  }

  return { valid: issues.length === 0, issues };
}

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
    dryRunMode: c.safety?.dryRunByDefault,
    requireApproval: c.safety?.requireApproval,
    autoRollback: c.safety?.autoRollback,
    approvalFileThreshold: c.thresholds?.approvalFileThreshold,
    weights: c.scoring,
  };
}

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

function formatCentralConfig(config) {
  const lines = [];
  lines.push('── Remembrance Reflector BOT Central Configuration ──');
  lines.push('');
  for (const section of Object.keys(config)) {
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
};
