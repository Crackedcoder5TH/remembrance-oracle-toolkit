const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MCPServer, TOOLS } = require('../src/mcp/server');
const { RemembranceOracle } = require('../src/api/oracle');

describe('MCPServer', () => {
  let server;
  let tmpDir;
  let oracle;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });
  });

  after(() => {
    if (server) server.stop();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  it('initializes', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({ id: 1, method: 'initialize' });
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 1);
    assert.ok(res.result.protocolVersion);
    assert.ok(res.result.serverInfo.name);
  });

  it('responds to ping', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({ id: 2, method: 'ping' });
    assert.equal(res.id, 2);
    assert.ok(res.result);
  });

  it('lists tools', async () => {
    server = new MCPServer(oracle);
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

  it('handles ecosystem_orient (full)', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 200,
      method: 'tools/call',
      params: { name: 'ecosystem_orient', arguments: {} },
    });
    assert.ok(res.result.content, 'orient result should have content');
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(data.canonicalHash, 'canonicalHash present');
    assert.equal(typeof data.document, 'string');
    assert.ok(data.document.includes('Remembrance Ecosystem'), 'document includes title');
    assert.ok(Array.isArray(data.workflowSteps));
    assert.equal(data.workflowSteps.length, 7);
  });

  it('handles ecosystem_orient (checklist format)', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 201,
      method: 'tools/call',
      params: { name: 'ecosystem_orient', arguments: { format: 'checklist' } },
    });
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(data.section, 'checklist section returned');
    assert.ok(data.section.includes('audit'));
    assert.ok(data.section.includes('covenant'));
  });

  it('handles ecosystem_orient (topology format)', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 202,
      method: 'tools/call',
      params: { name: 'ecosystem_orient', arguments: { format: 'topology' } },
    });
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(data.section.includes('12 repos'));
    assert.ok(data.section.includes('remembrance-oracle-toolkit'));
  });

  it('handles oracle_stats', async () => {
    server = new MCPServer(oracle);
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
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 5,
      method: 'tools/call',
      params: { name: 'oracle_search', arguments: { query: 'sort' } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(data));
  });

  it('handles oracle_risk with inline code', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 100,
      method: 'tools/call',
      params: { name: 'oracle_risk', arguments: { code: 'function add(a, b) { return a + b; }' } },
    });
    assert.ok(res.result.content, 'risk result should have content');
    const data = JSON.parse(res.result.content[0].text);
    assert.equal(typeof data.probability, 'number');
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(data.riskLevel));
    assert.ok(data.components);
    assert.ok(data.signals);
  });

  it('handles oracle_risk with file path', async () => {
    server = new MCPServer(oracle);
    // Use a real file in the toolkit — seeds/code/async-mutex.js is LOW.
    const res = await server.handleRequest({
      id: 101,
      method: 'tools/call',
      params: { name: 'oracle_risk', arguments: { file: 'seeds/code/async-mutex.js' } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.equal(typeof data.probability, 'number');
    assert.equal(data.meta.filePath, 'seeds/code/async-mutex.js');
  });

  it('handles oracle_risk with dir batch scan', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 102,
      method: 'tools/call',
      params: { name: 'oracle_risk', arguments: { dir: 'src/quality', topN: 3 } },
    });
    assert.ok(res.result.content);
    const data = JSON.parse(res.result.content[0].text);
    assert.ok(Array.isArray(data.files));
    assert.ok(data.stats);
    assert.ok(data.stats.total >= 1);
    assert.equal(typeof data.stats.meanProbability, 'number');
  });

  it('oracle_risk rejects empty args', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 103,
      method: 'tools/call',
      params: { name: 'oracle_risk', arguments: {} },
    });
    // Error should come back as an error, not crash.
    assert.ok(res.error || (res.result && res.result.isError),
      'expected error response for empty args');
  });

  it('handles oracle_search with smart mode', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 50,
      method: 'tools/call',
      params: { name: 'oracle_search', arguments: { query: 'sort array', mode: 'smart' } },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_submit', async () => {
    server = new MCPServer(oracle);
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
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 8,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    assert.ok(res.error);
    assert.equal(res.error.code, -32602);
  });

  it('handles unknown method', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({ id: 9, method: 'unknown/method' });
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  });

  it('handles notifications silently', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({ method: 'notifications/initialized' });
    assert.equal(res, null);
  });

  it('handles oracle_resolve', async () => {
    server = new MCPServer(oracle);
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
    server = new MCPServer(oracle);
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
    server = new MCPServer(oracle);
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
    server = new MCPServer(oracle);
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
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 30,
      method: 'tools/call',
      params: { name: 'oracle_debug', arguments: { action: 'stats' } },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_debug with patterns action', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 31,
      method: 'tools/call',
      params: { name: 'oracle_debug', arguments: { action: 'patterns' } },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_sync (personal default)', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({
      id: 40,
      method: 'tools/call',
      params: { name: 'oracle_sync', arguments: {} },
    });
    assert.ok(res.result.content);
  });

  it('handles oracle_register', async () => {
    server = new MCPServer(oracle);
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

  it('exposes the full tool catalog including the Tier-1..4 audit/lint/smell/analyze/heal tools', async () => {
    server = new MCPServer(oracle);
    const res = await server.handleRequest({ id: 15, method: 'tools/list' });
    const names = res.result.tools.map(t => t.name);

    // All consolidated tools (original 13 + forge + audit/lint/smell/analyze/heal)
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
    assert.ok(names.includes('oracle_healing'), 'missing oracle_healing');
    assert.ok(names.includes('oracle_swarm'), 'missing oracle_swarm');
    assert.ok(names.includes('oracle_fractal'), 'missing oracle_fractal');
    assert.ok(names.includes('oracle_pending_feedback'), 'missing oracle_pending_feedback');
    assert.ok(names.includes('oracle_forge'), 'missing oracle_forge');

    // New Tier-1..4 tools
    assert.ok(names.includes('oracle_audit'),    'missing oracle_audit');
    assert.ok(names.includes('oracle_lint'),     'missing oracle_lint');
    assert.ok(names.includes('oracle_smell'),    'missing oracle_smell');
    assert.ok(names.includes('oracle_analyze'),  'missing oracle_analyze');
    assert.ok(names.includes('oracle_heal'),     'missing oracle_heal');

    assert.ok(res.result.tools.length >= 20, `Expected at least 20 tools, got ${res.result.tools.length}`);
  });
});
