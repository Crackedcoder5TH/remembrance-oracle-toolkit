const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

const {
  createSafetyBranch,
  runTestGate,
  runCommand,
  mergeIfPassing,
  safeAutoCommit,
  loadAutoCommitHistory,
  autoCommitStats,
  formatAutoCommit,
} = require('../src/reflector/report');

// ─── Helpers ───

const TEST_ROOT = join(__dirname, '__tmp_autocommit_test__');

function setupGitRepo() {
  mkdirSync(TEST_ROOT, { recursive: true });
  execSync('git init', { cwd: TEST_ROOT, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: TEST_ROOT, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: TEST_ROOT, stdio: 'pipe' });
  writeFileSync(join(TEST_ROOT, 'file.js'), 'const a = 1;\n');
  mkdirSync(join(TEST_ROOT, '.remembrance'), { recursive: true });
  execSync('git add -A && git commit -m "init"', { cwd: TEST_ROOT, stdio: 'pipe' });
}

function cleanupRepo() {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

// ─── runCommand ───

describe('runCommand', () => {
  it('should capture stdout on success', () => {
    const r = runCommand('echo hello', '/tmp');
    assert.ok(r.passed);
    assert.ok(r.stdout.includes('hello'));
    assert.ok(r.durationMs >= 0);
  });

  it('should capture failure with exit code', () => {
    const r = runCommand('exit 1', '/tmp');
    assert.ok(!r.passed);
    assert.ok(r.exitCode);
  });

  it('should handle command not found', () => {
    const r = runCommand('nonexistent_command_xyz_123', '/tmp');
    assert.ok(!r.passed);
    assert.ok(r.error);
  });

  it('should respect timeout', () => {
    const r = runCommand('sleep 10', '/tmp', 500);
    assert.ok(!r.passed);
  });
});

// ─── runTestGate ───

describe('runTestGate', () => {
  it('should pass when test command succeeds', () => {
    const r = runTestGate('/tmp', { testCommand: 'echo "tests ok"', buildCommand: '' });
    assert.ok(r.passed);
    assert.ok(r.steps.length >= 1);
    assert.equal(r.steps[0].name, 'test');
    assert.ok(r.steps[0].passed);
  });

  it('should run build before test', () => {
    const r = runTestGate('/tmp', { testCommand: 'echo "test"', buildCommand: 'echo "build"' });
    assert.ok(r.passed);
    assert.equal(r.steps.length, 2);
    assert.equal(r.steps[0].name, 'build');
    assert.equal(r.steps[1].name, 'test');
  });

  it('should stop on build failure', () => {
    const r = runTestGate('/tmp', { testCommand: 'echo "test"', buildCommand: 'exit 1' });
    assert.ok(!r.passed);
    assert.equal(r.failedStep, 'build');
    assert.equal(r.steps.length, 1);
  });

  it('should report test failure', () => {
    const r = runTestGate('/tmp', { testCommand: 'exit 1', buildCommand: '' });
    assert.ok(!r.passed);
    assert.equal(r.failedStep, 'test');
  });

  it('should skip build when buildCommand is empty', () => {
    const r = runTestGate('/tmp', { testCommand: 'echo ok', buildCommand: '' });
    assert.ok(r.passed);
    assert.equal(r.steps.length, 1);
  });
});

// ─── createSafetyBranch ───

describe('createSafetyBranch', () => {
  beforeEach(() => { cleanupRepo(); setupGitRepo(); });
  afterEach(() => { cleanupRepo(); });

  it('should create a safety branch at current HEAD', () => {
    const result = createSafetyBranch(TEST_ROOT);
    assert.ok(result.branch.startsWith('remembrance/safety-'));
    assert.ok(result.headCommit);
    assert.ok(result.baseBranch);
    assert.ok(result.timestamp);

    // Verify the branch exists
    const branches = execSync('git branch', { cwd: TEST_ROOT, encoding: 'utf-8' });
    assert.ok(branches.includes('remembrance/safety-'));
  });

  it('should include label', () => {
    const result = createSafetyBranch(TEST_ROOT, { label: 'my-backup' });
    assert.equal(result.label, 'my-backup');
  });
});

// ─── mergeIfPassing ───

describe('mergeIfPassing', () => {
  beforeEach(() => { cleanupRepo(); setupGitRepo(); });
  afterEach(() => { cleanupRepo(); });

  it('should abort if test result is null', () => {
    const result = mergeIfPassing(TEST_ROOT, {
      healingBranch: 'fake',
      baseBranch: 'master',
      safetyBranch: 'safety',
      testResult: null,
    });
    assert.ok(!result.merged);
    assert.ok(result.aborted);
    assert.ok(result.reason.includes('No test result'));
  });

  it('should abort if tests failed', () => {
    const result = mergeIfPassing(TEST_ROOT, {
      healingBranch: 'fake',
      baseBranch: 'master',
      safetyBranch: 'safety',
      testResult: { passed: false, failedStep: 'test', failReason: 'exit 1' },
    });
    assert.ok(!result.merged);
    assert.ok(result.aborted);
    assert.ok(result.reason.includes('Test gate failed'));
  });

  it('should merge when tests pass', () => {
    // Create a healing branch with a change
    const baseBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: TEST_ROOT, encoding: 'utf-8' }).trim();
    execSync('git checkout -b test-heal', { cwd: TEST_ROOT, stdio: 'pipe' });
    writeFileSync(join(TEST_ROOT, 'healed.js'), 'const b = 2;\n');
    execSync('git add healed.js && git commit -m "heal"', { cwd: TEST_ROOT, stdio: 'pipe' });
    execSync(`git checkout ${baseBranch}`, { cwd: TEST_ROOT, stdio: 'pipe' });

    const result = mergeIfPassing(TEST_ROOT, {
      healingBranch: 'test-heal',
      baseBranch,
      safetyBranch: 'fake-safety',
      testResult: { passed: true },
      squash: false,
    });
    assert.ok(result.merged);
    assert.ok(!result.aborted);
    assert.ok(result.reason.includes('All tests passed'));
  });
});

// ─── safeAutoCommit ───

describe('safeAutoCommit', () => {
  beforeEach(() => { cleanupRepo(); setupGitRepo(); });
  afterEach(() => { cleanupRepo(); });

  it('should skip if no healed files', () => {
    const result = safeAutoCommit(TEST_ROOT, []);
    assert.ok(result.skipped);
    assert.ok(result.reason.includes('No healed files'));
  });

  it('should skip if no healedFiles argument', () => {
    const result = safeAutoCommit(TEST_ROOT, null);
    assert.ok(result.skipped);
  });

  it('should run dry-run mode', () => {
    const healedFiles = [{ path: 'file.js', code: 'const a = 2;\n' }];
    const result = safeAutoCommit(TEST_ROOT, healedFiles, { dryRun: true });
    assert.equal(result.mode, 'dry-run');
    assert.ok(result.dryRun);
    assert.equal(result.dryRun.filesCount, 1);
  });

  it('should run full pipeline and merge if tests pass', () => {
    const healedFiles = [{ path: 'file.js', code: 'const a = 42;\n' }];
    const result = safeAutoCommit(TEST_ROOT, healedFiles, {
      testCommand: 'echo "tests pass"',
      buildCommand: '',
    });
    assert.ok(result.merged);
    assert.ok(!result.aborted);
    assert.ok(result.pipeline.length >= 4);

    // Verify the healed content made it
    const content = readFileSync(join(TEST_ROOT, 'file.js'), 'utf-8');
    assert.equal(content, 'const a = 42;\n');
  });

  it('should abort and preserve safety branch when tests fail', () => {
    const healedFiles = [{ path: 'file.js', code: 'const broken = ;\n' }];
    const result = safeAutoCommit(TEST_ROOT, healedFiles, {
      testCommand: 'exit 1',
      buildCommand: '',
    });
    assert.ok(!result.merged);
    assert.ok(result.aborted);
    assert.ok(result.safetyBranch);
  });

  it('should record result to history', () => {
    const healedFiles = [{ path: 'file.js', code: 'const a = 99;\n' }];
    safeAutoCommit(TEST_ROOT, healedFiles, { testCommand: 'echo ok' });
    const history = loadAutoCommitHistory(TEST_ROOT);
    assert.ok(history.length >= 1);
    assert.ok(history[history.length - 1].merged !== undefined);
  });
});

// ─── autoCommitStats ───

describe('autoCommitStats', () => {
  it('should return zero stats for empty history', () => {
    const tmpDir = join(__dirname, '__tmp_stats__');
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
    const stats = autoCommitStats(tmpDir);
    assert.equal(stats.totalRuns, 0);
    assert.equal(stats.successRate, 0);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should compute stats from history', () => {
    const tmpDir = join(__dirname, '__tmp_stats2__');
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
    const historyPath = join(tmpDir, '.remembrance', 'auto-commit-history.json');
    writeFileSync(historyPath, JSON.stringify([
      { merged: true, testPassed: true, durationMs: 100 },
      { merged: false, aborted: true, testPassed: false, durationMs: 200 },
      { merged: true, testPassed: true, durationMs: 150 },
    ]));
    const stats = autoCommitStats(tmpDir);
    assert.equal(stats.totalRuns, 3);
    assert.equal(stats.merged, 2);
    assert.equal(stats.aborted, 1);
    assert.ok(stats.successRate > 0.6);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── formatAutoCommit ───

describe('formatAutoCommit', () => {
  it('should format skipped result', () => {
    const text = formatAutoCommit({ mode: 'live', timestamp: 'now', durationMs: 10, skipped: true, reason: 'No files' });
    assert.ok(text.includes('SKIPPED'));
    assert.ok(text.includes('No files'));
  });

  it('should format merged result', () => {
    const text = formatAutoCommit({
      mode: 'live', timestamp: 'now', durationMs: 500, merged: true,
      pipeline: [
        { step: 'safety-branch', status: 'ok', branch: 'remembrance/safety-123' },
        { step: 'test-gate', status: 'ok' },
        { step: 'merge', status: 'ok', reason: 'All tests passed.' },
      ],
    });
    assert.ok(text.includes('[OK] safety-branch'));
    assert.ok(text.includes('[OK] merge'));
    assert.ok(text.includes('merged successfully'));
  });

  it('should format aborted result with safety branch', () => {
    const text = formatAutoCommit({
      mode: 'live', timestamp: 'now', durationMs: 300, aborted: true,
      reason: 'Test gate failed',
      safetyBranch: 'remembrance/safety-999',
      pipeline: [
        { step: 'test-gate', status: 'failed' },
      ],
    });
    assert.ok(text.includes('Aborted'));
    assert.ok(text.includes('safety-999'));
  });
});

// ─── Exports ───

describe('Auto-Commit Safety — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorCreateSafetyBranch, 'function');
    assert.strictEqual(typeof index.reflectorRunTestGate, 'function');
    assert.strictEqual(typeof index.reflectorMergeIfPassing, 'function');
    assert.strictEqual(typeof index.reflectorSafeAutoCommit, 'function');
    assert.strictEqual(typeof index.reflectorAutoCommitStats, 'function');
    assert.strictEqual(typeof index.reflectorFormatAutoCommit, 'function');
    assert.strictEqual(typeof index.reflectorLoadAutoCommitHistory, 'function');
  });
});

// ─── Reflector functions accessible (MCP consolidated) ───

describe('Auto-Commit Safety — reflector functions (MCP consolidated)', () => {
  it('safeAutoCommit and related functions are directly importable', () => {
    const report = require('../src/reflector/report');
    assert.strictEqual(typeof report.safeAutoCommit, 'function');
    assert.strictEqual(typeof report.createSafetyBranch, 'function');
    assert.strictEqual(typeof report.runTestGate, 'function');
    assert.strictEqual(typeof report.mergeIfPassing, 'function');
    assert.strictEqual(typeof report.autoCommitStats, 'function');
    assert.strictEqual(typeof report.formatAutoCommit, 'function');
  });

  it('MCP has 12 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 12);
  });
});
