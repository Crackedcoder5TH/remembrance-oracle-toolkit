/**
 * Debug Oracle — Exponential Debugging Intelligence
 *
 * Captures error→fix pairs as "debug patterns" and grows them exponentially:
 *
 *   1. CAPTURE: Error signature + stack trace + fix code → stored
 *   2. MATCH:   Error fingerprint → search all tiers for matching fixes
 *   3. GENERALIZE: refine fixes to work across error classes
 *   4. GROW:    Transpile fixes, generate for related error categories
 *   5. AMPLIFY: Community shares → more validations → higher confidence
 *
 * Growth model:
 *   - 1 captured fix → normalized to error class → generalized
 *   - Each generalized fix → language variants (JS→Py, Go, TS, Rust)
 *   - Each variant → approach alternatives (try-catch→guard clause→optional chain)
 *   - Community confidence rises per successful application → cascade boost
 *   - Higher confidence → more variant generation → exponential
 *
 * Confidence formula:
 *   confidence = (timesResolved / timesApplied) * min(1, log2(timesApplied + 1) / 5)
 *   First application starts at 0.2, grows with each success, plateaus at 1.0
 */

const crypto = require('crypto');

// ─── Error Categories ───

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

// ─── Error Fingerprinting ───

/**
 * Normalize an error message by stripping volatile parts.
 * File paths, line numbers, memory addresses, timestamps, etc.
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
 * Extract the error class from a message (TypeError, SyntaxError, etc.)
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
 * Classify error into a category based on keywords.
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
 * Generate a fingerprint for an error — stable across unimportant variations.
 * Two errors with the same fingerprint are "the same bug".
 */
function fingerprint(errorMessage, stackTrace) {
  const normalized = normalizeError(errorMessage);
  const errorClass = extractErrorClass(errorMessage);
  const category = classifyError(errorMessage);

  // Stack fingerprint: extract function names from first 5 frames
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

  return {
    hash,
    errorClass,
    category,
    normalized,
    stackFunctions,
  };
}

// ─── Confidence Scoring ───

/**
 * Compute confidence from application history.
 * Starts low, grows logarithmically, maxes at 1.0.
 *
 * confidence = successRate * maturityFactor
 * where maturityFactor = min(1, log2(timesApplied + 1) / 5)
 */
function computeConfidence(timesApplied, timesResolved) {
  if (timesApplied === 0) return 0.2; // Baseline confidence for new captures
  const successRate = timesResolved / timesApplied;
  const maturity = Math.min(1, Math.log2(timesApplied + 1) / 5);
  return Math.round(successRate * maturity * 1000) / 1000;
}

// ─── Variant Generation for Debug Patterns ───

/**
 * Generate error message variants for a given error class.
 * E.g., TypeError: Cannot read property 'x' of undefined
 *     → TypeError: Cannot read property 'y' of null
 *     → TypeError: x is not a function
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
 * Generate fix code variants for different languages.
 * Takes a JS fix and creates equivalent fixes in target languages.
 */
function generateFixVariants(fixCode, fixLanguage, targetLanguages) {
  const variants = [];

  for (const lang of targetLanguages) {
    if (lang === fixLanguage) continue;

    let variantCode = fixCode;

    if (fixLanguage === 'javascript' || fixLanguage === 'typescript') {
      if (lang === 'python') {
        variantCode = jsToPythonFix(fixCode);
      } else if (lang === 'go') {
        variantCode = jsToGoFix(fixCode);
      } else if (lang === 'typescript' && fixLanguage === 'javascript') {
        variantCode = jsToTsFix(fixCode);
      }
    }

    if (variantCode !== fixCode) {
      variants.push({ code: variantCode, language: lang });
    }
  }

  return variants;
}

// Transpilation helpers for fix code (JS → target language)
function jsToPythonFix(code) {
  return code
    .replace(/\b(?:const|let|var)\s+/g, '')
    .replace(/;$/gm, '')
    .replace(/===/g, '==').replace(/!==/g, '!=')
    .replace(/\{$/gm, ':')
    .replace(/^\s*\}/gm, '')
    .replace(/\/\/.*/g, m => '#' + m.slice(2))
    .replace(/\bnull\b/g, 'None')
    .replace(/\bundefined\b/g, 'None')
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False')
    .replace(/console\.log\(/g, 'print(')
    .replace(/\s*\|\|\s*/g, ' or ')
    .replace(/\s*&&\s*/g, ' and ')
    .replace(/!(\w)/g, 'not $1')
    .replace(/Math\.max\(/g, 'max(')
    .replace(/Math\.min\(/g, 'min(')
    .replace(/Math\.floor\(/g, 'int(')
    .replace(/Math\.abs\(/g, 'abs(')
    .replace(/(\w+)\.length/g, 'len($1)')
    .replace(/\.push\(/g, '.append(')
    .replace(/\.toUpperCase\(\)/g, '.upper()')
    .replace(/\.toLowerCase\(\)/g, '.lower()');
}

function jsToGoFix(code) {
  let result = code
    .replace(/\bconst\s+(\w+)\s*=\s*/g, '$1 := ')
    .replace(/\blet\s+(\w+)\s*=\s*/g, '$1 := ')
    .replace(/\bvar\s+(\w+)\s*=\s*/g, '$1 := ')
    .replace(/;$/gm, '')
    .replace(/console\.log\(/g, 'fmt.Println(')
    .replace(/\bnull\b/g, 'nil')
    .replace(/\bundefined\b/g, 'nil')
    .replace(/===/g, '==').replace(/!==/g, '!=')
    .replace(/(\w+)\.length/g, 'len($1)');
  // Add fmt import if Println is used
  if (result.includes('fmt.')) {
    result = 'import "fmt"\n\n' + result;
  }
  return result;
}

function jsToTsFix(code) {
  return code
    .replace(/function\s+(\w+)\s*\(([^)]*)\)/g, (_, name, params) => {
      const typed = params.split(',').map(p => {
        const pname = p.trim();
        if (!pname) return '';
        return `${pname}: unknown`;
      }).filter(Boolean).join(', ');
      return `function ${name}(${typed})`;
    })
    .replace(/\bvar\s+/g, 'let ');
}

// ─── Debug Oracle Class ───

class DebugOracle {
  /**
   * @param {object} store - SQLiteStore instance
   * @param {object} options - { verbose, variantLanguages, cascadeThreshold }
   */
  constructor(store, options = {}) {
    this.store = store;
    this.verbose = options.verbose || false;
    this.variantLanguages = options.variantLanguages || ['python', 'typescript', 'go'];
    this.cascadeThreshold = options.cascadeThreshold || 0.7;

    this._ensureSchema();
  }

  // ─── Schema ───

  _ensureSchema() {
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
  }

  // ─── Core Operations ───

  /**
   * Capture an error→fix pair.
   *
   * @param {object} params
   *   - errorMessage: The error message
   *   - stackTrace: Optional stack trace
   *   - fixCode: The code that fixes the error
   *   - fixDescription: Human description of the fix
   *   - language: Programming language
   *   - tags: Array of tags
   * @returns {object} The stored debug pattern + any generated variants
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

    // Check for duplicate fingerprint
    const existing = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
    ).get(fp.hash, language);

    if (existing) {
      // Update existing pattern with new fix if confidence is low
      if (existing.confidence < 0.5) {
        const now = new Date().toISOString();
        this.store.db.prepare(
          'UPDATE debug_patterns SET fix_code = ?, fix_description = ?, updated_at = ? WHERE id = ?'
        ).run(fixCode, fixDescription, now, existing.id);
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
        confidence: existing.confidence,
      };
    }

    // Score the fix code for coherency
    let coherencyTotal = 0;
    let coherencyJson = {};
    try {
      const { computeCoherencyScore } = require('../core/coherency');
      const score = computeCoherencyScore(fixCode, { language, description: fixDescription, tags });
      coherencyTotal = score.total;
      coherencyJson = score;
    } catch {
      coherencyTotal = 0.5; // Default for fixes that can't be scored
    }

    const id = crypto.createHash('sha256')
      .update(fixCode + fp.hash + Date.now())
      .digest('hex').slice(0, 16);
    const now = new Date().toISOString();

    this.store.db.prepare(`
      INSERT INTO debug_patterns (
        id, error_signature, error_message, error_class, error_category,
        stack_fingerprint, fingerprint_hash, fix_code, fix_description,
        language, tags, coherency_total, coherency_json,
        times_applied, times_resolved, confidence,
        parent_debug, generation_method, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0.2, ?, 'capture', ?, ?)
    `).run(
      id, normalizeError(errorMessage), errorMessage, fp.errorClass, fp.category,
      fp.stackFunctions.join('>'), fp.hash, fixCode, fixDescription,
      language, JSON.stringify(tags), coherencyTotal, JSON.stringify(coherencyJson),
      null, now, now
    );

    this.store._audit('add', 'debug_patterns', id, {
      errorClass: fp.errorClass, category: fp.category, language,
    });

    const pattern = this._getDebugPattern(id);

    // Auto-generate variants
    const variants = this._autoGrow(pattern);

    if (process.env.ORACLE_DEBUG) {
      console.log(`  [DEBUG-CAPTURE] ${fp.errorClass}:${fp.category} → ${id} (+${variants.length} variants)`);
    }

    return { captured: true, pattern, variants };
  }

  /**
   * Search for debug patterns matching an error.
   * Returns fixes ranked by confidence and relevance.
   *
   * @param {object} params
   *   - errorMessage: The error to find fixes for
   *   - stackTrace: Optional stack trace
   *   - language: Preferred language
   *   - limit: Max results (default 5)
   * @returns {Array} Matching debug patterns, ranked
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

    // Phase 1: Exact fingerprint match
    const exactMatches = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE fingerprint_hash = ? ORDER BY confidence DESC'
    ).all(fp.hash);

    // Phase 2: Same error class + category
    const classMatches = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE error_class = ? AND error_category = ? AND fingerprint_hash != ? ORDER BY confidence DESC LIMIT ?'
    ).all(fp.errorClass, fp.category, fp.hash, limit * 2);

    // Phase 3: Same category, keyword overlap
    const categoryMatches = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE error_category = ? AND fingerprint_hash != ? AND error_class != ? ORDER BY confidence DESC LIMIT ?'
    ).all(fp.category, fp.hash, fp.errorClass, limit);

    // Score and rank all matches
    const scored = [];
    const seen = new Set();

    const addScored = (row, baseScore) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);

      let score = baseScore;

      // Language bonus
      if (language && row.language === language) score += 0.15;

      // Confidence bonus
      score += row.confidence * 0.2;

      // Keyword overlap bonus
      const words = fp.normalized.toLowerCase().split(/\s+/);
      const errorWords = (row.error_signature || '').toLowerCase().split(/\s+/);
      const overlap = words.filter(w => errorWords.includes(w)).length;
      score += Math.min(0.2, overlap * 0.05);

      scored.push({
        ...this._rowToDebugPattern(row),
        matchScore: Math.round(Math.min(1, score) * 1000) / 1000,
        matchType: baseScore >= 0.9 ? 'exact' : baseScore >= 0.6 ? 'class' : 'category',
      });
    };

    for (const row of exactMatches) addScored(row, 1.0);
    for (const row of classMatches) addScored(row, 0.6);
    for (const row of categoryMatches) addScored(row, 0.3);

    return scored
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  /**
   * Report whether an applied fix resolved the error.
   * Updates confidence and triggers variant generation on success.
   *
   * @param {string} id - Debug pattern ID
   * @param {boolean} resolved - Whether the fix worked
   * @returns {object} Updated pattern
   */
  reportOutcome(id, resolved) {
    const row = this.store.db.prepare('SELECT * FROM debug_patterns WHERE id = ?').get(id);
    if (!row) return { success: false, error: `Debug pattern ${id} not found` };

    const timesApplied = row.times_applied + 1;
    const timesResolved = row.times_resolved + (resolved ? 1 : 0);
    const confidence = computeConfidence(timesApplied, timesResolved);
    const now = new Date().toISOString();

    this.store.db.prepare(
      'UPDATE debug_patterns SET times_applied = ?, times_resolved = ?, confidence = ?, updated_at = ? WHERE id = ?'
    ).run(timesApplied, timesResolved, confidence, now, id);

    this.store._audit('usage', 'debug_patterns', id, { resolved, timesApplied, confidence });

    // On success: cascade growth if confidence crosses threshold
    let newVariants = [];
    if (resolved && confidence >= this.cascadeThreshold) {
      const pattern = this._getDebugPattern(id);
      newVariants = this._cascadeGrow(pattern);
    }

    return {
      success: true,
      confidence,
      timesApplied,
      timesResolved,
      cascadeVariants: newVariants.length,
    };
  }

  /**
   * Generate debug pattern variants from all high-confidence patterns.
   * This is the exponential growth engine for debugging knowledge.
   *
   * @param {object} options - { minConfidence, maxPatterns, languages }
   * @returns {object} Growth report
   */
  grow(options = {}) {
    const {
      minConfidence = 0.5,
      maxPatterns = Infinity,
      languages = this.variantLanguages,
    } = options;

    const patterns = this.store.db.prepare(
      'SELECT * FROM debug_patterns WHERE confidence >= ? AND generation_method = ? ORDER BY confidence DESC'
    ).all(minConfidence, 'capture');

    const report = {
      processed: 0,
      generated: 0,
      stored: 0,
      skipped: 0,
      byLanguage: {},
      byCategory: {},
    };

    for (const row of patterns) {
      if (report.processed >= maxPatterns) break;
      report.processed++;

      const pattern = this._rowToDebugPattern(row);

      // Language variants
      const fixVariants = generateFixVariants(pattern.fixCode, pattern.language, languages);
      for (const variant of fixVariants) {
        report.generated++;

        // Check for duplicate
        const existing = this.store.db.prepare(
          'SELECT id FROM debug_patterns WHERE fingerprint_hash = ? AND language = ?'
        ).get(pattern.fingerprintHash, variant.language);

        if (existing) {
          report.skipped++;
          continue;
        }

        this._storeVariant(pattern, variant.code, variant.language, 'language-variant');
        report.stored++;
        report.byLanguage[variant.language] = (report.byLanguage[variant.language] || 0) + 1;
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

        this._storeErrorVariant(pattern, variantMsg, variantFp);
        report.stored++;
        report.byCategory[pattern.errorCategory] = (report.byCategory[pattern.errorCategory] || 0) + 1;
      }
    }

    if (process.env.ORACLE_DEBUG) {
      console.log(`  [DEBUG-GROW] ${report.processed} patterns → ${report.stored} new variants`);
    }

    return report;
  }

  /**
   * Get all debug patterns, optionally filtered.
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
      sql += ' AND confidence >= ?';
      params.push(filters.minConfidence);
    }
    if (filters.errorClass) {
      sql += ' AND error_class = ?';
      params.push(filters.errorClass);
    }

    sql += ' ORDER BY confidence DESC';

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
   * Get summary statistics.
   */
  stats() {
    const all = this.store.db.prepare('SELECT * FROM debug_patterns').all();

    const byCategory = {};
    const byLanguage = {};
    const byMethod = {};
    let totalConfidence = 0;
    let totalApplied = 0;
    let totalResolved = 0;

    for (const row of all) {
      byCategory[row.error_category] = (byCategory[row.error_category] || 0) + 1;
      byLanguage[row.language] = (byLanguage[row.language] || 0) + 1;
      byMethod[row.generation_method] = (byMethod[row.generation_method] || 0) + 1;
      totalConfidence += row.confidence;
      totalApplied += row.times_applied;
      totalResolved += row.times_resolved;
    }

    return {
      totalPatterns: all.length,
      avgConfidence: all.length > 0 ? Math.round(totalConfidence / all.length * 1000) / 1000 : 0,
      totalApplied,
      totalResolved,
      resolutionRate: totalApplied > 0 ? Math.round(totalResolved / totalApplied * 1000) / 1000 : 0,
      byCategory,
      byLanguage,
      byMethod,
      captured: byMethod.capture || 0,
      generated: all.length - (byMethod.capture || 0),
    };
  }

  // ─── Internal Growth Methods ───

  /**
   * Auto-grow: generate initial variants from a newly captured debug pattern.
   */
  _autoGrow(pattern) {
    const variants = [];

    // Language variants
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
   * Cascade grow: triggered when a pattern crosses the confidence threshold.
   * Generates more aggressive variants (error variants + approach swaps).
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

    // Also generate language variants if not done yet
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

    if (process.env.ORACLE_DEBUG && variants.length > 0) {
      console.log(`  [CASCADE] ${pattern.id} (confidence ${pattern.confidence}) → ${variants.length} new variants`);
    }

    return variants;
  }

  /**
   * Store a language variant of a debug pattern.
   */
  _storeVariant(parent, variantCode, language, method) {
    const id = crypto.createHash('sha256')
      .update(variantCode + parent.fingerprintHash + language + Date.now())
      .digest('hex').slice(0, 16);
    const now = new Date().toISOString();

    // Compute coherency for variant
    let coherencyTotal = parent.coherencyTotal * 0.8; // Inherit scaled coherency
    try {
      const { computeCoherencyScore } = require('../core/coherency');
      const score = computeCoherencyScore(variantCode, { language });
      coherencyTotal = score.total;
    } catch (err) { if (process.env.ORACLE_DEBUG) console.error('[debug-oracle]', err.message); }

    try {
      this.store.db.prepare(`
        INSERT INTO debug_patterns (
          id, error_signature, error_message, error_class, error_category,
          stack_fingerprint, fingerprint_hash, fix_code, fix_description,
          language, tags, coherency_total, coherency_json,
          times_applied, times_resolved, confidence,
          parent_debug, generation_method, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?, ?, ?, ?)
      `).run(
        id, parent.errorSignature, parent.errorMessage, parent.errorClass, parent.errorCategory,
        parent.stackFingerprint, parent.fingerprintHash, variantCode, parent.fixDescription,
        language, JSON.stringify(parent.tags || []), coherencyTotal,
        parent.confidence * 0.5, // Inherited confidence starts at half
        parent.id, method, now, now
      );

      this.store._audit('add', 'debug_patterns', id, {
        parent: parent.id, method, language,
      });

      return this._getDebugPattern(id);
    } catch {
      return null;
    }
  }

  /**
   * Store an error-message variant (same fix, different error signature).
   */
  _storeErrorVariant(parent, errorMessage, fp) {
    const id = crypto.createHash('sha256')
      .update(parent.fixCode + fp.hash + Date.now())
      .digest('hex').slice(0, 16);
    const now = new Date().toISOString();

    try {
      this.store.db.prepare(`
        INSERT INTO debug_patterns (
          id, error_signature, error_message, error_class, error_category,
          stack_fingerprint, fingerprint_hash, fix_code, fix_description,
          language, tags, coherency_total, coherency_json,
          times_applied, times_resolved, confidence,
          parent_debug, generation_method, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?, ?, ?, ?)
      `).run(
        id, normalizeError(errorMessage), errorMessage, fp.errorClass, fp.category,
        '', fp.hash, parent.fixCode, parent.fixDescription,
        parent.language, JSON.stringify(parent.tags || []), parent.coherencyTotal,
        parent.confidence * 0.4, // Error variants start lower
        parent.id, 'error-variant', now, now
      );

      this.store._audit('add', 'debug_patterns', id, {
        parent: parent.id, method: 'error-variant',
      });

      return this._getDebugPattern(id);
    } catch {
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
      tags: JSON.parse(row.tags || '[]'),
      coherencyTotal: row.coherency_total,
      coherencyScore: JSON.parse(row.coherency_json || '{}'),
      timesApplied: row.times_applied,
      timesResolved: row.times_resolved,
      confidence: row.confidence,
      parentDebug: row.parent_debug,
      generationMethod: row.generation_method,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
  generateErrorVariants,
  generateFixVariants,
  ERROR_CATEGORIES,
};
