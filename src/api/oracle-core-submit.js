/**
 * Oracle Core — Submit, Register, Evolve (Quantum Capture).
 *
 * Submission is CAPTURE — a new pattern enters the quantum field in
 * |superposition⟩ with an initial amplitude derived from its coherency score.
 * Registration establishes entanglement links with related patterns.
 * Evolution creates entangled variants linked to the parent state.
 */

const { validateCode } = require('../core/validator');
const { autoTag } = require('../core/auto-tagger');
const { _checkSimilarity } = require('./oracle-core-similarity');
const { auditLog } = require('../core/audit-logger');

// Quantum capture engine
const {
  coherencyToAmplitude,
  computePhase,
  QUANTUM_STATES,
} = require('../quantum/quantum-core');

module.exports = {
  /**
   * Submits code for validation and storage.
   */
  submit(code, metadata = {}) {
    if (code == null || typeof code !== 'string') {
      return { success: false, accepted: false, stored: false, error: 'Invalid input: code must be a non-null string' };
    }
    if (metadata == null || typeof metadata !== 'object') metadata = {};
    const { language, description = '', tags = [], author = 'anonymous', testCode } = metadata;

    const validation = validateCode(code, {
      language, testCode, threshold: this.threshold, description, tags,
    });

    if (!validation.valid) {
      try {
        const { captureRejection } = require('../evolution/evolution');
        const rejection = captureRejection(code, { language, description, tags }, validation);
        this.recycler.capture(
          { name: rejection.name, code, language: rejection.language, description, tags },
          rejection.failureReason, validation
        );
        this._emit({ type: 'rejection_captured', reason: rejection.failureReason });
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:submit] rejection capture failed:', e.message);
      }
      return { success: false, accepted: false, validation, error: validation.errors.join('; '), reason: validation.errors.join('; ') };
    }

    const enrichedTags = autoTag(code, { description, language: validation.coherencyScore.language, tags, name: '' });

    // Similarity gate
    const existingPatterns = this.patterns.getAll();
    const simCheck = _checkSimilarity(code, existingPatterns, validation.coherencyScore.language);

    if (simCheck.action === 'reject') {
      return {
        success: false, accepted: false, stored: false,
        error: `Near-duplicate rejected (${(simCheck.similarity * 100).toFixed(1)}% similar to "${simCheck.matchedPattern?.name || 'existing pattern'}")`,
        reason: 'similarity_reject', similarity: simCheck.similarity, matchedPattern: simCheck.matchedPattern?.name,
      };
    }

    if (simCheck.action === 'candidate') {
      const candidate = this.patterns.addCandidate({
        name: (description ? description.slice(0, 60).replace(/[^a-zA-Z0-9-_ ]/g, '').trim() : '') || `candidate-${Date.now()}`,
        code, language: validation.coherencyScore.language, description, tags: enrichedTags,
        coherencyScore: validation.coherencyScore, testCode: testCode || null, source: 'similarity-candidate',
      });
      this._emit({ type: 'similarity_candidate', similarity: simCheck.similarity, matchedPattern: simCheck.matchedPattern?.name });
      return {
        success: true, accepted: true, stored: false, candidateStored: true, candidate, validation,
        reason: `Routed to candidates (${(simCheck.similarity * 100).toFixed(1)}% similar to "${simCheck.matchedPattern?.name || 'existing pattern'}")`,
        similarity: simCheck.similarity,
      };
    }

    const entry = this.store.add({
      code, language: validation.coherencyScore.language, description, tags: enrichedTags,
      author, coherencyScore: validation.coherencyScore, testPassed: validation.testPassed, testOutput: validation.testOutput,
    });
    this._emit({ type: 'entry_added', id: entry.id, language: validation.coherencyScore.language, description });
    auditLog('submit', { id: entry.id, actor: author, language: validation.coherencyScore.language, success: true, meta: { description: description.slice(0, 120) } });
    return { success: true, accepted: true, entry, validation, similarity: simCheck.similarity };
  },

  /**
   * Registers a new pattern in the pattern library after validation.
   */
  registerPattern(pattern) {
    if (!pattern?.code || typeof pattern.code !== 'string') {
      return { success: false, registered: false, error: 'pattern.code is required and must be a string' };
    }
    const validation = validateCode(pattern.code, {
      language: pattern.language, testCode: pattern.testCode, threshold: this.threshold,
      description: pattern.description || pattern.name, tags: pattern.tags,
      trustMode: pattern.trustMode || false,
    });

    if (!validation.valid) {
      return { success: false, registered: false, validation, error: validation.errors.join('; '), reason: validation.errors.join('; ') };
    }

    const enrichedTags = autoTag(pattern.code, {
      description: pattern.description || pattern.name, language: validation.coherencyScore.language,
      tags: pattern.tags, name: pattern.name,
    });

    // Similarity gate — skip when promoting candidates (they ARE expected to be
    // similar to existing patterns since they're variants/transpilations)
    if (!pattern.skipSimilarityCheck) {
      const existingPatterns = this.patterns.getAll();
      const simCheck = _checkSimilarity(pattern.code, existingPatterns, validation.coherencyScore.language);

      if (simCheck.action === 'reject') {
        return {
          success: false, registered: false,
          error: `Near-duplicate rejected (${(simCheck.similarity * 100).toFixed(1)}% similar to "${simCheck.matchedPattern?.name || 'existing pattern'}")`,
          reason: 'similarity_reject', similarity: simCheck.similarity, matchedPattern: simCheck.matchedPattern?.name,
        };
      }

      if (simCheck.action === 'candidate') {
        const candidate = this.patterns.addCandidate({
          name: pattern.name || `candidate-${Date.now()}`, code: pattern.code,
          language: validation.coherencyScore.language, description: pattern.description || pattern.name,
          tags: enrichedTags, coherencyScore: validation.coherencyScore, testCode: pattern.testCode || null,
          source: 'similarity-candidate',
        });
        this._emit({ type: 'similarity_candidate', similarity: simCheck.similarity, matchedPattern: simCheck.matchedPattern?.name, name: pattern.name });
        return {
          success: true, registered: false, candidateStored: true, candidate, validation,
          reason: `Routed to candidates (${(simCheck.similarity * 100).toFixed(1)}% similar to "${simCheck.matchedPattern?.name || 'existing pattern'}")`,
          similarity: simCheck.similarity,
        };
      }
    }

    const registered = this.patterns.register({
      ...pattern, tags: enrichedTags, testPassed: validation.testPassed, reliability: 0.5,
    });

    this.store.add({
      code: pattern.code, language: validation.coherencyScore.language,
      description: pattern.description || pattern.name, tags: enrichedTags,
      author: pattern.author || 'oracle-pattern-library',
      coherencyScore: validation.coherencyScore, testPassed: validation.testPassed, testOutput: validation.testOutput,
    });

    // Invalidate search cache so new pattern is immediately findable
    this._searchCache = null;
    this._emit({ type: 'pattern_registered', id: registered.id, name: pattern.name, language: registered.language });

    // Record in temporal memory
    try {
      const tm = this.getTemporalMemory?.();
      if (tm) {
        tm.record(registered.id, 'promoted', {
          context: 'pattern-registered',
          detail: `Registered with coherency ${validation.coherencyScore?.total?.toFixed(3) || 'N/A'}`,
        });
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-submit:init] temporal memory not available:', e?.message || e);
    }

    // ─── Quantum Capture ───
    // Initialize quantum state for the new pattern and establish entanglement
    let quantumCapture = null;
    if (this._quantumField) {
      try {
        const amplitude = coherencyToAmplitude(validation.coherencyScore?.total || 0, {
          usageCount: 0, successCount: 0,
        });
        // Set quantum state on the newly registered pattern
        this._quantumField.db.prepare(
          'UPDATE patterns SET amplitude = ?, phase = ?, quantum_state = ? WHERE id = ?'
        ).run(amplitude, computePhase(registered.id), QUANTUM_STATES.SUPERPOSITION, registered.id);

        quantumCapture = {
          amplitude,
          quantumState: QUANTUM_STATES.SUPERPOSITION,
          entangled: false,
        };

        // Auto-entangle with similar existing patterns (same language + overlapping tags)
        try {
          const existingPatterns = this.patterns.getAll({ language: registered.language });
          const regTags = new Set(registered.tags || []);
          for (const ep of existingPatterns) {
            if (ep.id === registered.id) continue;
            const epTags = new Set(ep.tags || []);
            const overlap = [...regTags].filter(t => epTags.has(t)).length;
            if (overlap >= 2) {
              this._quantumField.entangle('patterns', registered.id, ep.id);
              quantumCapture.entangled = true;
            }
          }
        } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[register] auto-entangle failed:', e?.message || e);
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[register] quantum capture failed:', e?.message || e);
      }
    }

    const growthReport = this._autoGrowFrom(registered);
    auditLog('register', { id: registered.id, name: pattern.name, actor: pattern.author || 'oracle-pattern-library', language: registered.language, success: true });
    return { success: true, registered: true, pattern: registered, validation, growth: growthReport, quantum: quantumCapture };
  },

  /**
   * Evolves an existing pattern by creating a new version linked to the parent.
   */
  evolvePattern(parentId, newCode, metadata = {}) {
    if (newCode == null || typeof newCode !== 'string' || newCode.trim().length === 0) {
      return { success: false, evolved: false, error: 'Invalid input: newCode must be a non-empty string' };
    }
    const evolved = this.patterns.evolve(parentId, newCode, metadata);
    if (!evolved) return { success: false, evolved: false, error: `Pattern ${parentId} not found` };

    this.store.add({
      code: newCode, language: evolved.language, description: evolved.description,
      tags: evolved.tags, author: metadata.author || 'oracle-evolution', coherencyScore: evolved.coherencyScore,
    });
    this._emit({ type: 'pattern_evolved', id: evolved.id, name: evolved.name, parentId });
    auditLog('evolve', { id: evolved.id, name: evolved.name, actor: metadata.author || 'oracle-evolution', language: evolved.language, success: true, meta: { parentId } });
    return { success: true, evolved: true, pattern: evolved };
  },
};
