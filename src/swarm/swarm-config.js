'use strict';

const fs = require('fs');
const path = require('path');

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
  const configPath = path.join(rootDir || '.', '.remembrance', 'swarm-config.json');
  let userConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
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
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
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
    // Check config first
    if (config.providers?.[provider]?.apiKey) {
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

  return available;
}

/**
 * Get the API key for a specific provider.
 * @param {string} provider - Provider name
 * @param {object} config - Swarm config
 * @returns {string|null} API key or null
 */
function getProviderKey(provider, config) {
  if (config.providers?.[provider]?.apiKey) {
    return config.providers[provider].apiKey;
  }
  const envMap = {
    claude: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GOOGLE_API_KEY',
    grok: 'GROK_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  };
  return process.env[envMap[provider]] || null;
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
};
