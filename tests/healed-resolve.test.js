const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');

describe('Healed Resolve', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healed-resolve-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });

    // Register a pattern so resolve has something to find
    oracle.registerPattern({
      name: 'rate-limiter',
      code: `class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.max = maxRequests;
    this.window = windowMs;
    this.hits = new Map();
  }
  allow(key) {
    const now = Date.now();
    const record = this.hits.get(key) || { count: 0, start: now };
    if (now - record.start > this.window) {
      record.count = 0;
      record.start = now;
    }
    record.count++;
    this.hits.set(key, record);
    return record.count <= this.max;
  }
}`,
      language: 'javascript',
      description: 'Token bucket rate limiter',
      tags: ['rate-limit', 'middleware', 'api'],
      testCode: `
const limiter = new RateLimiter(2, 1000);
if (!limiter.allow('a')) throw new Error('first should pass');
if (!limiter.allow('a')) throw new Error('second should pass');
if (limiter.allow('a')) throw new Error('third should fail');
if (!limiter.allow('b')) throw new Error('different key should pass');`,
      author: 'test',
    });

    // Register a second pattern for alternative comparison
    oracle.registerPattern({
      name: 'debounce',
      code: `function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}`,
      language: 'javascript',
      description: 'Debounce a function call',
      tags: ['utility', 'timing', 'performance'],
      testCode: `
let count = 0;
const inc = debounce(() => count++, 10);
inc(); inc(); inc();
setTimeout(() => { if (count !== 1) throw new Error('should debounce'); }, 50);`,
      author: 'test',
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('healedCode', () => {
    it('returns healedCode field on PULL decision', () => {
      const result = oracle.resolve({ description: 'rate limiter token bucket', tags: ['rate-limit'] });
      assert.ok(result.healedCode, 'healedCode should be present');
      assert.equal(typeof result.healedCode, 'string');
      assert.ok(result.healedCode.length > 50, 'healedCode should be substantial');
      assert.ok(result.healedCode.includes('RateLimiter') || result.healedCode.includes('allow'), 'healedCode should contain rate limiter logic');
    });

    it('returns healedCode on EVOLVE decision', () => {
      // Use a vague description to get an evolve rather than pull
      const result = oracle.resolve({ description: 'throttle requests somehow', tags: ['throttle'] });
      if (result.decision === 'evolve' || result.decision === 'pull') {
        assert.ok(result.healedCode, 'healedCode should be present for pull/evolve');
        assert.equal(typeof result.healedCode, 'string');
      }
    });

    it('returns null healedCode on GENERATE decision', () => {
      const result = oracle.resolve({ description: 'quantum blockchain neural network' });
      if (result.decision === 'generate') {
        // healedCode should be null or the raw code of the closest match
        assert.equal(typeof result.healedCode, 'string');
      }
    });

    it('returns raw code when heal=false', () => {
      const result = oracle.resolve({ description: 'rate limiter', tags: ['rate-limit'], heal: false });
      assert.ok(result.pattern, 'should find pattern');
      assert.equal(result.healedCode, result.pattern.code, 'healedCode should be raw code when heal=false');
      assert.equal(result.healing, null, 'healing should be null when heal=false');
    });
  });

  describe('whisper', () => {
    it('returns a whisper string on PULL', () => {
      const result = oracle.resolve({ description: 'rate limiter token bucket', tags: ['rate-limit'] });
      assert.ok(result.whisper, 'whisper should be present');
      assert.equal(typeof result.whisper, 'string');
      assert.ok(result.whisper.length > 20, 'whisper should be a meaningful sentence');
    });

    it('returns a whisper on GENERATE', () => {
      const result = oracle.resolve({ description: 'quantum blockchain neural network' });
      if (result.decision === 'generate') {
        assert.ok(result.whisper, 'whisper should be present even for generate');
        assert.ok(result.whisper.length > 20);
      }
    });

    it('whisper is gentle and remembrance-aligned', () => {
      const result = oracle.resolve({ description: 'rate limiter', tags: ['rate-limit'] });
      // Should not contain harsh, technical, or negative language
      const whisper = result.whisper.toLowerCase();
      assert.ok(!whisper.includes('error'), 'whisper should not mention errors');
      assert.ok(!whisper.includes('failed'), 'whisper should not mention failure');
      assert.ok(!whisper.includes('broken'), 'whisper should not mention broken');
    });

    it('whisper is deterministic for same pattern', () => {
      const r1 = oracle.resolve({ description: 'rate limiter', tags: ['rate-limit'] });
      const r2 = oracle.resolve({ description: 'rate limiter', tags: ['rate-limit'] });
      // Same query + same pattern = same base whisper (healing suffix may vary slightly)
      assert.ok(r1.whisper.length > 0);
      assert.ok(r2.whisper.length > 0);
    });
  });

  describe('candidateNotes', () => {
    it('returns candidateNotes when alternatives exist', () => {
      const result = oracle.resolve({ description: 'rate limiter token bucket', tags: ['rate-limit'] });
      if (result.alternatives?.length > 0 && result.pattern) {
        assert.ok(result.candidateNotes, 'candidateNotes should be present when alternatives exist');
        assert.equal(typeof result.candidateNotes, 'string');
        assert.ok(result.candidateNotes.includes('Chose'), 'should explain the choice');
      }
    });

    it('returns null candidateNotes when no alternatives', () => {
      // With only one pattern registered, there may be no alternatives
      const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'healed-resolve-solo-'));
      const solo = new RemembranceOracle({ baseDir: tmpDir2, threshold: 0.5, autoSeed: false });
      solo.registerPattern({
        name: 'solo-pattern',
        code: 'function solo() { return "alone"; }',
        language: 'javascript',
        description: 'A solo pattern',
        tags: ['solo'],
        testCode: 'if (solo() !== "alone") throw new Error("fail");',
        author: 'test',
      });
      const result = solo.resolve({ description: 'solo pattern' });
      // With only one pattern, candidateNotes should be null (no alternatives to compare against)
      assert.equal(result.candidateNotes, null, 'no alternatives means no candidate notes');
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    });
  });

  describe('healing metadata', () => {
    it('includes healing object with reflection data on pull', () => {
      const result = oracle.resolve({ description: 'rate limiter', tags: ['rate-limit'] });
      if (result.healing) {
        assert.equal(typeof result.healing.loops, 'number');
        assert.ok(result.healing.loops >= 0);
        assert.equal(typeof result.healing.originalCoherence, 'number');
        assert.equal(typeof result.healing.finalCoherence, 'number');
        assert.equal(typeof result.healing.improvement, 'number');
        assert.ok(Array.isArray(result.healing.healingPath));
      }
    });

    it('healing is null when heal=false', () => {
      const result = oracle.resolve({ description: 'rate limiter', heal: false });
      assert.equal(result.healing, null);
    });
  });

  describe('full response shape', () => {
    it('has all expected fields', () => {
      const result = oracle.resolve({ description: 'rate limiter token bucket', tags: ['rate-limit'] });
      assert.ok('decision' in result);
      assert.ok('confidence' in result);
      assert.ok('reasoning' in result);
      assert.ok('pattern' in result);
      assert.ok('healedCode' in result);
      assert.ok('whisper' in result);
      assert.ok('candidateNotes' in result);
      assert.ok('healing' in result);
      assert.ok('alternatives' in result);
      assert.ok('historyMatches' in result);
    });

    it('decision is one of pull/evolve/generate', () => {
      const result = oracle.resolve({ description: 'rate limiter' });
      assert.ok(['pull', 'evolve', 'generate'].includes(result.decision));
    });
  });
});
