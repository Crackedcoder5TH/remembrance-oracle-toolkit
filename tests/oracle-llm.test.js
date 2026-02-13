const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { RemembranceOracle } = require('../src/api/oracle');
const { ClaudeBridge } = require('../src/core/claude-bridge');

// Test with a fresh oracle in a temp directory
function createTestOracle(claudeOverride) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
  const oracle = new RemembranceOracle({
    baseDir: tmpDir,
    autoSeed: false,
    autoGrow: false,
    claude: claudeOverride || null,
  });
  return { oracle, tmpDir };
}

// Create a mock Claude bridge that returns predictable responses
function createMockClaude() {
  const bridge = new ClaudeBridge({ verbose: false });
  bridge._available = true;
  bridge.prompt = function(prompt) {
    if (prompt.includes('Convert this') || prompt.includes('Transpile') || prompt.includes('transpiler')) {
      return '```python\ndef add(a, b):\n    return a + b\n```';
    }
    if (prompt.includes('Generate comprehensive tests') || prompt.includes('test')) {
      return '```javascript\nif (add(1, 2) !== 3) throw new Error("fail");\nif (add(0, 0) !== 0) throw new Error("fail zero");\n```';
    }
    if (prompt.includes('alternative implementation')) {
      return '```javascript\nfunction add(a, b) { return a - (-b); }\n```';
    }
    if (prompt.includes('Improve this')) {
      return '```javascript\nfunction add(a, b) {\n  if (typeof a !== "number") throw new TypeError("a must be number");\n  return a + b;\n}\n```';
    }
    if (prompt.includes('Write a JSDoc') || prompt.includes('Write a Google') || prompt.includes('doc comment')) {
      return '/**\n * Adds two numbers together.\n * @param {number} a - First number\n * @param {number} b - Second number\n * @returns {number} The sum\n */';
    }
    if (prompt.includes('Analyze this')) {
      return '{"issues": [{"severity": "low", "description": "No type checking"}], "suggestions": ["Add type annotations"], "complexity": "low", "quality": 0.85}';
    }
    if (prompt.includes('Explain what')) {
      return 'This function adds two numbers together and returns their sum.';
    }
    return null;
  };
  return bridge;
}

// Register a test pattern in the oracle
function registerTestPattern(oracle) {
  return oracle.registerPattern({
    name: 'add',
    code: 'function add(a, b) { return a + b; }',
    language: 'javascript',
    description: 'Add two numbers',
    tags: ['math', 'utility'],
    testCode: 'if (add(1, 2) !== 3) throw new Error("fail");',
  });
}

describe('Oracle LLM Integration', () => {
  let oracle, tmpDir, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    ({ oracle, tmpDir } = createTestOracle(mockClaude));
    registerTestPattern(oracle);
  });

  it('isLLMAvailable returns true with mock', () => {
    assert.equal(oracle.isLLMAvailable(), true);
  });

  it('isLLMAvailable returns false without claude', () => {
    const { oracle: plain } = createTestOracle();
    // Force unavailability
    plain._getClaude()._available = false;
    assert.equal(plain.isLLMAvailable(), false);
  });
});

describe('Oracle llmTranspile', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
    registerTestPattern(oracle);
  });

  it('transpiles via Claude when available', () => {
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmTranspile(patterns[0].id, 'python');
    assert.equal(result.success, true);
    assert.equal(result.method, 'claude');
    assert.ok(result.result.code.includes('def add'));
    assert.equal(result.result.language, 'python');
  });

  it('falls back to AST when Claude fails', () => {
    mockClaude.prompt = () => null; // Force Claude failure
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmTranspile(patterns[0].id, 'python');
    // Should fall back to AST transpiler
    assert.equal(result.success, true);
    assert.equal(result.method, 'ast');
    assert.ok(result.result.code.includes('def'));
  });

  it('returns error for unknown pattern', () => {
    const result = oracle.llmTranspile('nonexistent', 'python');
    assert.equal(result.success, false);
    assert.ok(result.error.includes('not found'));
  });
});

describe('Oracle llmGenerateTests', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
    registerTestPattern(oracle);
  });

  it('generates tests via Claude', () => {
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmGenerateTests(patterns[0].id);
    assert.equal(result.success, true);
    assert.equal(result.method, 'claude');
    assert.ok(result.testCode.includes('add(1, 2)'));
  });

  it('returns error for unknown pattern', () => {
    const result = oracle.llmGenerateTests('nonexistent');
    assert.equal(result.success, false);
  });
});

describe('Oracle llmRefine', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
    registerTestPattern(oracle);
  });

  it('refines via Claude', () => {
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmRefine(patterns[0].id);
    assert.equal(result.success, true);
    assert.equal(result.method, 'claude');
    assert.ok(result.refinedCode.includes('function add'));
  });

  it('falls back to reflection when Claude fails', () => {
    mockClaude.prompt = () => null;
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmRefine(patterns[0].id);
    // Reflection may or may not improve — but should return with reflection method or fail gracefully
    assert.ok(result.method === 'reflection' || result.method === 'none');
  });
});

describe('Oracle llmAlternative', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
    registerTestPattern(oracle);
  });

  it('generates alternative via Claude', () => {
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmAlternative(patterns[0].id);
    assert.equal(result.success, true);
    assert.equal(result.method, 'claude');
    assert.equal(result.alternative.name, 'add-alt');
    assert.ok(result.alternative.tags.includes('alternative'));
  });
});

describe('Oracle llmDocs', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
    registerTestPattern(oracle);
  });

  it('generates docs via Claude', () => {
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmDocs(patterns[0].id);
    assert.equal(result.success, true);
    assert.ok(result.docs.includes('Adds two numbers'));
  });
});

describe('Oracle llmAnalyze', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
  });

  it('analyzes via Claude', () => {
    const result = oracle.llmAnalyze('function add(a, b) { return a + b; }', 'javascript');
    assert.equal(result.success, true);
    assert.equal(result.method, 'claude');
    assert.equal(result.analysis.quality, 0.85);
    assert.equal(result.analysis.complexity, 'low');
  });

  it('falls back to coherency when Claude fails', () => {
    mockClaude.prompt = () => null;
    const result = oracle.llmAnalyze('function add(a, b) { return a + b; }', 'javascript');
    assert.equal(result.success, true);
    assert.equal(result.method, 'coherency');
    assert.ok(typeof result.analysis.quality === 'number');
  });
});

describe('Oracle llmExplain', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
    registerTestPattern(oracle);
  });

  it('explains via Claude', () => {
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmExplain(patterns[0].id);
    assert.equal(result.success, true);
    assert.equal(result.method, 'claude');
    assert.ok(result.explanation.includes('adds'));
  });

  it('falls back to metadata when Claude fails', () => {
    mockClaude.prompt = () => null;
    const patterns = oracle.patterns.getAll();
    const result = oracle.llmExplain(patterns[0].id);
    assert.equal(result.success, true);
    assert.equal(result.method, 'metadata');
  });
});

describe('Oracle llmGenerate', () => {
  let oracle, mockClaude;

  beforeEach(() => {
    mockClaude = createMockClaude();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-llm-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false, autoGrow: false, claude: mockClaude });
    registerTestPattern(oracle);
  });

  it('generates LLM-enhanced candidates with promotion', () => {
    const result = oracle.llmGenerate({ maxPatterns: 5, languages: ['python'] });
    assert.equal(result.method, 'claude');
    assert.ok(result.generated >= 0);
    assert.ok('promoted' in result);
  });

  it('falls back to regex when Claude unavailable', () => {
    mockClaude._available = false;
    const result = oracle.llmGenerate({ maxPatterns: 5 });
    assert.equal(result.method, 'regex');
  });

  it('supports autoPromote=false to skip promotion', () => {
    const result = oracle.llmGenerate({ maxPatterns: 5, languages: ['python'], autoPromote: false });
    assert.equal(result.promoted, 0);
  });
});
