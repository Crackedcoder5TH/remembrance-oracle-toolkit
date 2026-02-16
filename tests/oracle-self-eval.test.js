const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── @oracle-pattern-definitions marker ───

describe('@oracle-pattern-definitions marker', () => {
  const { covenantCheck, deepSecurityScan } = require('../src/core/covenant');
  const { scoreSecurity } = require('../src/core/reflection-scorers');

  const patternDefCode = `
    /* @oracle-pattern-definitions */
    const PATTERNS = [
      { pattern: /eval\\s*\\(/, reason: 'eval detected' },
      { pattern: /innerHTML\\s*=/, reason: 'XSS risk' },
    ];
    module.exports = { PATTERNS };
  `;

  it('skips harm pattern matching for files with the marker', () => {
    const result = covenantCheck(patternDefCode);
    assert.equal(result.sealed, true, 'pattern definition files should always seal');
  });

  it('returns 0.95 security score for pattern definition files', () => {
    const score = scoreSecurity(patternDefCode, { language: 'javascript' });
    assert.equal(score, 0.95);
  });

  it('skips deep security scan for pattern definition files', () => {
    const result = deepSecurityScan(patternDefCode, { language: 'javascript' });
    assert.equal(result.deepFindings.length, 0, 'no deep findings for pattern defs');
  });

  it('still catches violations in files WITHOUT the marker', () => {
    const badCode = 'const x = eval("dangerous");';
    const result = scoreSecurity(badCode, { language: 'javascript' });
    assert.ok(result < 0.95, 'should penalize eval in normal files');
  });
});

// ─── @oracle-infrastructure marker ───

describe('@oracle-infrastructure marker', () => {
  const { scoreSecurity } = require('../src/core/reflection-scorers');

  it('gives reduced penalty instead of hard zero for infra files', () => {
    // innerHTML assignment triggers covenant violation (XSS risk)
    const infraCode = `
      /* @oracle-infrastructure */
      function render(data) {
        element.innerHTML = data;
      }
    `;
    const score = scoreSecurity(infraCode, { language: 'javascript' });
    assert.ok(score >= 0.4, `infrastructure files should get at least 0.4 security, got ${score}`);
    assert.ok(score < 1.0, 'should still have some penalty');
  });

  it('still gives hard zero for non-infra files with violations', () => {
    const badCode = `
      function render(data) {
        element.innerHTML = data;
      }
    `;
    const score = scoreSecurity(badCode, { language: 'javascript' });
    assert.equal(score, 0, 'non-infra files with violations should score 0');
  });
});

// ─── @oracle-dense-code and simplicity floor ───

describe('Simplicity scoring improvements', () => {
  const { scoreSimplicity } = require('../src/core/reflection-scorers');

  it('applies reduced penalties for @oracle-dense-code files', () => {
    const denseCode = '/* @oracle-dense-code */\n' + 'function f() {\n' +
      '  if (a) {\n    if (b) {\n      if (c) {\n        if (d) {\n          if (e) {\n            if (f) {\n              x();\n            }\n          }\n        }\n      }\n    }\n  }\n}\n';
    const normalCode = denseCode.replace('/* @oracle-dense-code */\n', '');

    const denseScore = scoreSimplicity(denseCode);
    const normalScore = scoreSimplicity(normalCode);
    assert.ok(denseScore > normalScore, 'dense-code marker should reduce penalties');
  });

  it('enforces a floor of 0.15 for simplicity', () => {
    // Create extremely deeply nested code
    let code = 'function x() {\n';
    for (let i = 0; i < 30; i++) code += '  '.repeat(i + 1) + 'if (a) {\n';
    for (let i = 29; i >= 0; i--) code += '  '.repeat(i + 1) + '}\n';
    code += '}\n';
    // Add many long lines
    for (let i = 0; i < 50; i++) code += 'a'.repeat(200) + '\n';

    const score = scoreSimplicity(code);
    assert.ok(score >= 0.15, `simplicity floor should be 0.15, got ${score}`);
  });
});

// ─── fullCoherency gap fix ───

describe('fullCoherency gap fix', () => {
  const { reflectionLoop } = require('../src/core/reflection-loop');

  it('fullCoherency should not be artificially capped during reflection', () => {
    const code = 'function add(a, b) { return a + b; }';
    const result = reflectionLoop(code, { language: 'javascript', maxLoops: 0 });
    // Before fix: fullCoherency was ~0.80 max due to unknown testProof/history
    // After fix: should be >= 0.90 for clean code
    assert.ok(result.fullCoherency >= 0.9,
      `fullCoherency should be >= 0.9 for clean code, got ${result.fullCoherency}`);
  });
});

// ─── crossFileAnalysis ───

describe('crossFileAnalysis', () => {
  const { crossFileAnalysis } = require('../src/reflector/scoring-analysis-aggregate');
  const { writeFileSync, mkdirSync, rmSync } = require('fs');
  const { join } = require('path');
  const tmpDir = join(__dirname, '.tmp-cross-file');

  // Setup temp files
  function setup() {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    mkdirSync(tmpDir, { recursive: true });

    // File A: has function 'helper' with body X
    writeFileSync(join(tmpDir, 'a.js'), `
      function helper(x) { return x * 2; }
      function unique_a() { return 1; }
    `);

    // File B: has function 'helper' with similar body
    writeFileSync(join(tmpDir, 'b.js'), `
      function helper(x) { return x * 2; }
      function unique_b() { return 2; }
    `);

    // File C: has function 'helper' with DIFFERENT body
    writeFileSync(join(tmpDir, 'c.js'), `
      function helper(list) {
        const result = [];
        for (const item of list) result.push(item.name);
        return result;
      }
    `);
  }

  function cleanup() {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  }

  it('detects duplicate functions with similar bodies', () => {
    setup();
    try {
      const result = crossFileAnalysis(tmpDir, [
        { path: 'a.js' }, { path: 'b.js' }, { path: 'c.js' },
      ]);
      const helperDups = result.findings.filter(f =>
        f.type === 'duplicate-function' && f.message.includes('helper')
      );
      // Should find helper duplicated in a.js and b.js (similar bodies)
      // But NOT group c.js's helper (different body)
      assert.ok(helperDups.length >= 1, 'should detect helper duplication');
      assert.ok(result.totalFindings >= 1);
    } finally {
      cleanup();
    }
  });

  it('uses Object.create(null) to avoid prototype key collisions', () => {
    setup();
    // Add a file with a function named 'constructor'
    writeFileSync(join(tmpDir, 'd.js'), `
      function constructor() { return {}; }
    `);
    try {
      // Should not throw
      const result = crossFileAnalysis(tmpDir, [
        { path: 'a.js' }, { path: 'd.js' },
      ]);
      assert.ok(typeof result.totalFindings === 'number');
    } finally {
      cleanup();
    }
  });
});

// ─── Architectural search injection ───

describe('Architectural search improvements', () => {
  const { parseIntent, injectArchitecturalResults, ARCHITECTURAL_PATTERNS } = require('../src/core/search-intelligence');

  it('detects architecture intent in structural queries', () => {
    const intent = parseIntent('split large module into sub-modules');
    const archIntents = intent.intents.filter(i => i.name === 'architecture');
    assert.ok(archIntents.length > 0, 'should detect architecture intent');
    assert.ok(archIntents[0].structural, 'architecture intent should be structural');
  });

  it('detects design pattern intent', () => {
    const intent = parseIntent('factory pattern for creating objects');
    const designIntents = intent.intents.filter(i => i.name === 'designPattern');
    assert.ok(designIntents.length > 0, 'should detect designPattern intent');
  });

  it('injects architectural patterns for structural queries', () => {
    const intent = parseIntent('refactor module into smaller pieces');
    const results = injectArchitecturalResults([], intent, 10);
    assert.ok(results.length > 0, 'should inject architectural patterns');
    assert.ok(results[0].source === 'builtin-architecture');
  });

  it('does not inject for non-structural queries', () => {
    const intent = parseIntent('debounce function');
    const results = injectArchitecturalResults([], intent, 10);
    assert.equal(results.length, 0, 'should not inject for non-structural queries');
  });

  it('has 5 built-in architectural patterns', () => {
    assert.equal(ARCHITECTURAL_PATTERNS.length, 5);
    const names = ARCHITECTURAL_PATTERNS.map(p => p.name);
    assert.ok(names.includes('Barrel Re-Export'));
    assert.ok(names.includes('Facade Pattern'));
    assert.ok(names.includes('Strategy Pattern'));
  });
});
