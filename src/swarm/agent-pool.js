'use strict';

const { getProviderKey, getProviderModel } = require('./swarm-config');

/**
 * Create a provider adapter that implements the unified agent interface.
 * Each adapter normalizes its provider's API to: send(prompt, options) → { response, meta }
 *
 * @param {string} provider - Provider name (claude, openai, gemini, grok, deepseek, ollama)
 * @param {object} config - Swarm config
 * @returns {object} Agent adapter
 */
function createAdapter(provider, config) {
  const model = getProviderModel(provider, config);
  const key = getProviderKey(provider, config);
  const timeoutMs = config.timeoutMs || 30000;

  const adapters = {
    claude: () => createClaudeAdapter(key, model, timeoutMs),
    openai: () => createOpenAIAdapter(key, model, timeoutMs),
    gemini: () => createGeminiAdapter(key, model, timeoutMs),
    grok: () => createGrokAdapter(key, model, timeoutMs),
    deepseek: () => createDeepSeekAdapter(key, model, timeoutMs),
    ollama: () => createOllamaAdapter(model, timeoutMs, config),
  };

  const factory = adapters[provider];
  if (!factory) throw new Error(`Unknown provider: ${provider}`);
  return factory();
}

/**
 * Anthropic Claude adapter.
 */
function createClaudeAdapter(apiKey, model, timeoutMs) {
  return {
    name: 'claude',
    model,
    async send(prompt, options = {}) {
      const body = {
        model: options.model || model,
        max_tokens: options.maxTokens || 4096,
        messages: [{ role: 'user', content: prompt }],
      };
      if (options.system) body.system = options.system;

      const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      }, timeoutMs);

      const data = await res.json();
      if (data.error) throw new Error(`Claude: ${data.error.message}`);
      const text = data.content?.[0]?.text || '';
      return {
        response: text,
        meta: { model: data.model, usage: data.usage, provider: 'claude' },
      };
    },
  };
}

/**
 * OpenAI (GPT-4o/4.5) adapter.
 */
function createOpenAIAdapter(apiKey, model, timeoutMs) {
  return {
    name: 'openai',
    model,
    async send(prompt, options = {}) {
      const messages = [];
      if (options.system) messages.push({ role: 'system', content: options.system });
      messages.push({ role: 'user', content: prompt });

      const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || model,
          messages,
          max_tokens: options.maxTokens || 4096,
        }),
      }, timeoutMs);

      const data = await res.json();
      if (data.error) throw new Error(`OpenAI: ${data.error.message}`);
      const text = data.choices?.[0]?.message?.content || '';
      return {
        response: text,
        meta: { model: data.model, usage: data.usage, provider: 'openai' },
      };
    },
  };
}

/**
 * Google Gemini adapter.
 */
function createGeminiAdapter(apiKey, model, timeoutMs) {
  return {
    name: 'gemini',
    model,
    async send(prompt, options = {}) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model || model}:generateContent?key=${apiKey}`;
      const body = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      if (options.system) {
        body.systemInstruction = { parts: [{ text: options.system }] };
      }

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs);

      const data = await res.json();
      if (data.error) throw new Error(`Gemini: ${data.error.message}`);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        response: text,
        meta: { model: model, provider: 'gemini' },
      };
    },
  };
}

/**
 * xAI Grok adapter (OpenAI-compatible API).
 */
function createGrokAdapter(apiKey, model, timeoutMs) {
  return {
    name: 'grok',
    model,
    async send(prompt, options = {}) {
      const messages = [];
      if (options.system) messages.push({ role: 'system', content: options.system });
      messages.push({ role: 'user', content: prompt });

      const res = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || model,
          messages,
          max_tokens: options.maxTokens || 4096,
        }),
      }, timeoutMs);

      const data = await res.json();
      if (data.error) throw new Error(`Grok: ${data.error.message}`);
      const text = data.choices?.[0]?.message?.content || '';
      return {
        response: text,
        meta: { model: data.model, usage: data.usage, provider: 'grok' },
      };
    },
  };
}

/**
 * DeepSeek adapter (OpenAI-compatible API).
 */
function createDeepSeekAdapter(apiKey, model, timeoutMs) {
  return {
    name: 'deepseek',
    model,
    async send(prompt, options = {}) {
      const messages = [];
      if (options.system) messages.push({ role: 'system', content: options.system });
      messages.push({ role: 'user', content: prompt });

      const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || model,
          messages,
          max_tokens: options.maxTokens || 4096,
        }),
      }, timeoutMs);

      const data = await res.json();
      if (data.error) throw new Error(`DeepSeek: ${data.error.message}`);
      const text = data.choices?.[0]?.message?.content || '';
      return {
        response: text,
        meta: { model: data.model, usage: data.usage, provider: 'deepseek' },
      };
    },
  };
}

/**
 * Ollama adapter (local models, no API key needed).
 */
function createOllamaAdapter(model, timeoutMs, config) {
  const host = config.providers?.ollama?.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
  return {
    name: 'ollama',
    model,
    async send(prompt, options = {}) {
      const body = {
        model: options.model || model,
        prompt,
        stream: false,
      };
      if (options.system) body.system = options.system;

      const res = await fetchWithTimeout(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs);

      const data = await res.json();
      return {
        response: data.response || '',
        meta: { model: data.model, provider: 'ollama', eval_count: data.eval_count },
      };
    },
  };
}

/**
 * Fetch with a timeout using AbortController.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create the agent pool — a managed collection of provider adapters.
 *
 * @param {object} config - Swarm config
 * @param {string[]} providerNames - Which providers to include
 * @returns {object} Pool with agents, send, sendAll, shutdown
 */
function createAgentPool(config, providerNames) {
  const agents = [];
  for (const name of providerNames) {
    try {
      agents.push(createAdapter(name, config));
    } catch {
      // Skip unavailable providers silently
    }
  }

  return {
    agents,
    get size() { return agents.length; },

    async send(agentName, prompt, options) {
      const agent = agents.find(a => a.name === agentName);
      if (!agent) throw new Error(`Agent not found: ${agentName}`);
      return agent.send(prompt, options);
    },

    async sendAll(prompt, options) {
      const results = await Promise.allSettled(
        agents.map(async (agent) => {
          const start = Date.now();
          try {
            const result = await agent.send(prompt, options);
            return { agent: agent.name, model: agent.model, ...result, durationMs: Date.now() - start };
          } catch (err) {
            return { agent: agent.name, model: agent.model, error: err.message, durationMs: Date.now() - start };
          }
        })
      );
      return results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Unknown error' });
    },

    shutdown() {
      agents.length = 0;
    },
  };
}

/**
 * Get list of available provider names.
 */
function getAvailableProviders(config) {
  const { resolveProviders } = require('./swarm-config');
  return resolveProviders(config);
}

module.exports = {
  createAgentPool,
  createAdapter,
  getAvailableProviders,
  fetchWithTimeout,
};
