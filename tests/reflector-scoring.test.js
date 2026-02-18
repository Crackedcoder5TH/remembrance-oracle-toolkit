const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const {
  calculateCyclomaticComplexity,
  analyzeCommentDensity,
  securityScan,
  analyzeNestingDepth,
  computeQualityMetrics,
  deepScore,
  repoScore,
  formatDeepScore,
  stripStringsAndComments,
  countDecisionPoints,
  extractFunctionBodies,
} = require('../src/reflector/scoring');

// ─── Helpers ───

function createTmpDir() {
  const dir = join(tmpdir(), `scoring-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createTestFile(dir, name, code) {
  const filePath = join(dir, name);
  const fileDir = join(dir, ...name.split('/').slice(0, -1));
  if (name.includes('/')) mkdirSync(fileDir, { recursive: true });
  writeFileSync(filePath, code, 'utf-8');
  return filePath;
}

// ─── Cyclomatic Complexity Tests ───

describe('Scoring — calculateCyclomaticComplexity', () => {
  it('should return complexity 1 for linear code', () => {
    const result = calculateCyclomaticComplexity('const x = 1;\nconst y = 2;\n');
    assert.equal(result.total, 1);
  });

  it('should count if statements', () => {
    const code = 'function test(x) {\n  if (x > 0) { return 1; }\n  return 0;\n}';
    const result = calculateCyclomaticComplexity(code);
    assert.ok(result.total >= 2);
  });

  it('should count loops', () => {
    const code = 'function test(arr) {\n  for (let i = 0; i < arr.length; i++) {\n    while (arr[i] > 0) { arr[i]--; }\n  }\n}';
    const result = calculateCyclomaticComplexity(code);
    assert.ok(result.total >= 3);
  });

  it('should count logical operators', () => {
    const code = 'function test(a, b, c) {\n  if (a && b || c) { return true; }\n}';
    const result = calculateCyclomaticComplexity(code);
    assert.ok(result.total >= 4); // 1 base + if + && + ||
  });

  it('should count ternary operators', () => {
    const code = 'const x = a ? 1 : 0;\nconst y = b ? 2 : 3;';
    const result = calculateCyclomaticComplexity(code);
    assert.ok(result.total >= 3); // 1 base + 2 ternaries
  });

  it('should extract per-function complexity', () => {
    const code = `
function simple() { return 1; }
function complex(x) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) { continue; }
    }
  }
  return x;
}`;
    const result = calculateCyclomaticComplexity(code);
    assert.ok(result.perFunction.length >= 1);
    assert.ok(result.avgPerFunction > 0);
    assert.ok(result.maxPerFunction >= 1);
  });

  it('should count switch cases', () => {
    const code = 'function test(x) {\n  switch (x) {\n    case 1: return "a";\n    case 2: return "b";\n    case 3: return "c";\n  }\n}';
    const result = calculateCyclomaticComplexity(code);
    assert.ok(result.total >= 4); // 1 base + 3 cases
  });
});

// ─── Comment Density Tests ───

describe('Scoring — analyzeCommentDensity', () => {
  it('should detect no comments', () => {
    const result = analyzeCommentDensity('const x = 1;\nconst y = 2;');
    assert.equal(result.commentLines, 0);
    assert.equal(result.density, 0);
  });

  it('should count single-line comments', () => {
    const result = analyzeCommentDensity('// This is a comment\nconst x = 1;\n// Another comment');
    assert.equal(result.commentLines, 2);
    assert.equal(result.codeLines, 1);
  });

  it('should count block comments', () => {
    const result = analyzeCommentDensity('/* Block\n * comment\n */\nconst x = 1;');
    assert.ok(result.commentLines >= 2);
    assert.equal(result.codeLines, 1);
  });

  it('should detect JSDoc docstrings', () => {
    const result = analyzeCommentDensity('/**\n * @param {number} x\n */\nfunction add(x) { return x; }');
    assert.ok(result.docstrings >= 1);
  });

  it('should compute density correctly', () => {
    const result = analyzeCommentDensity('// comment\ncode\ncode\ncode');
    assert.ok(result.density > 0);
    assert.ok(result.density < 1);
  });

  it('should score quality based on density', () => {
    // Good density (moderate comments)
    const good = analyzeCommentDensity('// Setup\nconst x = 1;\nconst y = 2;\n// Process\nconst z = x + y;');
    assert.ok(good.quality >= 0.5);

    // No comments in substantial code
    const noComments = analyzeCommentDensity(
      Array(15).fill('const x = 1;').join('\n')
    );
    assert.ok(noComments.quality <= 0.5);
  });

  it('should handle Python comments', () => {
    const result = analyzeCommentDensity('# Python comment\nx = 1\n# Another');
    assert.equal(result.commentLines, 2);
  });
});

// ─── Security Scan Tests ───

describe('Scoring — securityScan', () => {
  it('should detect eval usage', () => {
    const result = securityScan('eval("code")', 'javascript');
    assert.ok(result.findings.length > 0);
    assert.ok(result.findings.some(f => f.message.includes('eval')));
    assert.ok(result.score < 1);
  });

  it('should detect hardcoded secrets', () => {
    const result = securityScan('const password = "mySecretPass123"', 'javascript');
    assert.ok(result.findings.length > 0);
    assert.ok(result.findings.some(f => f.message.includes('password') || f.message.includes('secret')));
  });

  it('should detect innerHTML assignment', () => {
    const result = securityScan('element.innerHTML = userInput', 'javascript');
    assert.ok(result.findings.some(f => f.message.includes('innerHTML')));
  });

  it('should detect Python exec', () => {
    const result = securityScan('exec(user_input)', 'python');
    assert.ok(result.findings.some(f => f.message.includes('exec')));
  });

  it('should return clean for safe code', () => {
    const result = securityScan('function add(a, b) { return a + b; }', 'javascript');
    assert.equal(result.score, 1);
    assert.equal(result.riskLevel, 'low');
  });

  it('should detect var usage as low severity', () => {
    const result = securityScan('var x = 1;\nvar y = 2;', 'javascript');
    assert.ok(result.findings.some(f => f.severity === 'low' && f.message.includes('var')));
  });

  it('should classify risk levels', () => {
    const safe = securityScan('const x = 1;', 'javascript');
    assert.equal(safe.riskLevel, 'low');

    const risky = securityScan('eval(input);\nnew Function(code);', 'javascript');
    assert.ok(risky.riskLevel === 'high' || risky.riskLevel === 'critical');
  });

  it('should detect private keys', () => {
    const result = securityScan('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----', 'javascript');
    assert.ok(result.findings.some(f => f.severity === 'critical'));
  });
});

// ─── Nesting Depth Tests ───

describe('Scoring — analyzeNestingDepth', () => {
  it('should return 0 depth for flat code', () => {
    const result = analyzeNestingDepth('const x = 1;\nconst y = 2;');
    assert.equal(result.maxDepth, 0);
  });

  it('should count nesting levels', () => {
    const code = 'function test() {\n  if (true) {\n    for (;;) {\n      x++;\n    }\n  }\n}';
    const result = analyzeNestingDepth(code);
    assert.ok(result.maxDepth >= 3);
  });

  it('should penalize deep nesting in score', () => {
    const shallow = analyzeNestingDepth('function a() { return 1; }');
    const deep = analyzeNestingDepth('function a() { if (1) { if (2) { if (3) { if (4) { if (5) { x(); } } } } } }');
    assert.ok(deep.score < shallow.score);
  });

  it('should compute average depth', () => {
    const result = analyzeNestingDepth('function a() {\n  x++;\n  y++;\n}');
    assert.ok(typeof result.avgDepth === 'number');
  });

  it('should provide depth distribution', () => {
    const result = analyzeNestingDepth('function a() {\n  x++;\n}');
    assert.ok(typeof result.depthDistribution === 'object');
  });
});

// ─── Quality Metrics Tests ───

describe('Scoring — computeQualityMetrics', () => {
  it('should compute basic metrics', () => {
    const result = computeQualityMetrics('function add(a, b) { return a + b; }', 'javascript');
    assert.ok(result.totalLines > 0);
    assert.ok(result.codeLines > 0);
    assert.ok(typeof result.avgLineLength === 'number');
    assert.ok(typeof result.score === 'number');
  });

  it('should count functions', () => {
    const code = 'function a() { return 1; }\nfunction b() { return 2; }\nfunction c() { return 3; }';
    const result = computeQualityMetrics(code, 'javascript');
    assert.ok(result.functionCount >= 2);
  });

  it('should detect long lines', () => {
    const longLine = 'const x = ' + 'a'.repeat(150) + ';';
    const result = computeQualityMetrics(longLine, 'javascript');
    assert.ok(result.longLines >= 1);
  });

  it('should detect duplicate lines', () => {
    const code = Array(5).fill('const result = processData(input, options, config);').join('\n');
    const result = computeQualityMetrics(code, 'javascript');
    assert.ok(result.duplicateLines >= 1);
  });

  it('should score 1.0 for simple clean code', () => {
    const result = computeQualityMetrics('function add(a, b) { return a + b; }', 'javascript');
    assert.ok(result.score >= 0.8);
  });
});

// ─── Deep Score Tests ───

describe('Scoring — deepScore', () => {
  it('should produce aggregate score between 0 and 1', () => {
    const result = deepScore('function add(a, b) { return a + b; }');
    assert.ok(result.aggregate >= 0);
    assert.ok(result.aggregate <= 1);
  });

  it('should include all dimension scores', () => {
    const result = deepScore('function test() { return true; }');
    assert.ok('serfCoherence' in result);
    assert.ok('complexity' in result);
    assert.ok('comments' in result);
    assert.ok('security' in result);
    assert.ok('nesting' in result);
    assert.ok('quality' in result);
  });

  it('should detect language automatically', () => {
    const result = deepScore('function test() { return true; }');
    assert.equal(result.language, 'javascript');
  });

  it('should include SERF dimension breakdown', () => {
    const result = deepScore('function add(a, b) { return a + b; }');
    assert.ok(result.serfDimensions);
    assert.ok('simplicity' in result.serfDimensions);
    assert.ok('readability' in result.serfDimensions);
    assert.ok('security' in result.serfDimensions);
  });

  it('should check covenant', () => {
    const result = deepScore('function add(a, b) { return a + b; }');
    assert.ok(typeof result.covenantSealed === 'boolean');
  });

  it('should score clean code higher than messy code', () => {
    const clean = deepScore('function add(a, b) { return a + b; }');
    const messy = deepScore('var x=1;var y=2;eval("x+y");if(x){if(y){if(x+y){console.log(x)}}}');
    assert.ok(clean.aggregate > messy.aggregate);
  });

  it('should include weights used', () => {
    const result = deepScore('const x = 1;');
    assert.ok(result.weights);
    assert.ok('serfCoherence' in result.weights);
    assert.ok('security' in result.weights);
  });
});

// ─── Repo Score Tests ───

describe('Scoring — repoScore', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should score a repo with files', () => {
    createTestFile(tmpDir, 'a.js', 'function a() { return 1; }');
    createTestFile(tmpDir, 'b.js', 'function b() { return 2; }');
    const result = repoScore(tmpDir);
    assert.ok(result.totalFiles === 2);
    assert.ok(result.aggregate >= 0);
    assert.ok(result.aggregate <= 1);
    assert.ok(result.dimensions);
    assert.ok(result.health);
  });

  it('should identify worst and best files', () => {
    createTestFile(tmpDir, 'good.js', 'function add(a, b) { return a + b; }');
    createTestFile(tmpDir, 'bad.js', 'var x=1;eval("x");');
    const result = repoScore(tmpDir);
    assert.ok(result.worstFiles.length > 0);
    assert.ok(result.bestFiles.length > 0);
  });

  it('should collect security findings across repo', () => {
    createTestFile(tmpDir, 'safe.js', 'function add(a, b) { return a + b; }');
    createTestFile(tmpDir, 'unsafe.js', 'function run(input) {\n  const result = eval(input);\n  return result;\n}');
    const result = repoScore(tmpDir);
    assert.ok(result.securityFindings.length > 0);
  });

  it('should handle empty directory', () => {
    const result = repoScore(tmpDir);
    assert.equal(result.totalFiles, 0);
    assert.equal(result.aggregate, 0);
  });

  it('should classify health status', () => {
    createTestFile(tmpDir, 'a.js', 'function a() { return 1; }');
    const result = repoScore(tmpDir);
    assert.ok(['healthy', 'stable', 'needs attention'].includes(result.health));
  });

  it('should include per-file details', () => {
    createTestFile(tmpDir, 'a.js', 'function a() { return 1; }');
    const result = repoScore(tmpDir);
    assert.ok(result.files.length === 1);
    assert.ok(result.files[0].path);
    assert.ok(typeof result.files[0].aggregate === 'number');
  });
});

// ─── Utility Tests ───

describe('Scoring — stripStringsAndComments', () => {
  it('should remove single-line comments', () => {
    const result = stripStringsAndComments('code // comment');
    assert.ok(!result.includes('comment'));
  });

  it('should remove block comments', () => {
    const result = stripStringsAndComments('code /* block */ more');
    assert.ok(!result.includes('block'));
  });

  it('should replace string content', () => {
    const result = stripStringsAndComments('const x = "hello world";');
    assert.ok(!result.includes('hello world'));
  });
});

describe('Scoring — formatDeepScore', () => {
  it('should format a deep score result as text', () => {
    const result = deepScore('function add(a, b) { return a + b; }');
    const text = formatDeepScore(result);
    assert.ok(text.includes('Deep Coherence Score'));
    assert.ok(text.includes('Aggregate'));
    assert.ok(text.includes('SERF'));
    assert.ok(text.includes('Complexity'));
    assert.ok(text.includes('Security'));
  });
});

// ─── Index Exports Tests ───

describe('Scoring Exports', () => {
  it('should export scoring functions from index', () => {
    const index = require('../src/index');
    assert.ok(typeof index.reflectorDeepScore === 'function');
    assert.ok(typeof index.reflectorRepoScore === 'function');
    assert.ok(typeof index.reflectorCyclomaticComplexity === 'function');
    assert.ok(typeof index.reflectorCommentDensity === 'function');
    assert.ok(typeof index.reflectorSecurityScan === 'function');
    assert.ok(typeof index.reflectorNestingDepth === 'function');
    assert.ok(typeof index.reflectorQualityMetrics === 'function');
    assert.ok(typeof index.reflectorFormatDeepScore === 'function');
  });
});

// ─── Reflector functions accessible (MCP consolidated) ───

describe('Scoring — reflector functions (MCP consolidated)', () => {
  it('scoring functions are directly importable from scoring', () => {
    const scoring = require('../src/reflector/scoring');
    assert.strictEqual(typeof scoring.deepScore, 'function');
    assert.strictEqual(typeof scoring.repoScore, 'function');
    assert.strictEqual(typeof scoring.securityScan, 'function');
    assert.strictEqual(typeof scoring.calculateCyclomaticComplexity, 'function');
    assert.strictEqual(typeof scoring.analyzeCommentDensity, 'function');
    assert.strictEqual(typeof scoring.analyzeNestingDepth, 'function');
    assert.strictEqual(typeof scoring.computeQualityMetrics, 'function');
    assert.strictEqual(typeof scoring.formatDeepScore, 'function');
  });

  it('MCP has 11 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 11);
  });
});
