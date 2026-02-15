/**
 * MCP (Model Context Protocol) Server
 *
 * Exposes the Remembrance Oracle as an MCP-compatible tool server.
 * Communicates via JSON-RPC 2.0 over stdin/stdout.
 *
 * Consolidated to 10 focused tools (down from 55+):
 *   search, resolve, submit, register, feedback, stats, debug, sync, harvest, maintain
 */

const readline = require('readline');
const { RemembranceOracle } = require('../api/oracle');
const { safeJsonParse } = require('../core/covenant');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'remembrance-oracle', version: '3.0.0' };

const TOOLS = [
  // ─── 1. Search (unified: search + smart_search + query) ───
  {
    name: 'oracle_search',
    description: 'Unified search across proven code patterns. Supports basic, smart (intent-aware with typo correction), and structured query modes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        language: { type: 'string', description: 'Filter by language (javascript, python, go, rust, typescript)' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
        mode: { type: 'string', enum: ['hybrid', 'semantic', 'smart'], description: 'Search mode: hybrid (default), semantic, or smart (intent-aware with typo correction)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (structured query mode)' },
        description: { type: 'string', description: 'Description to match (structured query mode — used instead of query)' },
      },
      required: ['query'],
    },
  },

  // ─── 2. Resolve ───
  {
    name: 'oracle_resolve',
    description: 'Smart retrieval — decides whether to PULL existing code, EVOLVE a close match, or GENERATE new code. Returns healed code and a whisper from the healed future.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What you need the code to do' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Relevant tags' },
        language: { type: 'string', description: 'Preferred language' },
        heal: { type: 'boolean', description: 'Run healing on matched code (default: true)', default: true },
      },
      required: ['description'],
    },
  },

  // ─── 3. Submit ───
  {
    name: 'oracle_submit',
    description: 'Submit code for validation and storage. Code must pass covenant and coherency checks.',
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

  // ─── 4. Register ───
  {
    name: 'oracle_register',
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

  // ─── 5. Feedback ───
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

  // ─── 6. Stats ───
  {
    name: 'oracle_stats',
    description: 'Get statistics about the Oracle store, pattern library, and candidates.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ─── 7. Debug (unified: capture + search + feedback + stats + grow + patterns) ───
  {
    name: 'oracle_debug',
    description: 'Debug oracle — manage error→fix patterns. Actions: capture (save error→fix), search (find fixes), feedback (report fix result), stats (debug statistics), grow (generate variants), patterns (list all).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['capture', 'search', 'feedback', 'stats', 'grow', 'patterns'], description: 'Debug action to perform' },
        errorMessage: { type: 'string', description: 'Error message (for capture/search)' },
        stackTrace: { type: 'string', description: 'Stack trace (for capture/search)' },
        fixCode: { type: 'string', description: 'Fix code (for capture)' },
        fixDescription: { type: 'string', description: 'Fix description (for capture)' },
        language: { type: 'string', description: 'Programming language' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (for capture)' },
        id: { type: 'string', description: 'Debug pattern ID (for feedback)' },
        resolved: { type: 'boolean', description: 'Whether the fix resolved the error (for feedback)' },
        limit: { type: 'number', description: 'Max results (for search/grow/patterns)' },
        errorClass: { type: 'string', description: 'Error class filter (for patterns)' },
        federated: { type: 'boolean', description: 'Search all tiers (for search, default: true)' },
      },
      required: ['action'],
    },
  },

  // ─── 8. Sync (unified: sync + share) ───
  {
    name: 'oracle_sync',
    description: 'Sync patterns across storage tiers. Scope: personal (private store), community (shared store), or both.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['personal', 'community', 'both'], description: 'Storage scope: personal (default), community (share), or both' },
        direction: { type: 'string', enum: ['push', 'pull', 'both'], description: 'Sync direction (default: both, only for personal scope)' },
        dryRun: { type: 'boolean', description: 'Preview without making changes (default: false)' },
        language: { type: 'string', description: 'Filter by language' },
        patterns: { type: 'array', items: { type: 'string' }, description: 'Pattern names to share (community scope only)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (community scope only)' },
        minCoherency: { type: 'number', description: 'Minimum coherency to share (default: 0.7, community scope only)' },
      },
    },
  },

  // ─── 9. Harvest ───
  {
    name: 'oracle_harvest',
    description: 'Harvest patterns from a local directory or Git repo URL. Walks source files, extracts functions, and bulk-registers them.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local directory path or Git repo URL' },
        language: { type: 'string', description: 'Filter by language' },
        dryRun: { type: 'boolean', description: 'Preview without registering (default: false)' },
        splitMode: { type: 'string', enum: ['file', 'function'], description: 'Split mode (default: file)' },
        branch: { type: 'string', description: 'Git branch to clone' },
        maxFiles: { type: 'number', description: 'Max files to process (default: 200)' },
      },
      required: ['path'],
    },
  },

  // ─── 10. Maintain (unified: maintain + candidates + auto_promote + synthesize + reflect + covenant) ───
  {
    name: 'oracle_maintain',
    description: 'Maintenance and quality operations. Actions: full-cycle (default — heal, promote, optimize, evolve), candidates (list unproven), promote (auto-promote with tests), synthesize (generate tests + promote), reflect (SERF refinement loop), covenant (check code against principles).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['full-cycle', 'candidates', 'promote', 'synthesize', 'reflect', 'covenant'], description: 'Maintenance action (default: full-cycle)' },
        code: { type: 'string', description: 'Code for reflect/covenant actions' },
        language: { type: 'string', description: 'Language filter' },
        description: { type: 'string', description: 'Description for covenant metadata check' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for covenant metadata check' },
        maxLoops: { type: 'number', description: 'Max reflection iterations (for reflect, default: 3)' },
        targetCoherence: { type: 'number', description: 'Stop when coherence exceeds this (for reflect, default: 0.9)' },
        maxCandidates: { type: 'number', description: 'Max candidates to process (for synthesize)' },
        dryRun: { type: 'boolean', description: 'Preview without changes (for synthesize)' },
        minCoherency: { type: 'number', description: 'Min coherency filter (for candidates)' },
        method: { type: 'string', enum: ['variant', 'iterative-refine', 'approach-swap'], description: 'Filter by generation method (for candidates)' },
        maxHealsPerRun: { type: 'number', description: 'Max patterns to heal (for full-cycle, default: 20)' },
      },
    },
  },
];

class MCPServer {
  constructor(oracle) {
    this.oracle = oracle || new RemembranceOracle();
    this._initialized = false;
  }

  async handleRequest(msg) {
    const { id, method, params } = msg;

    // Notifications (no id)
    if (method === 'notifications/initialized') {
      this._initialized = true;
      return null;
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
      return await this._handleToolCall(id, params);
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown method: ${method}` },
    };
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

    try {
      let result;

      switch (name) {
        // ─── 1. Search (unified) ───
        case 'oracle_search': {
          const mode = args.mode || 'hybrid';
          if (mode === 'smart') {
            result = this.oracle.smartSearch(args.query, {
              language: args.language,
              limit: args.limit || 10,
              mode: 'hybrid',
            });
          } else if (args.description && !args.query) {
            // Structured query mode (legacy oracle_query behavior)
            result = this.oracle.query({
              description: args.description || '',
              tags: args.tags || [],
              language: args.language,
              limit: args.limit || 5,
            });
          } else {
            result = this.oracle.search(args.query || '', {
              limit: args.limit || 5,
              language: args.language,
              mode: mode,
            });
          }
          break;
        }

        // ─── 2. Resolve ───
        case 'oracle_resolve':
          result = this.oracle.resolve({
            description: args.description || '',
            tags: args.tags || [],
            language: args.language,
            heal: args.heal !== false,
          });
          break;

        // ─── 3. Submit ───
        case 'oracle_submit':
          result = this.oracle.submit(args.code, {
            language: args.language,
            description: args.description || '',
            tags: args.tags || [],
            testCode: args.testCode,
          });
          break;

        // ─── 4. Register ───
        case 'oracle_register':
          result = this.oracle.registerPattern({
            name: args.name,
            code: args.code,
            language: args.language,
            description: args.description || '',
            tags: args.tags || [],
            testCode: args.testCode,
          });
          break;

        // ─── 5. Feedback ───
        case 'oracle_feedback':
          result = this.oracle.feedback(args.id, args.success);
          break;

        // ─── 6. Stats ───
        case 'oracle_stats': {
          const storeStats = this.oracle.stats();
          const patternStats = this.oracle.patternStats();
          const candidateStats = this.oracle.candidateStats();
          result = { store: storeStats, patterns: patternStats, candidates: candidateStats };
          break;
        }

        // ─── 7. Debug (unified) ───
        case 'oracle_debug': {
          const action = args.action;
          switch (action) {
            case 'capture':
              result = this.oracle.debugCapture({
                errorMessage: args.errorMessage,
                stackTrace: args.stackTrace || '',
                fixCode: args.fixCode,
                fixDescription: args.fixDescription || '',
                language: args.language || 'javascript',
                tags: args.tags || [],
              });
              break;
            case 'search':
              result = this.oracle.debugSearch({
                errorMessage: args.errorMessage,
                stackTrace: args.stackTrace || '',
                language: args.language,
                limit: args.limit || 5,
                federated: args.federated !== false,
              });
              break;
            case 'feedback':
              result = this.oracle.debugFeedback(args.id, args.resolved);
              break;
            case 'stats':
              result = this.oracle.debugStats();
              break;
            case 'grow':
              result = this.oracle.debugGrow({ limit: args.limit });
              break;
            case 'patterns':
              result = this.oracle.debugPatterns({
                language: args.language,
                errorClass: args.errorClass,
              });
              break;
            default:
              throw new Error(`Unknown debug action: ${action}. Use: capture, search, feedback, stats, grow, patterns`);
          }
          break;
        }

        // ─── 8. Sync (unified) ───
        case 'oracle_sync': {
          const scope = args.scope || 'personal';
          if (scope === 'community' || scope === 'both') {
            const shareResult = this.oracle.share({
              patterns: args.patterns,
              tags: args.tags,
              minCoherency: args.minCoherency || 0.7,
              dryRun: args.dryRun || false,
            });
            if (scope === 'community') {
              result = shareResult;
              break;
            }
            // scope === 'both': also sync personal
            const dir = args.direction || 'both';
            const opts = { dryRun: args.dryRun || false, language: args.language };
            let personalResult;
            if (dir === 'push') personalResult = this.oracle.syncToGlobal(opts);
            else if (dir === 'pull') personalResult = this.oracle.syncFromGlobal(opts);
            else personalResult = this.oracle.sync(opts);
            result = { personal: personalResult, community: shareResult };
            break;
          }
          // scope === 'personal' (default)
          const dir = args.direction || 'both';
          const opts = { dryRun: args.dryRun || false, language: args.language };
          if (dir === 'push') result = this.oracle.syncToGlobal(opts);
          else if (dir === 'pull') result = this.oracle.syncFromGlobal(opts);
          else result = this.oracle.sync(opts);
          break;
        }

        // ─── 9. Harvest ───
        case 'oracle_harvest': {
          const { harvest } = require('../ci/harvest');
          result = harvest(this.oracle, args.path, {
            language: args.language,
            dryRun: args.dryRun || false,
            splitMode: args.splitMode || 'file',
            branch: args.branch,
            maxFiles: args.maxFiles || 200,
          });
          break;
        }

        // ─── 10. Maintain (unified) ───
        case 'oracle_maintain': {
          const action = args.action || 'full-cycle';
          switch (action) {
            case 'full-cycle':
              result = this.oracle.fullOptimizationCycle({
                maxHealsPerRun: args.maxHealsPerRun || 20,
              });
              break;
            case 'candidates': {
              const filters = {};
              if (args.language) filters.language = args.language;
              if (args.minCoherency) filters.minCoherency = args.minCoherency;
              if (args.method) filters.generationMethod = args.method;
              const candidates = this.oracle.candidates(filters);
              const stats = this.oracle.candidateStats();
              result = { stats, candidates: candidates.slice(0, 50) };
              break;
            }
            case 'promote':
              result = this.oracle.autoPromote();
              break;
            case 'synthesize':
              result = this.oracle.synthesizeTests({
                maxCandidates: args.maxCandidates,
                dryRun: args.dryRun || false,
                autoPromote: true,
              });
              break;
            case 'reflect': {
              const { reflectionLoop } = require('../core/reflection');
              result = reflectionLoop(args.code || '', {
                language: args.language,
                maxLoops: args.maxLoops || 3,
                targetCoherence: args.targetCoherence || 0.9,
              });
              result.history = result.history.map(h => ({
                loop: h.loop,
                coherence: h.coherence,
                strategy: h.strategy,
                reflectionScore: h.reflectionScore,
              }));
              break;
            }
            case 'covenant': {
              const { covenantCheck } = require('../core/covenant');
              result = covenantCheck(args.code || '', {
                description: args.description || '',
                tags: args.tags || [],
              });
              break;
            }
            default:
              throw new Error(`Unknown maintain action: ${action}. Use: full-cycle, candidates, promote, synthesize, reflect, covenant`);
          }
          break;
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown tool: ${name}` },
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

module.exports = { MCPServer, startMCPServer, TOOLS };
