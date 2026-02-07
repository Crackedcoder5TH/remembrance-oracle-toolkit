#!/usr/bin/env node
/**
 * Deploy-Ready Server — Production entry point for Remembrance Oracle.
 *
 * Features:
 * - Configurable via environment variables
 * - Graceful shutdown (SIGTERM/SIGINT)
 * - Health endpoint at /api/health
 * - Landing page at /
 * - API + Dashboard + WebSocket on a single port
 * - Optional CORS origin restriction
 * - Optional request logging
 *
 * Usage:
 *   PORT=3333 node src/deploy.js
 *   ORACLE_DIR=./data PORT=8080 LOG=true node src/deploy.js
 */

const path = require('path');
const { RemembranceOracle } = require('./api/oracle');
const { createDashboardServer } = require('./dashboard/server');

// ─── Configuration from environment ───
const PORT = parseInt(process.env.PORT || process.env.ORACLE_PORT || '3333', 10);
const HOST = process.env.HOST || process.env.ORACLE_HOST || '0.0.0.0';
const ORACLE_DIR = process.env.ORACLE_DIR || path.join(process.cwd(), '.remembrance');
const AUTH_ENABLED = process.env.AUTH !== 'false';
const LOG_ENABLED = process.env.LOG === 'true';
const RATE_LIMIT = process.env.RATE_LIMIT !== 'false';
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW || '60000', 10);
const RATE_MAX = parseInt(process.env.RATE_MAX || '100', 10);
const AUTO_SEED = process.env.AUTO_SEED !== 'false';

function banner() {
  return [
    '',
    '  ╔══════════════════════════════════════════╗',
    '  ║       Remembrance Oracle Server          ║',
    '  ║    Proven code memory for everyone        ║',
    '  ╚══════════════════════════════════════════╝',
    '',
  ].join('\n');
}

function start() {
  console.log(banner());

  // Initialize Oracle
  const oracle = new RemembranceOracle({
    baseDir: ORACLE_DIR,
    autoSeed: AUTO_SEED,
  });

  // Create server with all features
  const server = createDashboardServer(oracle, {
    auth: AUTH_ENABLED,
    rateLimit: RATE_LIMIT,
    rateLimitOptions: { windowMs: RATE_WINDOW, maxRequests: RATE_MAX },
  });

  // Request logging
  if (LOG_ENABLED) {
    const origEmit = server.emit.bind(server);
    server.emit = function (event, req, res) {
      if (event === 'request' && req && res) {
        const start = Date.now();
        res.on('finish', () => {
          const ms = Date.now() - start;
          console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
        });
      }
      return origEmit(event, req, res);
    };
  }

  // Start listening
  server.listen(PORT, HOST, () => {
    const stats = oracle.stats();
    const pStats = oracle.patternStats();

    console.log(`  Host:       ${HOST}:${PORT}`);
    console.log(`  Dashboard:  http://localhost:${PORT}`);
    console.log(`  API:        http://localhost:${PORT}/api`);
    if (server.wsServer) {
      console.log(`  WebSocket:  ws://localhost:${PORT}`);
    }
    console.log(`  Store:      ${ORACLE_DIR}`);
    console.log(`  Auth:       ${AUTH_ENABLED ? 'enabled' : 'disabled'}`);
    console.log(`  Rate limit: ${RATE_LIMIT ? RATE_MAX + '/' + (RATE_WINDOW / 1000) + 's' : 'disabled'}`);
    console.log(`  Patterns:   ${pStats.totalPatterns || 0}`);
    console.log(`  Entries:    ${stats.totalEntries || 0}`);
    console.log('');
    console.log('  Ready to serve proven code.');
    console.log('');
  });

  // Graceful shutdown
  function shutdown(signal) {
    console.log(`\n  Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('  Server closed. Goodbye.');
      process.exit(0);
    });
    // Force exit after 5 seconds
    setTimeout(() => {
      console.error('  Forced shutdown after timeout.');
      process.exit(1);
    }, 5000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

// Run if executed directly
if (require.main === module) {
  start();
}

module.exports = { start };
