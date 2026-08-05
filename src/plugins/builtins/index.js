/**
 * Built-in Plugin Registry — opt-in subsystems for the Remembrance Oracle.
 *
 * These subsystems are NOT loaded by default. Load them explicitly:
 *   const { PluginManager } = require('./plugins/manager');
 *   const pm = new PluginManager(oracle);
 *   pm.load(require('./plugins/builtins/dashboard-plugin'));
 *
 * Or load all at once:
 *   const { loadAllBuiltins } = require('./plugins/builtins');
 *   loadAllBuiltins(pluginManager);
 */

const BUILTIN_PLUGINS = {
  dashboard: () => require('./dashboard-plugin'),
  cloud: () => require('./cloud-plugin'),
  auth: () => require('./auth-plugin'),
  ide: () => require('./ide-plugin'),
  ci: () => require('./ci-plugin'),
};

/**
 * Load a specific built-in plugin by name.
 * @param {PluginManager} pm - Plugin manager instance
 * @param {string} name - Plugin name (dashboard, cloud, auth, ide, ci)
 * @returns {object} Plugin manifest
 */
function loadBuiltinPlugin(pm, name) {
  const factory = BUILTIN_PLUGINS[name];
  if (!factory) throw new Error(`Unknown built-in plugin: "${name}". Available: ${Object.keys(BUILTIN_PLUGINS).join(', ')}`);
  return pm.load(factory());
}

/**
 * Load all built-in plugins.
 * @param {PluginManager} pm - Plugin manager instance
 * @returns {object[]} Array of plugin manifests
 */
function loadAllBuiltins(pm) {
  return Object.keys(BUILTIN_PLUGINS).map(name => loadBuiltinPlugin(pm, name));
}

/**
 * List available built-in plugin names.
 * @returns {string[]}
 */
function listBuiltins() {
  return Object.keys(BUILTIN_PLUGINS);
}

module.exports = { BUILTIN_PLUGINS, loadBuiltinPlugin, loadAllBuiltins, listBuiltins };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
loadBuiltinPlugin.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
loadAllBuiltins.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 5, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
listBuiltins.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 5, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
