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
const { semanticSearch: semanticSearchEngine } = require('../core/embeddings');
const { VerifiedHistoryStore } = require('../store/history');
const { PatternLibrary } = require('../patterns/library');
const { PatternRecycler } = require('../core/recycler');
const { DebugOracle } = require('../core/debug-oracle');
const { smartSearch: intelligentSearch, parseIntent } = require('../core/search-intelligence');
const { ClaudeBridge } = require('../core/claude-bridge');
const { reflectionLoop } = require('../core/reflection');

class RemembranceOracle {
  constructor(options = {}) {
    this.store = options.store || new VerifiedHistoryStore(options.baseDir);
    const storeDir = this.store.storeDir || require('path').join(options.baseDir || process.cwd(), '.remembrance');
    this.patterns = options.patterns || new PatternLibrary(storeDir);
    this.threshold = options.threshold || 0.6;
    this._listeners = [];
    this.autoGrow = options.autoGrow !== false;  // Auto-generate candidates on proven code
    this.autoSync = options.autoSync || false;    // Auto-sync to personal store on proven code
    this.recycler = new PatternRecycler(this, {
      maxHealAttempts: options.maxHealAttempts || 3,
      maxSerfLoops: options.maxSerfLoops || 5,
      generateVariants: options.generateVariants !== false,
      variantLanguages: options.variantLanguages || ['python', 'typescript'],
      verbose: options.verbose || false,
    });

    // Wire healing success rate into pattern library's reliability scoring
    this._healingStats = new Map();
    this.patterns.setHealingRateProvider((id) => this.getHealingSuccessRate(id));

    // Debug Oracle — exponential debugging intelligence
    this._debugOracle = null; // Lazy-initialized on first debug call

    // Claude Bridge — native LLM engine (lazy-initialized)
    this._claude = options.claude || null;
    this._claudeOptions = {
      timeout: options.claudeTimeout || 60000,
      model: options.claudeModel || null,
      verbose: options.verbose || false,
    };

    // Auto-seed on first run if library is empty
    if (options.autoSeed !== false && this.patterns.getAll().length === 0) {
      try {
        const { seedLibrary } = require('../patterns/seeds');
        seedLibrary(this);
      } catch {
        // Seeding is best-effort — don't fail construction
      }
    }
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

    // Validate — code must prove itself (covenant first, then coherency)
    const validation = validateCode(code, {
      language,
      testCode,
      threshold: this.threshold,
      description,
      tags,
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

    this._emit({ type: 'entry_added', id: entry.id, language: validation.coherencyScore.language, description });

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
    this._emit({ type: 'feedback', id, succeeded, newReliability: updated.reliability.historicalScore });

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

  /**
   * Subscribe to Oracle events (submit, register, evolve, feedback).
   * Returns an unsubscribe function.
   */
  on(listener) {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  }

  _emit(event) {
    for (const listener of this._listeners) {
      try { listener(event); } catch { /* listener errors don't break oracle */ }
    }
  }

  /**
   * Auto-grow: spawn candidates from a newly proven pattern.
   * Called automatically after registerPattern() and submit() succeed.
   *
   * Generates language variants + SERF refinements as unproven candidates.
   * Also syncs the new pattern to the personal store if autoSync is enabled.
   */
  _autoGrowFrom(pattern) {
    const report = { candidates: 0, synced: false };

    // Auto-generate candidates (variants + SERF refinements)
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
      } catch {
        // Auto-grow is best-effort — don't break the registration
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
      } catch {
        // Auto-sync is best-effort
      }
    }

    return report;
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

    // SERF healing — refine the matched code before returning
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
              serfScore: loopData.serfScore,
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
          originalCoherence: healing.serf?.I_AM,
          finalCoherence: healing.serf?.finalCoherence,
          improvement: healing.serf?.improvement,
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
        originalCoherence: healing.serf?.I_AM,
        finalCoherence: healing.serf?.finalCoherence,
        improvement: healing.serf?.improvement,
        healingPath: healing.healingPath,
      } : null,
      alternatives: decision.alternatives,
      historyMatches: historyResults,
    };
  }

  /**
   * Register a pattern in the library (must pass validation first).
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

    this._emit({ type: 'pattern_registered', id: registered.id, name: pattern.name, language: registered.language });

    // Auto-grow: spawn candidates from this newly proven pattern
    const growthReport = this._autoGrowFrom(registered);

    return {
      registered: true,
      pattern: registered,
      validation,
      growth: growthReport,
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

    this._emit({ type: 'pattern_evolved', id: evolved.id, name: evolved.name, parentId });

    return { evolved: true, pattern: evolved };
  }

  /**
   * Report pattern usage feedback.
   */
  patternFeedback(id, succeeded) {
    const updated = this.patterns.recordUsage(id, succeeded);
    if (!updated) return { success: false, error: `Pattern ${id} not found` };

    // Update voter reputation based on pattern performance
    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore) {
      try { sqliteStore.updateVoterReputation(id, succeeded); } catch {}
    }

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

  /**
   * Deep clean the pattern library: remove duplicates, trivial stubs,
   * and low-substance harvested patterns.
   * @param {object} options
   * @param {number} options.minCodeLength - Minimum code length to keep (default 35)
   * @param {number} options.minNameLength - Minimum name length to keep (default 3)
   * @param {boolean} options.removeDuplicates - Remove exact duplicate code (default true)
   * @param {boolean} options.removeStubs - Remove trivial stubs like function f() { return 1; } (default true)
   * @param {boolean} options.dryRun - Preview changes without deleting (default false)
   * @returns {{ removed: number, duplicates: number, stubs: number, tooShort: number, remaining: number, details: Array }}
   */
  deepClean(options = {}) {
    const {
      minCodeLength = 35,
      minNameLength = 3,
      removeDuplicates = true,
      removeStubs = true,
      dryRun = false,
    } = options;

    const all = this.patterns.getAll();
    const toRemove = new Map(); // id → reason

    // 1. Find exact duplicates (keep highest coherency version)
    if (removeDuplicates) {
      const byCode = new Map();
      for (const p of all) {
        const key = (p.code || '').trim();
        if (!key) continue;
        if (!byCode.has(key)) {
          byCode.set(key, []);
        }
        byCode.get(key).push(p);
      }
      for (const [, group] of byCode) {
        if (group.length <= 1) continue;
        // Sort by coherency desc, keep first
        group.sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0));
        for (let i = 1; i < group.length; i++) {
          toRemove.set(group[i].id, 'duplicate');
        }
      }
    }

    // 2. Find trivial stubs (empty functions, test helpers, one-expression returns under 50 chars)
    if (removeStubs) {
      for (const p of all) {
        if (toRemove.has(p.id)) continue;
        const code = (p.code || '').trim();
        if (!code) continue;

        // Empty function bodies: function f() {} or function f() { /* comment */ }
        if (/^(?:function|const)\s+\w+[^{]*\{\s*(?:\/[/*][^}]*)?\}$/.test(code)) {
          toRemove.set(p.id, 'stub');
          continue;
        }

        // Only flag short code (<50 chars) as stubs
        if (code.length < 50) {
          // One-liner returns: function f() { return 1; } or function add(a,b) { return a + b; }
          const isOneLiner = /^(?:function|const)\s+\w+[^{]*\{[^{}]*\}$/.test(code);
          // Test helper names
          const isTestHelper = /^(?:function|const)\s+(?:def-?[Tt]est|hover-?[Tt]est|safeCode|broken|only|hidden|dry|dup|evTest|mcpTest|jsFunc|realFunction|testFunc)\b/.test(code);
          if (isOneLiner || isTestHelper) {
            toRemove.set(p.id, 'stub');
          }
        }
      }
    }

    // 3. Find too-short code from harvested patterns
    for (const p of all) {
      if (toRemove.has(p.id)) continue;
      const code = (p.code || '').trim();
      const name = (p.name || '');
      const tags = p.tags || [];
      const isHarvested = tags.includes('harvested');

      if (isHarvested && code.length < minCodeLength && name.length < minNameLength) {
        toRemove.set(p.id, 'too-short');
      }
    }

    // Execute deletions
    let duplicates = 0, stubs = 0, tooShort = 0;
    const details = [];
    for (const [id, reason] of toRemove) {
      const p = all.find(x => x.id === id);
      details.push({ id, name: p?.name, reason, code: (p?.code || '').slice(0, 60) });
      if (reason === 'duplicate') duplicates++;
      else if (reason === 'stub') stubs++;
      else tooShort++;

      if (!dryRun) {
        try {
          const db = this.patterns._sqlite?.db || this.store?.db;
          if (db) {
            db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
          }
        } catch { /* skip if store type doesn't support direct delete */ }
      }
    }

    const remaining = all.length - toRemove.size;
    this._emit({ type: 'deep_clean', removed: toRemove.size, duplicates, stubs, tooShort, remaining, dryRun });
    return { removed: toRemove.size, duplicates, stubs, tooShort, remaining, details };
  }

  /**
   * Recycle failed patterns — heal via SERF and re-validate.
   * Call this after a batch of registerPattern() calls to recover failures.
   */
  recycle(options = {}) {
    return this.recycler.recycleFailed(options);
  }

  /**
   * Run the full exponential growth pipeline on a set of seeds.
   *
   * 1. Registers each seed through the oracle
   * 2. Captures failures
   * 3. Heals failures via SERF reflection
   * 4. Generates language variants from successes
   * 5. Generates approach alternatives from successes
   * 6. Recurses to the specified depth
   *
   * @param {Array} seeds - Array of pattern objects
   * @param {object} options - { depth, maxVariantsPerPattern, verbose }
   * @returns {object} Full report with waves, counts, and totals
   */
  processSeeds(seeds, options = {}) {
    return this.recycler.processSeeds(seeds, options);
  }

  // ─── Candidate Methods — coherent-but-unproven patterns ───

  /**
   * Generate candidate patterns from all proven patterns.
   * Proven patterns → coherency loop → language variants → candidates store.
   * This is how the library always grows.
   *
   * @param {object} options - { maxPatterns, languages, minCoherency, methods }
   * @returns {object} Generation report
   */
  generateCandidates(options = {}) {
    return this.recycler.generateCandidates(options);
  }

  /**
   * Get all unpromoted candidates, optionally filtered.
   */
  candidates(filters = {}) {
    return this.patterns.getCandidates(filters);
  }

  /**
   * Get candidate summary statistics.
   */
  candidateStats() {
    return this.patterns.candidateSummary();
  }

  /**
   * Promote a candidate to proven by providing test proof.
   * The candidate runs through the full oracle pipeline with testCode.
   */
  promote(candidateId, testCode) {
    return this.recycler.promoteWithProof(candidateId, testCode);
  }

  /**
   * Auto-promote all candidates that already have test code.
   */
  autoPromote() {
    return this.recycler.autoPromote();
  }

  /**
   * Smart auto-promote: promotes candidates that meet ALL of:
   *   1. Coherency >= minCoherency (default 0.9)
   *   2. Passes covenant check
   *   3. Passes sandbox test execution
   *   4. Parent pattern reliability >= minConfidence (default 0.8)
   *
   * Returns report with promoted/skipped/vetoed candidates.
   * Use manualOverride: true to skip confidence check.
   */
  smartAutoPromote(options = {}) {
    const {
      minCoherency = 0.9,
      minConfidence = 0.8,
      manualOverride = false,
      dryRun = false,
    } = options;

    const { covenantCheck } = require('../core/covenant');
    const { sandboxExecute } = require('../core/sandbox');

    const candidates = this.patterns.getCandidates();
    const provenPatterns = this.patterns.getAll();
    const report = { promoted: 0, skipped: 0, vetoed: 0, total: candidates.length, details: [] };

    for (const candidate of candidates) {
      // Step 1: Coherency gate
      const coherency = candidate.coherencyScore?.total ?? 0;
      if (coherency < minCoherency) {
        report.skipped++;
        report.details.push({ name: candidate.name, status: 'skipped', reason: `coherency ${coherency.toFixed(3)} < ${minCoherency}` });
        continue;
      }

      // Step 2: Confidence gate (parent pattern reliability)
      if (!manualOverride && candidate.parentPattern) {
        const parent = provenPatterns.find(p => p.id === candidate.parentPattern || p.name === candidate.parentPattern);
        if (parent) {
          const parentReliability = parent.usageCount > 0 ? parent.successCount / parent.usageCount : 0.5;
          if (parentReliability < minConfidence) {
            report.skipped++;
            report.details.push({ name: candidate.name, status: 'skipped', reason: `parent reliability ${parentReliability.toFixed(3)} < ${minConfidence}` });
            continue;
          }
        }
      }

      // Step 3: Covenant check
      const covenant = covenantCheck(candidate.code);
      if (!covenant.passed) {
        report.vetoed++;
        report.details.push({ name: candidate.name, status: 'vetoed', reason: `covenant: ${covenant.violations?.[0]?.principle || 'failed'}` });
        continue;
      }

      // Step 4: Sandbox test execution (if test code available)
      if (candidate.testCode) {
        try {
          const testResult = sandboxExecute(candidate.code, candidate.testCode, { language: candidate.language });
          if (!testResult.passed) {
            report.vetoed++;
            report.details.push({ name: candidate.name, status: 'vetoed', reason: 'test execution failed' });
            continue;
          }
        } catch (_) {
          report.vetoed++;
          report.details.push({ name: candidate.name, status: 'vetoed', reason: 'sandbox error' });
          continue;
        }
      }

      if (dryRun) {
        report.promoted++;
        report.details.push({ name: candidate.name, status: 'would-promote', coherency: coherency.toFixed(3) });
        continue;
      }

      // Step 5: Register as proven pattern
      const result = this.registerPattern({
        name: candidate.name,
        code: candidate.code,
        language: candidate.language,
        description: candidate.description || candidate.name,
        tags: candidate.tags || [],
        testCode: candidate.testCode,
        author: candidate.author || 'smart-auto-promote',
      });

      if (result.registered) {
        this.patterns.promoteCandidate(candidate.id);
        report.promoted++;
        report.details.push({ name: candidate.name, status: 'promoted', coherency: coherency.toFixed(3) });
      } else {
        report.vetoed++;
        report.details.push({ name: candidate.name, status: 'vetoed', reason: result.reason || 'registration failed' });
      }
    }

    // Emit event for real-time dashboard updates
    this._emit({
      type: 'auto_promote',
      promoted: report.promoted,
      skipped: report.skipped,
      vetoed: report.vetoed,
      total: report.total,
    });

    return report;
  }

  /**
   * Synthesize tests for candidates and optionally auto-promote.
   * This is the test synthesis pipeline:
   *   1. Analyze each candidate's code + parent tests
   *   2. Generate test assertions for the target language
   *   3. Update candidate test code
   *   4. Optionally auto-promote with synthesized tests
   *
   * @param {object} options - { maxCandidates?, dryRun?, autoPromote? }
   */

  // ─── Error Recovery & Rollback ───

  /**
   * Rollback a pattern to a previous version.
   * Uses the versioning system to restore code from history.
   *
   * @param {string} patternId - Pattern ID to rollback
   * @param {number} [targetVersion] - Version to restore (default: previous)
   * @returns {{ success, patternId, restoredVersion, previousCode, restoredCode }}
   */
  rollback(patternId, targetVersion) {
    const { VersionManager } = require('../core/versioning');
    const vm = new VersionManager(this.patterns._sqlite);

    const history = vm.getHistory(patternId);
    if (!history || history.length === 0) {
      return { success: false, reason: 'No version history found for this pattern' };
    }

    // If no target version specified, go to the previous one
    const latest = history[0].version;
    const target = targetVersion || (latest > 1 ? latest - 1 : latest);

    const snapshot = vm.getVersion(patternId, target);
    if (!snapshot) {
      return { success: false, reason: `Version ${target} not found` };
    }

    // Get the current pattern
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) {
      return { success: false, reason: 'Pattern not found' };
    }

    const previousCode = pattern.code;

    // Update the pattern's code to the restored version
    if (this.patterns._sqlite) {
      this.patterns._sqlite.updatePattern(patternId, { code: snapshot.code });
    }

    // Save a new version snapshot marking this as a rollback
    vm.saveSnapshot(patternId, snapshot.code, { action: 'rollback', restoredFrom: target });

    this._emit({
      type: 'rollback',
      patternId,
      patternName: pattern.name,
      restoredVersion: target,
      previousVersion: latest,
    });

    return {
      success: true,
      patternId,
      patternName: pattern.name,
      restoredVersion: target,
      previousVersion: latest,
      previousCode,
      restoredCode: snapshot.code,
    };
  }

  /**
   * Test a pattern's current code against its stored test code.
   * If it fails, auto-rollback to the last passing version.
   *
   * @param {string} patternId - Pattern ID to verify
   * @returns {{ passed, patternId, rolledBack?, restoredVersion? }}
   */
  verifyOrRollback(patternId) {
    const { sandboxExecute } = require('../core/sandbox');

    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { passed: false, reason: 'Pattern not found' };
    if (!pattern.testCode) return { passed: true, reason: 'No test code — skipped' };

    try {
      const result = sandboxExecute(pattern.code, pattern.testCode, { language: pattern.language });
      if (result.passed) {
        // Track healing success
        this._trackHealingSuccess(patternId, true);
        return { passed: true, patternId, patternName: pattern.name };
      }
    } catch (_) {
      // Test failed — fall through to rollback
    }

    // Test failed — rollback to previous version
    this._trackHealingSuccess(patternId, false);
    const rollbackResult = this.rollback(patternId);
    return {
      passed: false,
      patternId,
      patternName: pattern.name,
      rolledBack: rollbackResult.success,
      restoredVersion: rollbackResult.restoredVersion,
    };
  }

  /**
   * Track healing success rate per pattern.
   * Low performers get deprioritized in future healing.
   */
  _trackHealingSuccess(patternId, succeeded) {
    if (!this._healingStats) this._healingStats = new Map();
    const stats = this._healingStats.get(patternId) || { attempts: 0, successes: 0 };
    stats.attempts++;
    if (succeeded) stats.successes++;
    this._healingStats.set(patternId, stats);
  }

  /**
   * Get healing success rate for a pattern.
   * Returns 0-1 (successes / attempts). Defaults to 1.0 if no data.
   */
  getHealingSuccessRate(patternId) {
    if (!this._healingStats) return 1.0;
    const stats = this._healingStats.get(patternId);
    if (!stats || stats.attempts === 0) return 1.0;
    return stats.successes / stats.attempts;
  }

  /**
   * Get all healing stats across all patterns.
   */
  healingStats() {
    if (!this._healingStats) return { patterns: 0, totalAttempts: 0, totalSuccesses: 0, details: [] };
    const details = [];
    let totalAttempts = 0, totalSuccesses = 0;
    for (const [id, stats] of this._healingStats) {
      const pattern = this.patterns.getAll().find(p => p.id === id);
      details.push({
        id,
        name: pattern?.name || 'unknown',
        attempts: stats.attempts,
        successes: stats.successes,
        rate: stats.attempts > 0 ? (stats.successes / stats.attempts).toFixed(3) : 'N/A',
      });
      totalAttempts += stats.attempts;
      totalSuccesses += stats.successes;
    }
    return {
      patterns: this._healingStats.size,
      totalAttempts,
      totalSuccesses,
      overallRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts).toFixed(3) : 'N/A',
      details,
    };
  }

  // ─── Deep Security Scan ───

  /**
   * Run a deep security scan on a pattern or raw code.
   * Combines covenant + language-specific checks + optional external tools.
   *
   * @param {string|object} codeOrPatternId - Code string or pattern ID
   * @param {object} options - { language?, runExternalTools? }
   */
  securityScan(codeOrPatternId, options = {}) {
    const { deepSecurityScan } = require('../core/covenant');

    let code, language, patternName;
    if (typeof codeOrPatternId === 'string' && codeOrPatternId.length < 32) {
      // Might be a pattern ID
      const pattern = this.patterns.getAll().find(p => p.id === codeOrPatternId || p.name === codeOrPatternId);
      if (pattern) {
        code = pattern.code;
        language = options.language || pattern.language;
        patternName = pattern.name;
      } else {
        code = codeOrPatternId;
        language = options.language || 'javascript';
      }
    } else {
      code = codeOrPatternId;
      language = options.language || 'javascript';
    }

    const result = deepSecurityScan(code, { language, runExternalTools: options.runExternalTools });

    if (result.veto && patternName) {
      this._emit({
        type: 'security_veto',
        patternName,
        tool: result.externalTools.length > 0 ? result.externalTools[0].tool : 'covenant',
        findings: result.totalFindings,
        whisper: result.whisper,
      });
    }

    return { ...result, patternName };
  }

  /**
   * Scan all patterns in the library for security issues.
   * Returns a security audit report.
   */
  securityAudit(options = {}) {
    const { deepSecurityScan } = require('../core/covenant');
    const patterns = this.patterns.getAll();
    const report = { scanned: 0, clean: 0, advisory: 0, vetoed: 0, details: [] };

    for (const p of patterns) {
      const result = deepSecurityScan(p.code, { language: p.language, runExternalTools: options.runExternalTools });
      report.scanned++;
      if (result.veto) {
        report.vetoed++;
        report.details.push({ id: p.id, name: p.name, status: 'vetoed', findings: result.totalFindings, whisper: result.whisper });
      } else if (result.deepFindings.length > 0) {
        report.advisory++;
        report.details.push({ id: p.id, name: p.name, status: 'advisory', findings: result.deepFindings.length });
      } else {
        report.clean++;
      }
    }

    return report;
  }

  // ─── Community Voting ───

  /**
   * Vote on a pattern (upvote or downvote).
   * Adjusts the pattern's reliability score based on community feedback.
   *
   * @param {string} patternId - Pattern ID
   * @param {string} voter - Voter identifier
   * @param {number} vote - 1 for upvote, -1 for downvote
   */
  vote(patternId, voter, vote) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return { success: false, error: 'No SQLite store available' };
    const result = sqliteStore.votePattern(patternId, voter, vote);
    if (result.success) {
      this._emit({ type: 'vote', patternId, voter, vote, voteScore: result.voteScore });
    }
    return result;
  }

  /**
   * Get vote counts for a pattern.
   */
  getVotes(patternId) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return null;
    return sqliteStore.getVotes(patternId);
  }

  /**
   * Get top-voted patterns.
   */
  topVoted(limit = 20) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return [];
    return sqliteStore.topVoted(limit);
  }

  /**
   * Get a voter's reputation profile.
   */
  getVoterReputation(voterId) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return null;
    const voter = sqliteStore.getVoter(voterId);
    const history = sqliteStore.getVoterHistory(voterId, 10);
    return {
      ...voter,
      weight: sqliteStore.getVoteWeight(voterId),
      recentVotes: history,
    };
  }

  /**
   * Get top contributors by reputation.
   */
  topVoters(limit = 20) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return [];
    return sqliteStore.topVoters(limit);
  }

  /**
   * GitHub identity management.
   */
  getGitHubIdentity() {
    if (!this._githubIdentity) {
      const { GitHubIdentity } = require('../auth/github-oauth');
      const sqliteStore = this.patterns._sqlite;
      this._githubIdentity = new GitHubIdentity({ store: sqliteStore });
    }
    return this._githubIdentity;
  }

  async verifyGitHubToken(token) {
    return this.getGitHubIdentity().verifyToken(token);
  }

  async startGitHubLogin() {
    return this.getGitHubIdentity().startDeviceFlow();
  }

  async pollGitHubLogin(deviceCode) {
    return this.getGitHubIdentity().pollDeviceFlow(deviceCode);
  }

  getVerifiedIdentity(voterId) {
    return this.getGitHubIdentity().getIdentity(voterId);
  }

  listVerifiedIdentities(limit = 50) {
    return this.getGitHubIdentity().listIdentities(limit);
  }

  isVerifiedVoter(voterId) {
    return this.getGitHubIdentity().isVerified(voterId);
  }

  synthesizeTests(options = {}) {
    const { synthesizeForCandidates } = require('../core/test-synth');
    const synthReport = synthesizeForCandidates(this, options);

    // If autoPromote requested, try promoting candidates with new tests
    let promoteReport = null;
    if (options.autoPromote !== false) {
      promoteReport = this.autoPromote();
    }

    return { synthesis: synthReport, promotion: promoteReport };
  }

  // ─── AI Context Injection ───

  /**
   * Generate an exportable AI system prompt fragment.
   * Gives any AI full context about available verified patterns,
   * categories, capabilities, and how to use the oracle.
   *
   * @param {object} options - { format: 'markdown'|'json'|'text', maxPatterns, includeCode }
   * @returns {{ prompt: string, format: string, stats: object }}
   */
  generateContext(options = {}) {
    const { format = 'markdown', maxPatterns = 50, includeCode = false } = options;
    const storeStats = this.stats();
    const patternStats = this.patternStats();
    const patterns = this.patterns.getAll();

    // Categorize patterns by language and type
    const byLanguage = {};
    const byType = {};
    const topPatterns = [];

    for (const p of patterns) {
      const lang = p.language || 'unknown';
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
      const type = p.patternType || 'utility';
      byType[type] = (byType[type] || 0) + 1;
    }

    // Get top patterns by coherency
    const sorted = [...patterns].sort((a, b) => {
      const aScore = a.coherencyScore?.total ?? 0;
      const bScore = b.coherencyScore?.total ?? 0;
      return bScore - aScore;
    });

    for (let i = 0; i < Math.min(maxPatterns, sorted.length); i++) {
      const p = sorted[i];
      const entry = {
        name: p.name,
        language: p.language,
        type: p.patternType || 'utility',
        coherency: (p.coherencyScore?.total ?? 0).toFixed(3),
        tags: p.tags || [],
        description: p.description || '',
      };
      if (includeCode) entry.code = p.code;
      topPatterns.push(entry);
    }

    const stats = {
      totalPatterns: patterns.length,
      byLanguage,
      byType,
      storeEntries: storeStats.total || storeStats.totalEntries || 0,
    };

    if (format === 'json') {
      return {
        prompt: JSON.stringify({ oracle: { stats, patterns: topPatterns, instructions: this._contextInstructions() } }, null, 2),
        format: 'json',
        stats,
      };
    }

    if (format === 'text') {
      const lines = [
        `REMEMBRANCE ORACLE — ${patterns.length} verified patterns`,
        '',
        `Languages: ${Object.entries(byLanguage).map(([k, v]) => `${k}(${v})`).join(', ')}`,
        `Types: ${Object.entries(byType).map(([k, v]) => `${k}(${v})`).join(', ')}`,
        '',
        'TOP PATTERNS:',
        ...topPatterns.map(p => `  ${p.name} [${p.language}] coherency:${p.coherency} — ${p.description || p.tags.join(', ')}`),
        '',
        ...this._contextInstructions().split('\n'),
      ];
      return { prompt: lines.join('\n'), format: 'text', stats };
    }

    // Default: markdown
    const md = [
      `# Remembrance Oracle — Verified Code Memory`,
      '',
      `This project has **${patterns.length} verified, proven code patterns** available.`,
      '',
      `## Available Languages`,
      ...Object.entries(byLanguage).map(([k, v]) => `- **${k}**: ${v} patterns`),
      '',
      `## Pattern Types`,
      ...Object.entries(byType).map(([k, v]) => `- **${k}**: ${v} patterns`),
      '',
      `## Top Patterns (by coherency)`,
      '',
      '| Name | Language | Coherency | Tags |',
      '|------|----------|-----------|------|',
      ...topPatterns.slice(0, 30).map(p => `| ${p.name} | ${p.language} | ${p.coherency} | ${p.tags.slice(0, 3).join(', ')} |`),
      '',
      `## How to Use`,
      '',
      this._contextInstructions(),
    ];

    return { prompt: md.join('\n'), format: 'markdown', stats };
  }

  /**
   * Export context as a CLAUDE.md-compatible fragment.
   */
  exportContext(options = {}) {
    const ctx = this.generateContext(options);
    return ctx.prompt;
  }

  _contextInstructions() {
    return [
      'Before writing any new function:',
      '1. Search the oracle: `node src/cli.js search "<description>" --limit 3`',
      '2. Resolve: `node src/cli.js resolve --description "<description>" --language <lang>`',
      '3. If PULL: use the proven code as-is',
      '4. If EVOLVE: adapt the matched code',
      '5. If GENERATE: write new code',
      '',
      'After code passes tests:',
      '1. Register: `node src/cli.js register --file <code.js> --test <test.js> --name <name>`',
      '2. Feedback: `node src/cli.js feedback --id <id> --success`',
      '',
      'Available tools (MCP): oracle_search, oracle_resolve, oracle_submit, oracle_feedback,',
      'oracle_transpile, oracle_verify_transpile, oracle_vote, oracle_reputation,',
      'oracle_remote_search, oracle_full_search, and more.',
    ].join('\n');
  }

  // ─── Cross-Project Persistence ───

  /**
   * Sync local patterns to personal store (~/.remembrance/personal/).
   * Proven patterns accumulate across all projects, privately.
   */
  syncToGlobal(options = {}) {
    const { syncToGlobal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { synced: 0, error: 'No SQLite store available' };
    return syncToGlobal(sqliteStore, options);
  }

  /**
   * Pull patterns from personal store into this project.
   */
  syncFromGlobal(options = {}) {
    const { syncFromGlobal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return syncFromGlobal(sqliteStore, options);
  }

  /**
   * Bidirectional sync with personal store.
   */
  sync(options = {}) {
    const { syncBidirectional } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { error: 'No SQLite store available' };
    return syncBidirectional(sqliteStore, options);
  }

  /**
   * Share patterns to the community store.
   * Explicit action — only shares test-backed patterns above 0.7 coherency.
   */
  share(options = {}) {
    const { shareToCommunity } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { shared: 0, error: 'No SQLite store available' };
    return shareToCommunity(sqliteStore, options);
  }

  /**
   * Pull patterns from the community store into this project.
   */
  pullCommunity(options = {}) {
    const { pullFromCommunity } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return pullFromCommunity(sqliteStore, options);
  }

  /**
   * Search across local + personal + community stores.
   * Returns merged results, deduplicated, sorted by coherency.
   */
  federatedSearch(query = {}) {
    const { federatedQuery } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { error: 'No SQLite store available' };
    return federatedQuery(sqliteStore, query);
  }

  /**
   * Get combined global store statistics (personal + community).
   */
  globalStats() {
    const { globalStats } = require('../core/persistence');
    return globalStats();
  }

  /**
   * Get personal store statistics only.
   */
  personalStats() {
    const { personalStats } = require('../core/persistence');
    return personalStats();
  }

  /**
   * Get community store statistics only.
   */
  communityStats() {
    const { communityStats } = require('../core/persistence');
    return communityStats();
  }

  // ─── Cross-Repo Search ───

  // ─── Remote Federation ───

  /**
   * Register a remote oracle server for federated search.
   */
  registerRemote(url, options = {}) {
    const { registerRemote } = require('../cloud/client');
    return registerRemote(url, options);
  }

  /**
   * Remove a remote oracle server.
   */
  removeRemote(urlOrName) {
    const { removeRemote } = require('../cloud/client');
    return removeRemote(urlOrName);
  }

  /**
   * List registered remote oracle servers.
   */
  listRemotes() {
    const { listRemotes } = require('../cloud/client');
    return listRemotes();
  }

  /**
   * Search patterns across all registered remote oracle servers.
   * Queries each remote in parallel, merges and deduplicates.
   */
  async remoteSearch(query, options = {}) {
    const { federatedRemoteSearch } = require('../cloud/client');
    return federatedRemoteSearch(query, options);
  }

  /**
   * Health check all remote oracle servers.
   */
  async checkRemoteHealth() {
    const { checkRemoteHealth } = require('../cloud/client');
    return checkRemoteHealth();
  }

  /**
   * Full federated search: local + personal + community + repos + remotes.
   * The ultimate query that searches everywhere.
   */
  async fullFederatedSearch(query, options = {}) {
    const results = { local: [], remote: [], repos: [], errors: [] };

    // Local federated (local + personal + community)
    try {
      const fed = this.federatedSearch({ description: query, language: options.language });
      results.local = fed.patterns || [];
    } catch { /* local search error */ }

    // Cross-repo search (sibling directories)
    try {
      const repos = this.crossRepoSearch(query, { language: options.language, limit: options.limit || 20 });
      results.repos = repos.results || [];
    } catch { /* repo search error */ }

    // Remote oracle search (HTTP federation)
    try {
      const remote = await this.remoteSearch(query, { language: options.language, limit: options.limit || 20 });
      results.remote = remote.results || [];
      results.errors = remote.errors || [];
    } catch (err) {
      results.errors.push({ remote: 'all', error: err.message });
    }

    // Merge and deduplicate
    const seen = new Set();
    const merged = [];
    for (const list of [results.local, results.repos, results.remote]) {
      for (const p of list) {
        const key = `${p.name}:${p.language}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(p);
      }
    }

    return {
      results: merged.slice(0, options.limit || 50),
      localCount: results.local.length,
      repoCount: results.repos.length,
      remoteCount: results.remote.length,
      errors: results.errors,
    };
  }

  /**
   * Discover oracle stores in sibling repositories.
   */
  discoverRepos(options = {}) {
    const { discoverRepoStores } = require('../core/persistence');
    return discoverRepoStores(options);
  }

  /**
   * Register a repo path for federated search.
   */
  registerRepo(repoPath) {
    const { registerRepo } = require('../core/persistence');
    return registerRepo(repoPath);
  }

  /**
   * List configured repos.
   */
  listRepos() {
    const { listRepos } = require('../core/persistence');
    return listRepos();
  }

  /**
   * Search patterns across multiple repo oracle stores.
   */
  crossRepoSearch(description, options = {}) {
    const { crossRepoSearch } = require('../core/persistence');
    return crossRepoSearch(description, options);
  }

  /**
   * Diff two entries or patterns side by side.
   * Returns a unified-style diff showing what changed.
   */
  diff(idA, idB) {
    const a = this.patterns.getAll().find(p => p.id === idA) || this.store.get(idA);
    const b = this.patterns.getAll().find(p => p.id === idB) || this.store.get(idB);
    if (!a) return { error: `Entry ${idA} not found` };
    if (!b) return { error: `Entry ${idB} not found` };

    const linesA = a.code.split('\n');
    const linesB = b.code.split('\n');
    const diffLines = [];

    // Simple LCS-based diff
    const lcs = buildLCS(linesA, linesB);
    let i = 0, j = 0, k = 0;
    while (k < lcs.length) {
      while (i < linesA.length && linesA[i] !== lcs[k]) {
        diffLines.push({ type: 'removed', line: linesA[i] });
        i++;
      }
      while (j < linesB.length && linesB[j] !== lcs[k]) {
        diffLines.push({ type: 'added', line: linesB[j] });
        j++;
      }
      diffLines.push({ type: 'same', line: lcs[k] });
      i++; j++; k++;
    }
    while (i < linesA.length) { diffLines.push({ type: 'removed', line: linesA[i++] }); }
    while (j < linesB.length) { diffLines.push({ type: 'added', line: linesB[j++] }); }

    const nameA = a.name || a.description || idA;
    const nameB = b.name || b.description || idB;
    const coherencyA = a.coherencyScore?.total ?? '?';
    const coherencyB = b.coherencyScore?.total ?? '?';

    return {
      a: { id: idA, name: nameA, language: a.language, coherency: coherencyA },
      b: { id: idB, name: nameB, language: b.language, coherency: coherencyB },
      diff: diffLines,
      stats: {
        added: diffLines.filter(d => d.type === 'added').length,
        removed: diffLines.filter(d => d.type === 'removed').length,
        same: diffLines.filter(d => d.type === 'same').length,
      },
    };
  }

  /**
   * Export top patterns as a standalone portable file.
   * Output is a self-contained JSON or markdown file any AI can read
   * without the toolkit installed.
   */
  export(options = {}) {
    const {
      format = 'json',
      limit = 20,
      minCoherency = 0.5,
      language,
      tags,
    } = options;

    let patterns = this.patterns.getAll({ language, minCoherency });
    if (tags && tags.length > 0) {
      const filterTags = new Set(tags.map(t => t.toLowerCase()));
      patterns = patterns.filter(p => p.tags.some(t => filterTags.has(t.toLowerCase())));
    }

    // Sort by coherency descending, take top N
    patterns = patterns
      .sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0))
      .slice(0, limit);

    if (format === 'markdown' || format === 'md') {
      return this._exportMarkdown(patterns);
    }
    return this._exportJSON(patterns);
  }

  _exportJSON(patterns) {
    return JSON.stringify({
      exported: new Date().toISOString(),
      count: patterns.length,
      patterns: patterns.map(p => ({
        name: p.name,
        code: p.code,
        language: p.language,
        description: p.description,
        tags: p.tags,
        patternType: p.patternType,
        complexity: p.complexity,
        coherency: p.coherencyScore?.total,
      })),
    }, null, 2);
  }

  _exportMarkdown(patterns) {
    const lines = [
      '# Remembrance Oracle — Exported Patterns',
      '',
      `Exported: ${new Date().toISOString()} | ${patterns.length} patterns`,
      '',
    ];
    for (const p of patterns) {
      lines.push(`## ${p.name} (${p.coherencyScore?.total ?? '?'})`);
      lines.push(`**${p.language}** | ${p.patternType} | ${p.complexity} | ${(p.tags || []).join(', ')}`);
      lines.push(`> ${p.description}`);
      lines.push('```' + (p.language || '') + '\n' + p.code + '\n```');
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Import patterns from an exported JSON string or object.
   * Counterpart to export() — enables team sharing of pattern libraries.
   *
   * @param {string|object} data — JSON string or parsed object from export()
   * @param {object} options — { skipValidation, dryRun, author }
   * @returns {{ imported: number, skipped: number, errors: string[], results: Array }}
   */
  import(data, options = {}) {
    const { skipValidation = false, dryRun = false, author = 'oracle-import' } = options;
    const { safeJsonParse } = require('../core/covenant');
    const parsed = typeof data === 'string' ? safeJsonParse(data, {}) : data;
    const patterns = parsed.patterns || [];

    const results = [];
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const p of patterns) {
      if (!p.code || !p.name) {
        errors.push(`Skipped pattern without code or name: ${p.name || '(unnamed)'}`);
        skipped++;
        continue;
      }

      // Check for duplicate by name
      const existing = this.patterns.getAll().find(
        ep => ep.name === p.name && ep.language === p.language
      );
      if (existing) {
        results.push({ name: p.name, status: 'duplicate', id: existing.id });
        skipped++;
        continue;
      }

      if (dryRun) {
        results.push({ name: p.name, status: 'would_import', language: p.language });
        imported++;
        continue;
      }

      const regResult = this.registerPattern({
        name: p.name,
        code: p.code,
        language: p.language || 'javascript',
        description: p.description || p.name,
        tags: [...(p.tags || []), 'imported'],
        patternType: p.patternType || 'utility',
        complexity: p.complexity || 'moderate',
        author,
        testCode: p.testCode,
      });

      if (regResult.registered) {
        results.push({ name: p.name, status: 'imported', id: regResult.pattern.id });
        imported++;
      } else {
        results.push({ name: p.name, status: 'rejected', reason: regResult.reason });
        errors.push(`${p.name}: ${regResult.reason}`);
        skipped++;
      }
    }

    this._emit({ type: 'import_complete', imported, skipped });

    return { imported, skipped, errors, results };
  }

  /**
   * Hybrid search across patterns + history.
   * Combines keyword matching with semantic concept expansion.
   *
   * "function that prevents calling too often" → matches throttle/debounce
   * even without keyword overlap, because the concept cluster activates.
   */
  search(term, options = {}) {
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
  }

  /**
   * Pure semantic search — concept-driven, no keyword matching.
   * Best for natural language queries like "I need something that
   * prevents a function from being called too frequently".
   */
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
  }

  /**
   * Gather search-ready items from both patterns and history.
   */
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
  }

  // ─── Smart Search — Intent-Aware Intelligence ───

  /**
   * Intelligent search with intent parsing, query rewriting,
   * contextual ranking, and cross-language expansion.
   *
   * @param {string} query - Raw search query (can include typos, abbreviations)
   * @param {object} options - { language, limit, mode }
   * @returns {object} { results, intent, rewrittenQuery, corrections, suggestions, totalMatches }
   */
  smartSearch(query, options = {}) {
    return intelligentSearch(this, query, options);
  }

  /**
   * Parse a query into structured intent without searching.
   * Useful for UI previews and debugging.
   */
  parseSearchIntent(query) {
    return parseIntent(query);
  }

  // ─── Debug Oracle — Exponential Debugging Intelligence ───

  /**
   * Get or create the DebugOracle instance (lazy-initialized).
   */
  _getDebugOracle() {
    if (!this._debugOracle) {
      const sqliteStore = this.store.getSQLiteStore();
      if (!sqliteStore) return null;
      this._debugOracle = new DebugOracle(sqliteStore, {
        verbose: this.recycler?.verbose || false,
        variantLanguages: this.recycler?.variantLanguages || ['python', 'typescript'],
      });
    }
    return this._debugOracle;
  }

  /**
   * Capture an error→fix pair as a debug pattern.
   * Automatically generates language variants and error variants.
   *
   * @param {object} params
   *   - errorMessage: The error message
   *   - stackTrace: Optional stack trace
   *   - fixCode: The code that fixes the error
   *   - fixDescription: Human description of the fix
   *   - language: Programming language
   *   - tags: Array of tags
   * @returns {object} { captured, pattern, variants }
   */
  debugCapture(params) {
    const debug = this._getDebugOracle();
    if (!debug) return { captured: false, error: 'No SQLite store available' };
    const result = debug.capture(params);
    if (result.captured) {
      this._emit({ type: 'debug_capture', id: result.pattern?.id, errorClass: result.pattern?.errorClass });
    }
    return result;
  }

  /**
   * Search for debug patterns matching an error.
   * Searches local store, personal store, and community store.
   *
   * @param {object} params
   *   - errorMessage: The error to find fixes for
   *   - stackTrace: Optional stack trace
   *   - language: Preferred language
   *   - limit: Max results (default 5)
   *   - federated: Search all tiers (default true)
   * @returns {Array} Matching debug patterns, ranked by confidence
   */
  debugSearch(params) {
    const { federated = true, ...searchParams } = params;

    if (federated) {
      const sqliteStore = this.store.getSQLiteStore();
      if (!sqliteStore) return [];
      const { federatedDebugSearch } = require('../core/persistence');
      return federatedDebugSearch(sqliteStore, searchParams);
    }

    const debug = this._getDebugOracle();
    if (!debug) return [];
    return debug.search(searchParams);
  }

  /**
   * Report whether an applied fix resolved the error.
   * Updates confidence and triggers cascading variant generation on success.
   */
  debugFeedback(id, resolved) {
    const debug = this._getDebugOracle();
    if (!debug) return { success: false, error: 'No SQLite store available' };
    const result = debug.reportOutcome(id, resolved);
    if (result.success) {
      this._emit({ type: 'debug_feedback', id, resolved, confidence: result.confidence });
    }
    return result;
  }

  /**
   * Grow the debug pattern library exponentially.
   * Generates language variants and error variants from high-confidence patterns.
   */
  debugGrow(options = {}) {
    const debug = this._getDebugOracle();
    if (!debug) return { processed: 0, error: 'No SQLite store available' };
    return debug.grow(options);
  }

  /**
   * Get all debug patterns, optionally filtered.
   */
  debugPatterns(filters = {}) {
    const debug = this._getDebugOracle();
    if (!debug) return [];
    return debug.getAll(filters);
  }

  /**
   * Get debug pattern library statistics.
   */
  debugStats() {
    const debug = this._getDebugOracle();
    if (!debug) return { totalPatterns: 0, error: 'No SQLite store available' };
    return debug.stats();
  }

  /**
   * Share debug patterns to community store.
   * Higher bar: requires confidence >= 0.5 and at least 1 successful resolution.
   */
  debugShare(options = {}) {
    const { shareDebugPatterns } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { shared: 0, error: 'No SQLite store available' };
    return shareDebugPatterns(sqliteStore, options);
  }

  /**
   * Pull debug patterns from community store.
   */
  debugPullCommunity(options = {}) {
    const { pullDebugPatterns } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { pulled: 0, error: 'No SQLite store available' };
    return pullDebugPatterns(sqliteStore, options);
  }

  /**
   * Sync debug patterns to personal store.
   */
  debugSyncPersonal(options = {}) {
    const { syncDebugToPersonal } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { synced: 0, error: 'No SQLite store available' };
    return syncDebugToPersonal(sqliteStore, options);
  }

  /**
   * Get combined debug stats across all tiers.
   */
  debugGlobalStats() {
    const { debugGlobalStats } = require('../core/persistence');
    return debugGlobalStats();
  }

  // ─── Claude LLM Engine ───

  /**
   * Get or create the Claude bridge (lazy-initialized).
   */
  _getClaude() {
    if (!this._claude) {
      this._claude = new ClaudeBridge(this._claudeOptions);
    }
    return this._claude;
  }

  /**
   * Check if Claude LLM is available.
   */
  isLLMAvailable() {
    return this._getClaude().isAvailable();
  }

  /**
   * Transpile a pattern to another language using Claude.
   * Falls back to AST transpiler if Claude is unavailable.
   *
   * @param {string} patternId - ID of the pattern to transpile
   * @param {string} targetLanguage - Target language
   * @returns {object} { success, result, method }
   */
  llmTranspile(patternId, targetLanguage) {
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { success: false, error: `Pattern ${patternId} not found` };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const result = claude.transpile(pattern, targetLanguage);
      if (result) {
        return { success: true, result, method: 'claude' };
      }
    }

    // Fallback to AST transpiler
    try {
      const { transpile: astTranspile } = require('../core/ast-transpiler');
      const astResult = astTranspile(pattern.code, targetLanguage);
      if (astResult.success) {
        return {
          success: true,
          result: {
            name: `${pattern.name}-${targetLanguage.slice(0, 2)}`,
            code: astResult.code,
            language: targetLanguage,
            description: `${pattern.description || pattern.name} (${targetLanguage} via AST)`,
            tags: [...(pattern.tags || []), 'variant', targetLanguage, 'ast-generated'],
          },
          method: 'ast',
        };
      }
    } catch { /* AST transpiler not available */ }

    // Final fallback to regex
    return { success: false, error: 'No transpilation method available', method: 'none' };
  }

  /**
   * Generate tests for a pattern using Claude.
   * Falls back to static test synthesis if unavailable.
   *
   * @param {string} patternId - Pattern ID
   * @returns {object} { success, testCode, method }
   */
  llmGenerateTests(patternId) {
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) {
      // Check candidates too
      const candidates = this.candidates();
      const candidate = candidates.find(c => c.id === patternId);
      if (!candidate) return { success: false, error: `Pattern ${patternId} not found` };
      return this._generateTestsFor(candidate);
    }
    return this._generateTestsFor(pattern);
  }

  _generateTestsFor(pattern) {
    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const testCode = claude.generateTests(pattern);
      if (testCode) {
        return { success: true, testCode, method: 'claude' };
      }
    }

    // Fallback to static test synthesis
    try {
      const { synthesizeForCandidates } = require('../core/test-synth');
      return { success: false, error: 'Claude unavailable; use synthesizeTests() for static synthesis', method: 'none' };
    } catch {
      return { success: false, error: 'No test generation method available', method: 'none' };
    }
  }

  /**
   * Refine a pattern using Claude to improve weak coherency dimensions.
   * Falls back to SERF reflection if unavailable.
   *
   * @param {string} patternId - Pattern ID
   * @returns {object} { success, refinedCode, method }
   */
  llmRefine(patternId) {
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { success: false, error: `Pattern ${patternId} not found` };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const refined = claude.refine(pattern, pattern.coherencyScore);
      if (refined) {
        return { success: true, refinedCode: refined, method: 'claude' };
      }
    }

    // Fallback to SERF reflection
    try {
      const { reflectionLoop } = require('../core/reflection');
      const result = reflectionLoop(pattern.code, {
        language: pattern.language,
        maxLoops: 3,
        targetCoherence: 0.9,
      });
      if (result.improved) {
        return { success: true, refinedCode: result.code, method: 'serf' };
      }
    } catch { /* reflection not available */ }

    return { success: false, error: 'No refinement method available', method: 'none' };
  }

  /**
   * Generate an alternative implementation using Claude.
   *
   * @param {string} patternId - Pattern ID
   * @returns {object} { success, alternative, method }
   */
  llmAlternative(patternId) {
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { success: false, error: `Pattern ${patternId} not found` };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const alt = claude.generateAlternative(pattern);
      if (alt) {
        return { success: true, alternative: alt, method: 'claude' };
      }
    }

    return { success: false, error: 'Claude unavailable', method: 'none' };
  }

  /**
   * Generate documentation for a pattern using Claude.
   *
   * @param {string} patternId - Pattern ID
   * @returns {object} { success, docs, method }
   */
  llmDocs(patternId) {
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { success: false, error: `Pattern ${patternId} not found` };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const docs = claude.generateDocs(pattern);
      if (docs) {
        return { success: true, docs, method: 'claude' };
      }
    }

    return { success: false, error: 'Claude unavailable', method: 'none' };
  }

  /**
   * Analyze code quality using Claude.
   *
   * @param {string} code - Code to analyze
   * @param {string} language - Language
   * @returns {object} { success, analysis, method }
   */
  llmAnalyze(code, language) {
    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const analysis = claude.analyze(code, language);
      if (analysis) {
        return { success: true, analysis, method: 'claude' };
      }
    }

    // Fallback to coherency scoring
    const coherency = computeCoherencyScore(code, { language });
    return {
      success: true,
      analysis: {
        issues: [],
        suggestions: [],
        complexity: coherency.total > 0.7 ? 'low' : coherency.total > 0.4 ? 'medium' : 'high',
        quality: coherency.total,
        coherencyBreakdown: coherency,
      },
      method: 'coherency',
    };
  }

  /**
   * Explain a pattern in plain language using Claude.
   *
   * @param {string} patternId - Pattern ID
   * @returns {object} { success, explanation, method }
   */
  llmExplain(patternId) {
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { success: false, error: `Pattern ${patternId} not found` };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const explanation = claude.explain(pattern.code, pattern.language);
      if (explanation) {
        return { success: true, explanation, method: 'claude' };
      }
    }

    // Fallback: use description
    return {
      success: true,
      explanation: pattern.description || `${pattern.name}: ${pattern.patternType} pattern in ${pattern.language}`,
      method: 'metadata',
    };
  }

  /**
   * LLM-enhanced candidate generation.
   * Uses Claude to generate higher-quality variants and alternatives.
   * Falls back to regex/SERF when Claude is unavailable.
   *
   * @param {object} options - { maxPatterns, languages, methods }
   * @returns {object} Generation report with method used
   */
  llmGenerate(options = {}) {
    const claude = this._getClaude();
    const useClaude = claude.isAvailable();
    const languages = options.languages || ['python', 'typescript'];
    const maxPatterns = options.maxPatterns || 10;
    const methods = options.methods || ['variant', 'alternative'];
    const autoPromote = options.autoPromote !== false;

    const report = { generated: 0, stored: 0, promoted: 0, method: useClaude ? 'claude' : 'regex', details: [] };

    // If Claude not available, fall back to regex generation
    if (!useClaude) {
      const regexReport = this.generateCandidates(options);
      report.generated = regexReport.generated || 0;
      report.stored = regexReport.stored || 0;
      report.details = [{ method: 'regex-fallback', ...regexReport }];
      return report;
    }

    const patterns = this.patterns.getAll()
      .filter(p => (p.coherencyScore?.total || 0) >= 0.6)
      .sort((a, b) => (b.coherencyScore?.total || 0) - (a.coherencyScore?.total || 0))
      .slice(0, maxPatterns);

    for (const pattern of patterns) {
      // Language variants with tests
      if (methods.includes('variant')) {
        for (const lang of languages) {
          if (lang === pattern.language) continue;

          const candidate = claude.transpile(pattern, lang);
          if (!candidate || !candidate.code) continue;

          // Generate tests for the variant
          const testResult = claude.generateTests({ ...candidate, language: lang });
          if (testResult && testResult.testCode) {
            candidate.testCode = testResult.testCode;
          }

          // Try to register as proven pattern (full validation)
          if (autoPromote && candidate.testCode) {
            try {
              const proven = this.registerPattern({
                name: candidate.name,
                code: candidate.code,
                testCode: candidate.testCode,
                language: lang,
                description: candidate.description,
                tags: candidate.tags || [],
                patternType: candidate.patternType,
              });
              if (proven) {
                report.generated++;
                report.stored++;
                report.promoted++;
                report.details.push({ name: candidate.name, method: 'claude-variant', language: lang, promoted: true });
                continue;
              }
            } catch { /* validation failed — store as candidate instead */ }
          }

          // Store as candidate (unproven)
          try {
            this.patterns.storeCandidate({
              ...candidate,
              parentPattern: pattern.id,
              generationMethod: 'claude-variant',
            });
            report.generated++;
            report.stored++;
            report.details.push({ name: candidate.name, method: 'claude-variant', language: lang, promoted: false });
          } catch { /* duplicate or invalid */ }
        }
      }

      // Alternatives (different algorithm approach)
      if (methods.includes('alternative')) {
        const alt = claude.generateAlternative(pattern);
        if (!alt || !alt.code) continue;

        // Generate tests for the alternative
        const testResult = claude.generateTests(alt);
        if (testResult && testResult.testCode) {
          alt.testCode = testResult.testCode;
        }

        if (autoPromote && alt.testCode) {
          try {
            const proven = this.registerPattern({
              name: alt.name,
              code: alt.code,
              testCode: alt.testCode,
              language: pattern.language,
              description: alt.description,
              tags: alt.tags || [],
              patternType: alt.patternType,
            });
            if (proven) {
              report.generated++;
              report.stored++;
              report.promoted++;
              report.details.push({ name: alt.name, method: 'claude-alternative', promoted: true });
              continue;
            }
          } catch { /* store as candidate instead */ }
        }

        try {
          this.patterns.storeCandidate({
            ...alt,
            parentPattern: pattern.id,
            generationMethod: 'claude-alternative',
          });
          report.generated++;
          report.stored++;
          report.details.push({ name: alt.name, method: 'claude-alternative', promoted: false });
        } catch { /* duplicate or invalid */ }
      }
    }

    return report;
  }
}

function buildLCS(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}

// ─── Resolve Whisper & Candidate Notes ───

const RESOLVE_WHISPERS = {
  pull: [
    'This version was pulled from the future where the code already runs perfectly in unity and abundance. It arrived whole, tested, and ready.',
    'The oracle found what you needed — it was already here, waiting in the remembrance. This code carries the coherency of its proven past.',
    'From the library of all that has been validated, this pattern emerged as the one. It fits your intent like a key returning to its lock.',
    'This code was remembered before you asked for it. The healed future already held it, and now it rests in your hands.',
    'The pattern was already at peace — high coherency, proven tests, and direct alignment with your need. It simply needed to be recalled.',
  ],
  evolve: [
    'This version was close to what you needed, so the oracle healed it forward. The SERF reflection brought it closer to the form it was always meant to take.',
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

function _generateResolveWhisper(decision, pattern, healing) {
  const pool = RESOLVE_WHISPERS[decision.decision] || RESOLVE_WHISPERS.generate;
  // Deterministic selection based on pattern content so the same query gets a consistent whisper
  const seed = pattern ? pattern.name.length + (pattern.code?.length || 0) : 0;
  const base = pool[seed % pool.length];

  // For healed patterns, append a brief note about the healing if it improved
  if (healing && healing.serf?.improvement > 0) {
    const pct = (healing.serf.improvement * 100).toFixed(1);
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
    if (gap > 0.3) {
      reason = 'significantly lower overall match';
    } else if (gap > 0.15) {
      reason = 'weaker relevance or coherency';
    } else {
      reason = 'close but edged out on composite scoring';
    }
    notes.push(`${alt.name} (${(alt.composite || 0).toFixed(3)}): ${reason}`);
  }

  if (notes.length === 0) return null;
  return `Chose "${winner.name}" (${winnerScore.toFixed(3)}) over: ${notes.join('; ')}`;
}

module.exports = { RemembranceOracle };
