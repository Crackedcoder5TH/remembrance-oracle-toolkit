/**
 * Test runner that concatenates each source+test pair (mimicking isolated sandbox)
 * and runs them via node --test.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const dir = __dirname;
const testFiles = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();
let allPassed = true;

for (const testFile of testFiles) {
  const baseName = testFile.replace('.test.js', '.js');
  const srcPath = path.join(dir, baseName);
  const testPath = path.join(dir, testFile);

  if (!fs.existsSync(srcPath)) {
    console.error(`SKIP: No source file found for ${testFile}`);
    continue;
  }

  // Read source and strip module.exports line to get pure function definitions
  let src = fs.readFileSync(srcPath, 'utf8');
  src = src.replace(/^module\.exports\s*=.*/m, '');

  const test = fs.readFileSync(testPath, 'utf8');
  const combined = src + '\n' + test;

  // Write combined to temp file
  const tmpFile = path.join(os.tmpdir(), `sandbox-test-${baseName}`);
  fs.writeFileSync(tmpFile, combined);

  try {
    const output = execSync(`node --test ${tmpFile}`, {
      encoding: 'utf8',
      timeout: 30000
    });
    console.log(`PASS: ${baseName}`);
  } catch (err) {
    allPassed = false;
    console.error(`FAIL: ${baseName}`);
    console.error(err.stdout || '');
    console.error(err.stderr || '');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

if (!allPassed) {
  process.exit(1);
}

console.log('\nAll tests passed!');
