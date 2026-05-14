'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { loadEnvFile } = require('./env-loader');

// ─── API key encryption at rest ───

function _deriveKey() {
  const identity = `${os.hostname()}:${os.userInfo().username}:remembrance-swarm`;
  return crypto.scryptSync(identity, 'remembrance-swarm-salt', 32);
}

function _encryptKey(plaintext) {
  if (!plaintext || plaintext.startsWith('enc:')) return plaintext;
  const key = _deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function _decryptKey(stored) {
  if (!stored || !stored.startsWith('enc:')) return stored;
  try {
    const parts = stored.slice(4).split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const key = _deriveKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(dataHex, 'hex'), null, 'utf8') + decipher.final('utf8');
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[swarm-config:_decryptKey] returning null on error:', e?.message || e);
    return null;
  }
}

/**
 * Remembrance dimensions — the specialist lenses for swarm agents.
 * Each agent is assigned one or more dimensions to focus their evaluation.
 */
const DIMENSIONS = [
  'simplicity',
  'correctness',
  'readability',
  'security',
  'efficiency',
  'unity',
  'fidelity',
];

/**
 * Default swarm configuration.
 */
const DEFAULT_SWARM_CONFIG = {
  minAgents: 3,
  maxAgents: 9,
  consensusThreshold: 0.7,
  timeoutMs: 30000,
  dimensions: DIMENSIONS,
  crossScoring: true,
  autoFeedToReflector: true,
  weights: {
    coherency: 0.4,
    selfConfidence: 0.2,
    peerScore: 0.4,
  },
  providers: {},
  escalation: {
    enabled: true,
    coherenceFloor: 0.90,
    maxRetries: 2,
    modes: ['retry', 'expand', 'deep'],
    deepTimeoutMultiplier: 2,
    expandAgentBoost: 2,
  },
};

/**
 * Load swarm configuration from .remembrance/swarm-config.json, merged with defaults.
 * @param {string} rootDir - Project root directory
 * @returns {object} Merged configuration
 */
function loadSwarmConfig(rootDir) {
  // Load .env file before resolving config (so API keys are in process.env)
  loadEnvFile(rootDir);

  const configPath = path.join(rootDir || '.', '.remembrance', 'swarm-config.json');
  let userConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[swarm-config:loadSwarmConfig] silent failure:', e?.message || e);
    // Ignore invalid config, fall back to defaults
  }
  return {
    ...DEFAULT_SWARM_CONFIG,
    ...userConfig,
    weights: { ...DEFAULT_SWARM_CONFIG.weights, ...(userConfig.weights || {}) },
    providers: { ...DEFAULT_SWARM_CONFIG.providers, ...(userConfig.providers || {}) },
  };
}

/**
 * Save swarm configuration to .remembrance/swarm-config.json.
 * @param {string} rootDir - Project root directory
 * @param {object} config - Configuration to save
 */
function saveSwarmConfig(rootDir, config) {
  const dir = path.join(rootDir || '.', '.remembrance');
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, 'swarm-config.json');
  // Encrypt any plaintext API keys in providers before persisting
  const safeCopy = { ...config };
  if (safeCopy.providers) {
    safeCopy.providers = { ...safeCopy.providers };
    for (const [name, prov] of Object.entries(safeCopy.providers)) {
      if (prov && prov.apiKey && !prov.apiKey.startsWith('enc:')) {
        safeCopy.providers[name] = { ...prov, apiKey: _encryptKey(prov.apiKey) };
      }
    }
  }
  // Atomic write: tmp → backup → rename
  const json = JSON.stringify(safeCopy, null, 2);
  const tmpPath = configPath + '.tmp';
  fs.writeFileSync(tmpPath, json, 'utf-8');
  if (fs.existsSync(configPath)) {
    try { fs.copyFileSync(configPath, configPath + '.bak'); } catch (_) { /* best effort */ }
  }
  fs.renameSync(tmpPath, configPath);
}

/**
 * Resolve which providers are available based on config + environment variables.
 * Checks for API keys in config.providers and process.env.
 *
 * @param {object} config - Swarm config
 * @returns {string[]} List of available provider names
 */
function resolveProviders(config) {
  const available = [];

  const providerKeys = {
    claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    grok: ['GROK_API_KEY', 'XAI_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    ollama: ['OLLAMA_HOST'],
  };

  for (const [provider, envKeys] of Object.entries(providerKeys)) {
    // Check config first (decrypt to verify key is valid)
    const configKey = config.providers?.[provider]?.apiKey;
    if (configKey && _decryptKey(configKey)) {
      available.push(provider);
      continue;
    }
    // Check env vars
    const hasEnv = envKeys.some(k => process.env[k]);
    if (hasEnv) {
      available.push(provider);
      continue;
    }
    // Ollama is available if running locally (no key needed)
    if (provider === 'ollama') {
      const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
      if (config.providers?.ollama?.enabled !== false) {
        available.push(provider);
      }
    }
  }

  // claude-code: local CLI provider, available if the binary exists on PATH
  if (config.providers?.['claude-code']?.enabled !== false) {
    const cliPath = config.providers?.['claude-code']?.cliPath || 'claude';
    try {
      require('child_process').execFileSync(cliPath, ['--version'], {
        timeout: 3000,
        stdio: 'pipe',
        env: { ...process.env, CLAUDECODE: '' },
      });
      available.push('claude-code');
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[swarm-config:resolveProviders] silent failure:', e?.message || e);
      // Claude CLI not installed or not reachable — skip silently
    }
  }

  return available;
}

/**
 * Get the API key for a specific provider.
 * @param {string} provider - Provider name
 * @param {object} config - Swarm config
 * @returns {string|null} API key or null
 */
function getProviderKey(provider, config) {
  // Prefer environment variables over config-file keys (env vars are more secure)
  const envMap = {
    claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    grok: ['GROK_API_KEY', 'XAI_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
  };
  const envKeys = envMap[provider] || [];
  for (const key of envKeys) {
    if (process.env[key]) return process.env[key];
  }
  if (config.providers?.[provider]?.apiKey) {
    return _decryptKey(config.providers[provider].apiKey);
  }
  return null;
}

/**
 * Get the model for a specific provider.
 * @param {string} provider - Provider name
 * @param {object} config - Swarm config
 * @returns {string} Model identifier
 */
function getProviderModel(provider, config) {
  if (config.providers?.[provider]?.model) {
    return config.providers[provider].model;
  }
  const defaults = {
    claude: 'claude-sonnet-4-5-20250929',
    openai: 'gpt-4o',
    gemini: 'gemini-2.0-flash',
    grok: 'grok-3',
    deepseek: 'deepseek-chat',
    ollama: 'llama3.1',
    'claude-code': 'claude-sonnet-4-5-20250929',
  };
  return defaults[provider] || provider;
}

module.exports = {
  DIMENSIONS,
  DEFAULT_SWARM_CONFIG,
  loadSwarmConfig,
  saveSwarmConfig,
  resolveProviders,
  getProviderKey,
  getProviderModel,
  _encryptKey,
  _decryptKey,
};
