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

    wsServer.on('connection', (ws) => {
      wsServer.broadcast({ type: 'clients', count: wsServer.clients.size });
      // Listen for close on each individual connection to update client count
      if (ws && typeof ws.on === 'function') {
        ws.on('close', () => {
          wsServer.broadcast({ type: 'clients', count: wsServer.clients.size });
        });
      }
    });

    wsServer.on('message', (msg) => {
      try {
        const data = safeJsonParse(msg, null);
        if (!data) return;
        // subscribe is a no-op acknowledgement
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[websocket:setupWebSocket] silent failure:', e?.message || e);
        // Ignore malformed messages
      }
    });

    wsServer.on('error', (err) => {
      if (process.env.ORACLE_DEBUG) {
        console.error('[dashboard] WebSocket error:', err.message);
      }
    });
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[websocket:setupWebSocket] silent failure:', e?.message || e);
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

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
setupWebSocket.atomicProperties = { charge: 0, valence: 1, mass: "heavy", spin: "odd", phase: "gas", reactivity: "high", electronegativity: 1, group: 9, period: 4, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
