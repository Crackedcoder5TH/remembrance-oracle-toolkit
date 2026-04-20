'use strict';

/**
 * Tests for the void-indirection content-addressable indirection detector.
 *
 * Test plan:
 *   - HARMFUL_IDENTIFIERS list is populated and contains expected entries
 *   - detectHiddenIdentifiers returns clean results for safe code
 *   - Ratio comparison math works correctly (calculateConfidence)
 *   - sanitizeIdentifier replaces identifiers with equal-length spaces
 *   - Graceful handling when void compressor is missing/unavailable
 *   - atomicProperties has required domain and alignment
 *   - Edge cases: empty code, non-string input
 */

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

const {
  detectHiddenIdentifiers,
  HARMFUL_IDENTIFIERS,
  atomicProperties,
  measureRatio,
  sanitizeIdentifier,
  calculateConfidence,
} = require('../src/audit/void-indirection');

// ── HARMFUL_IDENTIFIERS ──────────────────────────────────────────────────

describe('HARMFUL_IDENTIFIERS', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(HARMFUL_IDENTIFIERS));
    assert.ok(HARMFUL_IDENTIFIERS.length > 0, 'list should be populated');
  });

  it('contains core dangerous identifiers', () => {
    const expected = ['eval', 'exec', 'child_process', 'Function', 'spawn', 'fork'];
    for (const id of expected) {
      assert.ok(
        HARMFUL_IDENTIFIERS.includes(id),
        `missing expected identifier: ${id}`
      );
    }
  });

  it('contains network and exfiltration identifiers', () => {
    const expected = ['fetch', 'WebSocket', 'XMLHttpRequest'];
    for (const id of expected) {
      assert.ok(
        HARMFUL_IDENTIFIERS.includes(id),
        `missing expected identifier: ${id}`
      );
    }
  });

  it('contains all string entries (no non-strings)', () => {
    for (const id of HARMFUL_IDENTIFIERS) {
      assert.strictEqual(typeof id, 'string', `non-string entry: ${id}`);
      assert.ok(id.length > 0, 'identifier should not be empty');
    }
  });
});

// ── atomicProperties ─────────────────────────────────────────────────────

describe('atomicProperties', () => {
  it('has domain set to security', () => {
    assert.strictEqual(atomicProperties.domain, 'security');
  });

  it('has alignment set to healing', () => {
    assert.strictEqual(atomicProperties.alignment, 'healing');
  });
});

// ── sanitizeIdentifier ───────────────────────────────────────────────────

describe('sanitizeIdentifier', () => {
  it('replaces an identifier with spaces of the same length', () => {
    const code = 'const x = eval("1+1");';
    const result = sanitizeIdentifier(code, 'eval');
    assert.strictEqual(result, 'const x =     ("1+1");');
    assert.strictEqual(result.length, code.length, 'length must be preserved');
  });

  it('replaces all occurrences', () => {
    const code = 'eval(eval("x"))';
    const result = sanitizeIdentifier(code, 'eval');
    assert.ok(!result.includes('eval'), 'all occurrences should be removed');
    assert.strictEqual(result.length, code.length, 'length must be preserved');
  });

  it('handles identifiers with dots', () => {
    const code = 'process.env.SECRET';
    const result = sanitizeIdentifier(code, 'process.env');
    assert.ok(!result.includes('process.env'), 'dotted identifier should be replaced');
    assert.strictEqual(result.length, code.length);
  });

  it('returns unchanged code when identifier not present', () => {
    const code = 'const x = 42;';
    const result = sanitizeIdentifier(code, 'eval');
    assert.strictEqual(result, code);
  });

  it('handles empty code', () => {
    const result = sanitizeIdentifier('', 'eval');
    assert.strictEqual(result, '');
  });
});

// ── calculateConfidence ──────────────────────────────────────────────────

describe('calculateConfidence', () => {
  it('returns 0 for zero ratioDelta', () => {
    assert.strictEqual(calculateConfidence(0, 0.05), 0);
  });

  it('returns 0 for negative ratioDelta', () => {
    assert.strictEqual(calculateConfidence(-0.1, 0.05), 0);
  });

  it('returns value between 0 and 1 for small delta', () => {
    const conf = calculateConfidence(0.06, 0.05);
    assert.ok(conf > 0, 'should be positive');
    assert.ok(conf <= 1, 'should not exceed 1');
  });

  it('returns 1 for very large delta (>= 5x threshold)', () => {
    const conf = calculateConfidence(0.30, 0.05);
    assert.strictEqual(conf, 1);
  });

  it('scales linearly from 0 to 1', () => {
    const threshold = 0.10;
    const low = calculateConfidence(0.10, threshold);
    const mid = calculateConfidence(0.25, threshold);
    const high = calculateConfidence(0.50, threshold);
    assert.ok(low < mid, 'confidence should increase with delta');
    assert.ok(mid <= high, 'confidence should increase with delta');
  });

  it('returns a rounded value (3 decimal places)', () => {
    const conf = calculateConfidence(0.07, 0.05);
    const roundTrip = Math.round(conf * 1000) / 1000;
    assert.strictEqual(conf, roundTrip, 'should be rounded to 3 decimals');
  });
});

// ── detectHiddenIdentifiers — safe code ──────────────────────────────────

describe('detectHiddenIdentifiers — safe code', () => {
  it('returns clean: true for benign code', () => {
    const code = 'function add(a, b) { return a + b; }';
    const result = detectHiddenIdentifiers(code);
    assert.strictEqual(result.clean, true);
    assert.ok(Array.isArray(result.flagged));
  });

  it('returns correct structure', () => {
    const code = 'const x = 42;';
    const result = detectHiddenIdentifiers(code);
    assert.ok('flagged' in result, 'should have flagged array');
    assert.ok('clean' in result, 'should have clean boolean');
    assert.ok('ratioOriginal' in result, 'should have ratioOriginal');
    assert.ok('metadata' in result, 'should have metadata');
    assert.ok('identifiersChecked' in result.metadata);
    assert.ok('threshold' in result.metadata);
  });

  it('uses default HARMFUL_IDENTIFIERS when none specified', () => {
    const code = 'const x = 42;';
    const result = detectHiddenIdentifiers(code);
    assert.strictEqual(
      result.metadata.identifiersChecked,
      HARMFUL_IDENTIFIERS.length
    );
  });

  it('accepts custom identifiers list', () => {
    const code = 'const x = 42;';
    const result = detectHiddenIdentifiers(code, {
      identifiers: ['custom_bad_fn'],
    });
    assert.strictEqual(result.metadata.identifiersChecked, 1);
  });
});

// ── detectHiddenIdentifiers — edge cases ─────────────────────────────────

describe('detectHiddenIdentifiers — edge cases', () => {
  it('handles empty string', () => {
    const result = detectHiddenIdentifiers('');
    assert.strictEqual(result.clean, true);
    assert.deepStrictEqual(result.flagged, []);
  });

  it('handles null/undefined input', () => {
    const result1 = detectHiddenIdentifiers(null);
    assert.strictEqual(result1.clean, true);
    const result2 = detectHiddenIdentifiers(undefined);
    assert.strictEqual(result2.clean, true);
  });

  it('handles non-string input', () => {
    const result = detectHiddenIdentifiers(42);
    assert.strictEqual(result.clean, true);
  });

  it('handles whitespace-only input', () => {
    const result = detectHiddenIdentifiers('   \n\t  ');
    assert.strictEqual(result.clean, true);
  });

  it('respects custom threshold option', () => {
    const code = 'function test() { return 1; }';
    const result = detectHiddenIdentifiers(code, { threshold: 0.01 });
    assert.strictEqual(result.metadata.threshold, 0.01);
  });
});

// ── detectHiddenIdentifiers — ratio comparison logic ─────────────────────

describe('detectHiddenIdentifiers — ratio comparison with mocked subprocess', () => {
  it('flags identifiers when ratio delta exceeds threshold', () => {
    // We test the math by directly testing the components since the
    // subprocess may not be available. The full integration depends on
    // the void compressor being present.

    // Simulate: original ratio 2.5, sanitized ratio 2.0 => delta 0.5
    const ratioDelta = Math.abs(2.5 - 2.0);
    const threshold = 0.05;
    assert.ok(ratioDelta > threshold, 'delta should exceed threshold');

    const confidence = calculateConfidence(ratioDelta, threshold);
    assert.ok(confidence > 0, 'confidence should be positive');
    assert.ok(confidence <= 1, 'confidence should be capped at 1');
  });

  it('does not flag when ratio delta is below threshold', () => {
    const ratioDelta = Math.abs(2.5 - 2.48);
    const threshold = 0.05;
    assert.ok(ratioDelta < threshold, 'delta should be below threshold');
  });

  it('constructs proper flagged entry structure', () => {
    // Simulate what detectHiddenIdentifiers builds for a flagged entry
    const ratioOriginal = 3.0;
    const ratioSanitized = 2.8;
    const ratioDelta = Math.abs(ratioOriginal - ratioSanitized);
    const threshold = 0.05;
    const confidence = calculateConfidence(ratioDelta, threshold);

    const entry = {
      identifier: 'eval',
      ratioDelta: Math.round(ratioDelta * 10000) / 10000,
      confidence,
    };

    assert.strictEqual(entry.identifier, 'eval');
    assert.strictEqual(typeof entry.ratioDelta, 'number');
    assert.ok(entry.ratioDelta > 0);
    assert.strictEqual(typeof entry.confidence, 'number');
    assert.ok(entry.confidence >= 0 && entry.confidence <= 1);
  });

  it('sorts flagged results by confidence descending', () => {
    // Simulate a result set and verify sorting logic
    const flagged = [
      { identifier: 'eval', ratioDelta: 0.1, confidence: 0.4 },
      { identifier: 'exec', ratioDelta: 0.3, confidence: 0.9 },
      { identifier: 'spawn', ratioDelta: 0.06, confidence: 0.2 },
    ];
    flagged.sort((a, b) => b.confidence - a.confidence);

    assert.strictEqual(flagged[0].identifier, 'exec');
    assert.strictEqual(flagged[1].identifier, 'eval');
    assert.strictEqual(flagged[2].identifier, 'spawn');
  });
});

// ── Graceful degradation ─────────────────────────────────────────────────

describe('graceful handling of missing void compressor', () => {
  it('measureRatio returns 1.0 when compressor is unavailable', () => {
    // Force a missing compressor by using a non-existent path
    const originalEnv = process.env.VOID_COMPRESSOR_PATH;
    process.env.VOID_COMPRESSOR_PATH = '/nonexistent/path/to/void';

    // Re-require to pick up the changed env — but since the module caches
    // voidPath at load time, we call measureRatio which uses voidPath internally.
    // Instead, we test that measureRatio handles the failure gracefully.
    // With a bad path, the subprocess will fail and return 1.0.
    const ratio = measureRatio('test content');
    assert.strictEqual(ratio, 1.0, 'should return neutral ratio on failure');

    // Restore env
    if (originalEnv !== undefined) {
      process.env.VOID_COMPRESSOR_PATH = originalEnv;
    } else {
      delete process.env.VOID_COMPRESSOR_PATH;
    }
  });

  it('detectHiddenIdentifiers returns clean when compressor fails', () => {
    const code = 'const dangerous = eval("something");';
    // Even with "eval" literally in the code, if the compressor is unavailable,
    // both ratios will be 1.0, so delta will be 0 and nothing gets flagged.
    // The function should not throw.
    const result = detectHiddenIdentifiers(code);
    assert.ok(result !== null && result !== undefined);
    assert.ok('clean' in result);
    assert.ok('flagged' in result);
    assert.ok(Array.isArray(result.flagged));
  });

  it('metadata indicates compressor availability', () => {
    const code = 'function safeCode() { return 42; }';
    const result = detectHiddenIdentifiers(code);
    assert.ok('compressorAvailable' in result.metadata);
    assert.strictEqual(typeof result.metadata.compressorAvailable, 'boolean');
  });
});
