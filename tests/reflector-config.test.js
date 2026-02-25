const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const {
  CENTRAL_DEFAULTS,
  getCentralConfigPath,
  loadCentralConfig,
  saveCentralConfig,
  setCentralValue,
  getCentralValue,
  resetCentralConfig,
  validateConfig,
  toEngineConfig,
  listConfigKeys,
  formatCentralConfig,
  deepMerge,
  deepClone,
  setNestedValue,
  getNestedValue,
} = require('../src/reflector/scoring');

// ─── Helpers ───

function createTmpDir() {
  const dir = join(tmpdir(), `config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Defaults Tests ───

describe('Config — CENTRAL_DEFAULTS', () => {
  it('should have all required sections', () => {
    assert.ok(CENTRAL_DEFAULTS.thresholds);
    assert.ok(CENTRAL_DEFAULTS.scanning);
    assert.ok(CENTRAL_DEFAULTS.healing);
    assert.ok(CENTRAL_DEFAULTS.safety);
    assert.ok(CENTRAL_DEFAULTS.scoring);
    assert.ok(CENTRAL_DEFAULTS.schedule);
    assert.ok(CENTRAL_DEFAULTS.github);
    assert.ok(CENTRAL_DEFAULTS.logging);
  });

  it('should have valid threshold values', () => {
    assert.ok(CENTRAL_DEFAULTS.thresholds.minCoherence >= 0);
    assert.ok(CENTRAL_DEFAULTS.thresholds.minCoherence <= 1);
    assert.ok(CENTRAL_DEFAULTS.thresholds.autoMergeThreshold >= 0);
    assert.ok(CENTRAL_DEFAULTS.thresholds.autoMergeThreshold <= 1);
  });

  it('should have scoring weights that sum to 1', () => {
    const sum = Object.values(CENTRAL_DEFAULTS.scoring).reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.01);
  });

  it('should include common extensions', () => {
    assert.ok(CENTRAL_DEFAULTS.scanning.includeExtensions.includes('.js'));
    assert.ok(CENTRAL_DEFAULTS.scanning.includeExtensions.includes('.ts'));
    assert.ok(CENTRAL_DEFAULTS.scanning.includeExtensions.includes('.py'));
  });
});

// ─── Load / Save Tests ───

describe('Config — loadCentralConfig / saveCentralConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return defaults when no config file exists', () => {
    const config = loadCentralConfig(tmpDir);
    assert.deepEqual(config.thresholds, CENTRAL_DEFAULTS.thresholds);
    assert.deepEqual(config.scanning.includeExtensions, CENTRAL_DEFAULTS.scanning.includeExtensions);
  });

  it('should save and load config', () => {
    const config = loadCentralConfig(tmpDir);
    config.thresholds.minCoherence = 0.8;
    saveCentralConfig(tmpDir, config);

    const loaded = loadCentralConfig(tmpDir);
    assert.equal(loaded.thresholds.minCoherence, 0.8);
  });

  it('should merge saved config with defaults', () => {
    // Save partial config
    saveCentralConfig(tmpDir, { thresholds: { minCoherence: 0.5 } });
    const loaded = loadCentralConfig(tmpDir);
    // Custom value preserved
    assert.equal(loaded.thresholds.minCoherence, 0.5);
    // Default values filled in
    assert.equal(loaded.thresholds.autoMergeThreshold, CENTRAL_DEFAULTS.thresholds.autoMergeThreshold);
    assert.ok(loaded.scanning);
    assert.ok(loaded.safety);
  });

  it('should create .remembrance directory if missing', () => {
    const newDir = join(tmpDir, 'newrepo');
    mkdirSync(newDir);
    saveCentralConfig(newDir, { thresholds: { minCoherence: 0.9 } });
    assert.ok(existsSync(join(newDir, '.remembrance')));
  });

  it('should persist to correct path', () => {
    saveCentralConfig(tmpDir, CENTRAL_DEFAULTS);
    const configPath = getCentralConfigPath(tmpDir);
    assert.ok(existsSync(configPath));
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    assert.ok(raw.thresholds);
  });
});

// ─── Set / Get Value Tests ───

describe('Config — setCentralValue / getCentralValue', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should set a nested value using dot notation', () => {
    setCentralValue(tmpDir, 'thresholds.minCoherence', 0.85);
    const val = getCentralValue(tmpDir, 'thresholds.minCoherence');
    assert.equal(val, 0.85);
  });

  it('should set a boolean value', () => {
    setCentralValue(tmpDir, 'safety.autoRollback', false);
    assert.equal(getCentralValue(tmpDir, 'safety.autoRollback'), false);
  });

  it('should set an array value', () => {
    setCentralValue(tmpDir, 'scanning.excludeDirs', ['node_modules', '.git']);
    const val = getCentralValue(tmpDir, 'scanning.excludeDirs');
    assert.deepEqual(val, ['node_modules', '.git']);
  });

  it('should set a deep path', () => {
    setCentralValue(tmpDir, 'github.push', true);
    assert.equal(getCentralValue(tmpDir, 'github.push'), true);
  });

  it('should preserve other values when setting one', () => {
    setCentralValue(tmpDir, 'thresholds.minCoherence', 0.5);
    setCentralValue(tmpDir, 'thresholds.autoMergeThreshold', 0.8);
    assert.equal(getCentralValue(tmpDir, 'thresholds.minCoherence'), 0.5);
    assert.equal(getCentralValue(tmpDir, 'thresholds.autoMergeThreshold'), 0.8);
  });

  it('should return undefined for non-existent key', () => {
    const val = getCentralValue(tmpDir, 'nonexistent.key.path');
    assert.equal(val, undefined);
  });
});

// ─── Reset Tests ───

describe('Config — resetCentralConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should reset all to defaults', () => {
    setCentralValue(tmpDir, 'thresholds.minCoherence', 0.1);
    setCentralValue(tmpDir, 'safety.autoRollback', false);
    resetCentralConfig(tmpDir);
    const config = loadCentralConfig(tmpDir);
    assert.equal(config.thresholds.minCoherence, CENTRAL_DEFAULTS.thresholds.minCoherence);
    assert.equal(config.safety.autoRollback, CENTRAL_DEFAULTS.safety.autoRollback);
  });

  it('should reset a single section', () => {
    setCentralValue(tmpDir, 'thresholds.minCoherence', 0.1);
    setCentralValue(tmpDir, 'safety.autoRollback', false);
    resetCentralConfig(tmpDir, 'thresholds');
    const config = loadCentralConfig(tmpDir);
    assert.equal(config.thresholds.minCoherence, CENTRAL_DEFAULTS.thresholds.minCoherence);
    assert.equal(config.safety.autoRollback, false); // Not reset
  });
});

// ─── Validation Tests ───

describe('Config — validateConfig', () => {
  it('should validate defaults as valid', () => {
    const result = validateConfig(CENTRAL_DEFAULTS);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it('should detect invalid coherence threshold', () => {
    const config = deepClone(CENTRAL_DEFAULTS);
    config.thresholds.minCoherence = 1.5;
    const result = validateConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('minCoherence')));
  });

  it('should detect negative file limit', () => {
    const config = deepClone(CENTRAL_DEFAULTS);
    config.scanning.maxFilesPerRun = -1;
    const result = validateConfig(config);
    assert.equal(result.valid, false);
  });

  it('should detect invalid scoring weights sum', () => {
    const config = deepClone(CENTRAL_DEFAULTS);
    config.scoring.serfCoherence = 0.9;
    const result = validateConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('weights')));
  });

  it('should detect invalid backup strategy', () => {
    const config = deepClone(CENTRAL_DEFAULTS);
    config.safety.backupStrategy = 'invalid';
    const result = validateConfig(config);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('backupStrategy')));
  });
});

// ─── toEngineConfig Tests ───

describe('Config — toEngineConfig', () => {
  it('should convert central config to flat engine config', () => {
    const flat = toEngineConfig(CENTRAL_DEFAULTS);
    assert.equal(flat.minCoherence, 0.7);
    assert.equal(flat.autoMergeThreshold, 0.9);
    assert.equal(flat.maxFilesPerRun, 50);
    assert.equal(flat.maxSerfLoops, 3);
    assert.equal(flat.push, false);
    assert.equal(flat.openPR, false);
    assert.ok(flat.weights);
  });

  it('should map safety settings', () => {
    const flat = toEngineConfig(CENTRAL_DEFAULTS);
    assert.equal(flat.autoRollback, true);
    assert.equal(flat.requireApproval, false);
    assert.equal(flat.dryRunMode, false);
  });

  it('should include scanning config', () => {
    const flat = toEngineConfig(CENTRAL_DEFAULTS);
    assert.ok(Array.isArray(flat.includeExtensions));
    assert.ok(Array.isArray(flat.excludeDirs));
  });
});

// ─── listConfigKeys Tests ───

describe('Config — listConfigKeys', () => {
  it('should list all config keys', () => {
    const keys = listConfigKeys(CENTRAL_DEFAULTS);
    assert.ok(keys.length > 10);
    const keyNames = keys.map(k => k.key);
    assert.ok(keyNames.includes('thresholds.minCoherence'));
    assert.ok(keyNames.includes('safety.autoRollback'));
    assert.ok(keyNames.includes('scanning.maxFilesPerRun'));
  });

  it('should include type information', () => {
    const keys = listConfigKeys(CENTRAL_DEFAULTS);
    const minCoh = keys.find(k => k.key === 'thresholds.minCoherence');
    assert.equal(minCoh.type, 'number');
    const autoRoll = keys.find(k => k.key === 'safety.autoRollback');
    assert.equal(autoRoll.type, 'boolean');
  });

  it('should include section information', () => {
    const keys = listConfigKeys(CENTRAL_DEFAULTS);
    const minCoh = keys.find(k => k.key === 'thresholds.minCoherence');
    assert.equal(minCoh.section, 'thresholds');
  });
});

// ─── Utility Tests ───

describe('Config — deepMerge', () => {
  it('should merge nested objects', () => {
    const result = deepMerge({ a: { b: 1, c: 2 } }, { a: { b: 3 } });
    assert.equal(result.a.b, 3);
    assert.equal(result.a.c, 2);
  });

  it('should not mutate the original', () => {
    const target = { a: { b: 1 } };
    deepMerge(target, { a: { b: 2 } });
    assert.equal(target.a.b, 1);
  });

  it('should handle arrays (replace, not merge)', () => {
    const result = deepMerge({ a: [1, 2] }, { a: [3, 4, 5] });
    assert.deepEqual(result.a, [3, 4, 5]);
  });
});

describe('Config — deepClone', () => {
  it('should deep clone an object', () => {
    const original = { a: { b: [1, 2, 3] } };
    const clone = deepClone(original);
    clone.a.b.push(4);
    assert.equal(original.a.b.length, 3);
    assert.equal(clone.a.b.length, 4);
  });
});

describe('Config — setNestedValue / getNestedValue', () => {
  it('should set and get nested values', () => {
    const obj = {};
    setNestedValue(obj, 'a.b.c', 42);
    assert.equal(getNestedValue(obj, 'a.b.c'), 42);
  });

  it('should create intermediate objects', () => {
    const obj = {};
    setNestedValue(obj, 'x.y.z', 'hello');
    assert.equal(obj.x.y.z, 'hello');
  });
});

// ─── Format Tests ───

describe('Config — formatCentralConfig', () => {
  it('should produce readable output', () => {
    const text = formatCentralConfig(CENTRAL_DEFAULTS);
    assert.ok(text.includes('Central Configuration'));
    assert.ok(text.includes('[thresholds]'));
    assert.ok(text.includes('[scanning]'));
    assert.ok(text.includes('[safety]'));
    assert.ok(text.includes('[scoring]'));
  });
});

// ─── Index Exports Tests ───

describe('Config Exports', () => {
  it('should export config functions from index', () => {
    const index = require('../src/index');
    assert.ok(typeof index.reflectorLoadCentralConfig === 'function');
    assert.ok(typeof index.reflectorSaveCentralConfig === 'function');
    assert.ok(typeof index.reflectorSetCentralValue === 'function');
    assert.ok(typeof index.reflectorGetCentralValue === 'function');
    assert.ok(typeof index.reflectorResetCentralConfig === 'function');
    assert.ok(typeof index.reflectorValidateConfig === 'function');
    assert.ok(typeof index.reflectorToEngineConfig === 'function');
    assert.ok(typeof index.reflectorListConfigKeys === 'function');
    assert.ok(index.reflectorCentralDefaults);
  });
});

// ─── Reflector functions accessible (MCP consolidated) ───

describe('Config — reflector functions (MCP consolidated)', () => {
  it('config functions are directly importable from scoring', () => {
    const scoring = require('../src/reflector/scoring');
    assert.strictEqual(typeof scoring.loadCentralConfig, 'function');
    assert.strictEqual(typeof scoring.saveCentralConfig, 'function');
    assert.strictEqual(typeof scoring.setCentralValue, 'function');
    assert.strictEqual(typeof scoring.getCentralValue, 'function');
    assert.strictEqual(typeof scoring.resetCentralConfig, 'function');
    assert.strictEqual(typeof scoring.validateConfig, 'function');
    assert.strictEqual(typeof scoring.formatCentralConfig, 'function');
  });

  it('MCP has 12 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 12);
  });
});
