/**
 * Pattern-Aware Code Generator
 *
 * Describe what you need in natural language, and the generator:
 *   1. SEARCH  — Find matching patterns via hybrid search (keyword + semantic)
 *   2. DECIDE  — PULL (use as-is), EVOLVE (adapt), or GENERATE (write fresh)
 *   3. ADAPT   — Transform pulled/evolved code to fit the target context
 *   4. HEAL    — Run SERF reflection to ensure quality meets threshold
 *   5. CASCADE — Validate against Void Compressor substrate for cross-domain resonance
 *   6. EMIT    — Return generated code with full provenance + confidence
 *
 * Built on harvested ecosystem patterns:
 *   - swarm-consensus-builder, swarm-error-recovery, swarm-task-queue
 *   - aes256-gcm-key-store, env-file-parser-merger, oracle-connector-bridge
 *   - reflector-self-healing-engine, rate-limiter-token-bucket
 *
 * @module pattern-generator
 */

const crypto = require('crypto');

const DECISION_THRESHOLDS = {
  PULL: 0.68,
  EVOLVE: 0.50,
};

// ─── Step 1: SEARCH — Find relevant patterns ──────────────────────

/**
 * Search the oracle's pattern store for matches.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {string} description - Natural language description of what's needed
 * @param {object} options - { language, tags, limit }
 * @returns {object[]} Ranked matches with scores
 */
function searchPatterns(oracle, description, options = {}) {
  const { language, tags = [], limit = 5 } = options;

  // Try structured search first (more precise)
  let results = [];
  if (typeof oracle.search === 'function') {
    results = oracle.search(description, {
      limit: limit + 3,
      language,
      mode: 'hybrid',
    });
  }

  // Filter by tags if provided
  if (tags.length > 0 && results.length > 0) {
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    results = results.filter(r => {
      const patternTags = (r.tags || []).map(t => t.toLowerCase());
      return patternTags.some(t => tagSet.has(t));
    });
  }

  return results.slice(0, limit).map(r => ({
    id: r.id,
    name: r.name,
    code: r.code,
    language: r.language,
    description: r.description,
    tags: r.tags || [],
    coherency: r.coherencyScore?.total || r.coherency || 0,
    patternType: r.patternType || r.pattern_type || 'utility',
  }));
}

// ─── Step 2: DECIDE — PULL / EVOLVE / GENERATE ────────────────────

/**
 * Make a decision based on best match quality.
 *
 * @param {object[]} matches - From searchPatterns()
 * @param {object} options - { description, language }
 * @returns {object} { decision, pattern, confidence, reasoning }
 */
function decideStrategy(matches, options = {}) {
  if (!matches || matches.length === 0) {
    const __retVal = {
      decision: 'GENERATE',
      pattern: null,
      confidence: 0,
      reasoning: 'No matching patterns found — generate fresh code',
    };
    // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.confidence || 0)), source: 'oracle:pattern-generator:decideStrategy' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
    return __retVal;
  }

  const best = matches[0];
  const score = best.coherency;

  // Check language match bonus
  const langMatch = best.language === options.language;
  const adjustedScore = langMatch ? score : score * 0.85;

  if (adjustedScore >= DECISION_THRESHOLDS.PULL) {
    return {
      decision: 'PULL',
      pattern: best,
      confidence: Math.min(1, adjustedScore),
      reasoning: `High coherency (${adjustedScore.toFixed(3)}). Pattern "${best.name}" matches well — use as-is${langMatch ? '' : ' (cross-language adaptation needed)'}`,
    };
  }

  if (adjustedScore >= DECISION_THRESHOLDS.EVOLVE) {
    return {
      decision: 'EVOLVE',
      pattern: best,
      confidence: adjustedScore,
      reasoning: `Moderate coherency (${adjustedScore.toFixed(3)}). Pattern "${best.name}" is a good starting point — adapt and improve`,
    };
  }

  return {
    decision: 'GENERATE',
    pattern: best,
    confidence: adjustedScore,
    reasoning: `Low coherency (${adjustedScore.toFixed(3)}). Pattern "${best.name}" is weak — generate fresh code informed by pattern structure`,
  };
}

// ─── Step 3: ADAPT — Transform pattern for target context ─────────

/**
 * Adapt a pulled/evolved pattern to fit the target description.
 *
 * @param {object} decision - From decideStrategy()
 * @param {object} context - { description, language, moduleName, exportStyle }
 * @returns {object} { code, adaptations }
 */
function adaptPattern(decision, context = {}) {
  if (!decision.pattern || decision.decision === 'GENERATE') {
    return generateSkeleton(context);
  }

  let code = decision.pattern.code;
  const adaptations = [];

  // For PULL: return as-is (but add provenance header)
  if (decision.decision === 'PULL') {
    const header = buildProvenanceHeader(decision.pattern, context);
    return {
      code: header + code,
      adaptations: ['provenance-header'],
      source: decision.pattern.name,
      decision: 'PULL',
    };
  }

  // For EVOLVE: apply transformations
  // 1. Module name adaptation
  if (context.moduleName) {
    const oldName = decision.pattern.name.replace(/[-_]/g, '');
    const newName = context.moduleName.replace(/[-_]/g, '');
    if (oldName !== newName) {
      // Replace class/function names that match the pattern name
      const nameRegex = new RegExp(`\\b${escapeRegex(capitalize(oldName))}\\b`, 'g');
      if (nameRegex.test(code)) {
        code = code.replace(nameRegex, capitalize(newName));
        adaptations.push(`renamed: ${capitalize(oldName)} → ${capitalize(newName)}`);
      }
    }
  }

  // 2. Export style adaptation
  if (context.exportStyle === 'esm' && code.includes('module.exports')) {
    code = code
      .replace(/module\.exports\s*=\s*\{([^}]+)\}/, (_, exports) => {
        const names = exports.split(',').map(n => n.trim().split(':')[0].trim()).filter(Boolean);
        return `export { ${names.join(', ')} }`;
      })
      .replace(/const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g, 'import $1 from \'$2\'');
    adaptations.push('cjs → esm conversion');
  }

  // 3. Language cross-compilation hints
  if (context.language && context.language !== decision.pattern.language) {
    const header = `// Evolved from ${decision.pattern.language} pattern: ${decision.pattern.name}\n`;
    const hint = `// TODO: This pattern was originally in ${decision.pattern.language}.\n// Structural adaptation applied — verify language-specific idioms.\n\n`;
    code = header + hint + code;
    adaptations.push(`cross-language: ${decision.pattern.language} → ${context.language}`);
  }

  const header = buildProvenanceHeader(decision.pattern, context);
  return {
    code: header + code,
    adaptations,
    source: decision.pattern.name,
    decision: 'EVOLVE',
  };
}

/**
 * Generate a code skeleton when no pattern matches.
 */
function generateSkeleton(context) {
  const { description = 'Generated module', language = 'javascript', moduleName = 'generated' } = context;
  const name = capitalize(moduleName.replace(/[-_]/g, ''));

  const skeletons = {
    javascript: `'use strict';

/**
 * ${description}
 *
 * @generated by Pattern-Aware Code Generator (no pattern match)
 */

class ${name} {
  constructor(options = {}) {
    this._options = options;
  }

  /**
   * Main entry point.
   * @param {*} input
   * @returns {*} result
   */
  execute(input) {
    // TODO: Implement ${description}
    throw new Error('Not implemented');
  }
}

module.exports = { ${name} };
`,
    python: `"""
${description}

Generated by Pattern-Aware Code Generator (no pattern match).
"""


class ${name}:
    def __init__(self, **options):
        self._options = options

    def execute(self, input_data):
        """Main entry point."""
        # TODO: Implement ${description}
        raise NotImplementedError("${description}")
`,
  };

  return {
    code: skeletons[language] || skeletons.javascript,
    adaptations: ['skeleton-generated'],
    source: null,
    decision: 'GENERATE',
  };
}

// ─── Step 4: HEAL — SERF reflection loop ──────────────────────────

/**
 * Run the SERF healing loop on generated/adapted code.
 *
 * @param {string} code - Code to heal
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - { language, maxLoops, targetCoherence }
 * @returns {object} { code, coherency, improved, loops }
 */
function healCode(code, oracle, options = {}) {
  const { language = 'javascript', maxLoops = 3, targetCoherence = 0.80 } = options;

  // Score current state
  let currentScore = 0;
  if (typeof oracle.scoreCoherency === 'function') {
    const scored = oracle.scoreCoherency(code, { language });
    currentScore = scored.total || scored.composite || 0;
  } else if (typeof oracle.computeCoherencyScore === 'function') {
    const scored = oracle.computeCoherencyScore(code, { language });
    currentScore = scored.total || 0;
  }

  if (currentScore >= targetCoherence) {
    return { code, coherency: currentScore, improved: false, loops: 0 };
  }

  // Try reflection loop
  if (typeof oracle.reflect === 'function') {
    const result = oracle.reflect(code, { language, maxIterations: maxLoops, targetCoherence });
    const healedCode = result.finalCode || result.code || code;
    let healedScore = currentScore;
    if (typeof oracle.scoreCoherency === 'function') {
      healedScore = (oracle.scoreCoherency(healedCode, { language })).total || 0;
    }

    return {
      code: healedCode,
      coherency: healedScore,
      improved: healedScore > currentScore,
      loops: result.loops || result.iterations || 0,
      delta: healedScore - currentScore,
    };
  }

  return { code, coherency: currentScore, improved: false, loops: 0 };
}

// ─── Step 5: CASCADE — Void Compressor resonance ──────────────────

/**
 * Send code to Void Compressor for cross-domain resonance analysis.
 *
 * @param {string} code - Code to cascade
 * @param {string} name - Label for the cascade
 * @param {string} voidUrl - Void Compressor API URL
 * @returns {object|null} Cascade results
 */
function cascadeCode(code, name, voidUrl) {
  if (!voidUrl) return null;

  try {
    const { execFileSync } = require('child_process');
    const body = JSON.stringify({ text: code, name });
    const result = execFileSync('node', ['-e', `
      const http = require('${new URL(voidUrl).protocol === 'https:' ? 'https' : 'http'}');
      const body = ${JSON.stringify(body)};
      const url = new URL('/cascade', ${JSON.stringify(voidUrl)});
      const req = http.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => process.stdout.write(d));
      });
      req.on('error', () => process.stdout.write('{}'));
      req.write(body);
      req.end();
    `], { encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'] });

    const data = JSON.parse(result || '{}');
    return {
      coherence: data.coherence || 0,
      topDomains: (data.matches || []).slice(0, 5).map(m => ({
        domain: m.domain,
        correlation: m.correlation,
        type: m.type,
      })),
      resonanceCount: (data.matches || []).filter(m => Math.abs(m.correlation) >= 0.3).length,
    };
  } catch {
    return null;
  }
}

// ─── Step 6: EMIT — Full generation pipeline ──────────────────────

/**
 * Main entry point: describe what you need, get pattern-aware generated code.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {string} description - What you need ("a rate limiter", "encrypted key store", etc.)
 * @param {object} options - Configuration
 * @param {string} [options.language='javascript'] - Target language
 * @param {string[]} [options.tags=[]] - Filter by tags
 * @param {string} [options.moduleName] - Name for the generated module
 * @param {string} [options.exportStyle] - 'cjs' or 'esm'
 * @param {string} [options.voidUrl] - Void Compressor URL for cascade validation
 * @param {boolean} [options.heal=true] - Whether to run SERF healing
 * @returns {object} Complete generation result with provenance
 */
function generate(oracle, description, options = {}) {
  const startTime = Date.now();
  const genId = `gen-${crypto.randomBytes(4).toString('hex')}`;
  const steps = [];
  const {
    language = 'javascript',
    tags = [],
    moduleName,
    exportStyle = 'cjs',
    voidUrl = null,
    heal = true,
  } = options;

  // Step 1: SEARCH
  const s1 = Date.now();
  const matches = searchPatterns(oracle, description, { language, tags, limit: 5 });
  steps.push({ name: 'search', durationMs: Date.now() - s1, matches: matches.length });

  // Step 2: DECIDE
  const s2 = Date.now();
  const decision = decideStrategy(matches, { description, language });
  steps.push({ name: 'decide', durationMs: Date.now() - s2, decision: decision.decision, confidence: decision.confidence });

  // Step 3: ADAPT
  const s3 = Date.now();
  const adapted = adaptPattern(decision, { description, language, moduleName, exportStyle });
  steps.push({ name: 'adapt', durationMs: Date.now() - s3, adaptations: adapted.adaptations });

  // Step 4: HEAL
  let finalCode = adapted.code;
  let healResult = { improved: false, loops: 0 };
  if (heal) {
    const s4 = Date.now();
    healResult = healCode(adapted.code, oracle, { language, maxLoops: 3, targetCoherence: 0.80 });
    finalCode = healResult.code;
    steps.push({ name: 'heal', durationMs: Date.now() - s4, improved: healResult.improved, coherency: healResult.coherency, loops: healResult.loops });
  }

  // Step 5: CASCADE
  let cascade = null;
  if (voidUrl) {
    const s5 = Date.now();
    cascade = cascadeCode(finalCode, moduleName || description.slice(0, 40), voidUrl);
    steps.push({ name: 'cascade', durationMs: Date.now() - s5, resonance: cascade?.resonanceCount || 0 });
  }

  // Build provenance
  const provenance = {
    generationId: genId,
    description,
    decision: decision.decision,
    sourcePattern: decision.pattern?.name || null,
    sourceCoherency: decision.pattern?.coherency || 0,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    adaptations: adapted.adaptations,
    healing: healResult.improved ? {
      before: healResult.coherency - (healResult.delta || 0),
      after: healResult.coherency,
      loops: healResult.loops,
    } : null,
    cascade: cascade,
    alternatives: matches.slice(1).map(m => ({ name: m.name, coherency: m.coherency })),
  };

  return {
    id: genId,
    code: finalCode,
    language,
    decision: decision.decision,
    confidence: decision.confidence,
    provenance,
    steps,
    durationMs: Date.now() - startTime,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function buildProvenanceHeader(pattern, context) {
  return `/**\n * @generated Pattern-Aware Code Generator\n * @source ${pattern.name} (coherency: ${pattern.coherency.toFixed(3)})\n * @type ${pattern.patternType}\n * @language ${pattern.language}\n * @description ${(context.description || pattern.description || '').slice(0, 100)}\n */\n\n`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Exports ───────────────────────────────────────────────────────

module.exports = {
  generate,
  searchPatterns,
  decideStrategy,
  adaptPattern,
  healCode,
  cascadeCode,
  generateSkeleton,
  DECISION_THRESHOLDS,
};
