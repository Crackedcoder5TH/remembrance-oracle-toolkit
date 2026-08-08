const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ClaudeBridge, extractCodeBlock, convertName, findClaudeCLI } = require('../src/core/claude-bridge');

// ─── extractCodeBlock ───

describe('extractCodeBlock', () => {
  it('extracts language-specific code block', () => {
    const response = 'Here is the code:\n```javascript\nfunction add(a, b) { return a + b; }\n```';
    const code = extractCodeBlock(response, 'javascript');
    assert.equal(code, 'function add(a, b) { return a + b; }');
  });

  it('extracts generic code block', () => {
    const response = '```\nresult = a + b\n```';
    const code = extractCodeBlock(response, 'python');
    assert.equal(code, 'result = a + b');
  });

  it('extracts python code block', () => {
    const response = '```python\ndef add(a, b):\n    return a + b\n```';
    const code = extractCodeBlock(response, 'python');
    assert.equal(code, 'def add(a, b):\n    return a + b');
  });

  it('returns raw code when no blocks found', () => {
    const response = 'function add(a, b) { return a + b; }';
    const code = extractCodeBlock(response, 'javascript');
    assert.equal(code, 'function add(a, b) { return a + b; }');
  });

  it('returns null for empty response', () => {
    assert.equal(extractCodeBlock(null, 'js'), null);
    assert.equal(extractCodeBlock('', 'js'), null);
  });

  it('rejects prose responses', () => {
    assert.equal(extractCodeBlock('Here is what the code does...', 'js'), null);
    assert.equal(extractCodeBlock('This function adds two numbers.', 'js'), null);
    assert.equal(extractCodeBlock('I would suggest using map.', 'js'), null);
  });

  it('handles multiple code blocks (returns first)', () => {
    const response = '```js\nconst a = 1;\n```\nAnd also:\n```js\nconst b = 2;\n```';
    const code = extractCodeBlock(response, 'js');
    assert.equal(code, 'const a = 1;');
  });
});

// ─── convertName ───

describe('convertName', () => {
  it('converts camelCase to snake_case for Python', () => {
    assert.equal(convertName('getUserData', 'python'), 'get_user_data');
    assert.equal(convertName('parseJSON', 'python'), 'parse_json');
    assert.equal(convertName('simple', 'python'), 'simple');
  });

  it('capitalizes first letter for Go', () => {
    assert.equal(convertName('getUserData', 'go'), 'GetUserData');
    assert.equal(convertName('Simple', 'go'), 'Simple');
  });

  it('keeps name unchanged for other languages', () => {
    assert.equal(convertName('getUserData', 'typescript'), 'getUserData');
    assert.equal(convertName('getUserData', 'javascript'), 'getUserData');
  });
});

// ─── ClaudeBridge construction ───

describe('ClaudeBridge', () => {
  it('creates with default options', () => {
    const bridge = new ClaudeBridge();
    assert.equal(bridge.timeout, 60000);
    assert.equal(bridge.model, null);
    assert.equal(bridge.verbose, false);
  });

  it('creates with custom options', () => {
    const bridge = new ClaudeBridge({
      timeout: 30000,
      model: 'claude-sonnet-4-5-20250929',
      verbose: true,
    });
    assert.equal(bridge.timeout, 30000);
    assert.equal(bridge.model, 'claude-sonnet-4-5-20250929');
    assert.equal(bridge.verbose, true);
  });

  it('isAvailable detects CLI presence', () => {
    const bridge = new ClaudeBridge();
    const available = bridge.isAvailable();
    // Should be boolean — true if claude is installed, false otherwise
    assert.equal(typeof available, 'boolean');
  });

  it('caches availability result', () => {
    const bridge = new ClaudeBridge();
    const first = bridge.isAvailable();
    const second = bridge.isAvailable();
    assert.equal(first, second);
  });

  it('prompt returns null when CLI unavailable', () => {
    const bridge = new ClaudeBridge({ cliPath: '/nonexistent/path/to/claude' });
    bridge._available = false;
    const result = bridge.prompt('test');
    assert.equal(result, null);
  });

  it('promptAsync returns null when CLI unavailable', async () => {
    const bridge = new ClaudeBridge({ cliPath: '/nonexistent/path/to/claude' });
    bridge._available = false;
    const result = await bridge.promptAsync('test');
    assert.equal(result, null);
  });
});

// ─── ClaudeBridge operations with mock ───

describe('ClaudeBridge operations', () => {
  let bridge;

  beforeEach(() => {
    bridge = new ClaudeBridge({ verbose: false });
    // Mock prompt to return predictable responses
    bridge._available = true;
    bridge._mockResponses = new Map();
    const origPrompt = bridge.prompt.bind(bridge);
    bridge.prompt = function(prompt) {
      // Check mock responses
      for (const [key, response] of this._mockResponses) {
        if (prompt.includes(key)) return response;
      }
      return null;
    };
  });

  it('transpile returns structured result', () => {
    bridge._mockResponses.set('Convert this', '```python\ndef add(a, b):\n    return a + b\n```');
    const result = bridge.transpile(
      { name: 'add', code: 'function add(a, b) { return a + b; }', language: 'javascript', tags: ['math'] },
      'python'
    );
    assert.ok(result);
    assert.equal(result.language, 'python');
    assert.ok(result.code.includes('def add'));
    assert.ok(result.tags.includes('claude-generated'));
    assert.ok(result.tags.includes('python'));
  });

  it('transpile returns null on empty response', () => {
    const result = bridge.transpile(
      { name: 'test', code: 'x', language: 'javascript', tags: [] },
      'python'
    );
    assert.equal(result, null);
  });

  it('generateTests returns test code', () => {
    bridge._mockResponses.set('Generate comprehensive tests', '```javascript\nif (add(1, 2) !== 3) throw new Error("fail");\n```');
    const result = bridge.generateTests({ code: 'function add(a, b) { return a + b; }', language: 'javascript' });
    assert.ok(result);
    assert.ok(result.includes('add(1, 2)'));
  });

  it('generateTests returns null on failure', () => {
    const result = bridge.generateTests({ code: 'x', language: 'javascript' });
    assert.equal(result, null);
  });

  it('generateAlternative returns structured result', () => {
    bridge._mockResponses.set('alternative implementation', '```javascript\nfunction add(a, b) { return a - (-b); }\n```');
    const result = bridge.generateAlternative(
      { name: 'add', code: 'function add(a, b) { return a + b; }', language: 'javascript', tags: ['math'] }
    );
    assert.ok(result);
    assert.equal(result.name, 'add-alt');
    assert.ok(result.tags.includes('alternative'));
    assert.ok(result.tags.includes('claude-generated'));
  });

  it('refine returns improved code', () => {
    bridge._mockResponses.set('Improve this', '```javascript\nfunction add(a, b) {\n  if (typeof a !== "number") throw new TypeError();\n  return a + b;\n}\n```');
    const result = bridge.refine(
      { code: 'function add(a, b) { return a + b; }', language: 'javascript' },
      { correctness: 0.5, simplicity: 0.9 }
    );
    assert.ok(result);
    assert.ok(result.includes('function add'));
  });

  it('refine includes weak dimensions in prompt', () => {
    let capturedPrompt = '';
    bridge.prompt = function(prompt) { capturedPrompt = prompt; return '```js\ncode\n```'; };
    bridge.refine(
      { code: 'x', language: 'javascript' },
      { correctness: 0.3, simplicity: 0.9, total: 0.6 }
    );
    assert.ok(capturedPrompt.includes('correctness: 0.30'));
    assert.ok(!capturedPrompt.includes('simplicity')); // Above 0.7 threshold
    assert.ok(!capturedPrompt.includes('total')); // Skip 'total' field
  });

  it('generateDocs returns documentation', () => {
    bridge._mockResponses.set('Write a', '/**\n * Adds two numbers.\n * @param {number} a\n * @param {number} b\n * @returns {number}\n */');
    const result = bridge.generateDocs({ code: 'function add(a, b) { return a + b; }', language: 'javascript' });
    assert.ok(result);
    assert.ok(result.includes('Adds two numbers'));
  });

  it('analyze returns structured JSON', () => {
    bridge._mockResponses.set('Analyze this', '{"issues": [], "suggestions": ["Add types"], "complexity": "low", "quality": 0.85}');
    const result = bridge.analyze('function add(a, b) { return a + b; }', 'javascript');
    assert.ok(result);
    assert.equal(result.quality, 0.85);
    assert.equal(result.complexity, 'low');
  });

  it('analyze returns null on invalid JSON', () => {
    bridge._mockResponses.set('Analyze this', 'This code is fine.');
    const result = bridge.analyze('x', 'javascript');
    assert.equal(result, null);
  });

  it('explain returns text', () => {
    bridge._mockResponses.set('Explain what', 'This function adds two numbers together and returns the sum.');
    const result = bridge.explain('function add(a, b) { return a + b; }', 'javascript');
    assert.ok(result);
    assert.ok(result.includes('adds'));
  });

  it('transpile converts name to Python snake_case', () => {
    bridge._mockResponses.set('Convert this', '```python\ndef get_user():\n    pass\n```');
    const result = bridge.transpile(
      { name: 'getUserData', code: 'function getUserData() {}', language: 'javascript', tags: [] },
      'python'
    );
    assert.ok(result.name.startsWith('get_user_data'));
  });

  it('transpile converts name to Go PascalCase', () => {
    bridge._mockResponses.set('Convert this', '```go\nfunc GetUser() {}\n```');
    const result = bridge.transpile(
      { name: 'getUser', code: 'function getUser() {}', language: 'javascript', tags: [] },
      'go'
    );
    assert.ok(result.name.startsWith('GetUser'));
  });
});

// ─── findClaudeCLI ───

describe('findClaudeCLI', () => {
  it('returns a string or null', () => {
    const result = findClaudeCLI();
    assert.ok(result === null || typeof result === 'string');
  });
});
