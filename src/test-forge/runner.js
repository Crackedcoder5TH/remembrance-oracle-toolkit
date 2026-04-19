/**
 * Test Forge — Runner
 * Executes generated tests in the oracle's sandbox.
 *
 * Uses the existing sandbox infrastructure from src/core/sandbox.js
 * which provides process-isolated, memory-limited, timeout-enforced execution.
 */

'use strict';

class TestRunner {
  /**
   * @param {object} options
   * @param {number} options.timeout - Max execution time in ms (default: 10000)
   * @param {number} options.memoryLimit - Max memory in MB (default: 64)
   */
  constructor(options = {}) {
    this.timeout = options.timeout || 10000;
    this.memoryLimit = options.memoryLimit || 64;
  }

  /**
   * Run test code against pattern code.
   * @param {string} code - the pattern code
   * @param {string} testCode - the test assertions
   * @param {string} language - 'javascript', 'python', etc.
   * @returns {{ passed: boolean, output: string, duration: number, error: string|null }}
   */
  run(code, testCode, language = 'javascript') {
    const { sandboxExecute } = require('../core/sandbox');
    const start = Date.now();

    try {
      const result = sandboxExecute(code, testCode, language, {
        timeout: this.timeout,
        maxMemory: this.memoryLimit,
      });

      return {
        passed: !!result.passed,
        output: result.output || '',
        duration: Date.now() - start,
        error: result.passed ? null : (result.output || 'Test failed'),
      };
    } catch (err) {
      return {
        passed: false,
        output: err.message || 'Execution error',
        duration: Date.now() - start,
        error: err.message || 'Execution error',
      };
    }
  }

  /**
   * Run tests for multiple patterns.
   * @param {Array} patterns - array of { code, testCode, language, name }
   * @returns {{ total: number, passed: number, failed: number, results: Array }}
   */
  runBatch(patterns) {
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const p of patterns) {
      const result = this.run(p.code, p.testCode, p.language || 'javascript');
      results.push({ name: p.name || 'unnamed', ...result });
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    return { total: patterns.length, passed, failed, results };
  }
}

module.exports = { TestRunner };
