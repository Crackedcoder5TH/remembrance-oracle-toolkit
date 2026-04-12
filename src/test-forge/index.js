/**
 * Test Forge — Auto-generate, run, and score tests for oracle patterns.
 *
 * Usage:
 *   const forge = new TestForge(oracle);
 *   forge.forgeTests()           — generate tests for all untested patterns
 *   forge.forgeTest(patternId)   — generate test for one pattern
 *   forge.runTests()             — run all tests
 *   forge.scoreTests()           — score all test quality
 *   forge.forgeAndPromote()      — generate + run + update coherency for passing tests
 */

'use strict';

const { TestGenerator } = require('./generator');
const { TestRunner } = require('./runner');
const { TestScorer } = require('./scorer');

class TestForge {
  /**
   * @param {object} oracle - The RemembranceOracle instance (oracle.patterns, oracle.store)
   */
  constructor(oracle) {
    this.oracle = oracle;
    this.generator = new TestGenerator();
    this.runner = new TestRunner();
    this.scorer = new TestScorer();
  }

  /**
   * Generate tests for all patterns missing testCode.
   * @param {object} options
   * @param {boolean} options.dryRun - Preview without storing (default: false)
   * @param {number} options.limit - Max patterns to process
   * @returns {{ generated: number, skipped: number, failed: number, results: Array }}
   */
  forgeTests(options = {}) {
    const { dryRun = false, limit } = options;
    const patterns = this.oracle.patterns.getAll();
    let untested = patterns.filter(p => !p.testCode || !p.testCode.trim());

    if (limit && limit > 0) {
      untested = untested.slice(0, limit);
    }

    const results = [];
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const pattern of untested) {
      try {
        const lang = (pattern.language || 'javascript').toLowerCase();
        // Only generate for languages we can test in the sandbox
        if (!this._isSandboxable(lang)) {
          results.push({ name: pattern.name, id: pattern.id, status: 'skipped', reason: `No sandbox for ${lang}` });
          skipped++;
          continue;
        }

        const gen = this.generator.generate(pattern);
        if (!gen.testCode || gen.assertions === 0) {
          results.push({ name: pattern.name, id: pattern.id, status: 'skipped', reason: 'Could not generate tests' });
          skipped++;
          continue;
        }

        // Run the generated test to verify it passes
        const runResult = this.runner.run(pattern.code, gen.testCode, lang);

        if (runResult.passed) {
          if (!dryRun) {
            this._storeTestCode(pattern.id, gen.testCode);
          }
          results.push({
            name: pattern.name,
            id: pattern.id,
            status: dryRun ? 'dry-run' : 'generated',
            strategy: gen.strategy,
            assertions: gen.assertions,
            duration: runResult.duration,
          });
          generated++;
        } else {
          results.push({
            name: pattern.name,
            id: pattern.id,
            status: 'failed',
            reason: runResult.error || 'Test did not pass',
            strategy: gen.strategy,
          });
          failed++;
        }
      } catch (err) {
        results.push({ name: pattern.name, id: pattern.id, status: 'error', reason: err.message });
        failed++;
      }
    }

    return { generated, skipped, failed, total: untested.length, results };
  }

  /**
   * Generate test for a single pattern.
   * @param {string} patternId
   * @param {object} options
   * @param {boolean} options.dryRun - Preview without storing
   * @returns {{ success: boolean, testCode?: string, strategy?: string, assertions?: number, error?: string }}
   */
  forgeTest(patternId, options = {}) {
    const { dryRun = false } = options;
    const pattern = this._getPattern(patternId);
    if (!pattern) {
      return { success: false, error: 'Pattern not found' };
    }

    const lang = (pattern.language || 'javascript').toLowerCase();
    if (!this._isSandboxable(lang)) {
      return { success: false, error: `No sandbox for language: ${lang}` };
    }

    const gen = this.generator.generate(pattern);
    if (!gen.testCode || gen.assertions === 0) {
      return { success: false, error: 'Could not generate tests for this pattern' };
    }

    // Run the generated test
    const runResult = this.runner.run(pattern.code, gen.testCode, lang);

    if (runResult.passed) {
      if (!dryRun) {
        this._storeTestCode(pattern.id, gen.testCode);
      }
      return {
        success: true,
        testCode: gen.testCode,
        strategy: gen.strategy,
        assertions: gen.assertions,
        duration: runResult.duration,
        dryRun,
      };
    }

    return {
      success: false,
      testCode: gen.testCode,
      error: runResult.error || 'Generated test did not pass',
      strategy: gen.strategy,
    };
  }

  /**
   * Run all existing tests.
   * @returns {{ total: number, passed: number, failed: number, results: Array }}
   */
  runTests() {
    const patterns = this.oracle.patterns.getAll().filter(p => p.testCode && p.testCode.trim());
    return this.runner.runBatch(
      patterns.map(p => ({
        code: p.code,
        testCode: p.testCode,
        language: p.language || 'javascript',
        name: p.name,
      }))
    );
  }

  /**
   * Score all existing tests.
   * @returns {{ total: number, scored: number, avgScore: number, results: Array }}
   */
  scoreTests() {
    const patterns = this.oracle.patterns.getAll().filter(p => p.testCode && p.testCode.trim());
    const results = [];
    let totalScore = 0;

    for (const p of patterns) {
      const scoreResult = this.scorer.score(p.testCode, p.code, p.language || 'javascript');
      results.push({
        name: p.name,
        id: p.id,
        score: scoreResult.score,
        dimensions: scoreResult.dimensions,
        suggestions: scoreResult.suggestions,
      });
      totalScore += scoreResult.score;
    }

    const avgScore = patterns.length > 0 ? Math.round((totalScore / patterns.length) * 1000) / 1000 : 0;
    return { total: patterns.length, scored: results.length, avgScore, results };
  }

  /**
   * The full pipeline: generate -> run -> score -> update coherency -> flag for publication.
   * @param {object} options
   * @param {number} options.limit - Max patterns to process
   * @returns {{ generated, passed, failed, promoted, avgScore, newlyEligible, results }}
   */
  forgeAndPromote(options = {}) {
    const { limit } = options;

    // 1. Get all untested patterns
    const patterns = this.oracle.patterns.getAll();
    let untested = patterns.filter(p => !p.testCode || !p.testCode.trim());
    if (limit && limit > 0) {
      untested = untested.slice(0, limit);
    }

    const results = [];
    let generated = 0;
    let passed = 0;
    let failed = 0;
    let promoted = 0;
    let totalScore = 0;
    const newlyEligible = [];

    for (const pattern of untested) {
      try {
        const lang = (pattern.language || 'javascript').toLowerCase();
        if (!this._isSandboxable(lang)) {
          results.push({ name: pattern.name, id: pattern.id, status: 'skipped', reason: `No sandbox for ${lang}` });
          continue;
        }

        // 2. Generate tests
        const gen = this.generator.generate(pattern);
        if (!gen.testCode || gen.assertions === 0) {
          results.push({ name: pattern.name, id: pattern.id, status: 'skipped', reason: 'Could not generate tests' });
          continue;
        }

        // 3. Run tests
        const runResult = this.runner.run(pattern.code, gen.testCode, lang);
        generated++;

        if (!runResult.passed) {
          results.push({ name: pattern.name, id: pattern.id, status: 'test-failed', reason: runResult.error });
          failed++;
          continue;
        }
        passed++;

        // 4. Score test quality
        const scoreResult = this.scorer.score(gen.testCode, pattern.code, lang);
        totalScore += scoreResult.score;

        // 5. Update pattern.testCode in DB
        this._storeTestCode(pattern.id, gen.testCode);

        // 6. Recalculate coherency (testProof will now be 1.0 instead of 0.5)
        const newCoherency = this._refreshCoherency(pattern.id);
        promoted++;

        // 7. Check if newly eligible for publication (coherency >= 0.8)
        const coherencyTotal = newCoherency ? (newCoherency.total || newCoherency) : 0;
        const isEligible = coherencyTotal >= 0.8;

        results.push({
          name: pattern.name,
          id: pattern.id,
          status: 'promoted',
          score: scoreResult.score,
          coherency: coherencyTotal,
          eligible: isEligible,
          assertions: gen.assertions,
          strategy: gen.strategy,
        });

        if (isEligible) {
          newlyEligible.push({ name: pattern.name, id: pattern.id, coherency: coherencyTotal });
        }
      } catch (err) {
        results.push({ name: pattern.name, id: pattern.id, status: 'error', reason: err.message });
        failed++;
      }
    }

    const avgScore = passed > 0 ? Math.round((totalScore / passed) * 1000) / 1000 : 0;

    return {
      total: untested.length,
      generated,
      passed,
      failed,
      promoted,
      avgScore,
      newlyEligible,
      results,
    };
  }

  // ─── Private Helpers ───

  /**
   * Check if a language is supported by the sandbox.
   */
  _isSandboxable(lang) {
    const supported = new Set([
      'javascript', 'js', 'typescript', 'ts',
      'python', 'py',
      'go', 'golang',
      'rust', 'rs',
    ]);
    return supported.has(lang);
  }

  /**
   * Get a pattern by ID from the oracle.
   */
  _getPattern(id) {
    if (this.oracle.patterns._backend === 'sqlite' && this.oracle.patterns._sqlite) {
      return this.oracle.patterns._sqlite.getPattern(id);
    }
    return this.oracle.patterns.getAll().find(p => p.id === id) || null;
  }

  /**
   * Store test code on a pattern in the database.
   */
  _storeTestCode(patternId, testCode) {
    try {
      if (this.oracle.patterns._backend === 'sqlite' && this.oracle.patterns._sqlite) {
        this.oracle.patterns._sqlite.updatePattern(patternId, { testCode });
      } else if (typeof this.oracle.patterns.update === 'function') {
        this.oracle.patterns.update(patternId, { testCode });
      }
    } catch (err) {
      // Non-fatal — log if debug mode
      if (process.env.ORACLE_DEBUG) {
        console.warn('[test-forge] Failed to store test code:', err.message);
      }
    }
  }

  /**
   * Refresh coherency score for a pattern after adding test code.
   * Returns the new coherency score object.
   */
  _refreshCoherency(patternId) {
    try {
      const { computeCoherencyScore } = require('../unified/coherency');
      const pattern = this._getPattern(patternId);
      if (!pattern) return null;

      const historicalReliability = pattern.usageCount > 0
        ? (pattern.successCount || 0) / pattern.usageCount
        : 0.5;

      const newCoherency = computeCoherencyScore(pattern.code, {
        language: pattern.language,
        testPassed: true, // test code just passed
        historicalReliability,
      });

      // Update in DB
      if (this.oracle.patterns._backend === 'sqlite' && this.oracle.patterns._sqlite) {
        this.oracle.patterns._sqlite.updatePattern(patternId, {
          coherencyScore: newCoherency,
        });
      } else if (typeof this.oracle.patterns.update === 'function') {
        this.oracle.patterns.update(patternId, { coherencyScore: newCoherency });
      }

      return newCoherency;
    } catch (err) {
      if (process.env.ORACLE_DEBUG) {
        console.warn('[test-forge] Failed to refresh coherency:', err.message);
      }
      return null;
    }
  }
}

module.exports = { TestForge, TestGenerator, TestRunner, TestScorer };
