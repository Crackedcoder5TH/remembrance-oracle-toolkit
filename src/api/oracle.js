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

class RemembranceOracle {
  constructor(options = {}) {
    this.store = options.store || new VerifiedHistoryStore(options.baseDir);
    const storeDir = this.store.storeDir || require('path').join(options.baseDir || process.cwd(), '.remembrance');
    this.patterns = options.patterns || new PatternLibrary(storeDir);
    this.threshold = options.threshold || 0.6;

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
