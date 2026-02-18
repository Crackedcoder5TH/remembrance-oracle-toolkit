const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const {
  loadHistoryV2,
  saveRunRecord,
  createRunRecord,
  getHistoryV2Path,
  appendLog,
  readLogTail,
  getLogPath,
  computeStats,
  generateTrendChart,
  generateTimeline,
} = require('../src/reflector/report');

// ─── Helpers ───

function createTmpDir() {
  const dir = join(tmpdir(), `history-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeMockReport(avgCoherence, filesHealed, improvement) {
  return {
    snapshot: {
      totalFiles: 10,
      avgCoherence,
      minCoherence: avgCoherence - 0.1,
      maxCoherence: avgCoherence + 0.1,
      dimensionAverages: { simplicity: 0.8, readability: 0.7, security: 0.9, unity: 0.75, correctness: 0.85 },
    },
    healings: Array(filesHealed).fill(null).map((_, i) => ({
      path: `file${i}.js`,
      language: 'javascript',
      originalCoherence: avgCoherence - improvement,
      healedCoherence: avgCoherence,
      improvement,
      healingSummary: 'simplify',
    })),
    healedFiles: Array(filesHealed).fill(null).map((_, i) => ({ path: `file${i}.js` })),
    summary: {
      filesScanned: 10,
      filesBelowThreshold: filesHealed + 2,
      filesHealed,
      totalImprovement: improvement * filesHealed,
      avgImprovement: improvement,
    },
    collectiveWhisper: {
      message: 'The codebase was refined through reflection.',
      overallHealth: avgCoherence >= 0.8 ? 'healthy' : 'stable',
    },
  };
}

// ─── History Storage Tests ───

describe('History — loadHistoryV2 / saveRunRecord', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty history when no file exists', () => {
    const history = loadHistoryV2(tmpDir);
    assert.deepEqual(history.runs, []);
    assert.equal(history.version, 2);
  });

  it('should save and load run records', () => {
    saveRunRecord(tmpDir, { id: 'run-1', timestamp: '2025-01-01' });
    saveRunRecord(tmpDir, { id: 'run-2', timestamp: '2025-01-02' });
    const history = loadHistoryV2(tmpDir);
    assert.equal(history.runs.length, 2);
    assert.equal(history.runs[0].id, 'run-1');
    assert.equal(history.runs[1].id, 'run-2');
  });

  it('should trim to maxRuns', () => {
    for (let i = 0; i < 5; i++) {
      saveRunRecord(tmpDir, { id: `run-${i}` }, { maxRuns: 3 });
    }
    const history = loadHistoryV2(tmpDir);
    assert.equal(history.runs.length, 3);
    assert.equal(history.runs[0].id, 'run-2');
  });

  it('should persist to disk', () => {
    saveRunRecord(tmpDir, { id: 'run-x' });
    const historyPath = getHistoryV2Path(tmpDir);
    assert.ok(existsSync(historyPath));
  });
});

// ─── createRunRecord Tests ───

describe('History — createRunRecord', () => {
  it('should create a structured record from a report', () => {
    const report = makeMockReport(0.8, 3, 0.05);
    const record = createRunRecord(report, null);
    assert.ok(record.id);
    assert.ok(record.timestamp);
    assert.ok(record.coherence);
    assert.ok(record.healing);
    assert.ok(record.whisper);
    assert.ok(record.health);
  });

  it('should include before/after coherence', () => {
    const report = makeMockReport(0.85, 2, 0.03);
    const preSnap = { aggregate: { avgCoherence: 0.82 } };
    const record = createRunRecord(report, preSnap);
    assert.equal(record.coherence.before, 0.82);
    assert.equal(record.coherence.after, 0.85);
    assert.equal(record.coherence.delta, 0.03);
  });

  it('should include per-file changes', () => {
    const report = makeMockReport(0.9, 2, 0.1);
    const record = createRunRecord(report, null);
    assert.equal(record.changes.length, 2);
    assert.ok(record.changes[0].path);
    assert.ok(typeof record.changes[0].before === 'number');
    assert.ok(typeof record.changes[0].after === 'number');
  });

  it('should include healing summary', () => {
    const report = makeMockReport(0.75, 4, 0.02);
    const record = createRunRecord(report, null);
    assert.equal(record.healing.filesScanned, 10);
    assert.equal(record.healing.filesHealed, 4);
  });

  it('should use custom options', () => {
    const report = makeMockReport(0.8, 1, 0.01);
    const record = createRunRecord(report, null, {
      runId: 'custom-123',
      trigger: 'schedule',
      branch: 'remembrance/heal-2025',
      durationMs: 5000,
    });
    assert.equal(record.id, 'custom-123');
    assert.equal(record.trigger, 'schedule');
    assert.equal(record.branch, 'remembrance/heal-2025');
    assert.equal(record.durationMs, 5000);
  });
});

// ─── Logging Tests ───

describe('History — appendLog / readLogTail', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should append and read log entries', () => {
    appendLog(tmpDir, 'INFO', 'Test message');
    appendLog(tmpDir, 'WARN', 'Warning message');
    const lines = readLogTail(tmpDir);
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes('[INFO]'));
    assert.ok(lines[0].includes('Test message'));
    assert.ok(lines[1].includes('[WARN]'));
  });

  it('should include timestamps', () => {
    appendLog(tmpDir, 'INFO', 'Timestamped');
    const lines = readLogTail(tmpDir);
    assert.ok(lines[0].match(/\[\d{4}-\d{2}-\d{2}/));
  });

  it('should include structured data', () => {
    appendLog(tmpDir, 'INFO', 'With data', { files: 3, score: 0.85 });
    const lines = readLogTail(tmpDir);
    assert.ok(lines[0].includes('"files":3'));
  });

  it('should limit to last N lines', () => {
    for (let i = 0; i < 10; i++) {
      appendLog(tmpDir, 'INFO', `Line ${i}`);
    }
    const lines = readLogTail(tmpDir, 3);
    assert.equal(lines.length, 3);
    assert.ok(lines[0].includes('Line 7'));
  });

  it('should return empty array when no log exists', () => {
    const lines = readLogTail(tmpDir);
    assert.deepEqual(lines, []);
  });
});

// ─── Statistics Tests ───

describe('History — computeStats', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return zero stats when no history', () => {
    const stats = computeStats(tmpDir);
    assert.equal(stats.totalRuns, 0);
    assert.equal(stats.avgCoherence, 0);
    assert.equal(stats.trend, 'unknown');
  });

  it('should compute stats from run records', () => {
    const report1 = makeMockReport(0.75, 3, 0.05);
    const record1 = createRunRecord(report1, null, { runId: 'run-1' });
    saveRunRecord(tmpDir, record1);

    const report2 = makeMockReport(0.85, 2, 0.03);
    const record2 = createRunRecord(report2, null, { runId: 'run-2' });
    saveRunRecord(tmpDir, record2);

    const stats = computeStats(tmpDir);
    assert.equal(stats.totalRuns, 2);
    assert.ok(stats.avgCoherence > 0);
    assert.ok(stats.totalFilesHealed >= 5);
    assert.ok(stats.lastRun);
    assert.equal(stats.lastRun.id, 'run-2');
  });

  it('should detect improving trend', () => {
    // Create runs with increasing coherence
    for (let i = 0; i < 6; i++) {
      const coh = 0.6 + i * 0.05;
      const record = createRunRecord(makeMockReport(coh, 1, 0.01), null, { runId: `run-${i}` });
      saveRunRecord(tmpDir, record);
    }
    const stats = computeStats(tmpDir);
    assert.equal(stats.trend, 'improving');
  });

  it('should detect declining trend', () => {
    for (let i = 0; i < 6; i++) {
      const coh = 0.9 - i * 0.05;
      const record = createRunRecord(makeMockReport(coh, 1, 0.01), null, { runId: `run-${i}` });
      saveRunRecord(tmpDir, record);
    }
    const stats = computeStats(tmpDir);
    assert.equal(stats.trend, 'declining');
  });

  it('should include recent runs', () => {
    for (let i = 0; i < 8; i++) {
      const record = createRunRecord(makeMockReport(0.8, 1, 0.01), null, { runId: `run-${i}` });
      saveRunRecord(tmpDir, record);
    }
    const stats = computeStats(tmpDir);
    assert.ok(stats.recentRuns.length <= 5);
    assert.ok(stats.recentRuns[0].id);
  });
});

// ─── Trend Chart Tests ───

describe('History — generateTrendChart', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return no-data message when empty', () => {
    const chart = generateTrendChart(tmpDir);
    assert.ok(chart.includes('No run history'));
  });

  it('should generate a chart with data', () => {
    for (let i = 0; i < 5; i++) {
      const record = createRunRecord(makeMockReport(0.7 + i * 0.02, 1, 0.01), null, { runId: `run-${i}` });
      saveRunRecord(tmpDir, record);
    }
    const chart = generateTrendChart(tmpDir);
    assert.ok(chart.includes('Coherence Trend'));
    assert.ok(chart.includes('Runs:'));
    assert.ok(chart.includes('Avg:'));
  });

  it('should show trend direction', () => {
    for (let i = 0; i < 3; i++) {
      const record = createRunRecord(makeMockReport(0.7 + i * 0.05, 1, 0.01), null, { runId: `run-${i}` });
      saveRunRecord(tmpDir, record);
    }
    const chart = generateTrendChart(tmpDir);
    assert.ok(chart.includes('Trend:'));
  });
});

// ─── Timeline Tests ───

describe('History — generateTimeline', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return no-data message when empty', () => {
    const timeline = generateTimeline(tmpDir);
    assert.ok(timeline.includes('No run history'));
  });

  it('should show run details', () => {
    const record = createRunRecord(makeMockReport(0.85, 2, 0.05), null, { runId: 'run-abc' });
    saveRunRecord(tmpDir, record);
    const timeline = generateTimeline(tmpDir);
    assert.ok(timeline.includes('Run Timeline'));
    assert.ok(timeline.includes('run-abc'));
    assert.ok(timeline.includes('Coherence:'));
    assert.ok(timeline.includes('Healed:'));
  });

  it('should show whisper text', () => {
    const record = createRunRecord(makeMockReport(0.8, 1, 0.01), null);
    saveRunRecord(tmpDir, record);
    const timeline = generateTimeline(tmpDir);
    assert.ok(timeline.includes('Whisper:'));
  });

  it('should show per-file changes', () => {
    const record = createRunRecord(makeMockReport(0.8, 2, 0.05), null);
    saveRunRecord(tmpDir, record);
    const timeline = generateTimeline(tmpDir);
    assert.ok(timeline.includes('file0.js'));
  });
});

// ─── Index Exports Tests ───

describe('History Exports', () => {
  it('should export history functions from index', () => {
    const index = require('../src/index');
    assert.ok(typeof index.reflectorLoadHistoryV2 === 'function');
    assert.ok(typeof index.reflectorSaveRunRecord === 'function');
    assert.ok(typeof index.reflectorCreateRunRecord === 'function');
    assert.ok(typeof index.reflectorAppendLog === 'function');
    assert.ok(typeof index.reflectorReadLogTail === 'function');
    assert.ok(typeof index.reflectorComputeStats === 'function');
    assert.ok(typeof index.reflectorTrendChart === 'function');
    assert.ok(typeof index.reflectorTimeline === 'function');
  });
});

// ─── Reflector functions accessible (MCP consolidated) ───

describe('History — reflector functions (MCP consolidated)', () => {
  it('history functions are directly importable from report', () => {
    const report = require('../src/reflector/report');
    assert.strictEqual(typeof report.loadHistoryV2, 'function');
    assert.strictEqual(typeof report.saveRunRecord, 'function');
    assert.strictEqual(typeof report.createRunRecord, 'function');
    assert.strictEqual(typeof report.computeStats, 'function');
    assert.strictEqual(typeof report.generateTrendChart, 'function');
    assert.strictEqual(typeof report.generateTimeline, 'function');
    assert.strictEqual(typeof report.appendLog, 'function');
    assert.strictEqual(typeof report.readLogTail, 'function');
  });

  it('MCP has 11 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 11);
  });
});
