/**
 * Code validator — only code that PROVES itself gets stored.
 *
 * Validation strategies:
 * 1. Syntax check (language-aware parsing)
 * 2. Self-test execution (if test code is provided alongside)
 * 3. Coherency threshold gate (must meet minimum score)
 */

const { execSync, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { computeCoherencyScore, contentTypeForLanguage } = require('../unified/coherency');
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

  // Determine content type — non-code content skips covenant and test execution
  const contentType = options.contentType || contentTypeForLanguage(language);
  const isNonCode = contentType !== 'code';

  // Step 0: Covenant check — the seal above all code (skipped for non-code content)
  if (!skipCovenant && !isNonCode) {
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
  // Trust mode: allows sandbox to access node_modules and node: built-ins
  // Used during candidate promotion where patterns may require project dependencies
  // Non-code content types skip test execution entirely
  if (testCode && !isNonCode) {
    const sandboxOpts = { timeout };
    if (options.trustMode) sandboxOpts.trustMode = true;
    const testResult = options.sandbox !== false
      ? sandboxExecute(code, testCode, language, sandboxOpts)
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
    contentType,
    testPassed: isNonCode ? null : result.testPassed,
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-test-'));
  const tmpFile = path.join(tmpDir, `test-${crypto.randomBytes(8).toString('hex')}`);

  try {
    if (lang === 'javascript' || lang === 'js') {
      // Write code to separate module to avoid const/let redeclaration conflicts
      const codeFile = tmpFile + '-code.js';
      const testFile = tmpFile + '.js';
      fs.writeFileSync(codeFile, code, 'utf-8');
      const hasRequire = /require\s*\(\s*['"][^'"]+['"]\s*\)/.test(testCode);
      const testContent = hasRequire
        ? testCode.replace(/require\s*\(\s*['"](?:\.\.?\/[^'"]+)['"]\s*\)/g, `require('${codeFile}')`)
        : `${code}\n;\n${testCode}`;
      fs.writeFileSync(testFile, testContent, 'utf-8');
      try {
        execFileSync('node', [testFile], {
          timeout,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { passed: true, output: 'All assertions passed' };
      } finally {
        try { fs.unlinkSync(testFile); } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[validator:executeTest] silent failure:', e?.message || e);
        }
        try { fs.unlinkSync(codeFile); } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[validator:executeTest] silent failure:', e?.message || e);
        }
      }
    }

    if (lang === 'python' || lang === 'py') {
      const codeFile = tmpFile + '_code.py';
      const testFile = tmpFile + '.py';
      fs.writeFileSync(codeFile, code, 'utf-8');
      const hasImport = /(?:from\s+\S+\s+import|import\s+\S+)/.test(testCode);
      const testContent = hasImport
        ? testCode.replace(/from\s+\S+\s+import\s+/g, `from ${path.basename(codeFile, '.py')} import `)
        : `${code}\n${testCode}`;
      fs.writeFileSync(testFile, testContent, 'utf-8');
      try {
        const output = execFileSync('python3', [testFile], {
          timeout,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { passed: true, output: output || 'All assertions passed' };
      } finally {
        try { fs.unlinkSync(testFile); } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[validator:executeTest] silent failure:', e?.message || e);
        }
        try { fs.unlinkSync(codeFile); } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[validator:executeTest] silent failure:', e?.message || e);
        }
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
