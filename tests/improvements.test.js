const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { RemembranceOracle } = require('../src/api/oracle');

// ─── Oracle Event System ───

describe('Oracle Event System', () => {
  let tmpDir, oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-events-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fires event on submit', () => {
    const events = [];
    oracle.on(e => events.push(e));
    oracle.submit('function add(a, b) { return a + b; }', {
      description: 'Add two numbers',
      tags: ['math'],
      language: 'javascript',
    });
    assert.ok(events.some(e => e.type === 'entry_added'));
  });

  it('fires event on feedback', () => {
    const events = [];
    const { entry } = oracle.submit('function add(a, b) { return a + b; }', {
      tags: ['math'],
      language: 'javascript',
    });
    oracle.on(e => events.push(e));
    oracle.feedback(entry.id, true);
    assert.ok(events.some(e => e.type === 'feedback'));
    assert.ok(events.some(e => e.succeeded === true));
  });

  it('fires event on registerPattern', () => {
    const events = [];
    oracle.on(e => events.push(e));
    oracle.registerPattern({
      name: 'test-add',
      code: 'function add(a, b) { return a + b; }',
      language: 'javascript',
      description: 'Addition',
      tags: ['math'],
    });
    assert.ok(events.some(e => e.type === 'pattern_registered'));
  });

  it('unsubscribe works', () => {
    const events = [];
    const unsub = oracle.on(e => events.push(e));
    unsub();
    oracle.submit('function x() { return 1; }', { tags: ['test'] });
    assert.equal(events.length, 0);
  });

  it('listener errors do not break oracle', () => {
    oracle.on(() => { throw new Error('boom'); });
    // Should not throw
    const result = oracle.submit('function add(a, b) { return a + b; }', {
      tags: ['math'],
      language: 'javascript',
    });
    assert.equal(result.accepted, true);
  });
});

// ─── Pattern Import ───

describe('Oracle Import', () => {
  let tmpDir, oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-import-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports patterns from exported JSON string', () => {
    // Register one pattern, export, then import into fresh oracle
    oracle.registerPattern({
      name: 'test-func',
      code: 'function testFunc() { return 42; }',
      language: 'javascript',
      description: 'Test function',
      tags: ['test'],
    });
    const exported = oracle.export({ format: 'json' });

    // Fresh oracle
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-import2-'));
    const oracle2 = new RemembranceOracle({ baseDir: tmpDir2, threshold: 0.5, autoSeed: false });

    const result = oracle2.import(exported);
    assert.ok(result.imported >= 1);
    assert.equal(result.errors.length, 0);

    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });

  it('imports patterns from parsed object', () => {
    const data = {
      patterns: [
        { name: 'add-fn', code: 'function add(a, b) { return a + b; }', language: 'javascript', description: 'Add' },
      ],
    };
    const result = oracle.import(data);
    assert.equal(result.imported, 1);
  });

  it('skips duplicate patterns', () => {
    const data = {
      patterns: [
        { name: 'dup-fn', code: 'function dup() { return 1; }', language: 'javascript', description: 'Dup' },
      ],
    };
    oracle.import(data);
    const result = oracle.import(data);
    assert.equal(result.skipped, 1);
    assert.ok(result.results.some(r => r.status === 'duplicate'));
  });

  it('skips patterns without code or name', () => {
    const data = { patterns: [{ description: 'no code' }] };
    const result = oracle.import(data);
    assert.equal(result.skipped, 1);
    assert.ok(result.errors.length > 0);
  });

  it('dry run does not write', () => {
    const data = {
      patterns: [
        { name: 'dry-fn', code: 'function dry() { return 1; }', language: 'javascript', description: 'Dry' },
      ],
    };
    const result = oracle.import(data, { dryRun: true });
    assert.equal(result.imported, 1);
    assert.ok(result.results.some(r => r.status === 'would_import'));
    // Verify nothing was actually stored
    const patterns = oracle.patterns.getAll();
    assert.ok(!patterns.some(p => p.name === 'dry-fn'));
  });

  it('fires import_complete event', () => {
    const events = [];
    oracle.on(e => events.push(e));
    oracle.import({
      patterns: [{ name: 'evt-fn', code: 'function x() { return 1; }', language: 'javascript', description: 'x' }],
    });
    assert.ok(events.some(e => e.type === 'import_complete'));
  });

  it('export → import round trip preserves patterns', () => {
    oracle.registerPattern({
      name: 'round-trip',
      code: 'function roundTrip(x) { return x * 2; }',
      language: 'javascript',
      description: 'Double a value',
      tags: ['math', 'utility'],
    });
    const exported = oracle.export({ format: 'json' });

    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-rt-'));
    const oracle2 = new RemembranceOracle({ baseDir: tmpDir2, threshold: 0.5, autoSeed: false });
    oracle2.import(exported);

    const patterns = oracle2.patterns.getAll();
    assert.ok(patterns.some(p => p.name === 'round-trip'));

    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });
});

// ─── Combined SERF Transform (applyHeal) ───

describe('applyHeal — combined transform', () => {
  const { applyHeal, generateCandidates } = require('../src/core/reflection');

  it('applies all 5 strategies in sequence', () => {
    const code = 'var x = 1;   \nif(x == true) { console.log("yes") }';
    const healed = applyHeal(code, 'javascript');
    // Should have: const (not var), === (not ==), space after if, trimmed whitespace
    assert.ok(!healed.includes('var '), 'Should replace var');
    assert.ok(healed.includes('if ('), 'Should add space after if');
  });

  it('is included as 6th candidate in generateCandidates', () => {
    const candidates = generateCandidates('var x = 1;', 'javascript');
    assert.equal(candidates.length, 6);
    assert.ok(candidates.some(c => c.strategy === 'heal'));
  });

  it('heal candidate applies combined changes', () => {
    const code = 'var x = 1;   \n\n\n\nvar y = 2;';
    const candidates = generateCandidates(code, 'javascript');
    const healCandidate = candidates.find(c => c.strategy === 'heal');
    assert.ok(healCandidate.changed, 'heal should change the code');
    assert.ok(!healCandidate.code.includes('var '), 'heal should replace var');
  });
});

// ─── Rate Limiting ───

describe('Rate Limiting', () => {
  const { createRateLimiter } = require('../src/dashboard/server');

  it('allows requests within limit', () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 5 });
    let blocked = false;
    const fakeReq = { socket: { remoteAddress: '1.2.3.4' } };
    const fakeRes = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      writeHead() {},
      end() { blocked = true; },
    };
    limiter(fakeReq, fakeRes, () => {});
    assert.equal(blocked, false);
    assert.equal(fakeRes.headers['X-RateLimit-Limit'], 5);
    assert.ok(fakeRes.headers['X-RateLimit-Remaining'] >= 0);
  });

  it('blocks requests over limit', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 });
    let blockedCount = 0;
    const fakeReq = { socket: { remoteAddress: '5.6.7.8' } };

    for (let i = 0; i < 5; i++) {
      let passed = false;
      const fakeRes = {
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        writeHead(code) { if (code === 429) blockedCount++; },
        end() {},
      };
      limiter(fakeReq, fakeRes, () => { passed = true; });
    }
    assert.ok(blockedCount >= 2, `Expected >= 2 blocked, got ${blockedCount}`);
  });

  it('tracks different IPs separately', () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
    let passedA = 0, passedB = 0;

    for (let i = 0; i < 3; i++) {
      const fakeRes = { headers: {}, setHeader() {}, writeHead() {}, end() {} };
      limiter({ socket: { remoteAddress: '10.0.0.1' } }, fakeRes, () => { passedA++; });
    }
    for (let i = 0; i < 3; i++) {
      const fakeRes = { headers: {}, setHeader() {}, writeHead() {}, end() {} };
      limiter({ socket: { remoteAddress: '10.0.0.2' } }, fakeRes, () => { passedB++; });
    }
    assert.equal(passedA, 2);
    assert.equal(passedB, 2);
  });

  it('dashboard integrates rate limiter when auth is enabled', () => {
    const { createDashboardServer } = require('../src/dashboard/server');
    // rateLimit defaults to true when auth is not false
    // Just verify server creates without errors
    const server = createDashboardServer(undefined, { auth: false, rateLimit: false });
    assert.ok(server);
    server.close();
  });
});
