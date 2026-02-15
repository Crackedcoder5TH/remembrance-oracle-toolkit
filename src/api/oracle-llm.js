/**
 * Oracle LLM — Claude bridge, context generation, self-management, lifecycle.
 * AI-enhanced operations and self-evolution capabilities.
 */

const { computeCoherencyScore } = require('../core/coherency');
const { ClaudeBridge } = require('../core/claude-bridge');

// ─── Shared Helpers (eliminates 6× pattern lookup + candidate storage duplication) ───

function _findPattern(oracle, patternId) {
  const pattern = oracle.patterns.getAll().find(p => p.id === patternId);
  if (!pattern) return { found: false, error: `Pattern ${patternId} not found` };
  return { found: true, pattern };
}

function _tryPromoteOrStore(oracle, candidate, parentId, method, report, autoPromote) {
  if (autoPromote && candidate.testCode) {
    try {
      const proven = oracle.registerPattern({
        name: candidate.name,
        code: candidate.code,
        testCode: candidate.testCode,
        language: candidate.language,
        description: candidate.description,
        tags: candidate.tags || [],
        patternType: candidate.patternType,
      });
      if (proven) {
        report.generated++;
        report.stored++;
        report.promoted++;
        report.details.push({ name: candidate.name, method, promoted: true });
        return true;
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn(`${method} validation failed, storing as candidate:`, e.message);
    }
  }

  try {
    oracle.patterns.storeCandidate({
      ...candidate,
      parentPattern: parentId,
      generationMethod: method,
    });
    report.generated++;
    report.stored++;
    report.details.push({ name: candidate.name, method, promoted: false });
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('candidate store failed (duplicate or invalid):', e.message);
  }
  return false;
}

// ─── Evolution delegation factory (eliminates 8× trivial wrappers) ───

function _delegateEvolution(modulePath, fnName) {
  return function(options = {}) {
    const mod = require(modulePath);
    return mod[fnName](this._getEvolutionContext(), options);
  };
}

module.exports = {
  _getClaude() {
    if (!this._claude) {
      this._claude = new ClaudeBridge(this._claudeOptions);
    }
    return this._claude;
  },

  isLLMAvailable() {
    return this._getClaude().isAvailable();
  },

  llmTranspile(patternId, targetLanguage) {
    const { found, pattern, error } = _findPattern(this, patternId);
    if (!found) return { success: false, error };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const result = claude.transpile(pattern, targetLanguage);
      if (result) return { success: true, result, method: 'claude' };
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
    } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('AST transpiler unavailable:', e.message); }

    return { success: false, error: 'No transpilation method available', method: 'none' };
  },

  llmGenerateTests(patternId) {
    const { found, pattern, error } = _findPattern(this, patternId);
    if (!found) {
      // Check candidates too
      const candidates = this.candidates();
      const candidate = candidates.find(c => c.id === patternId);
      if (!candidate) return { success: false, error };
      return this._generateTestsFor(candidate);
    }
    return this._generateTestsFor(pattern);
  },

  _generateTestsFor(pattern) {
    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const testCode = claude.generateTests(pattern);
      if (testCode) return { success: true, testCode, method: 'claude' };
    }

    try {
      require('../core/test-synth');
      return { success: false, error: 'Claude unavailable; use synthesizeTests() for static synthesis', method: 'none' };
    } catch {
      return { success: false, error: 'No test generation method available', method: 'none' };
    }
  },

  llmRefine(patternId) {
    const { found, pattern, error } = _findPattern(this, patternId);
    if (!found) return { success: false, error };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const refined = claude.refine(pattern, pattern.coherencyScore);
      if (refined) return { success: true, refinedCode: refined, method: 'claude' };
    }

    // Fallback to reflection
    try {
      const { reflectionLoop } = require('../core/reflection');
      const result = reflectionLoop(pattern.code, {
        language: pattern.language,
        maxLoops: 3,
        targetCoherence: 0.9,
      });
      if (result.improved) return { success: true, refinedCode: result.code, method: 'reflection' };
    } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('reflection unavailable:', e.message); }

    return { success: false, error: 'No refinement method available', method: 'none' };
  },

  llmAlternative(patternId) {
    const { found, pattern, error } = _findPattern(this, patternId);
    if (!found) return { success: false, error };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const alt = claude.generateAlternative(pattern);
      if (alt) return { success: true, alternative: alt, method: 'claude' };
    }

    return { success: false, error: 'Claude unavailable', method: 'none' };
  },

  llmDocs(patternId) {
    const { found, pattern, error } = _findPattern(this, patternId);
    if (!found) return { success: false, error };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const docs = claude.generateDocs(pattern);
      if (docs) return { success: true, docs, method: 'claude' };
    }

    return { success: false, error: 'Claude unavailable', method: 'none' };
  },

  llmAnalyze(code, language) {
    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const analysis = claude.analyze(code, language);
      if (analysis) return { success: true, analysis, method: 'claude' };
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
  },

  llmExplain(patternId) {
    const { found, pattern, error } = _findPattern(this, patternId);
    if (!found) return { success: false, error };

    const claude = this._getClaude();
    if (claude.isAvailable()) {
      const explanation = claude.explain(pattern.code, pattern.language);
      if (explanation) return { success: true, explanation, method: 'claude' };
    }

    return {
      success: true,
      explanation: pattern.description || `${pattern.name}: ${pattern.patternType} pattern in ${pattern.language}`,
      method: 'metadata',
    };
  },

  llmGenerate(options = {}) {
    const claude = this._getClaude();
    const useClaude = claude.isAvailable();
    const languages = options.languages || ['python', 'typescript'];
    const maxPatterns = options.maxPatterns || 10;
    const methods = options.methods || ['variant', 'alternative'];
    const autoPromote = options.autoPromote !== false;

    const report = { generated: 0, stored: 0, promoted: 0, method: useClaude ? 'claude' : 'regex', details: [] };

    if (!useClaude) {
      const regexReport = this.generateCandidates(options);
      report.generated = regexReport.generated || 0;
      report.stored = regexReport.stored || 0;
      report.details = [{ method: 'regex-fallback', ...regexReport }];
      return report;
    }

    const patterns = this.patterns.getAll()
      .filter(p => (p.coherencyScore?.total ?? 0) >= 0.6)
      .sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0))
      .slice(0, maxPatterns);

    for (const pattern of patterns) {
      if (methods.includes('variant')) {
        for (const lang of languages) {
          if (lang === pattern.language) continue;
          const candidate = claude.transpile(pattern, lang);
          if (!candidate || !candidate.code) continue;

          const testResult = claude.generateTests({ ...candidate, language: lang });
          if (testResult && testResult.testCode) candidate.testCode = testResult.testCode;

          const detail = { language: lang };
          _tryPromoteOrStore(this, { ...candidate, language: lang }, pattern.id, 'claude-variant', report, autoPromote);
        }
      }

      if (methods.includes('alternative')) {
        const alt = claude.generateAlternative(pattern);
        if (!alt || !alt.code) continue;

        const testResult = claude.generateTests(alt);
        if (testResult && testResult.testCode) alt.testCode = testResult.testCode;

        alt.language = alt.language || pattern.language;
        _tryPromoteOrStore(this, alt, pattern.id, 'claude-alternative', report, autoPromote);
      }
    }

    return report;
  },

  generateContext(options = {}) {
    const { format = 'markdown', maxPatterns = 50, includeCode = false } = options;
    const storeStats = this.stats();
    const patternStats = this.patternStats();
    const patterns = this.patterns.getAll();

    const byLanguage = {};
    const byType = {};
    for (const p of patterns) {
      const lang = p.language || 'unknown';
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
      const type = p.patternType || 'utility';
      byType[type] = (byType[type] || 0) + 1;
    }

    const sorted = [...patterns].sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0));
    const topPatterns = sorted.slice(0, maxPatterns).map(p => {
      const entry = {
        name: p.name,
        language: p.language,
        type: p.patternType || 'utility',
        coherency: (p.coherencyScore?.total ?? 0).toFixed(3),
        tags: p.tags || [],
        description: p.description || '',
      };
      if (includeCode) entry.code = p.code;
      return entry;
    });

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
  },

  exportContext(options = {}) {
    return this.generateContext(options).prompt;
  },

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
  },

  _getEvolutionContext() {
    if (!this._evolutionCtx) {
      const { createOracleContext } = require('../evolution/context');
      this._evolutionCtx = createOracleContext(this);
    }
    return this._evolutionCtx;
  },

  // ─── Evolution delegators (auto-generated pattern) ───
  selfEvolve: _delegateEvolution('../evolution/evolution', 'evolve'),
  selfImprove: _delegateEvolution('../evolution/self-optimize', 'selfImprove'),
  selfOptimize: _delegateEvolution('../evolution/self-optimize', 'selfOptimize'),
  consolidateDuplicates: _delegateEvolution('../evolution/self-optimize', 'consolidateDuplicates'),
  consolidateTags: _delegateEvolution('../evolution/self-optimize', 'consolidateTags'),
  pruneStuckCandidates: _delegateEvolution('../evolution/self-optimize', 'pruneStuckCandidates'),
  polishCycle: _delegateEvolution('../evolution/self-optimize', 'polishCycle'),
  iterativePolish: _delegateEvolution('../evolution/self-optimize', 'iterativePolish'),

  fullOptimizationCycle(options = {}) {
    const { fullCycle } = require('../evolution/self-optimize');
    const { HealingWhisper } = require('../evolution/whisper');

    const ctx = this._getEvolutionContext();
    const whisper = new HealingWhisper(ctx);
    whisper.start();

    const report = fullCycle(ctx, options);

    if (report.evolution) whisper.recordEvolutionReport(report.evolution);
    if (report.improvement?.promoted > 0) whisper.recordPromotionReport({ promoted: report.improvement.promoted });

    const whisperSummary = whisper.stop();
    return { ...report, whisperSummary };
  },

  getLifecycle(options = {}) {
    if (!this._lifecycle) {
      const { LifecycleEngine } = require('../evolution/lifecycle');
      this._lifecycle = new LifecycleEngine(this._getEvolutionContext(), options);
    }
    return this._lifecycle;
  },

  startLifecycle(options = {}) {
    return this.getLifecycle(options).start();
  },

  stopLifecycle() {
    if (this._lifecycle) return this._lifecycle.stop();
    return { stopped: false, reason: 'not started' };
  },

  lifecycleStatus() {
    if (this._lifecycle) return this._lifecycle.status();
    return { running: false, reason: 'not initialized' };
  },
};
