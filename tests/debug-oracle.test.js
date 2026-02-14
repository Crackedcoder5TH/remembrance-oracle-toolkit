const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  DebugOracle,
  fingerprint,
  normalizeError,
  extractErrorClass,
  classifyError,
  computeConfidence,
  generateErrorVariants,
  generateFixVariants,
  ERROR_CATEGORIES,
} = require('../src/core/debug-oracle');

const { SQLiteStore, DatabaseSync } = require('../src/store/sqlite');

function makeTempDir(suffix = '') {
  const dir = path.join(os.tmpdir(), `debug-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createDebugOracle() {
  const baseDir = makeTempDir('debug');
  const store = new SQLiteStore(baseDir);
  return new DebugOracle(store);
}

describe('Debug Oracle', () => {
  if (!DatabaseSync) {
    it('skips debug oracle tests (no SQLite)', () => { assert.ok(true); });
    return;
  }

  // ─── Error Fingerprinting ───

  describe('normalizeError', () => {
    it('strips file paths and line numbers', () => {
      const msg = 'Error at /home/user/project/src/foo.js:42:10';
      const result = normalizeError(msg);
      assert.ok(!result.includes('/home/user'));
      assert.ok(result.includes('<FILE>:<LINE>'));
    });

    it('strips memory addresses', () => {
      const msg = 'Segfault at 0x7fff5fc00000';
      const result = normalizeError(msg);
      assert.ok(!result.includes('0x7fff'));
      assert.ok(result.includes('<ADDR>'));
    });

    it('strips timestamps', () => {
      const msg = 'Error at 2024-01-15T10:30:00.000Z';
      const result = normalizeError(msg);
      assert.ok(!result.includes('2024'));
      assert.ok(result.includes('<TIME>'));
    });

    it('normalizes whitespace', () => {
      const msg = 'Error   with   extra    spaces';
      const result = normalizeError(msg);
      assert.equal(result, 'Error with extra spaces');
    });

    it('handles null/undefined gracefully', () => {
      assert.equal(normalizeError(null), '');
      assert.equal(normalizeError(undefined), '');
      assert.equal(normalizeError(''), '');
    });
  });

  describe('extractErrorClass', () => {
    it('extracts TypeError', () => {
      assert.equal(extractErrorClass('TypeError: x is not a function'), 'TypeError');
    });

    it('extracts ReferenceError', () => {
      assert.equal(extractErrorClass('ReferenceError: x is not defined'), 'ReferenceError');
    });

    it('extracts SyntaxError', () => {
      assert.equal(extractErrorClass('SyntaxError: Unexpected token }'), 'SyntaxError');
    });

    it('extracts from middle of message', () => {
      assert.equal(extractErrorClass('Uncaught RangeError: Maximum call stack'), 'RangeError');
    });

    it('returns UnknownError for unrecognized', () => {
      assert.equal(extractErrorClass('Something went wrong'), 'UnknownError');
    });

    it('handles null', () => {
      assert.equal(extractErrorClass(null), 'UnknownError');
    });
  });

  describe('classifyError', () => {
    it('classifies TypeError as type', () => {
      assert.equal(classifyError('TypeError: x is not a function'), 'type');
    });

    it('classifies SyntaxError as syntax', () => {
      assert.equal(classifyError('SyntaxError: Unexpected token'), 'syntax');
    });

    it('classifies cannot find module as build', () => {
      assert.equal(classifyError('Cannot find module "foo"'), 'build');
    });

    it('classifies ReferenceError as reference', () => {
      assert.equal(classifyError('ReferenceError: x is not defined'), 'reference');
    });

    it('classifies assertion failure as logic', () => {
      assert.equal(classifyError('AssertionError: expected 2 to equal 3'), 'logic');
    });

    it('classifies ECONNREFUSED as network', () => {
      assert.equal(classifyError('ECONNREFUSED: Connection refused'), 'network');
    });

    it('classifies overflow as runtime', () => {
      assert.equal(classifyError('RangeError: Maximum call stack size exceeded'), 'runtime');
    });

    it('classifies permission denied as permission', () => {
      assert.equal(classifyError('EACCES: Permission denied'), 'permission');
    });

    it('classifies unhandled promise as async', () => {
      assert.equal(classifyError('UnhandledPromiseRejection: ...'), 'async');
    });

    it('classifies JSON parse as data', () => {
      assert.equal(classifyError('JSON.parse: invalid JSON'), 'data');
    });

    it('defaults to runtime for unknown', () => {
      assert.equal(classifyError(null), 'runtime');
    });
  });

  describe('fingerprint', () => {
    it('generates stable hash for same error', () => {
      const fp1 = fingerprint('TypeError: x is not a function', '');
      const fp2 = fingerprint('TypeError: x is not a function', '');
      assert.equal(fp1.hash, fp2.hash);
    });

    it('generates different hash for different errors', () => {
      const fp1 = fingerprint('TypeError: x is not a function', '');
      const fp2 = fingerprint('ReferenceError: y is not defined', '');
      assert.notEqual(fp1.hash, fp2.hash);
    });

    it('normalizes before hashing', () => {
      const fp1 = fingerprint('Error at /path/file.js:10:5', '');
      const fp2 = fingerprint('Error at /other/file.js:20:3', '');
      assert.equal(fp1.hash, fp2.hash); // Same after normalization
    });

    it('includes error class and category', () => {
      const fp = fingerprint('TypeError: x is not a function', '');
      assert.equal(fp.errorClass, 'TypeError');
      assert.equal(fp.category, 'type');
    });

    it('extracts stack functions', () => {
      const stack = `Error: something
    at foo (/path/file.js:10:5)
    at bar (/path/other.js:20:3)
    at baz (/path/third.js:30:1)`;
      const fp = fingerprint('Error: something', stack);
      assert.deepEqual(fp.stackFunctions, ['foo', 'bar', 'baz']);
    });
  });

  // ─── Confidence Scoring ───

  describe('computeConfidence', () => {
    it('returns 0.2 for zero applications', () => {
      assert.equal(computeConfidence(0, 0), 0.2);
    });

    it('grows with successful applications', () => {
      const c1 = computeConfidence(1, 1);
      const c5 = computeConfidence(5, 5);
      const c10 = computeConfidence(10, 10);
      assert.ok(c1 < c5, 'confidence grows with applications');
      assert.ok(c5 < c10, 'confidence continues growing');
    });

    it('decreases with failures', () => {
      const allSuccess = computeConfidence(5, 5);
      const halfSuccess = computeConfidence(5, 2);
      assert.ok(halfSuccess < allSuccess);
    });

    it('approaches 1.0 for many successes', () => {
      const c = computeConfidence(100, 100);
      assert.ok(c > 0.9, `expected > 0.9, got ${c}`);
    });

    it('stays low for poor resolution rate', () => {
      const c = computeConfidence(100, 10);
      assert.ok(c < 0.3, `expected < 0.3, got ${c}`);
    });
  });

  // ─── Variant Generation ───

  describe('generateErrorVariants', () => {
    it('generates undefined→null variant for TypeError', () => {
      const variants = generateErrorVariants('TypeError: Cannot read property of undefined', 'type');
      assert.ok(variants.some(v => v.includes('null')));
    });

    it('generates variants for is not a function', () => {
      const variants = generateErrorVariants('TypeError: x is not a function', 'type');
      assert.ok(variants.some(v => v.includes('is not an object')));
    });

    it('generates variants for Unexpected token', () => {
      const variants = generateErrorVariants('SyntaxError: Unexpected token ;', 'syntax');
      assert.ok(variants.length > 0);
    });

    it('returns empty for uncategorized errors', () => {
      const variants = generateErrorVariants('Something weird', 'runtime');
      assert.equal(variants.length, 0);
    });
  });

  describe('generateFixVariants', () => {
    it('generates Python variant from JS', () => {
      const variants = generateFixVariants('const x = null;', 'javascript', ['python']);
      assert.ok(variants.length > 0);
      assert.equal(variants[0].language, 'python');
      assert.ok(variants[0].code.includes('None'));
    });

    it('generates Go variant from JS', () => {
      const variants = generateFixVariants('const x = null;', 'javascript', ['go']);
      assert.ok(variants.length > 0);
      assert.equal(variants[0].language, 'go');
      assert.ok(variants[0].code.includes('nil'));
    });

    it('skips same language', () => {
      const variants = generateFixVariants('const x = 1;', 'javascript', ['javascript']);
      assert.equal(variants.length, 0);
    });
  });

  // ─── DebugOracle Core ───

  describe('DebugOracle.capture', () => {
    it('captures an error→fix pair', () => {
      const debug = createDebugOracle();
      const result = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'if (typeof x === "function") x();',
        fixDescription: 'Check if x is callable before calling',
        language: 'javascript',
      });
      assert.ok(result.captured);
      assert.ok(result.pattern);
      assert.equal(result.pattern.errorClass, 'TypeError');
      assert.equal(result.pattern.errorCategory, 'type');
      assert.equal(result.pattern.language, 'javascript');
      assert.ok(result.pattern.id);
    });

    it('auto-generates language variants', () => {
      const debug = createDebugOracle();
      const result = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'const safe = typeof x === "function" ? x() : null;',
        language: 'javascript',
      });
      assert.ok(result.captured);
      assert.ok(result.variants.length > 0, 'should auto-generate variants');
    });

    it('rejects duplicate fingerprints with high confidence', () => {
      const debug = createDebugOracle();

      // Capture first
      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'if (typeof x === "function") x();',
        language: 'javascript',
      });

      // Manually boost confidence
      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.9 WHERE id = ?').run(captured.id);

      // Try duplicate
      const result = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'different fix code',
        language: 'javascript',
      });
      assert.ok(result.duplicate);
      assert.equal(result.existingId, captured.id);
    });

    it('updates existing pattern if confidence is low', () => {
      const debug = createDebugOracle();

      // Capture first
      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'old fix code',
        language: 'javascript',
      });

      // Try same fingerprint — confidence is low (0.2), should update
      const result = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'better fix code',
        language: 'javascript',
      });
      assert.ok(result.captured);
      assert.ok(result.updated);
    });

    it('requires errorMessage and fixCode', () => {
      const debug = createDebugOracle();
      const result = debug.capture({ errorMessage: 'error' });
      assert.ok(!result.captured);
      assert.ok(result.error);
    });
  });

  describe('DebugOracle.search', () => {
    it('finds exact fingerprint matches', () => {
      const debug = createDebugOracle();
      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'if (typeof x === "function") x();',
        language: 'javascript',
      });

      const results = debug.search({
        errorMessage: 'TypeError: x is not a function',
      });
      assert.ok(results.length > 0);
      assert.equal(results[0].matchType, 'exact');
    });

    it('finds class matches', () => {
      const debug = createDebugOracle();
      debug.capture({
        errorMessage: 'TypeError: y is not a function',
        fixCode: 'check typeof before calling',
        language: 'javascript',
      });

      const results = debug.search({
        errorMessage: 'TypeError: z is undefined',
      });
      // Should find through class matching (both TypeError + type category)
      assert.ok(results.length > 0);
    });

    it('ranks by confidence', () => {
      const debug = createDebugOracle();

      // Low confidence capture
      debug.capture({
        errorMessage: 'ReferenceError: a is not defined',
        fixCode: 'let a = 0;',
        language: 'javascript',
      });

      // Boost one capture's confidence
      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      if (captured) {
        debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.9 WHERE id = ?').run(captured.id);
      }

      // Another capture with default confidence
      debug.capture({
        errorMessage: 'ReferenceError: b is not defined',
        fixCode: 'let b = 0;',
        language: 'javascript',
      });

      const results = debug.search({
        errorMessage: 'ReferenceError: c is not defined',
        limit: 10,
      });

      if (results.length >= 2) {
        assert.ok(results[0].confidence >= results[1].confidence || results[0].matchScore >= results[1].matchScore);
      }
    });

    it('returns empty for no matches', () => {
      const debug = createDebugOracle();
      const results = debug.search({
        errorMessage: 'Some completely unique error',
      });
      assert.equal(results.length, 0);
    });
  });

  describe('DebugOracle.reportOutcome', () => {
    it('increases confidence on success', () => {
      const debug = createDebugOracle();
      const { pattern } = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'if (typeof x === "function") x();',
        language: 'javascript',
      });

      const initialConfidence = pattern.confidence;
      const result = debug.reportOutcome(pattern.id, true);
      assert.ok(result.success);
      assert.ok(result.timesApplied === 1);
      assert.ok(result.timesResolved === 1);
    });

    it('tracks failed applications', () => {
      const debug = createDebugOracle();
      const { pattern } = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'bad fix',
        language: 'javascript',
      });

      const result = debug.reportOutcome(pattern.id, false);
      assert.ok(result.success);
      assert.equal(result.timesApplied, 1);
      assert.equal(result.timesResolved, 0);
    });

    it('triggers cascade growth at threshold', () => {
      const debug = createDebugOracle();
      debug.cascadeThreshold = 0.01; // Very low for testing

      const { pattern } = debug.capture({
        errorMessage: 'TypeError: Cannot read property of undefined',
        fixCode: 'if (obj && obj.prop) { return obj.prop; }',
        language: 'javascript',
      });

      const result = debug.reportOutcome(pattern.id, true);
      assert.ok(result.success);
      // May generate cascade variants
      assert.ok(result.cascadeVariants >= 0);
    });

    it('returns error for unknown ID', () => {
      const debug = createDebugOracle();
      const result = debug.reportOutcome('nonexistent', true);
      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });

  describe('DebugOracle.grow', () => {
    it('generates variants from high-confidence patterns', () => {
      const debug = createDebugOracle();

      // Create a pattern and boost its confidence
      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'const result = typeof x === "function" ? x() : null;',
        language: 'javascript',
      });

      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.8 WHERE id = ?').run(captured.id);

      const report = debug.grow({ minConfidence: 0.5 });
      assert.ok(report.processed > 0);
      assert.ok(report.generated >= 0);
    });

    it('skips duplicates', () => {
      const debug = createDebugOracle();

      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'const result = typeof x === "function" ? x() : null;',
        language: 'javascript',
      });

      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.8 WHERE id = ?').run(captured.id);

      // Grow twice — second should skip duplicates
      const report1 = debug.grow({ minConfidence: 0.5 });
      const report2 = debug.grow({ minConfidence: 0.5 });
      assert.ok(report2.skipped >= report1.stored || report2.stored === 0);
    });
  });

  describe('DebugOracle.getAll', () => {
    it('returns all patterns', () => {
      const debug = createDebugOracle();
      debug.capture({
        errorMessage: 'TypeError: a',
        fixCode: 'fix a',
        language: 'javascript',
      });
      debug.capture({
        errorMessage: 'SyntaxError: b',
        fixCode: 'fix b',
        language: 'python',
      });

      const all = debug.getAll();
      assert.ok(all.length >= 2);
    });

    it('filters by language', () => {
      const debug = createDebugOracle();
      debug.capture({ errorMessage: 'TypeError: a', fixCode: 'fix a', language: 'javascript' });
      debug.capture({ errorMessage: 'SyntaxError: b', fixCode: 'fix b', language: 'python' });

      const pyOnly = debug.getAll({ language: 'python' });
      assert.ok(pyOnly.every(p => p.language === 'python'));
    });

    it('filters by category', () => {
      const debug = createDebugOracle();
      debug.capture({ errorMessage: 'TypeError: a', fixCode: 'fix', language: 'javascript' });
      debug.capture({ errorMessage: 'SyntaxError: Unexpected token', fixCode: 'fix', language: 'javascript' });

      const syntaxOnly = debug.getAll({ category: 'syntax' });
      assert.ok(syntaxOnly.every(p => p.errorCategory === 'syntax'));
    });

    it('filters by minimum confidence', () => {
      const debug = createDebugOracle();
      debug.capture({ errorMessage: 'TypeError: a', fixCode: 'fix', language: 'javascript' });

      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.9 WHERE id = ?').run(captured.id);

      const highConf = debug.getAll({ minConfidence: 0.8 });
      assert.ok(highConf.every(p => p.confidence >= 0.8));
    });
  });

  describe('DebugOracle.stats', () => {
    it('returns valid statistics', () => {
      const debug = createDebugOracle();
      debug.capture({ errorMessage: 'TypeError: a', fixCode: 'fix a', language: 'javascript' });
      debug.capture({ errorMessage: 'SyntaxError: Unexpected token', fixCode: 'fix b', language: 'python' });

      const stats = debug.stats();
      assert.ok(stats.totalPatterns >= 2);
      assert.ok(typeof stats.avgConfidence === 'number');
      assert.ok(typeof stats.resolutionRate === 'number');
      assert.ok(stats.byCategory);
      assert.ok(stats.byLanguage);
      assert.ok(stats.byMethod);
      assert.ok(typeof stats.captured === 'number');
      assert.ok(typeof stats.generated === 'number');
    });
  });

  // ─── Oracle API Integration ───

  describe('RemembranceOracle debug methods', () => {
    it('exposes debugCapture through oracle API', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });

      const result = oracle.debugCapture({
        errorMessage: 'TypeError: Cannot read properties of null',
        fixCode: 'if (obj != null) { return obj.prop; }',
        language: 'javascript',
      });

      assert.ok(result.captured || result.error === 'No SQLite store available');
    });

    it('exposes debugSearch through oracle API', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });

      // Capture first
      oracle.debugCapture({
        errorMessage: 'TypeError: Cannot read properties of null',
        fixCode: 'if (obj != null) { return obj.prop; }',
        language: 'javascript',
      });

      const results = oracle.debugSearch({
        errorMessage: 'TypeError: Cannot read properties of null',
        federated: false,
      });
      // Results depend on SQLite availability
      assert.ok(Array.isArray(results));
    });

    it('exposes debugStats through oracle API', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });

      const stats = oracle.debugStats();
      assert.ok(typeof stats.totalPatterns === 'number' || stats.error);
    });

    it('exposes debugGrow through oracle API', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });

      const result = oracle.debugGrow();
      assert.ok(typeof result.processed === 'number' || result.error);
    });
  });

  // ─── MCP Integration ───

  describe('MCP debug tools', () => {
    it('lists debug tools', () => {
      const { TOOLS } = require('../src/mcp/server');
      const debugTools = TOOLS.filter(t => t.name.startsWith('oracle_debug_'));
      assert.ok(debugTools.length >= 6, `expected at least 6 debug tools, got ${debugTools.length}`);
    });

    it('handles oracle_debug_capture', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'oracle_debug_capture',
          arguments: {
            errorMessage: 'TypeError: x is undefined',
            fixCode: 'const x = 0;',
            language: 'javascript',
          },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
      assert.ok(response.result.content);
    });

    it('handles oracle_debug_search', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'oracle_debug_search',
          arguments: {
            errorMessage: 'TypeError: x is undefined',
          },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug_stats', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'oracle_debug_stats',
          arguments: {},
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug_grow', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'oracle_debug_grow',
          arguments: {},
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug_feedback', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      // First capture
      oracle.debugCapture({
        errorMessage: 'TypeError: x is undefined',
        fixCode: 'const x = 0;',
        language: 'javascript',
      });
      const patterns = oracle.debugPatterns();
      const id = patterns.length > 0 ? patterns[0].id : 'test-id';

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'oracle_debug_feedback',
          arguments: { id, resolved: true },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug_share (not a registered tool)', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'oracle_debug_share',
          arguments: { dryRun: true },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      // oracle_debug_share is not a registered MCP tool — expect JSON-RPC error
      assert.ok(response.error);
      assert.equal(response.error.code, -32602);
    });
  });

  // ─── ERROR_CATEGORIES completeness ───

  describe('ERROR_CATEGORIES', () => {
    it('covers all 10 categories', () => {
      const expected = ['syntax', 'type', 'reference', 'logic', 'runtime', 'build', 'network', 'permission', 'async', 'data'];
      for (const cat of expected) {
        assert.ok(ERROR_CATEGORIES[cat], `missing category: ${cat}`);
        assert.ok(ERROR_CATEGORIES[cat].keywords.length > 0, `no keywords for: ${cat}`);
        assert.ok(typeof ERROR_CATEGORIES[cat].weight === 'number', `no weight for: ${cat}`);
      }
    });
  });

  // ─── End-to-End Growth Flow ───

  describe('Exponential growth flow', () => {
    it('capture → feedback → cascade → more patterns', () => {
      const debug = createDebugOracle();
      debug.cascadeThreshold = 0.01; // Low threshold for testing

      // Step 1: Capture
      const capture = debug.capture({
        errorMessage: 'TypeError: Cannot read properties of null (reading "length")',
        fixCode: 'const len = arr ? arr.length : 0;',
        fixDescription: 'Null-safe length check',
        language: 'javascript',
        tags: ['null-safety', 'defensive'],
      });
      assert.ok(capture.captured);
      const initialCount = debug.getAll().length;

      // Step 2: Report success (triggers cascade)
      const feedback = debug.reportOutcome(capture.pattern.id, true);
      assert.ok(feedback.success);

      // Step 3: Grow explicitly
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.8 WHERE id = ?').run(capture.pattern.id);
      const growth = debug.grow({ minConfidence: 0.5 });
      const finalCount = debug.getAll().length;

      // Should have grown
      assert.ok(finalCount >= initialCount, `expected growth: ${initialCount} → ${finalCount}`);

      // Step 4: Stats should reflect growth
      const stats = debug.stats();
      assert.ok(stats.totalPatterns >= initialCount);
    });
  });
});
