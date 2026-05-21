/**
 * @oracle-infrastructure
 *
 * OpenAI tool-calling schema export — converts the MCP TOOLS array
 * into the function-calling format used by Grok API, ChatGPT custom
 * GPTs, OpenRouter, llama.cpp servers, and anything else that speaks
 * the OpenAI `tools: [{type:"function",function:{...}}]` convention.
 *
 * The tool *names* and *schemas* are identical to the MCP tools — a
 * caller using the OpenAI schema can then route the model's
 * `tool_calls` straight at the same handlers (via the HTTP `/mcp`
 * endpoint or in-process via HANDLERS).
 */

const { TOOLS } = require('./server');

function toOpenAITools(tools = TOOLS) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));
}

toOpenAITools.atomicProperties = {
  charge: 0, valence: 8, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.7, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'mcp-schema-export',
};

module.exports = { toOpenAITools };
