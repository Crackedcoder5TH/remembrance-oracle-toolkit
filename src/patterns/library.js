/**
 * Pattern Library — The heart of the Oracle's intelligence.
 *
 * Stores reusable code patterns categorized by:
 * - Pattern type (algorithm, data-structure, utility, design-pattern, etc.)
 * - Complexity tier (atomic, composite, architectural)
 * - Language variants (same pattern, multiple language implementations)
 *
 * The Decision Engine uses coherency scoring to decide:
 *   - PULL: if an existing pattern scores above the pull threshold
 *   - GENERATE: if no pattern is good enough, flag for new generation
 *   - EVOLVE: if a pattern exists but can be improved, fork + upgrade
 *
 * Backend: SQLite (shared with history store) when available, falls back to JSON.
 * Storage: .remembrance/oracle.db (SQLite) or .remembrance/pattern-library.json (JSON)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeCoherencyScore } = require('../core/coherency');
const { computeRelevance } = require('../core/relevance');
const {
  DECISION_THRESHOLDS,
  HASH_TRUNCATION_LENGTH,
  DECISION_BONUSES,
  BUG_PENALTY_MULTIPLIER,
  VOTE_BOOST,
  DECISION_WEIGHTS,
  RELEVANCE_GATES,
  COMPLEXITY_TIERS: COMPLEXITY_TIER_LIMITS,
  RETIREMENT_WEIGHTS,
} = require('../constants/thresholds');

const PATTERN_FILE = 'pattern-library.json';

const PATTERN_TYPES = [
  'algorithm', 'data-structure', 'utility', 'design-pattern',
  'validation', 'transformation', 'io', 'concurrency', 'testing',
];

const COMPLEXITY_TIERS = ['atomic', 'composite', 'architectural'];

// Decision thresholds — sourced from centralized constants
const THRESHOLDS = {
  pull: DECISION_THRESHOLDS.PULL,
  evolve: DECISION_THRESHOLDS.EVOLVE,
  generate: DECISION_THRESHOLDS.GENERATE,
  retire: DECISION_THRESHOLDS.RETIRE,
};

/**
 * Try to get or create a shared SQLite instance.
 */
function tryGetSQLite(storeDir) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (!DatabaseSync) return null;
    const { SQLiteStore } = require('../store/sqlite');

    // Re-use the VerifiedHistoryStore's shared instance if it exists
    const { VerifiedHistoryStore } = require('../store/history');
    if (VerifiedHistoryStore._sqliteInstances && VerifiedHistoryStore._sqliteInstances.has(storeDir)) {
      return VerifiedHistoryStore._sqliteInstances.get(storeDir);
    }

    // storeDir may be a .remembrance dir (from Oracle flow) or a raw dir (from tests).
    // SQLiteStore expects a baseDir and creates .remembrance inside it.
    // If storeDir already ends with .remembrance, go one level up.
    const baseDir = path.basename(storeDir) === '.remembrance'
      ? path.dirname(storeDir)
      : storeDir;
    const instance = new SQLiteStore(baseDir);
    if (!VerifiedHistoryStore._sqliteInstances) {
      VerifiedHistoryStore._sqliteInstances = new Map();
    }
    VerifiedHistoryStore._sqliteInstances.set(storeDir, instance);
    return instance;
  } catch { /* SQLite not available — fall back to JSON */ }
  return null;
}

class PatternLibrary {
  constructor(storeDir) {
    this.storeDir = storeDir;
    this.libraryPath = path.join(storeDir, PATTERN_FILE);
    this._backend = 'json';

    const sqlite = tryGetSQLite(storeDir);
    if (sqlite) {
      this._sqlite = sqlite;
      this._backend = 'sqlite';
    } else {
      this._ensureJSON();
    }
  }

  get backend() { return this._backend; }

  _ensureJSON() {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
    if (!fs.existsSync(this.libraryPath)) {
      this._writeJSON({
        patterns: [],
        meta: { created: new Date().toISOString(), version: 1, decisions: 0 },
      });
    }
  }

  _readJSON() {
    return JSON.parse(fs.readFileSync(this.libraryPath, 'utf-8'));
  }

  _writeJSON(data) {
    fs.writeFileSync(this.libraryPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, HASH_TRUNCATION_LENGTH);
  }

  // ─── Public API ───

  /**
   * Register a new pattern in the library with coherency scoring.
   * @param {object} pattern - Pattern object with code, name, language, etc.
   * @returns {object} The registered pattern record with id and coherency score
   */
  register(pattern) {
    const coherency = computeCoherencyScore(pattern.code, {
      language: pattern.language,
      testPassed: pattern.testPassed,
      historicalReliability: pattern.reliability ?? 0.5,
    });

    if (this._backend === 'sqlite') {
      const patternData = {
        name: pattern.name,
        code: pattern.code,
        language: pattern.language || coherency.language,
        patternType: pattern.patternType || classifyPattern(pattern.code, pattern.name),
        complexity: pattern.complexity || inferComplexity(pattern.code),
        description: pattern.description || '',
        tags: pattern.tags || [],
        coherencyScore: coherency,
        variants: pattern.variants || [],
        testCode: pattern.testCode || null,
      };
      // Use dedup-safe insert: skip or update if (name, language) already exists
      const record = this._sqlite.addPatternIfNotExists(patternData);
      this._sqlite.incrementDecisions();
      if (!record) {
        // Duplicate with equal/higher coherency — return the existing one
        const existing = this._sqlite.getPatternByName(pattern.name);
        return existing;
      }
      return record;
    }

    return this._registerJSON(pattern, coherency);
  }

  /**
   * Decision engine: determines whether to PULL, EVOLVE, or GENERATE for a given request.
   * @param {object} request - Request object with description, tags, language, minCoherency
   * @returns {object} Decision result with decision type, pattern, confidence, reasoning, alternatives
   */
  decide(request) {
    if (request == null || typeof request !== 'object') request = {};
    const { description: rawDesc = '', tags = [], language, minCoherency } = request;
    const description = String(rawDesc);
    let patterns = this.getAll();

    // Pre-filter by language when specified to avoid scoring irrelevant patterns
    if (language) {
      const langLower = language.toLowerCase();
      const filtered = patterns.filter(p => (p.language || 'unknown').toLowerCase() === langLower);
      // Fall back to all patterns if no language match exists
      if (filtered.length > 0) patterns = filtered;
    }

    if (patterns.length === 0) {
      return {
        decision: 'generate',
        pattern: null,
        confidence: 1.0,
        reasoning: 'Pattern library is empty — generation required',
        alternatives: [],
      };
    }

    const scored = patterns.map(p => {
      const relevance = computeRelevance(
        { description, tags, language },
        {
          name: p.name,
          description: `${p.name} ${p.description}`,
          tags: p.tags,
          language: p.language,
          code: p.code,
          coherencyScore: p.coherencyScore,
        }
      );

      const normalizedDesc = description.toLowerCase().replace(/[-_]/g, ' ');
      const normalizedName = p.name.toLowerCase().replace(/[-_]/g, ' ');
      const nameBonus = normalizedDesc.includes(normalizedName) || normalizedName.includes(normalizedDesc) ? DECISION_BONUSES.NAME_MATCH : 0;
      const focusBonus = p.complexity === 'atomic' ? DECISION_BONUSES.ATOMIC_FOCUS : p.complexity === 'composite' ? DECISION_BONUSES.COMPOSITE_FOCUS : 0;
      const coherency = p.coherencyScore?.total ?? 0;

      // Enhanced reliability: usage success + bug reports + healing success + community votes
      const usageReliability = p.usageCount > 0 ? p.successCount / p.usageCount : 0.5;
      const bugCount = p.bugReports || 0;
      const bugPenalty = bugCount > 0 ? Math.max(0, 1 - bugCount * BUG_PENALTY_MULTIPLIER) : 1.0;
      const healingRate = typeof this._healingRateProvider === 'function' ? this._healingRateProvider(p.id) : 1.0;
      // Weighted vote scoring — uses reputation-weighted scores when available
      const weightedScore = p.weightedVoteScore ?? ((p.upvotes || 0) - (p.downvotes || 0));
      const voteBoost = weightedScore > 0 ? Math.min(VOTE_BOOST.MAX, weightedScore * VOTE_BOOST.MULTIPLIER) : Math.max(VOTE_BOOST.MIN, weightedScore * VOTE_BOOST.MULTIPLIER);
      const reliability = usageReliability * bugPenalty * healingRate + voteBoost;

      // Evolution adjustments: penalize stale + over-evolved patterns
      let evolutionPenalty = 0;
      try {
        const { evolutionAdjustment } = require('../evolution/evolution');
        const adj = evolutionAdjustment(p);
        evolutionPenalty = adj.total;
      } catch {
        // Evolution module not available — no penalty
      }

      const cappedReliability = Math.min(reliability, DECISION_WEIGHTS.RELIABILITY_CAP);
      const composite = relevance.relevance * DECISION_WEIGHTS.RELEVANCE + coherency * DECISION_WEIGHTS.COHERENCY + cappedReliability * DECISION_WEIGHTS.RELIABILITY + nameBonus + focusBonus - evolutionPenalty;

      return { pattern: p, relevance: relevance.relevance, coherency, reliability, composite };
    }).sort((a, b) => b.composite - a.composite);

    // Guard: if all patterns were filtered out during scoring, generate
    if (scored.length === 0) {
      return {
        decision: 'generate',
        pattern: null,
        confidence: 1.0,
        reasoning: 'All patterns filtered out during scoring — generation required',
        alternatives: [],
      };
    }

    const best = scored[0];
    const threshold = minCoherency ?? THRESHOLDS.pull;

    if (best.composite >= threshold && best.relevance >= RELEVANCE_GATES.FOR_PULL) {
      return {
        decision: 'pull',
        pattern: best.pattern,
        confidence: best.composite,
        reasoning: `Pattern "${best.pattern.name}" matches with composite score ${best.composite.toFixed(3)} (relevance=${best.relevance.toFixed(3)}, coherency=${best.coherency.toFixed(3)}, reliability=${best.reliability.toFixed(3)})`,
        alternatives: scored.slice(1, 4).map(s => ({ id: s.pattern.id, name: s.pattern.name, composite: s.composite })),
      };
    }

    const evolveThreshold = Math.min(threshold, THRESHOLDS.evolve);
    if (best.composite >= evolveThreshold && best.relevance >= RELEVANCE_GATES.FOR_EVOLVE) {
      return {
        decision: 'evolve',
        pattern: best.pattern,
        confidence: best.composite,
        reasoning: `Pattern "${best.pattern.name}" is a partial match (${best.composite.toFixed(3)}) — can be evolved to fit`,
        alternatives: scored.slice(1, 4).map(s => ({ id: s.pattern.id, name: s.pattern.name, composite: s.composite })),
      };
    }

    return {
      decision: 'generate',
      pattern: scored.length > 0 ? scored[0].pattern : null,
      confidence: 1.0 - (best.composite || 0),
      reasoning: `Best match "${best.pattern.name}" scored too low (${best.composite.toFixed(3)}) — new pattern needed`,
      alternatives: scored.slice(0, 3).map(s => ({ id: s.pattern.id, name: s.pattern.name, composite: s.composite })),
    };
  }

  /**
   * Set a healing rate provider function for reliability scoring.
   * Called with (patternId) → returns 0-1 rate.
   */
  setHealingRateProvider(fn) {
    this._healingRateProvider = fn;
  }

  /**
   * Record usage feedback for a pattern to track reliability.
   * @param {string} id - Pattern ID
   * @param {boolean} succeeded - Whether the pattern usage was successful
   * @returns {object|null} Updated pattern record or null if not found
   */
  recordUsage(id, succeeded) {
    if (this._backend === 'sqlite') {
      return this._sqlite.recordPatternUsage(id, succeeded);
    }
    return this._recordUsageJSON(id, succeeded);
  }

  /**
   * Report a bug against a pattern. Increments bugReports counter.
   * Bug reports penalize the pattern's reliability score.
   */
  reportBug(id, description) {
    const pattern = this.getAll().find(p => p.id === id);
    if (!pattern) return { success: false, reason: 'Pattern not found' };

    const bugCount = (pattern.bugReports || 0) + 1;
    if (this._backend === 'sqlite') {
      // Store bug count in the pattern's metadata
      this._sqlite.updatePattern(id, { bugReports: bugCount });
    } else {
      const data = this._readJSON();
      const idx = data.patterns.findIndex(p => p.id === id);
      if (idx >= 0) {
        data.patterns[idx].bugReports = bugCount;
        this._writeJSON(data);
      }
    }

    return { success: true, patternId: id, patternName: pattern.name, bugReports: bugCount, description };
  }

  /**
   * Get full reliability breakdown for a pattern.
   */
  getReliability(id) {
    const pattern = this.getAll().find(p => p.id === id);
    if (!pattern) return null;

    const usageReliability = pattern.usageCount > 0 ? pattern.successCount / pattern.usageCount : 0.5;
    const bugCount = pattern.bugReports || 0;
    const bugPenalty = bugCount > 0 ? Math.max(0, 1 - bugCount * BUG_PENALTY_MULTIPLIER) : 1.0;
    const healingRate = typeof this._healingRateProvider === 'function' ? this._healingRateProvider(id) : 1.0;
    const voteScore = (pattern.upvotes || 0) - (pattern.downvotes || 0);
    const weightedScore = pattern.weightedVoteScore ?? voteScore;
    const voteBoost = weightedScore > 0 ? Math.min(VOTE_BOOST.MAX, weightedScore * VOTE_BOOST.MULTIPLIER) : Math.max(VOTE_BOOST.MIN, weightedScore * VOTE_BOOST.MULTIPLIER);
    const combined = usageReliability * bugPenalty * healingRate + voteBoost;

    return {
      patternId: id,
      patternName: pattern.name,
      usageReliability: Math.round(usageReliability * 1000) / 1000,
      usageCount: pattern.usageCount || 0,
      successCount: pattern.successCount || 0,
      bugReports: bugCount,
      bugPenalty: Math.round(bugPenalty * 1000) / 1000,
      healingRate: Math.round(healingRate * 1000) / 1000,
      upvotes: pattern.upvotes || 0,
      downvotes: pattern.downvotes || 0,
      voteScore,
      weightedScore: Math.round(weightedScore * 100) / 100,
      voteBoost: Math.round(voteBoost * 1000) / 1000,
      combined: Math.round(combined * 1000) / 1000,
    };
  }

  /**
   * Evolve a pattern by creating a new variant with modified code.
   * @param {string} parentId - ID of the parent pattern to evolve from
   * @param {string} newCode - The evolved code implementation
   * @param {object} metadata - Optional metadata (name, description, tags, etc.)
   * @returns {object|null} The evolved pattern record or null if parent not found
   */
  evolve(parentId, newCode, metadata = {}) {
    if (this._backend === 'sqlite') {
      return this._evolveSQLite(parentId, newCode, metadata);
    }
    return this._evolveJSON(parentId, newCode, metadata);
  }

  /**
   * Retire low-scoring patterns below the minimum threshold.
   * @param {number} minScore - Minimum composite score to retain (default from THRESHOLDS.retire)
   * @returns {object} Result with retired count and remaining count
   */
  retire(minScore = THRESHOLDS.retire) {
    if (this._backend === 'sqlite') {
      return this._sqlite.retirePatterns(minScore);
    }
    return this._retireJSON(minScore);
  }

  /**
   * Get all patterns, optionally filtered by language, type, complexity, or coherency.
   * @param {object} filters - Optional filters (language, patternType, complexity, minCoherency)
   * @returns {Array<object>} Array of pattern records
   */
  getAll(filters = {}) {
    if (this._backend === 'sqlite') {
      return this._sqlite.getAllPatterns(filters);
    }
    return this._getAllJSON(filters);
  }

  /**
   * Update a pattern's fields by ID.
   * @param {string} id - Pattern ID
   * @param {object} updates - Object with fields to update
   * @returns {object|null} Updated pattern record or null if not found
   */
  update(id, updates) {
    if (this._backend === 'sqlite') {
      return this._sqlite.updatePattern(id, updates);
    }
    // JSON fallback
    const data = this._readJSON();
    const pattern = data.patterns.find(p => p.id === id);
    if (!pattern) return null;
    Object.assign(pattern, updates, { updatedAt: new Date().toISOString() });
    this._writeJSON(data);
    return pattern;
  }

  /**
   * Get a statistical summary of the pattern library.
   * @returns {object} Summary with pattern counts by type, complexity, language, and average coherency
   */
  summary() {
    if (this._backend === 'sqlite') {
      return this._sqlite.patternSummary();
    }
    return this._summaryJSON();
  }

  // ─── Candidates — coherent-but-unproven patterns ───

  /**
   * Add a candidate pattern — passes coherency but lacks test proof.
   * These are "should work" patterns awaiting promotion via test proof.
   */
  addCandidate(candidate) {
    if (this._backend === 'sqlite') {
      return this._sqlite.addCandidate(candidate);
    }
    // JSON fallback: store candidates in a separate file
    return this._addCandidateJSON(candidate);
  }

  /**
   * Get all unpromoted candidates, optionally filtered.
   */
  getCandidates(filters = {}) {
    if (this._backend === 'sqlite') {
      return this._sqlite.getAllCandidates(filters);
    }
    return this._getCandidatesJSON(filters);
  }

  /**
   * Promote a candidate by ID — marks it as promoted.
   * Returns the candidate record for the caller to register through the oracle.
   */
  promoteCandidate(id) {
    if (this._backend === 'sqlite') {
      return this._sqlite.promoteCandidate(id);
    }
    return this._promoteCandidateJSON(id);
  }

  /**
   * Get candidate stats summary.
   */
  candidateSummary() {
    if (this._backend === 'sqlite') {
      return this._sqlite.candidateSummary();
    }
    return this._candidateSummaryJSON();
  }

  /**
   * Prune low-coherency candidates.
   */
  pruneCandidates(minCoherency = 0.5) {
    if (this._backend === 'sqlite') {
      return this._sqlite.pruneCandidates(minCoherency);
    }
    return this._pruneCandidatesJSON(minCoherency);
  }

  // ─── JSON candidate fallback ───

  _candidatesPath() {
    return path.join(this.storeDir, 'candidates.json');
  }

  _readCandidatesJSON() {
    const p = this._candidatesPath();
    if (!fs.existsSync(p)) return { candidates: [] };
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  }

  _writeCandidatesJSON(data) {
    fs.writeFileSync(this._candidatesPath(), JSON.stringify(data, null, 2), 'utf-8');
  }

  _addCandidateJSON(candidate) {
    const data = this._readCandidatesJSON();
    const id = this._hash(candidate.code + candidate.name + Date.now());
    const now = new Date().toISOString();
    const record = {
      id,
      name: candidate.name,
      code: candidate.code,
      language: candidate.language || 'unknown',
      patternType: candidate.patternType || 'utility',
      complexity: candidate.complexity || inferComplexity(candidate.code),
      description: candidate.description || '',
      tags: candidate.tags || [],
      coherencyTotal: candidate.coherencyTotal ?? 0,
      coherencyScore: candidate.coherencyScore || {},
      testCode: candidate.testCode || null,
      parentPattern: candidate.parentPattern || null,
      generationMethod: candidate.generationMethod || 'variant',
      promotedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    data.candidates.push(record);
    this._writeCandidatesJSON(data);
    return record;
  }

  _getCandidatesJSON(filters = {}) {
    const data = this._readCandidatesJSON();
    let candidates = data.candidates.filter(c => !c.promotedAt);
    if (filters.language) candidates = candidates.filter(c => c.language?.toLowerCase() === filters.language.toLowerCase());
    if (filters.minCoherency != null) candidates = candidates.filter(c => (c.coherencyTotal ?? 0) >= filters.minCoherency);
    if (filters.parentPattern) candidates = candidates.filter(c => c.parentPattern === filters.parentPattern);
    return candidates;
  }

  _promoteCandidateJSON(id) {
    const data = this._readCandidatesJSON();
    const candidate = data.candidates.find(c => c.id === id);
    if (!candidate) return null;
    candidate.promotedAt = new Date().toISOString();
    candidate.updatedAt = new Date().toISOString();
    this._writeCandidatesJSON(data);
    return candidate;
  }

  _candidateSummaryJSON() {
    const data = this._readCandidatesJSON();
    const unpromoted = data.candidates.filter(c => !c.promotedAt);
    const promoted = data.candidates.filter(c => c.promotedAt).length;
    return {
      totalCandidates: unpromoted.length,
      promoted,
      byLanguage: countBy(unpromoted, 'language'),
      byMethod: countBy(unpromoted, 'generationMethod'),
      avgCoherency: unpromoted.length > 0
        ? Math.round(unpromoted.reduce((s, c) => s + (c.coherencyTotal ?? 0), 0) / unpromoted.length * 1000) / 1000
        : 0,
    };
  }

  _pruneCandidatesJSON(minCoherency) {
    const data = this._readCandidatesJSON();
    const before = data.candidates.length;
    // Only prune unpromoted candidates — preserve promoted ones regardless of coherency
    data.candidates = data.candidates.filter(c => c.promotedAt || (c.coherencyTotal ?? 0) >= minCoherency);
    this._writeCandidatesJSON(data);
    return { removed: before - data.candidates.length, remaining: data.candidates.length };
  }

  // ─── Composition ───

  /**
   * Compose a new pattern from existing components.
   * spec: { name, components: [id|name, ...], code?, description?, tags? }
   */
  compose(spec) {
    if (spec == null || typeof spec !== 'object') {
      return { composed: false, reason: 'Invalid input: spec must be a non-null object' };
    }
    const { name, components: componentIds = [], code: customCode, description, tags: extraTags = [] } = spec;
    if (!componentIds.length) {
      return { composed: false, reason: 'No components specified' };
    }

    const resolved = [];
    for (const ref of componentIds) {
      let p = null;
      if (this._backend === 'sqlite') {
        p = this._sqlite.getPattern(ref) || this._sqlite.getPatternByName(ref);
      } else {
        const data = this._readJSON();
        p = data.patterns.find(x => x.id === ref || x.name === ref);
      }
      if (!p) {
        return { composed: false, reason: `Component not found: ${ref}` };
      }
      resolved.push(p);
    }

    const mergedTags = [...new Set([...extraTags, ...resolved.flatMap(p => p.tags || []), 'composed'])];
    const composedCode = customCode || resolved.map(p =>
      `// ─── ${p.name} ───\n${p.code}`
    ).join('\n\n');

    const pattern = this.register({
      name,
      code: composedCode,
      language: resolved[0].language,
      description: description || `Composed from: ${resolved.map(p => p.name).join(', ')}`,
      tags: mergedTags,
      requires: resolved.map(p => p.id),
    });

    pattern.composedOf = resolved.map(p => ({ id: p.id, name: p.name }));
    if (this._backend === 'sqlite') {
      this._sqlite.updatePattern(pattern.id, {
        composedOf: pattern.composedOf,
        requires: pattern.requires || resolved.map(p => p.id),
      });
    }

    return { composed: true, pattern, components: resolved };
  }

  /**
   * Resolve full dependency tree for a pattern (depth-first).
   */
  resolveDependencies(id) {
    const visited = new Set();
    const result = [];
    // Read JSON once outside the walk to avoid re-parsing on every recursive call
    const jsonData = this._backend !== 'sqlite' ? this._readJSON() : null;

    const walk = (patternId) => {
      if (visited.has(patternId)) return;
      visited.add(patternId);

      let p;
      if (this._backend === 'sqlite') {
        p = this._sqlite.getPattern(patternId);
      } else {
        p = jsonData.patterns.find(x => x.id === patternId);
      }
      if (!p) return;

      const requires = p.requires || [];
      for (const depId of requires) {
        walk(depId);
      }
      result.push(p);
    };

    walk(id);
    return result;
  }

  // ─── SQLite evolution ───

  _evolveSQLite(parentId, newCode, metadata) {
    const parent = this._sqlite.getPattern(parentId);
    if (!parent) return null;

    const evolved = this.register({
      ...metadata,
      name: metadata.name || `${parent.name} (evolved)`,
      code: newCode,
      language: metadata.language || parent.language,
      patternType: metadata.patternType || parent.patternType,
      tags: metadata.tags || parent.tags,
      description: metadata.description || `Evolved from: ${parent.description}`,
    });

    const now = new Date().toISOString();
    evolved.evolutionHistory = [...(parent.evolutionHistory || []), { parentId, evolvedAt: now }];
    parent.evolutionHistory = [...(parent.evolutionHistory || []), { childId: evolved.id, evolvedAt: now }];

    this._sqlite.updatePattern(evolved.id, { evolutionHistory: evolved.evolutionHistory });
    this._sqlite.updatePattern(parentId, { evolutionHistory: parent.evolutionHistory });

    return evolved;
  }

  // ─── JSON implementations (fallback) ───

  _registerJSON(pattern, coherency) {
    const data = this._readJSON();
    const lang = (pattern.language || coherency.language || 'unknown').toLowerCase();
    const name = pattern.name;
    const newCoherency = coherency.total ?? 0;

    // Dedup check: find existing pattern with same (name, language) — case-insensitive
    const existingIdx = data.patterns.findIndex(
      p => p.name.toLowerCase() === name.toLowerCase()
        && (p.language || 'unknown').toLowerCase() === lang
    );

    if (existingIdx !== -1) {
      const existing = data.patterns[existingIdx];
      const existingCoherency = existing.coherencyScore?.total ?? 0;
      if (newCoherency > existingCoherency) {
        // Update in place — higher coherency replaces lower
        existing.code = pattern.code;
        existing.description = pattern.description || existing.description;
        existing.tags = pattern.tags || existing.tags;
        existing.coherencyScore = coherency;
        existing.testCode = pattern.testCode || existing.testCode;
        existing.patternType = pattern.patternType || existing.patternType;
        existing.complexity = pattern.complexity || existing.complexity;
        existing.updatedAt = new Date().toISOString();
        data.meta.decisions++;
        this._writeJSON(data);
        return existing;
      }
      // Existing has equal or higher coherency — return it without modification
      return existing;
    }

    const id = this._hash(pattern.code + pattern.name + Date.now());
    const record = {
      id,
      name: pattern.name,
      code: pattern.code,
      language: pattern.language || coherency.language,
      patternType: pattern.patternType || classifyPattern(pattern.code, pattern.name),
      complexity: pattern.complexity || inferComplexity(pattern.code),
      description: pattern.description || '',
      tags: pattern.tags || [],
      coherencyScore: coherency,
      variants: pattern.variants || [],
      testCode: pattern.testCode || null,
      usageCount: 0,
      successCount: 0,
      evolutionHistory: [],
      requires: pattern.requires || [],
      composedOf: pattern.composedOf || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.patterns.push(record);
    data.meta.decisions++;
    this._writeJSON(data);
    return record;
  }

  _recordUsageJSON(id, succeeded) {
    const data = this._readJSON();
    const pattern = data.patterns.find(p => p.id === id);
    if (!pattern) return null;
    pattern.usageCount = (pattern.usageCount || 0) + 1;
    if (succeeded) pattern.successCount = (pattern.successCount || 0) + 1;
    pattern.updatedAt = new Date().toISOString();
    this._writeJSON(data);
    return pattern;
  }

  _evolveJSON(parentId, newCode, metadata) {
    const data = this._readJSON();
    const parent = data.patterns.find(p => p.id === parentId);
    if (!parent) return null;

    const evolved = this.register({
      ...metadata,
      name: metadata.name || `${parent.name} (evolved)`,
      code: newCode,
      language: metadata.language || parent.language,
      patternType: metadata.patternType || parent.patternType,
      tags: metadata.tags || parent.tags,
      description: metadata.description || `Evolved from: ${parent.description}`,
    });

    // Re-read after register() wrote — single read for both updates
    const now = new Date().toISOString();
    const freshData = this._readJSON();
    const evolvedRecord = freshData.patterns.find(p => p.id === evolved.id);
    const parentRecord = freshData.patterns.find(p => p.id === parentId);
    if (evolvedRecord) {
      evolvedRecord.evolutionHistory = [...(parent.evolutionHistory || []), { parentId, evolvedAt: now }];
      evolved.evolutionHistory = evolvedRecord.evolutionHistory;
    }
    if (parentRecord) {
      parentRecord.evolutionHistory = [...(parentRecord.evolutionHistory || []), { childId: evolved.id, evolvedAt: now }];
      parentRecord.updatedAt = now;
    }
    this._writeJSON(freshData);
    return evolved;
  }

  _retireJSON(minScore = THRESHOLDS.retire) {
    const data = this._readJSON();
    const before = data.patterns.length;
    data.patterns = data.patterns.filter(p => {
      const coherency = p.coherencyScore?.total ?? 0;
      const reliability = p.usageCount > 0 ? p.successCount / p.usageCount : 0.5;
      return (coherency * RETIREMENT_WEIGHTS.COHERENCY + reliability * RETIREMENT_WEIGHTS.RELIABILITY) >= minScore;
    });
    this._writeJSON(data);
    return { retired: before - data.patterns.length, remaining: data.patterns.length };
  }

  _getAllJSON(filters = {}) {
    const data = this._readJSON();
    let patterns = data.patterns;
    if (filters.language) {
      patterns = patterns.filter(p => p.language?.toLowerCase() === filters.language.toLowerCase());
    }
    if (filters.patternType) {
      patterns = patterns.filter(p => p.patternType === filters.patternType);
    }
    if (filters.complexity) {
      patterns = patterns.filter(p => p.complexity === filters.complexity);
    }
    if (filters.minCoherency != null) {
      patterns = patterns.filter(p => (p.coherencyScore?.total ?? 0) >= filters.minCoherency);
    }
    return patterns;
  }

  _summaryJSON() {
    const patterns = this.getAll();
    return {
      totalPatterns: patterns.length,
      byType: countBy(patterns, 'patternType'),
      byComplexity: countBy(patterns, 'complexity'),
      byLanguage: countBy(patterns, 'language'),
      avgCoherency: patterns.length > 0
        ? Math.round(patterns.reduce((s, p) => s + (p.coherencyScore?.total ?? 0), 0) / patterns.length * 1000) / 1000
        : 0,
    };
  }
}

// ─── Helpers ───

/**
 * Classify a pattern into a category based on code and name analysis.
 * @param {string} code - The pattern's code
 * @param {string} name - The pattern's name (optional)
 * @returns {string} Pattern type (algorithm, data-structure, utility, design-pattern, etc.)
 */
function classifyPattern(code, name = '') {
  const combined = (code + ' ' + name).toLowerCase();
  if (/sort|search|bfs|dfs|dijkstra|binary.?search|merge|quick|heap/i.test(combined)) return 'algorithm';
  if (/tree|graph|queue|stack|linked.?list|hash.?map|trie|heap/i.test(combined)) return 'data-structure';
  if (/debounce|throttle|memoize|curry|compose|pipe|retry/i.test(combined)) return 'utility';
  if (/singleton|factory|observer|decorator|adapter|strategy|proxy/i.test(combined)) return 'design-pattern';
  if (/valid|sanitize|check|assert|guard|verify/i.test(combined)) return 'validation';
  if (/map|filter|reduce|transform|convert|parse|serialize/i.test(combined)) return 'transformation';
  if (/read|write|fetch|request|stream|file|http/i.test(combined)) return 'io';
  if (/async|promise|worker|thread|mutex|semaphore/i.test(combined)) return 'concurrency';
  if (/test|spec|mock|stub|fixture|assert/i.test(combined)) return 'testing';
  return 'utility';
}

/**
 * Infer complexity tier based on code lines and nesting depth.
 * @param {string} code - The code to analyze
 * @returns {string} Complexity tier (atomic, composite, or architectural)
 */
function inferComplexity(code) {
  const lines = code.split('\n').filter(l => l.trim()).length;
  const depth = maxNestingDepth(code);
  if (lines <= COMPLEXITY_TIER_LIMITS.ATOMIC.MAX_LINES && depth <= COMPLEXITY_TIER_LIMITS.ATOMIC.MAX_NESTING) return 'atomic';
  if (lines <= COMPLEXITY_TIER_LIMITS.COMPOSITE.MAX_LINES && depth <= COMPLEXITY_TIER_LIMITS.COMPOSITE.MAX_NESTING) return 'composite';
  return 'architectural';
}

function maxNestingDepth(code) {
  let max = 0, current = 0;
  for (const ch of code) {
    if (ch === '{' || ch === '(' || ch === '[') { current++; max = Math.max(max, current); }
    else if (ch === '}' || ch === ')' || ch === ']') { current = Math.max(0, current - 1); }
  }
  return max;
}

const { countBy } = require('../store/store-helpers');

module.exports = {
  PatternLibrary,
  classifyPattern,
  inferComplexity,
  THRESHOLDS,
  PATTERN_TYPES,
  COMPLEXITY_TIERS,
};
