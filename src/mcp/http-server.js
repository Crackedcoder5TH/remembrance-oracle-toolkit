/**
 * @oracle-infrastructure
 *
 * MCP HTTP transport — wraps the stdio MCPServer with a single
 * `POST /mcp` endpoint speaking JSON-RPC 2.0. Lets any AI agent that
 * can't spawn a local process (Grok API, ChatGPT custom GPTs, web
 * agents, anything behind a tunnel) consume the same 38 tools as the
 * stdio server.
 *
 *   - GET  /health  → {status, server, transport, tools}
 *   - POST /mcp     → JSON-RPC body, returns JSON-RPC response
 *
 * Auth: optional bearer token. When `token` is set, every request to
 * /mcp must carry `Authorization: Bearer <token>`. /health is always
 * unauthenticated so reverse proxies / uptime probes can hit it.
 *
 * CORS: open by default (Access-Control-Allow-Origin: *). Browser
 * agents can call it. If you don't want that, set
 * ORACLE_MCP_CORS_ORIGIN to a specific origin.
 */

const http = require('http');
const { MCPServer, TOOLS } = require('./server');
const { RemembranceOracle } = require('../api/oracle');

const MAX_BODY_BYTES = 1_000_000; // 1 MB cap on JSON-RPC payloads

function startHTTPServer({ host = '127.0.0.1', port = 7787, token = null, oracle } = {}) {
  const mcpServer = new MCPServer(oracle || new RemembranceOracle());
  const corsOrigin = process.env.ORACLE_MCP_CORS_ORIGIN || '*';

  const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        server: 'remembrance-oracle',
        transport: 'http',
        tools: TOOLS.length,
        auth: token ? 'bearer' : 'none',
      }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Use POST /mcp with a JSON-RPC body, or GET /health' }));
      return;
    }

    if (token) {
      const auth = req.headers.authorization || '';
      if (auth !== `Bearer ${token}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized — missing or invalid bearer token' }));
        return;
      }
    }

    let body = '';
    let aborted = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large (>1MB)' }));
        req.destroy();
      }
    });
    req.on('end', async () => {
      if (aborted) return;
      let msgId = null;
      try {
        const msg = JSON.parse(body);
        msgId = msg.id ?? null;
        const response = await mcpServer.handleRequest(msg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response || { jsonrpc: '2.0', id: msgId, result: {} }));
      } catch (err) {
        const isParse = err instanceof SyntaxError;
        res.writeHead(isParse ? 400 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: msgId,
          error: {
            code: isParse ? -32700 : -32603,
            message: isParse ? 'Parse error' : `Internal error: ${err.message}`,
          },
        }));
      }
    });
  });

  httpServer.listen(port, host, () => {
    const authNote = token ? ' (bearer auth required)' : '';
    const reach = host === '0.0.0.0' ? '(reachable on LAN)' : '(loopback only)';
    process.stderr.write(`[mcp:http] listening on http://${host}:${port} ${reach}${authNote}\n`);
    process.stderr.write(`[mcp:http] ${TOOLS.length} tools exposed — POST /mcp with JSON-RPC body\n`);
  });

  return { mcpServer, httpServer };
}

startHTTPServer.atomicProperties = {
  charge: 1, valence: 8, mass: 'medium', spin: 'even', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'mcp-transport-http',
};

module.exports = { startHTTPServer };
