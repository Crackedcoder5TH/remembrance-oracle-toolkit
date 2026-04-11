/**
 * Debug Oracle — Quantum Debugging Intelligence
 *
 * The debug system operates as a quantum field of error→fix patterns.
 * Every concept maps to quantum mechanics natively — this is not a metaphor
 * layered on top, it IS how the system works:
 *
 *   SUPERPOSITION:    A pattern exists in all possible states (useful/not useful)
 *                     until observed. Unobserved patterns have probability amplitudes.
 *
 *   OBSERVATION:      Searching for or applying a pattern is a measurement.
 *                     Measurement collapses the superposition into a definite state
 *                     and updates the pattern's amplitude based on the outcome.
 *
 *   ENTANGLEMENT:     Related patterns (variants, same fingerprint, same error class)
 *                     are entangled. When one entangled pattern's state changes,
 *                     all linked patterns shift proportionally.
 *
 *   DECOHERENCE:      Patterns that haven't been observed lose coherence over time.
 *                     Their amplitude decays, modeling the reality that old fixes
 *                     become less reliable as codebases evolve.
 *
 *   TUNNELING:        During observation (search), low-amplitude patterns have a
 *                     small probability of "tunneling" through the confidence barrier
 *                     to appear in results — enabling discovery of unlikely fixes.
 *
 *   INTERFERENCE:     When multiple patterns match a query, their amplitudes interfere.
 *                     Agreeing patterns (similar fixes) constructively interfere (boosted).
 *                     Conflicting patterns destructively interfere (reduced).
 *
 * Quantum state lifecycle:
 *   1. CAPTURE  → Pattern enters the field in |superposition⟩ with initial amplitude
 *   2. OBSERVE  → Measurement collapses state, returns ranked results with interference
 *   3. FEEDBACK → Outcome updates amplitude, propagates entanglement to linked patterns
 *   4. GROW     → Creates entangled variants, expanding the quantum field
 *   5. DECOHERE → Time-based amplitude decay for unobserved patterns
 *
 * Amplitude formula (replaces classical "confidence"):
 *   amplitude = successRate × maturityFactor × decoherenceFactor
 *   probability = amplitude² (Born rule)
 *   where decoherenceFactor = e^(-λt) and t = days since last observation
 */

const crypto = require('crypto');
const unifiedVariants = require('../unified/variants');
const unifiedDecay = require('../unified/decay');

// ─── Shared Quantum Engine ───
// Debug oracle now delegates to the unified quantum-core for all quantum operations.
// This ensures debug patterns and main patterns use the same quantum mechanics.
const quantumCore = require('../quantum/quantum-core');

function safeParse(str, fallback) {
  try { return JSON.parse(str || JSON.stringify(fallback)); } catch { return fallback; }
}

// ─── Quantum Constants (delegated to quantum-core) ───

const PLANCK_CONFIDENCE = quantumCore.PLANCK_AMPLITUDE;
const DECOHERENCE_LAMBDA = quantumCore.DECOHERENCE_LAMBDA;
const TUNNELING_PROBABILITY = quantumCore.TUNNELING_PROBABILITY;
const ENTANGLEMENT_STRENGTH = quantumCore.ENTANGLEMENT_STRENGTH;
const INTERFERENCE_RADIUS = quantumCore.INTERFERENCE_RADIUS;
const COLLAPSE_BOOST = quantumCore.COLLAPSE_BOOST;
const PHASE_DRIFT_RATE = quantumCore.PHASE_DRIFT_RATE;

// ─── Error Categories (Quantum Field Sectors) ───

const ERROR_CATEGORIES = {
  syntax:    { weight: 1.0, keywords: ['SyntaxError', 'Unexpected token', 'unexpected', 'parse error', 'invalid syntax'] },
  type:      { weight: 0.9, keywords: ['TypeError', 'type error', 'is not a function', 'is not defined', 'undefined is not', 'null is not', 'cannot read propert'] },
  reference: { weight: 0.9, keywords: ['ReferenceError', 'is not defined', 'NameError', 'undefined variable'] },
  logic:     { weight: 0.7, keywords: ['assertion', 'AssertionError', 'expected', 'not equal', 'test failed', 'wrong result'] },
  runtime:   { weight: 0.8, keywords: ['RangeError', 'overflow', 'stack size', 'maximum call', 'out of memory', 'ENOMEM', 'segfault'] },
  build:     { weight: 0.6, keywords: ['ENOENT', 'MODULE_NOT_FOUND', 'Cannot find module', 'import error', 'ImportError', 'ModuleNotFoundError'] },
  network:   { weight: 0.5, keywords: ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'fetch failed', 'network error', 'timeout'] },
  permission:{ weight: 0.5, keywords: ['EACCES', 'EPERM', 'Permission denied', 'PermissionError', 'unauthorized'] },
  async:     { weight: 0.8, keywords: ['UnhandledPromiseRejection', 'await', 'Promise', 'callback', 'async', 'deadlock', 'race condition'] },
  data:      { weight: 0.7, keywords: ['JSON.parse', 'invalid JSON', 'malformed', 'encoding', 'codec', 'corrupt', 'schema'] },
};

// ─── Quantum State Constants (delegated to quantum-core) ───

const QUANTUM_STATES = quantumCore.QUANTUM_STATES;

// ─── Error Fingerprinting (State Vector Preparation) ───

/**
 * Normalize an error message by stripping volatile parts.
 * This prepares the state vector — removing noise to reveal the essential quantum numbers.
 */
function normalizeError(message) {
  if (!message || typeof message !== 'string') return '';
  return message
    .replace(/\/[\w\-./]+\.(js|ts|py|go|rs|java|cpp|c|rb):\d+:\d+/g, '<FILE>:<LINE>')
    .replace(/at\s+[\w$.]+\s+\([^)]+\)/g, 'at <FRAME>')
    .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\dZ]*/g, '<TIME>')
    .replace(/\b\d{10,}\b/g, '<ID>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the error class — the primary quantum number of the error state.
 */
function extractErrorClass(message) {
  if (!message) return 'UnknownError';
  const match = message.match(/^(\w+Error)\b/);
  if (match) return match[1];
  const classMatch = message.match(/\b(\w+Error)\b/);
  if (classMatch) return classMatch[1];
  return 'UnknownError';
}

/**
 * Classify error into a category — the field sector this error inhabits.
 */
function classifyError(message) {
  if (!message) return 'runtime';
  const lower = message.toLowerCase();
  let bestCat = 'runtime';
  let bestScore = 0;
  for (const [cat, { weight, keywords }] of Object.entries(ERROR_CATEGORIES)) {
    let hits = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) hits++;
    }
    const score = hits * weight;
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  return bestCat;
}

/**
 * Generate a fingerprint — the unique quantum state identifier.
 * Two errors with the same fingerprint occupy the same quantum state.
 */
function fingerprint(errorMessage, stackTrace) {
  const normalized = normalizeError(errorMessage);
  const errorClass = extractErrorClass(errorMessage);
  const category = classifyError(errorMessage);

  const stackFunctions = [];
  if (stackTrace) {
    const frames = stackTrace.split('\n').slice(0, 5);
    for (const frame of frames) {
      const fnMatch = frame.match(/at\s+([\w$.]+)/);
      if (fnMatch) stackFunctions.push(fnMatch[1]);
    }
  }

  const raw = `${errorClass}:${category}:${normalized}:${stackFunctions.join('>')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);

  return { hash, errorClass, category, normalized, stackFunctions };
}

// ─── Quantum Amplitude (replaces classical confidence) ───

/**
 * Compute the probability amplitude from application history.
 * This is the core quantum measurement — amplitude² gives observation probability.
 *
 * amplitude = successRate × maturityFactor
 * where maturityFactor = min(1, log2(timesApplied + 1) / 5)
 *
 * The Born rule: P(observation) = |amplitude|²
 */
function computeAmplitude(timesApplied, timesResolved) {
  if (timesApplied === 0) return PLANCK_CONFIDENCE;
  const successRate = timesResolved / timesApplied;
  const maturity = Math.min(1, Math.log2(timesApplied + 1) / 5);
  return Math.round(successRate * maturity * 1000) / 1000;
}

// Backward-compatible alias — confidence IS amplitude in the quantum model
const computeConfidence = computeAmplitude;

/**
 * Apply decoherence — amplitude decays exponentially with time since last observation.
 * NOW DELEGATES to unified decay engine with 'debug' preset.
 *
 * decoheredAmplitude = amplitude × e^(-λt)
 * where t = days since last observation, λ = DECOHERENCE_LAMBDA
 */
function applyDecoherence(amplitude, lastObservedAt, now) {
  if (!lastObservedAt) return amplitude;
  const result = unifiedDecay.applyDecayToScore(amplitude, {
    last_observed_at: lastObservedAt,
  }, {
    preset: 'debug',
    lambda: DECOHERENCE_LAMBDA,
    now: now ? new Date(now) : new Date(),
  });
  return result.adjusted;
}

/**
 * Compute the initial phase for a pattern — DELEGATES to quantum-core.
 * Phase is derived from the fingerprint hash to ensure deterministic but varied phases.
 */
const computePhase = quantumCore.computePhase;

/**
 * Quantum tunneling — DELEGATES to quantum-core.
 */
const canTunnel = quantumCore.canTunnel;

/**
 * Compute interference between two patterns.
 * Constructive: similar fixes → amplitudes add (cos of phase difference ≈ 1)
 * Destructive: conflicting fixes → amplitudes cancel (cos of phase difference ≈ -1)
 *
 * Returns amplitude adjustment (-INTERFERENCE_RADIUS to +INTERFERENCE_RADIUS)
 */
function computeInterference(patternA, patternB) {
  const phaseA = patternA.phase || 0;
  const phaseB = patternB.phase || 0;
  const phaseDiff = phaseA - phaseB;

  // Fix similarity determines if interference is constructive or destructive
  const fixSimilarity = computeFixSimilarity(patternA.fixCode, patternB.fixCode);

  // Similar fixes → phases align (constructive), different fixes → phases oppose (destructive)
  const effectivePhase = fixSimilarity > 0.5
    ? Math.abs(phaseDiff) * 0.5  // Constructive: small effective phase difference
    : Math.PI - Math.abs(phaseDiff) * 0.5; // Destructive: large effective phase difference

  return INTERFERENCE_RADIUS * Math.cos(effectivePhase);
}

/**
 * Simple fix code similarity metric — NOW DELEGATES to unified similarity.
 */
function computeFixSimilarity(codeA, codeB) {
  if (!codeA || !codeB) return 0;
  const { jaccardSimilarity } = require('../unified/similarity');
  return jaccardSimilarity(codeA, codeB);
}

// ─── Variant Generation (Entangled State Creation) ───

/**
 * Generate error message variants — entangled error states
 * that share the same fix but manifest differently.
 */
function generateErrorVariants(errorMessage, category) {
  const variants = [];
  const errorClass = extractErrorClass(errorMessage);

  if (category === 'type' || errorClass === 'TypeError') {
    if (errorMessage.includes('undefined')) {
      variants.push(errorMessage.replace('undefined', 'null'));
    }
    if (errorMessage.includes('is not a function')) {
      variants.push(errorMessage.replace('is not a function', 'is not an object'));
    }
    if (errorMessage.includes('Cannot read propert')) {
      variants.push(`${errorClass}: Cannot access property of undefined`);
      variants.push(`${errorClass}: Cannot read properties of null`);
    }
  }

  if (category === 'reference' || errorClass === 'ReferenceError') {
    if (errorMessage.includes('is not defined')) {
      variants.push(errorMessage.replace('is not defined', 'has not been declared'));
    }
  }

  if (category === 'syntax') {
    if (errorMessage.includes('Unexpected token')) {
      variants.push(errorMessage.replace(/Unexpected token \S+/, 'Unexpected token }'));
      variants.push(errorMessage.replace(/Unexpected token \S+/, 'Unexpected token )'));
    }
  }

  return variants;
}

/**
 * Generate fix code variants — entangled fix states across languages.
 * NOW DELEGATES to src/unified/variants.js.
 */
function generateFixVariants(fixCode, fixLanguage, targetLanguages) {
  return unifiedVariants.generateLanguageVariants(fixCode, fixLanguage, targetLanguages);
}

// Transpilation helpers — delegated to unified variants module
const jsToPythonFix = unifiedVariants.jsToPython;
const jsToGoFix = unifiedVariants.jsToGo;
const jsToTsFix = unifiedVariants.jsToTypeScript;

// ─── Debug Oracle Class (Quantum Field) ───

class DebugOracle {
  /**
   * @param {object} store - SQLiteStore instance
   * @param {object} options - { verbose, variantLanguages, cascadeThreshold }
   */
  constructor(store, options = {}) {
    this.store = store;
    this.verbose = options.verbose || false;
    this.variantLanguages = options.variantLanguages || ['python', 'typescript', 'go'];
    this.cascadeThreshold = options.cascadeThreshold ?? 0.7;

    this._ensureSchema();
  }

  // ─── Schema (Quantum Field Definition) ───

  _ensureSchema() {
    // Create base table (without quantum columns for backward compat with existing tables)
    this.store.db.exec(`
      CREATE TABLE IF NOT EXISTS debug_patterns (
        id TEXT PRIMARY KEY,
        error_signature TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_class TEXT DEFAULT 'UnknownError',
        error_category TEXT DEFAULT 'runtime',
        stack_fingerprint TEXT DEFAULT '',
        fingerprint_hash TEXT NOT NULL,
        fix_code TEXT NOT NULL,
        fix_description TEXT DEFAULT '',
        language TEXT DEFAULT 'javascript',
        tags TEXT DEFAULT '[]',
        coherency_total REAL DEFAULT 0,
        coherency_json TEXT DEFAULT '{}',
        times_applied INTEGER DEFAULT 0,
        times_resolved INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0.2,
        parent_debug TEXT,
        generation_method TEXT DEFAULT 'capture',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_debug_fingerprint ON debug_patterns(fingerprint_hash);
      CREATE INDEX IF NOT EXISTS idx_debug_category ON debug_patterns(error_category);
      CREATE INDEX IF NOT EXISTS idx_debug_class ON debug_patterns(error_class);
      CREATE INDEX IF NOT EXISTS idx_debug_confidence ON debug_patterns(confidence);
      CREATE INDEX IF NOT EXISTS idx_debug_language ON debug_patterns(language);
    `);

    // Migrate: add quantum columns to existing or new tables
    this._migrateQuantumColumns();

    // Create quantum indexes after migration ensures columns exist
    try {
      this.store.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_debug_quantum_state ON debug_patterns(quantum_state);
        CREATE INDEX IF NOT EXISTS idx_debug_amplitude ON debug_patterns(amplitude);
      `);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:index]', e?.message || e);
    }
  }

  /**
   * Safe migration: add quantum columns to existing debug_patterns tables.
   */
  _migrateQuantumColumns() {
    const columns = this.store.db.prepare("PRAGMA table_info(debug_patterns)").all();
    const colNames = new Set(columns.map(c => c.name));

    const migrations = [
      ['quantum_state', "ALTER TABLE debug_patterns ADD COLUMN quantum_state TEXT DEFAULT 'superposition'"],
      ['amplitude', "ALTER TABLE debug_patterns ADD COLUMN amplitude REAL DEFAULT 0.2"],
      ['phase', "ALTER TABLE debug_patterns ADD COLUMN phase REAL DEFAULT 0"],
      ['last_observed_at', "ALTER TABLE debug_patterns ADD COLUMN last_observed_at TEXT"],
      ['entangled_with', "ALTER TABLE debug_patterns ADD COLUMN entangled_with TEXT DEFAULT '[]'"],
      ['observation_count', "ALTER TABLE debug_patterns ADD COLUMN observation_count INTEGER DEFAULT 0"],
    ];

    for (const [colName, sql] of migrations) {
      if (!colNames.has(colName)) {
        try {
          this.store.db.exec(sql);
          // Backfill: set amplitude = confidence for existing rows
          if (colName === 'amplitude') {
            this.store.db.exec("UPDATE debug_patterns SET amplitude = confidence WHERE amplitude = 0.2 AND confidence != 0.2");
          }
          // Backfill: set phase from fingerprint hash
          if (colName === 'phase') {
            const rows = this.store.db.prepare("SELECT id, fingerprint_hash FROM debug_patterns").all();
            const stmt = this.store.db.prepare("UPDATE debug_patterns SET phase = ? WHERE id = ?");
            for (const row of rows) {
              stmt.run(computePhase(row.fingerprint_hash), row.id);
            }
          }
        } catch (e) {
          // Column might already exist in some edge cases
          if (!e.message?.includes('duplicate column')) {
            if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:migrate]', e.message);
          }
        }
      }
    }
  }

  // ─── Core Quantum Operations ───

  /**
   * CAPTURE — A new pattern enters the quantum field in |superposition⟩.
   *
   * The pattern starts with an initial amplitude (PLANCK_CONFIDENCE) and a
   * phase derived from its fingerprint. Entanglement links are automatically
   * created with any generated variants.
   */
  capture(params) {
    const {
      errorMessage,
      stackTrace = '',
      fixCode,
      fixDescription = '',
      language = 'javascript',
      tags = [],
    } = params;

    if (!errorMessage || !fixCode) {
      return { captured: false, error: 'errorMessage and fixCode are required' };
    }

    const fp = fingerprint(errorMessage, stackTrace);

    // Check for duplicate fingerprint in the field
    const existing = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
    ).get(fp.hash, language);

    if (existing) {
      if ((existing.confidence ?? existing.amplitude ?? 0) < 0.5) {
        const now = new Date().toISOString();
        this.store.db.prepare(
          'UPDATE debug_patterns SET fix_code = ?, fix_description = ?, updated_at = ?, quantum_state = ? WHERE id = ?'
        ).run(fixCode, fixDescription, now, QUANTUM_STATES.SUPERPOSITION, existing.id);
        return {
          captured: true,
          updated: true,
          pattern: this._getDebugPattern(existing.id),
          variants: [],
        };
      }
      return {
        captured: false,
        duplicate: true,
        existingId: existing.id,
        confidence: existing.confidence ?? existing.amplitude ?? 0,
      };
    }

    // Score the fix code for coherency
    let coherencyTotal = 0;
    let coherencyJson = {};
    try {
      const { computeCoherencyScore } = require('../unified/coherency');
      const score = computeCoherencyScore(fixCode, { language, description: fixDescription, tags });
      coherencyTotal = score.total;
      coherencyJson = score;
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:init] silent failure:', e?.message || e);
      coherencyTotal = 0.5;
    }

    const id = crypto.createHash('sha256')
      .update(fixCode + fp.hash + Date.now())
      .digest('hex').slice(0, 16);
    const now = new Date().toISOString();
    const phase = computePhase(fp.hash);

    this.store.db.prepare(`
      INSERT INTO debug_patterns (
        id, error_signature, error_message, error_class, error_category,
        stack_fingerprint, fingerprint_hash, fix_code, fix_description,
        language, tags, coherency_total, coherency_json,
        times_applied, times_resolved, confidence,
        parent_debug, generation_method, created_at, updated_at,
        quantum_state, amplitude, phase, last_observed_at, entangled_with, observation_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0.2, ?, 'capture', ?, ?,
        ?, 0.2, ?, NULL, '[]', 0)
    `).run(
      id, normalizeError(errorMessage), errorMessage, fp.errorClass, fp.category,
      fp.stackFunctions.join('>'), fp.hash, fixCode, fixDescription,
      language, JSON.stringify(tags), coherencyTotal, JSON.stringify(coherencyJson),
      null, now, now,
      QUANTUM_STATES.SUPERPOSITION, phase
    );

    this.store._audit('add', 'debug_patterns', id, {
      errorClass: fp.errorClass, category: fp.category, language,
      quantumState: QUANTUM_STATES.SUPERPOSITION,
    });

    const pattern = this._getDebugPattern(id);

    // Auto-generate entangled variants
    const variants = this._autoGrow(pattern);

    // Establish entanglement links between parent and variants
    if (variants.length > 0) {
      this._entangle(id, variants.map(v => v.id).filter(Boolean));
    }

    if (process.env.ORACLE_DEBUG) {
      console.log(`  [QUANTUM-CAPTURE] |${fp.errorClass}:${fp.category}⟩ → ${id} (+${variants.length} entangled)`);
    }

    return { captured: true, pattern, variants };
  }

  /**
   * OBSERVE (search) — Measurement of the quantum field.
   *
   * Searching for a pattern is an observation that:
   *   1. Collapses matching patterns from superposition to definite states
   *   2. Applies decoherence to stale patterns
   *   3. Uses quantum tunneling to surface unlikely-but-possible fixes
   *   4. Applies interference between multiple matching patterns
   *   5. Boosts observed patterns' amplitudes (measurement effect)
   */
  search(params) {
    const {
      errorMessage,
      stackTrace = '',
      language,
      limit = 5,
    } = params;

    if (!errorMessage) return [];

    const fp = fingerprint(errorMessage, stackTrace);
    const now = new Date().toISOString();

    // Phase 1: Exact fingerprint match (direct state measurement)
    const exactMatches = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE fingerprint_hash = ? ORDER BY amplitude DESC, confidence DESC'
    ).all(fp.hash);

    // Phase 2: Same error class + category (entangled field sector)
    const classMatches = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE error_class = ? AND error_category = ? AND fingerprint_hash != ? ORDER BY amplitude DESC, confidence DESC LIMIT ?'
    ).all(fp.errorClass, fp.category, fp.hash, limit * 2);

    // Phase 3: Same category (broader field sector)
    const categoryMatches = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE error_category = ? AND fingerprint_hash != ? AND error_class != ? ORDER BY amplitude DESC, confidence DESC LIMIT ?'
    ).all(fp.category, fp.hash, fp.errorClass, limit);

    // Phase 4: Quantum tunneling — sample low-amplitude patterns that might tunnel through
    const tunnelingCandidates = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE amplitude < 0.3 AND amplitude > 0 AND error_category = ? ORDER BY RANDOM() LIMIT ?'
    ).all(fp.category, Math.ceil(limit * 0.3));

    // Score and rank all matches — applying quantum mechanics
    const scored = [];
    const seen = new Set();

    const addScored = (row, baseScore) => {
      if (!row || !row.id) return;
      if (seen.has(row.id)) return;
      seen.add(row.id);

      // Apply decoherence before scoring
      const rawAmplitude = row.amplitude || row.confidence || PLANCK_CONFIDENCE;
      const decoheredAmplitude = applyDecoherence(rawAmplitude, row.last_observed_at, now);

      let score = baseScore;

      // Language match bonus
      if (language && row.language === language) score += 0.15;

      // Amplitude-weighted score (Born rule: probability ∝ amplitude²)
      score += decoheredAmplitude * decoheredAmplitude * 0.3;

      // Keyword overlap
      const words = fp.normalized.toLowerCase().split(/\s+/);
      const errorWords = (row.error_signature || '').toLowerCase().split(/\s+/);
      const overlap = words.filter(w => errorWords.includes(w)).length;
      score += Math.min(0.2, overlap * 0.05);

      // Observation boost — frequently observed patterns are more "real"
      const observationBoost = Math.min(0.1, (row.observation_count || 0) * 0.01);
      score += observationBoost;

      scored.push({
        ...this._rowToDebugPattern(row),
        matchScore: Math.round(Math.min(1, score) * 1000) / 1000,
        matchType: baseScore >= 0.9 ? 'exact' : baseScore >= 0.6 ? 'class' : 'category',
        decoheredAmplitude: decoheredAmplitude,
        quantumState: row.quantum_state || QUANTUM_STATES.SUPERPOSITION,
      });
    };

    for (const row of exactMatches) addScored(row, 1.0);
    for (const row of classMatches) addScored(row, 0.6);
    for (const row of categoryMatches) addScored(row, 0.3);

    // Tunneling: low-amplitude patterns that probabilistically surface
    for (const row of tunnelingCandidates) {
      if (seen.has(row.id)) continue;
      const rawAmplitude = row.amplitude || row.confidence || PLANCK_CONFIDENCE;
      if (canTunnel(rawAmplitude, 0.3)) {
        addScored(row, 0.2); // Tunneled patterns get a low base score
        // Tag the tunneled pattern
        const tunneled = scored.find(s => s.id === row.id);
        if (tunneled) tunneled.matchType = 'tunneled';
      }
    }

    // Apply interference between scored patterns
    if (scored.length >= 2) {
      for (let i = 0; i < scored.length; i++) {
        let interferenceSum = 0;
        let interferenceCount = 0;
        for (let j = 0; j < scored.length; j++) {
          if (i === j) continue;
          const interference = computeInterference(scored[i], scored[j]);
          interferenceSum += interference;
          interferenceCount++;
        }
        if (interferenceCount > 0) {
          const avgInterference = interferenceSum / interferenceCount;
          scored[i].matchScore = Math.round(
            Math.max(0, Math.min(1, scored[i].matchScore + avgInterference)) * 1000
          ) / 1000;
          scored[i].interference = Math.round(avgInterference * 1000) / 1000;
        }
      }
    }

    // Sort by final score
    const results = scored
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    // Collapse observed patterns (measurement effect)
    for (const result of results) {
      this._collapsePattern(result.id, now);
    }

    return results;
  }

  /**
   * FEEDBACK (reportOutcome) — Post-measurement state update.
   *
   * After observing and applying a pattern, the outcome updates the amplitude.
   * Success increases amplitude; failure decreases it. Entangled patterns
   * shift proportionally via propagateEntanglement.
   */
  reportOutcome(id, resolved) {
    const row = this.store.db.prepare('SELECT * FROM debug_patterns WHERE id = ?').get(id);
    if (!row) return { success: false, error: `Debug pattern ${id} not found` };

    const timesApplied = row.times_applied + 1;
    const timesResolved = row.times_resolved + (resolved ? 1 : 0);
    const amplitude = computeAmplitude(timesApplied, timesResolved);
    const now = new Date().toISOString();

    // Determine quantum state based on amplitude
    let quantumState = QUANTUM_STATES.COLLAPSED;
    if (amplitude < 0.05) {
      quantumState = QUANTUM_STATES.DECOHERED;
    }

    this.store.db.prepare(`
      UPDATE debug_patterns
      SET times_applied = ?, times_resolved = ?, confidence = ?, amplitude = ?,
          quantum_state = ?, last_observed_at = ?, updated_at = ?,
          observation_count = observation_count + 1
      WHERE id = ?
    `).run(timesApplied, timesResolved, amplitude, amplitude, quantumState, now, now, id);

    this.store._audit('usage', 'debug_patterns', id, {
      resolved, timesApplied, amplitude, quantumState,
    });

    // Propagate entanglement — shift linked patterns
    const entangledIds = safeParse(row.entangled_with, []);
    const delta = resolved ? ENTANGLEMENT_STRENGTH * 0.1 : -ENTANGLEMENT_STRENGTH * 0.05;
    this._propagateEntanglement(entangledIds, delta, id);

    // Cascade growth when amplitude crosses threshold
    let newVariants = [];
    if (resolved && amplitude >= this.cascadeThreshold) {
      const pattern = this._getDebugPattern(id);
      newVariants = this._cascadeGrow(pattern);
    }

    return {
      success: true,
      confidence: amplitude,
      amplitude,
      timesApplied,
      timesResolved,
      quantumState,
      cascadeVariants: newVariants.length,
      entanglementPropagated: entangledIds.length,
    };
  }

  /**
   * GROW — Expand the quantum field by creating entangled variants.
   *
   * Takes high-amplitude captured patterns and generates:
   *   - Language variants (entangled across languages)
   *   - Error message variants (entangled across manifestations)
   * All variants are entangled with their parent state.
   */
  grow(options = {}) {
    const {
      minConfidence = 0.5,
      maxPatterns = Infinity,
      languages = this.variantLanguages,
    } = options;

    const patterns = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE (amplitude >= ? OR confidence >= ?) AND generation_method = ? ORDER BY amplitude DESC, confidence DESC'
    ).all(minConfidence, minConfidence, 'capture');

    const report = {
      processed: 0,
      generated: 0,
      stored: 0,
      skipped: 0,
      byLanguage: {},
      byCategory: {},
      entanglementLinks: 0,
    };

    for (const row of patterns) {
      if (report.processed >= maxPatterns) break;
      report.processed++;

      const pattern = this._rowToDebugPattern(row);
      const newEntangled = [];

      // Language variants
      const fixVariants = generateFixVariants(pattern.fixCode, pattern.language, languages);
      for (const variant of fixVariants) {
        report.generated++;

        const existing = this.store.db.prepare(
          'SELECT id FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
        ).get(pattern.fingerprintHash, variant.language);

        if (existing) {
          report.skipped++;
          continue;
        }

        const stored = this._storeVariant(pattern, variant.code, variant.language, 'language-variant');
        if (stored) {
          report.stored++;
          newEntangled.push(stored.id);
          report.byLanguage[variant.language] = (report.byLanguage[variant.language] || 0) + 1;
        }
      }

      // Error message variants
      const errorVariants = generateErrorVariants(pattern.errorMessage, pattern.errorCategory);
      for (const variantMsg of errorVariants) {
        report.generated++;

        const variantFp = fingerprint(variantMsg, '');
        const existing = this.store.db.prepare(
          'SELECT id FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
        ).get(variantFp.hash, pattern.language);

        if (existing) {
          report.skipped++;
          continue;
        }

        const stored = this._storeErrorVariant(pattern, variantMsg, variantFp);
        if (stored) {
          report.stored++;
          newEntangled.push(stored.id);
          report.byCategory[pattern.errorCategory] = (report.byCategory[pattern.errorCategory] || 0) + 1;
        }
      }

      // Establish entanglement links
      if (newEntangled.length > 0) {
        this._entangle(pattern.id, newEntangled);
        report.entanglementLinks += newEntangled.length;
      }
    }

    if (process.env.ORACLE_DEBUG) {
      console.log(`  [QUANTUM-GROW] ${report.processed} patterns → ${report.stored} entangled variants (${report.entanglementLinks} links)`);
    }

    return report;
  }

  /**
   * Get all debug patterns, optionally filtered.
   * Applies decoherence to returned amplitudes for accurate current state.
   */
  getAll(filters = {}) {
    let sql = 'SELECT * FROM debug_patterns WHERE 1=1';
    const params = [];

    if (filters.language) {
      sql += ' AND language = ?';
      params.push(filters.language);
    }
    if (filters.category) {
      sql += ' AND error_category = ?';
      params.push(filters.category);
    }
    if (filters.minConfidence != null) {
      sql += ' AND (amplitude >= ? OR confidence >= ?)';
      params.push(filters.minConfidence, filters.minConfidence);
    }
    if (filters.errorClass) {
      sql += ' AND error_class = ?';
      params.push(filters.errorClass);
    }
    if (filters.quantumState) {
      sql += ' AND quantum_state = ?';
      params.push(filters.quantumState);
    }

    sql += ' ORDER BY amplitude DESC, confidence DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.store.db.prepare(sql).all(...params).map(r => this._rowToDebugPattern(r));
  }

  /**
   * Get debug pattern by ID.
   */
  get(id) {
    return this._getDebugPattern(id);
  }

  /**
   * Get quantum field statistics.
   */
  stats() {
    const all = this.store.db.prepare('SELECT * FROM debug_patterns').all();
    const now = new Date();

    const byCategory = {};
    const byLanguage = {};
    const byMethod = {};
    const byQuantumState = {};
    let totalConfidence = 0;
    let totalAmplitude = 0;
    let totalApplied = 0;
    let totalResolved = 0;
    let totalObservations = 0;
    let entangledPairs = 0;

    for (const row of all) {
      byCategory[row.error_category] = (byCategory[row.error_category] || 0) + 1;
      byLanguage[row.language] = (byLanguage[row.language] || 0) + 1;
      byMethod[row.generation_method] = (byMethod[row.generation_method] || 0) + 1;

      const qState = row.quantum_state || QUANTUM_STATES.SUPERPOSITION;
      byQuantumState[qState] = (byQuantumState[qState] || 0) + 1;

      totalConfidence += row.confidence || 0;
      totalAmplitude += row.amplitude || row.confidence || 0;
      totalApplied += row.times_applied;
      totalResolved += row.times_resolved;
      totalObservations += row.observation_count || 0;

      const entangled = safeParse(row.entangled_with, []);
      entangledPairs += entangled.length;
    }

    return {
      totalPatterns: all.length,
      avgConfidence: all.length > 0 ? Math.round(totalConfidence / all.length * 1000) / 1000 : 0,
      avgAmplitude: all.length > 0 ? Math.round(totalAmplitude / all.length * 1000) / 1000 : 0,
      totalApplied,
      totalResolved,
      resolutionRate: totalApplied > 0 ? Math.round(totalResolved / totalApplied * 1000) / 1000 : 0,
      byCategory,
      byLanguage,
      byMethod,
      captured: byMethod.capture || 0,
      generated: all.length - (byMethod.capture || 0),
      // Quantum field metrics
      quantumField: {
        superposition: byQuantumState[QUANTUM_STATES.SUPERPOSITION] || 0,
        collapsed: byQuantumState[QUANTUM_STATES.COLLAPSED] || 0,
        decohered: byQuantumState[QUANTUM_STATES.DECOHERED] || 0,
        totalObservations,
        entanglementLinks: entangledPairs,
        fieldEnergy: all.length > 0 ? Math.round(totalAmplitude * 1000) / 1000 : 0,
      },
    };
  }

  /**
   * Apply decoherence sweep — decay unobserved patterns.
   * Run periodically to maintain quantum field integrity.
   */
  decoherenceSweep(options = {}) {
    const { maxDays = 180, minAmplitude = 0.01 } = options;
    const now = new Date();
    const cutoff = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000).toISOString();

    // Find patterns that haven't been observed recently
    const stale = this.store.db.prepare(
      "SELECT id, amplitude, confidence, last_observed_at FROM debug_patterns WHERE (last_observed_at IS NOT NULL AND last_observed_at < ?) OR (last_observed_at IS NULL AND created_at < ?)"
    ).all(cutoff, cutoff);

    let decohered = 0;
    for (const row of stale) {
      const rawAmplitude = row.amplitude || row.confidence || PLANCK_CONFIDENCE;
      const newAmplitude = applyDecoherence(rawAmplitude, row.last_observed_at || cutoff, now.toISOString());

      if (newAmplitude < minAmplitude) {
        this.store.db.prepare(
          "UPDATE debug_patterns SET amplitude = ?, confidence = ?, quantum_state = ?, updated_at = ? WHERE id = ?"
        ).run(newAmplitude, newAmplitude, QUANTUM_STATES.DECOHERED, now.toISOString(), row.id);
        decohered++;
      } else if (newAmplitude < rawAmplitude) {
        this.store.db.prepare(
          "UPDATE debug_patterns SET amplitude = ?, confidence = ?, updated_at = ? WHERE id = ?"
        ).run(newAmplitude, newAmplitude, now.toISOString(), row.id);
      }
    }

    return { swept: stale.length, decohered };
  }

  /**
   * Re-excite a decohered pattern — bring it back from decoherence.
   * Like injecting energy into a quantum system to restore coherence.
   */
  reexcite(id) {
    const row = this.store.db.prepare('SELECT * FROM debug_patterns WHERE id = ?').get(id);
    if (!row) return { success: false, error: `Pattern ${id} not found` };

    const now = new Date().toISOString();
    const newAmplitude = Math.max(PLANCK_CONFIDENCE, (row.amplitude || 0) + 0.15);

    this.store.db.prepare(
      "UPDATE debug_patterns SET amplitude = ?, confidence = ?, quantum_state = ?, last_observed_at = ?, updated_at = ? WHERE id = ?"
    ).run(newAmplitude, newAmplitude, QUANTUM_STATES.SUPERPOSITION, now, now, id);

    return {
      success: true,
      previousState: row.quantum_state,
      newState: QUANTUM_STATES.SUPERPOSITION,
      amplitude: newAmplitude,
    };
  }

  /**
   * Bulk re-excite all decohered patterns — restore the quantum field.
   * Brings decohered patterns back to superposition with a minimum amplitude.
   *
   * @param {Object} [options] — { minAmplitude: number, boostAmount: number }
   * @returns {{ reexcited: number, total: number }}
   */
  reexciteAll(options = {}) {
    const { minAmplitude = PLANCK_CONFIDENCE, boostAmount = 0.15 } = options;
    const now = new Date().toISOString();

    const decohered = this.store.db.prepare(
      "SELECT id, amplitude FROM debug_patterns WHERE quantum_state = ?"
    ).all(QUANTUM_STATES.DECOHERED);

    let reexcited = 0;
    const update = this.store.db.prepare(
      "UPDATE debug_patterns SET amplitude = ?, confidence = ?, quantum_state = ?, last_observed_at = ?, updated_at = ? WHERE id = ?"
    );

    this.store.db.exec('BEGIN');
    try {
      for (const row of decohered) {
        const newAmplitude = Math.max(minAmplitude, (row.amplitude || 0) + boostAmount);
        update.run(newAmplitude, newAmplitude, QUANTUM_STATES.SUPERPOSITION, now, now, row.id);
        reexcited++;
      }
      this.store.db.exec('COMMIT');
    } catch (err) {
      this.store.db.exec('ROLLBACK');
      throw err;
    }

    return { reexcited, total: decohered.length };
  }

  /**
   * Get the entanglement graph for a pattern — all patterns it's linked to.
   */
  getEntanglementGraph(id, depth = 2) {
    const visited = new Set();
    const graph = { nodes: [], edges: [] };

    const walk = (currentId, currentDepth) => {
      if (visited.has(currentId) || currentDepth > depth) return;
      visited.add(currentId);

      const row = this.store.db.prepare('SELECT id, error_class, error_category, language, amplitude, quantum_state, entangled_with FROM debug_patterns WHERE id = ?').get(currentId);
      if (!row) return;

      graph.nodes.push({
        id: row.id,
        errorClass: row.error_class,
        category: row.error_category,
        language: row.language,
        amplitude: row.amplitude,
        quantumState: row.quantum_state,
      });

      const entangled = safeParse(row.entangled_with, []);
      for (const linkedId of entangled) {
        graph.edges.push({ from: currentId, to: linkedId });
        walk(linkedId, currentDepth + 1);
      }
    };

    walk(id, 0);
    return graph;
  }

  // ─── Internal Quantum Methods ───

  /**
   * Collapse a pattern from superposition to collapsed state.
   * This is what happens during observation (search).
   */
  _collapsePattern(id, now) {
    try {
      this.store.db.prepare(`
        UPDATE debug_patterns
        SET quantum_state = ?,
            last_observed_at = ?,
            observation_count = observation_count + 1,
            amplitude = MIN(1.0, amplitude + ?),
            confidence = MIN(1.0, confidence + ?)
        WHERE id = ?
      `).run(QUANTUM_STATES.COLLAPSED, now, COLLAPSE_BOOST, COLLAPSE_BOOST, id);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:collapse]', e?.message || e);
    }
  }

  /**
   * Establish entanglement between a parent pattern and its variants.
   * Bidirectional: both parent and children know about each other.
   */
  _entangle(parentId, childIds) {
    if (!childIds || childIds.length === 0) return;

    try {
      // Update parent's entanglement list
      const parentRow = this.store.db.prepare('SELECT entangled_with FROM debug_patterns WHERE id = ?').get(parentId);
      if (parentRow) {
        let existing = [];
        try { existing = JSON.parse(parentRow.entangled_with || '[]'); } catch (_) { /* corrupt data — reset */ }
        const merged = [...new Set([...existing, ...childIds])];
        this.store.db.prepare('UPDATE debug_patterns SET entangled_with = ? WHERE id = ?')
          .run(JSON.stringify(merged), parentId);
      }

      // Update each child's entanglement list
      for (const childId of childIds) {
        const childRow = this.store.db.prepare('SELECT entangled_with FROM debug_patterns WHERE id = ?').get(childId);
        if (childRow) {
          let existing = [];
          try { existing = JSON.parse(childRow.entangled_with || '[]'); } catch (_) { /* corrupt data — reset */ }
          const merged = [...new Set([...existing, parentId])];
          this.store.db.prepare('UPDATE debug_patterns SET entangled_with = ? WHERE id = ?')
            .run(JSON.stringify(merged), childId);
        }
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:entangle]', e?.message || e);
    }
  }

  /**
   * Propagate an amplitude change to entangled patterns.
   * When one pattern's state changes, linked patterns shift proportionally.
   */
  _propagateEntanglement(entangledIds, delta, sourceId) {
    if (!entangledIds || entangledIds.length === 0) return;

    for (const linkedId of entangledIds) {
      if (linkedId === sourceId) continue;
      try {
        const row = this.store.db.prepare('SELECT amplitude, confidence FROM debug_patterns WHERE id = ?').get(linkedId);
        if (!row) continue;

        const currentAmplitude = row.amplitude || row.confidence || PLANCK_CONFIDENCE;
        const newAmplitude = Math.max(0, Math.min(1, currentAmplitude + delta));
        const now = new Date().toISOString();

        this.store.db.prepare(
          'UPDATE debug_patterns SET amplitude = ?, confidence = ?, updated_at = ? WHERE id = ?'
        ).run(
          Math.round(newAmplitude * 1000) / 1000,
          Math.round(newAmplitude * 1000) / 1000,
          now, linkedId
        );
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:propagate]', e?.message || e);
      }
    }
  }

  /**
   * Auto-grow: generate initial entangled variants from a newly captured pattern.
   */
  _autoGrow(pattern) {
    const variants = [];

    const fixVariants = generateFixVariants(
      pattern.fixCode, pattern.language, this.variantLanguages
    );

    for (const v of fixVariants) {
      const existing = this.store.db.prepare(
        'SELECT id FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
      ).get(pattern.fingerprintHash, v.language);

      if (existing) continue;

      const stored = this._storeVariant(pattern, v.code, v.language, 'language-variant');
      if (stored) variants.push(stored);
    }

    return variants;
  }

  /**
   * Cascade grow: triggered when amplitude crosses threshold.
   * Creates more entangled variants (error variants + approach swaps).
   */
  _cascadeGrow(pattern) {
    const variants = [];

    // Error message variants
    const errorVariants = generateErrorVariants(pattern.errorMessage, pattern.errorCategory);
    for (const variantMsg of errorVariants) {
      const variantFp = fingerprint(variantMsg, '');
      const existing = this.store.db.prepare(
        'SELECT id FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
      ).get(variantFp.hash, pattern.language);

      if (existing) continue;

      const stored = this._storeErrorVariant(pattern, variantMsg, variantFp);
      if (stored) variants.push(stored);
    }

    // Language variants
    const fixVariants = generateFixVariants(
      pattern.fixCode, pattern.language, this.variantLanguages
    );

    for (const v of fixVariants) {
      const existing = this.store.db.prepare(
        'SELECT id FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
      ).get(pattern.fingerprintHash, v.language);

      if (existing) continue;

      const stored = this._storeVariant(pattern, v.code, v.language, 'cascade-variant');
      if (stored) variants.push(stored);
    }

    // Entangle all new variants with parent
    if (variants.length > 0) {
      this._entangle(pattern.id, variants.map(v => v.id).filter(Boolean));
    }

    if (process.env.ORACLE_DEBUG && variants.length > 0) {
      console.log(`  [QUANTUM-CASCADE] ${pattern.id} (amplitude ${pattern.amplitude}) → ${variants.length} entangled variants`);
    }

    return variants;
  }

  /**
   * Store a language variant — enters field in superposition, entangled with parent.
   */
  _storeVariant(parent, variantCode, language, method) {
    const id = crypto.createHash('sha256')
      .update(variantCode + parent.fingerprintHash + language + Date.now())
      .digest('hex').slice(0, 16);
    const now = new Date().toISOString();
    const phase = computePhase(parent.fingerprintHash + language);

    // Compute coherency for variant
    let coherencyTotal = parent.coherencyTotal * 0.8;
    try {
      const { computeCoherencyScore } = require('../unified/coherency');
      const score = computeCoherencyScore(variantCode, { language });
      coherencyTotal = score.total;
    } catch (err) { if (process.env.ORACLE_DEBUG) console.error('[debug-oracle]', err.message); }

    // Inherited amplitude starts at half parent's — entangled states share energy
    const inheritedAmplitude = Math.round((parent.amplitude || parent.confidence || PLANCK_CONFIDENCE) * 0.5 * 1000) / 1000;

    try {
      this.store.db.prepare(`
        INSERT INTO debug_patterns (
          id, error_signature, error_message, error_class, error_category,
          stack_fingerprint, fingerprint_hash, fix_code, fix_description,
          language, tags, coherency_total, coherency_json,
          times_applied, times_resolved, confidence,
          parent_debug, generation_method, created_at, updated_at,
          quantum_state, amplitude, phase, last_observed_at, entangled_with, observation_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?, ?, ?, ?,
          ?, ?, ?, NULL, ?, 0)
      `).run(
        id, parent.errorSignature, parent.errorMessage, parent.errorClass, parent.errorCategory,
        parent.stackFingerprint, parent.fingerprintHash, variantCode, parent.fixDescription,
        language, JSON.stringify(parent.tags || []), coherencyTotal,
        inheritedAmplitude,
        parent.id, method, now, now,
        QUANTUM_STATES.SUPERPOSITION, inheritedAmplitude, phase,
        JSON.stringify([parent.id])
      );

      this.store._audit('add', 'debug_patterns', id, {
        parent: parent.id, method, language, quantumState: QUANTUM_STATES.SUPERPOSITION,
      });

      return this._getDebugPattern(id);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:_storeVariant] returning null on error:', e?.message || e);
      return null;
    }
  }

  /**
   * Store an error-message variant — same fix, different error signature.
   * Enters field entangled with parent at lower amplitude.
   */
  _storeErrorVariant(parent, errorMessage, fp) {
    const id = crypto.createHash('sha256')
      .update(parent.fixCode + fp.hash + Date.now())
      .digest('hex').slice(0, 16);
    const now = new Date().toISOString();
    const phase = computePhase(fp.hash);

    // Error variants start at 40% of parent amplitude — more speculative
    const inheritedAmplitude = Math.round((parent.amplitude || parent.confidence || PLANCK_CONFIDENCE) * 0.4 * 1000) / 1000;

    try {
      this.store.db.prepare(`
        INSERT INTO debug_patterns (
          id, error_signature, error_message, error_class, error_category,
          stack_fingerprint, fingerprint_hash, fix_code, fix_description,
          language, tags, coherency_total, coherency_json,
          times_applied, times_resolved, confidence,
          parent_debug, generation_method, created_at, updated_at,
          quantum_state, amplitude, phase, last_observed_at, entangled_with, observation_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?, ?, ?, ?,
          ?, ?, ?, NULL, ?, 0)
      `).run(
        id, normalizeError(errorMessage), errorMessage, fp.errorClass, fp.category,
        '', fp.hash, parent.fixCode, parent.fixDescription,
        parent.language, JSON.stringify(parent.tags || []), parent.coherencyTotal,
        inheritedAmplitude,
        parent.id, 'error-variant', now, now,
        QUANTUM_STATES.SUPERPOSITION, inheritedAmplitude, phase,
        JSON.stringify([parent.id])
      );

      this.store._audit('add', 'debug_patterns', id, {
        parent: parent.id, method: 'error-variant', quantumState: QUANTUM_STATES.SUPERPOSITION,
      });

      return this._getDebugPattern(id);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[debug-oracle:_storeErrorVariant] returning null on error:', e?.message || e);
      return null;
    }
  }

  // ─── Data Access Helpers ───

  _getDebugPattern(id) {
    const row = this.store.db.prepare('SELECT * FROM debug_patterns WHERE id = ?').get(id);
    return row ? this._rowToDebugPattern(row) : null;
  }

  _rowToDebugPattern(row) {
    return {
      id: row.id,
      errorSignature: row.error_signature,
      errorMessage: row.error_message,
      errorClass: row.error_class,
      errorCategory: row.error_category,
      stackFingerprint: row.stack_fingerprint,
      fingerprintHash: row.fingerprint_hash,
      fixCode: row.fix_code,
      fixDescription: row.fix_description,
      language: row.language,
      tags: safeParse(row.tags, []),
      coherencyTotal: row.coherency_total,
      coherencyScore: safeParse(row.coherency_json, {}),
      timesApplied: row.times_applied,
      timesResolved: row.times_resolved,
      confidence: row.confidence,
      parentDebug: row.parent_debug,
      generationMethod: row.generation_method,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Quantum state
      quantumState: row.quantum_state || QUANTUM_STATES.SUPERPOSITION,
      amplitude: row.amplitude || row.confidence || PLANCK_CONFIDENCE,
      phase: row.phase || 0,
      lastObservedAt: row.last_observed_at,
      entangledWith: safeParse(row.entangled_with, []),
      observationCount: row.observation_count || 0,
    };
  }
}

// ─── Exports ───

module.exports = {
  DebugOracle,
  fingerprint,
  normalizeError,
  extractErrorClass,
  classifyError,
  computeConfidence,
  computeAmplitude,
  applyDecoherence,
  computePhase,
  canTunnel,
  computeInterference,
  computeFixSimilarity,
  generateErrorVariants,
  generateFixVariants,
  ERROR_CATEGORIES,
  QUANTUM_STATES,
  PLANCK_CONFIDENCE,
  DECOHERENCE_LAMBDA,
  TUNNELING_PROBABILITY,
  ENTANGLEMENT_STRENGTH,
  INTERFERENCE_RADIUS,
};
