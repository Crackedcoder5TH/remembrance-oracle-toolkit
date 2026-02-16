/**
 * Cloud Plugin — opt-in cloud sync server and remote federation client.
 *
 * Registers cloud sync capabilities as an optional plugin.
 * Load via: pluginManager.load(require('./builtins/cloud-plugin'))
 */

module.exports = {
  name: 'cloud',
  version: '1.0.0',
  description: 'Cloud sync server (REST + WebSocket) and remote federation client',
  author: 'remembrance-oracle',
  hooks: ['afterSubmit'],

  activate(ctx) {
    const cloudServer = require('../../cloud/server');
    const cloudClient = require('../../cloud/client');

    // Expose cloud capabilities on the oracle
    ctx.oracle._cloudFactory = {
      CloudSyncServer: cloudServer.CloudSyncServer,
      createToken: cloudServer.createToken,
      verifyToken: cloudServer.verifyToken,
      RemoteOracleClient: cloudClient.RemoteOracleClient,
      registerRemote: cloudClient.registerRemote,
      removeRemote: cloudClient.removeRemote,
      listRemotes: cloudClient.listRemotes,
      federatedRemoteSearch: cloudClient.federatedRemoteSearch,
      checkRemoteHealth: cloudClient.checkRemoteHealth,
    };

    ctx.logger.info('Cloud plugin activated — remote federation available');

    return function deactivate() {
      delete ctx.oracle._cloudFactory;
      ctx.logger.info('Cloud plugin deactivated');
    };
  },

  get exports() {
    return {
      ...require('../../cloud/server'),
      ...require('../../cloud/client'),
    };
  },
};
