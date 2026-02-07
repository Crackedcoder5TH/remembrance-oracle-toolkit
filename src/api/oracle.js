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
   * Synthesize tests for candidates and optionally auto-promote.
   * This is the test synthesis pipeline:
   *   1. Analyze each candidate's code + parent tests
   *   2. Generate test assertions for the target language
   *   3. Update candidate test code
   *   4. Optionally auto-promote with synthesized tests
   *
   * @param {object} options - { maxCandidates?, dryRun?, autoPromote? }
   */
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
    const { shareToCommuntiy } = require('../core/persistence');
    const sqliteStore = this.store.getSQLiteStore();
    if (!sqliteStore) return { shared: 0, error: 'No SQLite store available' };
    return shareToCommuntiy(sqliteStore, options);
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
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
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

    const report = { generated: 0, stored: 0, method: useClaude ? 'claude' : 'regex', details: [] };

    const patterns = this.patterns.getAll()
      .filter(p => (p.coherencyScore?.total || 0) >= 0.6)
      .slice(0, maxPatterns);

    for (const pattern of patterns) {
      // Language variants
      if (methods.includes('variant')) {
        for (const lang of languages) {
          if (lang === pattern.language) continue;

          let candidate = null;
          if (useClaude) {
            candidate = claude.transpile(pattern, lang);
          }

          if (candidate) {
            try {
              this.patterns.storeCandidate({
                ...candidate,
                parentPattern: pattern.id,
                generationMethod: 'claude-variant',
              });
              report.generated++;
              report.stored++;
              report.details.push({ name: candidate.name, method: 'claude-variant', language: lang });
            } catch { /* duplicate or invalid */ }
          }
        }
      }

      // Alternatives
      if (methods.includes('alternative') && useClaude) {
        const alt = claude.generateAlternative(pattern);
        if (alt) {
          try {
            this.patterns.storeCandidate({
              ...alt,
              parentPattern: pattern.id,
              generationMethod: 'claude-alternative',
            });
            report.generated++;
            report.stored++;
            report.details.push({ name: alt.name, method: 'claude-alternative' });
          } catch { /* duplicate or invalid */ }
        }
      }
    }

    // If Claude wasn't available, fall back to regular generation
    if (!useClaude) {
      const regexReport = this.generateCandidates(options);
      report.generated = regexReport.generated || 0;
      report.stored = regexReport.stored || 0;
      report.details = [{ method: 'regex-fallback', ...regexReport }];
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

module.exports = { RemembranceOracle };
