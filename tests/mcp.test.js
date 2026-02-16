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
    assert.ok('candidates' in data);
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

  it('handles oracle_search with smart mode', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 50,
      method: 'tools/call',
      params: { name: 'oracle_search', arguments: { query: 'sort array', mode: 'smart' } },
    });
    assert.ok(res.result.content);
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

  it('handles oracle_maintain with candidates action', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 11,
      method: 'tools/call',
      params: { name: 'oracle_maintain', arguments: { action: 'candidates' } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('stats' in data);
    assert.ok('candidates' in data);
    assert.ok(Array.isArray(data.candidates));
  });

  it('handles oracle_maintain with promote action', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 13,
      method: 'tools/call',
      params: { name: 'oracle_maintain', arguments: { action: 'promote' } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok('attempted' in data);
    assert.ok('promoted' in data);
  });

  it('handles oracle_maintain with full-cycle (default)', async () => {
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

  it('handles oracle_debug with stats action', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 30,
      method: 'tools/call',
      params: { name: 'oracle_debug', arguments: { action: 'stats' } },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_debug with patterns action', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 31,
      method: 'tools/call',
      params: { name: 'oracle_debug', arguments: { action: 'patterns' } },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_sync (personal default)', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 40,
      method: 'tools/call',
      params: { name: 'oracle_sync', arguments: {} },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_register', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({
      id: 41,
      method: 'tools/call',
      params: {
        name: 'oracle_register',
        arguments: {
          name: 'test-pattern-mcp',
          code: 'function greet(name) { return `Hello, ${name}!`; }',
          language: 'javascript',
        },
      },
    });
    assert.ok(res.result.content);
  });

  it('has exactly 10 consolidated tools', async () => {
    server = new MCPServer();
    const res = await server.handleRequest({ id: 15, method: 'tools/list' });
    const names = res.result.tools.map(t => t.name);

    // All 10 consolidated tools
    assert.ok(names.includes('oracle_search'), 'missing oracle_search');
    assert.ok(names.includes('oracle_resolve'), 'missing oracle_resolve');
    assert.ok(names.includes('oracle_submit'), 'missing oracle_submit');
    assert.ok(names.includes('oracle_register'), 'missing oracle_register');
    assert.ok(names.includes('oracle_feedback'), 'missing oracle_feedback');
    assert.ok(names.includes('oracle_stats'), 'missing oracle_stats');
    assert.ok(names.includes('oracle_debug'), 'missing oracle_debug');
    assert.ok(names.includes('oracle_sync'), 'missing oracle_sync');
    assert.ok(names.includes('oracle_harvest'), 'missing oracle_harvest');
    assert.ok(names.includes('oracle_maintain'), 'missing oracle_maintain');

    assert.equal(res.result.tools.length, 10, `Expected exactly 10 tools, got ${res.result.tools.length}`);
  });
});
