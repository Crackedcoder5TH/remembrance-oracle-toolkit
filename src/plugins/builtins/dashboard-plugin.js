/**
 * Dashboard Plugin — opt-in web dashboard for the Remembrance Oracle.
 *
 * Registers the dashboard server, middleware, and websocket as an optional plugin.
 * Load via: pluginManager.load(require('./builtins/dashboard-plugin'))
 */

module.exports = {
  name: 'dashboard',
  version: '1.0.0',
  description: 'Web dashboard with real-time monitoring, pattern browsing, and health metrics',
  author: 'remembrance-oracle',
  hooks: ['afterSubmit', 'patternRegistered'],

  activate(ctx) {
    const { createDashboardServer, startDashboard, createRateLimiter } = require('../../dashboard/server');

    // Expose dashboard factory on the oracle for CLI/programmatic use
    ctx.oracle._dashboardFactory = { createDashboardServer, startDashboard, createRateLimiter };

    ctx.logger.info('Dashboard plugin activated — use oracle.startDashboard() or CLI "oracle dashboard"');

    return function deactivate() {
      delete ctx.oracle._dashboardFactory;
      ctx.logger.info('Dashboard plugin deactivated');
    };
  },

  // Direct access for programmatic use
  get exports() {
    return require('../../dashboard/server');
  },
};
