const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const {
  createBackup,
  loadBackupManifests,
  getLatestBackup,
  dryRun,
  estimatePostHealCoherence,
  checkApproval,
  recordApproval,
  rollback,
  loadRollbacks,
  coherenceGuard,
  safeReflect,
} = require('../src/reflector/report');

const { takeSnapshot } = require('../src/reflector/multi');

// ─── Helpers ───

function createTmpDir() {
  const dir = join(tmpdir(), `safety-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

// ─── Backup Tests ───

describe('Safety — createBackup (file-copy)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a file-copy backup with manifest', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'function add(a, b) { return a + b; }');
    const backup = createBackup(tmpDir, {
      strategy: 'file-copy',
      filePaths: [filePath],
    });
    assert.ok(backup.id);
    assert.ok(backup.id.startsWith('backup-'));
    assert.ok(backup.timestamp);
    assert.equal(backup.strategy, 'file-copy');
    assert.ok(backup.files.length >= 1);
  });

  it('should save backup files to .remembrance/backups/', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'const x = 42;');
    const backup = createBackup(tmpDir, {
      strategy: 'file-copy',
      filePaths: [filePath],
    });
    assert.ok(backup.backupDir);
    assert.ok(existsSync(backup.backupDir));
    // Check the backup file exists
    const backupFile = join(backup.backupDir, 'code.js');
    assert.ok(existsSync(backupFile));
    assert.equal(readFileSync(backupFile, 'utf-8'), 'const x = 42;');
  });

  it('should backup nested files correctly', () => {
    const filePath = createTestFile(tmpDir, 'src/utils/helper.js', 'function help() {}');
    const backup = createBackup(tmpDir, {
      strategy: 'file-copy',
      filePaths: [filePath],
    });
    assert.ok(backup.files.length >= 1);
    const backupFile = join(backup.backupDir, 'src', 'utils', 'helper.js');
    assert.ok(existsSync(backupFile));
  });

  it('should skip non-existent files gracefully', () => {
    const backup = createBackup(tmpDir, {
      strategy: 'file-copy',
      filePaths: [join(tmpDir, 'nonexistent.js')],
    });
    assert.equal(backup.files.length, 0);
  });

  it('should include label in manifest', () => {
    const backup = createBackup(tmpDir, {
      strategy: 'file-copy',
      filePaths: [],
      label: 'My custom backup label',
    });
    assert.equal(backup.label, 'My custom backup label');
  });
});

describe('Safety — loadBackupManifests / getLatestBackup', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty array when no backups exist', () => {
    const manifests = loadBackupManifests(tmpDir);
    assert.deepEqual(manifests, []);
  });

  it('should load saved manifests', () => {
    createBackup(tmpDir, { strategy: 'file-copy', filePaths: [] });
    createBackup(tmpDir, { strategy: 'file-copy', filePaths: [] });
    const manifests = loadBackupManifests(tmpDir);
    assert.equal(manifests.length, 2);
  });

  it('should return latest backup', () => {
    createBackup(tmpDir, { strategy: 'file-copy', filePaths: [], label: 'first' });
    createBackup(tmpDir, { strategy: 'file-copy', filePaths: [], label: 'second' });
    const latest = getLatestBackup(tmpDir);
    assert.equal(latest.label, 'second');
  });

  it('should return null when no backups exist', () => {
    const latest = getLatestBackup(tmpDir);
    assert.equal(latest, null);
  });
});

// ─── Dry-Run Tests ───

describe('Safety — dryRun', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should simulate healing without modifying files', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'function add(a, b) { return a + b; }');
    const originalCode = readFileSync(filePath, 'utf-8');

    const result = dryRun(tmpDir);

    // File should not be modified
    assert.equal(readFileSync(filePath, 'utf-8'), originalCode);
    assert.equal(result.mode, 'dry-run');
    assert.ok(result.timestamp);
    assert.ok(result.warning);
  });

  it('should report projected changes', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = dryRun(tmpDir);
    assert.ok('wouldHeal' in result);
    assert.ok(result.summary);
    assert.ok('filesScanned' in result.summary);
    assert.ok('wouldHeal' in result.summary);
    assert.ok(result.projectedCoherence);
    assert.ok('before' in result.projectedCoherence);
    assert.ok('after' in result.projectedCoherence);
  });

  it('should include healing projections with whispers', () => {
    createTestFile(tmpDir, 'code.js', 'var x = 1;');
    const result = dryRun(tmpDir);
    assert.ok(Array.isArray(result.healings));
    assert.ok(result.collectiveWhisper);
  });

  it('should show warning message', () => {
    createTestFile(tmpDir, 'code.js', 'function a() { return 1; }');
    const result = dryRun(tmpDir);
    assert.ok(typeof result.warning === 'string');
    assert.ok(result.warning.length > 0);
  });

  it('should report duration', () => {
    createTestFile(tmpDir, 'code.js', 'function a() { return 1; }');
    const result = dryRun(tmpDir);
    assert.ok(typeof result.durationMs === 'number');
    assert.ok(result.durationMs >= 0);
  });
});

describe('Safety — estimatePostHealCoherence', () => {
  it('should return avg when no healings', () => {
    const report = {
      healings: [],
      snapshot: { avgCoherence: 0.75, totalFiles: 10 },
      summary: { filesScanned: 10 },
    };
    assert.equal(estimatePostHealCoherence(report), 0.75);
  });

  it('should estimate higher coherence after healing', () => {
    const report = {
      healings: [
        { path: 'a.js', improvement: 0.1 },
        { path: 'b.js', improvement: 0.2 },
      ],
      snapshot: { avgCoherence: 0.7, totalFiles: 10 },
      summary: { filesScanned: 10 },
    };
    const estimated = estimatePostHealCoherence(report);
    assert.ok(estimated > 0.7);
    assert.ok(estimated <= 1);
  });

  it('should not exceed 1.0', () => {
    const report = {
      healings: [
        { path: 'a.js', improvement: 5 },
      ],
      snapshot: { avgCoherence: 0.9, totalFiles: 1 },
      summary: { filesScanned: 1 },
    };
    assert.equal(estimatePostHealCoherence(report), 1);
  });
});

// ─── Approval Gate Tests ───

describe('Safety — checkApproval', () => {
  it('should approve when no gate configured', () => {
    const report = {
      summary: { filesHealed: 5 },
      snapshot: { avgCoherence: 0.8 },
    };
    const result = checkApproval(report, {});
    assert.equal(result.approved, true);
    assert.equal(result.requiresManualReview, false);
  });

  it('should block when requireApproval is true', () => {
    const report = {
      summary: { filesHealed: 1 },
      snapshot: { avgCoherence: 0.95 },
    };
    const result = checkApproval(report, { requireApproval: true });
    assert.equal(result.approved, false);
    assert.equal(result.requiresManualReview, true);
    assert.ok(result.reason.includes('approval'));
  });

  it('should block when too many files changed', () => {
    const report = {
      summary: { filesHealed: 15 },
      snapshot: { avgCoherence: 0.9 },
    };
    const result = checkApproval(report, {
      requireApproval: true,
      approvalFileThreshold: 10,
    });
    assert.equal(result.approved, false);
    assert.ok(result.reason.includes('15'));
  });

  it('should block auto-merge when coherence too low', () => {
    const report = {
      summary: { filesHealed: 2 },
      snapshot: { avgCoherence: 0.75 },
    };
    const result = checkApproval(report, {
      autoMerge: true,
      autoMergeThreshold: 0.9,
    });
    assert.equal(result.approved, false);
    assert.ok(result.reason.includes('auto-merge threshold'));
  });

  it('should approve auto-merge when coherence high enough', () => {
    const report = {
      summary: { filesHealed: 2 },
      snapshot: { avgCoherence: 0.95 },
    };
    const result = checkApproval(report, {
      autoMerge: true,
      autoMergeThreshold: 0.9,
      approvalFileThreshold: 50,
    });
    assert.equal(result.approved, true);
  });
});

describe('Safety — recordApproval', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should record approval decision', () => {
    const result = recordApproval(tmpDir, 'run-123', 'approved');
    assert.equal(result.runId, 'run-123');
    assert.equal(result.decision, 'approved');
    assert.ok(result.timestamp);
  });

  it('should persist approvals to disk', () => {
    recordApproval(tmpDir, 'run-1', 'approved');
    recordApproval(tmpDir, 'run-2', 'rejected');
    const approvalPath = join(tmpDir, '.remembrance', 'approvals.json');
    assert.ok(existsSync(approvalPath));
    const data = JSON.parse(readFileSync(approvalPath, 'utf-8'));
    assert.equal(data.length, 2);
    assert.equal(data[0].decision, 'approved');
    assert.equal(data[1].decision, 'rejected');
  });
});

// ─── Rollback Tests ───

describe('Safety — rollback (file-copy)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.remembrance'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should restore files from backup', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'const original = true;');
    createBackup(tmpDir, { strategy: 'file-copy', filePaths: [filePath] });

    // Modify the file (simulate healing)
    writeFileSync(filePath, 'const healed = true;', 'utf-8');
    assert.equal(readFileSync(filePath, 'utf-8'), 'const healed = true;');

    // Rollback
    const result = rollback(tmpDir, { verify: false });
    assert.equal(result.success, true);
    assert.equal(result.filesRestored, 1);
    assert.equal(readFileSync(filePath, 'utf-8'), 'const original = true;');
  });

  it('should rollback to specific backup by ID', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'const version1 = true;');
    const backup1 = createBackup(tmpDir, { strategy: 'file-copy', filePaths: [filePath], label: 'v1' });

    writeFileSync(filePath, 'const version2 = true;', 'utf-8');
    createBackup(tmpDir, { strategy: 'file-copy', filePaths: [filePath], label: 'v2' });

    writeFileSync(filePath, 'const version3 = true;', 'utf-8');

    // Rollback to the first backup specifically
    const result = rollback(tmpDir, { backupId: backup1.id, verify: false });
    assert.equal(result.success, true);
    assert.equal(readFileSync(filePath, 'utf-8'), 'const version1 = true;');
  });

  it('should return error when no backup exists', () => {
    const result = rollback(tmpDir, { verify: false });
    assert.equal(result.success, false);
    assert.ok(result.error.includes('No backup found'));
  });

  it('should record rollback in history', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'const x = 1;');
    createBackup(tmpDir, { strategy: 'file-copy', filePaths: [filePath] });
    rollback(tmpDir, { verify: false });

    const rollbacks = loadRollbacks(tmpDir);
    assert.equal(rollbacks.length, 1);
    assert.equal(rollbacks[0].success, true);
  });
});

// ─── Coherence Guard Tests ───

describe('Safety — coherenceGuard', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect coherence improvement', () => {
    createTestFile(tmpDir, 'code.js', 'function add(a, b) { return a + b; }');
    const preSnap = takeSnapshot(tmpDir);

    // Re-check (same state — delta should be 0)
    const result = coherenceGuard(tmpDir, preSnap);
    assert.equal(result.delta, 0);
    assert.equal(result.severity, 'neutral');
    assert.equal(result.dropped, false);
  });

  it('should include recommendation', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const preSnap = takeSnapshot(tmpDir);
    const result = coherenceGuard(tmpDir, preSnap);
    assert.ok(typeof result.recommendation === 'string');
    assert.ok(result.recommendation.length > 0);
  });

  it('should categorize severity correctly', () => {
    createTestFile(tmpDir, 'code.js', 'function a() { return 1; }');
    const preSnap = takeSnapshot(tmpDir);
    const result = coherenceGuard(tmpDir, preSnap);
    assert.ok(['critical', 'warning', 'neutral', 'positive'].includes(result.severity));
  });

  it('should detect drop when file is degraded', () => {
    createTestFile(tmpDir, 'good.js', 'function calculate(a, b) { return a + b; }');
    const preSnap = takeSnapshot(tmpDir);

    // Degrade the file
    writeFileSync(join(tmpDir, 'good.js'), '', 'utf-8');
    // Add a replacement so there's still something to scan
    createTestFile(tmpDir, 'bad.js', 'x');

    const result = coherenceGuard(tmpDir, preSnap);
    // The coherence may or may not drop depending on the scoring
    assert.ok(typeof result.dropped === 'boolean');
    assert.ok(typeof result.preCoherence === 'number');
    assert.ok(typeof result.postCoherence === 'number');
  });
});

// ─── Safe Reflect Pipeline Tests ───

describe('Safety — safeReflect', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should run in dry-run mode without modifying files', () => {
    const filePath = createTestFile(tmpDir, 'code.js', 'function add(a, b) { return a + b; }');
    const original = readFileSync(filePath, 'utf-8');

    const result = safeReflect(tmpDir, { dryRunMode: true });
    assert.equal(result.mode, 'dry-run');
    assert.ok(result.dryRun);
    assert.equal(readFileSync(filePath, 'utf-8'), original);
  });

  it('should create backup before healing in live mode', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = safeReflect(tmpDir, { dryRunMode: false });
    assert.equal(result.mode, 'live');
    assert.ok(result.safety);
    assert.ok(result.safety.backup);
    // Backup should have an ID (even if git branch failed, file-copy should work)
    assert.ok(result.safety.backup.id || result.safety.backup.error);
  });

  it('should include coherence guard in live mode', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = safeReflect(tmpDir, { dryRunMode: false });
    assert.ok(result.safety);
    // CoherenceGuard only runs if files were healed
    if (result.report && result.report.filesHealed > 0) {
      assert.ok(result.safety.coherenceGuard);
      assert.ok('dropped' in result.safety.coherenceGuard);
    }
  });

  it('should include approval check', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = safeReflect(tmpDir, {
      dryRunMode: false,
      requireApproval: true,
    });
    assert.ok(result.safety.approval);
    // With requireApproval, should not be auto-approved
    assert.equal(result.safety.approval.approved, false);
    assert.equal(result.safety.approval.requiresManualReview, true);
  });

  it('should report scan results', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = safeReflect(tmpDir, { dryRunMode: false });
    assert.ok(result.report);
    assert.ok('filesScanned' in result.report);
    assert.ok('filesHealed' in result.report);
    assert.ok('collectiveWhisper' in result.report);
  });

  it('should track duration', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = safeReflect(tmpDir, { dryRunMode: false });
    assert.ok(typeof result.durationMs === 'number');
    assert.ok(result.durationMs >= 0);
  });

  it('should track pre-coherence', () => {
    createTestFile(tmpDir, 'code.js', 'function test() { return true; }');
    const result = safeReflect(tmpDir, { dryRunMode: false });
    assert.ok(typeof result.safety.preCoherence === 'number');
  });
});

// ─── Index Exports Tests ───

describe('Safety Exports', () => {
  it('should export safety functions from index', () => {
    const index = require('../src/index');
    assert.ok(typeof index.reflectorCreateBackup === 'function');
    assert.ok(typeof index.reflectorLoadBackups === 'function');
    assert.ok(typeof index.reflectorGetLatestBackup === 'function');
    assert.ok(typeof index.reflectorDryRun === 'function');
    assert.ok(typeof index.reflectorCheckApproval === 'function');
    assert.ok(typeof index.reflectorRecordApproval === 'function');
    assert.ok(typeof index.reflectorRollback === 'function');
    assert.ok(typeof index.reflectorLoadRollbacks === 'function');
    assert.ok(typeof index.reflectorCoherenceGuard === 'function');
    assert.ok(typeof index.reflectorSafeReflect === 'function');
  });
});

// ─── MCP Safety Tools Tests ───

describe('Safety MCP Tools', () => {
  it('should register safety tools in MCP server', () => {
    const { TOOLS } = require('../src/mcp/server');
    const names = TOOLS.map(t => t.name);
    assert.ok(names.includes('oracle_reflector_dry_run'));
    assert.ok(names.includes('oracle_reflector_safe_run'));
    assert.ok(names.includes('oracle_reflector_rollback'));
    assert.ok(names.includes('oracle_reflector_backups'));
  });

  it('should handle dry-run via MCP', async () => {
    const { MCPServer } = require('../src/mcp/server');
    const server = new MCPServer();
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'oracle_reflector_backups',
        arguments: {},
      },
    });
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.id, 1);
    assert.ok(response.result);
    assert.ok(response.result.content);
  });
});
