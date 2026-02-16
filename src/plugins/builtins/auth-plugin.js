/**
 * Auth Plugin — opt-in authentication and authorization.
 *
 * Only needed when dashboard or cloud server is exposed.
 * Load via: pluginManager.load(require('./builtins/auth-plugin'))
 */

module.exports = {
  name: 'auth',
  version: '1.0.0',
  description: 'Token-based auth with role-based access control (admin/contributor/viewer)',
  author: 'remembrance-oracle',
  hooks: [],

  activate(ctx) {
    const { AuthManager, authMiddleware, ROLES, canWrite, canManageUsers, canRead } = require('../../auth/auth');
    const { TeamManager, TEAM_ROLES, TEAM_ROLE_HIERARCHY } = require('../../auth/teams');

    ctx.oracle._authFactory = {
      AuthManager, authMiddleware, ROLES, canWrite, canManageUsers, canRead,
      TeamManager, TEAM_ROLES, TEAM_ROLE_HIERARCHY,
    };

    ctx.logger.info('Auth plugin activated — role-based access control available');

    return function deactivate() {
      delete ctx.oracle._authFactory;
      ctx.logger.info('Auth plugin deactivated');
    };
  },

  get exports() {
    return {
      ...require('../../auth/auth'),
      ...require('../../auth/teams'),
    };
  },
};
