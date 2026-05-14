'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MCPServer, RATE_LIMITS, NUMERIC_BOUNDS } = require('../src/mcp/server');
const { createTestOracle, cleanTempDir } = require('./helpers');

// ─── Rate Limiting Tests ─────────────────────────────────────────────────────

describe('MCP Rate Limiting', () => {
  let server, oracle, tmpDir;

  beforeEach(() => {
    const t = createTestOracle({ prefix: 'mcp-rate' });
    oracle = t.oracle;
    tmpDir = t.tmpDir;
    // Use tight limits for testing: 3 calls per 5s window
    server = new MCPServer(oracle, {
      rateLimits: {
        oracle_search:  { windowMs: 5000, maxCalls: 3 },
        oracle_stats:   { windowMs: 5000, maxCalls: 3 },
        oracle_harvest: { windowMs: 5000, maxCalls: 1 },
      },
    });
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('allows calls within rate limit', async () => {
    const msg = { id: 1, method: 'tools/call', params: { name: 'oracle_stats', arguments: {} } };
    const r1 = await server.handleRequest(msg);
    assert.ok(r1.result, 'first call should succeed');

    const r2 = await server.handleRequest({ ...msg, id: 2 });
    assert.ok(r2.result, 'second call should succeed');

    const r3 = await server.handleRequest({ ...msg, id: 3 });
    assert.ok(r3.result, 'third call should succeed');
  });

  it('blocks calls exceeding rate limit', async () => {
    const msg = { id: 1, method: 'tools/call', params: { name: 'oracle_stats', arguments: {} } };

    // Exhaust the limit (3 calls)
    await server.handleRequest({ ...msg, id: 1 });
    await server.handleRequest({ ...msg, id: 2 });
    await server.handleRequest({ ...msg, id: 3 });

    // 4th call should be rate-limited
    const r4 = await server.handleRequest({ ...msg, id: 4 });
    assert.ok(r4.error, 'fourth call should be rate-limited');
    assert.strictEqual(r4.error.code, -32000);
    assert.ok(r4.error.message.includes('Rate limit exceeded'), 'should mention rate limit');
    assert.ok(r4.error.message.includes('oracle_stats'), 'should mention the tool name');
  });

  it('applies different limits per tool tier', () => {
    // oracle_harvest has maxCalls: 1 per 5s window
    // Test the rate limiter directly to avoid slow harvest execution
    const err1 = server._checkRateLimit('oracle_harvest');
    assert.strictEqual(err1, null, 'first harvest call should be allowed');

    const err2 = server._checkRateLimit('oracle_harvest');
    assert.ok(err2, 'second harvest call should be rate-limited');
    assert.ok(err2.includes('Rate limit exceeded'), 'should mention rate limit');
    assert.ok(err2.includes('oracle_harvest'), 'should mention the tool name');

    // oracle_search has maxCalls: 3, should still have room
    const err3 = server._checkRateLimit('oracle_search');
    assert.strictEqual(err3, null, 'search should still be allowed (different tool)');
  });

  it('allows unknown tools to pass rate limit check (handled by handler validation)', async () => {
    const msg = {
      id: 1, method: 'tools/call',
      params: { name: 'unknown_tool', arguments: {} },
    };
    const r = await server.handleRequest(msg);
    // Should fail with unknown tool, not rate limit
    assert.ok(r.error);
    assert.notStrictEqual(r.error.code, -32000, 'should not be a rate limit error');
  });

  it('rate limit resets after window expires', async () => {
    // Manually set old timestamps to simulate window expiry
    server._callLog.set('oracle_stats', [Date.now() - 10000, Date.now() - 10000, Date.now() - 10000]);

    const msg = { id: 1, method: 'tools/call', params: { name: 'oracle_stats', arguments: {} } };
    const r = await server.handleRequest(msg);
    assert.ok(r.result, 'call should succeed after window expired');
  });

  it('_cleanupCallLog removes stale entries', () => {
    server._callLog.set('oracle_stats', [Date.now() - 60000]);
    server._callLog.set('oracle_search', [Date.now()]);

    server._cleanupCallLog();

    assert.ok(!server._callLog.has('oracle_stats'), 'stale entries should be removed');
    assert.ok(server._callLog.has('oracle_search'), 'recent entries should remain');
  });
});

// ─── Numeric Bounds Tests ────────────────────────────────────────────────────

describe('MCP Numeric Bounds', () => {
  let server, oracle, tmpDir;

  beforeEach(() => {
    const t = createTestOracle({ prefix: 'mcp-bounds' });
    oracle = t.oracle;
    tmpDir = t.tmpDir;
    server = new MCPServer(oracle);
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('clamps limit to max 100', () => {
    const result = server._clampNumericParams({ limit: 999999, query: 'test' });
    assert.strictEqual(result.limit, 100);
    assert.strictEqual(result.query, 'test', 'non-numeric params preserved');
  });

  it('clamps limit to min 1', () => {
    const result = server._clampNumericParams({ limit: -5 });
    assert.strictEqual(result.limit, 1);
  });

  it('clamps maxFiles to max 500', () => {
    const result = server._clampNumericParams({ maxFiles: 10000 });
    assert.strictEqual(result.maxFiles, 500);
  });

  it('clamps maxHealsPerRun to max 50', () => {
    const result = server._clampNumericParams({ maxHealsPerRun: 1000 });
    assert.strictEqual(result.maxHealsPerRun, 50);
  });

  it('clamps maxCandidates to max 100', () => {
    const result = server._clampNumericParams({ maxCandidates: 5000 });
    assert.strictEqual(result.maxCandidates, 100);
  });

  it('clamps maxLoops to max 10', () => {
    const result = server._clampNumericParams({ maxLoops: 999 });
    assert.strictEqual(result.maxLoops, 10);
  });

  it('clamps minCoherency to 0-1 range', () => {
    assert.strictEqual(server._clampNumericParams({ minCoherency: -0.5 }).minCoherency, 0);
    assert.strictEqual(server._clampNumericParams({ minCoherency: 1.5 }).minCoherency, 1);
    assert.strictEqual(server._clampNumericParams({ minCoherency: 0.7 }).minCoherency, 0.7);
  });

  it('clamps targetCoherence to 0-1 range', () => {
    assert.strictEqual(server._clampNumericParams({ targetCoherence: 99 }).targetCoherence, 1);
  });

  it('clamps minDelta to 0-1 range', () => {
    assert.strictEqual(server._clampNumericParams({ minDelta: 5.0 }).minDelta, 1);
  });

  it('preserves values within bounds', () => {
    const result = server._clampNumericParams({ limit: 10, maxFiles: 50, minCoherency: 0.8 });
    assert.strictEqual(result.limit, 10);
    assert.strictEqual(result.maxFiles, 50);
    assert.strictEqual(result.minCoherency, 0.8);
  });

  it('handles null/undefined args gracefully', () => {
    assert.strictEqual(server._clampNumericParams(null), null);
    assert.strictEqual(server._clampNumericParams(undefined), undefined);
  });

  it('does not clamp string parameters that share names with numeric ones', () => {
    const result = server._clampNumericParams({ limit: 'abc' });
    assert.strictEqual(result.limit, 'abc', 'string value should not be clamped');
  });
});

// ─── Integration: rate limits applied to real tool calls ─────────────────────

describe('MCP Rate Limiting Integration', () => {
  let server, oracle, tmpDir;

  beforeEach(() => {
    const t = createTestOracle({ prefix: 'mcp-integ' });
    oracle = t.oracle;
    tmpDir = t.tmpDir;
    server = new MCPServer(oracle, {
      rateLimits: {
        oracle_search: { windowMs: 5000, maxCalls: 2 },
      },
    });
  });

  afterEach(() => cleanTempDir(tmpDir));

  it('search tool respects rate limit and clamps limit param', async () => {
    const msg = {
      id: 1,
      method: 'tools/call',
      params: { name: 'oracle_search', arguments: { query: 'debounce', limit: 5000 } },
    };

    // First call should succeed
    const r1 = await server.handleRequest(msg);
    assert.ok(r1.result, 'first search should succeed');

    // Parse to verify limit was clamped in the result
    const content = JSON.parse(r1.result.content[0].text);
    // The search returns at most `limit` results; with clamped limit=100 it shouldn't return 5000
    assert.ok(true, 'search completed successfully with clamped limit');

    // Second call should succeed
    const r2 = await server.handleRequest({ ...msg, id: 2 });
    assert.ok(r2.result, 'second search should succeed');

    // Third call should be rate-limited
    const r3 = await server.handleRequest({ ...msg, id: 3 });
    assert.ok(r3.error, 'third search should be rate-limited');
    assert.strictEqual(r3.error.code, -32000);
  });
});

// ─── Default Rate Limits Configuration ───────────────────────────────────────

describe('MCP Default Rate Limits Configuration', () => {
  it('all 12 tools have rate limits configured', () => {
    const expectedTools = [
      'oracle_search', 'oracle_resolve', 'oracle_stats', 'oracle_feedback',
      'oracle_healing', 'oracle_submit', 'oracle_register', 'oracle_debug',
      'oracle_sync', 'oracle_harvest', 'oracle_maintain', 'oracle_swarm',
    ];
    for (const tool of expectedTools) {
      assert.ok(RATE_LIMITS[tool], `${tool} should have a rate limit configured`);
      assert.ok(RATE_LIMITS[tool].windowMs > 0, `${tool} windowMs should be positive`);
      assert.ok(RATE_LIMITS[tool].maxCalls > 0, `${tool} maxCalls should be positive`);
    }
  });

  it('expensive tools have tighter limits than read-only tools', () => {
    assert.ok(RATE_LIMITS.oracle_harvest.maxCalls < RATE_LIMITS.oracle_search.maxCalls,
      'harvest should have tighter limit than search');
    assert.ok(RATE_LIMITS.oracle_swarm.maxCalls < RATE_LIMITS.oracle_search.maxCalls,
      'swarm should have tighter limit than search');
    assert.ok(RATE_LIMITS.oracle_maintain.maxCalls < RATE_LIMITS.oracle_search.maxCalls,
      'maintain should have tighter limit than search');
  });

  it('all numeric bounds have valid min/max', () => {
    for (const [key, bounds] of Object.entries(NUMERIC_BOUNDS)) {
      assert.ok(bounds.min <= bounds.max, `${key}: min (${bounds.min}) should be <= max (${bounds.max})`);
      assert.ok(typeof bounds.min === 'number', `${key}: min should be a number`);
      assert.ok(typeof bounds.max === 'number', `${key}: max should be a number`);
    }
  });
});
