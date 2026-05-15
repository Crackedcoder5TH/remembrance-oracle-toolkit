/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

/**
 * MCP Tool Handlers
 *
 * Dispatch map for all MCP tool calls. Each handler is a function
 * (oracle, args) => result that implements one tool's logic.
 *
 * 15 focused handlers (down from 55+).
 * Extracted from the monolithic switch in server.js for maintainability.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { trackPull, inferFeedbackFromActivity, clearPendingPull, getPendingPulls } = require('./feedback-tracker');

const ECOSYSTEM_MD_PATH = path.join(__dirname, '..', '..', 'ECOSYSTEM.md');

function _loadEcosystemDoc() {
  try { return fs.readFileSync(ECOSYSTEM_MD_PATH, 'utf8'); }
  catch (_) { return null; }
}

function _extractSection(doc, sectionHeading) {
  if (!doc) return null;
  const lines = doc.split('\n');
  const startIdx = lines.findIndex(l => l.startsWith(sectionHeading));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^## /.test(l));
  return lines.slice(startIdx, endIdx === -1 ? lines.length : endIdx).join('\n');
}

/**
 * Enforcement helper: check if a search was done recently.
 * Returns an enforcement notice to prepend to tool results when search reflex was skipped.
 */
function _searchEnforcementNotice() {
  try {
    const { wasSearchRecent } = require('../core/session-tracker');
    const { getSearchEnforcement, getSearchGracePeriod } = require('../core/oracle-config');
    const level = getSearchEnforcement();
    if (level === 'off') return null;
    const grace = getSearchGracePeriod();
    if (!wasSearchRecent(grace)) {
      const mins = Math.round(grace / 60000);
      return {
        _enforcement: `WARNING: No oracle search in the last ${mins} minutes. ` +
          `You MUST call oracle_search before submitting or registering code. ` +
          `The oracle exists so you don't reinvent proven patterns.`,
      };
    }
  } catch (_) {}
  return null;
}

const HANDLERS = {
  // ─── 1. Search (unified) ───
  oracle_search(oracle, args) {
    const mode = args.mode || 'hybrid';
    let result;
    // Structured query mode: description provided without query
    if (args.description && !args.query) {
      result = oracle.query({
        description: args.description || '',
        tags: args.tags || [],
        language: args.language,
        limit: args.limit || 5,
      });
    } else if (!args.query) {
      throw new Error('Either "query" or "description" is required');
    } else if (mode === 'smart') {
      result = oracle.smartSearch(args.query, {
        language: args.language,
        limit: args.limit || 10,
        mode: 'hybrid',
      });
    } else {
      result = oracle.search(args.query, {
        limit: args.limit || 5,
        language: args.language,
        mode: mode,
      });
    }
    // Instrumentation: track search in session
    try {
      const { trackSearch } = require('../core/session-tracker');
      trackSearch(args.query || args.description || '', result, { mode, language: args.language });
    } catch (_) { /* non-fatal */ }
    return result;
  },

  // ─── 2. Resolve ───
  oracle_resolve(oracle, args) {
    const request = {
      description: args.description || '',
      tags: args.tags || [],
      language: args.language,
      heal: args.heal !== false,
    };
    const result = oracle.resolve(request);
    // Instrumentation: track resolve in session + feedback tracker
    try {
      const { trackResolve } = require('../core/session-tracker');
      trackResolve(result, request);
    } catch (_) { /* non-fatal */ }
    if (result.pattern && result.pattern.id) {
      trackPull(result.pattern.id, result.pattern.name, result.decision);
    }
    return result;
  },

  // ─── 3. Submit ───
  oracle_submit(oracle, args) {
    if (!args.code || typeof args.code !== 'string') {
      throw new Error('"code" is required and must be a non-empty string');
    }
    const notice = _searchEnforcementNotice();
    const result = oracle.submit(args.code, {
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
    // Infer feedback for any pending pulls — model wrote new code, so pulled patterns were useful
    const inferred = inferFeedbackFromActivity(oracle);
    const out = notice ? { ...result, ...notice } : result;
    if (inferred.length > 0) {
      out._inferredFeedback = inferred;
    }
    // Instrumentation: log submit to session
    try {
      const { getSession } = require('../core/session-tracker');
      const session = getSession();
      if (!session._submits) session._submits = [];
      session._submits.push({
        timestamp: new Date().toISOString(),
        language: args.language || null,
        description: args.description || '',
        inferredFeedback: inferred.length,
      });
    } catch (_) { /* non-fatal */ }
    return out;
  },

  // ─── 4. Register ───
  oracle_register(oracle, args) {
    if (!args.name || typeof args.name !== 'string') {
      throw new Error('"name" is required and must be a non-empty string');
    }
    if (!args.code || typeof args.code !== 'string') {
      throw new Error('"code" is required and must be a non-empty string');
    }
    const notice = _searchEnforcementNotice();
    const result = oracle.registerPattern({
      name: args.name,
      code: args.code,
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
    // Infer feedback for any pending pulls — model registered new code, so pulled patterns were useful
    const inferred = inferFeedbackFromActivity(oracle);
    const out = notice ? { ...result, ...notice } : result;
    if (inferred.length > 0) {
      out._inferredFeedback = inferred;
    }
    // Instrumentation: log register to session
    try {
      const { getSession } = require('../core/session-tracker');
      const session = getSession();
      if (!session._registers) session._registers = [];
      session._registers.push({
        timestamp: new Date().toISOString(),
        name: args.name,
        language: args.language || null,
        inferredFeedback: inferred.length,
      });
    } catch (_) { /* non-fatal */ }
    return out;
  },

  // ─── 5. Feedback ───
  oracle_feedback(oracle, args) {
    if (!args.id) {
      throw new Error('"id" is required for feedback');
    }
    if (args.success === undefined || args.success === null) {
      throw new Error('"success" (boolean) is required for feedback');
    }
    const result = oracle.feedback(args.id, !!args.success);
    // Clear from pending pulls — explicit feedback was given
    clearPendingPull(args.id);
    // Instrumentation: track feedback in session
    try {
      const { trackFeedback } = require('../core/session-tracker');
      trackFeedback(args.id);
    } catch (_) { /* non-fatal */ }
    return result;
  },

  // ─── 6. Stats ───
  oracle_stats(oracle) {
    const storeStats = oracle.stats();
    const patternStats = oracle.patternStats();
    const candidateStats = oracle.candidateStats();
    // Publication stats from SQLite
    let publicationStats = { published: 0 };
    try {
      const sqliteStore = oracle.store?.getSQLiteStore?.() || (oracle.patterns && oracle.patterns._sqlite);
      if (sqliteStore && sqliteStore.db) {
        const pub = sqliteStore.db.prepare('SELECT COUNT(*) as c FROM patterns WHERE blockchain_tx IS NOT NULL').get();
        publicationStats.published = pub ? pub.c : 0;
      }
    } catch (_) { /* non-fatal */ }
    return { store: storeStats, patterns: patternStats, candidates: candidateStats, publications: publicationStats };
  },

  // ─── 7. Debug (unified) ───
  oracle_debug(oracle, args) {
    const action = args.action || 'stats';
    switch (action) {
      case 'capture':
        return oracle.debugCapture({
          errorMessage: args.errorMessage,
          stackTrace: args.stackTrace || '',
          fixCode: args.fixCode,
          fixDescription: args.fixDescription || '',
          language: args.language || 'javascript',
          tags: args.tags || [],
        });
      case 'search':
        return oracle.debugSearch({
          errorMessage: args.errorMessage,
          stackTrace: args.stackTrace || '',
          language: args.language,
          limit: args.limit || 5,
          federated: args.federated !== false,
        });
      case 'feedback':
        return oracle.debugFeedback(args.id, args.resolved);
      case 'stats':
        return oracle.debugStats();
      case 'grow':
        return oracle.debugGrow({ limit: args.limit });
      case 'patterns':
        return oracle.debugPatterns({
          language: args.language,
          errorClass: args.errorClass,
        });
      case 'decohere':
        return oracle.debugDecohereSweep({
          maxDays: args.maxDays || 180,
        });
      case 'reexcite':
        if (!args.id) throw new Error('id is required for reexcite action');
        return oracle.debugReexcite(args.id);
      case 'entanglement':
        if (!args.id) throw new Error('id is required for entanglement action');
        return oracle.debugEntanglementGraph(args.id, args.depth || 2);
      case 'field': {
        const fieldStats = oracle.debugStats();
        return { ...fieldStats, view: 'quantum-field' };
      }
      default:
        throw new Error(`Unknown debug action: ${action}. Use: capture, search, feedback, stats, grow, patterns, decohere, reexcite, entanglement, field`);
    }
  },

  // ─── 8. Sync (unified) ───
  oracle_sync(oracle, args) {
    const scope = args.scope || 'personal';
    if (scope === 'community' || scope === 'both') {
      const shareResult = oracle.share({
        patterns: args.patterns,
        tags: args.tags,
        minCoherency: args.minCoherency ?? 0.7,
        dryRun: args.dryRun || false,
      });
      if (scope === 'community') {
        return shareResult;
      }
      // scope === 'both': also sync personal
      const dir = args.direction || 'both';
      const opts = { dryRun: args.dryRun || false, language: args.language };
      let personalResult;
      if (dir === 'push') personalResult = oracle.syncToGlobal(opts);
      else if (dir === 'pull') personalResult = oracle.syncFromGlobal(opts);
      else personalResult = oracle.sync(opts);
      return { personal: personalResult, community: shareResult };
    }
    // scope === 'personal' (default)
    const dir = args.direction || 'both';
    const opts = { dryRun: args.dryRun || false, language: args.language };
    if (dir === 'push') return oracle.syncToGlobal(opts);
    if (dir === 'pull') return oracle.syncFromGlobal(opts);
    return oracle.sync(opts);
  },

  // ─── 9. Harvest ───
  oracle_harvest(oracle, args) {
    const { harvest } = require('../ci/harvest');
    const path = require('path');
    const os = require('os');

    // Security: restrict local harvest paths to the project directory or home directory.
    // Remote URLs (git clone) are allowed since they clone to a temp directory.
    const source = args.path || '';
    const isUrl = (source.includes('://') && !source.startsWith('file://')) || source.startsWith('git@');
    if (!isUrl) {
      const fs = require('fs');
      let resolved = path.resolve(source);
      // Resolve symlinks to prevent path traversal via symlinked directories
      try { resolved = fs.realpathSync(resolved); } catch (_) { /* path may not exist yet */ }
      const cwd = process.cwd();
      const home = os.homedir();
      const tmp = os.tmpdir();
      const isBelowCwd = resolved.startsWith(cwd + path.sep) || resolved === cwd;
      const isBelowHome = resolved.startsWith(home + path.sep) || resolved === home;
      const isBelowTmp = resolved.startsWith(tmp + path.sep) || resolved === tmp;
      if (!isBelowCwd && !isBelowHome && !isBelowTmp) {
        throw new Error(
          `Harvest path must be within the project directory or home directory. ` +
          `Resolved "${resolved}" is outside allowed boundaries.`
        );
      }
      // Block sensitive directories
      const sensitive = ['.ssh', '.gnupg', '.aws', '.config', '.kube', '.docker'].map(d => path.join(home, d));
      if (sensitive.some(s => resolved.startsWith(s + path.sep) || resolved === s)) {
        throw new Error(`Harvest path "${resolved}" points to a sensitive directory.`);
      }
    }

    return harvest(oracle, source, {
      language: args.language,
      dryRun: args.dryRun || false,
      splitMode: args.splitMode || 'file',
      branch: args.branch,
      maxFiles: args.maxFiles || 200,
    });
  },

  // ─── 10. Maintain (unified) ───
  oracle_maintain(oracle, args) {
    const action = args.action || 'full-cycle';
    switch (action) {
      case 'full-cycle':
        return oracle.fullOptimizationCycle({
          maxHealsPerRun: args.maxHealsPerRun || 20,
        });
      case 'candidates': {
        const filters = {};
        if (args.language) filters.language = args.language;
        if (args.minCoherency != null) filters.minCoherency = args.minCoherency;
        if (args.method) filters.generationMethod = args.method;
        const candidates = oracle.candidates(filters);
        const stats = oracle.candidateStats();
        return { stats, candidates: candidates.slice(0, 50) };
      }
      case 'promote':
        return oracle.autoPromote();
      case 'synthesize':
        return oracle.synthesizeTests({
          maxCandidates: args.maxCandidates,
          dryRun: args.dryRun || false,
          autoPromote: true,
        });
      case 'reflect': {
        const { reflectionLoop } = require('../core/reflection');
        const result = reflectionLoop(args.code || '', {
          language: args.language,
          maxLoops: args.maxLoops || 3,
          targetCoherence: args.targetCoherence ?? 0.9,
        });
        result.history = (result.history || []).map(h => ({
          loop: h.loop,
          coherence: h.coherence,
          strategy: h.strategy,
          reflectionScore: h.reflectionScore,
        }));
        return result;
      }
      case 'covenant': {
        const { covenantCheck } = require('../core/covenant');
        return covenantCheck(args.code || '', {
          description: args.description || '',
          tags: args.tags || [],
        });
      }
      default:
        throw new Error(`Unknown maintain action: ${action}. Use: full-cycle, candidates, promote, synthesize, reflect, covenant`);
    }
  },

  // ─── 11. Healing (lineage, stats, variants, improvements) ───
  oracle_healing(oracle, args) {
    const action = args.action || 'stats';
    switch (action) {
      case 'lineage': {
        if (!args.patternId) throw new Error('patternId is required for lineage action');
        return oracle.getHealingLineage(args.patternId);
      }
      case 'stats': {
        if (args.patternId) {
          // Per-pattern stats
          const sqliteStore = oracle.patterns && oracle.patterns._sqlite;
          if (sqliteStore && typeof sqliteStore.getPatternHealingStats === 'function') {
            return sqliteStore.getPatternHealingStats(args.patternId);
          }
          const __retVal = { patternId: args.patternId, attempts: 0, successes: 0, rate: 1.0 };
          // ── LRE field-coupling (auto-wired) ──
          try {
            const __lre_p1 = '../core/field-coupling';
            const __lre_p2 = require('path').join(__dirname, '../core/field-coupling');
            for (const __p of [__lre_p1, __lre_p2]) {
              try {
                const { contribute: __contribute } = require(__p);
                __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.rate || 0)), source: 'oracle:handlers:oracle_healing' });
                break;
              } catch (_) { /* try next */ }
            }
          } catch (_) { /* best-effort */ }
          return __retVal;
        }
        // Aggregate stats
        return oracle.healingStats();
      }
      case 'improved': {
        return oracle.queryHealingImprovement(args.minDelta ?? 0.2);
      }
      case 'variants': {
        if (!args.patternId) throw new Error('patternId is required for variants action');
        const sqliteStore = oracle.patterns && oracle.patterns._sqlite;
        if (sqliteStore && typeof sqliteStore.getHealedVariants === 'function') {
          return sqliteStore.getHealedVariants(args.patternId);
        }
        return [];
      }
      case 'best': {
        if (!args.patternId) throw new Error('patternId is required for best action');
        const sqliteStore = oracle.patterns && oracle.patterns._sqlite;
        if (sqliteStore && typeof sqliteStore.getBestHealedVariant === 'function') {
          return sqliteStore.getBestHealedVariant(args.patternId);
        }
        return null;
      }
      default:
        throw new Error(`Unknown healing action: ${action}. Use: lineage, stats, improved, variants, best`);
    }
  },

  // ─── 12. Swarm (multi-agent orchestration) ───
  async oracle_swarm(oracle, args) {
    const action = args.action || 'code';
    const { swarm, swarmCode, swarmReview, swarmHeal, resolveProviders, loadSwarmConfig } = require('../swarm');

    switch (action) {
      case 'code':
        if (!args.task) throw new Error('task is required for code action');
        return swarmCode(args.task, args.language || 'javascript', {
          rootDir: process.cwd(),
          crossScoring: args.crossScoring,
          oracle,
        });
      case 'review':
        if (!args.code) throw new Error('code is required for review action');
        return swarmReview(args.code, {
          rootDir: process.cwd(),
          language: args.language,
          oracle,
        });
      case 'heal':
        if (!args.code) throw new Error('code is required for heal action');
        return swarmHeal(args.code, {
          rootDir: process.cwd(),
          language: args.language,
          oracle,
        });
      case 'status': {
        const config = loadSwarmConfig(process.cwd()) || {};
        const providers = resolveProviders(config);
        return {
          ready: providers.length >= (config.minAgents || 1),
          providers: providers.length,
          minRequired: config.minAgents || 1,
          crossScoring: config.crossScoring !== false,
          dimensions: (config.dimensions || []).length,
        };
      }
      case 'providers': {
        const config = loadSwarmConfig(process.cwd());
        const available = resolveProviders(config);
        return { available, total: 6 };
      }
      default:
        throw new Error(`Unknown swarm action: ${action}. Use: code, review, heal, status, providers`);
    }
  },
  // ─── 13. Pending Feedback ───
  oracle_pending_feedback(_oracle, _args) {
    const pending = getPendingPulls();
    let sessionPending = [];
    try {
      const { getPendingFeedback } = require('../core/session-tracker');
      sessionPending = getPendingFeedback();
    } catch (_) { /* non-fatal */ }
    return { mcpPending: pending, sessionPending };
  },

  // ─── 14. Fractal (math engines + code alignment) ───
  oracle_fractal(oracle, args) {
    const { computeFractalAlignment, selectResonantFractal, FRACTAL_TEMPLATES,
            sierpinski, mandelbrot, mandelbrotResonance, juliaStabilityMap,
            lyapunov, lyapunovSequence } = require('../fractals');

    const action = args.action || 'analyze';
    switch (action) {
      case 'analyze': {
        if (!args.code) throw new Error('code is required for analyze action');
        return computeFractalAlignment(args.code);
      }
      case 'engines': {
        const engines = {};
        for (const [key, tmpl] of Object.entries(FRACTAL_TEMPLATES)) {
          engines[key] = { name: tmpl.name, role: tmpl.role, codeSignals: tmpl.codeSignals };
        }
        return { engines, count: Object.keys(engines).length };
      }
      case 'resonance': {
        if (!args.code) throw new Error('code is required for resonance action');
        const result = selectResonantFractal(args.code, args.description || '');
        return {
          fractal: result.fractal, resonance: result.resonance,
          reason: result.reason, template: { name: result.template.name, role: result.template.role },
        };
      }
      case 'sierpinski': {
        return sierpinski(args.level || 5);
      }
      case 'mandelbrot': {
        const result = mandelbrot(args.cr ?? -0.75, args.ci ?? 0.1, args.maxIter || 100);
        result.resonance = mandelbrotResonance(args.cr ?? -0.75, args.ci ?? 0.1, args.maxIter || 100);
        return result;
      }
      case 'julia': {
        return juliaStabilityMap(args.cr ?? -0.7, args.ci ?? 0.27015);
      }
      case 'lyapunov': {
        if (args.sequence) {
          return lyapunovSequence(args.sequence, args.r ?? 3.5, args.ci ?? 3.8);
        }
        return lyapunov(args.r ?? 3.57);
      }
      default:
        throw new Error(`Unknown fractal action: ${action}. Use: analyze, engines, resonance, sierpinski, mandelbrot, julia, lyapunov`);
    }
  },
  // ─── 14. Audit (bug detection across all subcommands) ───
  oracle_audit(oracle, args) {
    const fs = require('fs');
    const path = require('path');
    const action = args.action || 'check';
    const { auditCode, auditFile, auditFiles } = require('../audit/ast-checkers');
    const { lintFile } = require('../audit/lint-checkers');
    const { smellFile } = require('../audit/smell-checkers');
    const repoRoot = process.cwd();

    switch (action) {
      case 'check': {
        if (!args.file) throw new Error('audit check requires a file');
        const opts = {
          bugClasses: args.bugClass ? [args.bugClass] : undefined,
          minSeverity: args.minSeverity,
        };
        const result = auditFile(args.file, opts);

        // Baseline hiding
        if (!args.noBaseline) {
          try {
            const baselineMod = require('../audit/baseline');
            const baseline = baselineMod.readBaseline(baselineMod.resolveBaselinePath(repoRoot));
            if (baseline) {
              const diff = baselineMod.diffAgainstBaseline(baseline, { [args.file]: result.findings }, repoRoot);
              result.findings = diff.new.map(f => ({ ...f, file: undefined }));
              result.baselineHiddenCount = diff.persisted.length;
            }
          } catch { /* best-effort */ }
        }

        // Auto-fix
        if (args.autoFix) {
          const { autoFixFile } = require('../audit/auto-fix');
          const r = autoFixFile(args.file, result.findings, { write: !args.dryRun });
          result.autoFixed = r.fixed;
          result.findings = r.unfixed;
        }
        return result;
      }

      case 'baseline': {
        const baselineMod = require('../audit/baseline');
        const files = args.files || [args.file].filter(Boolean);
        const result = auditFiles(files);
        const findingsByFile = {};
        for (const fr of result.files || []) findingsByFile[fr.file] = fr.findings;
        const baseline = baselineMod.buildBaseline(findingsByFile, repoRoot);
        baselineMod.writeBaseline(baseline, baselineMod.resolveBaselinePath(repoRoot));
        return { success: true, totalFindings: baseline.totalFindings, files: Object.keys(baseline.files).length };
      }
      case 'baseline-show': {
        const baselineMod = require('../audit/baseline');
        return baselineMod.readBaseline(baselineMod.resolveBaselinePath(repoRoot));
      }
      case 'baseline-clear': {
        const baselineMod = require('../audit/baseline');
        const p = baselineMod.resolveBaselinePath(repoRoot);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return { success: true };
      }

      case 'explain': {
        const { explain, listRules } = require('../audit/explain');
        if (!args.rule) return { rules: listRules(args.category || null) };
        return explain(args.rule) || { error: `unknown rule: ${args.rule}` };
      }

      case 'feedback-fix':
      case 'feedback-dismiss': {
        const { recordFeedback } = require('../audit/feedback');
        const which = action === 'feedback-fix' ? 'fix' : 'dismiss';
        if (!args.rule) throw new Error(`${action} requires a rule`);
        const r = recordFeedback(repoRoot, which, args.rule, { file: args.file });
        return { success: true, rule: args.rule, action: which, stats: r };
      }
      case 'feedback-show': {
        const { summarizeStore } = require('../audit/feedback');
        return summarizeStore(repoRoot);
      }

      case 'prior': {
        const { scorePrior, loadPrior } = require('../audit/bayesian-prior');
        if (!args.file) return loadPrior();
        const src = fs.readFileSync(args.file, 'utf-8');
        return { file: args.file, findings: scorePrior(src, args.file) };
      }

      case 'cross-file': {
        const { analyzeFiles, crossFileCallGraph } = require('../core/analyze');
        const files = args.files || [args.file].filter(Boolean);
        const envs = analyzeFiles(files);
        const { cascades, graph } = crossFileCallGraph(envs);
        return { cascades, functionCount: graph.defs.size };
      }

      case 'summary': {
        const { buildSummary } = require('../audit/rich-summary');
        const files = args.files || (args.file ? [args.file] : []);
        const result = auditFiles(files);
        const flat = [];
        for (const fr of result.files || []) {
          for (const f of fr.findings) flat.push({ ...f, file: fr.file });
        }
        return buildSummary({ findings: flat });
      }

      default:
        throw new Error(`Unknown audit action: ${action}`);
    }
  },

  // ─── 15. Lint ───
  oracle_lint(oracle, args) {
    const { lintCode, lintFile } = require('../audit/lint-checkers');
    if (args.file) return lintFile(args.file);
    if (args.code) return lintCode(args.code);
    throw new Error('oracle_lint requires file or code');
  },

  // ─── 16. Smell ───
  oracle_smell(oracle, args) {
    const { smellCode, smellFile } = require('../audit/smell-checkers');
    const thresholds = {};
    if (args.longFunctionLines) thresholds.longFunctionLines = args.longFunctionLines;
    if (args.deepNestingDepth)  thresholds.deepNestingDepth  = args.deepNestingDepth;
    if (args.tooManyParams)     thresholds.tooManyParams     = args.tooManyParams;
    if (args.file) return smellFile(args.file, { thresholds });
    if (args.code) return smellCode(args.code, { thresholds });
    throw new Error('oracle_smell requires file or code');
  },

  // ─── 17. Analyze (unified envelope) ───
  oracle_analyze(oracle, args) {
    const fs = require('fs');
    const { analyze } = require('../core/analyze');
    let source, filePath = null;
    if (args.file) {
      filePath = args.file;
      source = fs.readFileSync(args.file, 'utf-8');
    } else if (args.code) {
      source = args.code;
    } else {
      throw new Error('oracle_analyze requires file or code');
    }
    const env = analyze(source, filePath, { language: args.language });
    const include = Array.isArray(args.include) && args.include.length > 0
      ? args.include
      : ['audit', 'lint', 'smell', 'coherency', 'meta', 'language'];
    const out = { language: env.language, meta: env.meta };
    if (include.includes('audit'))       out.audit = env.audit;
    if (include.includes('lint'))        out.lint  = env.lint;
    if (include.includes('smell'))       out.smell = env.smell;
    if (include.includes('coherency'))   out.coherency = env.coherency;
    if (include.includes('prior'))       out.priorRisks = env.priorRisks;
    if (include.includes('covenant'))    out.covenant = env.covenant;
    if (include.includes('fingerprint')) out.fingerprint = env.fingerprint;
    if (include.includes('functions'))   out.functionCount = env.functions.length;
    if (include.includes('allFindings')) out.allFindings = env.allFindings;
    return out;
  },

  // ─── 18. Heal (unified pipeline) ───
  async oracle_heal(oracle, args) {
    const fs = require('fs');
    const { heal } = require('../core/heal');
    let source, filePath = null;
    if (args.file) {
      filePath = args.file;
      source = fs.readFileSync(args.file, 'utf-8');
    } else if (args.code) {
      source = args.code;
    } else {
      throw new Error('oracle_heal requires file or code');
    }
    const result = await heal(source, {
      filePath,
      maxLevel: args.maxLevel || 'generate',
      targetRule: args.targetRule,
      dryRun: args.dryRun,
    });
    if (args.writeFile && result.success && filePath && !args.dryRun) {
      fs.writeFileSync(filePath, result.source, 'utf-8');
    }
    return {
      success: result.success,
      level: result.level,
      source: args.writeFile ? undefined : result.source,
      before: { findings: result.before?.findings?.length ?? 0 },
      after:  { findings: result.after?.findings?.length ?? 0 },
      patches: result.patches?.length ?? 0,
    };
  },

  // ─── 19. Risk (Phase 2 bug probability scorer) ───
  oracle_risk(_oracle, args) {
    const fs = require('fs');
    const { computeBugProbability } = require('../quality/risk-score');
    const { scanDirectory } = require('../quality/risk-scanner');

    // Directory batch mode
    if (args.dir) {
      const report = scanDirectory(args.dir, {
        topN: typeof args.topN === 'number' ? args.topN : 10,
      });
      if (args.filter && typeof args.filter === 'string') {
        const want = args.filter.toUpperCase();
        const filtered = report.files.filter(f => f.riskLevel === want);
        return { ...report, files: filtered, stats: { ...report.stats, top: filtered.slice(0, report.stats.top.length) } };
      }
      return report;
    }

    // Single-file / inline code mode
    let code = null;
    let filePath = null;
    if (args.file) {
      if (!fs.existsSync(args.file)) throw new Error(`oracle_risk: file not found: ${args.file}`);
      filePath = args.file;
      code = fs.readFileSync(args.file, 'utf-8');
    } else if (args.code) {
      code = args.code;
    } else {
      throw new Error('oracle_risk requires one of: file, code, or dir');
    }
    return computeBugProbability(code, { filePath });
  },

  // ─── 15. Test Forge (auto-generate, run, score tests) ───
  oracle_forge(oracle, args) {
    const { TestForge } = require('../test-forge');
    const forge = new TestForge(oracle);
    const action = args.action || 'forge';

    switch (action) {
      case 'forge': {
        if (args.id) {
          return forge.forgeTest(args.id, { dryRun: !!args.dryRun });
        }
        return forge.forgeTests({ dryRun: !!args.dryRun, limit: args.limit });
      }
      case 'run':
        return forge.runTests();
      case 'score':
        return forge.scoreTests();
      case 'promote':
        return forge.forgeAndPromote({ limit: args.limit });
      default:
        throw new Error(`Unknown forge action: ${action}. Use: forge, run, score, promote`);
    }
  },

  // ─── Diagnostic, Ratchet, Ecosystem ────────────────────────────────────

  async oracle_diagnostic(_oracle, args) {
    const { spawnSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const action = args.action || 'run';
    const scriptPath = path.resolve(__dirname, '../../scripts/cathedral-diagnostic.js');
    const reportPath = path.resolve(__dirname, '../../.remembrance/diagnostics/cathedral-latest.json');

    if (action === 'summary') {
      try {
        return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      } catch {
        return { error: 'no diagnostic report yet — run action=run first' };
      }
    }

    const flag = {
      run: [], fix: ['--fix'], 'dry-fix': ['--dry-fix'], 'suggest-suppressions': ['--suggest-suppressions'],
    }[action];
    if (!flag) throw new Error(`Unknown diagnostic action: ${action}`);
    const scriptArgs = [scriptPath, ...flag];
    if (args.path) { scriptArgs.push('--path', args.path); }
    const r = spawnSync(process.execPath, scriptArgs, { encoding: 'utf-8' });
    const stdoutTail = (r.stdout || '').split('\n').slice(-12).join('\n');
    let summary = null;
    try { summary = JSON.parse(fs.readFileSync(reportPath, 'utf-8')); } catch {}
    return {
      action,
      exitCode: r.status,
      summary: summary ? {
        generatedAt: summary.generatedAt,
        filesScanned: summary.filesScanned,
        totalFindings: summary.summary?.totalFindings,
        bySeverity: summary.summary?.bySeverity,
        bySource: summary.summary?.bySource,
        fixesApplied: summary.fixes?.applied,
      } : null,
      tail: stdoutTail,
    };
  },

  async oracle_ratchet(_oracle, args) {
    const { spawnSync } = require('child_process');
    const path = require('path');
    const action = args.action || 'check';
    const scriptPath = path.resolve(__dirname, '../../scripts/covenant-ratchet.js');
    const cliArgs = [scriptPath, '--json'];
    if (action === 'save-baseline') cliArgs.push('--save-baseline');
    if (typeof args.tolerance === 'number') cliArgs.push('--tolerance', String(args.tolerance));
    const r = spawnSync(process.execPath, cliArgs, { encoding: 'utf-8' });
    let parsed = null;
    try { parsed = JSON.parse(r.stdout || '{}'); } catch { parsed = { raw: r.stdout }; }
    return { action, exitCode: r.status, result: parsed };
  },

  async oracle_ecosystem(_oracle, args) {
    const { spawnSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const action = args.action || 'run';
    const diagScript = path.resolve(__dirname, '../../scripts/ecosystem-diagnostic.js');
    const ratchetScript = path.resolve(__dirname, '../../scripts/ecosystem-ratchet.js');
    const reportPath = path.resolve(__dirname, '../../.remembrance/diagnostics/ecosystem-latest.json');
    const parent = args.parent || path.resolve(__dirname, '../../..');

    const loadReport = () => {
      try { return JSON.parse(fs.readFileSync(reportPath, 'utf-8')); } catch { return null; }
    };

    if (action === 'summary') {
      const r = loadReport();
      if (!r) return { error: 'no ecosystem report yet — run action=run first' };
      return {
        generatedAt: r.generatedAt,
        totalRepos: r.repos.length,
        foundRepos: r.repos.filter((x) => x.found).length,
        totalFindings: r.repos.reduce((s, x) => s + (x.counts?.findings ?? 0), 0),
        totalGaps: r.repos.reduce((s, x) => s + (x.wiringGaps?.length ?? 0), 0),
        perRepo: r.repos.map((x) => ({
          repo: x.repo,
          found: x.found,
          findings: x.counts?.findings ?? 0,
          high: x.bySeverity?.high ?? 0,
          wiringGaps: x.wiringGaps ?? [],
        })),
      };
    }

    if (action === 'gaps') {
      const r = loadReport();
      if (!r) return { error: 'no ecosystem report yet' };
      const gaps = [];
      for (const repo of r.repos) {
        if (!repo.found || !repo.wiringGaps?.length) continue;
        for (const g of repo.wiringGaps) gaps.push({ repo: repo.repo, primitive: g });
      }
      return { totalGaps: gaps.length, gaps };
    }

    if (action === 'run') {
      const res = spawnSync(process.execPath, [diagScript, '--parent', parent], { encoding: 'utf-8' });
      return { action, exitCode: res.status, summary: loadReport() ? {
        generatedAt: loadReport().generatedAt,
        totalGaps: loadReport().repos.reduce((s, x) => s + (x.wiringGaps?.length ?? 0), 0),
      } : null, tail: (res.stdout || '').split('\n').slice(-12).join('\n') };
    }

    if (action === 'save-baseline') {
      const res = spawnSync(process.execPath, [ratchetScript, '--save-baseline'], { encoding: 'utf-8' });
      return { action, exitCode: res.status, stdout: res.stdout };
    }

    if (action === 'ratchet') {
      const res = spawnSync(process.execPath, [ratchetScript, '--json'], { encoding: 'utf-8' });
      let parsed = null;
      try { parsed = JSON.parse(res.stdout || '{}'); } catch { parsed = { raw: res.stdout }; }
      return { action, exitCode: res.status, result: parsed };
    }

    throw new Error(`Unknown ecosystem action: ${action}`);
  },

  // ─── oracle_reason ───
  // Cross-pattern abstract reasoning. Wraps src/core/abstract-reasoning.reason()
  // which returns analogies, metaphors, conceptual bridges, and identity matches
  // for a source pattern across a cascade of matches.
  oracle_reason: async (oracle, args) => {
    const { reason } = require('../core/abstract-reasoning');
    const { sourcePattern, cascadeMatches } = args || {};
    if (!sourcePattern || typeof sourcePattern !== 'object') {
      throw new Error('oracle_reason: sourcePattern is required');
    }
    if (!Array.isArray(cascadeMatches)) {
      throw new Error('oracle_reason: cascadeMatches must be an array');
    }
    const report = reason(cascadeMatches, sourcePattern);
    return {
      sourcePattern: { name: sourcePattern.name },
      cascadeCount: cascadeMatches.length,
      report,
    };
  },

  // ─── oracle_meditate ───
  // Single tick of the auto-improvement loop: discover gaps, propose fills,
  // validate each. Bounded by maxProposals to prevent runaway compute.
  // Output is advisory — proposals stay 'pending' unless autoApprove is set
  // and the global coherency exceeds the autonomous-mode threshold.
  oracle_meditate: async (oracle, args) => {
    const { SelfImprovementEngine, APPROVAL_THRESHOLDS } = require('../orchestrator/self-improvement');
    const { PeriodicTable } = require('../atomic/periodic-table');
    const maxProposals = (args && Number.isInteger(args.maxProposals)) ? args.maxProposals : 3;
    const autoApprove = !!(args && args.autoApprove);

    const table = new PeriodicTable();
    const engine = new SelfImprovementEngine({ maxProposals });
    const result = await engine.discoverAndPropose({ table });

    let approved = [];
    if (autoApprove && Array.isArray(result.proposals)) {
      const mode = engine.getApprovalMode(result.globalCoherency || 0);
      if (mode === 'autonomous') {
        for (const p of result.proposals) {
          const r = engine.approve(p.id, table);
          if (!r.error) approved.push(p.id);
        }
      }
    }

    return {
      gapsFound: result.gapsFound || 0,
      proposalsGenerated: (result.proposals || []).length,
      proposals: (result.proposals || []).map((p) => ({
        id: p.id,
        gap: p.gap,
        coherency: p.coherency,
        status: p.status,
      })),
      autoApproved: approved,
      globalCoherency: result.globalCoherency || null,
    };
  },

  // ─── field_state: read the LRE field's current state ───
  field_state(_oracle, args) {
    const { peekField } = require('../core/field-coupling');
    const state = peekField();
    if (!state) return { error: 'field not reachable (LRE module unavailable)' };
    const out = {
      coherence: state.coherence,
      globalEntropy: state.globalEntropy,
      cascadeFactor: state.cascadeFactor,
      updateCount: state.updateCount,
      timestamp: state.timestamp,
    };
    if (args?.includeSources !== false) {
      out.sources = state.sources || {};
      out.distinctSources = Object.keys(state.sources || {}).length;
    }
    return out;
  },

  // ─── field_contribute: write an observation to the LRE field ───
  field_contribute(_oracle, args) {
    const { contribute, peekField } = require('../core/field-coupling');
    if (typeof args?.coherence !== 'number') {
      throw new Error('"coherence" (number) is required');
    }
    if (typeof args?.source !== 'string' || !args.source) {
      throw new Error('"source" (non-empty string) is required');
    }
    const before = peekField();
    const result = contribute({
      cost: typeof args.cost === 'number' ? args.cost : 1.0,
      coherence: args.coherence,
      source: args.source,
    });
    if (!result) return { error: 'field unreachable; contribution skipped' };
    return {
      newState: {
        coherence: result.coherence,
        globalEntropy: result.globalEntropy,
        cascadeFactor: result.cascadeFactor,
        updateCount: result.updateCount,
      },
      derived: {
        r_eff: result.r_eff,
        delta_void: result.delta_void,
        gamma_cascade: result.gamma_cascade,
        p: result.p,
      },
      delta: before ? {
        coherence: result.coherence - before.coherence,
        updateCount: result.updateCount - before.updateCount,
      } : null,
      source: args.source,
    };
  },

  // ─── field_pressure: backpressure signal ───
  field_pressure(_oracle, args) {
    const { fieldPressure } = require('../core/field-coupling');
    return fieldPressure({
      entropyThreshold: typeof args?.entropyThreshold === 'number' ? args.entropyThreshold : 10,
      cascadeThreshold: typeof args?.cascadeThreshold === 'number' ? args.cascadeThreshold : 4,
    });
  },

  // ─── field_introspect: who's been contributing? ───
  field_introspect(_oracle, args) {
    const { peekField } = require('../core/field-coupling');
    const state = peekField();
    if (!state) return { error: 'field not reachable' };
    const sources = state.sources || {};
    const prefix = args?.prefix || '';
    const topN = (typeof args?.topN === 'number') ? args.topN : 25;
    const entries = Object.entries(sources)
      .filter(([k]) => !prefix || k.startsWith(prefix))
      .sort((a, b) => (b[1].count || 0) - (a[1].count || 0));
    const sliced = topN > 0 ? entries.slice(0, topN) : entries;
    const topSources = sliced.map(([source, info]) => ({
      source,
      count: info.count,
      lastCoherence: info.lastCoherence,
      lastTimestamp: info.lastTimestamp,
    }));
    return {
      totalDistinctSources: entries.length,
      totalContributions: entries.reduce((sum, [, info]) => sum + (info.count || 0), 0),
      filter: { prefix: prefix || null, topN: topN || 'all' },
      topSources,
    };
  },

  // ─── field_checkpoint: commit field state to L2 chain + Solana + Cosmos ───
  async field_checkpoint(_oracle, args) {
    const { peekField } = require('../core/field-coupling');
    const state = peekField();
    if (!state) return { error: 'field not reachable' };
    // Sibling-clone Publisher load (BLOCKCHAIN is a peer repo)
    const enginePaths = [
      'remembrance-blockchain/src/publisher',
      path.join(__dirname, '..', '..', '..', 'REMEMBRANCE-BLOCKCHAIN', 'src', 'publisher'),
    ];
    let Publisher = null;
    for (const p of enginePaths) {
      try { ({ Publisher } = require(p)); break; } catch (_) { /* try next */ }
    }
    if (!Publisher) {
      return {
        error: 'REMEMBRANCE-BLOCKCHAIN Publisher not reachable',
        hint: 'Ensure REMEMBRANCE-BLOCKCHAIN is cloned alongside this repo, or configured via env',
      };
    }
    const publisher = new Publisher({ oracleRoot: path.join(__dirname, '..', '..') });
    const checkpointInput = {
      coherence: state.coherence,
      globalEntropy: state.globalEntropy,
      cascadeFactor: state.cascadeFactor,
      updateCount: state.updateCount,
    };
    if (args?.includeSources) checkpointInput.sources = state.sources;
    const result = await publisher.publishFieldCheckpoint(checkpointInput);
    return result;
  },

  // ─── field_sources_diff: find silent-but-expected sources ───
  field_sources_diff(_oracle, args) {
    const { peekField } = require('../core/field-coupling');
    const state = peekField();
    if (!state) return { error: 'field not reachable' };
    const expected = Array.isArray(args?.expected) ? args.expected : [];
    if (expected.length === 0) {
      throw new Error('"expected" must be a non-empty array of source labels');
    }
    const fired = new Set(Object.keys(state.sources || {}));
    const firing = [];
    const silent = [];
    for (const label of expected) {
      if (fired.has(label)) {
        firing.push({ source: label, count: state.sources[label].count });
      } else {
        silent.push(label);
      }
    }
    return {
      expected: expected.length,
      firing: firing.length,
      silent: silent.length,
      firingDetails: firing,
      silentSources: silent,
    };
  },

  // ─── ecosystem_orient: return canonical 12-repo protocol on demand ───
  ecosystem_orient(_oracle, args) {
    const doc = _loadEcosystemDoc();
    if (!doc) {
      return {
        error: 'ECOSYSTEM.md not found at repo root. The hub is misconfigured — re-run the propagation script.',
        canonicalUrl: 'https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/blob/main/ECOSYSTEM.md',
      };
    }
    const format = (args && args.format) || 'full';
    const hash = crypto.createHash('sha256').update(doc).digest('hex').slice(0, 16);
    const base = {
      canonicalHash: hash,
      canonicalUrl: 'https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/blob/main/ECOSYSTEM.md',
      acknowledgement: 'Read ECOSYSTEM.md. Will run audit → reflect → covenant → swarm → substrate → ledger per change.',
      workflowSteps: [
        'a. oracle audit check / oracle reflect / oracle covenant / oracle security-scan / oracle risk-score (must return SEALED 15/15)',
        'b. oracle debug capture (record fix as pattern in quantum field)',
        'c. Reflector-oracle- reflect (independent cross-validation)',
        'd. REMEMBRANCE-AGENT-Swarm- review (for multi-file or >50 LoC changes)',
        'e. Void-Data-Compressor absorb (compress reusable patterns into substrate)',
        'f. REMEMBRANCE-BLOCKCHAIN publish (covenant-sealed changes get logged)',
        'g. git commit + push (only after a-f succeed)',
      ],
    };
    if (format === 'checklist') {
      return { ...base, section: _extractSection(doc, '## 2.') };
    }
    if (format === 'topology') {
      return { ...base, section: _extractSection(doc, '## 1.') };
    }
    return { ...base, document: doc };
  },
};

module.exports = { HANDLERS };
