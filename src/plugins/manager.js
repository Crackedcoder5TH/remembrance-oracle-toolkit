/**
 * Plugin Manager — Extensible hook system for the Remembrance Oracle.
 *
 * Plugins can hook into the oracle lifecycle:
 * - onBeforeSubmit / onAfterSubmit
 * - onBeforeValidate / onAfterValidate
 * - onPatternRegistered / onCandidateGenerated
 * - onSearch / onResolve
 *
 * Usage:
 *   const { PluginManager } = require('./plugins/manager');
 *   const pm = new PluginManager(oracle);
 *   pm.load('./my-plugin.js');
 */

const fs = require('fs');
const path = require('path');

// ─── Hook-based event emitter (pulled from oracle: event-emitter pattern) ───

class HookEmitter {
  constructor() { this._hooks = {}; }

  on(event, fn) {
    (this._hooks[event] = this._hooks[event] || []).push(fn);
    return this;
  }

  off(event, fn) {
    if (this._hooks[event]) this._hooks[event] = this._hooks[event].filter(h => h !== fn);
    return this;
  }

  emit(event, ...args) {
    if (this._hooks[event]) this._hooks[event].slice().forEach(h => h(...args));
    return this;
  }

  /**
   * Run hooks as a pipeline — each handler can transform the value.
   * Returns the final transformed value, or the original if no hooks modify it.
   */
  pipeline(event, value) {
    const handlers = this._hooks[event] || [];
    let result = value;
    for (const h of handlers) {
      const transformed = h(result);
      if (transformed !== undefined && transformed !== null) {
        result = transformed;
      }
    }
    return result;
  }

  clear(event) {
    if (event) {
      delete this._hooks[event];
    } else {
      this._hooks = {};
    }
  }
}

// ─── Plugin Logger ───

function createLogger(pluginName) {
  const prefix = `[plugin:${pluginName}]`;
  return {
    info: (msg) => console.log(`${prefix} ${msg}`),
    warn: (msg) => console.warn(`${prefix} ${msg}`),
    error: (msg) => console.error(`${prefix} ${msg}`),
    debug: (msg) => { if (process.env.ORACLE_DEBUG) console.log(`${prefix} [debug] ${msg}`); },
  };
}

// ─── Plugin Hooks Interface ───

function createHooksInterface(emitter) {
  return {
    onBeforeSubmit: (handler) => emitter.on('beforeSubmit', handler),
    onAfterSubmit: (handler) => emitter.on('afterSubmit', handler),
    onBeforeValidate: (handler) => emitter.on('beforeValidate', handler),
    onAfterValidate: (handler) => emitter.on('afterValidate', handler),
    onPatternRegistered: (handler) => emitter.on('patternRegistered', handler),
    onCandidateGenerated: (handler) => emitter.on('candidateGenerated', handler),
    onSearch: (handler) => emitter.on('search', handler),
    onResolve: (handler) => emitter.on('resolve', handler),
  };
}

// ─── Plugin Manager ───

const VALID_HOOKS = [
  'beforeSubmit', 'afterSubmit',
  'beforeValidate', 'afterValidate',
  'patternRegistered', 'candidateGenerated',
  'search', 'resolve',
];

class PluginManager {
  constructor(oracle, options = {}) {
    this._oracle = oracle;
    this._plugins = new Map(); // name → { manifest, deactivate? }
    this._emitter = new HookEmitter();
    this._pluginDir = options.pluginDir || null;
  }

  /**
   * Load a plugin from a file path or a plugin object.
   * @param {string|object} nameOrPath — file path or inline plugin object
   * @returns {{ name, version, description }} manifest
   */
  load(nameOrPath) {
    let plugin;
    let resolvedPath = null;

    if (typeof nameOrPath === 'string') {
      // Resolve file path
      resolvedPath = path.isAbsolute(nameOrPath)
        ? nameOrPath
        : path.resolve(process.cwd(), nameOrPath);

      if (!fs.existsSync(resolvedPath)) {
        // Try plugin directory
        if (this._pluginDir) {
          const dirPath = path.join(this._pluginDir, nameOrPath);
          if (fs.existsSync(dirPath)) resolvedPath = dirPath;
          else if (fs.existsSync(dirPath + '.js')) resolvedPath = dirPath + '.js';
          else throw new Error(`Plugin not found: ${nameOrPath}`);
        } else {
          throw new Error(`Plugin not found: ${nameOrPath}`);
        }
      }

      plugin = require(resolvedPath);
    } else if (typeof nameOrPath === 'object' && nameOrPath !== null) {
      plugin = nameOrPath;
    } else {
      throw new Error('Plugin must be a file path (string) or plugin object');
    }

    // Validate plugin shape
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a "name" property (string)');
    }
    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new Error(`Plugin "${plugin.name}" must have a "version" property (string)`);
    }

    // Check for duplicates
    if (this._plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already loaded. Unload it first.`);
    }

    // Create context
    const logger = createLogger(plugin.name);
    const hooks = createHooksInterface(this._emitter);
    const context = {
      oracle: this._oracle,
      patterns: this._oracle.patterns,
      hooks,
      logger,
    };

    // Activate
    let deactivate = null;
    if (typeof plugin.activate === 'function') {
      const result = plugin.activate(context);
      if (typeof result === 'function') {
        deactivate = result; // Plugin returned a cleanup function
      }
    }

    const manifest = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description || '',
      author: plugin.author || '',
      hooks: plugin.hooks || [],
      enabled: true,
    };

    this._plugins.set(plugin.name, {
      manifest,
      plugin,
      deactivate,
      resolvedPath,
    });

    return manifest;
  }

  /**
   * Unload a plugin by name.
   */
  unload(name) {
    const entry = this._plugins.get(name);
    if (!entry) {
      throw new Error(`Plugin "${name}" is not loaded`);
    }

    // Run deactivation
    if (typeof entry.deactivate === 'function') {
      entry.deactivate();
    } else if (typeof entry.plugin.deactivate === 'function') {
      entry.plugin.deactivate();
    }

    this._plugins.delete(name);

    // Clear require cache if loaded from file
    if (entry.resolvedPath) {
      delete require.cache[require.resolve(entry.resolvedPath)];
    }
  }

  /**
   * List all loaded plugins.
   */
  list() {
    return Array.from(this._plugins.values()).map(e => ({ ...e.manifest }));
  }

  /**
   * Enable a previously disabled plugin.
   */
  enable(name) {
    const entry = this._plugins.get(name);
    if (!entry) throw new Error(`Plugin "${name}" is not loaded`);
    entry.manifest.enabled = true;
  }

  /**
   * Disable a plugin without unloading it.
   */
  disable(name) {
    const entry = this._plugins.get(name);
    if (!entry) throw new Error(`Plugin "${name}" is not loaded`);
    entry.manifest.enabled = false;
  }

  // ─── Hook Triggers (called by the oracle) ───

  /**
   * Run beforeSubmit hooks. Returns potentially modified { code, metadata }.
   */
  beforeSubmit(code, metadata) {
    return this._emitter.pipeline('beforeSubmit', { code, metadata });
  }

  /**
   * Run afterSubmit hooks.
   */
  afterSubmit(result) {
    this._emitter.emit('afterSubmit', result);
  }

  /**
   * Run beforeValidate hooks. Returns potentially modified { code, options }.
   */
  beforeValidate(code, options) {
    return this._emitter.pipeline('beforeValidate', { code, options });
  }

  /**
   * Run afterValidate hooks.
   */
  afterValidate(result) {
    this._emitter.emit('afterValidate', result);
  }

  /**
   * Run patternRegistered hooks.
   */
  patternRegistered(pattern) {
    this._emitter.emit('patternRegistered', pattern);
  }

  /**
   * Run candidateGenerated hooks.
   */
  candidateGenerated(candidate) {
    this._emitter.emit('candidateGenerated', candidate);
  }

  /**
   * Run search hooks. Returns potentially modified results.
   */
  searchHook(query, results) {
    return this._emitter.pipeline('search', { query, results });
  }

  /**
   * Run resolve hooks. Returns potentially modified result.
   */
  resolveHook(request, result) {
    return this._emitter.pipeline('resolve', { request, result });
  }

  /**
   * Get the internal emitter (for advanced use).
   */
  get emitter() {
    return this._emitter;
  }

  /**
   * Get plugin count.
   */
  get count() {
    return this._plugins.size;
  }
}

module.exports = {
  PluginManager,
  HookEmitter,
  createLogger,
  VALID_HOOKS,
};
