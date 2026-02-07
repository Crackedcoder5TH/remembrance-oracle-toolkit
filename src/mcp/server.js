/**
 * MCP (Model Context Protocol) Server
 *
 * Exposes the Remembrance Oracle as an MCP-compatible tool server.
 * Communicates via JSON-RPC 2.0 over stdin/stdout.
 *
 * Any AI client that supports MCP can connect and use:
 * - oracle_search: Search for proven code patterns
 * - oracle_resolve: Smart pull/evolve/generate decision
 * - oracle_submit: Submit code for validation and storage
 * - oracle_query: Query stored entries
 * - oracle_feedback: Report if pulled code worked
 * - oracle_stats: Get store statistics
 * - oracle_register_pattern: Register a pattern in the library
 * - oracle_nearest: Find nearest vocabulary terms
 */

const readline = require('readline');
const { RemembranceOracle } = require('../api/oracle');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'remembrance-oracle', version: '1.0.0' };

const TOOLS = [
  {
    name: 'oracle_search',
    description: 'Search for proven, validated code patterns. Returns ranked results by relevance and coherency.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query (e.g., "binary search", "rate limiting")' },
        language: { type: 'string', description: 'Filter by language (javascript, python, go, rust, typescript)' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
        mode: { type: 'string', enum: ['hybrid', 'semantic'], description: 'Search mode (default: hybrid)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_resolve',
    description: 'Smart retrieval — decides whether to PULL existing code, EVOLVE a close match, or GENERATE new code.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What you need the code to do' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Relevant tags' },
        language: { type: 'string', description: 'Preferred language' },
      },
      required: ['description'],
    },
  },
  {
    name: 'oracle_submit',
    description: 'Submit code for validation and storage. Code must pass coherency checks.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to submit' },
        language: { type: 'string', description: 'Code language' },
        description: { type: 'string', description: 'What the code does' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        testCode: { type: 'string', description: 'Test code to validate against' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_query',
    description: 'Query stored validated code entries by description, tags, and language.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Description to match against' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by' },
        language: { type: 'string', description: 'Language filter' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
      },
    },
  },
  {
    name: 'oracle_feedback',
    description: 'Report whether previously pulled code worked in practice.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry or pattern ID' },
        success: { type: 'boolean', description: 'Whether the code worked' },
      },
      required: ['id', 'success'],
    },
  },
  {
    name: 'oracle_stats',
    description: 'Get statistics about the Oracle store and pattern library.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_register_pattern',
    description: 'Register code as a named, reusable pattern in the library.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pattern name' },
        code: { type: 'string', description: 'The code' },
        language: { type: 'string', description: 'Language' },
        description: { type: 'string', description: 'What it does' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        testCode: { type: 'string', description: 'Test code' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'oracle_nearest',
    description: 'Find the nearest semantic vocabulary terms to a query. Useful for understanding how the Oracle interprets your intent.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query to find nearest terms for' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_versions',
    description: 'Get version history for a pattern, showing all saved snapshots.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID to get history for' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_semantic_diff',
    description: 'Perform a semantic diff between two code entries, showing function-level changes and structural analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        idA: { type: 'string', description: 'ID of the first entry/pattern' },
        idB: { type: 'string', description: 'ID of the second entry/pattern' },
      },
      required: ['idA', 'idB'],
    },
  },
];

class MCPServer {
  constructor(oracle) {
    this.oracle = oracle || new RemembranceOracle();
    this._initialized = false;
  }

  handleRequest(msg) {
    const { id, method, params } = msg;

    // Notifications (no id)
    if (method === 'notifications/initialized') {
      this._initialized = true;
      return null; // No response for notifications
    }

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };
    }

    if (method === 'tools/call') {
      return this._handleToolCall(id, params);
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown method: ${method}` },
    };
  }

  _handleToolCall(id, params) {
    const { name, arguments: args = {} } = params || {};

    try {
      let result;

      switch (name) {
        case 'oracle_search':
          result = this.oracle.search(args.query || '', {
            limit: args.limit || 5,
            language: args.language,
            mode: args.mode || 'hybrid',
          });
          break;

        case 'oracle_resolve':
          result = this.oracle.resolve({
            description: args.description || '',
            tags: args.tags || [],
            language: args.language,
          });
          break;

        case 'oracle_submit':
          result = this.oracle.submit(args.code, {
            language: args.language,
            description: args.description || '',
            tags: args.tags || [],
            testCode: args.testCode,
          });
          break;

        case 'oracle_query':
          result = this.oracle.query({
            description: args.description || '',
            tags: args.tags || [],
            language: args.language,
            limit: args.limit || 5,
          });
          break;

        case 'oracle_feedback':
          result = this.oracle.feedback(args.id, args.success);
          break;

        case 'oracle_stats': {
          const storeStats = this.oracle.stats();
          const patternStats = this.oracle.patternStats();
          result = { store: storeStats, patterns: patternStats };
          break;
        }

        case 'oracle_register_pattern':
          result = this.oracle.registerPattern({
            name: args.name,
            code: args.code,
            language: args.language,
            description: args.description || '',
            tags: args.tags || [],
            testCode: args.testCode,
          });
          break;

        case 'oracle_nearest': {
          const { nearestTerms } = require('../core/vectors');
          result = nearestTerms(args.query || '', args.limit || 10);
          break;
        }

        case 'oracle_versions': {
          const { VersionManager } = require('../core/versioning');
          const sqliteStore = this.oracle.store.getSQLiteStore();
          const vm = new VersionManager(sqliteStore);
          result = vm.getHistory(args.patternId);
          break;
        }

        case 'oracle_semantic_diff': {
          const { semanticDiff } = require('../core/versioning');
          const entryA = this.oracle.patterns.getAll().find(p => p.id === args.idA) || this.oracle.store.get(args.idA);
          const entryB = this.oracle.patterns.getAll().find(p => p.id === args.idB) || this.oracle.store.get(args.idB);
          if (!entryA) throw new Error(`Entry ${args.idA} not found`);
          if (!entryB) throw new Error(`Entry ${args.idB} not found`);
          result = semanticDiff(entryA.code, entryB.code, entryA.language);
          break;
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Unknown tool: ${name}` }],
              isError: true,
            },
          };
      }

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
        result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        },
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

  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line.trim());
      const response = server.handleRequest(msg);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });

  return server;
}

// Allow running directly: node src/mcp/server.js
if (require.main === module) {
  startMCPServer();
}

module.exports = { MCPServer, startMCPServer, TOOLS };
