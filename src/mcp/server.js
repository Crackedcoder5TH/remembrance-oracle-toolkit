/**
 * MCP (Model Context Protocol) Server
 *
 * Exposes the Remembrance Oracle as an MCP-compatible tool server.
 * Communicates via JSON-RPC 2.0 over stdin/stdout.
 *
 * 12 focused tools:
 *   search, resolve, submit, register, feedback, stats, debug, sync, harvest, maintain, healing, swarm
 *
 * Tool definitions in ./tools.js, handler implementations in ./handlers.js.
 */

const readline = require('readline');
const { RemembranceOracle } = require('../api/oracle');
const { safeJsonParse } = require('../core/covenant');
const { TOOLS } = require('./tools');
const { HANDLERS } = require('./handlers');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'remembrance-oracle', version: '3.0.0' };

// ─── Per-tool rate limit tiers ───
// read-only tools get a generous limit; write/compute tools are tighter
const RATE_LIMITS = {
  // Read-only: 60 calls per minute
  oracle_search:   { windowMs: 60000, maxCalls: 60 },
  oracle_resolve:  { windowMs: 60000, maxCalls: 60 },
  oracle_stats:    { windowMs: 60000, maxCalls: 60 },
  oracle_feedback: { windowMs: 60000, maxCalls: 60 },
  oracle_healing:  { windowMs: 60000, maxCalls: 60 },
  // Write tools: 20 calls per minute
  oracle_submit:   { windowMs: 60000, maxCalls: 20 },
  oracle_register: { windowMs: 60000, maxCalls: 20 },
  oracle_debug:    { windowMs: 60000, maxCalls: 30 },
  oracle_sync:     { windowMs: 60000, maxCalls: 10 },
  // Expensive compute: 5 calls per minute
  oracle_harvest:  { windowMs: 60000, maxCalls: 5 },
  oracle_maintain: { windowMs: 60000, maxCalls: 5 },
  oracle_swarm:    { windowMs: 60000, maxCalls: 5 },
};

// ─── Numeric parameter bounds ───
const NUMERIC_BOUNDS = {
  limit:           { min: 1, max: 100 },
  maxFiles:        { min: 1, max: 500 },
  maxHealsPerRun:  { min: 1, max: 50 },
  maxCandidates:   { min: 1, max: 100 },
  maxLoops:        { min: 1, max: 10 },
  minCoherency:    { min: 0, max: 1 },
  targetCoherence: { min: 0, max: 1 },
  minDelta:        { min: 0, max: 1 },
};

class MCPServer {
  constructor(oracle, options = {}) {
    this.oracle = oracle || new RemembranceOracle();
    this._initialized = false;
    this._rateLimits = options.rateLimits || RATE_LIMITS;
    this._numericBounds = options.numericBounds || NUMERIC_BOUNDS;
    // Per-tool call timestamps for sliding window rate limiting
    this._callLog = new Map();
    // Cleanup stale entries every 2 minutes
    this._cleanupTimer = setInterval(() => this._cleanupCallLog(), 120000);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  _cleanupCallLog() {
    const now = Date.now();
    for (const [tool, timestamps] of this._callLog) {
      const limit = this._rateLimits[tool];
      if (!limit) { this._callLog.delete(tool); continue; }
      const valid = timestamps.filter(t => now - t < limit.windowMs);
      if (valid.length === 0) this._callLog.delete(tool);
      else this._callLog.set(tool, valid);
    }
  }

  /**
   * Check per-tool rate limit. Returns null if allowed, or an error message if exceeded.
   */
  _checkRateLimit(toolName) {
    const limit = this._rateLimits[toolName];
    if (!limit) return null; // No limit configured — allow
    const now = Date.now();
    const timestamps = (this._callLog.get(toolName) || []).filter(t => now - t < limit.windowMs);
    if (timestamps.length >= limit.maxCalls) {
      const retryAfter = Math.ceil(limit.windowMs / 1000);
      return `Rate limit exceeded for ${toolName}: max ${limit.maxCalls} calls per ${retryAfter}s. Try again later.`;
    }
    timestamps.push(now);
    this._callLog.set(toolName, timestamps);
    return null;
  }

  /**
   * Clamp numeric parameters to safe bounds.
   */
  _clampNumericParams(args) {
    if (!args || typeof args !== 'object') return args;
    const clamped = { ...args };
    for (const [key, bounds] of Object.entries(this._numericBounds)) {
      if (key in clamped && typeof clamped[key] === 'number') {
        clamped[key] = Math.max(bounds.min, Math.min(bounds.max, clamped[key]));
      }
    }
    return clamped;
  }

  async handleRequest(msg) {
    const { id, method, params } = msg;

    // Notifications (no id)
    if (method === 'notifications/initialized') {
      this._initialized = true;
      return null;
    }

    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        };

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: TOOLS },
        };

      case 'tools/call':
        return this._handleToolCall(id, params);

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  /**
   * Validate required parameters for a tool call against its inputSchema.
   */
  _validateParams(toolName, args) {
    const tool = TOOLS.find(t => t.name === toolName);
    if (!tool) return `Unknown tool: ${toolName}`;
    const required = tool.inputSchema?.required || [];
    const missing = required.filter(p => args[p] === undefined || args[p] === null);
    if (missing.length > 0) {
      return `Missing required parameter(s): ${missing.join(', ')}`;
    }
    return null;
  }

  async _handleToolCall(id, params) {
    const { name, arguments: args = {} } = params || {};

    const validationError = this._validateParams(name, args);
    if (validationError) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: validationError },
      };
    }

    // Per-tool rate limiting
    const rateLimitError = this._checkRateLimit(name);
    if (rateLimitError) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: rateLimitError },
      };
    }

    const handler = HANDLERS[name];
    if (!handler) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Unknown tool: ${name}` },
      };
    }

    // Clamp numeric parameters to safe bounds
    const clampedArgs = this._clampNumericParams(args);

    try {
      const result = await handler(this.oracle, clampedArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Internal error: ${err.message}` },
      };
    }
  }
}

/**
 * Start the MCP server, reading JSON-RPC messages from stdin.
 */
function startMCPServer(oracle) {
  const server = new MCPServer(oracle);
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', async (line) => {
    try {
      const msg = safeJsonParse(line.trim(), null);
      if (!msg) throw new Error('Invalid JSON');
      const response = await server.handleRequest(msg);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      if (process.env.ORACLE_DEBUG) console.warn('[server:startMCPServer] silent failure:', err?.message || err);
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });

  rl.on('error', (err) => {
    if (process.env.ORACLE_DEBUG) {
      console.error('[mcp] readline error:', err.message);
    }
  });

  process.stdin.on('error', (err) => {
    if (process.env.ORACLE_DEBUG) {
      console.error('[mcp] stdin error:', err.message);
    }
  });

  return server;
}

// Allow running directly: node src/mcp/server.js
if (require.main === module) {
  startMCPServer();
}

module.exports = { MCPServer, startMCPServer, TOOLS, RATE_LIMITS, NUMERIC_BOUNDS };
