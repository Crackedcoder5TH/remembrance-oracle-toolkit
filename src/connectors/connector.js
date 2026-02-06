/**
 * Universal AI Connector
 *
 * Connects ANY AI model to the Remembrance Oracle through a unified interface.
 * Each provider adapter translates the AI's native tool-calling format into
 * Oracle commands, and translates Oracle results back into the AI's format.
 *
 * Supported connection methods:
 * 1. Direct (in-process) — for local/embedded AI
 * 2. GitHub Issues — AI posts a command as an issue, gets response as comment
 * 3. GitHub Dispatch — trigger workflow_dispatch events programmatically
 * 4. HTTP webhook — for AI agents that can call URLs
 * 5. MCP (Model Context Protocol) — for Claude and MCP-compatible AIs
 * 6. OpenAI function-calling format — for GPT models
 * 7. stdin/stdout — for piping between processes
 */

const { RemembranceOracle } = require('../api/oracle');

class AIConnector {
  constructor(options = {}) {
    this.oracle = options.oracle || new RemembranceOracle(options);
    this.provider = options.provider || 'generic';
    this.modelId = options.modelId || 'unknown';
  }

  /**
   * Process a command from any AI model.
   * Takes a universal command object and returns a universal result.
   */
  execute(command) {
    const { action, params = {} } = command;

    switch (action) {
      case 'submit':
        return this._submit(params);
      case 'query':
        return this._query(params);
      case 'feedback':
        return this._feedback(params);
      case 'inspect':
        return this._inspect(params);
      case 'stats':
        return this._stats();
      case 'prune':
        return this._prune(params);
      default:
        return { error: `Unknown action: ${action}`, availableActions: ['submit', 'query', 'feedback', 'inspect', 'stats', 'prune'] };
    }
  }

  _submit(params) {
    const result = this.oracle.submit(params.code, {
      language: params.language,
      description: params.description,
      tags: params.tags || [],
      testCode: params.testCode || params.test_code,
      author: `${this.provider}/${this.modelId}`,
    });
    return {
      action: 'submit',
      accepted: result.accepted,
      id: result.entry?.id,
      coherencyScore: result.entry?.coherencyScore?.total ?? result.validation?.coherencyScore?.total,
      reason: result.reason || null,
    };
  }

  _query(params) {
    const results = this.oracle.query({
      description: params.description || params.query || '',
      tags: params.tags || [],
      language: params.language,
      limit: params.limit || 5,
      minCoherency: params.minCoherency ?? params.min_coherency ?? 0.5,
    });
    return {
      action: 'query',
      count: results.length,
      results: results.map(r => ({
        id: r.id,
        code: r.code,
        language: r.language,
        description: r.description,
        tags: r.tags,
        coherencyScore: r.coherencyScore,
        relevanceScore: r.relevanceScore,
        reliability: r.reliability,
      })),
    };
  }

  _feedback(params) {
    return {
      action: 'feedback',
      ...this.oracle.feedback(params.id, params.succeeded ?? params.success),
    };
  }

  _inspect(params) {
    const entry = this.oracle.inspect(params.id);
    return { action: 'inspect', found: !!entry, entry };
  }

  _stats() {
    return { action: 'stats', ...this.oracle.stats() };
  }

  _prune(params) {
    return { action: 'prune', ...this.oracle.prune(params.minCoherency ?? 0.4) };
  }
}

module.exports = { AIConnector };
