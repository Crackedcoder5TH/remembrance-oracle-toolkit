const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MCPServer, TOOLS } = require('../src/mcp/server');

describe('MCPServer', () => {
  let server;

  it('initializes', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ id: 1, method: 'initialize' });
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 1);
    assert.ok(res.result.protocolVersion);
    assert.ok(res.result.serverInfo.name);
  });

  it('responds to ping', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ id: 2, method: 'ping' });
    assert.equal(res.id, 2);
    assert.ok(res.result);
  });

  it('lists tools', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ id: 3, method: 'tools/list' });
    assert.ok(res.result.tools.length > 0);
    const names = res.result.tools.map(t => t.name);
    assert.ok(names.includes('oracle_search'));
    assert.ok(names.includes('oracle_stats'));
  });

  it('tools have valid schemas', () => {
    for (const tool of TOOLS) {
      assert.ok(tool.name, 'tool must have name');
      assert.ok(tool.description, `${tool.name} must have description`);
      assert.ok(tool.inputSchema, `${tool.name} must have inputSchema`);
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  it('handles oracle_stats', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 4,
      method: 'tools/call',
      params: { name: 'oracle_stats', arguments: {} },
    });
    assert.ok(res.result.content);
    assert.equal(res.result.content[0].type, 'text');
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('store' in data);
    assert.ok('patterns' in data);
  });

  it('handles oracle_search', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 5,
      method: 'tools/call',
      params: { name: 'oracle_search', arguments: { query: 'sort' } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(data));
  });

  it('handles oracle_submit', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 6,
      method: 'tools/call',
      params: {
        name: 'oracle_submit',
        arguments: {
          code: 'function add(a, b) { return a + b; }',
          language: 'javascript',
          description: 'Add two numbers',
          tags: ['math'],
        },
      },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_nearest', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 7,
      method: 'tools/call',
      params: { name: 'oracle_nearest', arguments: { query: 'cache', limit: 3 } },
    });
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(data));
    assert.ok(data.length <= 3);
  });

  it('handles unknown tool', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 8,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    assert.ok(res.result.isError);
  });

  it('handles unknown method', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ id: 9, method: 'unknown/method' });
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  });

  it('handles notifications silently', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ method: 'notifications/initialized' });
    assert.equal(res, null);
  });

  it('handles oracle_resolve', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 10,
      method: 'tools/call',
      params: {
        name: 'oracle_resolve',
        arguments: { description: 'sort an array', tags: ['sort'] },
      },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(data.decision);
  });

  it('handles oracle_candidates', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 11,
      method: 'tools/call',
      params: { name: 'oracle_candidates', arguments: {} },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('stats' in data);
    assert.ok('candidates' in data);
    assert.ok(Array.isArray(data.candidates));
  });

  it('handles oracle_generate', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 12,
      method: 'tools/call',
      params: {
        name: 'oracle_generate',
        arguments: { languages: ['typescript'], methods: ['variant'], maxPatterns: 2 },
      },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('generated' in data);
    assert.ok('stored' in data);
  });

  it('handles oracle_auto_promote', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 13,
      method: 'tools/call',
      params: { name: 'oracle_auto_promote', arguments: {} },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('attempted' in data);
    assert.ok('promoted' in data);
  });

  it('handles oracle_promote with missing candidate', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 14,
      method: 'tools/call',
      params: { name: 'oracle_promote', arguments: { candidateId: 'nonexistent' } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.equal(data.promoted, false);
  });

  it('lists all tools including candidate and community tools', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ id: 15, method: 'tools/list' });
    const names = res.result.tools.map(t => t.name);
    assert.ok(names.includes('oracle_candidates'));
    assert.ok(names.includes('oracle_generate'));
    assert.ok(names.includes('oracle_promote'));
    assert.ok(names.includes('oracle_auto_promote'));
    assert.ok(names.includes('oracle_share'));
    assert.ok(names.includes('oracle_community'));
    assert.ok(names.includes('oracle_debug_capture'));
    assert.ok(names.includes('oracle_debug_search'));
    assert.ok(names.includes('oracle_debug_feedback'));
    assert.ok(names.includes('oracle_debug_grow'));
    assert.ok(names.includes('oracle_debug_stats'));
    assert.ok(names.includes('oracle_debug_share'));
    assert.ok(names.includes('oracle_smart_search'));
    assert.ok(names.includes('oracle_llm_status'));
    assert.ok(names.includes('oracle_llm_transpile'));
    assert.ok(names.includes('oracle_llm_analyze'));
    assert.ok(names.includes('oracle_compose'));
    assert.ok(names.includes('oracle_compose_templates'));
    assert.ok(names.includes('oracle_smart_promote'));
    assert.ok(names.includes('oracle_security_scan'));
    assert.ok(names.includes('oracle_security_audit'));
    assert.ok(names.includes('oracle_rollback'));
    assert.ok(names.includes('oracle_verify'));
    assert.ok(names.includes('oracle_healing_stats'));
    assert.ok(names.includes('oracle_reliability'));
    assert.ok(names.includes('oracle_report_bug'));
    assert.ok(names.includes('oracle_transpile'));
    assert.ok(names.includes('oracle_vote'));
    assert.ok(names.includes('oracle_top_voted'));
    assert.ok(names.includes('oracle_cross_search'));
    assert.ok(names.includes('oracle_repos'));
    assert.ok(names.includes('oracle_remote_search'));
    assert.ok(names.includes('oracle_remotes'));
    assert.ok(names.includes('oracle_full_search'));
    assert.ok(names.includes('oracle_reputation'));
    assert.ok(names.includes('oracle_verify_transpile'));
    assert.ok(names.includes('oracle_context'));
    assert.ok(names.includes('oracle_mcp_install'));
    assert.ok(names.includes('oracle_github_identity'));
    assert.equal(res.result.tools.length, 59);
  });
});
