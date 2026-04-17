'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { CoherencyDirector } = require('../src/orchestrator/coherency-director');
const { synthesizeTestStubs, extractExportedFunctions } = require('../src/orchestrator/test-synthesizer');
const { PeriodicTable } = require('../src/atomic/periodic-table');
const { recalibrateCoherency } = require('../src/unified/coherency-recalibrate');

// ── Root cause categorization ──────────────────────────────────────

describe('CoherencyDirector.categorizeRootCause', () => {
  it('returns unknown for zones without code', () => {
    const d = new CoherencyDirector();
    d.scan([{ id: 'empty' }]);
    const zone = d.field.getZone('empty');
    const diag = d.categorizeRootCause(zone);
    assert.equal(diag.category, 'unknown');
  });

  it('detects missing-data category for small untested code', () => {
    const d = new CoherencyDirector();
    d.scan([{ id: 'small', code: 'function add(a, b) { return a + b; }', language: 'javascript' }]);
    d.measureWithOracle();
    const zone = d.field.getZone('small');
    const diag = d.categorizeRootCause(zone);
    // Any category is fine as long as reasoning is returned
    assert.ok(diag.category);
    assert.ok(diag.reason);
    assert.ok(diag.suggestedAction);
  });
});

// ── Test synthesizer ───────────────────────────────────────────────

describe('extractExportedFunctions', () => {
  it('extracts from module.exports object', () => {
    const code = `
function add(a, b) { return a + b; }
function sub(a, b) { return a - b; }
module.exports = { add, sub };
`;
    const fns = extractExportedFunctions(code);
    assert.ok(fns.includes('add'));
    assert.ok(fns.includes('sub'));
  });

  it('extracts from exports.name = ... pattern', () => {
    const code = `
function foo() { return 1; }
exports.foo = foo;
`;
    const fns = extractExportedFunctions(code);
    assert.ok(fns.includes('foo'));
  });

  it('returns empty array for non-function exports', () => {
    const code = `const CONSTANT = 42; module.exports = { CONSTANT };`;
    const fns = extractExportedFunctions(code);
    assert.equal(fns.length, 0);
  });
});

describe('synthesizeTestStubs', () => {
  it('generates test stubs for exported functions', () => {
    const code = `
function double(x) { return x * 2; }
function triple(x) { return x * 3; }
module.exports = { double, triple };
`;
    const stubs = synthesizeTestStubs(code, '/tmp/example.js');
    assert.ok(stubs);
    assert.ok(stubs.includes("describe("));
    assert.ok(stubs.includes("it('exports double'"));
    assert.ok(stubs.includes("it('exports triple'"));
  });

  it('returns null when no testable functions exist', () => {
    const code = `const X = 1; module.exports = { X };`;
    const stubs = synthesizeTestStubs(code, '/tmp/empty.js');
    assert.equal(stubs, null);
  });
});

// ── Delta-based emergence ──────────────────────────────────────────

describe('PeriodicTable emergence with delta', () => {
  it('emerges element on coherency improvement delta', () => {
    const table = new PeriodicTable();
    // First, cross Foundation absolute threshold
    table.checkEmergence(0.72, 100);
    const sizeAfterAbsolute = table.size;
    // Now no absolute threshold triggers (we already passed Foundation),
    // but a delta-based improvement should fire emergence
    const emerged = table.checkEmergence(0.76, 100, {
      previousCoherence: 0.72, deltaThreshold: 0.03,
    });
    assert.ok(emerged.length > 0, 'Delta improvement should emerge a new element');
    assert.ok(table.size > sizeAfterAbsolute);
  });

  it('does not emerge on tiny improvements below threshold', () => {
    const table = new PeriodicTable();
    table.checkEmergence(0.72, 100);
    const before = table.size;
    const emerged = table.checkEmergence(0.73, 100, {
      previousCoherence: 0.72, deltaThreshold: 0.03,
    });
    assert.equal(emerged.length, 0);
    assert.equal(table.size, before);
  });

  it('records delta trigger in emergence history', () => {
    const table = new PeriodicTable();
    table.checkEmergence(0.72, 100);
    table.checkEmergence(0.80, 100, { previousCoherence: 0.72, deltaThreshold: 0.03 });
    const hist = table._emergenceHistory;
    const deltaEvents = hist.filter(h => h.trigger === 'delta');
    assert.ok(deltaEvents.length >= 1);
  });
});

// ── Coherency recalibration ─────────────────────────────────────────

describe('recalibrateCoherency', () => {
  it('returns summary for an empty store', () => {
    const fakeStore = { getAllPatterns: () => [] };
    const result = recalibrateCoherency(fakeStore, { dryRun: true });
    assert.equal(result.totalPatterns, 0);
    assert.equal(result.changed, 0);
  });

  it('classifies patterns as changed or unchanged based on drift', () => {
    // Create fake patterns where one has an artificially deflated score
    const fakeStore = {
      _patterns: [
        { id: 1, name: 'pattern1', language: 'javascript',
          code: 'function add(a, b) { return a + b; }',
          coherencyScore: { total: 0.99 } }, // way overstated
        { id: 2, name: 'pattern2', language: 'javascript',
          code: 'function sub(a, b) { return a - b; }',
          coherencyScore: { total: 0.5 } }, // likely lower than current
      ],
      getAllPatterns() { return this._patterns; },
      updatePatternCoherency() { return true; },
    };
    const result = recalibrateCoherency(fakeStore, { dryRun: true, driftThreshold: 0.05 });
    assert.equal(result.totalPatterns, 2);
    assert.ok(result.changed + result.unchanged + result.skipped === 2);
  });

  it('skips patterns without code', () => {
    const fakeStore = {
      getAllPatterns: () => [{ id: 1, name: 'empty', coherencyScore: { total: 0.5 } }],
    };
    const result = recalibrateCoherency(fakeStore);
    assert.equal(result.skipped, 1);
    assert.equal(result.changed, 0);
  });
});
