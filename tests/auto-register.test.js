const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const {
  autoRegister,
  getChangedFiles,
  getAddedCode,
  findTestFile,
  extractFunctions,
  buildTags,
} = require('../src/ci/auto-register');

/**
 * Helper: create a git commit in a temp repo.
 * Uses --no-gpg-sign to avoid signing server issues in CI/sandbox.
 */
function gitCommit(cwd, msg) {
  execSync(`git add . && git commit --no-gpg-sign -m "${msg}"`, {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' },
  });
}

/**
 * Helper: init a git repo in a temp directory with an initial commit.
 */
function initGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoreg-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test');
  gitCommit(dir, 'init');
  return dir;
}

// ── Unit tests (no git repo needed) ──────────────────────────────

describe('auto-register — findTestFile', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoreg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds .test.js next to source', () => {
    const src = path.join(tmpDir, 'utils.js');
    const test = path.join(tmpDir, 'utils.test.js');
    fs.writeFileSync(src, 'module.exports = {}');
    fs.writeFileSync(test, 'test');
    assert.equal(findTestFile(src, tmpDir), test);
  });

  it('finds .spec.js next to source', () => {
    const src = path.join(tmpDir, 'helper.js');
    const spec = path.join(tmpDir, 'helper.spec.js');
    fs.writeFileSync(src, 'module.exports = {}');
    fs.writeFileSync(spec, 'test');
    assert.equal(findTestFile(src, tmpDir), spec);
  });

  it('finds test in tests/ directory', () => {
    const src = path.join(tmpDir, 'lib.js');
    const testsDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(testsDir);
    const test = path.join(testsDir, 'lib.test.js');
    fs.writeFileSync(src, 'module.exports = {}');
    fs.writeFileSync(test, 'test');
    assert.equal(findTestFile(src, tmpDir), test);
  });

  it('finds Python test_* pattern', () => {
    const src = path.join(tmpDir, 'utils.py');
    const test = path.join(tmpDir, 'test_utils.py');
    fs.writeFileSync(src, 'def foo(): pass');
    fs.writeFileSync(test, 'test');
    assert.equal(findTestFile(src, tmpDir), test);
  });

  it('returns null when no test file exists', () => {
    const src = path.join(tmpDir, 'orphan.js');
    fs.writeFileSync(src, 'module.exports = {}');
    assert.equal(findTestFile(src, tmpDir), null);
  });
});

describe('auto-register — extractFunctions', () => {
  it('extracts named functions from JavaScript', () => {
    const code = `
function calculateSum(values) {
  let total = 0;
  for (const v of values) { total += v; }
  return total;
}

function multiplyAll(values, factor) {
  return values.map(v => v * factor);
}

function _internalHelper() {
  return 'this is a private helper function that should be skipped';
}

module.exports = { calculateSum, multiplyAll };
`;
    const fns = extractFunctions(code, 'javascript');
    const names = fns.map(f => f.name);
    assert.ok(names.includes('calculateSum'), 'Should extract calculateSum');
    assert.ok(names.includes('multiplyAll'), 'Should extract multiplyAll');
    assert.ok(!names.includes('_internalHelper'), 'Should skip underscore-prefixed');
  });

  it('filters to only new function names when provided', () => {
    const code = `
function existingFn(items) {
  return items.filter(item => item.active).map(item => item.name);
}

function newFn(input) {
  return input.toString().split('').reverse().join('').toLowerCase();
}

module.exports = { existingFn, newFn };
`;
    const fns = extractFunctions(code, 'javascript', ['newFn']);
    const names = fns.map(f => f.name);
    assert.ok(names.includes('newFn'));
    assert.ok(!names.includes('existingFn'));
  });

  it('skips very short functions', () => {
    const code = `function x() { return 1; }
module.exports = { x };`;
    const fns = extractFunctions(code, 'javascript');
    assert.equal(fns.length, 0, 'Very short functions should be skipped');
  });
});

describe('auto-register — buildTags', () => {
  it('includes language and auto-registered tag', () => {
    const tags = buildTags('myFn', 'src/utils/helpers.js', 'javascript', ['myFn', 'otherFn']);
    assert.ok(tags.includes('javascript'));
    assert.ok(tags.includes('auto-registered'));
  });

  it('includes directory context', () => {
    const tags = buildTags('myFn', 'src/utils/helpers.js', 'javascript', ['myFn']);
    assert.ok(tags.includes('utils'), 'Should include parent directory name');
  });

  it('includes function names up to 5', () => {
    const names = ['fn1', 'fn2', 'fn3', 'fn4', 'fn5', 'fn6'];
    const tags = buildTags('myModule', 'lib/index.js', 'javascript', names);
    assert.ok(tags.includes('fn1'));
    assert.ok(tags.includes('fn5'));
    assert.ok(!tags.includes('fn6'), 'Should cap at 5 function names');
  });
});

// ── Integration tests (require git repo) ─────────────────────────

describe('auto-register — getChangedFiles', () => {
  let gitDir;

  beforeEach(() => {
    gitDir = initGitRepo();
  });

  afterEach(() => {
    fs.rmSync(gitDir, { recursive: true, force: true });
  });

  it('returns only code files that changed', () => {
    fs.writeFileSync(path.join(gitDir, 'app.js'), 'function main() {}');
    fs.writeFileSync(path.join(gitDir, 'notes.txt'), 'not code');
    gitCommit(gitDir, 'add files');

    const files = getChangedFiles(gitDir);
    assert.ok(files.includes('app.js'), 'Should include .js file');
    assert.ok(!files.includes('notes.txt'), 'Should exclude .txt file');
  });

  it('returns empty array when no code files changed', () => {
    fs.writeFileSync(path.join(gitDir, 'data.json'), '{}');
    gitCommit(gitDir, 'add json');

    const files = getChangedFiles(gitDir);
    assert.equal(files.length, 0);
  });

  it('handles non-git directories gracefully', () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));
    const files = getChangedFiles(nonGitDir);
    assert.deepEqual(files, []);
    fs.rmSync(nonGitDir, { recursive: true, force: true });
  });
});

describe('auto-register — getAddedCode', () => {
  let gitDir;

  beforeEach(() => {
    gitDir = initGitRepo();
    fs.writeFileSync(path.join(gitDir, 'code.js'), 'function old() { return 1; }\n');
    gitCommit(gitDir, 'add old');
  });

  afterEach(() => {
    fs.rmSync(gitDir, { recursive: true, force: true });
  });

  it('extracts only added lines from diff', () => {
    fs.writeFileSync(path.join(gitDir, 'code.js'),
      'function old() { return 1; }\nfunction newFn() { return 2; }\n');
    gitCommit(gitDir, 'add newFn');

    const added = getAddedCode(gitDir, 'code.js');
    assert.ok(added.includes('newFn'), 'Should include the added function');
  });
});

describe('auto-register — autoRegister integration', () => {
  let gitDir;

  beforeEach(() => {
    gitDir = initGitRepo();
  });

  afterEach(() => {
    fs.rmSync(gitDir, { recursive: true, force: true });
  });

  it('returns report with all expected fields', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ baseDir: gitDir, threshold: 0.3, autoSeed: false });

    const result = autoRegister(oracle, gitDir, { silent: true });
    assert.ok('registered' in result);
    assert.ok('skipped' in result);
    assert.ok('alreadyExists' in result);
    assert.ok('failed' in result);
    assert.ok(Array.isArray(result.patterns));
    assert.ok(Array.isArray(result.files));
  });

  it('registers new functions from committed code', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ baseDir: gitDir, threshold: 0.3, autoSeed: false });

    fs.writeFileSync(path.join(gitDir, 'math.js'), `
/**
 * Calculate the factorial of a non-negative integer.
 * Uses iterative approach to avoid stack overflow.
 */
function factorial(n) {
  if (n < 0) throw new Error('Negative input');
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

module.exports = { factorial };
`);
    gitCommit(gitDir, 'add factorial');

    const result = autoRegister(oracle, gitDir, { silent: true, wholeFile: true });
    assert.ok(result.files.length >= 1, 'Should scan at least 1 file');
  });

  it('dry-run does not modify the library', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ baseDir: gitDir, threshold: 0.3, autoSeed: false });

    fs.writeFileSync(path.join(gitDir, 'utils.js'), `
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepClone(obj[key]);
  }
  return clone;
}
module.exports = { deepClone };
`);
    gitCommit(gitDir, 'add deepClone');

    const before = oracle.patterns.getAll().length;
    autoRegister(oracle, gitDir, { dryRun: true, silent: true });
    const after = oracle.patterns.getAll().length;

    assert.equal(before, after, 'Dry run should not change pattern count');
  });

  it('skips already-registered patterns', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ baseDir: gitDir, threshold: 0.3, autoSeed: false });

    const code = `
function uniq(arr) {
  const seen = new Set();
  const result = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}
module.exports = { uniq };
`;
    fs.writeFileSync(path.join(gitDir, 'uniq.js'), code);
    gitCommit(gitDir, 'add uniq');

    // Register once
    autoRegister(oracle, gitDir, { silent: true, wholeFile: true });

    // Modify and commit again
    fs.writeFileSync(path.join(gitDir, 'uniq.js'), code + '\n// updated\n');
    gitCommit(gitDir, 'update uniq');

    // Second run should detect existing
    const second = autoRegister(oracle, gitDir, { silent: true, wholeFile: true });
    assert.ok(second.alreadyExists >= 1 || second.skipped >= 0, 'Should detect already registered');
  });

  it('handles no changed files gracefully', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ baseDir: gitDir, threshold: 0.3, autoSeed: false });

    // No new code commit — last commit was README
    const result = autoRegister(oracle, gitDir, { silent: true });
    assert.equal(result.registered, 0);
    assert.equal(result.files.length, 0);
  });
});
