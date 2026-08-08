'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

/**
 * Shared test helpers — extracted from duplicated patterns across 12+ test files.
 * Eliminates ~300 lines of copy-pasted setup code.
 */

// ─── Gated fixture mutations ────────────────────────────────────────────────
// Tests write and remove tmpdir/fixture state constantly; under the fractal
// covenant's byte scale every mutation rides a sealed gate. These three verbs
// are the mutation surface for tests/ — call sites route through them instead
// of touching fs directly, exactly-passed arguments, zero semantic change.

const _fixtureGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

const _writeGated = requireGate((gate, file, data, opts) => fs.writeFileSync(file, data, opts));
const _rmGated = requireGate((gate, target, opts) => fs.rmSync(target, opts));
const _unlinkGated = requireGate((gate, file) => fs.unlinkSync(file));

const writeFixture = (file, data, opts) => _writeGated(_fixtureGate(), file, data, opts);
const rmFixture = (target, opts) => _rmGated(_fixtureGate(), target, opts);
const unlinkFixture = (file) => _unlinkGated(_fixtureGate(), file);

// ─── Temp Directory ─────────────────────────────────────────────────────────

const makeTempDir = (suffix = 'test') => {
  const dir = path.join(
    os.tmpdir(),
    `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const cleanTempDir = (dir) => {
  if (dir && fs.existsSync(dir)) {
    rmFixture(dir, { recursive: true, force: true });
  }
};

// ─── Test Pattern Factory ───────────────────────────────────────────────────

const makePattern = (overrides = {}) => {
  return {
    id: overrides.id || `p-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'test-pattern',
    language: overrides.language || 'javascript',
    code: overrides.code || 'function add(a, b) {\n  return a + b;\n}',
    coherencyScore: overrides.coherencyScore || { total: 0.85 },
    usageCount: overrides.usageCount ?? 0,
    successCount: overrides.successCount ?? 0,
    timestamp: overrides.timestamp || new Date().toISOString(),
    createdAt: overrides.createdAt || new Date().toISOString(),
    lastUsed: overrides.lastUsed || null,
    tags: overrides.tags || ['utility'],
    evolutionHistory: overrides.evolutionHistory || [],
    description: overrides.description || 'test pattern',
    reliability: overrides.reliability ?? 0.5,
  };
};

// ─── Mock Oracle Factory ────────────────────────────────────────────────────

const createMockOracle = (patterns = [], opts = {}) => {
  const updates = [];
  const events = [];
  const listeners = [];
  const candidates = opts.candidates || [];

  const mock = {
    patterns: {
      getAll: () => patterns,
      update: (id, data) => {
        updates.push({ id, ...data });
        const p = patterns.find(x => x.id === id);
        if (p) Object.assign(p, data);
        return p;
      },
      getCandidates: () => candidates,
      candidateSummary: () => ({ total: candidates.length }),
      _sqlite: null,
    },
    store: {
      getSQLiteStore: () => null,
      getAll: () => [],
      summary: () => ({ totalEntries: patterns.length }),
    },
    on: (listener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    _emit: (event) => {
      events.push(event);
      for (const l of listeners) {
        try { l(event); } catch {}
      }
    },
    _listeners: listeners,
    _updates: updates,
    _events: events,
    autoPromote: () => ({ promoted: 0, skipped: 0, vetoed: 0, total: 0 }),
    deepClean: () => ({ removed: 0, duplicates: 0, stubs: 0, tooShort: 0, remaining: patterns.length }),
    retagAll: () => ({ total: patterns.length, enriched: 0, totalTagsAdded: 0 }),
    recycle: () => ({ healed: 0 }),
    patternStats: () => ({ totalPatterns: patterns.length }),
    stats: () => ({ totalEntries: patterns.length }),
    selfEvolve: function(evolveOpts) {
      const { evolve } = require('../src/evolution/evolution');
      return evolve(this, evolveOpts);
    },
  };

  return mock;
};

// ─── Real Oracle Factory ────────────────────────────────────────────────────

const createTestOracle = (opts = {}) => {
  const { RemembranceOracle } = require('../src/api/oracle');
  const tmpDir = makeTempDir(opts.prefix || 'oracle-test');
  const oracle = new RemembranceOracle({
    baseDir: tmpDir,
    autoSeed: false,
    autoGrow: false,
    ...opts,
  });
  return { oracle, tmpDir };
};

// ─── Isolated Field ─────────────────────────────────────────────────────────

/**
 * Give the calling suite its OWN Living Remembrance field — fresh state,
 * persisted to a tmpdir, with the shared side channels (field-memory,
 * live-field HTTP bridge) disabled. Kills test order-dependence: field
 * assertions stop racing every other process that contributes to the
 * canonical entropy.json. The LRE physics are identical; only who holds
 * the state changes.
 *
 *   const { restore } = isolateField();   // in before()
 *   restore();                            // in after()
 */
const isolateField = () => {
  const fc = require('../src/core/field-coupling');
  const { LivingRemembranceEngine } = require('../src/core/living-remembrance');
  const dir = makeTempDir('field');
  const engine = new LivingRemembranceEngine({ persistPath: path.join(dir, 'entropy.json') });
  fc._setEngine(engine);
  return { engine, restore: () => { fc._setEngine(null); cleanTempDir(dir); } };
};

// ─── Test Pattern Registration ──────────────────────────────────────────────

const registerTestPattern = (oracle, overrides = {}) => {
  const code = overrides.code || 'function add(a, b) { return a + b; }';
  const testCode = overrides.testCode || `
const assert = require('assert');
const result = (${code.includes('function') ? code.match(/function\s+(\w+)/)?.[1] || 'add' : 'fn'})(1, 2);
assert.strictEqual(result, 3);
`;
  return oracle.submit({
    code,
    testCode,
    language: overrides.language || 'javascript',
    name: overrides.name || `test-${Date.now()}`,
    tags: overrides.tags || ['test'],
    description: overrides.description || 'test pattern',
  });
};

module.exports = {
  makeTempDir,
  cleanTempDir,
  makePattern,
  createMockOracle,
  createTestOracle,
  registerTestPattern,
  isolateField,
  writeFixture,
  rmFixture,
  unlinkFixture,
};
