'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Provenance Tracking', () => {
  let tmpDir;
  const origCwd = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-'));
    fs.mkdirSync(path.join(tmpDir, '.remembrance'), { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generateProvenance returns a watermark object', () => {
    const { generateProvenance } = require('../src/core/oracle-config');
    const prov = generateProvenance('pattern-123', 'personal');
    assert.ok(prov);
    assert.equal(prov.patternId, 'pattern-123');
    assert.equal(prov.sourceTier, 'personal');
    assert.ok(prov.pulledAt);
    assert.ok(prov.watermark.startsWith('oracle:'));
    assert.equal(prov.watermark.length, 'oracle:'.length + 12); // 12 char hex hash
    assert.ok(prov.lineage.includes('pattern-123'));
  });

  it('generateProvenance returns null when tracking is disabled', () => {
    const { generateProvenance, saveConfig, loadConfig } = require('../src/core/oracle-config');
    const config = loadConfig();
    config.provenanceTracking = false;
    saveConfig(config);

    const prov = generateProvenance('abc', 'local');
    assert.equal(prov, null);
  });

  it('applyPromptTag attaches provenance to result with pattern', () => {
    const { applyPromptTag, saveConfig, loadConfig } = require('../src/core/oracle-config');
    // Ensure provenance is on
    const config = loadConfig();
    config.provenanceTracking = true;
    config.promptTagEnabled = true;
    config.enabled = true;
    saveConfig(config);

    const result = {
      decision: 'pull',
      pattern: { id: 'xyz', name: 'debounce', source: 'personal' },
    };

    const patched = applyPromptTag(result);
    assert.ok(patched.promptTag);
    assert.ok(patched.provenance);
    assert.equal(patched.provenance.patternId, 'xyz');
    assert.equal(patched.provenance.sourceTier, 'personal');
    assert.ok(patched.provenance.watermark);
  });

  it('applyPromptTag skips provenance when no pattern', () => {
    const { applyPromptTag, saveConfig, loadConfig } = require('../src/core/oracle-config');
    const config = loadConfig();
    config.provenanceTracking = true;
    config.promptTagEnabled = true;
    config.enabled = true;
    saveConfig(config);

    const result = { decision: 'generate', reasoning: 'no match' };
    const patched = applyPromptTag(result);
    assert.ok(!patched.provenance);
  });

  it('toggleProvenance toggles the setting', () => {
    const { toggleProvenance, loadConfig, saveConfig } = require('../src/core/oracle-config');
    const config = loadConfig();
    config.provenanceTracking = true;
    saveConfig(config);

    const newState = toggleProvenance(false);
    assert.equal(newState, false);

    const config2 = loadConfig();
    assert.equal(config2.provenanceTracking, false);

    const toggled = toggleProvenance(true);
    assert.equal(toggled, true);
  });

  it('unique watermarks for different patterns', () => {
    const { generateProvenance } = require('../src/core/oracle-config');
    const prov1 = generateProvenance('pattern-a', 'local');
    const prov2 = generateProvenance('pattern-b', 'local');
    assert.ok(prov1.watermark !== prov2.watermark);
  });
});
