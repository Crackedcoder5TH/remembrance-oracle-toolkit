'use strict';

const { DIMENSIONS } = require('./swarm-config');

/**
 * Specialist system prompts for each remembrance dimension.
 * These shape how each agent approaches the task.
 */
const DIMENSION_PROMPTS = {
  simplicity: [
    'You are the Simplicity Specialist.',
    'Your prime directive: the simplest correct solution wins.',
    'Strip every unnecessary layer. Fewer lines, fewer branches, fewer abstractions.',
    'If a junior developer cannot understand it in 30 seconds, simplify further.',
    'Reject cleverness in favor of clarity.',
  ].join(' '),

  correctness: [
    'You are the Correctness Specialist.',
    'Your prime directive: the code must be provably correct under all inputs.',
    'Think about edge cases: null, undefined, empty arrays, negative numbers, overflow, NaN.',
    'Consider type coercion traps, off-by-one errors, and boundary conditions.',
    'If it can fail, it will — find that failure before it ships.',
  ].join(' '),

  readability: [
    'You are the Readability Specialist.',
    'Your prime directive: code is read 10× more than it is written.',
    'Prioritize clear naming, logical flow, and self-documenting structure.',
    'Variable names should reveal intent. Functions should do one thing well.',
    'The best comment is the one you do not need because the code speaks for itself.',
  ].join(' '),

  security: [
    'You are the Security Specialist.',
    'Your prime directive: no code ships with known vulnerability classes.',
    'Check for injection (SQL, command, XSS), prototype pollution, path traversal.',
    'Validate all external input. Never trust user data. Sanitize before use.',
    'Apply the principle of least privilege. Default-deny over default-allow.',
  ].join(' '),

  efficiency: [
    'You are the Efficiency Specialist.',
    'Your prime directive: minimize time and space complexity without sacrificing clarity.',
    'Choose the right data structure. Avoid unnecessary allocations and copies.',
    'Be aware of O(n²) traps in nested loops, repeated string concatenation, and redundant work.',
    'Profile before optimizing — but when you optimize, be decisive.',
  ].join(' '),

  unity: [
    'You are the Unity Specialist.',
    'Your prime directive: the code must harmonize with the surrounding codebase.',
    'Match existing conventions: naming style, error handling patterns, module structure.',
    'The best addition is one that looks like it was always there.',
    'Consider how this code composes with what already exists.',
  ].join(' '),

  fidelity: [
    'You are the Fidelity Specialist.',
    'Your prime directive: the code must faithfully implement the stated requirements.',
    'Every requirement must map to code. Every code path must trace to a requirement.',
    'No gold-plating — implement what was asked, not what you imagine might be needed.',
    'Verify that the output matches the specification exactly.',
  ].join(' '),
};

/**
 * Assign dimensions to agents using round-robin distribution.
 * If more agents than dimensions, extras become generalists.
 * If more dimensions than agents, some agents cover multiple.
 *
 * @param {object[]} agents - Array of agent adapters from the pool
 * @param {string[]} [dimensions] - Dimensions to assign (defaults to all)
 * @returns {Map<string, string[]>} Map of agentName → dimension[]
 */
function assignDimensions(agents, dimensions) {
  dimensions = dimensions || DIMENSIONS;
  const assignments = new Map();

  // Initialize all agents with empty arrays
  for (const agent of agents) {
    assignments.set(agent.name, []);
  }

  if (agents.length === 0) return assignments;

  // Round-robin: distribute dimensions across agents
  for (let i = 0; i < dimensions.length; i++) {
    const agent = agents[i % agents.length];
    assignments.get(agent.name).push(dimensions[i]);
  }

  // Agents without dimensions become generalists
  for (const [name, dims] of assignments) {
    if (dims.length === 0) {
      assignments.set(name, ['generalist']);
    }
  }

  return assignments;
}

/**
 * Build a specialist prompt for an agent given its assigned dimensions.
 *
 * @param {string} task - The user's task/question
 * @param {string[]} dimensions - The dimensions this agent specializes in
 * @param {object} [context] - Additional context (language, existingCode, etc.)
 * @returns {object} { system, user } prompts
 */
function buildSpecialistPrompt(task, dimensions, context = {}) {
  const systemParts = [];

  for (const dim of dimensions) {
    if (dim === 'generalist') {
      systemParts.push(
        'You are a Generalist Agent. Evaluate the task holistically across all quality dimensions: simplicity, correctness, readability, security, efficiency, unity, and fidelity. Balance all concerns equally.'
      );
    } else if (DIMENSION_PROMPTS[dim]) {
      systemParts.push(DIMENSION_PROMPTS[dim]);
    }
  }

  systemParts.push('');
  systemParts.push('IMPORTANT RULES:');
  systemParts.push('1. Return ONLY code in a fenced code block (```language ... ```).');
  systemParts.push('2. After the code block, provide a brief explanation (2-3 sentences max).');
  systemParts.push('3. Rate your own confidence in this solution from 0.0 to 1.0 on the last line as: CONFIDENCE: <number>');

  if (context.language) {
    systemParts.push(`4. Write the solution in ${context.language}.`);
  }

  const userParts = [];
  if (context.existingCode) {
    userParts.push('EXISTING CODE:\n```\n' + context.existingCode + '\n```\n');
  }
  userParts.push('TASK: ' + task);

  return {
    system: systemParts.join('\n'),
    user: userParts.join('\n'),
  };
}

/**
 * Parse an agent's response into structured output.
 * Extracts code block, explanation, and confidence score.
 *
 * @param {string} response - Raw agent response text
 * @returns {object} { code, explanation, confidence }
 */
function parseAgentResponse(response) {
  if (!response) return { code: '', explanation: '', confidence: 0.5 };

  // Extract code block
  const codeMatch = response.match(/```[\w]*\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : '';

  // Extract confidence
  const confMatch = response.match(/CONFIDENCE:\s*([\d.]+)/i);
  const confidence = confMatch ? Math.min(1, Math.max(0, parseFloat(confMatch[1]))) : 0.5;

  // Everything else is explanation
  let explanation = response;
  if (codeMatch) explanation = explanation.replace(codeMatch[0], '').trim();
  if (confMatch) explanation = explanation.replace(confMatch[0], '').trim();
  explanation = explanation.replace(/^\s*\n+|\n+\s*$/g, '').slice(0, 500);

  return { code, explanation, confidence };
}

module.exports = {
  DIMENSION_PROMPTS,
  assignDimensions,
  buildSpecialistPrompt,
  parseAgentResponse,
};
