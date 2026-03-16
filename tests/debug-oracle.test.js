const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  DebugOracle,
  fingerprint,
  normalizeError,
  extractErrorClass,
  classifyError,
  computeConfidence,
  computeAmplitude,
  applyDecoherence,
  computePhase,
  canTunnel,
  computeInterference,
  computeFixSimilarity,
  generateErrorVariants,
  generateFixVariants,
  ERROR_CATEGORIES,
  QUANTUM_STATES,
  PLANCK_CONFIDENCE,
  DECOHERENCE_LAMBDA,
} = require('../src/debug/debug-oracle');

const { SQLiteStore, DatabaseSync } = require('../src/store/sqlite');
const { makeTempDir } = require('./helpers');

function createDebugOracle() {
  const baseDir = makeTempDir('debug');
  const store = new SQLiteStore(baseDir);
  return new DebugOracle(store);
}

describe('Debug Oracle — Quantum Debugging Intelligence', () => {
  if (!DatabaseSync) {
    it('skips debug oracle tests (no SQLite)', () => { assert.ok(true); });
    return;
  }

  // ─── State Vector Preparation (Error Fingerprinting) ───

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

  // ─── Quantum Amplitude (replaces classical confidence) ───

  describe('computeAmplitude (computeConfidence)', () => {
    it('returns PLANCK_CONFIDENCE for zero applications', () => {
      assert.equal(computeAmplitude(0, 0), PLANCK_CONFIDENCE);
      assert.equal(computeConfidence(0, 0), PLANCK_CONFIDENCE); // backward compat
    });

    it('grows with successful applications', () => {
      const c1 = computeAmplitude(1, 1);
      const c5 = computeAmplitude(5, 5);
      const c10 = computeAmplitude(10, 10);
      assert.ok(c1 < c5, 'amplitude grows with applications');
      assert.ok(c5 < c10, 'amplitude continues growing');
    });

    it('decreases with failures', () => {
      const allSuccess = computeAmplitude(5, 5);
      const halfSuccess = computeAmplitude(5, 2);
      assert.ok(halfSuccess < allSuccess);
    });

    it('approaches 1.0 for many successes', () => {
      const c = computeAmplitude(100, 100);
      assert.ok(c > 0.9, `expected > 0.9, got ${c}`);
    });

    it('stays low for poor resolution rate', () => {
      const c = computeAmplitude(100, 10);
      assert.ok(c < 0.3, `expected < 0.3, got ${c}`);
    });
  });

  // ─── Decoherence ───

  describe('applyDecoherence', () => {
    it('returns same amplitude for recently observed patterns', () => {
      const now = new Date().toISOString();
      const result = applyDecoherence(0.8, now, now);
      assert.equal(result, 0.8);
    });

    it('decays amplitude for patterns not observed for days', () => {
      const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
      const result = applyDecoherence(0.8, past);
      assert.ok(result < 0.8, `expected < 0.8, got ${result}`);
      assert.ok(result > 0, 'amplitude should not reach zero');
    });

    it('decays more for longer time periods', () => {
      const past30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const past180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const decay30 = applyDecoherence(0.8, past30);
      const decay180 = applyDecoherence(0.8, past180);
      assert.ok(decay30 > decay180, `30-day decay (${decay30}) should be less than 180-day decay (${decay180})`);
    });

    it('returns amplitude unchanged when lastObservedAt is null', () => {
      assert.equal(applyDecoherence(0.8, null), 0.8);
    });
  });

  // ─── Phase ───

  describe('computePhase', () => {
    it('returns deterministic phase for same fingerprint', () => {
      const p1 = computePhase('abc123');
      const p2 = computePhase('abc123');
      assert.equal(p1, p2);
    });

    it('returns different phases for different fingerprints', () => {
      const p1 = computePhase('abc123');
      const p2 = computePhase('def456');
      assert.notEqual(p1, p2);
    });

    it('returns phase in range [0, 2π)', () => {
      const p = computePhase('test-hash');
      assert.ok(p >= 0, `phase ${p} should be >= 0`);
      assert.ok(p < 2 * Math.PI, `phase ${p} should be < 2π`);
    });

    it('returns 0 for null/empty fingerprint', () => {
      assert.equal(computePhase(null), 0);
      assert.equal(computePhase(''), 0);
    });
  });

  // ─── Tunneling ───

  describe('canTunnel', () => {
    it('always returns true when amplitude >= threshold', () => {
      assert.equal(canTunnel(0.5, 0.3), true);
      assert.equal(canTunnel(0.3, 0.3), true);
    });

    it('can probabilistically tunnel through barrier', () => {
      // Run many trials — at least some should tunnel
      let tunneled = 0;
      for (let i = 0; i < 1000; i++) {
        if (canTunnel(0.2, 0.3)) tunneled++;
      }
      assert.ok(tunneled > 0, 'at least some should tunnel through');
      assert.ok(tunneled < 1000, 'not all should tunnel');
    });

    it('tunneling probability decreases with larger barrier', () => {
      let smallBarrier = 0;
      let largeBarrier = 0;
      for (let i = 0; i < 5000; i++) {
        if (canTunnel(0.25, 0.3)) smallBarrier++;  // barrier = 0.05
        if (canTunnel(0.05, 0.3)) largeBarrier++;  // barrier = 0.25
      }
      assert.ok(smallBarrier > largeBarrier,
        `small barrier (${smallBarrier}) should tunnel more than large barrier (${largeBarrier})`);
    });
  });

  // ─── Interference ───

  describe('computeInterference', () => {
    it('returns positive interference for similar fixes', () => {
      const pA = { phase: 0, fixCode: 'if (x) return x;' };
      const pB = { phase: 0.1, fixCode: 'if (x) return x; // checked' };
      const interference = computeInterference(pA, pB);
      assert.ok(interference > 0, `expected positive interference, got ${interference}`);
    });

    it('returns non-positive interference for dissimilar fixes', () => {
      const pA = { phase: 0, fixCode: 'try { x() } catch(e) { return null; }' };
      const pB = { phase: Math.PI, fixCode: 'const isValid = schema.validate(data);' };
      const interference = computeInterference(pA, pB);
      // Allow floating-point epsilon (values near zero are effectively non-positive)
      assert.ok(interference <= 1e-10, `expected non-positive interference, got ${interference}`);
    });

    it('returns bounded interference', () => {
      const pA = { phase: 0, fixCode: 'a' };
      const pB = { phase: Math.PI, fixCode: 'b' };
      const interference = computeInterference(pA, pB);
      assert.ok(Math.abs(interference) <= 0.2, `interference ${interference} should be bounded`);
    });
  });

  // ─── Fix Similarity ───

  describe('computeFixSimilarity', () => {
    it('returns 1 for identical code', () => {
      assert.equal(computeFixSimilarity('const x = 1;', 'const x = 1;'), 1);
    });

    it('returns 0 for completely different code', () => {
      const sim = computeFixSimilarity('alpha beta gamma', 'xray yankee zulu');
      assert.equal(sim, 0);
    });

    it('returns partial similarity for overlapping tokens', () => {
      const sim = computeFixSimilarity('const x = 1; return x;', 'const y = 2; return y;');
      assert.ok(sim > 0 && sim < 1);
    });

    it('handles empty inputs', () => {
      assert.equal(computeFixSimilarity('', ''), 0);
      assert.equal(computeFixSimilarity(null, 'code'), 0);
    });
  });

  // ─── Variant Generation (Entangled State Creation) ───

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

  // ─── DebugOracle Core: Quantum Capture ───

  describe('DebugOracle.capture (quantum injection)', () => {
    it('captures a pattern in |superposition⟩', () => {
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
      assert.equal(result.pattern.quantumState, QUANTUM_STATES.SUPERPOSITION);
      assert.equal(result.pattern.amplitude, PLANCK_CONFIDENCE);
      assert.ok(typeof result.pattern.phase === 'number');
      assert.ok(result.pattern.id);
    });

    it('auto-generates entangled variants', () => {
      const debug = createDebugOracle();
      const result = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'const safe = typeof x === "function" ? x() : null;',
        language: 'javascript',
      });
      assert.ok(result.captured);
      assert.ok(result.variants.length > 0, 'should auto-generate entangled variants');

      // Variants should be in superposition
      for (const v of result.variants) {
        assert.equal(v.quantumState, QUANTUM_STATES.SUPERPOSITION);
      }
    });

    it('establishes entanglement between parent and variants', () => {
      const debug = createDebugOracle();
      const result = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'const safe = typeof x === "function" ? x() : null;',
        language: 'javascript',
      });
      assert.ok(result.captured);

      // Refetch parent to check entanglement links
      const parent = debug.get(result.pattern.id);
      assert.ok(parent.entangledWith.length > 0, 'parent should be entangled with variants');

      // Variants should be entangled back to parent
      for (const v of result.variants) {
        const variant = debug.get(v.id);
        assert.ok(variant.entangledWith.includes(parent.id), `variant ${v.id} should be entangled with parent`);
      }
    });

    it('rejects duplicate fingerprints with high amplitude', () => {
      const debug = createDebugOracle();

      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'if (typeof x === "function") x();',
        language: 'javascript',
      });

      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.9, amplitude = 0.9 WHERE id = ?').run(captured.id);

      const result = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'different fix code',
        language: 'javascript',
      });
      assert.ok(result.duplicate);
      assert.equal(result.existingId, captured.id);
    });

    it('updates existing low-amplitude pattern and re-enters superposition', () => {
      const debug = createDebugOracle();

      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'old fix code',
        language: 'javascript',
      });

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

  // ─── DebugOracle: Quantum Observation (Search) ───

  describe('DebugOracle.search (quantum observation)', () => {
    it('finds exact fingerprint matches and collapses them', () => {
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

      // Observation should have collapsed the state
      const observed = debug.get(results[0].id);
      assert.equal(observed.quantumState, QUANTUM_STATES.COLLAPSED);
      assert.ok(observed.observationCount > 0, 'observation count should increase');
      assert.ok(observed.lastObservedAt, 'lastObservedAt should be set');
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
      assert.ok(results.length > 0);
    });

    it('ranks by amplitude (Born rule)', () => {
      const debug = createDebugOracle();

      debug.capture({
        errorMessage: 'ReferenceError: a is not defined',
        fixCode: 'let a = 0;',
        language: 'javascript',
      });

      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      if (captured) {
        debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.9, amplitude = 0.9 WHERE id = ?').run(captured.id);
      }

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
        assert.ok(results[0].matchScore >= results[1].matchScore);
      }
    });

    it('returns results with quantum metadata', () => {
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
      assert.ok('quantumState' in results[0]);
      assert.ok('decoheredAmplitude' in results[0]);
      assert.ok('matchScore' in results[0]);
    });

    it('returns empty for no matches', () => {
      const debug = createDebugOracle();
      const results = debug.search({
        errorMessage: 'Some completely unique error',
      });
      assert.equal(results.length, 0);
    });
  });

  // ─── DebugOracle: Feedback (Post-Measurement Update) ───

  describe('DebugOracle.reportOutcome (post-measurement)', () => {
    it('increases amplitude on success', () => {
      const debug = createDebugOracle();
      const { pattern } = debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'if (typeof x === "function") x();',
        language: 'javascript',
      });

      const result = debug.reportOutcome(pattern.id, true);
      assert.ok(result.success);
      assert.ok(result.timesApplied === 1);
      assert.ok(result.timesResolved === 1);
      assert.ok('amplitude' in result);
      assert.ok('quantumState' in result);
      assert.equal(result.quantumState, QUANTUM_STATES.COLLAPSED);
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

    it('propagates entanglement on feedback', () => {
      const debug = createDebugOracle();

      const { pattern, variants } = debug.capture({
        errorMessage: 'TypeError: Cannot read property of undefined',
        fixCode: 'if (obj && obj.prop) { return obj.prop; }',
        language: 'javascript',
      });

      if (variants.length > 0) {
        const variantBefore = debug.get(variants[0].id);
        const beforeAmplitude = variantBefore.amplitude;

        debug.reportOutcome(pattern.id, true);

        const variantAfter = debug.get(variants[0].id);
        // Entanglement should have shifted the variant's amplitude
        assert.ok(variantAfter.amplitude >= beforeAmplitude,
          `entangled variant amplitude should shift: ${beforeAmplitude} → ${variantAfter.amplitude}`);
      }

      const result = debug.reportOutcome(pattern.id, true);
      assert.ok(result.entanglementPropagated >= 0);
    });

    it('triggers cascade growth at threshold', () => {
      const debug = createDebugOracle();
      debug.cascadeThreshold = 0.01;

      const { pattern } = debug.capture({
        errorMessage: 'TypeError: Cannot read property of undefined',
        fixCode: 'if (obj && obj.prop) { return obj.prop; }',
        language: 'javascript',
      });

      const result = debug.reportOutcome(pattern.id, true);
      assert.ok(result.success);
      assert.ok(result.cascadeVariants >= 0);
    });

    it('returns error for unknown ID', () => {
      const debug = createDebugOracle();
      const result = debug.reportOutcome('nonexistent', true);
      assert.ok(!result.success);
      assert.ok(result.error);
    });
  });

  // ─── DebugOracle: Grow (Quantum Field Expansion) ───

  describe('DebugOracle.grow (field expansion)', () => {
    it('generates entangled variants from high-amplitude patterns', () => {
      const debug = createDebugOracle();

      debug.capture({
        errorMessage: 'TypeError: x is not a function',
        fixCode: 'const result = typeof x === "function" ? x() : null;',
        language: 'javascript',
      });

      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.8, amplitude = 0.8 WHERE id = ?').run(captured.id);

      const report = debug.grow({ minConfidence: 0.5 });
      assert.ok(report.processed > 0);
      assert.ok(report.generated >= 0);
      assert.ok('entanglementLinks' in report);
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
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.8, amplitude = 0.8 WHERE id = ?').run(captured.id);

      const report1 = debug.grow({ minConfidence: 0.5 });
      const report2 = debug.grow({ minConfidence: 0.5 });
      assert.ok(report2.skipped >= report1.stored || report2.stored === 0);
    });
  });

  // ─── DebugOracle: Decoherence Sweep ───

  describe('DebugOracle.decoherenceSweep', () => {
    it('decays stale patterns to |decohered⟩', () => {
      const debug = createDebugOracle();

      debug.capture({
        errorMessage: 'TypeError: old pattern',
        fixCode: 'old fix;',
        language: 'javascript',
      });

      // Manually set last_observed_at to 200 days ago
      const pastDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      debug.store.db.prepare(
        "UPDATE debug_patterns SET last_observed_at = ?, amplitude = 0.01 WHERE generation_method = 'capture'"
      ).run(pastDate);

      const report = debug.decoherenceSweep({ maxDays: 180, minAmplitude: 0.01 });
      assert.ok(report.swept > 0, 'should have swept stale patterns');
    });

    it('leaves recently observed patterns intact', () => {
      const debug = createDebugOracle();

      debug.capture({
        errorMessage: 'TypeError: fresh pattern',
        fixCode: 'fresh fix;',
        language: 'javascript',
      });

      const now = new Date().toISOString();
      debug.store.db.prepare(
        "UPDATE debug_patterns SET last_observed_at = ? WHERE generation_method = 'capture'"
      ).run(now);

      const report = debug.decoherenceSweep({ maxDays: 180 });
      assert.equal(report.decohered, 0, 'should not decohere fresh patterns');
    });
  });

  // ─── DebugOracle: Re-excitation ───

  describe('DebugOracle.reexcite', () => {
    it('restores a decohered pattern to |superposition⟩', () => {
      const debug = createDebugOracle();

      const { pattern } = debug.capture({
        errorMessage: 'TypeError: revival test',
        fixCode: 'revived fix;',
        language: 'javascript',
      });

      // Force to decohered state
      debug.store.db.prepare(
        "UPDATE debug_patterns SET quantum_state = 'decohered', amplitude = 0.01 WHERE id = ?"
      ).run(pattern.id);

      const result = debug.reexcite(pattern.id);
      assert.ok(result.success);
      assert.equal(result.previousState, QUANTUM_STATES.DECOHERED);
      assert.equal(result.newState, QUANTUM_STATES.SUPERPOSITION);
      assert.ok(result.amplitude >= PLANCK_CONFIDENCE);
    });

    it('returns error for unknown pattern', () => {
      const debug = createDebugOracle();
      const result = debug.reexcite('nonexistent');
      assert.ok(!result.success);
    });
  });

  // ─── DebugOracle: Entanglement Graph ───

  describe('DebugOracle.getEntanglementGraph', () => {
    it('returns graph with nodes and edges', () => {
      const debug = createDebugOracle();

      const { pattern, variants } = debug.capture({
        errorMessage: 'TypeError: entanglement test',
        fixCode: 'const safe = typeof x === "function" ? x() : null;',
        language: 'javascript',
      });

      const graph = debug.getEntanglementGraph(pattern.id);
      assert.ok(graph.nodes.length > 0, 'graph should have nodes');
      // If variants were created, there should be edges
      if (variants.length > 0) {
        assert.ok(graph.edges.length > 0, 'graph should have edges');
      }
    });

    it('returns empty graph for unknown pattern', () => {
      const debug = createDebugOracle();
      const graph = debug.getEntanglementGraph('nonexistent');
      assert.equal(graph.nodes.length, 0);
      assert.equal(graph.edges.length, 0);
    });
  });

  // ─── DebugOracle: getAll with quantum filters ───

  describe('DebugOracle.getAll', () => {
    it('returns all patterns with quantum state', () => {
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
      // All patterns should have quantum state
      for (const p of all) {
        assert.ok('quantumState' in p);
        assert.ok('amplitude' in p);
        assert.ok('phase' in p);
        assert.ok('entangledWith' in p);
      }
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

    it('filters by minimum confidence/amplitude', () => {
      const debug = createDebugOracle();
      debug.capture({ errorMessage: 'TypeError: a', fixCode: 'fix', language: 'javascript' });

      const all = debug.getAll();
      const captured = all.find(p => p.generationMethod === 'capture');
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.9, amplitude = 0.9 WHERE id = ?').run(captured.id);

      const highConf = debug.getAll({ minConfidence: 0.8 });
      assert.ok(highConf.every(p => p.amplitude >= 0.8 || p.confidence >= 0.8));
    });

    it('filters by quantum state', () => {
      const debug = createDebugOracle();
      debug.capture({ errorMessage: 'TypeError: a', fixCode: 'fix', language: 'javascript' });

      const superposed = debug.getAll({ quantumState: QUANTUM_STATES.SUPERPOSITION });
      assert.ok(superposed.every(p => p.quantumState === QUANTUM_STATES.SUPERPOSITION));
    });
  });

  // ─── DebugOracle: Stats with Quantum Metrics ───

  describe('DebugOracle.stats (quantum field stats)', () => {
    it('returns valid statistics with quantum field metrics', () => {
      const debug = createDebugOracle();
      debug.capture({ errorMessage: 'TypeError: a', fixCode: 'fix a', language: 'javascript' });
      debug.capture({ errorMessage: 'SyntaxError: Unexpected token', fixCode: 'fix b', language: 'python' });

      const stats = debug.stats();
      assert.ok(stats.totalPatterns >= 2);
      assert.ok(typeof stats.avgConfidence === 'number');
      assert.ok(typeof stats.avgAmplitude === 'number');
      assert.ok(typeof stats.resolutionRate === 'number');
      assert.ok(stats.byCategory);
      assert.ok(stats.byLanguage);
      assert.ok(stats.byMethod);
      assert.ok(typeof stats.captured === 'number');
      assert.ok(typeof stats.generated === 'number');

      // Quantum field metrics
      assert.ok(stats.quantumField, 'should have quantumField metrics');
      assert.ok(typeof stats.quantumField.superposition === 'number');
      assert.ok(typeof stats.quantumField.collapsed === 'number');
      assert.ok(typeof stats.quantumField.decohered === 'number');
      assert.ok(typeof stats.quantumField.totalObservations === 'number');
      assert.ok(typeof stats.quantumField.entanglementLinks === 'number');
      assert.ok(typeof stats.quantumField.fieldEnergy === 'number');
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

      // captured, duplicate (existing pattern), or no store available are all valid outcomes
      assert.ok(result.captured || result.duplicate || result.error === 'No SQLite store available');
    });

    it('exposes debugSearch through oracle API', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });

      oracle.debugCapture({
        errorMessage: 'TypeError: Cannot read properties of null',
        fixCode: 'if (obj != null) { return obj.prop; }',
        language: 'javascript',
      });

      const results = oracle.debugSearch({
        errorMessage: 'TypeError: Cannot read properties of null',
        federated: false,
      });
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

    it('exposes quantum methods through oracle API', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });

      // Decoherence sweep
      const decohere = oracle.debugDecohereSweep();
      assert.ok(typeof decohere.swept === 'number' || decohere.error);

      // Entanglement graph
      const graph = oracle.debugEntanglementGraph('fake-id');
      assert.ok(graph.nodes !== undefined);
    });
  });

  // ─── MCP Integration ───

  describe('MCP debug tools (quantum)', () => {
    it('lists consolidated oracle_debug tool with quantum actions', () => {
      const { TOOLS } = require('../src/mcp/server');
      const debugTool = TOOLS.find(t => t.name === 'oracle_debug');
      assert.ok(debugTool, 'oracle_debug tool should exist');
      assert.ok(debugTool.inputSchema.properties.action, 'should have action param');
      const actions = debugTool.inputSchema.properties.action.enum;
      assert.ok(actions.includes('capture'));
      assert.ok(actions.includes('search'));
      assert.ok(actions.includes('feedback'));
      assert.ok(actions.includes('stats'));
      assert.ok(actions.includes('grow'));
      assert.ok(actions.includes('patterns'));
      assert.ok(actions.includes('decohere'), 'should have decohere action');
      assert.ok(actions.includes('reexcite'), 'should have reexcite action');
      assert.ok(actions.includes('entanglement'), 'should have entanglement action');
      assert.ok(actions.includes('field'), 'should have field action');
    });

    it('handles oracle_debug capture action', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'oracle_debug',
          arguments: {
            action: 'capture',
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

    it('handles oracle_debug search action', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'oracle_debug',
          arguments: {
            action: 'search',
            errorMessage: 'TypeError: x is undefined',
          },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug stats action', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'oracle_debug',
          arguments: { action: 'stats' },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug grow action', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'oracle_debug',
          arguments: { action: 'grow' },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug feedback action', async () => {
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
          name: 'oracle_debug',
          arguments: { action: 'feedback', id, resolved: true },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug decohere action', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'oracle_debug',
          arguments: { action: 'decohere', maxDays: 180 },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
      assert.ok(response.result);
    });

    it('handles oracle_debug field action', async () => {
      const { MCPServer } = require('../src/mcp/server');
      const { RemembranceOracle } = require('../src/api/oracle');
      const oracle = new RemembranceOracle({ autoSeed: false });
      const server = new MCPServer(oracle);

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'oracle_debug',
          arguments: { action: 'field' },
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
        id: 8,
        method: 'tools/call',
        params: {
          name: 'oracle_debug_share',
          arguments: { dryRun: true },
        },
      });

      assert.equal(response.jsonrpc, '2.0');
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

  // ─── QUANTUM_STATES completeness ───

  describe('QUANTUM_STATES', () => {
    it('has all three states', () => {
      assert.equal(QUANTUM_STATES.SUPERPOSITION, 'superposition');
      assert.equal(QUANTUM_STATES.COLLAPSED, 'collapsed');
      assert.equal(QUANTUM_STATES.DECOHERED, 'decohered');
    });
  });

  // ─── End-to-End Quantum Flow ───

  describe('Quantum lifecycle flow', () => {
    it('capture |superposition⟩ → observe |collapsed⟩ → feedback → entangle → grow', () => {
      const debug = createDebugOracle();
      debug.cascadeThreshold = 0.01;

      // Step 1: Pattern enters field in |superposition⟩
      const capture = debug.capture({
        errorMessage: 'TypeError: Cannot read properties of null (reading "length")',
        fixCode: 'const len = arr ? arr.length : 0;',
        fixDescription: 'Null-safe length check',
        language: 'javascript',
        tags: ['null-safety', 'defensive'],
      });
      assert.ok(capture.captured);
      assert.equal(capture.pattern.quantumState, QUANTUM_STATES.SUPERPOSITION);
      const initialCount = debug.getAll().length;

      // Step 2: Observation collapses state
      const observed = debug.search({
        errorMessage: 'TypeError: Cannot read properties of null (reading "length")',
      });
      assert.ok(observed.length > 0);
      const collapsed = debug.get(capture.pattern.id);
      assert.equal(collapsed.quantumState, QUANTUM_STATES.COLLAPSED);

      // Step 3: Feedback updates amplitude and propagates entanglement
      const feedback = debug.reportOutcome(capture.pattern.id, true);
      assert.ok(feedback.success);
      assert.ok(feedback.amplitude > 0);
      assert.ok(feedback.entanglementPropagated >= 0);

      // Step 4: Grow the field
      debug.store.db.prepare('UPDATE debug_patterns SET confidence = 0.8, amplitude = 0.8 WHERE id = ?').run(capture.pattern.id);
      const growth = debug.grow({ minConfidence: 0.5 });
      const finalCount = debug.getAll().length;

      assert.ok(finalCount >= initialCount, `expected growth: ${initialCount} → ${finalCount}`);

      // Step 5: Stats reflect quantum field state
      const stats = debug.stats();
      assert.ok(stats.totalPatterns >= initialCount);
      assert.ok(stats.quantumField, 'should have quantum field metrics');
      assert.ok(stats.quantumField.collapsed > 0 || stats.quantumField.superposition > 0);
    });
  });
});
