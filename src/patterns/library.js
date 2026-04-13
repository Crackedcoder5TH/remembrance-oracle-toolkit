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
const { computeCoherencyScore } = require('../unified/coherency');
const { computeRelevance } = require('../core/relevance');
const { parseStructuredDescription, structuralSimilarity } = require('../core/structured-description');
const { applyDecayToScore, computeFreshnessBoost } = require('../unified/decay');
const { validateCode } = require('../core/validator');
const { checkSemanticConsistency } = require('../core/semantic-consistency');

// Fractal-library bridge (graceful — returns neutral values if unavailable)
// Decision-engine helpers still needed directly; mutation integration moved to FractalStore.
let _holoDecisionBoost, _familyStabilitySignal, _familyDecayModifier;
try {
  ({ holoDecisionBoost: _holoDecisionBoost, familyStabilitySignal: _familyStabilitySignal, familyDecayModifier: _familyDecayModifier } = require('../compression/fractal-library-bridge'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[library:init] fractal-library bridge not available:', e?.message || e);
}

// FractalStore middleware — wraps SQLiteStore so every mutation auto-maintains fractal data.
let FractalStore;
try {
  ({ FractalStore } = require('../store/fractal-store'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[library:init] FractalStore not available:', e?.message || e);
}
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
  TWO_PHASE_SCORING,
} = require('../constants/thresholds');

const PATTERN_FILE = 'pattern-library.json';

// ─── Atomic I/O — ported from Reflector Oracle's patternStore.js ───

const LOCK_DELAYS = [50, 100, 200, 400, 800]; // ms backoff
const STALE_LOCK_MS = 30000; // 30s = assume dead process

/**
 * Synchronous sleep that works in both main thread and workers.
 */
function syncSleep(ms) {
  try {
    const buf = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(buf, 0, 0, ms);
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[library:syncSleep] spin:', e?.message || e);
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

/**
 * Acquire an exclusive lockfile using O_CREAT|O_EXCL (atomic on POSIX).
 * Retries with exponential backoff. Returns an unlock function.
 */
function acquireLock(storeDir, label = 'pattern-library') {
  if (!fs.existsSync(storeDir)) {
    fs.mkdirSync(storeDir, { recursive: true });
  }
  const lockPath = path.join(storeDir, '.pattern-library.lock');
  for (let attempt = 0; attempt <= LOCK_DELAYS.length; attempt++) {
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
      fs.writeFileSync(fd, String(process.pid), 'utf-8');
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(lockPath); } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[library:acquireLock] ok:', e?.message || e); } };
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[library:acquireLock] ok:', e?.message || e);
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          // Atomically claim the stale lock via rename to prevent TOCTOU race
          const stalePath = lockPath + '.stale.' + process.pid;
          try {
            fs.renameSync(lockPath, stalePath);
            fs.unlinkSync(stalePath);
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[library:acquireLock] stale cleanup:', e?.message || e);
            // Another process may have already claimed it — that's fine
          }
          continue;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[library:acquireLock] skipping item:', e?.message || e);
        continue;
      }
      if (attempt < LOCK_DELAYS.length) {
        syncSleep(LOCK_DELAYS[attempt]);
      }
    }
  }
  throw new Error(`Failed to acquire lock for ${label} after ${LOCK_DELAYS.length + 1} attempts — another process may be holding the lock at ${storeDir}`);
}

/**
 * Load JSON with .bak recovery — prevents data loss on corruption.
 */
function loadJSONSafe(filePath, fallback) {
  if (!filePath) return fallback;
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return parsed;
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[library:loadJSONSafe] primary corrupted — try backup:', e?.message || e);
  }

  const bakPath = filePath + '.bak';
  try {
    if (fs.existsSync(bakPath)) {
      const raw = fs.readFileSync(bakPath, 'utf-8');
      const parsed = JSON.parse(raw);
      try { fs.writeFileSync(filePath, raw, 'utf-8'); } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[library:loadJSONSafe] best effort recovery:', e?.message || e);
      }
      return parsed;
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[library:loadJSONSafe] backup also corrupted:', e?.message || e);
  }

  if (!fs.existsSync(filePath) && !fs.existsSync(bakPath)) {
    return fallback;
  }

  return fallback;
}

/**
 * Atomic write: serialize → write .tmp → backup current → rename.
 */
function atomicWriteJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const json = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, json, 'utf-8');
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, filePath + '.bak');
    } catch (e) {
      // Backup failed — warn loudly since .bak recovery won't work if rename crashes
      console.warn(`[library:atomicWriteJSON] WARNING — backup failed for ${path.basename(filePath)}: ${e?.message || e}. Recovery may be incomplete if write is interrupted.`);
    }
  }
  fs.renameSync(tmpPath, filePath);
}

// ─── SERF Output Sanitizer — ported from Reflector Oracle's serfSanitizer.js ───

/**
 * Remove semicolons that break method chain continuations.
 */
function fixChainBreakingSemicolons(code) {
  const lines = code.split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trimEnd();
    if (trimmed.endsWith(';')) {
      let nextIdx = i + 1;
      while (nextIdx < lines.length && lines[nextIdx].trim() === '') nextIdx++;
      if (nextIdx < lines.length && lines[nextIdx].trim().startsWith('.')) {
        line = trimmed.slice(0, -1);
      }
    }
    result.push(line);
  }
  return result.join('\n');
}

/**
 * Remove semicolons inserted after continuation tokens: [ { ( , => || && ?
 */
function fixBracketSemicolons(code) {
  return code.replace(
    /^(.*(?:\[|\{|\(|,|=>|\|\||&&|\?)\s*);(\s*)$/gm,
    '$1$2'
  );
}

/**
 * Sanitize SERF-healed code — fixes known transform bugs before storage.
 */
function sanitizePatternCode(code) {
  if (!code || typeof code !== 'string') return code;
  let result = code;
  result = fixBracketSemicolons(result);
  result = fixChainBreakingSemicolons(result);
  return result;
}

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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[library:tryGetSQLite] SQLite not available — fall back to JSON:', e?.message || e);
  }
  return null;
}

class PatternLibrary {
  constructor(storeDir) {
    this.storeDir = storeDir;
    // Recognize both the toolkit's canonical `pattern-library.json` and the
    // legacy/Standalone `patterns.json` shape. If either file already exists
    // we prefer the file that's on disk so external writers don't get
    // silently shadowed by a fresh SQLite DB.
    const canonicalPath = path.join(storeDir, PATTERN_FILE);
    const legacyPath = path.join(storeDir, 'patterns.json');
    const canonicalExists = fs.existsSync(canonicalPath);
    const legacyExists = fs.existsSync(legacyPath);
    this.libraryPath = canonicalExists
      ? canonicalPath
      : (legacyExists ? legacyPath : canonicalPath);
    this._backend = 'json';

    // Backend selection: if a legacy/canonical JSON file already exists in
    // the storeDir, honor it — the caller (tests, migrations, external
    // tools) is managing persistence as JSON. Only use SQLite when no JSON
    // file is present, so fresh stores get the fast path while existing
    // JSON stores keep working. Closes the silent backend-mismatch where
    // writes to `patterns.json` were invisible to a SQLite-backed reader.
    const jsonExists = canonicalExists || legacyExists;
    const sqlite = jsonExists ? null : tryGetSQLite(storeDir);
    if (sqlite) {
      // Wrap in FractalStore so every mutation auto-maintains embeddings & families.
      // Falls back to raw SQLiteStore if FractalStore is unavailable.
      this._sqlite = FractalStore ? new FractalStore(sqlite) : sqlite;
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
    const fallback = {
      patterns: [],
      meta: { created: new Date().toISOString(), version: 1, decisions: 0 },
    };
    const raw = loadJSONSafe(this.libraryPath, fallback);
    // Tolerate the legacy "raw array" shape that StandalonePatternLibrary and
    // external callers (tests, migrations) write. Both shapes become the
    // wrapped { patterns, meta } object used by the rest of this class.
    if (Array.isArray(raw)) {
      return {
        patterns: raw,
        meta: { created: new Date().toISOString(), version: 1, decisions: 0 },
      };
    }
    if (raw && !Array.isArray(raw.patterns)) {
      raw.patterns = [];
    }
    if (raw && !raw.meta) {
      raw.meta = { created: new Date().toISOString(), version: 1, decisions: 0 };
    }
    return raw;
  }

  /**
   * Write the library, honoring the on-disk shape. If the existing file is
   * a raw array (StandalonePatternLibrary format), write it back as an array
   * so external callers that expect that shape keep working. Otherwise use
   * the wrapped { patterns, meta } shape.
   */
  _writeJSONShapeAware(data) {
    let shape = 'wrapped';
    try {
      if (fs.existsSync(this.libraryPath)) {
        const existing = JSON.parse(fs.readFileSync(this.libraryPath, 'utf-8'));
        if (Array.isArray(existing)) shape = 'array';
      }
    } catch { /* treat as wrapped */ }
    const payload = shape === 'array' ? (data.patterns || []) : data;
    this._writeJSON(payload);
  }

  _writeJSON(data) {
    // Preserve the on-disk shape so legacy raw-array stores (written by
    // StandalonePatternLibrary and external tools) don't get silently
    // upgraded to the wrapped { patterns, meta } shape mid-session, which
    // would break callers reading the file directly.
    let payload = data;
    try {
      if (fs.existsSync(this.libraryPath)) {
        const existing = JSON.parse(fs.readFileSync(this.libraryPath, 'utf-8'));
        if (Array.isArray(existing) && data && Array.isArray(data.patterns)) {
          payload = data.patterns;
        }
      }
    } catch { /* treat as wrapped */ }

    const unlock = acquireLock(this.storeDir);
    try {
      atomicWriteJSON(this.libraryPath, payload);
    } finally {
      unlock();
    }
    // Any write invalidates the ruleId / tag secondary indexes. Next
    // findByRuleId / findByTag / listTags call rebuilds from getAll().
    if (typeof this._invalidateIndexes === 'function') this._invalidateIndexes();
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
    // Any register / update / merge invalidates the rule+tag indexes.
    if (typeof this._invalidateIndexes === 'function') this._invalidateIndexes();
    // Sanitize code before scoring — fixes known SERF transform bugs
    const sanitizedCode = sanitizePatternCode(pattern.code);
    const patternWithCleanCode = { ...pattern, code: sanitizedCode };

    const coherency = computeCoherencyScore(sanitizedCode, {
      language: pattern.language,
      testPassed: pattern.testPassed,
      historicalReliability: pattern.reliability ?? 0.5,
    });

    if (this._backend === 'sqlite') {
      const structured = pattern.structuredDescription || parseStructuredDescription(pattern.description || '', { code: sanitizedCode, tags: pattern.tags || [] });
      const patternData = {
        name: pattern.name,
        code: sanitizedCode,
        language: pattern.language || coherency.language,
        patternType: pattern.patternType || classifyPattern(sanitizedCode, pattern.name),
        complexity: pattern.complexity || inferComplexity(sanitizedCode),
        description: pattern.description || '',
        structuredDescription: structured,
        tags: pattern.tags || [],
        coherencyScore: coherency,
        variants: pattern.variants || [],
        testCode: pattern.testCode || null,
      };
      // Use dedup-safe insert: skip or update if (name, language) already exists.
      // FractalStore.addPatternIfNotExists auto-integrates embeddings & families.
      const record = this._sqlite.addPatternIfNotExists(patternData);
      this._sqlite.incrementDecisions();
      if (!record) {
        // Duplicate with equal/higher coherency — return the existing one
        const existing = this._sqlite.getPatternByName(pattern.name);
        return existing || null;
      }
      return record;
    }

    return this._registerJSON(patternWithCleanCode, coherency);
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

    // Parse request description into structured form for structural matching
    const requestStructured = parseStructuredDescription(description, { tags });

    // ── Two-Phase Scoring ──
    // Phase 1 (Relevance Gate): compute pure relevance from keyword/semantic/structural/holo signals.
    //   Patterns below the gate are skipped — no amount of quality can rescue irrelevance.
    // Phase 2 (Quality Ranking): among passing patterns, blend relevance + quality for final score.

    const store = this._sqlite || (this.store && this.store.getSQLiteStore ? this.store.getSQLiteStore() : null);

    const scored = patterns.map(p => {
      // ── Phase 1: Pure relevance score ──
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
      const normalizedName = (p.name || '').toLowerCase().replace(/[-_]/g, ' ');
      const nameBonus = normalizedDesc.includes(normalizedName) || normalizedName.includes(normalizedDesc) ? DECISION_BONUSES.NAME_MATCH : 0;

      // Structural similarity — part of relevance, not quality
      const patternStructured = p.structuredDescription || parseStructuredDescription(p.description || '', { code: p.code, tags: p.tags || [] });
      const structSim = structuralSimilarity(requestStructured, patternStructured);
      const structuralBoost = structSim > 0.5 ? structSim * 0.10 : 0;

      // Holographic embedding — part of relevance, not quality
      let holoBoost = 0;
      if (_holoDecisionBoost) {
        const holo = _holoDecisionBoost({ description, tags, language }, p, store);
        holoBoost = holo.boost;
      }

      // Pure relevance: semantic match + name affinity + structural + holographic
      // These all answer "is this the right pattern?" — no quality signals allowed here
      const relevanceScore = Math.min(1.0, relevance.relevance + nameBonus + structuralBoost + holoBoost);

      // ── Phase 1 Gate: skip patterns with insufficient relevance ──
      if (relevanceScore < TWO_PHASE_SCORING.PHASE1_GATE) {
        return { pattern: p, relevance: relevance.relevance, relevanceScore, coherency: 0, decayedCoherency: 0, reliability: 0, structuralSimilarity: structSim, holoBoost, qualityScore: 0, composite: 0, gated: true };
      }

      // ── Phase 2: Quality score (only for patterns that passed the gate) ──
      const coherency = p.coherencyScore?.total ?? 0;
      const focusBonus = p.complexity === 'atomic' ? DECISION_BONUSES.ATOMIC_FOCUS : p.complexity === 'composite' ? DECISION_BONUSES.COMPOSITE_FOCUS : 0;

      // Reliability: usage success + bug reports + healing success + community votes
      const usageReliability = p.usageCount > 0 ? p.successCount / p.usageCount : 0.5;
      const bugCount = p.bugReports || 0;
      const bugPenalty = bugCount > 0 ? Math.max(0, 1 - bugCount * BUG_PENALTY_MULTIPLIER) : 1.0;
      const healingRate = typeof this._healingRateProvider === 'function' ? this._healingRateProvider(p.id) : 1.0;
      const weightedScore = p.weightedVoteScore ?? ((p.upvotes || 0) - (p.downvotes || 0));
      const voteBoost = weightedScore > 0 ? Math.min(VOTE_BOOST.MAX, weightedScore * VOTE_BOOST.MULTIPLIER) : Math.max(VOTE_BOOST.MIN, weightedScore * VOTE_BOOST.MULTIPLIER);
      const reliability = usageReliability * bugPenalty * healingRate + voteBoost;
      const cappedReliability = Math.min(reliability, DECISION_WEIGHTS.RELIABILITY_CAP);

      // Confidence decay — penalize stale, reward fresh
      const decayModifier = _familyDecayModifier ? _familyDecayModifier(p.id, store) : 1.0;
      const decayResult = applyDecayToScore(coherency, p, { halfLifeDays: 90 * decayModifier });
      const freshnessBoost = computeFreshnessBoost(p);
      const decayedCoherency = decayResult.adjusted + freshnessBoost;

      // Evolution penalty
      let evolutionPenalty = 0;
      try {
        const { evolutionAdjustment } = require('../evolution/evolution');
        const adj = evolutionAdjustment(p);
        evolutionPenalty = adj.total;
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[library:normalizedName] silent failure:', e?.message || e);
      }

      // Quality score: coherency × reliability × decay × focus — answers "is this pattern any good?"
      const scaledFocusBonus = focusBonus * relevanceScore;
      const qualityScore = Math.min(1.0, Math.max(0, decayedCoherency * DECISION_WEIGHTS.COHERENCY + cappedReliability * DECISION_WEIGHTS.RELIABILITY + scaledFocusBonus - evolutionPenalty) / (DECISION_WEIGHTS.COHERENCY + DECISION_WEIGHTS.RELIABILITY));

      // Final composite: blend relevance (60%) + quality (40%)
      const composite = Math.min(1.0, relevanceScore * TWO_PHASE_SCORING.RELEVANCE_BLEND + qualityScore * TWO_PHASE_SCORING.QUALITY_BLEND);

      return { pattern: p, relevance: relevance.relevance, relevanceScore, coherency, decayedCoherency, reliability, structuralSimilarity: structSim, holoBoost, qualityScore, composite, gated: false };
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
    const evolveThreshold = Math.min(threshold, THRESHOLDS.evolve);
    const altMapper = s => ({ id: s.pattern.id, name: s.pattern.name, composite: s.composite });

    if (best.composite >= threshold && best.relevanceScore >= RELEVANCE_GATES.FOR_PULL) {
      // Hard gate 1: pattern must have test code and tests must pass to PULL
      const testGateResult = this._verifyTestGate(best.pattern);
      if (!testGateResult.passed) {
        // Downgrade to EVOLVE — pattern looks good but tests don't prove it
        if (best.composite >= evolveThreshold && best.relevanceScore >= RELEVANCE_GATES.FOR_EVOLVE) {
          return {
            decision: 'evolve',
            pattern: best.pattern,
            confidence: best.composite,
            reasoning: `Pattern "${best.pattern.name}" scored ${best.composite.toFixed(3)} but failed test gate (${testGateResult.reason}) — downgraded to EVOLVE`,
            alternatives: scored.slice(1, 4).map(altMapper),
            testGate: testGateResult,
          };
        }
        return {
          decision: 'generate',
          pattern: best.pattern,
          confidence: 1.0 - (best.composite || 0),
          reasoning: `Pattern "${best.pattern.name}" scored ${best.composite.toFixed(3)} but failed test gate (${testGateResult.reason}) — generation required`,
          alternatives: scored.slice(1, 4).map(altMapper),
          testGate: testGateResult,
        };
      }

      // Hard gate 2: semantic consistency — name/description must match code behavior
      const semanticResult = checkSemanticConsistency(best.pattern.name, description, best.pattern.code);
      if (semanticResult.score < 0.4) {
        // Severe mismatch — code does something different than what name claims
        if (best.composite >= evolveThreshold && best.relevanceScore >= RELEVANCE_GATES.FOR_EVOLVE) {
          return {
            decision: 'evolve',
            pattern: best.pattern,
            confidence: best.composite * semanticResult.score,
            reasoning: `Pattern "${best.pattern.name}" failed semantic check: ${semanticResult.flags.join('; ')} — downgraded to EVOLVE`,
            alternatives: scored.slice(1, 4).map(altMapper),
            testGate: testGateResult,
            semanticCheck: semanticResult,
          };
        }
        return {
          decision: 'generate',
          pattern: best.pattern,
          confidence: 1.0 - (best.composite || 0),
          reasoning: `Pattern "${best.pattern.name}" failed semantic check: ${semanticResult.flags.join('; ')} — generation required`,
          alternatives: scored.slice(1, 4).map(altMapper),
          testGate: testGateResult,
          semanticCheck: semanticResult,
        };
      }

      return {
        decision: 'pull',
        pattern: best.pattern,
        confidence: best.composite,
        reasoning: `Pattern "${best.pattern.name}" matches with composite score ${best.composite.toFixed(3)} (relevance=${best.relevanceScore.toFixed(3)}, quality=${(best.qualityScore || 0).toFixed(3)}, coherency=${best.coherency.toFixed(3)}, reliability=${best.reliability.toFixed(3)}) — tests verified, semantics consistent`,
        alternatives: scored.slice(1, 4).map(altMapper),
        testGate: testGateResult,
        semanticCheck: semanticResult,
      };
    }

    if (best.composite >= evolveThreshold && best.relevanceScore >= RELEVANCE_GATES.FOR_EVOLVE) {
      return {
        decision: 'evolve',
        pattern: best.pattern,
        confidence: best.composite,
        reasoning: `Pattern "${best.pattern.name}" is a partial match (${best.composite.toFixed(3)}) — can be evolved to fit`,
        alternatives: scored.slice(1, 4).map(altMapper),
      };
    }

    return {
      decision: 'generate',
      pattern: scored.length > 0 ? scored[0].pattern : null,
      confidence: 1.0 - (best.composite || 0),
      reasoning: `Best match "${best.pattern.name}" scored too low (${best.composite.toFixed(3)}) — new pattern needed`,
      alternatives: scored.slice(1, 4).map(altMapper),
    };
  }

  /**
   * Verify test gate for PULL decisions.
   * Pattern must have test code and tests must pass in sandbox.
   * @param {object} pattern - The pattern to verify
   * @returns {{ passed: boolean, reason: string, testOutput?: string }}
   */
  _verifyTestGate(pattern) {
    if (!pattern.testCode) {
      // Trust the registration flag or coherency testProof if tests were validated externally
      if (pattern.testPassed === true || pattern.coherencyScore?.breakdown?.testProof === 1.0) {
        return { passed: true, reason: 'Test passed at registration (no inline test code)' };
      }
      return { passed: false, reason: 'No test code — pattern has no test proof' };
    }
    try {
      const result = validateCode(pattern.code, {
        language: pattern.language,
        testCode: pattern.testCode,
        threshold: 0, // We only care about test execution, not coherency here
        skipCovenant: true, // Already passed covenant at registration time
        sandbox: true,
      });
      if (result.testPassed === true) {
        return { passed: true, reason: 'Tests passed in sandbox', testOutput: result.testOutput };
      }
      return { passed: false, reason: `Tests failed: ${result.testOutput || 'unknown error'}`, testOutput: result.testOutput };
    } catch (err) {
      return { passed: false, reason: `Test execution error: ${err.message}` };
    }
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
    const pattern = this._backend === 'sqlite'
      ? this._sqlite.getPattern(id)
      : this.getAll().find(p => p.id === id);
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
    const pattern = this._backend === 'sqlite'
      ? this._sqlite.getPattern(id)
      : this.getAll().find(p => p.id === id);
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
      usageCount: pattern.usageCount ?? 0,
      successCount: pattern.successCount ?? 0,
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
   * Find patterns by rule id. Looks at three places, in order of
   * precedence:
   *
   *   1. p.ruleId / p.rule       — explicit association
   *   2. p.metadata.ruleId        — namespaced metadata
   *   3. tags that start with 'rule:'   — `rule:type/division-by-zero`
   *
   * Memoized per library instance. The cache is invalidated on any
   * mutation (register, mergePatterns, update, retire).
   *
   * Used by `audit explain` to surface concrete library patterns that
   * exemplify a rule's fix, and by `heal generate` to pull a proven
   * pattern when structural auto-fix can't handle a finding.
   */
  findByRuleId(ruleId) {
    if (!ruleId) return [];
    if (!this._ruleIndex) this._buildSecondaryIndexes();
    return this._ruleIndex.get(ruleId) || [];
  }

  /**
   * Find patterns by tag (case-insensitive). Memoized.
   */
  findByTag(tag) {
    if (!tag) return [];
    if (!this._tagIndex) this._buildSecondaryIndexes();
    return this._tagIndex.get(tag.toLowerCase()) || [];
  }

  /**
   * List all known tags and their frequencies.
   */
  listTags() {
    if (!this._tagIndex) this._buildSecondaryIndexes();
    const out = [];
    for (const [tag, patterns] of this._tagIndex.entries()) {
      out.push({ tag, count: patterns.length });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  /**
   * Rebuild the secondary indexes from scratch. Called lazily on first
   * findByRuleId/findByTag, and invalidated by mutating methods.
   */
  _buildSecondaryIndexes() {
    this._ruleIndex = new Map();
    this._tagIndex = new Map();
    for (const p of this.getAll()) {
      // Rule id
      const ruleIds = [];
      if (p.ruleId) ruleIds.push(p.ruleId);
      if (p.rule) ruleIds.push(p.rule);
      if (p.metadata && p.metadata.ruleId) ruleIds.push(p.metadata.ruleId);
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) {
          if (typeof t === 'string' && t.startsWith('rule:')) {
            ruleIds.push(t.slice(5));
          }
        }
      }
      for (const rid of ruleIds) {
        const arr = this._ruleIndex.get(rid) || [];
        arr.push(p);
        this._ruleIndex.set(rid, arr);
      }
      // Tags
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) {
          if (typeof t !== 'string') continue;
          const key = t.toLowerCase();
          const arr = this._tagIndex.get(key) || [];
          arr.push(p);
          this._tagIndex.set(key, arr);
        }
      }
    }
  }

  /**
   * Invalidate the secondary indexes after a mutation.
   */
  _invalidateIndexes() {
    this._ruleIndex = null;
    this._tagIndex = null;
  }

  /**
   * Update a pattern's fields by ID.
   * @param {string} id - Pattern ID
   * @param {object} updates - Object with fields to update
   * @returns {object|null} Updated pattern record or null if not found
   */
  update(id, updates) {
    if (typeof this._invalidateIndexes === 'function') this._invalidateIndexes();
    if (this._backend === 'sqlite') {
      return this._sqlite.updatePattern(id, updates);
    }
    // JSON fallback
    const data = this._readJSON();
    const pattern = data.patterns.find(p => p.id === id);
    if (!pattern) return null;
    // Build a new object from the existing + updates so we don't mutate
    // the shared reference before committing. Write-through still goes via
    // _writeJSON() which handles locking + atomic persistence.
    const merged = Object.assign({}, pattern, updates, { updatedAt: new Date().toISOString() });
    const idx = data.patterns.indexOf(pattern);
    data.patterns[idx] = merged;
    this._writeJSON(data);
    return merged;
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
    return loadJSONSafe(p, { candidates: [] });
  }

  _writeCandidatesJSON(data) {
    const unlock = acquireLock(this.storeDir);
    try {
      atomicWriteJSON(this._candidatesPath(), data);
    } finally {
      unlock();
    }
  }

  _addCandidateJSON(candidate) {
    const data = this._readCandidatesJSON();
    const cleanCode = sanitizePatternCode(candidate.code);
    const id = this._hash(cleanCode + candidate.name + Date.now());
    const now = new Date().toISOString();
    const record = {
      id,
      name: candidate.name,
      code: cleanCode,
      language: candidate.language || 'unknown',
      patternType: candidate.patternType || 'utility',
      complexity: candidate.complexity || inferComplexity(cleanCode || ''),
      description: candidate.description || '',
      tags: candidate.tags || [],
      coherencyTotal: candidate.coherencyTotal ?? candidate.coherencyScore?.total ?? 0,
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

    if (!pattern) return { composed: false, reason: 'Registration failed — possible duplicate' };
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
    const structured = pattern.structuredDescription || parseStructuredDescription(pattern.description || '', { code: pattern.code, tags: pattern.tags || [] });
    const record = {
      id,
      name: pattern.name,
      code: pattern.code,
      language: pattern.language || coherency.language,
      patternType: pattern.patternType || classifyPattern(pattern.code, pattern.name),
      complexity: pattern.complexity || inferComplexity(pattern.code),
      description: pattern.description || '',
      structuredDescription: structured,
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
    pattern.usageCount = (pattern.usageCount ?? 0) + 1;
    if (succeeded) pattern.successCount = (pattern.successCount ?? 0) + 1;
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
    const retired = [];
    data.patterns = data.patterns.filter(p => {
      const coherency = p.coherencyScore?.total ?? 0;
      const reliability = (p.usageCount ?? 0) > 0 ? (p.successCount ?? 0) / p.usageCount : 0.5;
      const keep = (coherency * RETIREMENT_WEIGHTS.COHERENCY + reliability * RETIREMENT_WEIGHTS.RELIABILITY) >= minScore;
      if (!keep) retired.push(p);
      return keep;
    });
    // Archive retired patterns for potential recovery
    if (!data.archive) data.archive = [];
    for (const p of retired) {
      data.archive.push({ ...p, retiredAt: new Date().toISOString() });
    }
    this._writeJSON(data);
    return { retired: retired.length, remaining: data.patterns.length };
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

  // ─── Consolidation — deduplicate and merge patterns ───

  /**
   * Deduplicate patterns by name, keeping the highest-coherency version.
   * Ported from Reflector Oracle's patternSync.js.
   * @returns {object} { removed: number, remaining: number }
   */
  consolidate() {
    if (this._backend === 'sqlite') {
      // SQLite already enforces dedup via addPatternIfNotExists
      return { removed: 0, remaining: this.getAll().length };
    }

    const data = this._readJSON();
    const before = data.patterns.length;
    data.patterns = deduplicatePatterns(data.patterns);
    this._writeJSON(data);
    return { removed: before - data.patterns.length, remaining: data.patterns.length };
  }

  /**
   * Merge external patterns into the library, deduplicating by name.
   * Higher coherency score wins. Ported from Reflector Oracle's patternSync.js.
   * @param {Array} incoming - Array of pattern objects to merge
   * @returns {object} { added: number, updated: number }
   */
  mergePatterns(incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return { added: 0, updated: 0 };
    }
    if (typeof this._invalidateIndexes === 'function') this._invalidateIndexes();

    if (this._backend === 'sqlite') {
      let added = 0, updated = 0, skipped = 0;
      for (const p of incoming) {
        if (!p || !p.name) { skipped++; continue; }
        const existing = this._sqlite.getPatternByName(p.name);
        const result = this._sqlite.addPatternIfNotExists(p);
        if (result && !existing) added++;
        else if (result && existing) updated++;
        else skipped++;
      }
      return { added, updated, skipped };
    }

    const data = this._readJSON();
    const existingByName = new Map();
    for (let i = 0; i < data.patterns.length; i++) {
      const p = data.patterns[i];
      if (p.name) existingByName.set(p.name.toLowerCase(), i);
    }

    let added = 0, updated = 0;
    for (const p of incoming) {
      if (!p.name) continue;
      const cleanCode = sanitizePatternCode(p.code);
      const key = p.name.toLowerCase();
      const existingIdx = existingByName.get(key);

      if (existingIdx != null) {
        const existing = data.patterns[existingIdx];
        const newScore = p.coherencyScore?.total ?? 0;
        const oldScore = existing.coherencyScore?.total ?? 0;
        if (newScore > oldScore) {
          Object.assign(existing, p, { code: cleanCode, updatedAt: new Date().toISOString() });
          updated++;
        }
      } else {
        data.patterns.push({ ...p, code: cleanCode, createdAt: new Date().toISOString() });
        existingByName.set(key, data.patterns.length - 1);
        added++;
      }
    }

    this._writeJSON(data);
    return { added, updated };
  }

  /**
   * Health check — validates library integrity and repairs if needed.
   * @returns {object} { healthy: boolean, issues: string[], repaired: string[] }
   */
  healthCheck() {
    const issues = [];
    const repaired = [];

    if (this._backend === 'sqlite') {
      return { healthy: true, issues: [], repaired: [] };
    }

    // Check file readability
    let data;
    try {
      data = this._readJSON();
    } catch (err) {
      issues.push(`Library file corrupt: ${err.message}`);
      // Attempt backup recovery already handled by loadJSONSafe
      return { healthy: false, issues, repaired };
    }

    // Check for patterns without names
    const unnamed = data.patterns.filter(p => !p.name);
    if (unnamed.length > 0) {
      issues.push(`${unnamed.length} pattern(s) without names`);
    }

    // Check for duplicate names
    const names = new Map();
    for (const p of data.patterns) {
      if (!p.name) continue;
      const key = p.name.toLowerCase();
      if (names.has(key)) {
        issues.push(`Duplicate pattern name: ${p.name}`);
      } else {
        names.set(key, p);
      }
    }

    // Auto-repair: deduplicate if needed
    if (issues.some(i => i.startsWith('Duplicate'))) {
      const before = data.patterns.length;
      data.patterns = deduplicatePatterns(data.patterns);
      this._writeJSON(data);
      repaired.push(`Deduplicated ${before - data.patterns.length} patterns`);
    }

    return { healthy: issues.length === 0 || issues.length <= repaired.length, issues, repaired };
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

/**
 * Deduplicate patterns by name, keeping the highest coherency score.
 * Ported from Reflector Oracle's patternSync.js.
 */
function deduplicatePatterns(patterns) {
  const byNameLang = new Map();
  for (const p of patterns) {
    if (!p.name) continue;
    // Include language in key to preserve valid cross-language variants
    const key = `${p.name.toLowerCase()}:${(p.language || 'unknown').toLowerCase()}`;
    const existing = byNameLang.get(key);
    if (!existing) {
      byNameLang.set(key, p);
    } else if ((p.coherencyScore?.total ?? 0) > (existing.coherencyScore?.total ?? 0)) {
      // Merge: take better code/scores from p, but preserve usage history from existing
      byNameLang.set(key, {
        ...p,
        id: existing.id,
        usageCount: existing.usageCount ?? p.usageCount ?? 0,
        successCount: existing.successCount ?? p.successCount ?? 0,
        bugReports: existing.bugReports ?? p.bugReports ?? 0,
        createdAt: existing.createdAt || p.createdAt,
      });
    }
  }
  // Preserve unnamed patterns too
  const unnamed = patterns.filter(p => !p.name);
  return [...byNameLang.values(), ...unnamed];
}

const { countBy } = require('../store/store-helpers');

module.exports = {
  PatternLibrary,
  classifyPattern,
  inferComplexity,
  deduplicatePatterns,
  sanitizePatternCode,
  THRESHOLDS,
  PATTERN_TYPES,
  COMPLEXITY_TIERS,
};
