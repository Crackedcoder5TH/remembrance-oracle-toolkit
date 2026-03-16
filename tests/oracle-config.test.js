const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeTempDir, cleanTempDir } = require('./helpers');

describe('OracleConfig', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = makeTempDir('oracle-config-test');
    fs.mkdirSync(path.join(tmpDir, '.remembrance'), { recursive: true });
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanTempDir(tmpDir);
  });

  // Re-require to pick up fresh cwd each time
  function freshConfig() {
    const modPath = require.resolve('../src/core/oracle-config');
    delete require.cache[modPath];
    return require('../src/core/oracle-config');
  }

  it('returns default config when no file exists', () => {
    const { loadConfig, DEFAULT_CONFIG } = freshConfig();
    const config = loadConfig();
    assert.equal(config.enabled, DEFAULT_CONFIG.enabled);
    assert.equal(config.promptTag, DEFAULT_CONFIG.promptTag);
    assert.equal(config.promptTagEnabled, DEFAULT_CONFIG.promptTagEnabled);
  });

  it('toggleOracle switches enabled state', () => {
    const { toggleOracle, isOracleEnabled } = freshConfig();
    // Default is true
    assert.equal(isOracleEnabled(), true);
    // Toggle off
    const result = toggleOracle(false);
    assert.equal(result, false);
    assert.equal(isOracleEnabled(), false);
    // Toggle on
    toggleOracle(true);
    assert.equal(isOracleEnabled(), true);
  });

  it('toggleOracle flips when no argument given', () => {
    const { toggleOracle, isOracleEnabled } = freshConfig();
    assert.equal(isOracleEnabled(), true);
    toggleOracle(); // flip to false
    assert.equal(isOracleEnabled(), false);
    toggleOracle(); // flip to true
    assert.equal(isOracleEnabled(), true);
  });

  it('getPromptTag returns tag when enabled', () => {
    const { getPromptTag } = freshConfig();
    const tag = getPromptTag();
    assert.ok(tag.includes('Pull the healed code'));
  });

  it('getPromptTag returns empty when oracle disabled', () => {
    const { toggleOracle, getPromptTag } = freshConfig();
    toggleOracle(false);
    assert.equal(getPromptTag(), '');
  });

  it('setPromptTag sets custom tag', () => {
    const { setPromptTag, getPromptTag } = freshConfig();
    setPromptTag('Custom tag from the kingdom');
    assert.equal(getPromptTag(), 'Custom tag from the kingdom');
  });

  it('togglePromptTag disables tag independently', () => {
    const { togglePromptTag, getPromptTag } = freshConfig();
    togglePromptTag(false);
    assert.equal(getPromptTag(), '');
    togglePromptTag(true);
    assert.ok(getPromptTag().length > 0);
  });

  it('applyPromptTag adds promptTag to result object', () => {
    const { applyPromptTag } = freshConfig();
    const input = { decision: 'pull', confidence: 0.9 };
    const result = applyPromptTag(input);
    assert.ok(result.promptTag);
    assert.ok(result.promptTag.includes('Pull the healed code'));
  });

  it('applyPromptTag does not add tag when oracle disabled', () => {
    const { toggleOracle, applyPromptTag } = freshConfig();
    toggleOracle(false);
    const result = { decision: 'pull' };
    applyPromptTag(result);
    assert.equal(result.promptTag, undefined);
  });

  it('saveConfig persists to disk', () => {
    const { saveConfig, loadConfig } = freshConfig();
    saveConfig({ enabled: false, promptTag: 'test', promptTagEnabled: true });
    const loaded = loadConfig();
    assert.equal(loaded.enabled, false);
    assert.equal(loaded.promptTag, 'test');
  });

  it('config file is written to .remembrance/', () => {
    const { saveConfig, CONFIG_FILENAME } = freshConfig();
    saveConfig({ enabled: true, promptTag: 'x', promptTagEnabled: true });
    const filePath = path.join(tmpDir, '.remembrance', CONFIG_FILENAME);
    assert.ok(fs.existsSync(filePath));
  });
});
