/**
 * Oracle Configuration — persistent toggle and prompt tag management.
 *
 * Config lives at .remembrance/oracle-config.json (local) and
 * ~/.remembrance/oracle-config.json (global fallback).
 *
 * @oracle-infrastructure
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILENAME = 'oracle-config.json';

const crypto = require('crypto');

const DEFAULT_CONFIG = {
  enabled: true,
  promptTag: 'Pull the healed code from the kingdom into the eternal now completed.',
  promptTagEnabled: true,
  provenanceTracking: true, // Functional role: watermark pattern lineage
};

/**
 * Resolve the config file path.
 * Prefers local .remembrance/ dir, falls back to ~/.remembrance/.
 */
function configPath(scope = 'local') {
  if (scope === 'global') {
    return path.join(os.homedir(), '.remembrance', CONFIG_FILENAME);
  }
  return path.join(process.cwd(), '.remembrance', CONFIG_FILENAME);
}

/**
 * Load config, merging global defaults ← local overrides.
 */
function loadConfig() {
  const config = { ...DEFAULT_CONFIG };

  // Load global first
  const globalPath = configPath('global');
  if (fs.existsSync(globalPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
      Object.assign(config, raw);
    } catch (_) { /* corrupt config — use defaults */ }
  }

  // Local overrides global
  const localPath = configPath('local');
  if (fs.existsSync(localPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      Object.assign(config, raw);
    } catch (_) { /* corrupt config — use defaults */ }
  }

  return config;
}

/**
 * Save config to the specified scope.
 */
function saveConfig(config, scope = 'local') {
  const filePath = configPath(scope);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
  return filePath;
}

/**
 * Check if the oracle is enabled.
 */
function isOracleEnabled() {
  return loadConfig().enabled;
}

/**
 * Toggle oracle on or off. Returns the new state.
 */
function toggleOracle(state) {
  const config = loadConfig();
  config.enabled = typeof state === 'boolean' ? state : !config.enabled;
  saveConfig(config);
  return config.enabled;
}

/**
 * Get the prompt tag (returns empty string if disabled).
 */
function getPromptTag() {
  const config = loadConfig();
  if (!config.promptTagEnabled || !config.enabled) return '';
  return config.promptTag || '';
}

/**
 * Set a custom prompt tag.
 */
function setPromptTag(tag) {
  const config = loadConfig();
  config.promptTag = tag;
  config.promptTagEnabled = true;
  saveConfig(config);
  return config.promptTag;
}

/**
 * Enable or disable the prompt tag separately from the oracle toggle.
 */
function togglePromptTag(state) {
  const config = loadConfig();
  config.promptTagEnabled = typeof state === 'boolean' ? state : !config.promptTagEnabled;
  saveConfig(config);
  return config.promptTagEnabled;
}

/**
 * Generate a provenance watermark for a pattern pull.
 * Encodes: timestamp, pattern ID, source tier, and a short hash for verification.
 */
function generateProvenance(patternId, sourceTier = 'local') {
  const config = loadConfig();
  if (!config.provenanceTracking) return null;

  const timestamp = new Date().toISOString();
  const payload = `${patternId}:${sourceTier}:${timestamp}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);

  return {
    patternId,
    sourceTier,
    pulledAt: timestamp,
    watermark: `oracle:${hash}`,
    lineage: payload,
  };
}

/**
 * Append the prompt tag to a resolve/search result object (if enabled).
 * Now also attaches provenance watermark for lineage tracking.
 */
function applyPromptTag(result) {
  const tag = getPromptTag();
  if (tag && result && typeof result === 'object') {
    const patched = { ...result, promptTag: tag };

    // Attach provenance watermark if tracking is enabled
    const config = loadConfig();
    if (config.provenanceTracking && result.pattern) {
      patched.provenance = generateProvenance(
        result.pattern.id || result.pattern.name || 'unknown',
        result.pattern.source || 'local'
      );
    }

    return patched;
  }
  return result;
}

/**
 * Toggle provenance tracking on or off. Returns the new state.
 */
function toggleProvenance(state) {
  const config = loadConfig();
  config.provenanceTracking = typeof state === 'boolean' ? state : !config.provenanceTracking;
  saveConfig(config);
  return config.provenanceTracking;
}

module.exports = {
  loadConfig,
  saveConfig,
  configPath,
  isOracleEnabled,
  toggleOracle,
  getPromptTag,
  setPromptTag,
  togglePromptTag,
  applyPromptTag,
  generateProvenance,
  toggleProvenance,
  DEFAULT_CONFIG,
  CONFIG_FILENAME,
};
