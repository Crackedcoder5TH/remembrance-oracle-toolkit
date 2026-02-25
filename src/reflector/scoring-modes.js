/**
 * Reflector — Modes & Presets
 *
 * PRESET_MODES, ENV_OVERRIDES, resolveConfig, shouldAutoCreatePR.
 */

const { deepMerge, deepClone, setNestedValue } = require('./scoring-utils');
const { loadCentralConfig, saveCentralConfig } = require('./scoring-config');

const PRESET_MODES = {
  strict: {
    thresholds: {
      minCoherence: 0.8,
      autoMergeThreshold: 0.95,
      targetCoherence: 0.98,
      approvalFileThreshold: 5,
      minCoherenceForAutoPR: 0.85,
    },
    scanning: { maxFilesPerRun: 30 },
    safety: { autoRollback: true, requireApproval: true, dryRunByDefault: false },
    github: { autoMerge: false, openPR: true },
    autoCommit: { enabled: true, testRequired: true, buildRequired: true },
  },
  balanced: {
    thresholds: {
      minCoherence: 0.7,
      autoMergeThreshold: 0.9,
      targetCoherence: 0.95,
      approvalFileThreshold: 10,
      minCoherenceForAutoPR: 0.75,
    },
    scanning: { maxFilesPerRun: 50 },
    safety: { autoRollback: true, requireApproval: false, dryRunByDefault: false },
    github: { autoMerge: false, openPR: true },
    autoCommit: { enabled: true, testRequired: true, buildRequired: false },
  },
  relaxed: {
    thresholds: {
      minCoherence: 0.5,
      autoMergeThreshold: 0.8,
      targetCoherence: 0.9,
      approvalFileThreshold: 20,
      minCoherenceForAutoPR: 0.6,
    },
    scanning: { maxFilesPerRun: 100 },
    safety: { autoRollback: true, requireApproval: false, dryRunByDefault: false },
    github: { autoMerge: true, openPR: true },
    autoCommit: { enabled: true, testRequired: false, buildRequired: false },
  },
};

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

function applyOverrides(config, overrides) {
  if (!config) return {};
  if (!overrides) return deepClone(config);
  const result = deepClone(config);
  for (const [path, value] of Object.entries(overrides)) {
    if (path === '_mode') continue;
    setNestedValue(result, path, value);
  }
  return result;
}

function resolveConfig(rootDir, options = {}) {
  if (!rootDir) return deepClone(PRESET_MODES.balanced);
  const { mode, overrides = {}, env } = options;
  let config = loadCentralConfig(rootDir);
  const envOverrides = readEnvOverrides(env);
  const effectiveMode = mode || envOverrides._mode || config._mode || null;
  if (effectiveMode && PRESET_MODES[effectiveMode]) {
    config = deepMerge(config, PRESET_MODES[effectiveMode]);
    config._mode = effectiveMode;
  }
  if (Object.keys(envOverrides).length > 0) {
    config = applyOverrides(config, envOverrides);
  }
  if (Object.keys(overrides).length > 0) {
    config = deepMerge(config, overrides);
  }
  return config;
}

function shouldAutoCreatePR(report, config) {
  if (!report) return { shouldOpenPR: false, reason: 'No report provided.', coherence: 0, threshold: 0.7 };
  config = config || {};
  const threshold = config.thresholds?.minCoherenceForAutoPR
    || config.thresholds?.minCoherence
    || 0.7;
  const coherence = report.coherence?.after
    || report.safety?.coherenceGuard?.postCoherence
    || report.report?.avgImprovement
    || 0;
  const filesHealed = report.report?.filesHealed
    || report.healing?.filesHealed
    || report.changes?.length
    || 0;

  if (filesHealed === 0) {
    return { shouldOpenPR: false, reason: 'No files were healed — nothing to PR.', coherence, threshold };
  }
  if (coherence >= threshold) {
    return { shouldOpenPR: true, reason: `Post-heal coherence ${coherence.toFixed(3)} meets threshold ${threshold}. PR recommended.`, coherence, threshold };
  }
  return { shouldOpenPR: false, reason: `Post-heal coherence ${coherence.toFixed(3)} is below threshold ${threshold}. Manual review needed.`, coherence, threshold };
}

function getModeInfo(modeName) {
  const preset = PRESET_MODES[modeName];
  if (!preset) return null;
  return { name: modeName, description: getModeDescription(modeName), settings: preset };
}

function getModeDescription(modeName) {
  switch (modeName) {
    case 'strict': return 'High standards. Requires approval, no auto-merge, stricter thresholds. Best for production repos.';
    case 'balanced': return 'Recommended default. Reasonable thresholds, auto-rollback, no auto-merge. Good for active development.';
    case 'relaxed': return 'Permissive. Lower thresholds, auto-merge enabled, more files per run. Good for experimental repos.';
    default: return 'Custom configuration.';
  }
}

function listModes() {
  return Object.keys(PRESET_MODES).map(name => ({
    name,
    description: getModeDescription(name),
  }));
}

function setMode(rootDir, modeName) {
  if (!PRESET_MODES[modeName]) {
    return { error: `Unknown mode: ${modeName}. Available: ${Object.keys(PRESET_MODES).join(', ')}` };
  }
  const config = resolveConfig(rootDir, { mode: modeName });
  config._mode = modeName;
  saveCentralConfig(rootDir, config);
  return { mode: modeName, description: getModeDescription(modeName), applied: true };
}

function getCurrentMode(rootDir) {
  if (!rootDir) return 'custom';
  const config = loadCentralConfig(rootDir);
  return config._mode || 'custom';
}

function formatResolvedConfig(config) {
  if (!config) return 'No configuration available.';
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

module.exports = {
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
};
