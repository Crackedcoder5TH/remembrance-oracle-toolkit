/**
 * Test Forge — Quality Scorer
 * Scores test code quality on multiple dimensions.
 *
 * Dimensions:
 *   - assertions: How many assertions (throw/assert/if(!) patterns)
 *   - coverage: What % of code identifiers are exercised in tests
 *   - edgeCases: Tests with null, undefined, [], '', 0, NaN, Infinity, boundary values
 *   - errorHandling: try/catch blocks, error assertions
 *   - diversity: Variety of test input values/types
 */

'use strict';

class TestScorer {
  /**
   * Score test quality on 0-1 scale.
   * @param {string} testCode - The test code
   * @param {string} code - The pattern code being tested
   * @param {string} language - Programming language
   * @returns {{ score: number, dimensions: object, suggestions: string[] }}
   */
  score(testCode, code, language = 'javascript') {
    if (!testCode || !testCode.trim()) {
      return {
        score: 0,
        dimensions: { assertions: 0, coverage: 0, edgeCases: 0, errorHandling: 0, diversity: 0 },
        suggestions: ['No test code provided — generate tests first'],
      };
    }

    const dimensions = {
      assertions: this._assertionCount(testCode, language),
      coverage: this._coverageEstimate(testCode, code, language),
      edgeCases: this._edgeCaseCount(testCode, language),
      errorHandling: this._errorHandlingTests(testCode, language),
      diversity: this._inputDiversity(testCode, language),
    };

    // Weighted score
    const weights = {
      assertions: 0.25,
      coverage: 0.30,
      edgeCases: 0.20,
      errorHandling: 0.10,
      diversity: 0.15,
    };

    let score = 0;
    for (const [dim, weight] of Object.entries(weights)) {
      score += Math.min(1, dimensions[dim]) * weight;
    }

    // Round to 3 decimal places
    score = Math.round(score * 1000) / 1000;

    const suggestions = this._generateSuggestions(dimensions, testCode, code, language);
    return { score, dimensions, suggestions };
  }

  /**
   * Count assertions in test code.
   * Normalized: 3+ assertions = 1.0
   *
   * Patterns detected:
   *   - throw new Error(...)
   *   - if (!...) throw
   *   - assert(...) / assert.equal(...)
   *   - Python: assert expr
   */
  _assertionCount(testCode, language) {
    let count = 0;

    if (language === 'python' || language === 'py') {
      // Python assertions
      const assertRE = /\bassert\s+/g;
      const matches = testCode.match(assertRE);
      count = matches ? matches.length : 0;
    } else {
      // JavaScript/TypeScript assertions
      // throw new Error(...)
      const throwRE = /throw\s+new\s+Error\s*\(/g;
      const throwMatches = testCode.match(throwRE);
      count += throwMatches ? throwMatches.length : 0;

      // if (!...) throw
      const ifThrowRE = /if\s*\([^)]*\)\s*throw/g;
      const ifThrowMatches = testCode.match(ifThrowRE);
      count += ifThrowMatches ? ifThrowMatches.length : 0;

      // assert(...)
      const assertRE = /\bassert\s*[.(]/g;
      const assertMatches = testCode.match(assertRE);
      count += assertMatches ? assertMatches.length : 0;
    }

    // Normalize: 3+ assertions = 1.0
    if (count >= 3) return 1.0;
    if (count === 2) return 0.7;
    if (count === 1) return 0.4;
    return 0;
  }

  /**
   * Estimate code coverage by checking how many identifiers from the
   * pattern code appear in the test code.
   */
  _coverageEstimate(testCode, code, language) {
    if (!code || !code.trim()) return 0;

    // Extract identifiers from code (function names, variable names)
    const identRE = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
    const codeIdents = new Set();
    let m;
    while ((m = identRE.exec(code)) !== null) {
      const id = m[1];
      // Skip common keywords
      if (!COMMON_KEYWORDS.has(id) && id.length > 1) {
        codeIdents.add(id);
      }
    }

    if (codeIdents.size === 0) return 0.5; // can't measure

    // Count how many code identifiers appear in testCode
    let covered = 0;
    for (const id of codeIdents) {
      if (testCode.includes(id)) covered++;
    }

    return codeIdents.size > 0 ? covered / codeIdents.size : 0;
  }

  /**
   * Count edge case tests.
   * Normalized: 3+ edge cases = 1.0
   *
   * Detects: null, undefined, [], '', 0, NaN, Infinity, -1, empty object
   */
  _edgeCaseCount(testCode, language) {
    const edgePatterns = [
      /\bnull\b/,
      /\bundefined\b/,
      /\[\s*\]/,       // empty array
      /['"]{2}/,       // empty string
      /\b0\b/,         // zero
      /\bNaN\b/,
      /\bInfinity\b/,
      /\b-1\b/,        // negative one
      /\{\s*\}/,       // empty object
      /\bNone\b/,      // Python None
      /\bFalse\b/,     // Python False
    ];

    let count = 0;
    for (const pat of edgePatterns) {
      if (pat.test(testCode)) count++;
    }

    // Normalize: 3+ edge cases = 1.0
    if (count >= 3) return 1.0;
    if (count === 2) return 0.7;
    if (count === 1) return 0.4;
    return 0;
  }

  /**
   * Detect error handling tests.
   * Normalized: 2+ error tests = 1.0
   */
  _errorHandlingTests(testCode, language) {
    let count = 0;

    if (language === 'python' || language === 'py') {
      // try/except
      const tryExceptRE = /\btry\s*:/g;
      const matches = testCode.match(tryExceptRE);
      count += matches ? matches.length : 0;

      // pytest.raises
      const raisesRE = /raises\s*\(/g;
      const raisesMatches = testCode.match(raisesRE);
      count += raisesMatches ? raisesMatches.length : 0;
    } else {
      // try/catch
      const tryCatchRE = /\btry\s*\{/g;
      const matches = testCode.match(tryCatchRE);
      count += matches ? matches.length : 0;

      // .throws / should.throw
      const throwsRE = /\.throws?\s*\(/g;
      const throwsMatches = testCode.match(throwsRE);
      count += throwsMatches ? throwsMatches.length : 0;
    }

    // Normalize: 2+ error handling tests = 1.0
    if (count >= 2) return 1.0;
    if (count === 1) return 0.5;
    return 0;
  }

  /**
   * Measure input diversity — variety of test input values/types.
   * Normalized: 4+ unique types = 1.0
   */
  _inputDiversity(testCode, language) {
    const types = new Set();

    // Check for different literal types
    if (/['"][^'"]+['"]/.test(testCode)) types.add('string');
    if (/\b\d+\.?\d*\b/.test(testCode)) types.add('number');
    if (/\[.+\]/.test(testCode)) types.add('array');
    if (/\{.+\}/.test(testCode) && !/\bfunction\b/.test(testCode.match(/\{[^}]*\}/)?.[0] || '')) types.add('object');
    if (/\b(true|false|True|False)\b/.test(testCode)) types.add('boolean');
    if (/\b(null|undefined|None)\b/.test(testCode)) types.add('nullish');
    if (/\bfunction\b|=>/.test(testCode)) types.add('function');
    if (/\bnew\s+\w+/.test(testCode)) types.add('instance');

    // Normalize: 4+ types = 1.0
    if (types.size >= 4) return 1.0;
    if (types.size === 3) return 0.75;
    if (types.size === 2) return 0.5;
    if (types.size === 1) return 0.25;
    return 0;
  }

  /**
   * Generate suggestions for improving test quality.
   */
  _generateSuggestions(dimensions, testCode, code, language) {
    const suggestions = [];

    if (dimensions.assertions < 0.5) {
      suggestions.push('Add more assertions — aim for at least 3 per function');
    }

    if (dimensions.coverage < 0.5) {
      // Find uncovered identifiers
      const identRE = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
      const codeIdents = new Set();
      let m;
      while ((m = identRE.exec(code || '')) !== null) {
        if (!COMMON_KEYWORDS.has(m[1]) && m[1].length > 1 && !testCode.includes(m[1])) {
          codeIdents.add(m[1]);
        }
      }
      if (codeIdents.size > 0) {
        const uncovered = Array.from(codeIdents).slice(0, 5).join(', ');
        suggestions.push(`Test untested identifiers: ${uncovered}`);
      } else {
        suggestions.push('Improve coverage — test more code paths');
      }
    }

    if (dimensions.edgeCases < 0.5) {
      suggestions.push('Add edge case tests — null, empty arrays, zero, NaN, Infinity');
    }

    if (dimensions.errorHandling < 0.5) {
      suggestions.push('Add error handling tests — verify functions handle bad input gracefully');
    }

    if (dimensions.diversity < 0.5) {
      suggestions.push('Use more diverse input types — strings, numbers, arrays, objects, booleans');
    }

    return suggestions;
  }
}

// Common JavaScript/Python keywords to exclude from coverage analysis
const COMMON_KEYWORDS = new Set([
  // JS keywords
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'void', 'this', 'super', 'class', 'extends',
  'function', 'var', 'let', 'const', 'import', 'export', 'default', 'from',
  'as', 'async', 'await', 'yield', 'with', 'debugger',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'console', 'log', 'error', 'warn', 'Error', 'Array', 'Object', 'String',
  'Number', 'Boolean', 'Math', 'JSON', 'Date', 'RegExp', 'Map', 'Set',
  'Promise', 'Symbol', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'require', 'module', 'exports', 'use', 'strict',
  // Python keywords
  'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except',
  'finally', 'with', 'as', 'import', 'from', 'return', 'yield', 'pass',
  'raise', 'assert', 'and', 'or', 'not', 'is', 'in', 'lambda', 'None',
  'True', 'False', 'self', 'cls', 'print', 'len', 'range', 'type',
]);

module.exports = { TestScorer };
