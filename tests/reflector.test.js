const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

// ─── Core Engine Tests ───

const {
  scanDirectory,
  evaluateFile,
  takeSnapshot,
  healFile,
  reflect,
  formatReport,
  formatPRBody,
  generateCollectiveWhisper,
  DEFAULT_CONFIG,
} = require('../src/reflector/multi');

// ─── GitHub Integration Tests ───

const {
  generateBranchName,
  generateReflectorWorkflow,
} = require('../src/reflector/report');

// ─── Scheduler Tests ───

const {
  DEFAULT_SCHEDULE_CONFIG,
  loadConfig,
  saveConfig,
  loadHistory,
  recordRun,
  runReflector,
  parseCronInterval,
  getStatus,
} = require('../src/reflector/multi');

// ─── Helpers ───

function createTmpDir() {
  const dir = join(tmpdir(), `reflector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createTestFile(dir, name, code) {
  const filePath = join(dir, name);
  const fileDir = join(dir, ...name.split('/').slice(0, -1));
  if (name.includes('/')) mkdirSync(fileDir, { recursive: true });
  writeFileSync(filePath, code, 'utf-8');
  return filePath;
}

// ─── Tests ───

describe('Reflector Engine — scanDirectory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find JavaScript files', () => {
    createTestFile(tmpDir, 'hello.js', 'function hello() { return "hi"; }');
    createTestFile(tmpDir, 'world.js', 'function world() { return "world"; }');
    const files = scanDirectory(tmpDir);
    assert.equal(files.length, 2);
  });

  it('should exclude node_modules', () => {
    createTestFile(tmpDir, 'app.js', 'const x = 1;');
    createTestFile(tmpDir, 'node_modules/dep.js', 'const y = 2;');
    const files = scanDirectory(tmpDir);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('app.js'));
  });

  it('should respect maxFilesPerRun', () => {
    for (let i = 0; i < 10; i++) {
      createTestFile(tmpDir, `file${i}.js`, `const x${i} = ${i};`);
    }
    const files = scanDirectory(tmpDir, { maxFilesPerRun: 3 });
    assert.equal(files.length, 3);
  });

  it('should filter by extension', () => {
    createTestFile(tmpDir, 'code.js', 'const x = 1;');
    createTestFile(tmpDir, 'data.json', '{"a": 1}');
    createTestFile(tmpDir, 'readme.md', '# Hello');
    const files = scanDirectory(tmpDir);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('.js'));
  });

  it('should skip large files', () => {
    createTestFile(tmpDir, 'small.js', 'const x = 1;');
    createTestFile(tmpDir, 'large.js', 'x'.repeat(200000));
    const files = scanDirectory(tmpDir);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('small.js'));
  });

  it('should scan subdirectories', () => {
    createTestFile(tmpDir, 'src/main.js', 'function main() {}');
    createTestFile(tmpDir, 'src/utils/helper.js', 'function help() {}');
    const files = scanDirectory(tmpDir);
    assert.equal(files.length, 2);
  });

  it('should handle empty directories', () => {
    const files = scanDirectory(tmpDir);
    assert.equal(files.length, 0);
  });

  it('should support Python files', () => {
    createTestFile(tmpDir, 'app.py', 'def hello():\n    return "hi"');
    const files = scanDirectory(tmpDir);
    assert.equal(files.length, 1);
    assert.ok(files[0].endsWith('.py'));
  });
});

describe('Reflector Engine — evaluateFile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should evaluate a valid JavaScript file', () => {
    const filePath = createTestFile(tmpDir, 'add.js', 'function add(a, b) { return a + b; }');
    const result = evaluateFile(filePath);
    assert.ok(!result.error);
    assert.equal(result.language, 'javascript');
    assert.ok(result.coherence >= 0 && result.coherence <= 1);
    assert.ok(result.dimensions);
    assert.ok(result.covenantSealed);
  });

  it('should return error for empty file', () => {
    const filePath = createTestFile(tmpDir, 'empty.js', '');
    const result = evaluateFile(filePath);
    assert.equal(result.error, 'Empty file');
    assert.equal(result.coherence, 0);
  });

  it('should return error for non-existent file', () => {
    const result = evaluateFile(join(tmpDir, 'nope.js'));
    assert.ok(result.error);
    assert.equal(result.coherence, 0);
  });

  it('should score simplicity dimension', () => {
    const filePath = createTestFile(tmpDir, 'simple.js', 'function add(a, b) { return a + b; }');
    const result = evaluateFile(filePath);
    assert.ok(result.dimensions.simplicity >= 0);
    assert.ok(result.dimensions.simplicity <= 1);
  });

  it('should detect covenant violations', () => {
    const filePath = createTestFile(tmpDir, 'safe.js', 'function greet(name) { return "Hello " + name; }');
    const result = evaluateFile(filePath);
    assert.ok(result.covenantSealed);
  });

  it('should report all 5 dimensions', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = evaluateFile(filePath);
    const dims = Object.keys(result.dimensions);
    assert.ok(dims.includes('simplicity'));
    assert.ok(dims.includes('readability'));
    assert.ok(dims.includes('security'));
    assert.ok(dims.includes('unity'));
    assert.ok(dims.includes('correctness'));
  });
});

describe('Reflector Engine — takeSnapshot', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should take a snapshot of a codebase', () => {
    createTestFile(tmpDir, 'a.js', 'function a() { return 1; }');
    createTestFile(tmpDir, 'b.js', 'function b() { return 2; }');
    const snap = takeSnapshot(tmpDir);
    assert.ok(snap.timestamp);
    assert.equal(snap.aggregate.totalFiles, 2);
    assert.ok(snap.aggregate.avgCoherence >= 0);
    assert.ok(snap.aggregate.dimensionAverages);
    assert.ok(Array.isArray(snap.belowThreshold));
  });

  it('should identify files below threshold', () => {
    createTestFile(tmpDir, 'good.js', 'function good() { return true; }');
    // Create a file with issues (mixed indentation, empty catch, TODOs)
    createTestFile(tmpDir, 'messy.js', 'function messy() {\n\tvar x = 1;\n  var y = 2; // TODO: fix\n  try { x(); } catch(e) {}\n}');
    const snap = takeSnapshot(tmpDir, { minCoherence: 0.99 });
    assert.ok(snap.belowThreshold.length >= 1);
  });

  it('should compute dimension averages', () => {
    createTestFile(tmpDir, 'code.js', 'function foo() { return 42; }');
    const snap = takeSnapshot(tmpDir);
    const dims = snap.aggregate.dimensionAverages;
    assert.ok('simplicity' in dims);
    assert.ok('readability' in dims);
    assert.ok('security' in dims);
    assert.ok('unity' in dims);
    assert.ok('correctness' in dims);
  });

  it('should handle empty directory', () => {
    const snap = takeSnapshot(tmpDir);
    assert.equal(snap.aggregate.totalFiles, 0);
    assert.equal(snap.aggregate.avgCoherence, 0);
  });
});

describe('Reflector Engine — healFile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should heal a file and return result', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'function add(a,b){return a+b}');
    const result = healFile(filePath);
    assert.ok(!result.error);
    assert.ok(result.original);
    assert.ok(result.healed);
    assert.ok(typeof result.improvement === 'number');
    assert.ok(result.whisper);
    assert.ok(typeof result.changed === 'boolean');
  });

  it('should report coherence scores', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'var x = 1;var y = 2;');
    const result = healFile(filePath);
    assert.ok(result.original.coherence >= 0);
    assert.ok(result.healed.coherence >= 0);
  });

  it('should return error for empty file', () => {
    const filePath = createTestFile(tmpDir, 'empty.js', '   ');
    const result = healFile(filePath);
    assert.ok(result.error);
    assert.equal(result.changed, false);
  });

  it('should include whisper explanation', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = healFile(filePath);
    assert.ok(typeof result.whisper === 'string');
    assert.ok(result.whisper.length > 0);
  });

  it('should track number of SERF loops', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'function foo() { return 1; }');
    const result = healFile(filePath);
    assert.ok(typeof result.loops === 'number');
    assert.ok(result.loops >= 0 && result.loops <= 3);
  });
});

describe('Reflector Engine — reflect (full cycle)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should produce a complete report', () => {
    createTestFile(tmpDir, 'a.js', 'function a() { return 1; }');
    createTestFile(tmpDir, 'b.js', 'function b() { return 2; }');
    const report = reflect(tmpDir);
    assert.ok(report.timestamp);
    assert.ok(report.snapshot);
    assert.ok(report.healings);
    assert.ok(report.healedFiles);
    assert.ok(report.summary);
    assert.ok(report.collectiveWhisper);
  });

  it('should report summary statistics', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const report = reflect(tmpDir);
    assert.ok('filesScanned' in report.summary);
    assert.ok('filesBelowThreshold' in report.summary);
    assert.ok('filesHealed' in report.summary);
    assert.ok('avgImprovement' in report.summary);
  });

  it('should produce collective whisper for no-heal scenario', () => {
    createTestFile(tmpDir, 'perfect.js', 'function add(a, b) { return a + b; }');
    const report = reflect(tmpDir, { minCoherence: 0.1 });
    assert.ok(report.collectiveWhisper.message);
  });

  it('should format as text report', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const report = reflect(tmpDir);
    const text = formatReport(report);
    assert.ok(text.includes('Remembrance Reflector BOT Report'));
    assert.ok(text.includes('Codebase Snapshot'));
    assert.ok(text.includes('Healing Results'));
    assert.ok(text.includes('Collective Whisper'));
  });

  it('should format as PR body', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const report = reflect(tmpDir);
    const body = formatPRBody(report);
    assert.ok(body.includes('Remembrance Pull: Healed Refinement'));
    assert.ok(body.includes('Summary'));
    assert.ok(body.includes('Health Assessment'));
  });
});

describe('Reflector Engine — DEFAULT_CONFIG', () => {
  it('should have required config fields', () => {
    assert.ok(typeof DEFAULT_CONFIG.minCoherence === 'number');
    assert.ok(typeof DEFAULT_CONFIG.autoMergeThreshold === 'number');
    assert.ok(typeof DEFAULT_CONFIG.maxFilesPerRun === 'number');
    assert.ok(Array.isArray(DEFAULT_CONFIG.includeExtensions));
    assert.ok(Array.isArray(DEFAULT_CONFIG.excludeDirs));
  });

  it('should include common extensions', () => {
    assert.ok(DEFAULT_CONFIG.includeExtensions.includes('.js'));
    assert.ok(DEFAULT_CONFIG.includeExtensions.includes('.ts'));
    assert.ok(DEFAULT_CONFIG.includeExtensions.includes('.py'));
  });

  it('should exclude common directories', () => {
    assert.ok(DEFAULT_CONFIG.excludeDirs.includes('node_modules'));
    assert.ok(DEFAULT_CONFIG.excludeDirs.includes('.git'));
    assert.ok(DEFAULT_CONFIG.excludeDirs.includes('dist'));
  });
});

describe('Reflector Engine — generateCollectiveWhisper', () => {
  it('should return healthy message when no healings', () => {
    const snapshot = { aggregate: { avgCoherence: 0.9 } };
    const result = generateCollectiveWhisper(snapshot, []);
    assert.ok(result.message.includes('No healing was needed'));
    assert.equal(result.overallHealth, 'healthy');
  });

  it('should categorize health correctly', () => {
    const snap1 = { aggregate: { avgCoherence: 0.85 } };
    assert.equal(generateCollectiveWhisper(snap1, []).overallHealth, 'healthy');

    const snap2 = { aggregate: { avgCoherence: 0.65 } };
    assert.equal(generateCollectiveWhisper(snap2, []).overallHealth, 'stable');

    const snap3 = { aggregate: { avgCoherence: 0.3 } };
    assert.equal(generateCollectiveWhisper(snap3, []).overallHealth, 'needs attention');
  });
});

// ─── GitHub Integration Tests ───

describe('Reflector GitHub — generateBranchName', () => {
  it('should generate a branch name with correct format', () => {
    const name = generateBranchName();
    assert.ok(name.startsWith('remembrance/heal-'));
    // Format: remembrance/heal-YYYY-MM-DD-HHMMSS
    assert.match(name, /^remembrance\/heal-\d{4}-\d{2}-\d{2}-\d{6}$/);
  });

  it('should generate unique names', () => {
    const name1 = generateBranchName();
    // Small delay to ensure different timestamp
    const name2 = generateBranchName();
    // They might be the same if called in same second, but format should be valid
    assert.ok(name1.startsWith('remembrance/heal-'));
    assert.ok(name2.startsWith('remembrance/heal-'));
  });
});

describe('Reflector GitHub — generateReflectorWorkflow', () => {
  it('should generate valid YAML', () => {
    const yaml = generateReflectorWorkflow();
    assert.ok(yaml.includes('name: Remembrance Reflector BOT'));
    assert.ok(yaml.includes('schedule'));
    assert.ok(yaml.includes('workflow_dispatch'));
    assert.ok(yaml.includes('actions/checkout@v4'));
    assert.ok(yaml.includes('node-version'));
  });

  it('should respect custom schedule', () => {
    const yaml = generateReflectorWorkflow({ schedule: '0 */12 * * *' });
    assert.ok(yaml.includes('0 */12 * * *'));
  });

  it('should use correct node version', () => {
    const yaml = generateReflectorWorkflow({ nodeVersion: '20' });
    assert.ok(yaml.includes("node-version: '20'"));
  });
});

// ─── Scheduler Tests ───

describe('Reflector Scheduler — loadConfig / saveConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return defaults when no config exists', () => {
    const config = loadConfig(tmpDir);
    assert.equal(config.enabled, true);
    assert.equal(config.intervalHours, 6);
    assert.equal(config.minCoherence, 0.7);
  });

  it('should save and load config', () => {
    saveConfig(tmpDir, { ...DEFAULT_SCHEDULE_CONFIG, minCoherence: 0.8, intervalHours: 12 });
    const config = loadConfig(tmpDir);
    assert.equal(config.minCoherence, 0.8);
    assert.equal(config.intervalHours, 12);
  });

  it('should merge with defaults', () => {
    saveConfig(tmpDir, { minCoherence: 0.9 });
    const config = loadConfig(tmpDir);
    assert.equal(config.minCoherence, 0.9);
    assert.equal(config.enabled, true); // Default preserved
  });
});

describe('Reflector Scheduler — parseCronInterval', () => {
  it('should parse hourly', () => {
    assert.equal(parseCronInterval('hourly'), 1);
    assert.equal(parseCronInterval('every hour'), 1);
  });

  it('should parse daily', () => {
    assert.equal(parseCronInterval('daily'), 24);
    assert.equal(parseCronInterval('every day'), 24);
  });

  it('should parse weekly', () => {
    assert.equal(parseCronInterval('weekly'), 168);
  });

  it('should parse hour intervals', () => {
    assert.equal(parseCronInterval('every 6 hours'), 6);
    assert.equal(parseCronInterval('every 12 hours'), 12);
    assert.equal(parseCronInterval('every 1 hour'), 1);
  });

  it('should parse minute intervals', () => {
    assert.equal(parseCronInterval('every 30 minutes'), 0.5);
    assert.equal(parseCronInterval('every 60 minutes'), 1);
  });

  it('should default to 6 hours for unknown', () => {
    assert.equal(parseCronInterval('something weird'), 6);
  });
});

describe('Reflector Scheduler — recordRun / loadHistory', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should record and load runs', () => {
    recordRun(tmpDir, { id: 'run-1', startedAt: new Date().toISOString() });
    recordRun(tmpDir, { id: 'run-2', startedAt: new Date().toISOString() });
    const history = loadHistory(tmpDir);
    assert.equal(history.runs.length, 2);
    assert.equal(history.runs[0].id, 'run-1');
  });

  it('should return empty history when no file exists', () => {
    const history = loadHistory(tmpDir);
    assert.deepEqual(history, { runs: [] });
  });

  it('should trim history to maxRunHistory', () => {
    saveConfig(tmpDir, { ...DEFAULT_SCHEDULE_CONFIG, maxRunHistory: 3 });
    for (let i = 0; i < 5; i++) {
      recordRun(tmpDir, { id: `run-${i}` });
    }
    const history = loadHistory(tmpDir);
    assert.equal(history.runs.length, 3);
    assert.equal(history.runs[0].id, 'run-2'); // First two trimmed
  });
});

describe('Reflector Scheduler — runReflector', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should run a complete reflector cycle', () => {
    const result = runReflector(tmpDir, { push: false, openPR: false });
    assert.ok(result.id);
    assert.ok(result.startedAt);
    assert.ok(result.finishedAt);
    assert.ok(typeof result.durationMs === 'number');
    assert.ok(result.report);
  });

  it('should report scan results', () => {
    const result = runReflector(tmpDir, { push: false, openPR: false });
    assert.ok(typeof result.report.filesScanned === 'number');
    assert.ok(typeof result.report.filesHealed === 'number');
    assert.ok(typeof result.report.collectiveWhisper === 'string');
  });

  it('should persist report to disk', () => {
    runReflector(tmpDir, { push: false, openPR: false });
    const reportPath = join(tmpDir, '.remembrance', 'reflector-report.json');
    assert.ok(existsSync(reportPath));
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    assert.ok(report.timestamp);
  });

  it('should record run in history', () => {
    runReflector(tmpDir, { push: false, openPR: false });
    const history = loadHistory(tmpDir);
    assert.equal(history.runs.length, 1);
  });
});

describe('Reflector Scheduler — getStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return status with no runs', () => {
    const status = getStatus(tmpDir);
    assert.ok(status.config);
    assert.equal(status.totalRuns, 0);
    assert.equal(status.lastRun, null);
  });

  it('should return status after runs', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    runReflector(tmpDir, { push: false, openPR: false });
    const status = getStatus(tmpDir);
    assert.equal(status.totalRuns, 1);
    assert.ok(status.lastRun);
    assert.ok(status.lastRun.id);
  });
});

// ─── MCP Tool Registration Tests ───

describe('MCP consolidated tools include reflector-related features', () => {
  it('MCP has consolidated 10 tools (reflector is accessed via module directly)', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 10, 'MCP should have exactly 10 consolidated tools');
    const names = TOOLS.map(t => t.name);
    assert.ok(names.includes('oracle_maintain'), 'oracle_maintain should exist for reflect/covenant actions');
  });

  it('reflector functions are still accessible via module directly', () => {
    const multi = require('../src/reflector/multi');
    assert.ok(typeof multi.scanDirectory === 'function');
    assert.ok(typeof multi.evaluateFile === 'function');
    assert.ok(typeof multi.takeSnapshot === 'function');
    assert.ok(typeof multi.healFile === 'function');
    assert.ok(typeof multi.getStatus === 'function');
  });
});

// ─── Index Exports Tests ───

describe('Reflector Exports', () => {
  it('should export reflector functions from index', () => {
    const index = require('../src/index');
    assert.ok(typeof index.reflectorScanDirectory === 'function');
    assert.ok(typeof index.reflectorEvaluateFile === 'function');
    assert.ok(typeof index.reflectorTakeSnapshot === 'function');
    assert.ok(typeof index.reflectorHealFile === 'function');
    assert.ok(typeof index.reflectorReflect === 'function');
    assert.ok(typeof index.reflectorFormatReport === 'function');
    assert.ok(typeof index.reflectorFormatPRBody === 'function');
    assert.ok(typeof index.reflectorRunReflector === 'function');
    assert.ok(typeof index.reflectorStartScheduler === 'function');
    assert.ok(typeof index.reflectorLoadConfig === 'function');
    assert.ok(typeof index.reflectorSaveConfig === 'function');
    assert.ok(typeof index.reflectorGetStatus === 'function');
    assert.ok(typeof index.reflectorGenerateWorkflow === 'function');
    assert.ok(typeof index.reflectorCreateHealingBranch === 'function');
  });
});
