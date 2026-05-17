'use strict';


/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

/**
 * AI Agent Integration Layer
 *
 * Wraps ANY AI agent (Claude, GPT, Gemini, etc.) with the Remembrance
 * auto-workflow so the full pipeline runs automatically:
 *
 *   BEFORE the AI writes:
 *     - Search Oracle for proven patterns matching the task
 *     - Resolve decision (PULL/EVOLVE/GENERATE)
 *     - Build context-enriched system prompt with patterns
 *
 *   AFTER the AI writes:
 *     - Score the output (7-dimension coherency)
 *     - Heal if below threshold (SERF loop)
 *     - Cascade via Void Compressor (cross-domain validation)
 *     - Register successful patterns (auto-grows the library)
 *
 * Usage:
 *   const { wrapAgent } = require('remembrance-oracle-toolkit/agent');
 *   const agent = wrapAgent(oracle, { voidUrl: 'http://localhost:8080' });
 *
 *   // Now every call goes through the full pipeline:
 *   const result = await agent.generate('build a rate limiter', { language: 'javascript' });
 *   // result.code is validated, healed, cascade-checked, and registered
 *
 * For MCP:
 *   The oracle_swarm MCP tool now auto-wraps agents with this layer.
 *
 * For Claude Code / CLI:
 *   The CLAUDE.md instructions enforce the search-before-write reflex.
 *   This module makes it programmatic instead of instruction-dependent.
 */

const { AutoWorkflow, loadWorkflowConfig } = require('./core/auto-workflow');

// ─── System Prompt Builder ───────────────────────────────────────

/**
 * Build a system prompt that primes the AI with Oracle patterns.
 * This is what makes the AI "remembrance-aware" automatically.
 */
function buildRememberedSystemPrompt(oracle, task, options = {}) {
  const { language = 'javascript', existingCode, maxPatterns = 3 } = options;
  const parts = [];

  // 1. Core instruction
  parts.push('You are a code generator with access to a library of proven, tested patterns.');
  parts.push('Before writing code from scratch, check if a proven pattern exists.');
  parts.push('');

  // 2. Search for relevant patterns
  let searchResults = [];
  let decision = { decision: 'GENERATE', confidence: 0 };

  if (oracle && typeof oracle.search === 'function') {
    try {
      searchResults = oracle.search(task, { limit: maxPatterns + 2, language });
      if (searchResults.length > 0) {
        const best = searchResults[0];
        const score = best.coherencyScore?.total || best.coherency || 0;
        decision = {
          decision: score >= 0.68 ? 'PULL' : score >= 0.50 ? 'EVOLVE' : 'GENERATE',
          confidence: score,
          pattern: best.name,
        };
      }
    } catch {}
  }

  // 3. Inject patterns based on decision
  if (decision.decision === 'PULL' && searchResults[0]?.code) {
    parts.push('PROVEN PATTERN FOUND — USE THIS AS YOUR STARTING POINT:');
    parts.push(`Pattern: ${searchResults[0].name} (coherency: ${decision.confidence.toFixed(3)})`);
    parts.push('Decision: PULL — this pattern is proven and tested. Use it as-is or with minimal adaptation.');
    parts.push('');
    parts.push('```' + language);
    parts.push(searchResults[0].code.slice(0, 2000));
    parts.push('```');
    parts.push('');
    parts.push('Adapt this pattern to fit the specific request. Maintain the same structure and quality level.');
  } else if (decision.decision === 'EVOLVE' && searchResults[0]?.code) {
    parts.push('SIMILAR PATTERN FOUND — EVOLVE FROM THIS:');
    parts.push(`Pattern: ${searchResults[0].name} (coherency: ${decision.confidence.toFixed(3)})`);
    parts.push('Decision: EVOLVE — this pattern is a good starting point but needs significant adaptation.');
    parts.push('');
    parts.push('```' + language);
    parts.push(searchResults[0].code.slice(0, 1500));
    parts.push('```');
    parts.push('');
    parts.push('Use the structural approach from this pattern but rewrite for the specific request.');
  } else {
    parts.push('No proven pattern found for this task. Write fresh code.');
    if (searchResults.length > 0) {
      parts.push('Related patterns for reference (lower confidence):');
      for (const r of searchResults.slice(0, 2)) {
        parts.push(`  - ${r.name} (${(r.coherencyScore?.total || r.coherency || 0).toFixed(3)})`);
      }
    }
  }

  parts.push('');

  // 4. Quality requirements
  parts.push('QUALITY REQUIREMENTS (your output will be auto-scored on these 7 dimensions):');
  parts.push('  1. Syntax — balanced braces, valid structure');
  parts.push('  2. Completeness — no TODOs, FIXMEs, or placeholders');
  parts.push('  3. Readability — comments on non-obvious logic (>5% comment density)');
  parts.push('  4. Simplicity — max nesting depth 5, no unnecessary complexity');
  parts.push('  5. Security — no eval(), no innerHTML, no unsanitized input');
  parts.push('  6. Consistency — uniform style throughout');
  parts.push('  7. Testability — exported functions, clear interfaces');
  parts.push('');
  parts.push('Target coherency: >= 0.80. Code below 0.68 will be auto-healed.');

  // 5. If existing code provided (review/improve mode)
  if (existingCode) {
    parts.push('');
    parts.push('EXISTING CODE TO IMPROVE:');
    parts.push('```' + language);
    parts.push(existingCode.slice(0, 3000));
    parts.push('```');
  }

  return {
    systemPrompt: parts.join('\n'),
    decision,
    patternsFound: searchResults.length,
    topPattern: searchResults[0]?.name || null,
  };
}

// ─── Agent Wrapper ───────────────────────────────────────────────

/**
 * Wrap any AI agent with the full Remembrance workflow.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - { voidUrl, rootDir, autoHeal, autoRegister }
 * @returns {object} Wrapped agent with generate(), review(), heal()
 */
function wrapAgent(oracle, options = {}) {
  const config = loadWorkflowConfig(options.rootDir);
  const workflow = new AutoWorkflow(oracle, options);

  return {
    /**
     * Build the system prompt for any AI request.
     * Call this BEFORE sending the task to the AI.
     */
    prime(task, opts = {}) {
      return buildRememberedSystemPrompt(oracle, task, opts);
    },

    /**
     * Validate AI output through the full auto-workflow.
     * Call this AFTER the AI returns code.
     *
     * @param {string} code - AI-generated code
     * @param {object} opts - { language, name, filePath }
     * @returns {object} { code (possibly healed), coherency, cascade, registered, steps }
     */
    async validate(code, opts = {}) {
      const { language = 'javascript', name = 'ai-generated', filePath } = opts;

      // If we have a file path, use the full workflow
      if (filePath) {
        const fs = require('fs');
        fs.writeFileSync(filePath, code, 'utf-8');
        const result = await workflow.processFile(filePath, { trigger: 'api' });
        // Read back potentially healed code
        const finalCode = fs.readFileSync(filePath, 'utf-8');
        const __retVal = {
          code: finalCode,
          coherency: result.finalCoherency || 0,
          healed: !!result.steps?.heal?.written,
          registered: !!result.steps?.register?.registered,
          cascade: result.steps?.cascade || null,
          steps: result.steps,
        };
        // ── LRE field-coupling (auto-wired) ──
        try {
          const __lre_p1 = './core/field-coupling';
          const __lre_p2 = require('path').join(__dirname, 'core/field-coupling');
          for (const __p of [__lre_p1, __lre_p2]) {
            try {
              const { contribute: __contribute } = require(__p);
              __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.coherency || 0)), source: 'oracle:agent-integration:validate' });
              break;
            } catch (_) { /* try next */ }
          }
        } catch (_) { /* best-effort */ }
        return __retVal;
      }

      // No file path — score and cascade in memory
      const steps = {};

      // Score
      let coherency = 0;
      if (oracle.computeCoherencyScore) {
        const scored = oracle.computeCoherencyScore(code, { language });
        coherency = scored.total || 0;
        steps.score = { coherency, dimensions: scored.dimensions };
      }

      // Heal if needed
      let finalCode = code;
      if (config.autoHeal && coherency > 0 && coherency < config.coherenceThreshold) {
        if (oracle.reflect) {
          const healed = oracle.reflect(code, { language, maxIterations: 3 });
          if (healed.finalCode && healed.finalCode !== code) {
            finalCode = healed.finalCode;
            const reScored = oracle.computeCoherencyScore ? oracle.computeCoherencyScore(finalCode, { language }) : { total: coherency };
            const newCoherency = reScored.total || coherency;
            steps.heal = { before: coherency, after: newCoherency, improvement: newCoherency - coherency };
            coherency = newCoherency;
          }
        }
      }

      // Cascade
      if (config.autoCascade && config.voidUrl) {
        try {
          const cascadeResult = await workflow._cascade(finalCode, name);
          if (cascadeResult) {
            steps.cascade = {
              coherence: cascadeResult.coherence || 0,
              topMatch: cascadeResult.matches?.[0]?.domain || 'none',
            };
          }
        } catch {}
      }

      // Register
      let registered = false;
      if (config.autoRegister && coherency >= config.registerMinCoherency && oracle.submit) {
        try {
          oracle.submit(finalCode, { language, description: name, tags: [language, 'ai-generated'] });
          registered = true;
        } catch {}
      }

      return { code: finalCode, coherency, healed: !!steps.heal, registered, cascade: steps.cascade || null, steps };
    },

    /**
     * Full generate pipeline: prime → (external AI call) → validate.
     *
     * The actual AI call is provided by the caller since we're model-agnostic.
     * This method handles everything AROUND the AI.
     *
     * @param {function} aiCall - async (systemPrompt, userPrompt) => string (code)
     * @param {string} task - What to build
     * @param {object} opts - { language, name }
     * @returns {object} Full pipeline result
     */
    async generate(aiCall, task, opts = {}) {
      const startTime = Date.now();

      // BEFORE: Prime with Oracle patterns
      const primed = this.prime(task, opts);

      // AI CALL: External model generates code
      let aiCode;
      try {
        aiCode = await aiCall(primed.systemPrompt, task);
      } catch (err) {
        return { error: 'AI call failed: ' + err.message, primed };
      }

      // AFTER: Validate through auto-workflow
      const validated = await this.validate(aiCode, opts);

      return {
        ...validated,
        decision: primed.decision,
        patternsUsed: primed.patternsFound,
        topPattern: primed.topPattern,
        durationMs: Date.now() - startTime,
      };
    },

    /** Access the underlying workflow */
    workflow,

    /** Access stats */
    get stats() { return workflow.stats; },

    /** Disable/enable */
    disable() { workflow.disable(); },
    enable() { workflow.enable(); },
  };
}

// ─── MCP Integration ─────────────────────────────────────────────

/**
 * Build MCP tool definitions that include auto-workflow.
 * These replace the raw oracle_* tools with workflow-wrapped versions.
 */
function getWorkflowMcpTools() {
  return [
    {
      name: 'remembrance_generate',
      description: 'Generate code with the full Remembrance workflow: search Oracle for proven patterns, decide PULL/EVOLVE/GENERATE, then validate the output with 7-dimension scoring, SERF healing, and Void cascade resonance. Returns production-ready code with full provenance.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What to build (e.g., "rate limiter with Redis backing")' },
          language: { type: 'string', description: 'Target language', default: 'javascript' },
          name: { type: 'string', description: 'Name for the generated module' },
        },
        required: ['task'],
      },
    },
    {
      name: 'remembrance_validate',
      description: 'Validate code through the full auto-workflow: score (7 dimensions), heal if below 0.68, cascade via Void Compressor, register if above 0.80. Use this AFTER writing code to ensure quality.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code to validate' },
          language: { type: 'string', description: 'Code language', default: 'javascript' },
          name: { type: 'string', description: 'Label for this code' },
        },
        required: ['code'],
      },
    },
    {
      name: 'remembrance_prime',
      description: 'Get a system prompt enriched with relevant Oracle patterns BEFORE writing code. Returns the system prompt to use, the decision (PULL/EVOLVE/GENERATE), and the top matching pattern.',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What you plan to build' },
          language: { type: 'string', description: 'Target language', default: 'javascript' },
        },
        required: ['task'],
      },
    },
  ];
}

module.exports = {
  wrapAgent,
  buildRememberedSystemPrompt,
  getWorkflowMcpTools,
};
