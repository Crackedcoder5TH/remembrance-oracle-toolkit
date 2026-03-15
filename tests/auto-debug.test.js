const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');
const { captureResolveDebug, captureFeedbackDebug, debugSweep } = require('../src/ci/auto-debug');

describe('Auto-Debug Module', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-debug-test-'));
    oracle = new RemembranceOracle({
      baseDir: tmpDir,
      threshold: 0.3,
      autoSeed: false,
      autoGrow: false,
      lifecycle: false,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('captureResolveDebug', () => {
    it('returns empty report when no debug oracle available', () => {
      const fakeOracle = { _getDebugOracle: () => null };
      const result = captureResolveDebug(fakeOracle, {}, {});
      assert.equal(result.captured, 0);
      assert.equal(result.forwarded, 0);
      assert.deepEqual(result.errors, []);
    });

    it('returns empty report when resolve has no pattern or healing', () => {
      const result = captureResolveDebug(oracle, { pattern: null, healing: null }, {});
      assert.equal(result.captured, 0);
      assert.equal(result.forwarded, 0);
    });

    it('forwards healed code as a debug pattern when improvement > 0', () => {
      const resolveResult = {
        decision: 'pull',
        pattern: {
          id: 'test-pattern-1',
          name: 'test-pattern',
          code: 'function foo() { return 1; }',
          language: 'javascript',
          tags: ['test'],
        },
        healedCode: 'function foo() { return 1; } // healed',
        healing: {
          loops: 2,
          originalCoherence: 0.5,
          finalCoherence: 0.8,
          improvement: 0.3,
          healingPath: ['reflection:coherency'],
        },
      };

      const result = captureResolveDebug(oracle, resolveResult, { description: 'test' });
      assert.equal(result.forwarded, 1);
      assert.equal(result.captured, 0);
    });

    it('captures healing failure as a debug pattern', () => {
      const resolveResult = {
        decision: 'evolve',
        pattern: {
          id: 'test-pattern-2',
          name: 'stuck-pattern',
          code: 'function bar() { return 2; }',
          language: 'javascript',
          tags: [],
        },
        healedCode: 'function bar() { return 2; }',
        healing: {
          loops: 3,
          originalCoherence: 0.4,
          finalCoherence: 0.4,
          improvement: 0,
          healingPath: ['reflection:no-improvement'],
        },
      };

      const result = captureResolveDebug(oracle, resolveResult, { description: 'test' });
      assert.equal(result.captured, 1);
      assert.equal(result.forwarded, 0);
    });

    it('handles errors gracefully', () => {
      const fakeOracle = {
        _getDebugOracle: () => {
          throw new Error('boom');
        },
      };
      const result = captureResolveDebug(fakeOracle, {
        pattern: { id: 'x' },
        healing: { improvement: 1 },
      }, {});
      assert.equal(result.errors.length, 1);
      assert.ok(result.errors[0].includes('boom'));
    });
  });

  describe('captureFeedbackDebug', () => {
    it('returns empty report when no debug oracle available', () => {
      const fakeOracle = { _getDebugOracle: () => null };
      const result = captureFeedbackDebug(fakeOracle, 'id', {}, null);
      assert.equal(result.captured, 0);
      assert.equal(result.forwarded, 0);
    });

    it('captures failed pattern as a debug pattern', () => {
      const entry = {
        name: 'failing-util',
        code: 'function fail() { throw new Error("oops"); }',
        language: 'javascript',
      };
      const result = captureFeedbackDebug(oracle, 'fail-id', entry, null);
      assert.equal(result.captured, 1);
    });

    it('forwards healed code when auto-heal succeeds', () => {
      const entry = {
        name: 'healed-util',
        code: 'function healed() { return true; }',
        language: 'javascript',
      };
      const healResult = {
        healed: true,
        improvement: 0.2,
        newCoherency: 0.8,
      };
      const result = captureFeedbackDebug(oracle, 'heal-id', entry, healResult);
      // Both the failure capture and the healed forward
      assert.equal(result.captured, 1);
      assert.equal(result.forwarded, 1);
    });
  });

  describe('debugSweep', () => {
    it('returns report with grown and synced fields', () => {
      const result = debugSweep(oracle, { silent: true });
      assert.ok(result.grown !== undefined);
      assert.ok(result.synced !== undefined);
      assert.ok(Array.isArray(result.errors));
    });

    it('skips operations in dry-run mode', () => {
      const result = debugSweep(oracle, { silent: true, dryRun: true });
      assert.equal(result.grown, null);
      assert.equal(result.synced, null);
      assert.deepEqual(result.errors, []);
    });

    it('grows debug variants when patterns exist', () => {
      // First capture a debug pattern
      oracle.debugCapture({
        errorMessage: 'TypeError: Cannot read property "x" of undefined',
        fixCode: 'if (obj) { return obj.x; }',
        fixDescription: 'null check guard',
        language: 'javascript',
      });

      const result = debugSweep(oracle, { silent: true, minConfidence: 0.0 });
      assert.ok(result.grown !== undefined);
      // The captured pattern may or may not generate variants depending on confidence
      assert.equal(typeof result.grown.processed, 'number');
    });
  });

  describe('integration with auto-submit pipeline', () => {
    it('auto-submit includes debugSweep in report', () => {
      const { autoSubmit } = require('../src/ci/auto-submit');
      const result = autoSubmit(oracle, tmpDir, { syncPersonal: false, silent: true });
      assert.ok(result.debugSweep !== undefined);
      assert.equal(typeof result.debugSweep.grown, 'number');
      assert.equal(typeof result.debugSweep.synced, 'number');
    });
  });

  describe('integration with resolve', () => {
    it('resolve triggers auto-debug capture without errors', () => {
      // Just verify resolve doesn't blow up with auto-debug wired in
      const result = oracle.resolve({ description: 'a utility function' });
      assert.ok(result.decision);
      // No assertion on debug capture since it depends on whether healing ran
    });
  });

  describe('integration with feedback', () => {
    it('feedback with failure triggers auto-debug capture without errors', () => {
      // Submit something first so we have an ID
      const submitted = oracle.submit(
        'function testFn() { return 42; }',
        { description: 'test function', language: 'javascript', tags: ['test'] }
      );
      if (submitted?.id) {
        const fbResult = oracle.feedback(submitted.id, false);
        assert.ok(fbResult.success !== undefined);
      }
    });
  });
});
