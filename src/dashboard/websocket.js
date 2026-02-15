'use strict';

/**
 * Dashboard WebSocket — real-time event forwarding.
 * Extracted from server.js for clarity.
 */

const { safeJsonParse } = require('../core/covenant');

function setupWebSocket(server, oracleInstance) {
  let wsServer = null;

  try {
    const { WebSocketServer } = require('../core/websocket');
    wsServer = new WebSocketServer(server);

    wsServer.on('connection', () => {
      wsServer.broadcast({ type: 'clients', count: wsServer.clients.size });
    });

    wsServer.on('close', () => {
      wsServer.broadcast({ type: 'clients', count: wsServer.clients.size });
    });

    wsServer.on('message', (msg) => {
      try {
        const data = safeJsonParse(msg, null);
        if (!data) return;
        // subscribe is a no-op acknowledgement
      } catch {
        // Ignore malformed messages
      }
    });

    wsServer.on('error', (err) => {
      if (process.env.ORACLE_DEBUG) {
        console.error('[dashboard] WebSocket error:', err.message);
      }
    });
  } catch {
    // WebSocket module not available — dashboard works without it
  }

  // Public broadcast method
  server.broadcast = function(event) {
    if (wsServer) wsServer.broadcast(event);
  };

  // Auto-forward Oracle events
  if (oracleInstance && oracleInstance.on) {
    oracleInstance.on((event) => {
      if (wsServer) wsServer.broadcast(event);
    });
  }

  return wsServer;
}

module.exports = { setupWebSocket };
