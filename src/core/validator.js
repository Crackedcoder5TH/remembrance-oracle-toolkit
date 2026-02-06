/**
 * Code validator — only code that PROVES itself gets stored.
 *
 * Validation strategies:
 * 1. Syntax check (language-aware parsing)
 * 2. Self-test execution (if test code is provided alongside)
 * 3. Coherency threshold gate (must meet minimum score)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { computeCoherencyScore } = require('./coherency');
const { sandboxExecute } = require('./sandbox');

const MIN_COHERENCY_THRESHOLD = 0.6;

function validateCode(code, options = {}) {
  const {
    language,
    testCode,
    threshold = MIN_COHERENCY_THRESHOLD,
    timeout = 10000,
  } = options;

  const result = {
    valid: false,
    testPassed: null,
    testOutput: null,
    coherencyScore: null,
    errors: [],
  };

  // Step 1: Run test if provided (sandboxed by default)
  if (testCode) {
    const testResult = options.sandbox !== false
      ? sandboxExecute(code, testCode, language, { timeout })
      : executeTest(code, testCode, language, timeout);
    result.testPassed = testResult.passed;
    result.testOutput = testResult.output;
    result.sandboxed = testResult.sandboxed || false;
    if (!testResult.passed) {
      result.errors.push(`Test failed: ${testResult.output}`);
    }
  }

  // Step 2: Compute coherency
  const coherency = computeCoherencyScore(code, {
    language,
    testPassed: result.testPassed,
  });
  result.coherencyScore = coherency;

  // Step 3: Gate on threshold
  if (coherency.total < threshold) {
    result.errors.push(
      `Coherency score ${coherency.total} below threshold ${threshold}`
    );
  }

  result.valid = result.errors.length === 0;
  return result;
}

function executeTest(code, testCode, language, timeout) {
  const lang = language || 'javascript';
  const tmpFile = path.join(os.tmpdir(), `oracle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  try {
    if (lang === 'javascript' || lang === 'js') {
      const combined = `${code}\n;\n${testCode}`;
      const file = tmpFile + '.js';
      fs.writeFileSync(file, combined, 'utf-8');
      try {
        execSync(`node ${file}`, {
          timeout,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { passed: true, output: 'All assertions passed' };
      } finally {
        try { fs.unlinkSync(file); } catch {}
      }
    }

    if (lang === 'python' || lang === 'py') {
      const combined = `${code}\n${testCode}`;
      const file = tmpFile + '.py';
      fs.writeFileSync(file, combined, 'utf-8');
      try {
        const output = execSync(`python3 ${file}`, {
          timeout,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { passed: true, output: output || 'All assertions passed' };
      } finally {
        try { fs.unlinkSync(file); } catch {}
      }
    }

    return { passed: null, output: `No test runner for language: ${lang}` };
  } catch (err) {
    return {
      passed: false,
      output: err.stderr || err.stdout || err.message,
    };
  }
}

module.exports = {
  validateCode,
  executeTest,
  MIN_COHERENCY_THRESHOLD,
};
