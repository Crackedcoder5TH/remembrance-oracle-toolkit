/**
 * Pattern Recycler — the exponential growth engine.
 *
 * Instead of discarding failed patterns, the recycler:
 *
 *   1. CAPTURES failures with full context (why it failed, how close it was)
 *   2. HEALS them via SERF reflection (simplify, secure, readable, unify, correct)
 *   3. RE-VALIDATES healed code through the full oracle pipeline
 *   4. GENERATES VARIANTS from successful patterns (language ports, approach swaps)
 *   5. FEEDS variants back through the loop — exponential pattern growth
 *
 * The recycler is a meta-loop that wraps the oracle:
 *
 *   Code → Validate → Store (success)
 *                ↓
 *            Capture → SERF Heal → Re-validate → Store (recycled)
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

const { reflectionLoop } = require('./reflection');
const { validateCode } = require('./validator');
const { computeCoherencyScore, detectLanguage } = require('./coherency');

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

// ─── Cascade Constants ───

const CASCADE_BETA = 2.5;             // Exponential scaling factor for global coherence
const CASCADE_GAMMA_BASE = 0.05;      // Base cascade amplification strength
const VOID_SCAFFOLD_THRESHOLD = 0.3;  // Below this coherency, inject scaffolding from library

class PatternRecycler {
  constructor(oracle, options = {}) {
    this.oracle = oracle;
    this.maxHealAttempts = options.maxHealAttempts || 3;
    this.maxSerfLoops = options.maxSerfLoops || 5;
    this.targetCoherence = options.targetCoherence || 0.9;
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
      healedViaSERF: 0,
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
      if (score < 0.8) continue;  // Only use high-coherency scaffolds

      // Tag overlap
      const candidateTags = new Set(candidate.tags || []);
      const overlap = [...patternTags].filter(t => candidateTags.has(t)).length;
      const tagScore = patternTags.size > 0 ? overlap / patternTags.size : 0;

      // Combined: coherency * tag relevance
      const combined = score * 0.4 + tagScore * 0.6;
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
   * Recycle all captured failures through the SERF healing loop.
   * Returns a detailed report of what happened.
   */
  recycleFailed(options = {}) {
    const { maxPatterns = Infinity, language = null } = options;

    // Update global coherence before healing — cascade boost applies to all SERF calls
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
      } else {
        entry.status = 'exhausted';
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
   *   3. Heals failures via SERF
   *   4. Generates variants from ALL successes
   *   5. Recursively processes variants (up to depth limit)
   *
   * @returns {{ registered, failed, recycled, variants, total, report }}
   */
  processSeeds(seeds, options = {}) {
    const { depth = 2, maxVariantsPerPattern = 3 } = options;

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

      for (const pattern of currentPatterns.slice(0, maxVariantsPerPattern * 10)) {
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

  // ─── Internal: Heal one failed pattern via SERF ───

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
            // This gives SERF's transforms something healthy to work from
            const scaffoldHint = `// Scaffold from ${scaffold.name} (coherency ${scaffold.coherencyScore?.total?.toFixed(3)})\n`;
            codeToHeal = scaffoldHint + pattern.code;
            detail.voidScaffold = scaffold.name;
          }
        }
      }

      // Run SERF reflection with cascade boost from global coherence
      const reflection = reflectionLoop(codeToHeal, {
        language: pattern.language,
        maxLoops: this.maxSerfLoops,
        targetCoherence: this.targetCoherence,
        description: pattern.description,
        tags: pattern.tags,
        cascadeBoost: this._cascadeBoost,
      });

      const attemptDetail = {
        attempt: attempt + 1,
        beforeCoherence: reflection.serf.I_AM,
        afterCoherence: reflection.serf.finalCoherence,
        loops: reflection.loops,
        improvement: reflection.serf.improvement,
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
        this.stats.healedViaSERF++;

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
    const code = pattern.code;
    const testCode = pattern.testCode;

    if (targetLang === 'python') return this._toPython(pattern);
    if (targetLang === 'typescript') return this._toTypeScript(pattern);
    return null;
  }

  _toPython(pattern) {
    const { code, testCode, name, description, tags, patternType } = pattern;

    // Bail on patterns that can't cleanly transpile to Python
    if (!canTranspileToPython(code)) return null;

    // Extract function signature
    const funcMatch = code.match(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/);
    if (!funcMatch) return null;

    const [, funcName, params] = funcMatch;
    const pyName = funcName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

    // Convert JS body to Python (deep transform)
    let body = extractBody(code);
    body = jsToPythonBody(body);

    // Validate we got something reasonable
    if (!body.trim() || body.includes('function ') || body.includes('=>')) return null;

    const pyCode = `def ${pyName}(${jsToPythonParams(params)}):\n${indent(body, 4)}`;

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

    // Fix: let in for-init that's already let
    tsCode = tsCode.replace(/for\s*\(\s*let\s+let\s+/g, 'for (let ');

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

      // Try to transform the code using SERF with a hint
      const hinted = this._applyApproachSwap(pattern, swap);
      if (hinted) alts.push(hinted);
    }

    return alts;
  }

  _applyApproachSwap(pattern, swap) {
    // Use SERF reflection with the approach hint baked into the code as a directive comment
    const hintedCode = `// APPROACH: ${swap.hint}\n${pattern.code}`;

    const reflection = reflectionLoop(hintedCode, {
      language: pattern.language,
      maxLoops: 2,
      targetCoherence: 0.85,
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

// ─── JS → Python Helpers ───

/**
 * Check whether a JS function is simple enough to transpile to Python.
 * Reject patterns that use: regex literals, typeof, closures, new Set/Map,
 * prototype methods, Promise/async, class syntax, arrow functions with closures.
 */
function canTranspileToPython(code) {
  // Reject regex literals (Python uses re module, not /regex/)
  if (/\/[^/\n]+\/[gimsuy]*/.test(code) && !/\/\//g.test(code.replace(/\/[^/\n]+\/[gimsuy]*/g, ''))) return false;
  // More direct: any regex literal usage
  if (code.includes('.replace(/') || code.includes('.match(/') || code.includes('.test(/') || code.includes('.search(/')) return false;

  // Reject typeof (no Python equivalent in same form)
  if (/\btypeof\b/.test(code)) return false;

  // Reject closures / returning functions
  if (/return\s+function/.test(code)) return false;
  if (/return\s*\(?\s*\w+\s*\)?\s*=>/.test(code)) return false;

  // Reject new Set/Map/WeakMap (Python has equivalents but transpiling is complex)
  if (/new\s+(?:Set|Map|WeakMap|WeakSet)/.test(code)) return false;

  // Reject Promise/async/await
  if (/\b(?:Promise|async|await)\b/.test(code)) return false;

  // Reject class syntax
  if (/\bclass\s+\w+/.test(code)) return false;

  // Reject .prototype, Object.keys/values/entries, JSON.
  if (/\bObject\.(?:keys|values|entries|assign|create|freeze|defineProperty)/.test(code)) return false;
  if (/\bJSON\./.test(code)) return false;

  // Reject arrow functions in body (used as callbacks)
  if (/=>\s*\{/.test(code) || /=>\s*[^{]/.test(code)) return false;

  // Reject spread operator
  if (/\.\.\./.test(code)) return false;

  // Reject for...of, for...in (complex iteration)
  if (/for\s*\(\s*(?:const|let|var)\s+\w+\s+(?:of|in)\s+/.test(code)) return false;

  // Reject ternary with complex nesting
  const ternaries = (code.match(/\?[^:]+:/g) || []).length;
  if (ternaries > 2) return false;

  // Reject >>> (unsigned right shift — no Python equivalent)
  if (/>>>/.test(code)) return false;

  // Reject .split('') — empty string split doesn't work in Python
  if (/\.split\s*\(\s*['"]['"]/.test(code)) return false;

  // Reject .join('') — needs list(), not direct method
  if (/\.join\s*\(/.test(code)) return false;

  // Reject inline ternary used in return with complex conditions
  if (/return\s+\w+\s*\?.*\?/.test(code)) return false;

  // Reject multi-variable declaration (let a = 0, b = 0)
  if (/(?:const|let|var)\s+\w+\s*=\s*[^,;]+,\s*\w+\s*=/.test(code)) return false;

  // Reject while loops with assignment in condition
  if (/while\s*\([^)]*=(?!=)/.test(code)) return false;

  // Reject .toUpperCase/.toLowerCase (Python uses .upper()/.lower())
  if (/\.toUpperCase\(\)/.test(code) || /\.toLowerCase\(\)/.test(code)) return false;

  // Reject single-line for loops (body on same line as for — hard to indent for Python)
  if (/for\s*\([^)]+\)\s+\w/.test(code) && !/for\s*\([^)]+\)\s*\{/.test(code)) return false;

  // Reject || used as default assignment (ch = ch || ' ') — Python `or` semantics differ
  if (/=\s*\w+\s*\|\|/.test(code)) return false;

  // Reject .length in comparisons (Python len() shadowing issues with param names)
  if (/\w+\.length\s*<\s*\w+/.test(code) && /function\s+\w+\([^)]*\blen\b/.test(code)) return false;

  return true;
}

function extractBody(jsFunc) {
  const start = jsFunc.indexOf('{');
  const end = jsFunc.lastIndexOf('}');
  if (start === -1 || end === -1) return jsFunc;
  return jsFunc.slice(start + 1, end).trim();
}

function jsToPythonParams(params) {
  return params
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      // Handle default values
      if (p.includes('=')) {
        const [name, val] = p.split('=').map(s => s.trim());
        const pyVal = val === 'null' ? 'None'
          : val === 'undefined' ? 'None'
          : val === 'true' ? 'True'
          : val === 'false' ? 'False'
          : val;
        return `${name}=${pyVal}`;
      }
      return p;
    })
    .join(', ');
}

function jsToPythonBody(body) {
  // Split into lines for line-by-line processing
  const lines = body.split('\n');
  const pyLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Skip empty braces-only lines
    if (trimmed === '{' || trimmed === '}' || trimmed === '') {
      if (trimmed === '') pyLines.push('');
      continue;
    }

    // Get indentation
    const indentMatch = line.match(/^(\s*)/);
    const pad = indentMatch ? indentMatch[1] : '';

    let py = trimmed;

    // Remove trailing semicolons
    py = py.replace(/;\s*$/, '');

    // Remove trailing braces (closing)
    py = py.replace(/\s*\}\s*$/, '');

    // const/let/var → remove
    py = py.replace(/\b(?:const|let|var)\s+/g, '');

    // === → ==, !== → !=
    py = py.replace(/===/g, '==').replace(/!==/g, '!=');

    // null/undefined → None
    py = py.replace(/\bnull\b/g, 'None').replace(/\bundefined\b/g, 'None');

    // true/false → True/False
    py = py.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');

    // .length → len()
    py = py.replace(/(\w+)\.length/g, 'len($1)');

    // Math builtins
    py = py.replace(/Math\.max\(/g, 'max(');
    py = py.replace(/Math\.min\(/g, 'min(');
    py = py.replace(/Math\.floor\(/g, 'int(');
    py = py.replace(/Math\.ceil\(/g, '-(-$1 // 1)(');  // Simplified
    py = py.replace(/Math\.abs\(/g, 'abs(');
    py = py.replace(/Math\.round\(/g, 'round(');
    py = py.replace(/Math\.pow\(([^,]+),\s*([^)]+)\)/g, '$1 ** $2');
    py = py.replace(/Math\.sqrt\(/g, 'int($1 ** 0.5)('); // Simplified

    // .push(x) → .append(x)
    py = py.replace(/\.push\(/g, '.append(');

    // .pop() stays the same
    // .shift() → .pop(0)
    py = py.replace(/\.shift\(\)/g, '.pop(0)');

    // .slice(a, b) → [a:b]
    py = py.replace(/\.slice\((\w+)(?:,\s*(\w+))?\)/g, (_, a, b) => b ? `[${a}:${b}]` : `[${a}:]`);

    // .concat(b) → + b
    py = py.replace(/\.concat\((\w+)\)/g, ' + $1');

    // Simple ternary: a ? b : c → b if a else c
    py = py.replace(/^(return\s+)?(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/, (_, ret, cond, ifTrue, ifFalse) => {
      return `${ret || ''}${ifTrue} if ${cond} else ${ifFalse}`;
    });

    // for (let i = 0; i < n; i++) { → for i in range(n):
    const forMatch = py.match(/^for\s*\(\s*(\w+)\s*=\s*(\d+)\s*;\s*\1\s*<\s*(\w+)\s*;\s*\1\+\+\s*\)\s*\{?\s*$/);
    if (forMatch) {
      const [, varName, start, end] = forMatch;
      py = start === '0' ? `for ${varName} in range(${end}):` : `for ${varName} in range(${start}, ${end}):`;
      pyLines.push(pad + py);
      continue;
    }

    // for (let i = n; i >= 0; i--) → for i in range(n, -1, -1):
    const forDownMatch = py.match(/^for\s*\(\s*(\w+)\s*=\s*(\w+)\s*;\s*\1\s*>=\s*(\w+)\s*;\s*\1--\s*\)\s*\{?\s*$/);
    if (forDownMatch) {
      const [, varName, start, end] = forDownMatch;
      const endVal = end === '0' ? '-1' : `${end} - 1`;
      py = `for ${varName} in range(${start}, ${endVal}, -1):`;
      pyLines.push(pad + py);
      continue;
    }

    // if (...) { → if ...:
    if (/^if\s*\((.+)\)\s*\{?\s*$/.test(py)) {
      py = py.replace(/^if\s*\((.+)\)\s*\{?\s*$/, 'if $1:');
    }

    // } else if (...) { → elif ...:
    if (/^(?:\}\s*)?else\s+if\s*\((.+)\)\s*\{?\s*$/.test(py)) {
      py = py.replace(/^(?:\}\s*)?else\s+if\s*\((.+)\)\s*\{?\s*$/, 'elif $1:');
    }

    // } else { → else:
    if (/^(?:\}\s*)?else\s*\{?\s*$/.test(py)) {
      py = 'else:';
    }

    // while (...) { → while ...:
    if (/^while\s*\((.+)\)\s*\{?\s*$/.test(py)) {
      py = py.replace(/^while\s*\((.+)\)\s*\{?\s*$/, 'while $1:');
    }

    // Single-line if: if (cond) return x; → if cond: return x
    if (/^if\s*\((.+)\)\s+return\s+(.+)$/.test(py)) {
      py = py.replace(/^if\s*\((.+)\)\s+return\s+(.+)$/, 'if $1:\n' + pad + '    return $2');
    }

    // ++ / --
    py = py.replace(/(\w+)\+\+/, '$1 += 1');
    py = py.replace(/(\w+)--/, '$1 -= 1');

    // || for defaults → or
    py = py.replace(/\s*\|\|\s*/g, ' or ');
    // && → and
    py = py.replace(/\s*&&\s*/g, ' and ');
    // ! → not (at word boundary)
    py = py.replace(/!\s*(\w)/g, 'not $1');

    // Remove remaining { at end
    py = py.replace(/\s*\{\s*$/, ':');

    // Skip pure-brace lines after processing
    if (py.trim() === '' || py.trim() === ':') continue;

    pyLines.push(pad + py);
  }

  // Clean up
  let result = pyLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim() || 'pass';
}

function jsToPythonTest(testCode, jsFuncName, pyFuncName) {
  const lines = testCode.split('\n').filter(l => l.trim());
  const pyLines = [];

  for (const line of lines) {
    // if (expr !== expected) throw → assert expr == expected
    const throwMatch = line.match(/if\s*\((.+?)\s*(!==?)\s*(.+?)\)\s*throw/);
    if (throwMatch) {
      let [, left, op, right] = throwMatch;
      left = left.replace(new RegExp(`\\b${jsFuncName}\\b`, 'g'), pyFuncName);
      right = right.replace(/\).*$/, ')').replace(/\s*\)\s*$/, '');

      // Fix right side — remove trailing stuff after the value
      const rightClean = right.replace(/\)\s*throw.*$/, '');

      // JS arrays to Python lists
      left = jsArrayToPy(left);
      const rightPy = jsArrayToPy(rightClean);

      // Translate values
      const leftPy = left
        .replace(/===/g, '==').replace(/!==/g, '!=')
        .replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False')
        .replace(/\bnull\b/g, 'None');

      const op2 = op === '!==' ? '!=' : op === '===' ? '==' : op;
      const assertOp = op2 === '!==' || op2 === '!=' ? '!=' : '==';

      pyLines.push(`assert ${leftPy} ${assertOp} ${rightPy}`);
      continue;
    }

    // Direct assertion: if (!expr) throw
    const negMatch = line.match(/if\s*\(\s*!\s*(.+?)\s*\)\s*throw/);
    if (negMatch) {
      let expr = negMatch[1].replace(new RegExp(`\\b${jsFuncName}\\b`, 'g'), pyFuncName);
      expr = jsArrayToPy(expr);
      pyLines.push(`assert ${expr}`);
      continue;
    }
  }

  return pyLines.length > 0 ? pyLines.join('\n') : '';
}

function jsArrayToPy(str) {
  // Convert [1, 2, 3] (JS array literals are the same in Python)
  // Convert .length to len()
  let result = str;
  result = result.replace(/(\w+)\.length/g, 'len($1)');
  result = result.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');
  result = result.replace(/\bnull\b/g, 'None');
  return result;
}

// ─── TypeScript Type Inference ───

function inferTypeScriptParams(params, code) {
  return params
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(param => {
      const name = param.split('=')[0].trim();

      // Infer from usage in code
      if (/\barray\b/i.test(name) || code.includes(`${name}.length`) || code.includes(`${name}[`) || code.includes(`${name}.map`)) {
        return `${name}: any[]`;
      }
      if (/\bstr\b|string|text|name|desc/i.test(name) || code.includes(`${name}.split`) || code.includes(`${name}.trim`)) {
        return `${name}: string`;
      }
      if (/\bnum\b|count|index|size|len|max|min|limit|places|start|end/i.test(name)) {
        return `${name}: number`;
      }
      if (/\bfn\b|func|callback|predicate|handler/i.test(name)) {
        return `${name}: Function`;
      }
      if (/\bobj\b|options|config|opts/i.test(name)) {
        return `${name}: Record<string, any>`;
      }
      if (param.includes('=')) {
        const [, defVal] = param.split('=').map(s => s.trim());
        if (defVal === 'true' || defVal === 'false') return `${name}: boolean`;
        if (/^\d+$/.test(defVal)) return `${name}: number`;
        if (/^['"]/.test(defVal)) return `${name}: string`;
        if (defVal === '[]') return `${name}: any[]`;
        if (defVal === '{}') return `${name}: Record<string, any>`;
      }
      return `${name}: any`;
    })
    .join(', ');
}

// ─── Utility: find matching closing paren ───

function findMatchingParen(str, openPos) {
  let depth = 0;
  for (let i = openPos; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

module.exports = { PatternRecycler, APPROACH_SWAPS, LANG_TEMPLATES };
