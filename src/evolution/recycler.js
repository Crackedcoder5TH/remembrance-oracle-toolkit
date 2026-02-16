/**
 * Pattern Recycler — the exponential growth engine.
 *
 * Instead of discarding failed patterns, the recycler:
 *
 *   1. CAPTURES failures with full context (why it failed, how close it was)
 *   2. HEALS them via reflection (simplify, secure, readable, unify, correct)
 *   3. RE-VALIDATES healed code through the full oracle pipeline
 *   4. GENERATES VARIANTS from successful patterns (language ports, approach swaps)
 *   5. FEEDS variants back through the loop — exponential pattern growth
 *
 * The recycler is a meta-loop that wraps the oracle:
 *
 *   Code → Validate → Store (success)
 *                ↓
 *            Capture → Heal → Re-validate → Store (recycled)
 *                                       ↓
 *                                  Still failing → variant generation
 *                                       ↓
 *                                  Variants → Validate → Store → spawn more variants...
 *
 * Growth model:
 *   - 1 JS pattern passes → generates Go, Python, TS, Rust variants = 5 patterns
 *   - Each variant that passes → spawns approach alternatives = 5-15 more
 *   - Each approach alt → spawns language variants = exponential
 */

const { reflectionLoop } = require('../core/reflection');
const { validateCode } = require('../core/validator');
const { computeCoherencyScore, detectLanguage } = require('../core/coherency');
const { isTestFile, isDataFile, requiresExternalModules } = require('./test-synth');
const {
  CASCADE,
  HEALING,
  VOID_REPLENISH_WEIGHTS,
  VARIANT_GENERATION,
  APPROACH_SWAP,
  ITERATIVE_REFINE,
  CANDIDATE_MIN_COHERENCY,
} = require('../constants/thresholds');
const {
  shouldSkipForGeneration: _shouldSkipForGeneration,
  canTranspileToPython,
  extractBody,
  jsToPythonParams,
  jsToPythonBody,
  jsToPythonTest,
  inferTypeScriptParams,
  findMatchingParen,
} = require('../core/transpilers/js-helpers');

// ─── Variant Templates ───
// Language transpilation skeletons for common patterns

const LANG_TEMPLATES = {
  javascript: {
    functionDecl: (name, params, body) => `function ${name}(${params}) {\n${body}\n}`,
    testAssert: (expr, msg) => `if (!(${expr})) throw new Error(${JSON.stringify(msg)});`,
    arrayLiteral: (items) => `[${items.join(', ')}]`,
    returnStmt: (expr) => `return ${expr};`,
    varDecl: (name, val) => `const ${name} = ${val};`,
    forLoop: (init, cond, inc, body) => `for (${init}; ${cond}; ${inc}) {\n${body}\n}`,
    comment: (text) => `// ${text}`,
  },
  python: {
    functionDecl: (name, params, body) => `def ${name}(${params}):\n${indent(body, 4)}`,
    testAssert: (expr, msg) => `assert ${expr}, ${JSON.stringify(msg)}`,
    arrayLiteral: (items) => `[${items.join(', ')}]`,
    returnStmt: (expr) => `return ${expr}`,
    varDecl: (name, val) => `${name} = ${val}`,
    forLoop: (varName, iterable, body) => `for ${varName} in ${iterable}:\n${indent(body, 4)}`,
    comment: (text) => `# ${text}`,
  },
  typescript: {
    functionDecl: (name, params, body) => `function ${name}(${params}) {\n${body}\n}`,
    testAssert: (expr, msg) => `if (!(${expr})) throw new Error(${JSON.stringify(msg)});`,
    arrayLiteral: (items) => `[${items.join(', ')}]`,
    returnStmt: (expr) => `return ${expr};`,
    varDecl: (name, val) => `const ${name} = ${val};`,
    forLoop: (init, cond, inc, body) => `for (${init}; ${cond}; ${inc}) {\n${body}\n}`,
    comment: (text) => `// ${text}`,
  },
  go: {
    functionDecl: (name, params, body) => `func ${name}(${params}) {\n${body}\n}`,
    testAssert: (expr, msg) => `if !(${expr}) { t.Fatalf(${JSON.stringify(msg)}) }`,
    arrayLiteral: (items) => `[]interface{}{${items.join(', ')}}`,
    returnStmt: (expr) => `return ${expr}`,
    varDecl: (name, val) => `${name} := ${val}`,
    forLoop: (init, cond, inc, body) => `for ${init}; ${cond}; ${inc} {\n${body}\n}`,
    comment: (text) => `// ${text}`,
  },
};

function indent(code, spaces) {
  const pad = ' '.repeat(spaces);
  return code.split('\n').map(line => line.trim() ? pad + line : line).join('\n');
}

// ─── Approach Alternatives ───
// Common algorithmic swaps that preserve semantics

const APPROACH_SWAPS = [
  {
    from: 'recursive',
    to: 'iterative',
    detect: (code) => /function\s+\w+[^{]*\{[\s\S]*\b(?:return\s+\w+\s*\()/.test(code),
    hint: 'Convert recursion to iteration using a stack or accumulator',
  },
  {
    from: 'for-loop',
    to: 'functional',
    detect: (code) => /for\s*\(/.test(code) && !code.includes('.map(') && !code.includes('.reduce('),
    hint: 'Replace for-loop with map/filter/reduce',
  },
  {
    from: 'imperative',
    to: 'declarative',
    detect: (code) => {
      const assignments = (code.match(/\b(?:let|var)\s+\w+\s*=/g) || []).length;
      return assignments >= 3;
    },
    hint: 'Replace imperative mutations with declarative pipeline',
  },
  {
    from: 'linear-search',
    to: 'binary-search',
    detect: (code) => /for\s*\(.*(?:indexOf|find|includes)/.test(code) || /\.indexOf\(/.test(code),
    hint: 'Replace linear scan with binary search on sorted input',
  },
  {
    from: 'mutable',
    to: 'immutable',
    detect: (code) => {
      const lets = (code.match(/\blet\s+/g) || []).length;
      const pushes = (code.match(/\.push\(/g) || []).length;
      return lets >= 2 || pushes >= 2;
    },
    hint: 'Replace mutations with immutable operations (spread, concat, map)',
  },
];

// ─── The Recycler ───

// ─── Cascade Constants (from centralized thresholds) ───

const CASCADE_BETA = CASCADE.BETA;
const CASCADE_GAMMA_BASE = CASCADE.GAMMA_BASE;
const VOID_SCAFFOLD_THRESHOLD = CASCADE.VOID_SCAFFOLD_THRESHOLD;

class PatternRecycler {
  constructor(oracle, options = {}) {
    this.oracle = oracle;
    this.maxHealAttempts = options.maxHealAttempts || HEALING.MAX_ATTEMPTS;
    this.maxRefineLoops = options.maxRefineLoops || HEALING.MAX_REFINE_LOOPS;
    this.targetCoherence = options.targetCoherence || HEALING.TARGET_COHERENCE;
    this.generateVariants = options.generateVariants !== false;
    this.variantLanguages = options.variantLanguages || ['python', 'typescript'];
    this.verbose = options.verbose || false;

    // Failed pattern buffer — patterns waiting to be recycled
    this._failed = [];

    // Global coherence state — updated each cycle
    this._xiGlobal = 0;
    this._cascadeBoost = 1;

    // Stats
    this.stats = {
      captured: 0,
      healedViaReflection: 0,
      healedViaVariant: 0,
      variantsGenerated: 0,
      variantsAccepted: 0,
      stillFailed: 0,
      totalAttempts: 0,
      approachSwaps: 0,
      voidReplenishments: 0,
      cascadeBoost: 1,
      xiGlobal: 0,
    };

    // Restore persisted rejections from previous sessions
    this._restorePersistedRejections();
  }

  /**
   * Restore previously captured rejections from the audit log.
   * This allows healing to persist across sessions.
   */
  _restorePersistedRejections() {
    try {
      const sqlStore = this.oracle.store?.getSQLiteStore?.();
      if (!sqlStore || !sqlStore.db) return;

      const rows = sqlStore.db.prepare(
        "SELECT detail FROM audit_log WHERE action = 'rejection_captured' AND target_table = 'recycler' ORDER BY timestamp DESC LIMIT 50"
      ).all();

      for (const row of rows) {
        const detail = JSON.parse(row.detail || '{}');
        if (detail.pattern && detail.status === 'pending') {
          this._failed.push({
            id: detail.id || require('crypto').randomBytes(8).toString('hex'),
            pattern: detail.pattern,
            failureReason: detail.failureReason || 'restored',
            validation: detail.validation || null,
            capturedAt: detail.capturedAt || new Date().toISOString(),
            attempts: detail.attempts || 0,
            status: 'pending',
            healHistory: detail.healHistory || [],
          });
          this.stats.captured++;
        }
      }
    } catch {
      // Persistence is best-effort — never break the recycler
    }
  }

  /**
   * Persist a captured rejection to the audit log for cross-session recovery.
   */
  _persistCapture(entry) {
    try {
      const sqlStore = this.oracle.store?.getSQLiteStore?.();
      if (!sqlStore || !sqlStore.db) return;

      sqlStore.db.prepare(
        "INSERT INTO audit_log (timestamp, action, target_table, target_id, detail, actor) VALUES (?, 'rejection_captured', 'recycler', ?, ?, 'recycler')"
      ).run(
        new Date().toISOString(),
        entry.id,
        JSON.stringify({
          id: entry.id,
          pattern: entry.pattern,
          failureReason: entry.failureReason,
          status: entry.status,
          capturedAt: entry.capturedAt,
          attempts: entry.attempts,
          healHistory: entry.healHistory,
        })
      );
    } catch {
      // Best-effort persistence
    }
  }

  /**
   * Mark a persisted rejection as healed/exhausted in the audit log.
   */
  _persistHealResult(entry) {
    try {
      const sqlStore = this.oracle.store?.getSQLiteStore?.();
      if (!sqlStore || !sqlStore.db) return;

      sqlStore.db.prepare(
        "INSERT INTO audit_log (timestamp, action, target_table, target_id, detail, actor) VALUES (?, 'rejection_healed', 'recycler', ?, ?, 'recycler')"
      ).run(
        new Date().toISOString(),
        entry.id,
        JSON.stringify({ status: entry.status, attempts: entry.attempts })
      );
    } catch {
      // Best-effort
    }
  }

  /**
   * Compute global coherence (ξ_global) across the full pattern library.
   * This is the average coherency of all stored patterns — a measure of
   * collective health. When high, cascade amplification kicks in.
   *
   * Also computes cascade boost: γ_cascade = γ_base * exp(β * ξ_global) * avg_I_AM
   */
  _updateGlobalCoherence() {
    const all = this.oracle.patterns.getAll();
    if (all.length === 0) {
      this._xiGlobal = 0;
      this._cascadeBoost = 1;
      return;
    }

    // ξ_global = average coherency across all N patterns
    const coherencies = all.map(p => p.coherencyScore?.total ?? 0);
    const xiGlobal = coherencies.reduce((s, c) => s + c, 0) / coherencies.length;

    // Average I_AM recognition: how many patterns are above threshold
    const iAmValues = coherencies.map(c => c >= this.oracle.threshold ? c : 0);
    const avgIAM = iAmValues.reduce((s, v) => s + v, 0) / iAmValues.length;

    // Cascade: γ_cascade = 1 + γ_base * exp(β * ξ_global) * avg_I_AM
    // When ξ_global is high (0.9+), this gives ~1.15x boost
    // When ξ_global is low (0.3), this gives ~1.01x — almost no boost
    const cascadeBoost = 1 + CASCADE_GAMMA_BASE * Math.exp(CASCADE_BETA * xiGlobal) * avgIAM;

    this._xiGlobal = Math.round(xiGlobal * 1000) / 1000;
    this._cascadeBoost = Math.round(cascadeBoost * 1000) / 1000;

    this.stats.xiGlobal = this._xiGlobal;
    this.stats.cascadeBoost = this._cascadeBoost;

    if (this.verbose) {
      console.log(`  [CASCADE] ξ_global=${this._xiGlobal}, boost=${this._cascadeBoost}x (N=${all.length})`);
    }
  }

  /**
   * Void replenishment: when a pattern is deeply stuck (very low coherency),
   * find the nearest healthy pattern in the library and use its structure
   * as scaffolding — inject the skeleton of a working pattern to bootstrap recovery.
   */
  _voidReplenish(pattern) {
    const allPatterns = this.oracle.patterns.getAll();
    if (allPatterns.length === 0) return null;

    // Find the nearest healthy pattern by tag overlap + language match
    const patternTags = new Set(pattern.tags || []);
    let bestMatch = null;
    let bestScore = -1;

    for (const candidate of allPatterns) {
      if (candidate.language !== pattern.language) continue;
      const score = candidate.coherencyScore?.total ?? 0;
      if (score < CASCADE.VOID_SCAFFOLD_MIN_COHERENCY) continue;

      // Tag overlap
      const candidateTags = new Set(candidate.tags || []);
      const overlap = [...patternTags].filter(t => candidateTags.has(t)).length;
      const tagScore = patternTags.size > 0 ? overlap / patternTags.size : 0;

      // Combined: coherency * tag relevance
      const combined = score * VOID_REPLENISH_WEIGHTS.COHERENCY + tagScore * VOID_REPLENISH_WEIGHTS.TAG_RELEVANCE;
      if (combined > bestScore) {
        bestScore = combined;
        bestMatch = candidate;
      }
    }

    if (!bestMatch) return null;

    this.stats.voidReplenishments++;
    if (this.verbose) {
      console.log(`  [VOID] Scaffolding from ${bestMatch.name} (coherency ${bestMatch.coherencyScore?.total.toFixed(3)})`);
    }

    return bestMatch;
  }

  /**
   * Capture a failed pattern instead of discarding it.
   * Called when oracle.registerPattern() returns { registered: false }.
   */
  capture(pattern, failureReason, validation) {
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomBytes(8).toString('hex'),
      pattern: { ...pattern },
      failureReason,
      validation: validation || null,
      capturedAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',    // pending → healing → recycled | exhausted
      healHistory: [],
    };

    this._failed.push(entry);
    this.stats.captured++;

    // Persist to audit log for cross-session recovery
    this._persistCapture(entry);

    if (this.verbose) {
      console.log(`  [CAPTURE] ${pattern.name}: ${failureReason}`);
    }

    return entry;
  }

  /**
   * Get all captured failures.
   */
  getCaptured(filter = {}) {
    let items = [...this._failed];
    if (filter.status) items = items.filter(f => f.status === filter.status);
    if (filter.language) items = items.filter(f => f.pattern.language === filter.language);
    return items;
  }

  /**
   * Recycle all captured failures through the healing loop.
   * Returns a detailed report of what happened.
   */
  recycleFailed(options = {}) {
    const { maxPatterns = Infinity, language = null } = options;

    // Update global coherence before healing — cascade boost applies to all reflection calls
    this._updateGlobalCoherence();

    const pending = this._failed
      .filter(f => f.status === 'pending')
      .filter(f => !language || f.pattern.language === language)
      .slice(0, maxPatterns);

    const report = {
      processed: 0,
      healed: 0,
      variantsSpawned: 0,
      variantsAccepted: 0,
      exhausted: 0,
      cascadeBoost: this._cascadeBoost,
      xiGlobal: this._xiGlobal,
      details: [],
    };

    for (const entry of pending) {
      entry.status = 'healing';
      const result = this._healOne(entry);
      report.details.push(result);
      report.processed++;

      if (result.healed) {
        report.healed++;
        entry.status = 'recycled';
        this._persistHealResult(entry);
      } else {
        entry.status = 'exhausted';
        this._persistHealResult(entry);
        report.exhausted++;
      }

      // Generate variants from the original (even if healing failed)
      if (this.generateVariants && entry.pattern.language === 'javascript') {
        const variants = this._spawnVariants(entry);
        report.variantsSpawned += variants.spawned;
        report.variantsAccepted += variants.accepted;
      }
    }

    return report;
  }

  /**
   * Run the full recycling + variant generation pipeline on seeds.
   * This is the exponential growth entry point.
   *
   * Takes a list of seed patterns and:
   *   1. Tries to register each
   *   2. Captures failures
   *   3. Heals failures via reflection
   *   4. Generates variants from ALL successes
   *   5. Recursively processes variants (up to depth limit)
   *
   * @returns {{ registered, failed, recycled, variants, total, report }}
   */
  processSeeds(seeds, options = {}) {
    const { depth = VARIANT_GENERATION.DEPTH, maxVariantsPerPattern = VARIANT_GENERATION.MAX_PATTERNS_PER_LEVEL } = options;

    // Compute initial global coherence — this drives cascade amplification
    this._updateGlobalCoherence();

    const report = {
      registered: 0,
      failed: 0,
      recycled: 0,
      variants: { spawned: 0, accepted: 0 },
      approaches: { spawned: 0, accepted: 0 },
      xiGlobal: this._xiGlobal,
      cascadeBoost: this._cascadeBoost,
      depth,
      waves: [],
    };

    // Wave 0: Register all seeds
    const wave0 = { wave: 0, label: 'seeds', registered: 0, failed: 0, healed: 0, variants: 0 };
    const successfulPatterns = [];

    for (const seed of seeds) {
      // Check if already exists
      const existing = this.oracle.patterns.getAll().find(p => p.name === seed.name);
      if (existing) {
        wave0.registered++;
        report.registered++;
        successfulPatterns.push({ ...seed, id: existing.id });
        continue;
      }

      const result = this.oracle.registerPattern(seed);
      if (result.registered) {
        wave0.registered++;
        report.registered++;
        successfulPatterns.push({ ...seed, id: result.pattern.id });
        if (this.verbose) {
          console.log(`  [OK]   ${seed.name} — coherency ${result.validation.coherencyScore.total.toFixed(3)}`);
        }
      } else {
        wave0.failed++;
        report.failed++;
        this.capture(seed, result.reason, result.validation);
        if (this.verbose) {
          console.log(`  [FAIL] ${seed.name}: ${result.reason}`);
        }
      }
    }

    // Heal captured failures
    const recycleResult = this.recycleFailed();
    wave0.healed = recycleResult.healed;
    report.recycled += recycleResult.healed;
    report.waves.push(wave0);

    // Waves 1..depth: Generate variants from all successful patterns
    let currentPatterns = successfulPatterns.filter(p => p.language === 'javascript');
    for (let d = 1; d <= depth && currentPatterns.length > 0; d++) {
      const wave = { wave: d, label: `variants-depth-${d}`, registered: 0, failed: 0, healed: 0, variants: 0 };
      const nextWavePatterns = [];

      for (const pattern of currentPatterns.slice(0, maxVariantsPerPattern * VARIANT_GENERATION.BATCH_MULTIPLIER)) {
        // Language variants
        const langVariants = this._generateLanguageVariants(pattern);
        wave.variants += langVariants.length;
        report.variants.spawned += langVariants.length;

        for (const variant of langVariants) {
          const existing = this.oracle.patterns.getAll().find(p => p.name === variant.name);
          if (existing) {
            wave.registered++;
            continue;
          }

          const regResult = this.oracle.registerPattern(variant);
          if (regResult.registered) {
            wave.registered++;
            report.variants.accepted++;
            nextWavePatterns.push({ ...variant, id: regResult.pattern.id });
            if (this.verbose) {
              console.log(`  [VARIANT] ${variant.name} (${variant.language}) — coherency ${regResult.validation.coherencyScore.total.toFixed(3)}`);
            }
          } else {
            wave.failed++;
            this.capture(variant, regResult.reason, regResult.validation);
          }
        }

        // Approach alternatives (JS only for now)
        if (pattern.language === 'javascript') {
          const approachAlts = this._generateApproachAlternatives(pattern);
          for (const alt of approachAlts) {
            const existing = this.oracle.patterns.getAll().find(p => p.name === alt.name);
            if (existing) continue;

            const regResult = this.oracle.registerPattern(alt);
            if (regResult.registered) {
              report.approaches.accepted++;
              this.stats.approachSwaps++;
              nextWavePatterns.push({ ...alt, id: regResult.pattern.id });
              if (this.verbose) {
                console.log(`  [APPROACH] ${alt.name} — coherency ${regResult.validation.coherencyScore.total.toFixed(3)}`);
              }
            } else {
              this.capture(alt, regResult.reason, regResult.validation);
            }
            report.approaches.spawned++;
          }
        }
      }

      // Heal any new failures from this wave
      const waveRecycle = this.recycleFailed();
      wave.healed = waveRecycle.healed;
      wave.cascadeBoost = this._cascadeBoost;
      report.recycled += waveRecycle.healed;
      report.waves.push(wave);

      // Recompute global coherence after each wave — cascade compounds
      this._updateGlobalCoherence();

      currentPatterns = nextWavePatterns;
    }

    // Final state
    this._updateGlobalCoherence();
    report.total = this.oracle.patterns.getAll().length;
    report.xiGlobal = this._xiGlobal;
    report.cascadeBoost = this._cascadeBoost;
    report.voidReplenishments = this.stats.voidReplenishments;
    return report;
  }

  // ─── Internal: Heal one failed pattern via reflection ───

  _healOne(entry) {
    const pattern = entry.pattern;
    const detail = {
      name: pattern.name,
      language: pattern.language,
      originalReason: entry.failureReason,
      healed: false,
      voidScaffold: null,
      cascadeBoost: this._cascadeBoost,
      attempts: [],
    };

    for (let attempt = 0; attempt < this.maxHealAttempts; attempt++) {
      entry.attempts++;
      this.stats.totalAttempts++;

      let codeToHeal = pattern.code;

      // Void replenishment: when coherency is deeply stuck, inject scaffolding
      // from the nearest healthy pattern to bootstrap recovery
      if (attempt > 0 && entry.healHistory.length > 0) {
        const lastCoherence = entry.healHistory[entry.healHistory.length - 1].afterCoherence;
        if (lastCoherence < VOID_SCAFFOLD_THRESHOLD) {
          const scaffold = this._voidReplenish(pattern);
          if (scaffold) {
            // Inject the scaffold's structure as a comment-guide at the top
            // This gives the transforms something healthy to work from
            const scaffoldHint = `// Scaffold from ${scaffold.name} (coherency ${scaffold.coherencyScore?.total?.toFixed(3)})\n`;
            codeToHeal = scaffoldHint + pattern.code;
            detail.voidScaffold = scaffold.name;
          }
        }
      }

      // Run reflection with cascade boost from global coherence
      const reflection = reflectionLoop(codeToHeal, {
        language: pattern.language,
        maxLoops: this.maxRefineLoops,
        targetCoherence: this.targetCoherence,
        description: pattern.description,
        tags: pattern.tags,
        cascadeBoost: this._cascadeBoost,
      });

      const attemptDetail = {
        attempt: attempt + 1,
        beforeCoherence: reflection.reflection.I_AM,
        afterCoherence: reflection.reflection.finalCoherence,
        loops: reflection.loops,
        improvement: reflection.reflection.improvement,
        cascadeBoost: this._cascadeBoost,
      };

      // Strip scaffold hint from healed code if present
      let healedCode = reflection.code.replace(/\/\/\s*Scaffold from.*\n?/, '');

      // Try to register the healed code
      const healedPattern = {
        ...pattern,
        name: pattern.name,
        code: healedCode,
      };

      const regResult = this.oracle.registerPattern(healedPattern);
      if (regResult.registered) {
        attemptDetail.result = 'registered';
        attemptDetail.coherency = regResult.validation.coherencyScore.total;
        detail.healed = true;
        detail.healedAs = regResult.pattern.id;
        detail.finalCoherency = regResult.validation.coherencyScore.total;
        this.stats.healedViaReflection++;

        entry.healHistory.push(attemptDetail);
        detail.attempts.push(attemptDetail);

        // Update global coherence after successful heal — cascade compounds
        this._updateGlobalCoherence();

        if (this.verbose) {
          console.log(`  [HEALED] ${pattern.name} — attempt ${attempt + 1}, coherency ${attemptDetail.coherency.toFixed(3)} (cascade ${this._cascadeBoost}x)`);
        }
        return detail;
      }

      attemptDetail.result = 'still_failed';
      attemptDetail.reason = regResult.reason;
      entry.healHistory.push(attemptDetail);
      detail.attempts.push(attemptDetail);

      // Use healed code as input for next attempt
      pattern.code = healedCode;
    }

    this.stats.stillFailed++;
    if (this.verbose) {
      console.log(`  [EXHAUSTED] ${pattern.name} — ${this.maxHealAttempts} attempts, still failing`);
    }
    return detail;
  }

  // ─── Internal: Spawn language variants from a successful pattern ───

  _spawnVariants(entry) {
    const result = { spawned: 0, accepted: 0 };
    const pattern = entry.pattern;

    if (pattern.language !== 'javascript') return result;

    for (const lang of this.variantLanguages) {
      const variant = this._transpileToLanguage(pattern, lang);
      if (!variant) continue;

      result.spawned++;
      this.stats.variantsGenerated++;

      const existing = this.oracle.patterns.getAll().find(p => p.name === variant.name);
      if (existing) continue;

      const regResult = this.oracle.registerPattern(variant);
      if (regResult.registered) {
        result.accepted++;
        this.stats.variantsAccepted++;
        if (this.verbose) {
          console.log(`  [VARIANT] ${variant.name} (${lang}) registered`);
        }
      } else {
        // Capture variant failure for future recycling
        this.capture(variant, regResult.reason, regResult.validation);
      }
    }

    return result;
  }

  // ─── Internal: Generate language variants from a successful JS pattern ───

  _generateLanguageVariants(pattern) {
    if (pattern.language !== 'javascript') return [];

    const variants = [];
    for (const lang of this.variantLanguages) {
      const variant = this._transpileToLanguage(pattern, lang);
      if (variant) variants.push(variant);
    }
    return variants;
  }

  // ─── Internal: Transpile a JS pattern to another language ───

  _transpileToLanguage(pattern, targetLang) {
    if (targetLang === 'python') return this._toPython(pattern);
    if (targetLang === 'typescript') return this._toTypeScript(pattern);
    if (targetLang === 'go' || targetLang === 'rust') return this._toASTLanguage(pattern, targetLang);
    return null;
  }

  _toASTLanguage(pattern, targetLang) {
    const { transpile: astTranspile, generateGoTest, generateRustTest, verifyTranspilation } = require('../core/ast-transpiler');
    const result = astTranspile(pattern.code, targetLang);
    if (!result.success || !result.code) return null;

    // Extract the primary function name from the pattern
    const funcName = pattern.name ? pattern.name.replace(/-/g, '') : null;

    // Generate test code for the transpiled variant
    let testCode = null;
    if (pattern.testCode && funcName) {
      if (targetLang === 'go') {
        testCode = generateGoTest(result.code, pattern.testCode, funcName);
      } else if (targetLang === 'rust') {
        testCode = generateRustTest(result.code, pattern.testCode, funcName);
      }
    }

    // Attempt compilation verification (non-blocking — candidate stored either way)
    let verified = false;
    if (testCode) {
      try {
        const check = verifyTranspilation(result.code, testCode, targetLang);
        verified = check.compiled;
      } catch { /* compilation check failed, not fatal */ }
    }

    const suffix = targetLang === 'go' ? '-go' : '-rs';
    return {
      name: `${pattern.name}${suffix}`,
      code: result.code,
      language: targetLang,
      description: `${pattern.description || pattern.name} (${targetLang} via AST${verified ? ', verified' : ''})`,
      tags: [...(pattern.tags || []), 'variant', targetLang, 'ast-generated', ...(verified ? ['compile-verified'] : [])],
      patternType: pattern.patternType || 'utility',
      complexity: pattern.complexity || 'moderate',
      testCode,
      verified,
    };
  }

  _toPython(pattern) {
    const { code, testCode, name, description, tags, patternType } = pattern;

    // Bail on patterns that can't cleanly transpile to Python
    if (!canTranspileToPython(code)) return null;

    // Extract function signature
    const funcMatch = code.match(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/);
    if (!funcMatch) return null;

    const [, funcName, params] = funcMatch;
    // camelCase → snake_case: handles consecutive capitals (e.g., getHTTPClient → get_http_client)
    const pyName = funcName
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')
      .toLowerCase();

    // Convert JS body to Python (deep transform)
    let body = extractBody(code);
    body = jsToPythonBody(body);

    // Validate we got something reasonable
    if (!body.trim() || body.includes('function ') || body.includes('=>')) return null;

    const pyCode = `def ${pyName}(${jsToPythonParams(params)}):\n${indent(body, 4)}`;

    // Post-transpilation validation: reject if JS syntax leaked through
    if (/\bfunction\b/.test(pyCode) || /=>/.test(pyCode)) return null;
    if (/===|!==/.test(pyCode)) return null;
    if (/\bconst\b|\blet\b|\bvar\b/.test(pyCode)) return null;
    if (/Number\.\w+/.test(pyCode)) return null;
    if (/\bthis\./.test(pyCode)) return null;
    if (/\.push\(/.test(pyCode)) return null; // should have been converted to .append()
    if (/\bnew\s+\w+/.test(pyCode)) return null;
    if (/\.prototype\./.test(pyCode)) return null;
    // Reject leftover JS braces (Python uses colons + indentation)
    if (/[{}]/.test(pyCode)) return null;
    // Reject semicolons (not normal in Python)
    if (/;/.test(pyCode)) return null;
    // Reject dangling colons/brackets from broken ternary transpilation
    if (/\]\s*:/.test(pyCode) || /\belse\s*\]/.test(pyCode)) return null;
    // Reject broken slice patterns
    if (/\[\d+\s+if\b/.test(pyCode)) return null;
    // Reject Array.from (should be list())
    if (/Array\.from/.test(pyCode)) return null;
    // Reject .filter(), .map() etc. that weren't converted
    if (/\.\w+\([^)]*=>/.test(pyCode)) return null;

    // Convert test assertions
    let pyTest = '';
    if (testCode) {
      pyTest = jsToPythonTest(testCode, funcName, pyName);
    }

    if (!pyTest) return null;

    return {
      name: `${name}-py`,
      code: pyCode,
      testCode: pyTest,
      language: 'python',
      description: `${description} (Python variant)`,
      tags: [...(tags || []), 'variant', 'python'],
      patternType: patternType || 'utility',
      parentPattern: name,
    };
  }

  _toTypeScript(pattern) {
    const { code, testCode, name, description, tags, patternType } = pattern;

    let tsCode = code;

    // Extract function params with balanced parens
    const funcStart = tsCode.match(/function\s+(\w+)\s*\(/);
    if (funcStart) {
      const fname = funcStart[1];
      const paramStart = tsCode.indexOf('(', tsCode.indexOf(funcStart[0]));
      const paramEnd = findMatchingParen(tsCode, paramStart);
      if (paramEnd > paramStart) {
        const rawParams = tsCode.slice(paramStart + 1, paramEnd);
        // Only add types to simple params (no default values with parens)
        if (!rawParams.includes('new ') && !rawParams.includes('(')) {
          const typedParams = inferTypeScriptParams(rawParams, code);
          tsCode = tsCode.slice(0, paramStart + 1) + typedParams + tsCode.slice(paramEnd);
        }
      }
    }

    // var → let (not const — for-loop vars need reassignment)
    tsCode = tsCode.replace(/\bvar\s+/g, 'let ');

    // Fix: double `let` in for-init from var→let replacement (only in for-loop context)
    tsCode = tsCode.replace(/for\s*\(\s*let\s+let\b/g, 'for (let');

    return {
      name: `${name}-ts`,
      code: tsCode,
      testCode: testCode,
      language: 'typescript',
      description: `${description} (TypeScript variant)`,
      tags: [...(tags || []), 'variant', 'typescript'],
      patternType: patternType || 'utility',
      parentPattern: name,
    };
  }

  // ─── Internal: Generate approach alternative patterns ───

  _generateApproachAlternatives(pattern) {
    const alts = [];
    const code = pattern.code;

    for (const swap of APPROACH_SWAPS) {
      if (!swap.detect(code)) continue;

      // Try to transform the code using reflection with a hint
      const hinted = this._applyApproachSwap(pattern, swap);
      if (hinted) alts.push(hinted);
    }

    return alts;
  }

  _applyApproachSwap(pattern, swap) {
    // Use reflection with the approach hint baked into the code as a directive comment
    const hintedCode = `// APPROACH: ${swap.hint}\n${pattern.code}`;

    const reflection = reflectionLoop(hintedCode, {
      language: pattern.language,
      maxLoops: APPROACH_SWAP.REFINE_LOOPS,
      targetCoherence: APPROACH_SWAP.TARGET_COHERENCE,
      description: `${pattern.description} — ${swap.to} approach`,
      tags: [...(pattern.tags || []), swap.to],
    });

    // Strip the hint comment from the output
    let healedCode = reflection.code.replace(/\/\/\s*APPROACH:.*\n?/, '');
    if (healedCode.trim() === pattern.code.trim()) return null; // No change

    return {
      name: `${pattern.name}-${swap.to}`,
      code: healedCode,
      testCode: pattern.testCode,
      language: pattern.language,
      description: `${pattern.description} (${swap.to} approach)`,
      tags: [...(pattern.tags || []), swap.to, 'approach-variant'],
      patternType: pattern.patternType || 'utility',
      parentPattern: pattern.name,
    };
  }

  // ─── Continuous Generation Loop ───
  // Takes proven patterns, generates coherent variants, stores them as candidates.
  // This is how the library always grows: proven → coherency → candidates.

  /**
   * Generate candidates from all proven patterns.
   * Each proven pattern gets variant generation (language ports, iterative refinements).
   * Variants that pass coherency (but skip full test validation) become candidates.
   *
   * @param {object} options - { maxPatterns, languages, minCoherency, methods }
   * @returns {{ generated, stored, skipped, byMethod, byLanguage }}
   */
  // ─── Candidate Generation Helpers (extracted for simplicity) ───

  /**
   * Score and store a candidate if it meets coherency threshold.
   * @returns {boolean} true if stored
   */
  _tryStoreCandidate(candidate, report, knownNames, minCoherency, extraTags = []) {
    report.generated++;

    if (knownNames.has(candidate.name)) {
      report.duplicates++;
      return false;
    }

    // Viability gate for transpiled code
    if (candidate.language !== 'javascript') {
      const { isViableCode } = require('./test-synth');
      if (!isViableCode(candidate.code, candidate.language)) {
        report.skipped++;
        return false;
      }
    }

    const coherency = computeCoherencyScore(candidate.code, {
      language: candidate.language,
      testPassed: null,
      historicalReliability: 0.5,
    });

    if (coherency.total < minCoherency) {
      report.skipped++;
      return false;
    }

    this.oracle.patterns.addCandidate({
      name: candidate.name,
      code: candidate.code,
      language: candidate.language,
      patternType: candidate.patternType,
      description: candidate.description,
      tags: [...(candidate.tags || []), 'candidate', ...extraTags],
      coherencyTotal: coherency.total,
      coherencyScore: coherency,
      testCode: candidate.testCode,
      parentPattern: candidate.parentPattern,
      generationMethod: candidate.method,
    });

    report.stored++;
    knownNames.add(candidate.name);
    report.byMethod = report.byMethod || {};
    report.byLanguage = report.byLanguage || {};
    report.byMethod[candidate.method] = (report.byMethod[candidate.method] || 0) + 1;
    report.byLanguage[candidate.language] = (report.byLanguage[candidate.language] || 0) + 1;
    if (report.candidates) report.candidates.push(candidate.name);

    if (this.verbose) {
      console.log(`  [CANDIDATE] ${candidate.name} (${candidate.language}) — ${candidate.method}`);
    }

    return true;
  }

  /**
   * Generate language variant candidates from a single pattern.
   */
  _generateVariants(pattern, languages, report, knownNames, minCoherency, extraTags) {
    if (pattern.language !== 'javascript') return;

    for (const lang of languages) {
      const variant = this._transpileToLanguage(pattern, lang);
      if (!variant) continue;

      this._tryStoreCandidate({
        name: variant.name,
        code: variant.code,
        language: variant.language,
        patternType: variant.patternType,
        description: variant.description,
        tags: variant.tags,
        testCode: variant.testCode,
        parentPattern: pattern.name,
        method: 'variant',
      }, report, knownNames, minCoherency, extraTags);
    }
  }

  /**
   * Generate a refined candidate from a single pattern.
   */
  _generateIterativeRefine(pattern, report, knownNames, minCoherency, extraTags) {
    const refinedName = `${pattern.name}-refined`;
    if (knownNames.has(refinedName)) return;

    const reflection = reflectionLoop(pattern.code, {
      language: pattern.language,
      maxLoops: ITERATIVE_REFINE.REFINE_LOOPS,
      targetCoherence: ITERATIVE_REFINE.TARGET_COHERENCE,
      description: pattern.description,
      tags: pattern.tags,
      cascadeBoost: this._cascadeBoost,
    });

    if (reflection.code.trim() === pattern.code.trim()) return;

    this._tryStoreCandidate({
      name: refinedName,
      code: reflection.code,
      language: pattern.language,
      patternType: pattern.patternType,
      description: `${pattern.description} (refined)`,
      tags: [...(pattern.tags || []), 'auto-refined'],
      testCode: pattern.testCode,
      parentPattern: pattern.name,
      method: 'iterative-refine',
    }, report, knownNames, minCoherency, extraTags);
  }

  /**
   * Generate approach-swap candidates from a single pattern.
   */
  _generateApproachSwaps(pattern, report, knownNames, minCoherency) {
    if (pattern.language !== 'javascript') return;

    const alts = this._generateApproachAlternatives(pattern);
    for (const alt of alts) {
      this._tryStoreCandidate({
        name: alt.name,
        code: alt.code,
        language: alt.language,
        patternType: alt.patternType,
        description: alt.description,
        tags: alt.tags,
        testCode: alt.testCode,
        parentPattern: pattern.name,
        method: 'approach-swap',
      }, report, knownNames, minCoherency);
    }
  }

  // ─── Public Generation Methods ───

  generateCandidates(options = {}) {
    const {
      maxPatterns = Infinity,
      languages = this.variantLanguages,
      minCoherency = CANDIDATE_MIN_COHERENCY,
      methods = ['variant', 'iterative-refine', 'approach-swap'],
    } = options;

    this._updateGlobalCoherence();

    const report = {
      generated: 0, stored: 0, skipped: 0, duplicates: 0,
      byMethod: {}, byLanguage: {},
      cascadeBoost: this._cascadeBoost, xiGlobal: this._xiGlobal,
    };

    const proven = this.oracle.patterns.getAll();
    const existingCandidates = this.oracle.patterns.getCandidates();
    const knownNames = new Set([
      ...proven.map(p => p.name),
      ...existingCandidates.map(c => c.name),
    ]);

    const toProcess = proven.slice(0, maxPatterns);

    for (const pattern of toProcess) {
      // Skip patterns that can't produce viable candidates
      if (_shouldSkipForGeneration(pattern.code)) {
        report.skipped = (report.skipped || 0) + 1;
        continue;
      }
      if (methods.includes('variant')) {
        this._generateVariants(pattern, languages, report, knownNames, minCoherency, []);
      }
      if (methods.includes('iterative-refine')) {
        this._generateIterativeRefine(pattern, report, knownNames, minCoherency, []);
      }
      if (methods.includes('approach-swap')) {
        this._generateApproachSwaps(pattern, report, knownNames, minCoherency);
      }
    }

    return report;
  }

  /**
   * Generate candidates from a single pattern.
   * Called automatically when a pattern is proven (registered/submitted).
   */
  generateFromPattern(pattern, options = {}) {
    const {
      languages = this.variantLanguages,
      minCoherency = CANDIDATE_MIN_COHERENCY,
      methods = ['variant', 'iterative-refine'],
    } = options;

    const report = { generated: 0, stored: 0, skipped: 0, duplicates: 0, candidates: [] };

    // Skip patterns that can't produce viable candidates
    if (_shouldSkipForGeneration(pattern.code)) {
      report.skipped = 1;
      return report;
    }

    const proven = this.oracle.patterns.getAll();
    const existingCandidates = this.oracle.patterns.getCandidates();
    const knownNames = new Set([
      ...proven.map(p => p.name),
      ...existingCandidates.map(c => c.name),
    ]);

    if (methods.includes('variant')) {
      this._generateVariants(pattern, languages, report, knownNames, minCoherency, ['auto-generated']);
    }
    if (methods.includes('iterative-refine')) {
      this._generateIterativeRefine(pattern, report, knownNames, minCoherency, ['auto-generated']);
    }

    return report;
  }

  /**
   * Promote a candidate to a proven pattern by providing test proof.
   * The candidate's code gets run through the full oracle pipeline with
   * the provided testCode. If it passes, it becomes a proven pattern.
   *
   * @param {string} candidateId - ID of the candidate to promote
   * @param {string} testCode - Test code to prove the candidate works
   * @returns {{ promoted, pattern?, reason? }}
   */
  promoteWithProof(candidateId, testCode) {
    const candidate = this.oracle.patterns.getCandidates().find(c => c.id === candidateId);
    if (!candidate) {
      return { promoted: false, reason: 'Candidate not found' };
    }

    // Run through full oracle validation with test proof
    const result = this.oracle.registerPattern({
      name: candidate.name,
      code: candidate.code,
      language: candidate.language,
      description: candidate.description,
      tags: (candidate.tags || []).filter(t => t !== 'candidate'),
      patternType: candidate.patternType,
      testCode: testCode || candidate.testCode,
    });

    if (result.registered) {
      // Mark candidate as promoted
      this.oracle.patterns.promoteCandidate(candidateId);

      if (this.verbose) {
        console.log(`  [PROMOTED] ${candidate.name} → proven (coherency ${result.validation.coherencyScore.total.toFixed(3)})`);
      }

      return {
        promoted: true,
        pattern: result.pattern,
        coherency: result.validation.coherencyScore.total,
      };
    }

    return {
      promoted: false,
      reason: result.reason,
    };
  }

  /**
   * Auto-promote candidates that already have testCode by running them
   * through the full validation pipeline.
   *
   * @returns {{ attempted, promoted, failed, details }}
   */
  autoPromote() {
    const candidates = this.oracle.patterns.getCandidates();
    const withTests = candidates.filter(c => c.testCode);

    const report = {
      attempted: 0,
      promoted: 0,
      failed: 0,
      details: [],
    };

    for (const candidate of withTests) {
      // Skip if already exists as a proven pattern
      const existing = this.oracle.patterns.getAll().find(p => p.name === candidate.name);
      if (existing) {
        this.oracle.patterns.promoteCandidate(candidate.id);
        continue;
      }

      report.attempted++;
      const result = this.promoteWithProof(candidate.id, candidate.testCode);

      if (result.promoted) {
        report.promoted++;
        report.details.push({ name: candidate.name, status: 'promoted', coherency: result.coherency });
      } else {
        report.failed++;
        report.details.push({ name: candidate.name, status: 'failed', reason: result.reason });
      }
    }

    return report;
  }

  /**
   * Format a recycler report for display.
   */
  static formatReport(report) {
    const lines = [];
    lines.push('Pattern Recycler Report');
    lines.push('=======================');
    lines.push('');
    lines.push(`Seeds processed:      ${report.registered + report.failed}`);
    lines.push(`  Registered:         ${report.registered}`);
    lines.push(`  Failed:             ${report.failed}`);
    lines.push(`  Recycled (healed):  ${report.recycled}`);
    lines.push('');
    lines.push(`Variants spawned:     ${report.variants.spawned}`);
    lines.push(`  Accepted:           ${report.variants.accepted}`);
    lines.push('');
    lines.push(`Approach alts:        ${report.approaches.spawned}`);
    lines.push(`  Accepted:           ${report.approaches.accepted}`);
    lines.push('');
    lines.push(`Depth:                ${report.depth}`);
    lines.push(`Total in library:     ${report.total}`);
    lines.push('');
    lines.push(`Global coherence:     ${report.xiGlobal ?? '?'}`);
    lines.push(`Cascade boost:        ${report.cascadeBoost ?? 1}x`);
    if (report.voidReplenishments) {
      lines.push(`Void replenishments:  ${report.voidReplenishments}`);
    }
    lines.push('');

    if (report.waves.length > 0) {
      lines.push('Waves:');
      for (const w of report.waves) {
        const boost = w.cascadeBoost ? ` (cascade ${w.cascadeBoost}x)` : '';
        lines.push(`  [${w.wave}] ${w.label}: +${w.registered} registered, ${w.failed} failed, ${w.healed} healed, ${w.variants || 0} variants${boost}`);
      }
    }

    return lines.join('\n');
  }
}

module.exports = { PatternRecycler, APPROACH_SWAPS, LANG_TEMPLATES };
