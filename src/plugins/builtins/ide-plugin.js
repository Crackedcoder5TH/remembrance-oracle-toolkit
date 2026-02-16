/**
 * IDE Plugin — opt-in IDE integration bridge and MCP installer.
 *
 * Provides LSP-style diagnostics, hover, code actions, and completions.
 * Load via: pluginManager.load(require('./builtins/ide-plugin'))
 */

module.exports = {
  name: 'ide',
  version: '1.0.0',
  description: 'IDE integration bridge (diagnostics, hover, code actions) and MCP auto-installer',
  author: 'remembrance-oracle',
  hooks: ['search'],

  activate(ctx) {
    const { IDEBridge, SEVERITY } = require('../../ide/bridge');

    ctx.oracle._ideFactory = { IDEBridge, SEVERITY };

    ctx.logger.info('IDE plugin activated — editor integration available');

    return function deactivate() {
      delete ctx.oracle._ideFactory;
      ctx.logger.info('IDE plugin deactivated');
    };
  },

  get exports() {
    return {
      ...require('../../ide/bridge'),
    };
  },
};
