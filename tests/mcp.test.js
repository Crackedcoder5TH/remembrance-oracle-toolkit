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

  it('handles unknown tool', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 8,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    assert.ok(res.error);
    assert.equal(res.error.code, -32602);
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

  it('handles oracle_maintain', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 20,
      method: 'tools/call',
      params: { name: 'oracle_maintain', arguments: {} },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('improvement' in data || 'durationMs' in data);
  });

  it('has exactly 23 tools', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ id: 15, method: 'tools/list' });
    const names = res.result.tools.map(t => t.name);

    // Core
    assert.ok(names.includes('oracle_search'));
    assert.ok(names.includes('oracle_resolve'));
    assert.ok(names.includes('oracle_submit'));
    assert.ok(names.includes('oracle_query'));
    assert.ok(names.includes('oracle_feedback'));
    assert.ok(names.includes('oracle_stats'));
    assert.ok(names.includes('oracle_register_pattern'));

    // Search
    assert.ok(names.includes('oracle_smart_search'));

    // Quality
    assert.ok(names.includes('oracle_reflect'));
    assert.ok(names.includes('oracle_covenant'));

    // Candidates
    assert.ok(names.includes('oracle_candidates'));
    assert.ok(names.includes('oracle_auto_promote'));
    assert.ok(names.includes('oracle_synthesize_tests'));

    // Debug
    assert.ok(names.includes('oracle_debug_capture'));
    assert.ok(names.includes('oracle_debug_search'));
    assert.ok(names.includes('oracle_debug_feedback'));
    assert.ok(names.includes('oracle_debug_stats'));
    assert.ok(names.includes('oracle_debug_grow'));
    assert.ok(names.includes('oracle_debug_patterns'));

    // Storage
    assert.ok(names.includes('oracle_sync'));
    assert.ok(names.includes('oracle_share'));

    // Harvest
    assert.ok(names.includes('oracle_harvest'));

    // Maintenance
    assert.ok(names.includes('oracle_maintain'));

    assert.equal(res.result.tools.length, 23);
  });
});
