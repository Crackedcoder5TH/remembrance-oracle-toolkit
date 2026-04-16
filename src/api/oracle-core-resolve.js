/**
 * Oracle Core — Resolve (Unified Quantum Measurement).
 *
 * Resolve is the fundamental MEASUREMENT of the quantum field.
 * It collapses the superposition of all matching patterns into a
 * definite decision (PULL / EVOLVE / GENERATE) via a single unified
 * measurement that fuses three formerly-separate systems:
 *
 *   1. FRACTAL ALIGNMENT → determines quantum sector + structural resonance
 *   2. AUDIT BUG-CLASS   → applies decoherence (bugs reduce amplitude)
 *   3. QUANTUM MECHANICS  → amplitude, interference, tunneling, Born rule
 *
 * The unified scorer replaces three independent post-processing passes
 * with one coherent measurement where all signals interact.
 */

const { reflectionLoop } = require('../core/reflection');
const { _generateResolveWhisper, _generateCandidateNotes } = require('./oracle-core-whispers');
const { parseIntent, ARCHITECTURAL_PATTERNS } = require('../core/search-intelligence');
const { auditLog } = require('../core/audit-logger');
const { captureResolveDebug } = require('../ci/auto-debug');
const { applyPromptTag, isOracleEnabled } = require('../core/oracle-config');
const { trackResolve } = require('../core/session-tracker');
const { enhanceResolveWithBugClasses } = require('../audit/resolve-hook');

// Quantum measurement engine
const {
  QUANTUM_STATES,
} = require('../quantum/quantum-core');

// Unified quantum scorer — single measurement fusing quantum + fractal + audit
let _unifiedMeasurement;
try {
  ({ unifiedMeasurement: _unifiedMeasurement } = require('../unified/quantum-scorer'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[resolve:init] Unified quantum scorer not available:', e?.message || e);
}

// Fractal alignment integration (fallback if unified scorer unavailable)
let _computeFractalAlignment, _selectResonantFractal;
try {
  ({ computeFractalAlignment: _computeFractalAlignment, selectResonantFractal: _selectResonantFractal } = require('../fractals'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[resolve:init] Fractal system not available:', e?.message || e);
}

module.exports = {
  /**
   * Resolves a code request by deciding whether to PULL, EVOLVE, or GENERATE.
   * Falls back to built-in architectural patterns for structural queries.
   */
  resolve(request = {}) {
    if (request == null || typeof request !== 'object') request = {};
    const { description = '', tags = [], language, minCoherency, heal = true } = request;

    // When oracle is toggled off, skip all pattern matching and return GENERATE
    if (!isOracleEnabled()) {
      return {
        decision: 'generate', confidence: 0, reasoning: 'Oracle is disabled (config off). Write new code.',
        pattern: null, healedCode: null, healedVariantId: null, whisper: null,
        candidateNotes: null, healing: null, alternatives: [], historyMatches: [],
        quantum: null, oracleDisabled: true,
      };
    }

    let decision = this.patterns.decide({ description, tags, language, minCoherency }) || { decision: 'generate', confidence: 0, alternatives: [] };
    const historyResults = this.query({ description, tags, language, limit: 3, minCoherency: 0.5 });

    // For structural queries with no strong match, check built-in architectural patterns.
    // Use a higher threshold (0.65) since low-confidence matches from the store
    // (like "validate-email" at 0.52) aren't useful for architectural questions.
    if (decision.decision === 'generate' || (decision.confidence || 0) < 0.65) {
      const intent = parseIntent(description);
      const isStructural = intent.intents.some(i => i.structural);
      if (isStructural && ARCHITECTURAL_PATTERNS.length > 0) {
        const words = (intent.rewritten || description).toLowerCase().split(/\s+/);
        let bestMatch = null;
        let bestScore = 0;
        for (const ap of ARCHITECTURAL_PATTERNS) {
          const allText = [ap.name, ap.description, ...ap.tags].join(' ').toLowerCase();
          const hits = words.filter(w => w.length > 2 && allText.includes(w)).length;
          const score = words.length > 0 ? hits / words.length : 0;
          if (score > bestScore) { bestScore = score; bestMatch = ap; }
        }
        if (bestMatch && bestScore > 0.2) {
          decision = {
            decision: 'pull', confidence: Math.min(1, bestScore + 0.3),
            reasoning: `Architectural pattern match: ${bestMatch.name}`,
            pattern: { ...bestMatch, coherencyScore: { total: 1.0 }, patternType: 'architecture' },
            alternatives: [],
          };
        }
      }
    }

    const patternData = decision.pattern ? {
      id: decision.pattern.id, name: decision.pattern.name, code: decision.pattern.code,
      language: decision.pattern.language, patternType: decision.pattern.patternType,
      complexity: decision.pattern.complexity, coherencyScore: decision.pattern.coherencyScore?.total,
      tags: decision.pattern.tags,
    } : null;

    let healedCode = patternData?.code || null;
    let healing = null;
    let healedVariantId = null;
    if (heal && patternData && (decision.decision === 'pull' || decision.decision === 'evolve')) {
      try {
        const lang = language || patternData.language || 'javascript';
        const maxLoops = decision.decision === 'evolve' ? 3 : 2;

        // Fractal loop closure: start healing from the best known healed variant
        // instead of the original, so each heal builds on the last
        let startCode = patternData.code;
        let startedFromVariant = false;
        if (this.patterns._sqlite && typeof this.patterns._sqlite.getBestHealedVariant === 'function') {
          try {
            const bestVariant = this.patterns._sqlite.getBestHealedVariant(patternData.id);
            if (bestVariant && bestVariant.healedCoherency > (patternData.coherencyScore || 0)) {
              startCode = bestVariant.healedCode;
              startedFromVariant = true;
            }
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.error('[resolve] Healing variant lookup failed:', e.message);
          }
        }

        this._emit({
          type: 'healing_start', patternId: patternData.id, patternName: patternData.name,
          decision: decision.decision, maxLoops, startedFromVariant,
        });

        healing = reflectionLoop(startCode, {
          language: lang, description, tags, maxLoops,
          onLoop: (loopData) => {
            this._emit({
              type: 'healing_progress', patternId: patternData.id, patternName: patternData.name,
              loop: loopData.loop, maxLoops, coherence: loopData.coherence, strategy: loopData.strategy,
              reflectionScore: loopData.reflectionScore, changed: loopData.changed,
            });
          },
        });
        healedCode = healing.code;

        this._emit({
          type: 'healing_complete', patternId: patternData.id, patternName: patternData.name,
          decision: decision.decision, loops: healing.loops, originalCoherence: healing.reflection?.I_AM,
          finalCoherence: healing.reflection?.finalCoherence, improvement: healing.reflection?.improvement,
          healingPath: healing.healingPath,
        });

        // Store healed variant as linked lineage when coherency improved
        const originalCoherency = patternData.coherencyScore || 0;
        const healedCoherency = healing.fullCoherency ?? healing.coherence ?? 0;
        if (healedCoherency > originalCoherency && this.patterns._sqlite) {
          try {
            const variant = this.patterns._sqlite.addHealedVariant({
              parentPatternId: patternData.id,
              healedCode: healing.code,
              originalCoherency,
              healedCoherency,
              healingLoops: healing.loops,
              healingStrategy: healing.healingPath?.[0]?.split(':')?.[0] || 'reflection',
              healingSummary: healing.healingSummary || null,
              whisper: healing.whisper || null,
            });
            healedVariantId = variant?.id || null;
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[resolve] healed variant storage failed:', e.message);
          }
        }

        // Record healing stats to persistent storage
        if (typeof this._trackHealingSuccess === 'function') {
          this._trackHealingSuccess(patternData.id, true, {
            coherencyBefore: originalCoherency,
            coherencyAfter: healedCoherency,
            healingLoops: healing.loops,
          });
        }
      } catch (_) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-resolve:onLoop] silent failure:', _?.message || _);
        healedCode = patternData.code;
        this._emit({
          type: 'healing_failed', patternId: patternData?.id, patternName: patternData?.name,
          error: _.message || 'Unknown healing error',
        });

        // Record failed healing attempt to persistent storage
        if (typeof this._trackHealingSuccess === 'function') this._trackHealingSuccess(patternData.id, false, {
          coherencyBefore: patternData.coherencyScore ?? 0,
          healingLoops: 0,
        });
      }
    }

    const whisper = _generateResolveWhisper(decision, patternData, healing);
    const candidateNotes = _generateCandidateNotes(decision);

    // Track that the pattern was served (not that it succeeded — that comes from explicit feedback)
    if (patternData?.id && (decision.decision === 'pull' || decision.decision === 'evolve')) {
      this._emit({ type: 'resolve_served', id: patternData.id, decision: decision.decision });
    }

    auditLog('resolve', { id: patternData?.id, name: patternData?.name, success: true, language: patternData?.language, meta: { decision: decision.decision, confidence: decision.confidence, healed: !!healing } });

    // ─── UNIFIED QUANTUM MEASUREMENT ───
    // Single measurement fusing fractal alignment, audit bug-class check, and quantum state.
    // Replaces three formerly-separate post-processing passes with one coherent signal.
    let unifiedResult = null;
    let fractalResonance = null;
    let quantumMeasurement = null;
    let bugClassWarnings = null;
    let bugClassOverride = null;

    if (_unifiedMeasurement && healedCode) {
      try {
        unifiedResult = _unifiedMeasurement(healedCode, {
          language: language || patternData?.language,
          description,
          pattern: {
            id: patternData?.id,
            name: patternData?.name,
            tags: patternData?.tags,
            sector: patternData?.patternType,
            usageCount: decision.pattern?.usageCount || 0,
            successCount: decision.pattern?.successCount || 0,
          },
          quantumState: {
            amplitude: patternData?.amplitude || decision.confidence,
            lastObservedAt: decision.pattern?.lastObservedAt,
            observationCount: decision.pattern?.observationCount || 0,
            phase: decision.pattern?.phase,
            quantum_state: decision.pattern?.quantum_state,
          },
          relevance: decision.confidence || 0.5,
          historicalReliability: decision.pattern?.historicalReliability,
          preset: 'oracle',
        });

        // Extract sub-results for backwards-compatible output
        fractalResonance = unifiedResult.fractal;
        quantumMeasurement = {
          observed: true,
          stateCollapsed: QUANTUM_STATES.COLLAPSED,
          amplitude: unifiedResult.amplitude,
          unifiedAmplitude: unifiedResult.amplitude,
          sector: unifiedResult.quantum?.sector,
          sectorWeight: unifiedResult.quantum?.sectorWeight,
        };
        if (unifiedResult.audit?.warnings?.length > 0) {
          bugClassWarnings = unifiedResult.audit.warnings;
        }
        if (unifiedResult.audit?.override) {
          bugClassOverride = unifiedResult.audit.override;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[resolve] unified measurement failed, falling back:', e?.message || e);
      }
    }

    // Fallback: if unified scorer unavailable, use legacy separate passes
    if (!unifiedResult) {
      // Legacy fractal pass
      if (_computeFractalAlignment && healedCode) {
        try {
          const alignment = _computeFractalAlignment(healedCode);
          const resonant = _selectResonantFractal ? _selectResonantFractal(healedCode, description) : null;
          fractalResonance = {
            alignment: alignment.composite,
            dimensions: alignment.dimensions,
            dominantFractal: alignment.dominantFractal,
            resonantTemplate: resonant ? { fractal: resonant.fractal, resonance: resonant.resonance, reason: resonant.reason } : null,
          };
        } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[resolve] Fractal alignment failed:', e?.message || e);
        }
      }

      // Legacy quantum observation
      if (patternData?.id && this._quantumField && (decision.decision === 'pull' || decision.decision === 'evolve')) {
        try {
          this._quantumField.observe('patterns', [patternData.id]);
          quantumMeasurement = {
            observed: true,
            stateCollapsed: QUANTUM_STATES.COLLAPSED,
            amplitude: patternData.amplitude || decision.confidence,
          };
        } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[resolve] quantum observation failed:', e?.message || e);
        }
      }
    }

    // Collapse quantum state in the field (whether unified or legacy)
    if (patternData?.id && this._quantumField && (decision.decision === 'pull' || decision.decision === 'evolve')) {
      try {
        this._quantumField.observe('patterns', [patternData.id]);
      } catch (_) { /* non-fatal */ }
    }

    // Build resolve result
    let resolveResult = {
      decision: decision.decision, confidence: decision.confidence, reasoning: decision.reasoning,
      pattern: patternData, healedCode, healedVariantId, whisper, candidateNotes,
      healing: healing ? {
        loops: healing.loops, originalCoherence: healing.reflection?.I_AM,
        finalCoherence: healing.reflection?.finalCoherence, improvement: healing.reflection?.improvement,
        healingPath: healing.healingPath,
      } : null,
      fractalResonance,
      alternatives: decision.alternatives, historyMatches: historyResults,
      quantum: quantumMeasurement,
      // Unified measurement sub-scores (when available)
      unifiedMeasurement: unifiedResult ? {
        amplitude: unifiedResult.amplitude,
        coherency: unifiedResult.coherency?.total,
        auditPenalty: unifiedResult.audit?.decoherencePenalty,
        sector: unifiedResult.quantum?.sector,
        sectorWeight: unifiedResult.quantum?.sectorWeight,
      } : null,
    };

    // Auto-capture debug patterns and forward healed code
    try {
      captureResolveDebug(this, resolveResult, request);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[resolve] auto-debug capture failed:', e?.message || e);
    }

    // Bug class check — use unified results if available, else legacy pass
    if (bugClassWarnings) {
      resolveResult.bugClassWarnings = bugClassWarnings;
      if (bugClassOverride) resolveResult.bugClassOverride = bugClassOverride;
    } else {
      try {
        resolveResult = enhanceResolveWithBugClasses(resolveResult, this);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[resolve] bug class check failed:', e?.message || e);
      }
    }

    // Append prompt tag when enabled
    resolveResult = applyPromptTag(resolveResult);

    // Track resolve interaction for session summary
    try { trackResolve(resolveResult, request); } catch (_) { /* non-fatal */ }

    return resolveResult;
  },

  // ── Atomic self-description ───────────────────────────────────────
  _atomicProperties: {
    resolve: {
      charge: 0, valence: 4, mass: 'heavy', spin: 'odd', phase: 'gas',
      reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 6,
      harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
    },
  },
};
