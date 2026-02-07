const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MCPServer, TOOLS } = require('../src/mcp/server');

describe('MCPServer', () => {
  let server;

  it('initializes', () => {
    server = new MCPServer();
    const res = server.handleRequest({ id: 1, method: 'initialize' });
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 1);
    assert.ok(res.result.protocolVersion);
    assert.ok(res.result.serverInfo.name);
  });

  it('responds to ping', () => {
    server = new MCPServer();
    const res = server.handleRequest({ id: 2, method: 'ping' });
    assert.equal(res.id, 2);
    assert.ok(res.result);
  });

  it('lists tools', () => {
    server = new MCPServer();
    const res = server.handleRequest({ id: 3, method: 'tools/list' });
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

  it('handles oracle_stats', () => {
    server = new MCPServer();
    const res = server.handleRequest({
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

  it('handles oracle_search', () => {
    server = new MCPServer();
    const res = server.handleRequest({
      id: 5,
      method: 'tools/call',
      params: { name: 'oracle_search', arguments: { query: 'sort' } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(data));
  });

  it('handles oracle_submit', () => {
    server = new MCPServer();
    const res = server.handleRequest({
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

  it('handles oracle_nearest', () => {
    server = new MCPServer();
    const res = server.handleRequest({
      id: 7,
      method: 'tools/call',
      params: { name: 'oracle_nearest', arguments: { query: 'cache', limit: 3 } },
    });
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(data));
    assert.ok(data.length <= 3);
  });

  it('handles unknown tool', () => {
    server = new MCPServer();
    const res = server.handleRequest({
      id: 8,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    assert.ok(res.result.isError);
  });

  it('handles unknown method', () => {
    server = new MCPServer();
    const res = server.handleRequest({ id: 9, method: 'unknown/method' });
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  });

  it('handles notifications silently', () => {
    server = new MCPServer();
    const res = server.handleRequest({ method: 'notifications/initialized' });
    assert.equal(res, null);
  });

  it('handles oracle_resolve', () => {
    server = new MCPServer();
    const res = server.handleRequest({
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
});
