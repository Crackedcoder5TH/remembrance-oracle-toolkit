const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { join } = require('path');

const {
  PRESET_MODES,
  ENV_OVERRIDES,
  readEnvOverrides,
  applyOverrides,
  resolveConfig,
  shouldAutoCreatePR,
  listModes,
  setMode,
  getCurrentMode,
  formatResolvedConfig,
} = require('../src/reflector/scoring');

// ─── Helpers ───

const TEST_ROOT = join(__dirname, '__tmp_modes_test__');

function setup() {
  mkdirSync(join(TEST_ROOT, '.remembrance'), { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

// ─── PRESET_MODES ───

describe('PRESET_MODES', () => {
  it('should have strict, balanced, and relaxed modes', () => {
    assert.ok(PRESET_MODES.strict);
    assert.ok(PRESET_MODES.balanced);
    assert.ok(PRESET_MODES.relaxed);
  });

  it('strict should have higher thresholds than relaxed', () => {
    assert.ok(PRESET_MODES.strict.thresholds.minCoherence > PRESET_MODES.relaxed.thresholds.minCoherence);
    assert.ok(PRESET_MODES.strict.thresholds.autoMergeThreshold > PRESET_MODES.relaxed.thresholds.autoMergeThreshold);
  });

  it('each mode should have thresholds and safety sections', () => {
    for (const mode of Object.values(PRESET_MODES)) {
      assert.ok(mode.thresholds);
      assert.ok(mode.safety);
      assert.ok(typeof mode.thresholds.minCoherence === 'number');
    }
  });

  it('strict should require approval', () => {
    assert.ok(PRESET_MODES.strict.safety.requireApproval);
    assert.ok(!PRESET_MODES.balanced.safety.requireApproval);
  });

  it('relaxed should enable auto-merge', () => {
    assert.ok(PRESET_MODES.relaxed.github.autoMerge);
    assert.ok(!PRESET_MODES.strict.github.autoMerge);
  });
});

// ─── readEnvOverrides ───

describe('readEnvOverrides', () => {
  it('should read numeric env vars', () => {
    const overrides = readEnvOverrides({ REFLECTOR_MIN_COHERENCE: '0.8' });
    assert.equal(overrides['thresholds.minCoherence'], 0.8);
  });

  it('should read boolean env vars', () => {
    const overrides = readEnvOverrides({ REFLECTOR_AUTO_MERGE: 'true', REFLECTOR_DRY_RUN: '1' });
    assert.equal(overrides['github.autoMerge'], true);
    assert.equal(overrides['safety.dryRunByDefault'], true);
  });

  it('should read string env vars', () => {
    const overrides = readEnvOverrides({ REFLECTOR_MODE: 'strict' });
    assert.equal(overrides._mode, 'strict');
  });

  it('should skip empty or undefined vars', () => {
    const overrides = readEnvOverrides({ REFLECTOR_MIN_COHERENCE: '' });
    assert.ok(!('thresholds.minCoherence' in overrides));
  });

  it('should skip invalid numbers', () => {
    const overrides = readEnvOverrides({ REFLECTOR_MIN_COHERENCE: 'abc' });
    assert.ok(!('thresholds.minCoherence' in overrides));
  });

  it('should return empty for no matching env vars', () => {
    const overrides = readEnvOverrides({ UNRELATED_VAR: 'value' });
    assert.equal(Object.keys(overrides).length, 0);
  });
});

// ─── applyOverrides ───

describe('applyOverrides', () => {
  it('should apply dot-notation overrides', () => {
    const config = { thresholds: { minCoherence: 0.7 }, github: { autoMerge: false } };
    const result = applyOverrides(config, {
      'thresholds.minCoherence': 0.9,
      'github.autoMerge': true,
    });
    assert.equal(result.thresholds.minCoherence, 0.9);
    assert.equal(result.github.autoMerge, true);
  });

  it('should not modify original config', () => {
    const config = { thresholds: { minCoherence: 0.7 } };
    applyOverrides(config, { 'thresholds.minCoherence': 0.9 });
    assert.equal(config.thresholds.minCoherence, 0.7);
  });

  it('should skip _mode key', () => {
    const config = { thresholds: {} };
    const result = applyOverrides(config, { _mode: 'strict' });
    assert.ok(!result._mode);
  });

  it('should create nested paths if needed', () => {
    const config = {};
    const result = applyOverrides(config, { 'autoCommit.testCommand': 'npm test' });
    assert.equal(result.autoCommit.testCommand, 'npm test');
  });
});

// ─── resolveConfig ───

describe('resolveConfig', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should return default config when no mode or overrides', () => {
    const config = resolveConfig(TEST_ROOT);
    assert.ok(config.thresholds);
    assert.ok(config.scanning);
    assert.ok(config.safety);
  });

  it('should apply strict mode', () => {
    const config = resolveConfig(TEST_ROOT, { mode: 'strict' });
    assert.equal(config.thresholds.minCoherence, PRESET_MODES.strict.thresholds.minCoherence);
    assert.equal(config.safety.requireApproval, true);
    assert.equal(config._mode, 'strict');
  });

  it('should apply relaxed mode', () => {
    const config = resolveConfig(TEST_ROOT, { mode: 'relaxed' });
    assert.equal(config.thresholds.minCoherence, PRESET_MODES.relaxed.thresholds.minCoherence);
    assert.equal(config.github.autoMerge, true);
  });

  it('should apply env overrides on top of mode', () => {
    const config = resolveConfig(TEST_ROOT, {
      mode: 'balanced',
      env: { REFLECTOR_MIN_COHERENCE: '0.99' },
    });
    assert.equal(config.thresholds.minCoherence, 0.99);
  });

  it('should apply manual overrides on top of everything', () => {
    const config = resolveConfig(TEST_ROOT, {
      mode: 'strict',
      overrides: { thresholds: { minCoherence: 0.42 } },
    });
    assert.equal(config.thresholds.minCoherence, 0.42);
  });

  it('should detect mode from env', () => {
    const config = resolveConfig(TEST_ROOT, {
      env: { REFLECTOR_MODE: 'relaxed' },
    });
    assert.equal(config.thresholds.minCoherence, PRESET_MODES.relaxed.thresholds.minCoherence);
  });
});

// ─── shouldAutoCreatePR ───

describe('shouldAutoCreatePR', () => {
  it('should allow PR when coherence meets threshold', () => {
    const result = shouldAutoCreatePR(
      { coherence: { after: 0.85 }, report: { filesHealed: 3 } },
      { thresholds: { minCoherenceForAutoPR: 0.8 } },
    );
    assert.ok(result.shouldOpenPR);
    assert.ok(result.reason.includes('meets threshold'));
  });

  it('should reject PR when coherence below threshold', () => {
    const result = shouldAutoCreatePR(
      { coherence: { after: 0.5 }, report: { filesHealed: 2 } },
      { thresholds: { minCoherenceForAutoPR: 0.75 } },
    );
    assert.ok(!result.shouldOpenPR);
    assert.ok(result.reason.includes('below threshold'));
  });

  it('should reject PR when no files healed', () => {
    const result = shouldAutoCreatePR(
      { coherence: { after: 0.9 }, report: { filesHealed: 0 } },
      { thresholds: { minCoherenceForAutoPR: 0.7 } },
    );
    assert.ok(!result.shouldOpenPR);
    assert.ok(result.reason.includes('No files'));
  });

  it('should use default threshold when not configured', () => {
    const result = shouldAutoCreatePR(
      { coherence: { after: 0.8 }, report: { filesHealed: 1 } },
      {},
    );
    assert.ok(result.shouldOpenPR);
    assert.equal(result.threshold, 0.7);
  });
});

// ─── listModes & setMode & getCurrentMode ───

describe('listModes', () => {
  it('should list all preset modes', () => {
    const modes = listModes();
    assert.equal(modes.length, 3);
    const names = modes.map(m => m.name);
    assert.ok(names.includes('strict'));
    assert.ok(names.includes('balanced'));
    assert.ok(names.includes('relaxed'));
    for (const m of modes) {
      assert.ok(m.description.length > 10);
    }
  });
});

describe('setMode', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should set mode and persist', () => {
    const result = setMode(TEST_ROOT, 'strict');
    assert.ok(result.applied);
    assert.equal(result.mode, 'strict');

    const current = getCurrentMode(TEST_ROOT);
    assert.equal(current, 'strict');
  });

  it('should return error for unknown mode', () => {
    const result = setMode(TEST_ROOT, 'nonexistent');
    assert.ok(result.error);
    assert.ok(result.error.includes('Unknown mode'));
  });
});

describe('getCurrentMode', () => {
  beforeEach(() => { cleanup(); setup(); });
  afterEach(() => { cleanup(); });

  it('should return custom when no mode set', () => {
    assert.equal(getCurrentMode(TEST_ROOT), 'custom');
  });
});

// ─── formatResolvedConfig ───

describe('formatResolvedConfig', () => {
  it('should format config with mode name', () => {
    const text = formatResolvedConfig({
      _mode: 'strict',
      thresholds: { minCoherence: 0.8 },
      scanning: { maxFilesPerRun: 30 },
    });
    assert.ok(text.includes('strict'));
    assert.ok(text.includes('[thresholds]'));
    assert.ok(text.includes('minCoherence'));
    assert.ok(text.includes('0.8'));
  });

  it('should show custom for no mode', () => {
    const text = formatResolvedConfig({ thresholds: {} });
    assert.ok(text.includes('custom'));
  });
});

// ─── Exports ───

describe('Configurable Thresholds & Modes — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorPresetModes, 'object');
    assert.strictEqual(typeof index.reflectorResolveConfig, 'function');
    assert.strictEqual(typeof index.reflectorShouldAutoCreatePR, 'function');
    assert.strictEqual(typeof index.reflectorListModes, 'function');
    assert.strictEqual(typeof index.reflectorSetMode, 'function');
    assert.strictEqual(typeof index.reflectorGetCurrentMode, 'function');
    assert.strictEqual(typeof index.reflectorFormatResolvedConfig, 'function');
    assert.strictEqual(typeof index.reflectorReadEnvOverrides, 'function');
  });
});

// ─── MCP Tools ───

describe('Configurable Thresholds & Modes — MCP tools', () => {
  it('should have resolve_config tool', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_reflector_resolve_config');
    assert.ok(tool);
    assert.ok(tool.inputSchema.properties.rootDir);
    assert.ok(tool.inputSchema.properties.mode);
  });

  it('should have set_mode tool', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_reflector_set_mode');
    assert.ok(tool);
    assert.ok(tool.inputSchema.required.includes('mode'));
  });

  it('should have list_modes tool', () => {
    const { TOOLS } = require('../src/mcp/server');
    const tool = TOOLS.find(t => t.name === 'oracle_reflector_list_modes');
    assert.ok(tool);
  });
});
