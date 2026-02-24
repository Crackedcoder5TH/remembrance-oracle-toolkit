'use strict';

/**
 * Remembrance-Aware Prompt Templating
 *
 * Centralized prompt templates per dimension with auto-injection of:
 * - Task description and context
 * - Historical high-coherence patterns from the oracle
 * - Dimension-specific guidance and constraints
 * - Previous successful patterns for the task type
 *
 * Oracle decision: EVOLVE from pipe (0.970) for composition +
 *   buildPeerReviewPrompts (0.880) for prompt structure.
 */

const { DIMENSIONS } = require('./swarm-config');

/**
 * Extended dimension templates with structured prompt sections.
 * Each template has: role, focus, rules, antiPatterns.
 */
const DIMENSION_TEMPLATES = {
  simplicity: {
    role: 'Simplicity Specialist',
    focus: 'Minimize complexity. Fewer lines, fewer branches, fewer abstractions.',
    rules: [
      'If a junior developer cannot understand it in 30 seconds, simplify further.',
      'Prefer flat over nested. Prefer explicit over clever.',
      'Every abstraction must justify its existence.',
    ],
    antiPatterns: ['over-engineering', 'premature abstraction', 'unnecessary indirection'],
  },
  correctness: {
    role: 'Correctness Specialist',
    focus: 'The code must be provably correct under all inputs.',
    rules: [
      'Handle edge cases: null, undefined, empty, negative, overflow, NaN.',
      'Consider type coercion traps and off-by-one errors.',
      'If it can fail, it will — find that failure before it ships.',
    ],
    antiPatterns: ['unchecked assumptions', 'missing boundary conditions', 'implicit type coercion'],
  },
  readability: {
    role: 'Readability Specialist',
    focus: 'Code is read 10x more than it is written.',
    rules: [
      'Variable names should reveal intent. Functions should do one thing well.',
      'Logical flow should be top-down, left-to-right.',
      'The best comment is the one you do not need.',
    ],
    antiPatterns: ['single-letter variables', 'deep nesting', 'magic numbers'],
  },
  security: {
    role: 'Security Specialist',
    focus: 'No code ships with known vulnerability classes.',
    rules: [
      'Validate all external input. Never trust user data.',
      'Check for injection (SQL, command, XSS), prototype pollution, path traversal.',
      'Default-deny over default-allow. Least privilege always.',
    ],
    antiPatterns: ['unsanitized input', 'eval/Function constructor', 'hardcoded secrets'],
  },
  efficiency: {
    role: 'Efficiency Specialist',
    focus: 'Minimize time and space complexity without sacrificing clarity.',
    rules: [
      'Choose the right data structure for the access pattern.',
      'Avoid O(n²) traps: nested loops, repeated string concat, redundant work.',
      'Profile before optimizing — but when you optimize, be decisive.',
    ],
    antiPatterns: ['unnecessary allocations', 'N+1 queries', 'blocking the event loop'],
  },
  unity: {
    role: 'Unity Specialist',
    focus: 'The code must harmonize with the surrounding codebase.',
    rules: [
      'Match existing conventions: naming style, error handling, module structure.',
      'The best addition looks like it was always there.',
      'Consider how this code composes with what already exists.',
    ],
    antiPatterns: ['style inconsistency', 'reinventing existing utilities', 'alien patterns'],
  },
  fidelity: {
    role: 'Fidelity Specialist',
    focus: 'The code must faithfully implement the stated requirements.',
    rules: [
      'Every requirement must map to code. Every code path must trace to a requirement.',
      'No gold-plating — implement what was asked, not what you imagine.',
      'Verify that the output matches the specification exactly.',
    ],
    antiPatterns: ['scope creep', 'unasked features', 'requirement gaps'],
  },
};

/**
 * Build a remembrance-aware prompt for an agent.
 * Composes: dimension template + task + oracle context + constraints.
 *
 * @param {string} task - The task description
 * @param {string[]} dimensions - Agent's assigned dimensions
 * @param {object} [context] - Additional context
 * @param {string} [context.language] - Target language
 * @param {string} [context.existingCode] - Code to improve
 * @param {boolean} [context.deepMode] - Enable chain-of-thought
 * @param {object[]} [context.oraclePatterns] - High-coherence patterns from oracle
 * @param {object} [context.providerHistory] - Provider performance data
 * @returns {object} { system, user }
 */
function buildRememberedPrompt(task, dimensions, context = {}) {
  const systemParts = [];

  // 1. Dimension role and guidance
  for (const dim of dimensions) {
    if (dim === 'generalist') {
      systemParts.push('You are a Generalist Agent. Evaluate holistically across all quality dimensions.');
    } else {
      const template = DIMENSION_TEMPLATES[dim];
      if (template) {
        systemParts.push(`You are the ${template.role}.`);
        systemParts.push(`FOCUS: ${template.focus}`);
        systemParts.push('RULES:');
        template.rules.forEach((r, i) => systemParts.push(`  ${i + 1}. ${r}`));
        systemParts.push(`AVOID: ${template.antiPatterns.join(', ')}`);
        systemParts.push('');
      }
    }
  }

  // 2. Oracle context injection — proven patterns for this task type
  if (context.oraclePatterns && context.oraclePatterns.length > 0) {
    systemParts.push('PROVEN PATTERNS FROM THE ORACLE:');
    systemParts.push('The following patterns have been validated with high coherence. Use them as reference:');
    for (const pattern of context.oraclePatterns.slice(0, 3)) {
      systemParts.push(`  - ${pattern.name || 'unnamed'} (coherency: ${(pattern.coherency || 0).toFixed(2)})`);
      if (pattern.code) {
        // Include a snippet, not the full code
        const snippet = pattern.code.split('\n').slice(0, 5).join('\n');
        systemParts.push(`    \`\`\`\n    ${snippet}\n    \`\`\``);
      }
    }
    systemParts.push('');
  }

  // 3. Response format rules
  systemParts.push('RESPONSE FORMAT:');
  systemParts.push('1. Return ONLY code in a fenced code block (```language ... ```).');
  systemParts.push('2. After the code block, provide a brief explanation (2-3 sentences max).');
  systemParts.push('3. Rate your confidence from 0.0 to 1.0 on the last line as: CONFIDENCE: <number>');

  if (context.language) {
    systemParts.push(`4. Write the solution in ${context.language}.`);
  }

  if (context.deepMode) {
    systemParts.push('5. DEEP MODE: Think step-by-step. Consider multiple approaches before choosing.');
  }

  // 4. Build user prompt
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
 * Pre-flight oracle search — find relevant patterns before dispatching to agents.
 * Returns high-coherence patterns that agents can use as reference.
 *
 * @param {string} task - Task description
 * @param {object} [oracle] - Oracle instance with search() method
 * @param {object} [options] - { limit, minCoherency }
 * @returns {object[]} Array of { name, code, coherency, tags }
 */
function preflightOracleSearch(task, oracle, options = {}) {
  if (!oracle || typeof oracle.search !== 'function') return [];

  const limit = options.limit || 3;
  const minCoherency = options.minCoherency || 0.7;

  try {
    const results = oracle.search(task, { limit: limit + 2 });
    if (!Array.isArray(results)) return [];

    return results
      .filter(r => (r.coherency || r.coherencyScore || 0) >= minCoherency)
      .slice(0, limit)
      .map(r => ({
        name: r.name || r.id || 'unnamed',
        code: r.code || '',
        coherency: r.coherency || r.coherencyScore || 0,
        tags: r.tags || '',
      }));
  } catch {
    return [];
  }
}

/**
 * Build prompts for all agents using remembrance-aware templates.
 * Pipe pattern: task → oracle search → template composition → per-agent prompts.
 *
 * @param {string} task - Task description
 * @param {Map<string, string[]>} assignments - Agent → dimensions mapping
 * @param {object} [context] - Context options
 * @param {object} [context.oracle] - Oracle instance for pre-flight search
 * @param {string} [context.language] - Target language
 * @param {string} [context.existingCode] - Existing code
 * @param {boolean} [context.deepMode] - Enable deep mode
 * @returns {Map<string, { system: string, user: string }>} Agent → prompt mapping
 */
function buildAllPrompts(task, assignments, context = {}) {
  // Pre-flight: search oracle for relevant patterns
  const oraclePatterns = preflightOracleSearch(task, context.oracle);

  const prompts = new Map();

  for (const [agentName, dimensions] of assignments) {
    const prompt = buildRememberedPrompt(task, dimensions, {
      ...context,
      oraclePatterns,
    });
    prompts.set(agentName, prompt);
  }

  return prompts;
}

module.exports = {
  DIMENSION_TEMPLATES,
  buildRememberedPrompt,
  preflightOracleSearch,
  buildAllPrompts,
};
