const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { AIConnector } = require('../src/connectors/connector');
const {
  OPENAI_TOOLS, ANTHROPIC_TOOLS, GEMINI_TOOLS, MCP_TOOLS,
  fromOpenAI, toOpenAI,
  fromAnthropic, toAnthropic,
  fromGemini, toGemini,
  fromMCP, toMCP,
} = require('../src/connectors/providers');
const {
  parseIssueCommand,
  parseNaturalLanguage,
  formatAsComment,
} = require('../src/connectors/github-bridge');

describe('AIConnector', () => {
  let tmpDir;
  let connector;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connector-test-'));
    connector = new AIConnector({ baseDir: tmpDir, provider: 'test', modelId: 'test-model', autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes submit command', () => {
    const result = connector.execute({
      action: 'submit',
      params: {
        code: 'function add(a, b) { return a + b; }',
        language: 'javascript',
        description: 'Add numbers',
        tags: ['math'],
      },
    });
    assert.equal(result.action, 'submit');
    assert.equal(result.accepted, true);
    assert.ok(result.id);
    assert.ok(result.coherencyScore > 0);
  });

  it('executes query command', () => {
    connector.execute({
      action: 'submit',
      params: { code: 'function add(a, b) { return a + b; }', tags: ['math'] },
    });
    const result = connector.execute({
      action: 'query',
      params: { description: 'math', tags: ['math'] },
    });
    assert.equal(result.action, 'query');
    assert.ok(result.count >= 1);
    assert.ok(result.results[0].code.includes('add'));
  });

  it('executes stats command', () => {
    const result = connector.execute({ action: 'stats', params: {} });
    assert.equal(result.action, 'stats');
    assert.ok('totalEntries' in result);
  });

  it('executes feedback command', () => {
    const { id } = connector.execute({
      action: 'submit',
      params: { code: 'function x() { return 1; }', tags: ['test'] },
    });
    const result = connector.execute({
      action: 'feedback',
      params: { id, succeeded: true },
    });
    assert.equal(result.action, 'feedback');
    assert.equal(result.success, true);
  });

  it('returns error for unknown action', () => {
    const result = connector.execute({ action: 'nonexistent' });
    assert.ok(result.error);
    assert.ok(result.availableActions.includes('query'));
  });
});

describe('Provider: OpenAI', () => {
  it('has tool definitions', () => {
    assert.ok(OPENAI_TOOLS.length >= 4);
    assert.equal(OPENAI_TOOLS[0].type, 'function');
    assert.equal(OPENAI_TOOLS[0].function.name, 'oracle_submit');
  });

  it('translates from OpenAI format', () => {
    const cmd = fromOpenAI({
      function: {
        name: 'oracle_query',
        arguments: JSON.stringify({ description: 'sorting', language: 'javascript' }),
      },
    });
    assert.equal(cmd.action, 'query');
    assert.equal(cmd.params.description, 'sorting');
  });

  it('translates to OpenAI format', () => {
    const msg = toOpenAI({ action: 'query', count: 1 }, 'call_123');
    assert.equal(msg.role, 'tool');
    assert.equal(msg.tool_call_id, 'call_123');
    assert.ok(msg.content.includes('query'));
  });
});

describe('Provider: Anthropic', () => {
  it('has tool definitions', () => {
    assert.ok(ANTHROPIC_TOOLS.length >= 4);
    assert.equal(ANTHROPIC_TOOLS[0].name, 'oracle_submit');
    assert.ok(ANTHROPIC_TOOLS[0].input_schema);
  });

  it('translates from Anthropic format', () => {
    const cmd = fromAnthropic({ name: 'oracle_submit', input: { code: 'x = 1' } });
    assert.equal(cmd.action, 'submit');
    assert.equal(cmd.params.code, 'x = 1');
  });

  it('translates to Anthropic format', () => {
    const msg = toAnthropic({ action: 'submit', accepted: true }, 'tu_456');
    assert.equal(msg.type, 'tool_result');
    assert.equal(msg.tool_use_id, 'tu_456');
  });
});

describe('Provider: Gemini', () => {
  it('has tool definitions', () => {
    assert.ok(GEMINI_TOOLS[0].functionDeclarations.length >= 4);
  });

  it('translates from Gemini format', () => {
    const cmd = fromGemini({ name: 'oracle_stats', args: {} });
    assert.equal(cmd.action, 'stats');
  });

  it('translates to Gemini format', () => {
    const msg = toGemini({ action: 'stats', totalEntries: 5 });
    assert.ok(msg.functionResponse);
    assert.equal(msg.functionResponse.response.totalEntries, 5);
  });
});

describe('Provider: MCP', () => {
  it('has tool definitions', () => {
    assert.ok(MCP_TOOLS.length >= 4);
    assert.ok(MCP_TOOLS[0].inputSchema);
  });

  it('translates from MCP format', () => {
    const cmd = fromMCP({ name: 'oracle_query', arguments: { description: 'test' } });
    assert.equal(cmd.action, 'query');
  });

  it('translates to MCP format', () => {
    const msg = toMCP({ action: 'query', count: 0, results: [] });
    assert.ok(msg.content[0].type === 'text');
  });
});

describe('GitHub Bridge', () => {
  it('parses JSON code block from issue body', () => {
    const body = 'Hello\n```json\n{"action":"query","params":{"description":"sorting"}}\n```\nThanks';
    const cmd = parseIssueCommand(body);
    assert.equal(cmd.action, 'query');
    assert.equal(cmd.params.description, 'sorting');
  });

  it('parses raw JSON from issue body', () => {
    const body = '{"action":"stats"}';
    const cmd = parseIssueCommand(body);
    assert.equal(cmd.action, 'stats');
  });

  it('parses natural language query', () => {
    const cmd = parseNaturalLanguage('I need a sorting algorithm in javascript');
    assert.equal(cmd.action, 'query');
    assert.equal(cmd.params.language, 'javascript');
  });

  it('parses natural language stats', () => {
    const cmd = parseNaturalLanguage('show me the stats');
    assert.equal(cmd.action, 'stats');
  });

  it('formats query result as markdown comment', () => {
    const comment = formatAsComment({
      action: 'query',
      count: 1,
      results: [{
        id: 'abc123',
        code: 'function sort() {}',
        language: 'javascript',
        description: 'Sort function',
        coherencyScore: 0.85,
        relevanceScore: 0.9,
        tags: ['sort'],
      }],
    });
    assert.ok(comment.includes('## Oracle Response'));
    assert.ok(comment.includes('Sort function'));
    assert.ok(comment.includes('function sort()'));
    assert.ok(comment.includes('0.85'));
  });

  it('formats stats as markdown table', () => {
    const comment = formatAsComment({
      action: 'stats',
      totalEntries: 42,
      languages: ['javascript', 'python'],
      avgCoherency: 0.78,
    });
    assert.ok(comment.includes('42'));
    assert.ok(comment.includes('javascript'));
  });
});
