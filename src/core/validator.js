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
const { covenantCheck } = require('./covenant');
const { actionableFeedback, formatFeedback } = require('./feedback');
const {
  MIN_COHERENCY_THRESHOLD,
  DEFAULT_VALIDATION_TIMEOUT_MS,
} = require('../constants/thresholds');

/**
 * Validates code through covenant check, optional test execution, and coherency scoring.
 * Only code that passes all validation gates is considered valid.
 * @param {string} code - The source code to validate
 * @param {Object} options - Validation options
 * @param {string} [options.language] - Programming language (e.g., 'javascript', 'python')
 * @param {string} [options.testCode] - Test code to execute against the source code
 * @param {number} [options.threshold] - Minimum coherency threshold (default: MIN_COHERENCY_THRESHOLD)
 * @param {number} [options.timeout] - Test execution timeout in milliseconds (default: DEFAULT_VALIDATION_TIMEOUT_MS)
 * @param {boolean} [options.skipCovenant] - Skip covenant check if true
 * @param {string} [options.description] - Code description for covenant context
 * @param {string[]} [options.tags] - Code tags for covenant context
 * @param {boolean} [options.sandbox] - Use sandboxed execution if true (default: true)
 * @returns {{valid: boolean, testPassed: boolean|null, testOutput: string|null, coherencyScore: Object|null, covenantResult: Object|null, errors: string[], feedback: Object|null}} Validation result
 */
function validateCode(code, options = {}) {
  if (code == null || typeof code !== 'string') {
    return { valid: false, testPassed: null, testOutput: null, coherencyScore: null, covenantResult: null, errors: ['Invalid input: code must be a non-null string'], feedback: null };
  }
  const {
    language,
    testCode,
    threshold = MIN_COHERENCY_THRESHOLD,
    timeout = DEFAULT_VALIDATION_TIMEOUT_MS,
    skipCovenant = false,
  } = options;

  const result = {
    valid: false,
    testPassed: null,
    testOutput: null,
    coherencyScore: null,
    covenantResult: null,
    errors: [],
    feedback: null,
  };

  // Step 0: Covenant check — the seal above all code
  if (!skipCovenant) {
    const covenant = covenantCheck(code, {
      description: options.description,
      tags: options.tags,
      language,
    });
    result.covenantResult = covenant;
    if (!covenant.sealed) {
      for (const v of covenant.violations) {
        result.errors.push(`Covenant broken [${v.name}]: ${v.reason}`);
      }
      // Generate actionable feedback for covenant violations
      result.feedback = actionableFeedback(code, result);
      return result; // Rejected — does not reach coherency or testing
    }
  }

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

  // Generate actionable feedback for any failures
  if (!result.valid) {
    result.feedback = actionableFeedback(code, result);
  }

  return result;
}

/**
 * Executes test code against source code in a temporary file environment.
 * Supports JavaScript/JS and Python/Py with language-specific test runners.
 * @param {string} code - The source code to test
 * @param {string} testCode - The test code to execute
 * @param {string} language - Programming language ('javascript', 'js', 'python', 'py')
 * @param {number} timeout - Execution timeout in milliseconds
 * @returns {{passed: boolean|null, output: string}} Test execution result with pass status and output
 */
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
