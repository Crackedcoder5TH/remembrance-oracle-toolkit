const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LLMClient, LLMGenerator } = require('../src/core/llm-generator');

// ─── LLMClient ───

describe('LLMClient', () => {
  it('creates with default options', () => {
    const client = new LLMClient();
    assert.equal(client.provider, 'anthropic');
    assert.equal(client.temperature, 0.3);
    assert.equal(client.maxTokens, 2048);
  });

  it('creates with custom options', () => {
    const client = new LLMClient({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 4096,
    });
    assert.equal(client.provider, 'openai');
    assert.equal(client.apiKey, 'test-key');
    assert.equal(client.model, 'gpt-4');
    assert.equal(client.temperature, 0.7);
    assert.equal(client.maxTokens, 4096);
  });

  it('isConfigured returns false without API key', () => {
    // Temporarily clear env vars
    const savedAnthropic = process.env.ANTHROPIC_API_KEY;
    const savedOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const client = new LLMClient();
    assert.equal(client.isConfigured(), false);

    // Restore
    if (savedAnthropic) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedOpenAI) process.env.OPENAI_API_KEY = savedOpenAI;
  });

  it('isConfigured returns true with API key', () => {
    const client = new LLMClient({ apiKey: 'test-key' });
    assert.equal(client.isConfigured(), true);
  });

  it('complete throws without API key', async () => {
    const savedAnthropic = process.env.ANTHROPIC_API_KEY;
    const savedOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const client = new LLMClient();
    await assert.rejects(
      () => client.complete('system', 'user'),
      { message: /API key not configured/ }
    );

    if (savedAnthropic) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedOpenAI) process.env.OPENAI_API_KEY = savedOpenAI;
  });

  it('uses correct default model for anthropic', () => {
    const client = new LLMClient({ provider: 'anthropic', apiKey: 'test' });
    assert.ok(client.model.includes('claude'));
  });

  it('uses correct default model for openai', () => {
    const client = new LLMClient({ provider: 'openai', apiKey: 'test' });
    assert.ok(client.model.includes('gpt'));
  });

  it('accepts custom baseUrl', () => {
    const client = new LLMClient({ baseUrl: 'http://localhost:8080' });
    assert.equal(client.baseUrl, 'http://localhost:8080');
  });

  it('temperature can be set to 0', () => {
    const client = new LLMClient({ temperature: 0 });
    assert.equal(client.temperature, 0);
  });
});

// ─── LLMGenerator ───

describe('LLMGenerator', () => {
  it('creates with default options', () => {
    const gen = new LLMGenerator();
    assert.ok(gen.client instanceof LLMClient);
    assert.equal(gen.fallbackToRegex, true);
    assert.equal(gen.verbose, false);
  });

  it('creates with custom client', () => {
    const client = new LLMClient({ apiKey: 'test', provider: 'openai' });
    const gen = new LLMGenerator({ client });
    assert.equal(gen.client, client);
  });

  it('isAvailable returns false without key', () => {
    const savedAnthropic = process.env.ANTHROPIC_API_KEY;
    const savedOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const gen = new LLMGenerator();
    assert.equal(gen.isAvailable(), false);

    if (savedAnthropic) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedOpenAI) process.env.OPENAI_API_KEY = savedOpenAI;
  });

  it('isAvailable returns true with key', () => {
    const gen = new LLMGenerator({ apiKey: 'test-key' });
    assert.equal(gen.isAvailable(), true);
  });

  describe('_extractCode', () => {
    const gen = new LLMGenerator();

    it('extracts from markdown code block', () => {
      const text = '```javascript\nfunction test() { return 42; }\n```';
      const code = gen._extractCode(text, 'javascript');
      assert.equal(code, 'function test() { return 42; }');
    });

    it('extracts from generic code block', () => {
      const text = '```\ndef test(): return 42\n```';
      const code = gen._extractCode(text, 'python');
      assert.equal(code, 'def test(): return 42');
    });

    it('extracts from language-specific block', () => {
      const text = '```python\ndef hello():\n    return "world"\n```';
      const code = gen._extractCode(text, 'python');
      assert.equal(code, 'def hello():\n    return "world"');
    });

    it('returns raw code when no blocks', () => {
      const text = 'function test() { return 42; }';
      const code = gen._extractCode(text, 'javascript');
      assert.equal(code, 'function test() { return 42; }');
    });

    it('returns null for empty text', () => {
      assert.equal(gen._extractCode('', 'javascript'), null);
      assert.equal(gen._extractCode(null, 'javascript'), null);
    });

    it('rejects explanation-only text', () => {
      const text = 'Here is the implementation...';
      const code = gen._extractCode(text, 'javascript');
      assert.equal(code, null);
    });

    it('handles multiple code blocks — takes first', () => {
      const text = '```js\nconst a = 1;\n```\n\n```js\nconst b = 2;\n```';
      const code = gen._extractCode(text, 'js');
      assert.equal(code, 'const a = 1;');
    });
  });

  describe('_parseTranspileResponse', () => {
    const gen = new LLMGenerator();
    const pattern = {
      name: 'quickSort',
      code: 'function quickSort() {}',
      language: 'javascript',
      description: 'Quick sort',
      tags: ['sort'],
    };

    it('parses code-only response', () => {
      const response = '```python\ndef quick_sort():\n    pass\n```';
      const result = gen._parseTranspileResponse(response, pattern, 'python');
      assert.ok(result);
      assert.equal(result.language, 'python');
      assert.ok(result.code.includes('quick_sort'));
      assert.ok(result.tags.includes('python'));
      assert.ok(result.tags.includes('llm-generated'));
    });

    it('parses code + tests response', () => {
      const response = '```python\ndef sort(arr):\n    return sorted(arr)\n```\n---TESTS---\n```python\nassert sort([3,1,2]) == [1,2,3]\n```';
      const result = gen._parseTranspileResponse(response, pattern, 'python');
      assert.ok(result);
      assert.ok(result.code.includes('sort'));
      assert.ok(result.testCode.includes('assert'));
    });

    it('returns null for empty response', () => {
      const result = gen._parseTranspileResponse('', pattern, 'python');
      assert.equal(result, null);
    });

    it('applies python naming convention', () => {
      const result = gen._parseTranspileResponse('def test(): pass', pattern, 'python');
      assert.ok(result);
      assert.ok(result.name.includes('quick_sort'));
    });

    it('applies go naming convention', () => {
      const result = gen._parseTranspileResponse('func Test() {}', pattern, 'go');
      assert.ok(result);
      // Go names start with uppercase
      assert.ok(result.name.startsWith('Q') || result.name.startsWith('q'));
    });

    it('preserves parent pattern reference', () => {
      const result = gen._parseTranspileResponse('code here', pattern, 'typescript');
      assert.ok(result);
      assert.equal(result.parentPattern, 'quickSort');
    });
  });

  describe('transpile (without API)', () => {
    it('returns null when API unavailable', async () => {
      const gen = new LLMGenerator({ verbose: false });
      const result = await gen.transpile(
        { code: 'function x() {}', language: 'javascript', name: 'x' },
        'python'
      );
      assert.equal(result, null);
    });
  });

  describe('generateTests (without API)', () => {
    it('returns null when API unavailable', async () => {
      const gen = new LLMGenerator({ verbose: false });
      const result = await gen.generateTests({
        code: 'function x() { return 42; }',
        language: 'javascript',
        name: 'x',
      });
      assert.equal(result, null);
    });
  });

  describe('generateAlternative (without API)', () => {
    it('returns null when API unavailable', async () => {
      const gen = new LLMGenerator({ verbose: false });
      const result = await gen.generateAlternative({
        code: 'function sort(arr) { return arr.sort(); }',
        language: 'javascript',
        name: 'sort',
      });
      assert.equal(result, null);
    });
  });

  describe('refine (without API)', () => {
    it('returns null when API unavailable', async () => {
      const gen = new LLMGenerator({ verbose: false });
      const result = await gen.refine(
        { code: 'function x() {}', language: 'javascript' },
        { correctness: 0.5, simplicity: 0.4 }
      );
      assert.equal(result, null);
    });
  });

  describe('generateDocs (without API)', () => {
    it('returns null when API unavailable', async () => {
      const gen = new LLMGenerator({ verbose: false });
      const result = await gen.generateDocs({
        code: 'function x() { return 42; }',
        language: 'javascript',
      });
      assert.equal(result, null);
    });
  });
});
