/**
 * Oracle Core — Submit, register, evolve.
 * Write operations that validate and store code in the pattern library.
 */

const { validateCode } = require('../core/validator');
const { autoTag } = require('../core/auto-tagger');
const { _checkSimilarity } = require('./oracle-core-similarity');

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
        name: description ? description.slice(0, 60).replace(/[^a-zA-Z0-9-_ ]/g, '') : `candidate-${Date.now()}`,
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
    return { success: true, accepted: true, entry, validation, similarity: simCheck.similarity };
  },

  /**
   * Registers a new pattern in the pattern library after validation.
   */
  registerPattern(pattern) {
    const validation = validateCode(pattern.code, {
      language: pattern.language, testCode: pattern.testCode, threshold: this.threshold,
      description: pattern.description || pattern.name, tags: pattern.tags,
    });

    if (!validation.valid) {
      return { success: false, registered: false, validation, error: validation.errors.join('; '), reason: validation.errors.join('; ') };
    }

    const enrichedTags = autoTag(pattern.code, {
      description: pattern.description || pattern.name, language: validation.coherencyScore.language,
      tags: pattern.tags, name: pattern.name,
    });

    // Similarity gate
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

    const registered = this.patterns.register({
      ...pattern, tags: enrichedTags, testPassed: validation.testPassed, reliability: 0.5,
    });

    this.store.add({
      code: pattern.code, language: validation.coherencyScore.language,
      description: pattern.description || pattern.name, tags: enrichedTags,
      author: pattern.author || 'oracle-pattern-library',
      coherencyScore: validation.coherencyScore, testPassed: validation.testPassed, testOutput: validation.testOutput,
    });

    this._emit({ type: 'pattern_registered', id: registered.id, name: pattern.name, language: registered.language });
    const growthReport = this._autoGrowFrom(registered);
    return { success: true, registered: true, pattern: registered, validation, growth: growthReport };
  },

  /**
   * Evolves an existing pattern by creating a new version linked to the parent.
   */
  evolvePattern(parentId, newCode, metadata = {}) {
    const evolved = this.patterns.evolve(parentId, newCode, metadata);
    if (!evolved) return { success: false, evolved: false, error: `Pattern ${parentId} not found` };

    this.store.add({
      code: newCode, language: evolved.language, description: evolved.description,
      tags: evolved.tags, author: metadata.author || 'oracle-evolution', coherencyScore: evolved.coherencyScore,
    });
    this._emit({ type: 'pattern_evolved', id: evolved.id, name: evolved.name, parentId });
    return { success: true, evolved: true, pattern: evolved };
  },
};
