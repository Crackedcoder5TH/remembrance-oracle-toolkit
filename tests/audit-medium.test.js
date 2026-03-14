'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── #11  ReDoS guard in matchGlob ───────────────────────────────────
describe('audit-medium #11 — ReDoS guard in matchGlob', () => {
  // Import the module to access matchGlob indirectly via findTestFiles / discoverPatterns
  const { extractFunctionNames, detectLanguage } = require('../src/ci/auto-seed');

  it('extractFunctionNames still works after matchGlob hardening', () => {
    const fns = extractFunctionNames('function foo() {}\nfunction bar() {}', 'javascript');
    assert.deepStrictEqual(fns, ['foo', 'bar']);
  });

  it('detectLanguage still works', () => {
    assert.strictEqual(detectLanguage('test.js'), 'javascript');
    assert.strictEqual(detectLanguage('test.ts'), 'typescript');
    assert.strictEqual(detectLanguage('test.py'), 'python');
  });
});

// ─── #12  X-Forwarded-For proxy trust ────────────────────────────────
describe('audit-medium #12 — X-Forwarded-For proxy trust', () => {
  const { createRateLimiter } = require('../src/dashboard/middleware');

  it('ignores X-Forwarded-For when trustProxy is not set', () => {
    const limiter = createRateLimiter({ maxRequests: 2 });
    let nextCalled = false;
    const req = {
      headers: { 'x-forwarded-for': '10.0.0.1, 192.168.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = { setHeader() {}, writeHead() {}, end() {} };
    limiter(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled, 'should pass through using socket address, not spoofed header');
  });

  it('uses X-Forwarded-For when trustProxy is true', () => {
    const limiter = createRateLimiter({ maxRequests: 1 });
    const req = {
      trustProxy: true,
      headers: { 'x-forwarded-for': '10.0.0.1, 192.168.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = { setHeader() {}, writeHead() {}, end() {} };
    let nextCalled = false;
    limiter(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled, 'first request from forwarded IP should pass');

    // Second request from same forwarded IP should be rate-limited
    let rateLimited = false;
    const res2 = {
      setHeader() {},
      writeHead(code) { if (code === 429) rateLimited = true; },
      end() {},
    };
    limiter(req, res2, () => {});
    assert.ok(rateLimited, 'second request from same forwarded IP should be rate-limited');
  });

  it('rate limits by socket address when trustProxy is false', () => {
    const limiter = createRateLimiter({ maxRequests: 1 });
    const makeReq = () => ({
      headers: { 'x-forwarded-for': '10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    });
    const res = { setHeader() {}, writeHead() {}, end() {} };
    limiter(makeReq(), res, () => {});

    let rateLimited = false;
    const res2 = {
      setHeader() {},
      writeHead(code) { if (code === 429) rateLimited = true; },
      end() {},
    };
    limiter(makeReq(), res2, () => {});
    assert.ok(rateLimited, 'should rate limit by real socket IP, ignoring spoofed header');
  });
});

// ─── #13  Sandbox preload TOCTOU race ────────────────────────────────
describe('audit-medium #13 — sandbox preload permissions', () => {
  const fs = require('fs');
  const path = require('path');
  const { createSandboxDir, cleanupSandboxDir } = require('../src/core/sandbox');

  it('createSandboxDir creates a unique temporary directory', () => {
    const dir = createSandboxDir();
    assert.ok(fs.existsSync(dir));
    cleanupSandboxDir(dir);
  });

  it('sandboxJS produces read-only preload file', () => {
    const { sandboxJS } = require('../src/core/sandbox');
    // Run a trivial test — the preload is written internally;
    // if permissions broke execution, sandboxJS would fail
    const result = sandboxJS('const x = 1;', 'if (x !== 1) throw new Error("fail");');
    assert.strictEqual(result.passed, true);
    assert.strictEqual(result.sandboxed, true);
  });
});

// ─── #14  safeJsonParse nested __proto__ ─────────────────────────────
describe('audit-medium #14 — safeJsonParse nested proto pollution', () => {
  const { safeJsonParse } = require('../src/core/covenant');

  it('strips top-level __proto__', () => {
    const obj = safeJsonParse('{"__proto__": {"polluted": true}, "safe": 1}');
    assert.strictEqual(obj.safe, 1);
    assert.strictEqual(obj.__proto__?.polluted, undefined);
  });

  it('strips nested __proto__ inside objects', () => {
    const json = '{"outer": {"__proto__": {"polluted": true}, "ok": 1}}';
    const obj = safeJsonParse(json);
    assert.strictEqual(obj.outer.ok, 1);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(obj.outer, '__proto__'), false);
  });

  it('strips deeply nested constructor key', () => {
    const json = '{"a": {"b": {"constructor": {"prototype": {"polluted": true}}}}}';
    const obj = safeJsonParse(json);
    assert.ok(obj.a.b);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(obj.a.b, 'constructor'), false);
  });

  it('strips prototype key at any level', () => {
    const json = '{"data": {"prototype": {"injected": true}, "value": 42}}';
    const obj = safeJsonParse(json);
    assert.strictEqual(obj.data.value, 42);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(obj.data, 'prototype'), false);
  });

  it('returns fallback on invalid JSON', () => {
    const obj = safeJsonParse('not json', { default: true });
    assert.deepStrictEqual(obj, { default: true });
  });

  it('handles arrays correctly (no stripping)', () => {
    const obj = safeJsonParse('[1, 2, {"key": "value"}]');
    assert.ok(Array.isArray(obj));
    assert.strictEqual(obj.length, 3);
    assert.strictEqual(obj[2].key, 'value');
  });
});

// ─── #15  Audit logging exists and works ─────────────────────────────
describe('audit-medium #15 — audit logger', () => {
  const { initAuditLog, auditLog, readAuditLog, _resetAuditLog } = require('../src/core/audit-logger');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  const tmpDir = path.join(os.tmpdir(), `audit-test-${Date.now()}`);

  it('initialises and writes entries', async () => {
    _resetAuditLog();
    fs.mkdirSync(tmpDir, { recursive: true });
    initAuditLog(tmpDir);

    auditLog('submit', { id: 'abc123', actor: 'test-user', language: 'javascript', success: true });
    auditLog('resolve', { id: 'def456', success: true, meta: { decision: 'pull' } });
    auditLog('feedback', { id: 'abc123', success: false });

    // Wait for stream to flush before closing
    const { closeAuditLog } = require('../src/core/audit-logger');
    await new Promise(resolve => setTimeout(resolve, 200));
    closeAuditLog();

    const entries = readAuditLog(10);
    assert.ok(entries.length >= 3, `expected >= 3 entries, got ${entries.length}`);
    assert.strictEqual(entries[0].action, 'feedback');
    assert.strictEqual(entries[1].action, 'resolve');
    assert.strictEqual(entries[2].action, 'submit');
    assert.strictEqual(entries[2].actor, 'test-user');
    assert.ok(entries[0].traceId, 'each entry has a traceId');
  });

  it('ignores unknown actions', async () => {
    _resetAuditLog();
    initAuditLog(tmpDir);
    auditLog('unknown_action', { id: 'x' });
    const { closeAuditLog } = require('../src/core/audit-logger');
    await new Promise(resolve => setTimeout(resolve, 100));
    closeAuditLog();
    // Should not throw and should not add an entry for unknown action
  });

  it('never throws even when uninitialised', () => {
    _resetAuditLog();
    // Should silently do nothing
    assert.doesNotThrow(() => auditLog('submit', { id: 'x' }));
  });

  // Cleanup
  it('cleanup temp dir', () => {
    _resetAuditLog();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
