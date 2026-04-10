'use strict';

/**
 * Fractal Bridge — The Universal Connection Layer
 *
 * Every system in the ecosystem told us the same thing:
 *   Oracle:    "Make wrapAgent() the primary interface"
 *   Void:     "Auto-feed high-resonance results back to Oracle"
 *   Reflector: "Use Dialer instead of raw HTTP"
 *   Swarm:    "Wrap agents with agent-integration.js"
 *   Dialer:   "Be the only way services talk to each other"
 *
 * This module implements the retrocausal pull — the completed version
 * of the ecosystem where every service uses the same fractal shape:
 *
 *   receive(task) → validate(oracle + void) → transform(ai + heal) → emit(register + report)
 *
 * It wraps Oracle, Void, Reflector, Swarm, and Dialer into a single
 * coherent interface where the fractal pattern repeats at every scale.
 */

// ─── The Fractal Unit ────────────────────────────────────────────
//
//   ┌─────────┐     ┌──────────┐     ┌───────────┐     ┌─────────┐
//   │ RECEIVE │ ──→ │ VALIDATE │ ──→ │ TRANSFORM │ ──→ │  EMIT   │
//   └─────────┘     └──────────┘     └───────────┘     └─────────┘
//
// This shape repeats for:
//   - A single function call
//   - A module operation
//   - A service interaction
//   - The entire ecosystem pipeline

// ─── Bridge Configuration ────────────────────────────────────────

const DEFAULT_BRIDGE_CONFIG = {
  oracle: { enabled: true, url: null, local: true },
  void: { enabled: true, url: null, local: true },
  reflector: { enabled: true, url: null, local: true },
  swarm: { enabled: false, url: null, local: true },
  autoCascade: true,
  autoRegister: true,
  autoHeal: true,
  healingMode: 'auto',        // 'auto' | 'llm' | 'structural'
  escalateToSwarm: true,       // Escalate to Swarm if healing fails
  coherenceThreshold: 0.68,
  registerThreshold: 0.80,
  cascadeThreshold: 0.50,      // High-resonance → auto-register with Oracle
};

// ─── Fractal Bridge ──────────────────────────────────────────────

class FractalBridge {
  constructor(options = {}) {
    this._config = { ...DEFAULT_BRIDGE_CONFIG, ...options };
    this._oracle = null;
    this._dialer = null;
    this._workflow = null;
    this._agent = null;
    this._stats = {
      received: 0, validated: 0, transformed: 0, emitted: 0,
      healed: 0, cascaded: 0, registered: 0, escalated: 0,
    };
  }

  /**
   * Initialize all connections.
   * Auto-detects local vs remote for each service.
   */
  async init() {
    // Try to load Oracle locally
    if (this._config.oracle.local) {
      try {
        const { RemembranceOracle } = require('./api/oracle');
        this._oracle = new RemembranceOracle({ autoSeed: true });
        if (typeof this._oracle.init === 'function') await this._oracle.init();
      } catch {}
    }

    // Try to load Dialer for cross-service communication
    try {
      const dialer = require('../Remembrance-dialer/src');
      if (dialer) this._dialer = dialer;
    } catch {
      // Dialer not available as local module — use HTTP fallback
    }

    // Set up auto-workflow
    if (this._oracle) {
      const { AutoWorkflow } = require('./core/auto-workflow');
      this._workflow = new AutoWorkflow(this._oracle, {
        rootDir: process.cwd(),
        voidUrl: this._config.void.url,
      });
    }

    // Set up agent wrapper
    if (this._oracle) {
      const { wrapAgent } = require('./agent-integration');
      this._agent = wrapAgent(this._oracle, {
        voidUrl: this._config.void.url,
        rootDir: process.cwd(),
      });
    }

    return this;
  }

  // ─── RECEIVE ─────────────────────────────────────────────────

  /**
   * Receive a task from any source.
   * Normalizes input into the standard fractal shape.
   *
   * @param {string|object} input - Task description or { task, code, language, options }
   * @returns {object} Normalized request
   */
  receive(input) {
    this._stats.received++;
    const now = new Date().toISOString();

    if (typeof input === 'string') {
      return { task: input, code: null, language: 'javascript', timestamp: now, source: 'direct' };
    }

    return {
      task: input.task || input.description || '',
      code: input.code || null,
      language: input.language || 'javascript',
      filePath: input.filePath || null,
      timestamp: now,
      source: input.source || 'api',
      options: input.options || {},
    };
  }

  // ─── VALIDATE ────────────────────────────────────────────────

  /**
   * Validate via Oracle search + Void cascade.
   * Finds existing patterns and checks resonance.
   *
   * @param {object} request - From receive()
   * @returns {object} Validated request with patterns + resonance
   */
  async validate(request) {
    this._stats.validated++;
    const validation = { patterns: [], decision: 'GENERATE', cascade: null };

    // Oracle: Search for existing patterns
    if (this._oracle && request.task) {
      try {
        const matches = this._oracle.search(request.task, {
          limit: 3,
          language: request.language,
        });
        validation.patterns = (matches || []).map(m => ({
          name: m.name,
          coherency: m.coherencyScore?.total || m.coherency || 0,
          code: m.code,
        }));

        if (validation.patterns.length > 0) {
          const top = validation.patterns[0].coherency;
          validation.decision = top >= 0.68 ? 'PULL' : top >= 0.50 ? 'EVOLVE' : 'GENERATE';
        }
      } catch {}
    }

    // Void: Cascade existing code for resonance
    if (this._config.autoCascade && request.code) {
      try {
        if (this._workflow) {
          validation.cascade = await this._workflow._cascade(
            request.code,
            request.filePath || request.task?.slice(0, 40) || 'bridge'
          );
          this._stats.cascaded++;
        }
      } catch {}
    }

    return { ...request, validation };
  }

  // ─── TRANSFORM ───────────────────────────────────────────────

  /**
   * Transform: generate/heal code based on validation.
   *
   * - PULL: Use proven pattern directly
   * - EVOLVE: Adapt pattern with AI
   * - GENERATE: Create new with AI (or structural)
   * - HEAL: Fix existing code that's below threshold
   *
   * @param {object} validated - From validate()
   * @param {function} [aiCall] - Optional AI function (prompt, task) => code
   * @returns {object} Transformed result with code
   */
  async transform(validated, aiCall) {
    this._stats.transformed++;
    const result = { code: validated.code, method: 'passthrough', healed: false, coherency: 0 };

    // If we have code, score it
    if (result.code && this._oracle) {
      try {
        const scored = this._oracle.computeCoherencyScore
          ? this._oracle.computeCoherencyScore(result.code, { language: validated.language })
          : { total: 0.7 };
        result.coherency = scored.total || 0;
      } catch {}
    }

    // PULL: Use proven pattern
    if (validated.validation?.decision === 'PULL' && validated.validation.patterns[0]?.code) {
      result.code = validated.validation.patterns[0].code;
      result.method = 'pull';
      result.source = validated.validation.patterns[0].name;
      result.coherency = validated.validation.patterns[0].coherency;
    }

    // EVOLVE/GENERATE with AI
    else if (aiCall && this._agent) {
      try {
        const generated = await this._agent.generate(aiCall, validated.task, {
          language: validated.language,
          name: validated.filePath || validated.task?.slice(0, 30),
        });
        if (generated.code) {
          result.code = generated.code;
          result.method = generated.decision?.decision?.toLowerCase() || 'generate';
          result.coherency = generated.coherency || 0;
        }
      } catch {}
    }

    // HEAL: If code is below threshold
    if (result.code && result.coherency < this._config.coherenceThreshold && this._config.autoHeal) {
      try {
        const { smartHeal } = require('./core/llm-healing');
        const healed = await smartHeal(result.code, {
          language: validated.language,
          mode: this._config.healingMode,
          scoreFn: this._oracle?.computeCoherencyScore
            ? (c) => this._oracle.computeCoherencyScore(c, { language: validated.language })
            : undefined,
        });
        if (healed.improved) {
          result.code = healed.code;
          result.coherency = healed.coherency;
          result.healed = true;
          result.healMethod = healed.method;
          result.whisper = healed.whisper;
          this._stats.healed++;
        }
      } catch {}
    }

    // ESCALATE to Swarm if still below threshold
    if (result.code && result.coherency < this._config.coherenceThreshold && this._config.escalateToSwarm) {
      // Swarm escalation would go here when Swarm is connected
      this._stats.escalated++;
    }

    return { ...validated, result };
  }

  // ─── EMIT ────────────────────────────────────────────────────

  /**
   * Emit: register successful patterns + report.
   *
   * @param {object} transformed - From transform()
   * @returns {object} Final output with registration status
   */
  async emit(transformed) {
    this._stats.emitted++;
    const output = {
      code: transformed.result?.code || transformed.code,
      coherency: transformed.result?.coherency || 0,
      method: transformed.result?.method || 'unknown',
      healed: transformed.result?.healed || false,
      registered: false,
      cascade: transformed.validation?.cascade || null,
      whisper: transformed.result?.whisper || '',
    };

    // Auto-register high-quality code
    if (this._config.autoRegister && output.coherency >= this._config.registerThreshold && this._oracle) {
      try {
        if (typeof this._oracle.submit === 'function') {
          this._oracle.submit(output.code, {
            language: transformed.language,
            description: transformed.task || 'fractal-bridge-output',
            tags: [transformed.language, 'fractal-bridge', output.method],
            author: 'fractal-bridge',
          });
          output.registered = true;
          this._stats.registered++;
        }
      } catch {}
    }

    // Auto-register high-resonance cascade results with Oracle
    if (output.cascade && output.cascade.coherence >= this._config.cascadeThreshold && this._oracle) {
      // Feed resonance discovery back — the retrocausal loop
      try {
        if (typeof this._oracle.submit === 'function' && !output.registered) {
          this._oracle.submit(output.code, {
            language: transformed.language,
            description: 'high-resonance-cascade: ' + (output.cascade.matches?.[0]?.domain || 'unknown'),
            tags: [transformed.language, 'cascade-discovered', 'high-resonance'],
          });
          output.registered = true;
        }
      } catch {}
    }

    return output;
  }

  // ─── FULL PIPELINE ───────────────────────────────────────────

  /**
   * Run the complete fractal pipeline.
   *
   * @param {string|object} input - Task or { task, code, language }
   * @param {function} [aiCall] - Optional AI function
   * @returns {object} Complete result
   */
  async process(input, aiCall) {
    const received = this.receive(input);
    const validated = await this.validate(received);
    const transformed = await this.transform(validated, aiCall);
    const output = await this.emit(transformed);

    return {
      ...output,
      decision: validated.validation?.decision || 'GENERATE',
      patterns: validated.validation?.patterns?.length || 0,
      pipeline: 'receive → validate → transform → emit',
      stats: { ...this._stats },
    };
  }

  /** Get bridge stats */
  get stats() { return { ...this._stats }; }
}

// ─── Singleton ───────────────────────────────────────────────────

let _bridge = null;

async function getBridge(options) {
  if (!_bridge) {
    _bridge = new FractalBridge(options);
    await _bridge.init();
  }
  return _bridge;
}

module.exports = { FractalBridge, getBridge, DEFAULT_BRIDGE_CONFIG };
