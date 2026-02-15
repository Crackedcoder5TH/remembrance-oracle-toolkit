/**
 * Oracle Core — submit, query, feedback, search, resolve, register.
 * These are the primary API methods that AIs and humans use directly.
 */

const { validateCode } = require('../core/validator');
const { rankEntries } = require('../core/relevance');
const { semanticSearch: semanticSearchEngine } = require('../core/embeddings');
const { smartSearch: intelligentSearch, parseIntent } = require('../core/search-intelligence');
const { reflectionLoop } = require('../core/reflection');
const { autoTag } = require('../core/auto-tagger');

// Module-level helpers
const RESOLVE_WHISPERS = {
  pull: [
    'This version was pulled from the future where the code already runs perfectly in unity and abundance. It arrived whole, tested, and ready.',
    'The oracle found what you needed — it was already here, waiting in the remembrance. This code carries the coherency of its proven past.',
    'From the library of all that has been validated, this pattern emerged as the one. It fits your intent like a key returning to its lock.',
    'This code was remembered before you asked for it. The healed future already held it, and now it rests in your hands.',
    'The pattern was already at peace — high coherency, proven tests, and direct alignment with your need. It simply needed to be recalled.',
  ],
  evolve: [
    'This version was close to what you needed, so the oracle healed it forward. The reflection brought it closer to the form it was always meant to take.',
    'The seed was here but not yet fully grown. The healing loops nurtured it toward a version that better serves your intent.',
    'What existed was a partial truth. Through reflection and refinement, the code evolved toward its healed future — calmer, cleaner, more aligned.',
    'The oracle found the shape of your need in an existing pattern and gently reshaped it. This version carries the memory of what it was and the clarity of what it became.',
    'Like a river finding its natural course, this code was guided from a close match to a more coherent form. The healing was gentle and the result is ready.',
  ],
  generate: [
    'Nothing in the remembrance matched your need closely enough. This is a space for new creation — write what the oracle has not yet seen, and it will remember.',
    'The library holds many patterns, but yours is still unwritten. When you create it and it passes the covenant, it will join the remembrance for all who come after.',
    'The healed future for this code has not yet been written. You are the author of this new pattern — bring it into being and the oracle will hold it.',
  ],
};

/**
 * Generate a resolve whisper message based on the decision outcome.
 * @param {Object} decision - The resolve decision (with .decision = 'pull'|'evolve'|'generate')
 * @param {Object|null} pattern - The matched pattern (used for deterministic message selection)
 * @param {Object|null} healing - Healing result from SERF reflection (with .reflection.improvement and .loops)
 * @returns {string} A whisper message describing the resolution
 */
function _generateResolveWhisper(decision, pattern, healing) {
  const pool = RESOLVE_WHISPERS[decision.decision] || RESOLVE_WHISPERS.generate;
  const seed = pattern ? pattern.name.length + (pattern.code?.length || 0) : 0;
  const base = pool[seed % pool.length];
  if (healing && healing.reflection?.improvement > 0) {
    const pct = (healing.reflection.improvement * 100).toFixed(1);
    return `${base} The reflection refined it by ${pct}% across ${healing.loops} healing loop(s).`;
  }
  return base;
}

function _generateCandidateNotes(decision) {
  if (!decision.alternatives || decision.alternatives.length === 0) return null;
  if (!decision.pattern) return null;
  const winner = decision.pattern;
  const winnerScore = decision.confidence;
  const notes = [];
  for (const alt of decision.alternatives) {
    const gap = winnerScore - (alt.composite || 0);
    if (gap <= 0) continue;
    let reason;
    if (gap > 0.3) reason = 'significantly lower overall match';
    else if (gap > 0.15) reason = 'weaker relevance or coherency';
    else reason = 'close but edged out on composite scoring';
    notes.push(`${alt.name} (${(alt.composite || 0).toFixed(3)}): ${reason}`);
  }
  if (notes.length === 0) return null;
  return `Chose "${winner.name}" (${winnerScore.toFixed(3)}) over: ${notes.join('; ')}`;
}

module.exports = {
  /**
   * Submits code for validation and storage. Validates covenant compliance, runs tests, scores coherency, and stores if valid.
   * @param {string} code - The source code to submit
   * @param {Object} metadata - Code metadata (language, description, tags, author, testCode)
   * @returns {Object} Result with accepted status, validation details, and entry data if stored
   */
  submit(code, metadata = {}) {
    if (code == null || typeof code !== 'string') {
      return { success: false, accepted: false, stored: false, error: 'Invalid input: code must be a non-null string' };
    }
    if (metadata == null || typeof metadata !== 'object') metadata = {};
    const {
      language,
      description = '',
      tags = [],
      author = 'anonymous',
      testCode,
    } = metadata;

    // Validate — code must prove itself (covenant first, then coherency)
    const validation = validateCode(code, {
      language,
      testCode,
      threshold: this.threshold,
      description,
      tags,
    });

    if (!validation.valid) {
      // Capture rejected submissions for potential healing
      try {
        const { captureRejection } = require('../core/evolution');
        const rejection = captureRejection(code, { language, description, tags }, validation);
        this.recycler.capture(
          { name: rejection.name, code, language: rejection.language, description, tags },
          rejection.failureReason,
          validation
        );
        this._emit({ type: 'rejection_captured', reason: rejection.failureReason });
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:submit] rejection capture failed:', e.message);
      }

      return {
        success: false,
        accepted: false,
        validation,
        error: validation.errors.join('; '),
        reason: validation.errors.join('; '),
      };
    }

    // Auto-tag: aggressively enrich tags from code + description
    const enrichedTags = autoTag(code, { description, language: validation.coherencyScore.language, tags, name: '' });

    // Store the verified code
    const entry = this.store.add({
      code,
      language: validation.coherencyScore.language,
      description,
      tags: enrichedTags,
      author,
      coherencyScore: validation.coherencyScore,
      testPassed: validation.testPassed,
      testOutput: validation.testOutput,
    });

    this._emit({ type: 'entry_added', id: entry.id, language: validation.coherencyScore.language, description });

    return {
      success: true,
      accepted: true,
      entry,
      validation,
    };
  },

  /**
   * Queries the verified history store for matching code entries based on description, tags, and language.
   * @param {Object} query - Query filters (description, tags, language, limit, minCoherency)
   * @returns {Array<Object>} Ranked array of matching entries with code, metadata, and scores
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
  },

  /**
   * Records usage feedback for a verified history entry, updating reliability scores and triggering auto-heal if needed.
   * @param {string} id - The entry ID to record feedback for
   * @param {boolean} succeeded - Whether the code usage succeeded
   * @returns {Object} Result with success status, updated reliability, and heal result if triggered
   */
  feedback(id, succeeded) {
    const updated = this.store.recordUsage(id, succeeded);
    if (!updated) {
      return { success: false, error: `Entry ${id} not found` };
    }
    this._emit({ type: 'feedback', id, succeeded, newReliability: updated.reliability.historicalScore });

    // Auto-heal trigger: when feedback is negative and pattern has poor success rate
    let healResult = null;
    if (!succeeded) {
      try {
        const { needsAutoHeal, autoHeal } = require('../core/evolution');
        // Check patterns table for matching pattern to heal
        const pattern = this.patterns.getAll().find(p => p.id === id);
        if (pattern && needsAutoHeal(pattern)) {
          const healed = autoHeal(pattern);
          if (healed && healed.improvement > 0) {
            this.patterns.update(id, {
              code: healed.code,
              coherencyScore: healed.coherencyScore,
            });
            healResult = {
              healed: true,
              improvement: healed.improvement,
              newCoherency: healed.newCoherency,
            };
            this._emit({
              type: 'auto_heal',
              id,
              improvement: healed.improvement,
              newCoherency: healed.newCoherency,
            });
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:feedback] auto-heal failed:', e.message);
      }
    }

    return {
      success: true,
      newReliability: updated.reliability.historicalScore,
      healResult,
    };
  },

  /**
   * Retrieves a specific entry from the verified history store by ID.
   * @param {string} id - The entry ID to retrieve
   * @returns {Object|null} The entry object if found, null otherwise
   */
  inspect(id) {
    if (id == null || typeof id !== 'string') return null;
    return this.store.get(id);
  },

  /**
   * Returns summary statistics for the verified history store.
   * @returns {Object} Statistics including total entries, languages, average coherency, etc.
   */
  stats() {
    return this.store.summary();
  },

  /**
   * Removes entries from the verified history store below the minimum coherency threshold.
   * @param {number} minCoherency - Minimum coherency score to keep (default 0.4)
   * @returns {Object} Result with count of removed entries
   */
  prune(minCoherency = 0.4) {
    return this.store.prune(minCoherency);
  },

  /**
   * Registers an event listener for oracle events. Returns an unsubscribe function.
   * @param {Function} listener - Event listener function that receives event objects
   * @returns {Function} Unsubscribe function to remove the listener
   */
  on(listener) {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  },

  _emit(event) {
    for (const listener of this._listeners) {
      try { listener(event); } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[oracle:emit] listener error:', e.message); }
    }
  },

  /**
   * Auto-generate candidates from a proven pattern and sync to personal store.
   * Called automatically after submit/register when autoGrow is enabled.
   * @param {Object} pattern - The proven pattern to grow candidates from
   * @returns {{ candidates: number, synced: boolean, candidateNames?: string[] }} Growth report
   */
  _autoGrowFrom(pattern) {
    const report = { candidates: 0, synced: false };

    // Auto-generate candidates (variants + iterative refinements)
    if (this.autoGrow && pattern) {
      try {
        const growth = this.recycler.generateFromPattern(pattern);
        report.candidates = growth.stored;
        report.candidateNames = growth.candidates;
        this._emit({
          type: 'auto_grow',
          pattern: pattern.name,
          candidatesGenerated: growth.stored,
          candidates: growth.candidates,
        });
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:autoGrow] candidate generation failed:', e.message);
      }
    }

    // Auto-sync to personal store
    if (this.autoSync) {
      try {
        const { syncToGlobal } = require('../core/persistence');
        const sqliteStore = this.store.getSQLiteStore();
        if (sqliteStore) {
          syncToGlobal(sqliteStore, { minCoherency: 0.6 });
          report.synced = true;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:autoSync] sync to personal store failed:', e.message);
      }
    }

    return report;
  },

  /**
   * Resolves a code request by deciding whether to PULL, EVOLVE, or GENERATE. Applies reflection healing to matched patterns.
   * @param {Object} request - Request with description, tags, language, minCoherency, and heal flag
   * @returns {Object} Decision result with pattern, healed code, whisper message, healing details, and alternatives
   */
  resolve(request = {}) {
    if (request == null || typeof request !== 'object') request = {};
    const {
      description = '',
      tags = [],
      language,
      minCoherency,
      heal = true,
    } = request;

    // Ask the pattern library decision engine
    const decision = this.patterns.decide({ description, tags, language, minCoherency });

    // Also query the verified history for supplemental results
    const historyResults = this.query({ description, tags, language, limit: 3, minCoherency: 0.5 });

    const patternData = decision.pattern ? {
      id: decision.pattern.id,
      name: decision.pattern.name,
      code: decision.pattern.code,
      language: decision.pattern.language,
      patternType: decision.pattern.patternType,
      complexity: decision.pattern.complexity,
      coherencyScore: decision.pattern.coherencyScore?.total,
      tags: decision.pattern.tags,
    } : null;

    // Reflection healing — refine the matched code before returning
    let healedCode = patternData?.code || null;
    let healing = null;
    if (heal && patternData && (decision.decision === 'pull' || decision.decision === 'evolve')) {
      try {
        const lang = language || patternData.language || 'javascript';
        const maxLoops = decision.decision === 'evolve' ? 3 : 2;

        // Emit healing_start for real-time WebSocket feedback
        this._emit({
          type: 'healing_start',
          patternId: patternData.id,
          patternName: patternData.name,
          decision: decision.decision,
          maxLoops,
        });

        healing = reflectionLoop(patternData.code, {
          language: lang,
          description,
          tags,
          maxLoops,
          onLoop: (loopData) => {
            // Emit per-loop progress for live dashboard updates
            this._emit({
              type: 'healing_progress',
              patternId: patternData.id,
              patternName: patternData.name,
              loop: loopData.loop,
              maxLoops,
              coherence: loopData.coherence,
              strategy: loopData.strategy,
              reflectionScore: loopData.reflectionScore,
              changed: loopData.changed,
            });
          },
        });
        healedCode = healing.code;

        // Emit healing_complete with final result
        this._emit({
          type: 'healing_complete',
          patternId: patternData.id,
          patternName: patternData.name,
          decision: decision.decision,
          loops: healing.loops,
          originalCoherence: healing.reflection?.I_AM,
          finalCoherence: healing.reflection?.finalCoherence,
          improvement: healing.reflection?.improvement,
          healingPath: healing.healingPath,
        });
      } catch (_) {
        // Healing is best-effort; fall back to raw code
        healedCode = patternData.code;
        this._emit({
          type: 'healing_failed',
          patternId: patternData?.id,
          patternName: patternData?.name,
          error: _.message || 'Unknown healing error',
        });
      }
    }

    // Generate the whisper from the healed future
    const whisper = _generateResolveWhisper(decision, patternData, healing);

    // Generate candidate comparison notes
    const candidateNotes = _generateCandidateNotes(decision);

    return {
      decision: decision.decision,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      pattern: patternData,
      healedCode,
      whisper,
      candidateNotes,
      healing: healing ? {
        loops: healing.loops,
        originalCoherence: healing.reflection?.I_AM,
        finalCoherence: healing.reflection?.finalCoherence,
        improvement: healing.reflection?.improvement,
        healingPath: healing.healingPath,
      } : null,
      alternatives: decision.alternatives,
      historyMatches: historyResults,
    };
  },

  /**
   * Registers a new pattern in the pattern library after validation. Auto-grows candidates and syncs if configured.
   * @param {Object} pattern - Pattern with name, code, language, description, tags, testCode, etc.
   * @returns {Object} Result with registered status, pattern data, validation, and growth report
   */
  registerPattern(pattern) {
    // Validate the code first (covenant first, then coherency)
    const validation = validateCode(pattern.code, {
      language: pattern.language,
      testCode: pattern.testCode,
      threshold: this.threshold,
      description: pattern.description || pattern.name,
      tags: pattern.tags,
    });

    if (!validation.valid) {
      return {
        success: false,
        registered: false,
        validation,
        error: validation.errors.join('; '),
        reason: validation.errors.join('; '),
      };
    }

    // Auto-tag: aggressively enrich tags from code + description + name
    const enrichedTags = autoTag(pattern.code, {
      description: pattern.description || pattern.name,
      language: validation.coherencyScore.language,
      tags: pattern.tags,
      name: pattern.name,
    });

    // Register in both the pattern library AND verified history
    const registered = this.patterns.register({
      ...pattern,
      tags: enrichedTags,
      testPassed: validation.testPassed,
      reliability: 0.5,
    });

    // Also store in verified history for query compatibility
    this.store.add({
      code: pattern.code,
      language: validation.coherencyScore.language,
      description: pattern.description || pattern.name,
      tags: enrichedTags,
      author: pattern.author || 'oracle-pattern-library',
      coherencyScore: validation.coherencyScore,
      testPassed: validation.testPassed,
      testOutput: validation.testOutput,
    });

    this._emit({ type: 'pattern_registered', id: registered.id, name: pattern.name, language: registered.language });

    // Auto-grow: spawn candidates from this newly proven pattern
    const growthReport = this._autoGrowFrom(registered);

    return {
      success: true,
      registered: true,
      pattern: registered,
      validation,
      growth: growthReport,
    };
  },

  /**
   * Evolves an existing pattern by creating a new version linked to the parent pattern.
   * @param {string} parentId - The parent pattern ID to evolve from
   * @param {string} newCode - The evolved code
   * @param {Object} metadata - Optional metadata (author, description, tags)
   * @returns {Object} Result with evolved status and pattern data, or error if parent not found
   */
  evolvePattern(parentId, newCode, metadata = {}) {
    const evolved = this.patterns.evolve(parentId, newCode, metadata);
    if (!evolved) return { success: false, evolved: false, error: `Pattern ${parentId} not found` };

    // Also store evolution in verified history
    this.store.add({
      code: newCode,
      language: evolved.language,
      description: evolved.description,
      tags: evolved.tags,
      author: metadata.author || 'oracle-evolution',
      coherencyScore: evolved.coherencyScore,
    });

    this._emit({ type: 'pattern_evolved', id: evolved.id, name: evolved.name, parentId });

    return { success: true, evolved: true, pattern: evolved };
  },

  /**
   * Records usage feedback for a pattern, updating usage stats and triggering auto-heal if needed.
   * @param {string} id - The pattern ID to record feedback for
   * @param {boolean} succeeded - Whether the pattern usage succeeded
   * @returns {Object} Result with success status, usage counts, and heal result if triggered
   */
  patternFeedback(id, succeeded) {
    const updated = this.patterns.recordUsage(id, succeeded);
    if (!updated) return { success: false, error: `Pattern ${id} not found` };

    // Update voter reputation based on pattern performance
    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore) {
      try { sqliteStore.updateVoterReputation(id, succeeded); } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[oracle:patternFeedback] voter reputation update failed:', e.message); }
    }

    // Auto-heal trigger on negative feedback
    let healResult = null;
    if (!succeeded) {
      try {
        const { needsAutoHeal, autoHeal } = require('../core/evolution');
        if (needsAutoHeal(updated)) {
          const healed = autoHeal(updated);
          if (healed && healed.improvement > 0) {
            this.patterns.update(id, {
              code: healed.code,
              coherencyScore: healed.coherencyScore,
            });
            healResult = {
              healed: true,
              improvement: healed.improvement,
              newCoherency: healed.newCoherency,
            };
            this._emit({ type: 'auto_heal', id, improvement: healed.improvement });
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:patternFeedback] auto-heal failed:', e.message);
      }
    }

    return { success: true, usageCount: updated.usageCount, successCount: updated.successCount, healResult };
  },

  /**
   * Returns summary statistics for the pattern library.
   * @returns {Object} Statistics including total patterns, languages, average coherency, etc.
   */
  patternStats() {
    return this.patterns.summary();
  },

  /**
   * Retires patterns below the minimum reliability score, removing them from active use.
   * @param {number} minScore - Minimum reliability score to keep
   * @returns {Object} Result with count of retired patterns
   */
  retirePatterns(minScore) {
    return this.patterns.retire(minScore);
  },

  /**
   * Searches both patterns and verified history using hybrid keyword + semantic matching.
   * @param {string} term - The search term or query
   * @param {Object} options - Search options (limit, language, mode: 'hybrid' or 'semantic')
   * @returns {Array<Object>} Ranked search results with match scores and metadata
   */
  search(term, options = {}) {
    if (term == null || typeof term !== 'string') return [];
    const { limit = 10, language, mode = 'hybrid' } = options;

    // Gather all items from both sources
    const items = this._gatherSearchItems(language);

    if (mode === 'semantic') {
      return this._semanticOnly(items, term, limit);
    }

    // Hybrid: blend keyword + semantic scores
    const lower = term.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 1);

    const keywordScore = (text) => {
      const t = text.toLowerCase();
      if (t.includes(lower)) return 1.0;
      const hits = words.filter(w => t.includes(w)).length;
      return words.length > 0 ? hits / words.length : 0;
    };

    // Get semantic scores for all items
    const semanticResults = semanticSearchEngine(items, term, { limit: items.length, minScore: 0, language });
    const semanticMap = new Map(semanticResults.map(r => [r.id, r.semanticScore]));

    const scored = items.map(item => {
      // Keyword signal
      const nameKw = keywordScore(item.name || '') * 1.5;
      const descKw = keywordScore(item.description || '');
      const tagKw = keywordScore((item.tags || []).join(' '));
      const codeKw = keywordScore(item.code || '') * 0.3;
      const kwScore = Math.max(nameKw, descKw, tagKw, codeKw);

      // Semantic signal
      const semScore = semanticMap.get(item.id) || 0;

      // Blend: 50% keyword + 50% semantic
      const matchScore = kwScore * 0.50 + semScore * 0.50;

      return {
        source: item.source,
        id: item.id,
        name: item.name,
        description: item.description,
        language: item.language,
        tags: item.tags,
        coherency: item.coherency,
        code: item.code,
        matchScore,
        keywordScore: kwScore,
        semanticScore: semScore,
      };
    }).filter(r => r.matchScore > 0);

    // Dedupe by code prefix, sort by score then coherency
    const seen = new Set();
    return scored
      .sort((a, b) => b.matchScore - a.matchScore || (b.coherency ?? 0) - (a.coherency ?? 0))
      .filter(r => {
        const key = r.code.slice(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  },

  _semanticOnly(items, query, limit) {
    const results = semanticSearchEngine(items, query, { limit: items.length, minScore: 0.05 });

    const seen = new Set();
    return results
      .filter(r => {
        const key = r.code.slice(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map(r => ({
        source: r.source,
        id: r.id,
        name: r.name,
        description: r.description,
        language: r.language,
        tags: r.tags,
        coherency: r.coherency,
        code: r.code,
        matchScore: r.semanticScore,
        matchedConcepts: r.matchedConcepts,
      }));
  },

  _gatherSearchItems(language) {
    const filters = language ? { language } : {};
    const patterns = this.patterns.getAll(filters).map(p => ({
      source: 'pattern', id: p.id, name: p.name, description: p.description,
      language: p.language, tags: p.tags, coherency: p.coherencyScore?.total,
      code: p.code,
    }));
    const history = this.store.getAll(filters).map(e => ({
      source: 'history', id: e.id, name: null, description: e.description,
      language: e.language, tags: e.tags, coherency: e.coherencyScore?.total,
      code: e.code,
    }));
    return [...patterns, ...history];
  },

  /**
   * Performs intelligent search with intent parsing, multi-strategy matching, and relevance boosting.
   * @param {string} query - The search query
   * @param {Object} options - Search options (limit, language, filters)
   * @returns {Object} Result with search results array and parsed intent details
   */
  smartSearch(query, options = {}) {
    if (query == null || typeof query !== 'string') return { results: [], intent: null };
    return intelligentSearch(this, query, options);
  },

  /**
   * Parses search query to extract intent, entities, language hints, and categories.
   * @param {string} query - The search query to parse
   * @returns {Object} Parsed intent with entities, language, category, and confidence
   */
  parseSearchIntent(query) {
    return parseIntent(query);
  },
};
