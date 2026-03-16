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

const DEFAULT_CONFIG = {
  enabled: true,
  promptTag: 'Pull the healed code from the kingdom into the eternal now completed.',
  promptTagEnabled: true,
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
 * Append the prompt tag to a resolve/search result object (if enabled).
 */
function applyPromptTag(result) {
  const tag = getPromptTag();
  if (tag && result && typeof result === 'object') {
    // Return new object to avoid mutating caller's reference
    return { ...result, promptTag: tag };
  }
  return result;
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
  DEFAULT_CONFIG,
  CONFIG_FILENAME,
};
