/**
 * Provider-specific adapters.
 *
 * Each adapter translates between a specific AI provider's tool-calling
 * format and the universal Oracle command format.
 */

const { AIConnector } = require('./connector');

// ─── OpenAI / GPT Function Calling Format ───

const OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'oracle_submit',
      description: 'Submit code to the Remembrance Oracle for validation and storage. Only code that proves itself (passes coherency + tests) gets stored.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code to submit' },
          language: { type: 'string', description: 'Programming language (javascript, python, rust, go, etc.)' },
          description: { type: 'string', description: 'What this code does' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Searchable tags' },
          test_code: { type: 'string', description: 'Test code to prove the code works' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'oracle_query',
      description: 'Query the Oracle for proven, relevant code snippets ranked by coherency and relevance.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Describe the code you need' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by' },
          language: { type: 'string', description: 'Language filter' },
          limit: { type: 'number', description: 'Max results (default 5)' },
          min_coherency: { type: 'number', description: 'Minimum coherency score 0-1 (default 0.5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'oracle_feedback',
      description: 'Report whether code pulled from the Oracle worked. Updates reliability scores.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The entry ID' },
          success: { type: 'boolean', description: 'Whether the code worked' },
        },
        required: ['id', 'success'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'oracle_stats',
      description: 'Get Oracle store statistics (total entries, languages, avg coherency).',
      parameters: { type: 'object', properties: {} },
    },
  },
];

function fromOpenAI(toolCall) {
  const name = toolCall.function?.name || toolCall.name;
  const args = typeof toolCall.function?.arguments === 'string'
    ? JSON.parse(toolCall.function.arguments)
    : toolCall.function?.arguments || toolCall.arguments || {};

  const actionMap = {
    oracle_submit: 'submit',
    oracle_query: 'query',
    oracle_feedback: 'feedback',
    oracle_stats: 'stats',
    oracle_inspect: 'inspect',
    oracle_prune: 'prune',
  };

  return { action: actionMap[name] || name.replace('oracle_', ''), params: args };
}

function toOpenAI(result, toolCallId) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify(result),
  };
}

// ─── Anthropic / Claude Tool Use Format ───

const ANTHROPIC_TOOLS = [
  {
    name: 'oracle_submit',
    description: 'Submit code to the Remembrance Oracle for validation and storage. Only code that proves itself (passes coherency + tests) gets stored.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to submit' },
        language: { type: 'string', description: 'Programming language' },
        description: { type: 'string', description: 'What this code does' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Searchable tags' },
        test_code: { type: 'string', description: 'Test code to prove the code works' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_query',
    description: 'Query the Oracle for proven, relevant code snippets ranked by coherency and relevance.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Describe the code you need' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by' },
        language: { type: 'string', description: 'Language filter' },
        limit: { type: 'number', description: 'Max results (default 5)' },
        min_coherency: { type: 'number', description: 'Minimum coherency score 0-1' },
      },
    },
  },
  {
    name: 'oracle_feedback',
    description: 'Report whether code pulled from the Oracle worked. Updates reliability scores.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The entry ID' },
        success: { type: 'boolean', description: 'Whether the code worked' },
      },
      required: ['id', 'success'],
    },
  },
  {
    name: 'oracle_stats',
    description: 'Get Oracle store statistics.',
    input_schema: { type: 'object', properties: {} },
  },
];

function fromAnthropic(toolUse) {
  const name = toolUse.name;
  const args = toolUse.input || {};
  return { action: name.replace('oracle_', ''), params: args };
}

function toAnthropic(result, toolUseId) {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: JSON.stringify(result),
  };
}

// ─── Google / Gemini Function Calling Format ───

const GEMINI_TOOLS = [{
  functionDeclarations: [
    {
      name: 'oracle_submit',
      description: 'Submit code to the Remembrance Oracle for validation and storage.',
      parameters: {
        type: 'OBJECT',
        properties: {
          code: { type: 'STRING', description: 'The code to submit' },
          language: { type: 'STRING', description: 'Programming language' },
          description: { type: 'STRING', description: 'What this code does' },
          tags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Searchable tags' },
          test_code: { type: 'STRING', description: 'Test code to prove the code works' },
        },
        required: ['code'],
      },
    },
    {
      name: 'oracle_query',
      description: 'Query for proven code snippets ranked by coherency and relevance.',
      parameters: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING', description: 'Describe the code you need' },
          tags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Tags to filter by' },
          language: { type: 'STRING', description: 'Language filter' },
          limit: { type: 'NUMBER', description: 'Max results' },
          min_coherency: { type: 'NUMBER', description: 'Minimum coherency 0-1' },
        },
      },
    },
    {
      name: 'oracle_feedback',
      description: 'Report whether pulled code worked.',
      parameters: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING', description: 'Entry ID' },
          success: { type: 'BOOLEAN', description: 'Whether it worked' },
        },
        required: ['id', 'success'],
      },
    },
    {
      name: 'oracle_stats',
      description: 'Get store statistics.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ],
}];

function fromGemini(functionCall) {
  const name = functionCall.name;
  const args = functionCall.args || {};
  return { action: name.replace('oracle_', ''), params: args };
}

function toGemini(result) {
  return {
    functionResponse: {
      name: 'oracle_response',
      response: result,
    },
  };
}

// ─── MCP (Model Context Protocol) Format ───

const MCP_TOOLS = [
  {
    name: 'oracle_submit',
    description: 'Submit code to the Remembrance Oracle. Only code that proves itself gets stored.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to submit' },
        language: { type: 'string', description: 'Programming language' },
        description: { type: 'string', description: 'What this code does' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Searchable tags' },
        test_code: { type: 'string', description: 'Test code to prove the code works' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_query',
    description: 'Query for proven code snippets ranked by coherency and relevance.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Describe what you need' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by' },
        language: { type: 'string', description: 'Language filter' },
        limit: { type: 'number', description: 'Max results' },
        min_coherency: { type: 'number', description: 'Minimum coherency 0-1' },
      },
    },
  },
  {
    name: 'oracle_feedback',
    description: 'Report whether pulled code worked. Updates reliability.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry ID' },
        success: { type: 'boolean', description: 'Whether it worked' },
      },
      required: ['id', 'success'],
    },
  },
  {
    name: 'oracle_stats',
    description: 'Get store statistics.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function fromMCP(toolCall) {
  return { action: toolCall.name.replace('oracle_', ''), params: toolCall.arguments || {} };
}

function toMCP(result) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

module.exports = {
  // Tool definitions (give these to the AI so it knows what it can call)
  OPENAI_TOOLS,
  ANTHROPIC_TOOLS,
  GEMINI_TOOLS,
  MCP_TOOLS,

  // Translators
  fromOpenAI, toOpenAI,
  fromAnthropic, toAnthropic,
  fromGemini, toGemini,
  fromMCP, toMCP,

  AIConnector,
};
