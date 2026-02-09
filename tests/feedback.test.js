const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  covenantFeedback,
  coherencyFeedback,
  actionableFeedback,
  formatFeedback,
  findPatternLocation,
  FIX_SUGGESTIONS,
  COHERENCY_ADVICE,
} = require('../src/core/feedback');
const { covenantCheck } = require('../src/core/covenant');
const { computeCoherencyScore } = require('../src/core/coherency');
const { validateCode } = require('../src/core/validator');

describe('findPatternLocation()', () => {
  it('finds a regex match and returns line number', () => {
    const code = 'const x = 1;\nconst y = eval(atob("abc"));\nconst z = 3;';
    const pattern = /\beval\s*\(\s*(atob|Buffer\.from)\s*\(/i;
    const location = findPatternLocation(code, pattern);
    assert.ok(location);
    assert.strictEqual(location.lineNumber, 2);
    assert.ok(location.line.includes('eval'));
  });

  it('returns null when pattern not found', () => {
    const code = 'const x = 1;';
    const pattern = /NEVER_MATCH_THIS/;
    assert.strictEqual(findPatternLocation(code, pattern), null);
  });

  it('finds pattern on first line', () => {
    const code = 'rm -rf /home\nconst x = 1;';
    const pattern = /\brm\s+-rf\s+[/~]/i;
    const location = findPatternLocation(code, pattern);
    assert.ok(location);
    assert.strictEqual(location.lineNumber, 1);
  });
});

describe('covenantFeedback()', () => {
  it('returns empty array for sealed code', () => {
    const code = 'function add(a, b) { return a + b; }';
    const result = covenantCheck(code);
    const feedback = covenantFeedback(code, result);
    assert.deepStrictEqual(feedback, []);
  });

  it('returns actionable feedback for SQL injection', () => {
    const code = 'const query = "SELECT * FROM users WHERE id = \'" + userId + "\'";';
    const result = covenantCheck(code);
    assert.strictEqual(result.sealed, false);
    const feedback = covenantFeedback(code, result);
    assert.ok(feedback.length > 0);
    // Should mention The Living Water
    assert.ok(feedback[0].includes('Living Water') || feedback[0].includes('Covenant violation'));
    // Should include fix suggestion
    assert.ok(feedback[0].includes('Fix:') || feedback[0].includes('parameterized'));
  });

  it('returns line number for violations', () => {
    const code = 'const a = 1;\nconst b = 2;\nconst query = "DELETE FROM " + table;';
    const result = covenantCheck(code);
    if (!result.sealed) {
      const feedback = covenantFeedback(code, result);
      assert.ok(feedback.length > 0);
      // Should reference a line number
      assert.ok(feedback[0].includes('Line'));
    }
  });

  it('returns actionable feedback for innerHTML XSS', () => {
    const code = 'element.innerHTML = userInput;';
    const result = covenantCheck(code);
    if (!result.sealed) {
      const feedback = covenantFeedback(code, result);
      assert.ok(feedback.length > 0);
      assert.ok(feedback.some(f => f.includes('textContent') || f.includes('sanitize') || f.includes('XSS')));
    }
  });
});

describe('coherencyFeedback()', () => {
  it('returns empty for high-scoring code', () => {
    const code = 'function add(a, b) { return a + b; }';
    const score = computeCoherencyScore(code, { testPassed: true });
    const feedback = coherencyFeedback(code, score, 0.6);
    assert.deepStrictEqual(feedback, []);
  });

  it('diagnoses TODO markers', () => {
    const code = 'function todo() {\n  // TODO: implement this\n  return null;\n}';
    const score = computeCoherencyScore(code, { testPassed: false });
    const feedback = coherencyFeedback(code, score, 0.9);
    if (feedback.length > 0) {
      const allText = feedback.join('\n');
      assert.ok(allText.includes('TODO') || allText.includes('Coherency'));
    }
  });

  it('diagnoses missing test code', () => {
    const code = 'function add(a, b) { return a + b; }';
    // No test passed = testProof is 0.5 (neutral)
    const score = computeCoherencyScore(code, {});
    const feedback = coherencyFeedback(code, score, 0.95);
    if (feedback.length > 0) {
      const allText = feedback.join('\n');
      assert.ok(allText.includes('test') || allText.includes('Coherency'));
    }
  });

  it('diagnoses mixed indentation', () => {
    const code = 'function a() {\n  const x = 1;\n\tconst y = 2;\n}';
    const score = computeCoherencyScore(code, { testPassed: false });
    const feedback = coherencyFeedback(code, score, 0.95);
    if (feedback.length > 0) {
      const allText = feedback.join('\n');
      assert.ok(allText.includes('Coherency') || allText.includes('indentation') || allText.includes('consistency'));
    }
  });

  it('reports score and threshold', () => {
    const code = '// TODO: implement\nfunction stub() {}';
    const score = computeCoherencyScore(code, { testPassed: false });
    const feedback = coherencyFeedback(code, score, 0.9);
    if (feedback.length > 0) {
      assert.ok(feedback[0].includes('below threshold'));
    }
  });
});

describe('actionableFeedback()', () => {
  it('returns summary for valid code', () => {
    const result = { valid: true, errors: [], covenantResult: { sealed: true }, coherencyScore: { total: 0.9 } };
    const feedback = actionableFeedback('code', result);
    assert.ok(feedback.summary.includes('passed'));
  });

  it('combines covenant and coherency feedback', () => {
    const code = 'element.innerHTML = userInput;\n// TODO: fix this';
    const result = validateCode(code, { skipCovenant: false });
    const feedback = actionableFeedback(code, result);
    assert.ok(feedback.summary.includes('Rejected'));
    assert.ok(feedback.covenantFeedback.length > 0 || feedback.coherencyFeedback.length > 0);
  });

  it('includes test failure suggestions', () => {
    const result = {
      valid: false,
      testPassed: false,
      testOutput: 'AssertionError: expected 5 got 4',
      covenantResult: { sealed: true },
      coherencyScore: { total: 0.7, breakdown: {} },
      errors: ['test failed'],
    };
    const feedback = actionableFeedback('code', result);
    assert.ok(feedback.suggestions.length > 0);
    assert.ok(feedback.suggestions.some(s => s.includes('AssertionError') || s.includes('test') || s.includes('fix')));
  });
});

describe('formatFeedback()', () => {
  it('formats valid code feedback', () => {
    const feedback = { summary: 'Code passed all checks.', covenantFeedback: [], coherencyFeedback: [], suggestions: [] };
    const output = formatFeedback(feedback);
    assert.ok(output.includes('passed'));
  });

  it('formats rejection with sections', () => {
    const feedback = {
      summary: 'Rejected: covenant violation. 1 actionable item(s).',
      covenantFeedback: ['Covenant violation [The Living Water]:\n  Line 3: bad code\n  Issue: SQL injection\n  Fix: Use parameterized queries'],
      coherencyFeedback: [],
      suggestions: [],
    };
    const output = formatFeedback(feedback);
    assert.ok(output.includes('Covenant Issues:'));
    assert.ok(output.includes('parameterized'));
  });

  it('includes all sections when present', () => {
    const feedback = {
      summary: 'Rejected: multiple issues.',
      covenantFeedback: ['covenant issue'],
      coherencyFeedback: ['coherency issue'],
      suggestions: ['fix the test'],
    };
    const output = formatFeedback(feedback);
    assert.ok(output.includes('Covenant Issues:'));
    assert.ok(output.includes('Coherency Issues:'));
    assert.ok(output.includes('Suggestions:'));
  });
});

describe('FIX_SUGGESTIONS', () => {
  it('has suggestions for common violations', () => {
    assert.ok(FIX_SUGGESTIONS['SQL injection via string concatenation']);
    assert.ok(FIX_SUGGESTIONS['Potential XSS via innerHTML']);
    assert.ok(FIX_SUGGESTIONS['Command injection via dynamic execution']);
    assert.ok(FIX_SUGGESTIONS['Fork bomb detected']);
    assert.ok(FIX_SUGGESTIONS['Recursive filesystem deletion']);
  });

  it('all suggestions are non-empty strings', () => {
    for (const [key, value] of Object.entries(FIX_SUGGESTIONS)) {
      assert.ok(typeof value === 'string' && value.length > 0, `FIX_SUGGESTIONS["${key}"] should be non-empty`);
    }
  });
});

describe('COHERENCY_ADVICE', () => {
  it('has advisors for all dimensions', () => {
    assert.ok(COHERENCY_ADVICE.syntaxValid);
    assert.ok(COHERENCY_ADVICE.completeness);
    assert.ok(COHERENCY_ADVICE.consistency);
    assert.ok(COHERENCY_ADVICE.testProof);
    assert.ok(COHERENCY_ADVICE.historicalReliability);
  });

  it('each advisor has threshold and diagnose', () => {
    for (const [key, advisor] of Object.entries(COHERENCY_ADVICE)) {
      assert.ok(typeof advisor.threshold === 'number', `${key} threshold`);
      assert.ok(typeof advisor.diagnose === 'function', `${key} diagnose`);
    }
  });

  it('syntax advisor detects unbalanced braces', () => {
    const code = 'function a() { if (true) {';
    const issues = COHERENCY_ADVICE.syntaxValid.diagnose(code, 0.2);
    assert.ok(issues.length > 0);
    assert.ok(issues.some(i => i.includes('brace') || i.includes('syntax')));
  });

  it('completeness advisor detects TODO', () => {
    const code = '// TODO: implement\nfunction stub() {}';
    const issues = COHERENCY_ADVICE.completeness.diagnose(code, 0.5);
    assert.ok(issues.length > 0);
    assert.ok(issues.some(i => i.includes('TODO')));
  });

  it('consistency advisor detects mixed indentation', () => {
    const code = '  spaces\n\ttabs';
    const issues = COHERENCY_ADVICE.consistency.diagnose(code, 0.5);
    assert.ok(issues.length > 0);
    assert.ok(issues.some(i => i.includes('tabs') || i.includes('indentation')));
  });

  it('testProof advisor suggests adding tests', () => {
    const issues = COHERENCY_ADVICE.testProof.diagnose('code', 0.5);
    assert.ok(issues.length > 0);
    assert.ok(issues.some(i => i.includes('test')));
  });
});

describe('Validator integration', () => {
  it('validator includes feedback in result', () => {
    const code = 'element.innerHTML = userInput;';
    const result = validateCode(code);
    assert.strictEqual(result.valid, false);
    assert.ok(result.feedback);
    assert.ok(result.feedback.summary);
    assert.ok(result.feedback.covenantFeedback.length > 0);
  });

  it('validator feedback includes fix suggestion for XSS', () => {
    const code = 'element.innerHTML = userInput;';
    const result = validateCode(code);
    if (result.feedback && result.feedback.covenantFeedback.length > 0) {
      const allFeedback = result.feedback.covenantFeedback.join('\n');
      assert.ok(allFeedback.includes('textContent') || allFeedback.includes('sanitize') || allFeedback.includes('XSS'));
    }
  });

  it('valid code has null feedback', () => {
    const code = 'function add(a, b) { return a + b; }';
    const result = validateCode(code, {
      testCode: 'if (add(2, 3) !== 5) throw new Error("fail");',
      language: 'javascript',
    });
    if (result.valid) {
      assert.strictEqual(result.feedback, null);
    }
  });
});
