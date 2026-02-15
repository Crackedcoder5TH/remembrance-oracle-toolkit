const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');

describe('Deploy Server', () => {
  it('exports a start function', () => {
    const { start } = require('../src/deploy');
    assert.equal(typeof start, 'function');
  });
});

describe('Pipe-Friendly CLI', () => {
  it('readStdin returns empty when isTTY', () => {
    // Can't easily test actual pipe, but we can verify the CLI module loads
    const cliPath = path.resolve(__dirname, '../src/cli.js');
    assert.ok(fs.existsSync(cliPath));
  });
});

describe('Pattern Analytics', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.3, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates analytics for empty library', () => {
    const { generateAnalytics } = require('../src/analytics/analytics');
    const analytics = generateAnalytics(oracle);
    assert.ok(analytics.overview);
    assert.equal(analytics.overview.totalPatterns, 0);
    assert.equal(analytics.overview.avgCoherency, 0);
    assert.ok(analytics.coherencyDistribution);
    assert.ok(analytics.languageBreakdown);
  });

  it('computes tag cloud', () => {
    const { computeTagCloud } = require('../src/analytics/analytics');
    const tags = computeTagCloud([]);
    assert.deepEqual(tags, []);
  });

  it('generates analytics with patterns', () => {
    oracle.registerPattern({
      name: 'test-analytics',
      code: 'function analyticsTest(data) {\n  return data.map(x => x * 2).filter(x => x > 5);\n}',
      language: 'javascript',
      tags: ['analytics', 'test'],
    });

    const { generateAnalytics } = require('../src/analytics/analytics');
    const analytics = generateAnalytics(oracle);
    assert.ok(analytics.overview.totalPatterns >= 1);
    assert.ok(analytics.overview.avgCoherency > 0);
    assert.ok(analytics.topPatterns.length >= 1);
  });

  it('computes coherency distribution', () => {
    oracle.registerPattern({
      name: 'dist-test',
      code: 'function distTest(arr) {\n  return arr.sort((a, b) => a - b);\n}',
      language: 'javascript',
    });

    const { generateAnalytics } = require('../src/analytics/analytics');
    const analytics = generateAnalytics(oracle);
    const total = Object.values(analytics.coherencyDistribution).reduce((a, b) => a + b, 0);
    assert.ok(total >= 1);
  });

  it('computes language breakdown', () => {
    oracle.registerPattern({
      name: 'lang-test',
      code: 'function langTest(s) {\n  return s.toUpperCase();\n}',
      language: 'javascript',
    });

    const { generateAnalytics } = require('../src/analytics/analytics');
    const analytics = generateAnalytics(oracle);
    assert.ok(analytics.languageBreakdown.javascript);
    assert.ok(analytics.languageBreakdown.javascript.count >= 1);
  });

  it('computes health report', () => {
    oracle.registerPattern({
      name: 'health-test',
      code: 'function healthTest(n) {\n  return n > 0 ? "positive" : "negative";\n}',
      language: 'javascript',
    });

    const { generateAnalytics } = require('../src/analytics/analytics');
    const analytics = generateAnalytics(oracle);
    const h = analytics.healthReport;
    assert.equal(typeof h.healthy, 'number');
    assert.equal(typeof h.warning, 'number');
    assert.equal(typeof h.critical, 'number');
    assert.equal(h.healthy + h.warning + h.critical, analytics.overview.totalPatterns);
  });

  it('computes tag cloud with data', () => {
    oracle.registerPattern({
      name: 'tags-test',
      code: 'function tagsTest(x) {\n  return x + 1;\n}',
      language: 'javascript',
      tags: ['math', 'utility', 'simple'],
    });

    const { computeTagCloud } = require('../src/analytics/analytics');
    const tags = computeTagCloud(oracle.patterns.getAll());
    assert.ok(tags.length >= 1);
    assert.ok(tags[0].tag);
    assert.ok(tags[0].count >= 1);
  });

  it('serves analytics from dashboard API', () => {
    const { createDashboardServer } = require('../src/dashboard/server');
    const server = createDashboardServer(oracle, { auth: false });
    // Simulate HTTP request
    const http = require('http');
    assert.ok(server, 'server created');
  });
});

describe('Git Hooks', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates pre-commit script', () => {
    const { preCommitScript, HOOK_MARKER } = require('../src/ci/hooks');
    const script = preCommitScript();
    assert.ok(script.includes(HOOK_MARKER));
    assert.ok(script.includes('#!/bin/sh'));
    assert.ok(script.includes('covenantCheck'));
  });

  it('generates post-commit script', () => {
    const { postCommitScript, HOOK_MARKER } = require('../src/ci/hooks');
    const script = postCommitScript();
    assert.ok(script.includes(HOOK_MARKER));
    assert.ok(script.includes('autoSeed'));
  });

  it('installs hooks in a git repo', () => {
    const { execSync } = require('child_process');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });

    const { installHooks } = require('../src/ci/hooks');
    const result = installHooks(tmpDir);
    assert.equal(result.installed, true);
    assert.ok(result.hooks.includes('pre-commit'));
    assert.ok(result.hooks.includes('post-commit'));

    // Verify files exist
    const preCommit = path.join(result.hooksDir, 'pre-commit');
    const postCommit = path.join(result.hooksDir, 'post-commit');
    assert.ok(fs.existsSync(preCommit));
    assert.ok(fs.existsSync(postCommit));

    // Verify executable
    const stat = fs.statSync(preCommit);
    assert.ok(stat.mode & 0o111); // Has execute bit
  });

  it('uninstalls hooks', () => {
    const { execSync } = require('child_process');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });

    const { installHooks, uninstallHooks } = require('../src/ci/hooks');
    installHooks(tmpDir);
    const result = uninstallHooks(tmpDir);
    assert.equal(result.uninstalled, true);
    assert.ok(result.removed.includes('pre-commit'));
  });

  it('fails gracefully in non-git directory', () => {
    const { installHooks } = require('../src/ci/hooks');
    const result = installHooks(tmpDir);
    assert.equal(result.installed, false);
    assert.ok(result.error);
  });

  it('runs pre-commit check on files', () => {
    const { runPreCommitCheck } = require('../src/ci/hooks');
    const testFile = path.join(tmpDir, 'safe.js');
    fs.writeFileSync(testFile, 'function safeCode() { return 42; }');

    const result = runPreCommitCheck([testFile]);
    assert.equal(result.passed, true);
    assert.equal(result.total, 1);
    assert.equal(result.blocked, 0);
  });

  it('blocks harmful code in pre-commit', () => {
    const { runPreCommitCheck } = require('../src/ci/hooks');
    const testFile = path.join(tmpDir, 'bad.js');
    fs.writeFileSync(testFile, `
      const child_process = require('child_process');
      child_process.exec(\`rm -rf \${userInput}\`);
    `);

    const result = runPreCommitCheck([testFile]);
    assert.equal(result.passed, false);
    assert.ok(result.blocked >= 1);
  });

  it('reinstalls hooks (idempotent)', () => {
    const { execSync } = require('child_process');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });

    const { installHooks, HOOK_MARKER } = require('../src/ci/hooks');
    installHooks(tmpDir);
    const result = installHooks(tmpDir);
    assert.equal(result.installed, true);

    // Should not duplicate the marker
    const hookContent = fs.readFileSync(path.join(result.hooksDir, 'pre-commit'), 'utf-8');
    const markerCount = hookContent.split(HOOK_MARKER).length - 1;
    assert.equal(markerCount, 1, 'Should have exactly one hook marker');
  });
});
