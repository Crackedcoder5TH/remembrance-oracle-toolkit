/**
 * Seed Helpers — loads seed data from JSON files and provides
 * seeding functions for the pattern library.
 */
const { readFileSync } = require('fs');
const path = require('path');

function loadJSON(filename) {
  return JSON.parse(readFileSync(path.join(__dirname, filename), 'utf-8'));
}

// ─── Data loaders (lazy, cached) ───

let _seeds, _extendedSeeds, _productionSeeds, _productionSeeds2,
    _productionSeeds3, _productionSeeds4, _pythonSeeds, _goSeeds, _rustSeeds;

function getSeeds() {
  if (!_seeds) _seeds = loadJSON('seeds.json');
  return _seeds;
}

function getExtendedSeeds() {
  if (!_extendedSeeds) _extendedSeeds = loadJSON('seeds-extended.json');
  return _extendedSeeds;
}

function getProductionSeeds() {
  if (!_productionSeeds) _productionSeeds = loadJSON('seeds-production.json');
  return _productionSeeds;
}

function getProductionSeeds2() {
  if (!_productionSeeds2) _productionSeeds2 = loadJSON('seeds-production-2.json');
  return _productionSeeds2;
}

function getProductionSeeds3() {
  if (!_productionSeeds3) _productionSeeds3 = loadJSON('seeds-production-3.json');
  return _productionSeeds3;
}

function getProductionSeeds4() {
  if (!_productionSeeds4) _productionSeeds4 = loadJSON('seeds-production-4.json');
  return _productionSeeds4;
}

function getPythonSeeds() {
  if (!_pythonSeeds) _pythonSeeds = loadJSON('seeds-python.json');
  return _pythonSeeds;
}

function getGoSeeds() {
  if (!_goSeeds) _goSeeds = loadJSON('seeds-go.json');
  return _goSeeds;
}

function getRustSeeds() {
  if (!_rustSeeds) _rustSeeds = loadJSON('seeds-rust.json');
  return _rustSeeds;
}

// ─── Seeding functions ───

/**
 * Seed the pattern library with all built-in patterns.
 * Skips patterns that already exist (by name match).
 */
function seedLibrary(oracle) {
  const SEEDS = getSeeds();
  const existing = oracle.patterns.getAll();
  const existingNames = new Set(existing.map(p => p.name));

  let registered = 0, skipped = 0, failed = 0;

  for (const seed of SEEDS) {
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    const result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
    } else {
      failed++;
      console.log(`  [FAIL] ${seed.name}: ${result.reason}`);
    }
  }

  return { registered, skipped, failed, total: SEEDS.length };
}

/**
 * Seed native patterns for non-JS languages (Python, Go, Rust).
 * These are idiomatic patterns, not transpiled from JS.
 */
function seedNativeLibrary(oracle, options = {}) {
  const existing = oracle.patterns.getAll();
  const existingNames = new Set(existing.map(p => p.name));

  let allSeeds = [];
  try { allSeeds.push(...getPythonSeeds()); } catch { /* no python seeds */ }
  try { allSeeds.push(...getGoSeeds()); } catch { /* no go seeds */ }
  try { allSeeds.push(...getRustSeeds()); } catch { /* no rust seeds */ }

  let registered = 0, skipped = 0, failed = 0;

  for (const seed of allSeeds) {
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    const result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
      if (options.verbose) console.log(`  [OK] ${seed.name} (${seed.language})`);
    } else {
      failed++;
      if (options.verbose) console.log(`  [FAIL] ${seed.name}: ${result.reason}`);
    }
  }

  return { registered, skipped, failed, total: allSeeds.length };
}

/**
 * Seed the pattern library with all extended patterns.
 * Skips patterns that already exist (by name match).
 */
function seedExtendedLibrary(oracle, { verbose = false } = {}) {
  const EXTENDED_SEEDS = getExtendedSeeds();
  const existing = oracle.patterns.getAll();
  const existingNames = new Set(existing.map(p => p.name));

  let registered = 0, skipped = 0, failed = 0;
  const failures = [];

  for (const seed of EXTENDED_SEEDS) {
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    const result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
      if (verbose) {
        console.log(`  [OK]   ${seed.name} — coherency ${result.validation.coherencyScore.total.toFixed(3)}`);
      }
    } else {
      failed++;
      failures.push({ name: seed.name, reason: result.reason });
      if (verbose || process.env.ORACLE_DEBUG) console.log(`  [FAIL] ${seed.name}: ${result.reason}`);
    }
  }

  return { registered, skipped, failed, failures, total: EXTENDED_SEEDS.length };
}

/**
 * Seed production patterns batch 3.
 */
function seedProductionLibrary3(oracle, options = {}) {
  const seeds = getProductionSeeds3();
  const existing = oracle.patterns.getAll();
  const existingNames = new Set(existing.map(p => p.name));

  let registered = 0, skipped = 0, failed = 0;

  for (const seed of seeds) {
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    const result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
      if (options.verbose) console.log(`  [OK] ${seed.name} (${seed.language})`);
    } else {
      failed++;
      if (options.verbose) console.log(`  [FAIL] ${seed.name}: ${result.reason}`);
    }
  }

  return { registered, skipped, failed, total: seeds.length };
}

/**
 * Seed production patterns batch 4.
 */
function seedProductionLibrary4(oracle, options) {
  options = options || {};
  var seeds = getProductionSeeds4();
  var existing = oracle.patterns.getAll();
  var existingNames = new Set(existing.map(function(p) { return p.name; }));

  var registered = 0, skipped = 0, failed = 0;

  for (var i = 0; i < seeds.length; i++) {
    var seed = seeds[i];
    if (existingNames.has(seed.name)) {
      skipped++;
      continue;
    }

    var result = oracle.registerPattern(seed);
    if (result.registered) {
      registered++;
      if (options.verbose) console.log('  [OK] ' + seed.name + ' (' + seed.language + ')');
    } else {
      failed++;
      if (options.verbose) console.log('  [FAIL] ' + seed.name + ': ' + result.reason);
    }
  }

  return { registered: registered, skipped: skipped, failed: failed, total: seeds.length };
}

module.exports = {
  // Data accessors
  getSeeds,
  getExtendedSeeds,
  getProductionSeeds,
  getProductionSeeds2,
  getProductionSeeds3,
  getProductionSeeds4,
  getPythonSeeds,
  getGoSeeds,
  getRustSeeds,
  // Seeding functions
  seedLibrary,
  seedNativeLibrary,
  seedExtendedLibrary,
  seedProductionLibrary3,
  seedProductionLibrary4,
};

// ─── Backward-compatible named exports (must come AFTER module.exports assignment) ───

Object.defineProperty(module.exports, 'SEEDS', { get: getSeeds, enumerable: true });
Object.defineProperty(module.exports, 'EXTENDED_SEEDS', { get: getExtendedSeeds, enumerable: true });
Object.defineProperty(module.exports, 'PYTHON_SEEDS', { get: getPythonSeeds, enumerable: true });
Object.defineProperty(module.exports, 'GO_SEEDS', { get: getGoSeeds, enumerable: true });
Object.defineProperty(module.exports, 'RUST_SEEDS', { get: getRustSeeds, enumerable: true });
