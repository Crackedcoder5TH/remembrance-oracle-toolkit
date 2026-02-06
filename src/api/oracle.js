/**
 * The Oracle API — the main interface for AIs and humans.
 *
 * This is how any AI (or developer) interacts with the remembrance system:
 *
 * 1. oracle.submit(code, metadata)  — Submit code for validation & storage
 * 2. oracle.query(query)            — Pull the most relevant, highest-coherency code
 * 3. oracle.feedback(id, succeeded) — Report whether pulled code worked
 * 4. oracle.inspect(id)             — View full details of a stored entry
 * 5. oracle.stats()                 — Get store summary
 */

const { validateCode } = require('../core/validator');
const { computeCoherencyScore } = require('../core/coherency');
const { rankEntries } = require('../core/relevance');
const { VerifiedHistoryStore } = require('../store/history');
const { PatternLibrary } = require('../patterns/library');

class RemembranceOracle {
  constructor(options = {}) {
    this.store = options.store || new VerifiedHistoryStore(options.baseDir);
    const storeDir = this.store.storeDir || require('path').join(options.baseDir || process.cwd(), '.remembrance');
    this.patterns = options.patterns || new PatternLibrary(storeDir);
    this.threshold = options.threshold || 0.6;
  }

  /**
   * Submit code for validation and storage.
   * Code must PROVE itself to be stored.
   *
   * Returns: { accepted, entry?, validation }
   */
  submit(code, metadata = {}) {
    const {
      language,
      description = '',
      tags = [],
      author = 'anonymous',
      testCode,
    } = metadata;

    // Validate — code must prove itself
    const validation = validateCode(code, {
      language,
      testCode,
      threshold: this.threshold,
    });

    if (!validation.valid) {
      return {
        accepted: false,
        validation,
        reason: validation.errors.join('; '),
      };
    }

    // Store the verified code
    const entry = this.store.add({
      code,
      language: validation.coherencyScore.language,
      description,
      tags,
      author,
      coherencyScore: validation.coherencyScore,
      testPassed: validation.testPassed,
      testOutput: validation.testOutput,
    });

    return {
      accepted: true,
      entry,
      validation,
    };
  }

  /**
   * Query for relevant code.
   * Returns only proven code, ranked by relevance + coherency.
   *
   * Query shape: { description, tags, language, limit, minCoherency }
   */
  query(query = {}) {
    const {
      description = '',
      tags = [],
      language,
      limit = 5,
      minCoherency = 0.5,
    } = query;

    const allEntries = this.store.getAll();

    const ranked = rankEntries(
      { description, tags, language },
      allEntries,
      { limit, minCoherency }
    );

    // Return clean results — code + metadata, no internal junk
    return ranked.map(entry => ({
      id: entry.id,
      code: entry.code,
      language: entry.language,
      description: entry.description,
      tags: entry.tags,
      coherencyScore: entry.coherencyScore?.total,
      relevanceScore: entry._relevance?.relevance,
      reliability: entry.reliability?.historicalScore,
      author: entry.author,
    }));
  }

  /**
   * Report feedback — did the pulled code actually work?
   * This updates historical reliability scores.
   */
  feedback(id, succeeded) {
    const updated = this.store.recordUsage(id, succeeded);
    if (!updated) {
      return { success: false, error: `Entry ${id} not found` };
    }
    return {
      success: true,
      newReliability: updated.reliability.historicalScore,
    };
  }

  /**
   * Inspect a specific entry in full detail.
   */
  inspect(id) {
    return this.store.get(id);
  }

  /**
   * Get overall store statistics.
   */
  stats() {
    return this.store.summary();
  }

  /**
   * Prune low-quality entries from the store.
   */
  prune(minCoherency = 0.4) {
    return this.store.prune(minCoherency);
  }

  // ─── Pattern Library Methods ───

  /**
   * Smart code retrieval — coherency-driven pull vs generate.
   *
   * 1. Checks pattern library for a match
   * 2. If PULL: returns the pattern directly
   * 3. If EVOLVE: returns the pattern + signals it needs improvement
   * 4. If GENERATE: signals that new code is needed
   *
   * Also checks the verified history store and merges results.
   */
  resolve(request = {}) {
    const {
      description = '',
      tags = [],
      language,
      minCoherency,
    } = request;

    // Ask the pattern library decision engine
    const decision = this.patterns.decide({ description, tags, language, minCoherency });

    // Also query the verified history for supplemental results
    const historyResults = this.query({ description, tags, language, limit: 3, minCoherency: 0.5 });

    return {
      decision: decision.decision,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      pattern: decision.pattern ? {
        id: decision.pattern.id,
        name: decision.pattern.name,
        code: decision.pattern.code,
        language: decision.pattern.language,
        patternType: decision.pattern.patternType,
        complexity: decision.pattern.complexity,
        coherencyScore: decision.pattern.coherencyScore?.total,
        tags: decision.pattern.tags,
      } : null,
      alternatives: decision.alternatives,
      historyMatches: historyResults,
    };
  }

  /**
   * Register a pattern in the library (must pass validation first).
   */
  registerPattern(pattern) {
    // Validate the code first
    const validation = validateCode(pattern.code, {
      language: pattern.language,
      testCode: pattern.testCode,
      threshold: this.threshold,
    });

    if (!validation.valid) {
      return {
        registered: false,
        validation,
        reason: validation.errors.join('; '),
      };
    }

    // Register in both the pattern library AND verified history
    const registered = this.patterns.register({
      ...pattern,
      testPassed: validation.testPassed,
      reliability: 0.5,
    });

    // Also store in verified history for query compatibility
    this.store.add({
      code: pattern.code,
      language: validation.coherencyScore.language,
      description: pattern.description || pattern.name,
      tags: [...(pattern.tags || []), pattern.patternType || 'pattern'].filter(Boolean),
      author: pattern.author || 'oracle-pattern-library',
      coherencyScore: validation.coherencyScore,
      testPassed: validation.testPassed,
      testOutput: validation.testOutput,
    });

    return {
      registered: true,
      pattern: registered,
      validation,
    };
  }

  /**
   * Evolve an existing pattern into a better version.
   */
  evolvePattern(parentId, newCode, metadata = {}) {
    const evolved = this.patterns.evolve(parentId, newCode, metadata);
    if (!evolved) return { evolved: false, error: `Pattern ${parentId} not found` };

    // Also store evolution in verified history
    this.store.add({
      code: newCode,
      language: evolved.language,
      description: evolved.description,
      tags: evolved.tags,
      author: metadata.author || 'oracle-evolution',
      coherencyScore: evolved.coherencyScore,
    });

    return { evolved: true, pattern: evolved };
  }

  /**
   * Report pattern usage feedback.
   */
  patternFeedback(id, succeeded) {
    const updated = this.patterns.recordUsage(id, succeeded);
    if (!updated) return { success: false, error: `Pattern ${id} not found` };
    return { success: true, usageCount: updated.usageCount, successCount: updated.successCount };
  }

  /**
   * Get pattern library stats.
   */
  patternStats() {
    return this.patterns.summary();
  }

  /**
   * Retire low-performing patterns.
   */
  retirePatterns(minScore) {
    return this.patterns.retire(minScore);
  }
}

module.exports = { RemembranceOracle };
