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

class RemembranceOracle {
  constructor(options = {}) {
    this.store = options.store || new VerifiedHistoryStore(options.baseDir);
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
}

module.exports = { RemembranceOracle };
