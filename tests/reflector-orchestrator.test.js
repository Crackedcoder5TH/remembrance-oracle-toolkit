const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const { orchestrate, formatOrchestration } = require('../src/reflector/multi');

function makeTempRepo() {
  const dir = join(tmpdir(), `orch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, '.remembrance'), { recursive: true });
  // Write a simple JS file
  writeFileSync(join(dir, 'src', 'index.js'), `
function greet(name) {
  return 'Hello, ' + name;
}

function add(a, b) {
  return a + b;
}

module.exports = { greet, add };
`, 'utf-8');
  return dir;
}

describe('Orchestrator — dry-run mode', () => {
  let dir;
  beforeEach(() => { dir = makeTempRepo(); });

  it('should complete all steps in dry-run', () => {
    const result = orchestrate(dir, { dryRun: true });
    assert.ok(result.id);
    assert.strictEqual(result.mode, 'dry-run');
    assert.ok(result.timestamp);
    assert.ok(result.durationMs >= 0);
    assert.ok(Array.isArray(result.steps));
    assert.ok(result.steps.length >= 6);
  });

  it('should have named steps in order', () => {
    const result = orchestrate(dir, { dryRun: true });
    const names = result.steps.map(s => s.name);
    assert.ok(names.includes('load-config'));
    assert.ok(names.includes('snapshot'));
    assert.ok(names.includes('deep-score'));
    assert.ok(names.includes('heal'));
    assert.ok(names.includes('safety-check'));
    assert.ok(names.includes('whisper'));
    assert.ok(names.includes('create-pr'));
    assert.ok(names.includes('record-history'));
  });

  it('should report snapshot data', () => {
    const result = orchestrate(dir, { dryRun: true });
    assert.ok(result.snapshot);
    assert.ok(typeof result.snapshot.totalFiles === 'number');
    assert.ok(typeof result.snapshot.avgCoherence === 'number');
  });

  it('should report deep score data', () => {
    const result = orchestrate(dir, { dryRun: true });
    assert.ok(result.deepScore);
    assert.ok(typeof result.deepScore.aggregate === 'number');
    assert.ok(typeof result.deepScore.health === 'string');
  });

  it('should include a whisper', () => {
    const result = orchestrate(dir, { dryRun: true });
    assert.ok(typeof result.whisper === 'string');
    assert.ok(result.whisper.length > 0);
  });

  it('should not heal files in dry-run', () => {
    const result = orchestrate(dir, { dryRun: true });
    assert.strictEqual(result.healing.filesHealed, 0);
  });

  it('should skip PR creation in dry-run', () => {
    const result = orchestrate(dir, { dryRun: true });
    const prStep = result.steps.find(s => s.name === 'create-pr');
    assert.strictEqual(prStep.status, 'skipped');
    assert.ok(prStep.reason.includes('dry-run'));
  });
});

describe('Orchestrator — live mode', () => {
  let dir;
  beforeEach(() => { dir = makeTempRepo(); });

  it('should run full pipeline in live mode', () => {
    const result = orchestrate(dir);
    assert.strictEqual(result.mode, 'live');
    assert.ok(result.steps.length >= 6);
    // Config and snapshot should succeed
    assert.strictEqual(result.steps[0].status, 'ok');
    assert.strictEqual(result.steps[1].status, 'ok');
  });

  it('should record history after run', () => {
    orchestrate(dir);
    const { loadHistoryV2 } = require('../src/reflector/report');
    const history = loadHistoryV2(dir);
    assert.ok(history.runs.length > 0);
    assert.ok(history.runs[0].id.startsWith('orch-'));
  });
});

describe('Orchestrator — per-step timing', () => {
  it('should have durationMs for each step', () => {
    const dir = makeTempRepo();
    const result = orchestrate(dir, { dryRun: true });
    for (const step of result.steps) {
      assert.ok(typeof step.durationMs === 'number', `${step.name} missing durationMs`);
    }
    rmSync(dir, { recursive: true });
  });
});

describe('Orchestrator — formatOrchestration', () => {
  it('should format result as readable text', () => {
    const dir = makeTempRepo();
    const result = orchestrate(dir, { dryRun: true });
    const text = formatOrchestration(result);
    assert.ok(text.includes('Orchestration Report'));
    assert.ok(text.includes('Pipeline Steps'));
    assert.ok(text.includes('Snapshot'));
    assert.ok(text.includes('Whisper'));
    rmSync(dir, { recursive: true });
  });
});

describe('Orchestrator — exports', () => {
  it('should be available from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorOrchestrate, 'function');
    assert.strictEqual(typeof index.reflectorFormatOrchestration, 'function');
  });
});

describe('Orchestrator — reflector functions (MCP consolidated)', () => {
  it('orchestrate and formatOrchestration are directly importable', () => {
    const multi = require('../src/reflector/multi');
    assert.strictEqual(typeof multi.orchestrate, 'function');
    assert.strictEqual(typeof multi.formatOrchestration, 'function');
  });

  it('MCP has 11 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 11);
  });
});
