/**
 * MCP Tool Handlers
 *
 * Dispatch map for all MCP tool calls. Each handler is a function
 * (oracle, args) => result that implements one tool's logic.
 * Extracted from the monolithic switch in server.js for maintainability.
 */

// ─── Core ───

const coreHandlers = {
  oracle_search(oracle, args) {
    return oracle.search(args.query || '', {
      limit: args.limit || 5,
      language: args.language,
      mode: args.mode || 'hybrid',
    });
  },

  oracle_resolve(oracle, args) {
    return oracle.resolve({
      description: args.description || '',
      tags: args.tags || [],
      language: args.language,
      heal: args.heal !== false,
    });
  },

  oracle_submit(oracle, args) {
    return oracle.submit(args.code, {
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
  },

  oracle_query(oracle, args) {
    return oracle.query({
      description: args.description || '',
      tags: args.tags || [],
      language: args.language,
      limit: args.limit || 5,
    });
  },

  oracle_feedback(oracle, args) {
    return oracle.feedback(args.id, args.success);
  },

  oracle_stats(oracle) {
    const storeStats = oracle.stats();
    const patternStats = oracle.patternStats();
    return { store: storeStats, patterns: patternStats };
  },

  oracle_register_pattern(oracle, args) {
    return oracle.registerPattern({
      name: args.name,
      code: args.code,
      language: args.language,
      description: args.description || '',
      tags: args.tags || [],
      testCode: args.testCode,
    });
  },
};

// ─── Search ───

const searchHandlers = {
  oracle_smart_search(oracle, args) {
    return oracle.smartSearch(args.query, {
      language: args.language,
      limit: args.limit || 10,
      mode: args.mode || 'hybrid',
    });
  },
};

// ─── Quality ───

const qualityHandlers = {
  oracle_reflect(oracle, args) {
    const { reflectionLoop } = require('../core/reflection');
    const result = reflectionLoop(args.code || '', {
      language: args.language,
      maxLoops: args.maxLoops || 3,
      targetCoherence: args.targetCoherence || 0.9,
    });
    result.history = result.history.map(h => ({
      loop: h.loop,
      coherence: h.coherence,
      strategy: h.strategy,
      reflectionScore: h.reflectionScore,
    }));
    return result;
  },

  oracle_covenant(oracle, args) {
    const { covenantCheck } = require('../core/covenant');
    return covenantCheck(args.code || '', {
      description: args.description || '',
      tags: args.tags || [],
    });
  },
};

// ─── Candidates ───

const candidateHandlers = {
  oracle_candidates(oracle, args) {
    const filters = {};
    if (args.language) filters.language = args.language;
    if (args.minCoherency) filters.minCoherency = args.minCoherency;
    if (args.method) filters.generationMethod = args.method;
    const candidates = oracle.candidates(filters);
    const stats = oracle.candidateStats();
    return { stats, candidates: candidates.slice(0, 50) };
  },

  oracle_auto_promote(oracle) {
    return oracle.autoPromote();
  },

  oracle_synthesize_tests(oracle, args) {
    return oracle.synthesizeTests({
      maxCandidates: args.maxCandidates,
      dryRun: args.dryRun || false,
      autoPromote: args.autoPromote !== false,
    });
  },
};

// ─── Debug ───

const debugHandlers = {
  oracle_debug_capture(oracle, args) {
    return oracle.debugCapture({
      errorMessage: args.errorMessage,
      stackTrace: args.stackTrace || '',
      fixCode: args.fixCode,
      fixDescription: args.fixDescription || '',
      language: args.language || 'javascript',
      tags: args.tags || [],
    });
  },

  oracle_debug_search(oracle, args) {
    return oracle.debugSearch({
      errorMessage: args.errorMessage,
      stackTrace: args.stackTrace || '',
      language: args.language,
      limit: args.limit || 5,
      federated: args.federated !== false,
    });
  },

  oracle_debug_feedback(oracle, args) {
    return oracle.debugFeedback(args.id, args.resolved);
  },

  oracle_debug_stats(oracle) {
    return oracle.debugStats();
  },

  oracle_debug_grow(oracle, args) {
    return oracle.debugGrow({ limit: args.limit });
  },

  oracle_debug_patterns(oracle, args) {
    return oracle.debugPatterns({
      language: args.language,
      errorClass: args.errorClass,
    });
  },
};

// ─── Storage ───

const storageHandlers = {
  oracle_sync(oracle, args) {
    const dir = args.direction || 'both';
    const opts = { dryRun: args.dryRun || false, language: args.language };
    if (dir === 'push') return oracle.syncToGlobal(opts);
    if (dir === 'pull') return oracle.syncFromGlobal(opts);
    return oracle.sync(opts);
  },

  oracle_share(oracle, args) {
    return oracle.share({
      patterns: args.patterns,
      tags: args.tags,
      minCoherency: args.minCoherency || 0.7,
      dryRun: args.dryRun || false,
    });
  },
};

// ─── Reflector ───

const reflectorHandlers = {
  oracle_reflector_snapshot(oracle, args) {
    const { takeSnapshot } = require('../reflector/engine');
    const result = takeSnapshot(args.path || process.cwd(), {
      minCoherence: args.minCoherence || 0.7,
      maxFilesPerRun: args.maxFiles || 50,
    });
    result.files = result.files.map(f => ({
      path: f.relativePath || f.path,
      language: f.language,
      coherence: f.coherence,
      dimensions: f.dimensions,
      covenantSealed: f.covenantSealed,
      error: f.error,
    }));
    return result;
  },

  oracle_reflector_run(oracle, args) {
    const { runReflector } = require('../reflector/scheduler');
    return runReflector(args.path || process.cwd(), {
      minCoherence: args.minCoherence,
      maxFilesPerRun: args.maxFiles,
      push: args.push || false,
      openPR: args.openPR || false,
      autoMerge: args.autoMerge || false,
    });
  },

  oracle_reflector_evaluate(oracle, args) {
    const { evaluateFile } = require('../reflector/engine');
    return evaluateFile(args.filePath);
  },

  oracle_reflector_heal(oracle, args) {
    const { healFile } = require('../reflector/engine');
    const result = healFile(args.filePath, {
      maxSerfLoops: args.maxLoops || 3,
      targetCoherence: args.targetCoherence || 0.95,
    });
    if (result.healed) {
      result.healedCode = result.healed.code;
    }
    delete result.original;
    delete result.healed;
    return result;
  },

  oracle_reflector_status(oracle, args) {
    const { getStatus } = require('../reflector/scheduler');
    return getStatus(args.path || process.cwd());
  },

  oracle_reflector_config(oracle, args) {
    const { loadConfig, saveConfig } = require('../reflector/scheduler');
    const rootDir = args.path || process.cwd();
    const cfg = loadConfig(rootDir);
    const updatable = ['intervalHours', 'minCoherence', 'autoMerge', 'push', 'openPR'];
    let updated = false;
    for (const key of updatable) {
      if (args[key] !== undefined) {
        cfg[key] = args[key];
        updated = true;
      }
    }
    if (updated) saveConfig(rootDir, cfg);
    return cfg;
  },

  oracle_reflector_multi(oracle, args) {
    const { multiReflect } = require('../reflector/multi');
    if (!args.repos || args.repos.length < 2) throw new Error('Need at least 2 repo paths');
    const result = multiReflect(args.repos, {
      minCoherence: args.minCoherence,
      maxFilesPerRun: args.maxFiles,
    });
    if (result.drift && result.drift.details) {
      result.drift.details.diverged = result.drift.details.diverged.slice(0, 20);
      result.drift.details.identical = result.drift.details.identical.slice(0, 10);
      result.drift.details.uniqueA = result.drift.details.uniqueA.slice(0, 10);
      result.drift.details.uniqueB = result.drift.details.uniqueB.slice(0, 10);
    }
    return result;
  },

  oracle_reflector_compare(oracle, args) {
    const { multiSnapshot, compareDimensions } = require('../reflector/multi');
    if (!args.repos || args.repos.length < 2) throw new Error('Need at least 2 repo paths');
    const snap = multiSnapshot(args.repos, { maxFilesPerRun: args.maxFiles });
    return compareDimensions(snap);
  },

  oracle_reflector_drift(oracle, args) {
    const { detectDrift } = require('../reflector/multi');
    if (!args.repos || args.repos.length < 2) throw new Error('Need at least 2 repo paths');
    const result = detectDrift(args.repos, { maxFilesPerRun: args.maxFiles });
    if (result.details) {
      result.details.diverged = result.details.diverged.slice(0, 20);
      result.details.identical = result.details.identical.slice(0, 10);
      result.details.uniqueA = result.details.uniqueA.slice(0, 10);
      result.details.uniqueB = result.details.uniqueB.slice(0, 10);
    }
    return result;
  },

  oracle_reflector_dry_run(oracle, args) {
    const { dryRun } = require('../reflector/safety');
    return dryRun(args.rootDir || process.cwd(), {
      minCoherence: args.minCoherence,
      maxFilesPerRun: args.maxFiles,
    });
  },

  oracle_reflector_safe_run(oracle, args) {
    const { safeReflect } = require('../reflector/safety');
    const result = safeReflect(args.rootDir || process.cwd(), {
      minCoherence: args.minCoherence,
      requireApproval: args.requireApproval,
      autoRollback: args.autoRollback !== false,
      dryRunMode: args.dryRun === true,
    });
    if (result.healedFiles) {
      result.healedFiles = result.healedFiles.map(f => ({
        path: f.path,
        size: f.code ? f.code.length : 0,
      }));
    }
    return result;
  },

  oracle_reflector_rollback(oracle, args) {
    const { rollback: doRollback } = require('../reflector/safety');
    return doRollback(args.rootDir || process.cwd(), { backupId: args.backupId, verify: true });
  },

  oracle_reflector_backups(oracle, args) {
    const { loadBackupManifests } = require('../reflector/safety');
    return loadBackupManifests(args.rootDir || process.cwd());
  },

  oracle_reflector_deep_score(oracle, args) {
    const { deepScore } = require('../reflector/scoring');
    return deepScore(args.code, { language: args.language });
  },

  oracle_reflector_repo_score(oracle, args) {
    const { repoScore } = require('../reflector/scoring');
    const result = repoScore(args.rootDir || process.cwd(), { maxFilesPerRun: args.maxFiles });
    if (result.files) {
      result.files = result.files.map(f => ({
        path: f.path,
        aggregate: f.aggregate,
        serfCoherence: f.serfCoherence,
        security: { score: f.security.score, riskLevel: f.security.riskLevel, totalFindings: f.security.findings.length },
      }));
    }
    return result;
  },

  oracle_reflector_security_scan(oracle, args) {
    const { securityScan: doScan } = require('../reflector/scoring');
    const { detectLanguage: detect } = require('../core/coherency');
    const lang = args.language || detect(args.code);
    return doScan(args.code, lang);
  },

  oracle_reflector_central_config(oracle, args) {
    const { loadCentralConfig, validateConfig } = require('../reflector/config');
    const config = loadCentralConfig(args.rootDir || process.cwd());
    const validation = validateConfig(config);
    return { config, validation };
  },

  oracle_reflector_central_set(oracle, args) {
    const { setCentralValue, validateConfig } = require('../reflector/config');
    const config = setCentralValue(args.rootDir || process.cwd(), args.key, args.value);
    const validation = validateConfig(config);
    return { key: args.key, value: args.value, valid: validation.valid, issues: validation.issues };
  },

  oracle_reflector_history(oracle, args) {
    const { loadHistoryV2 } = require('../reflector/history');
    const history = loadHistoryV2(args.rootDir || process.cwd());
    const last = args.last || 10;
    return { runs: history.runs.slice(-last), total: history.runs.length };
  },

  oracle_reflector_trend(oracle, args) {
    const { generateTrendChart } = require('../reflector/history');
    return { chart: generateTrendChart(args.rootDir || process.cwd(), { last: args.last || 30 }) };
  },

  oracle_reflector_stats(oracle, args) {
    const { computeStats } = require('../reflector/history');
    return computeStats(args.rootDir || process.cwd());
  },

  oracle_reflector_orchestrate(oracle, args) {
    const { orchestrate } = require('../reflector/orchestrator');
    return orchestrate(args.rootDir || process.cwd(), {
      dryRun: args.dryRun || false,
      push: args.push || false,
      openPR: args.openPR || false,
    });
  },

  oracle_reflector_coherence(oracle, args) {
    const { computeCoherence } = require('../reflector/coherenceScorer');
    return computeCoherence(args.filePath, { rootDir: args.rootDir || process.cwd() });
  },

  oracle_reflector_repo_coherence(oracle, args) {
    const { computeRepoCoherence } = require('../reflector/coherenceScorer');
    return computeRepoCoherence(args.rootDir || process.cwd());
  },

  oracle_reflector_format_pr(oracle, args) {
    const { formatPRComment } = require('../reflector/prFormatter');
    return { markdown: formatPRComment(args.report || {}) };
  },

  oracle_reflector_auto_commit(oracle, args) {
    const { safeAutoCommit, autoCommitStats } = require('../reflector/autoCommit');
    if (args.healedFiles) {
      return safeAutoCommit(args.rootDir, args.healedFiles, {
        testCommand: args.testCommand,
        buildCommand: args.buildCommand,
        dryRun: args.dryRun,
      });
    }
    return autoCommitStats(args.rootDir);
  },

  oracle_reflector_pattern_hook(oracle, args) {
    const { hookBeforeHeal } = require('../reflector/patternHook');
    return hookBeforeHeal(args.filePath, {
      rootDir: args.rootDir,
      maxResults: args.maxResults,
    });
  },

  oracle_reflector_pattern_hook_stats(oracle, args) {
    const { patternHookStats } = require('../reflector/patternHook');
    return patternHookStats(args.rootDir);
  },

  oracle_reflector_resolve_config(oracle, args) {
    const { resolveConfig } = require('../reflector/modes');
    return resolveConfig(args.rootDir, { mode: args.mode });
  },

  oracle_reflector_set_mode(oracle, args) {
    const { setMode } = require('../reflector/modes');
    return setMode(args.rootDir, args.mode);
  },

  oracle_reflector_list_modes() {
    const { listModes } = require('../reflector/modes');
    return listModes();
  },

  oracle_reflector_notify(oracle, args) {
    const { formatDiscordEmbed, formatSlackBlocks, detectPlatform, notificationStats } = require('../reflector/notifications');
    if (args.report) {
      const platform = detectPlatform(args.webhookUrl || '');
      const repoName = args.repoName || 'unknown';
      const opts = { repoName, prUrl: args.prUrl };
      return {
        platform,
        discord: formatDiscordEmbed(args.report, opts),
        slack: formatSlackBlocks(args.report, opts),
        note: args.webhookUrl ? 'Use the notify() function directly to send. MCP returns formatted payloads.' : 'No webhookUrl provided. Returning formatted payloads for both platforms.',
      };
    }
    return notificationStats(args.rootDir);
  },

  oracle_reflector_notification_stats(oracle, args) {
    const { notificationStats } = require('../reflector/notifications');
    return notificationStats(args.rootDir);
  },

  oracle_reflector_dashboard_data(oracle, args) {
    const { gatherDashboardData } = require('../reflector/dashboard');
    return gatherDashboardData(args.rootDir);
  },
};

// ─── LLM ───

const llmHandlers = {
  oracle_llm_status(oracle) {
    return { available: oracle.isLLMAvailable(), engine: 'claude-bridge' };
  },
};

// ─── Harvest ───

const harvestHandlers = {
  oracle_harvest(oracle, args) {
    const { harvest } = require('../ci/harvest');
    return harvest(oracle, args.path, {
      language: args.language,
      dryRun: args.dryRun || false,
      splitMode: args.splitMode || 'file',
      branch: args.branch,
      maxFiles: args.maxFiles || 200,
    });
  },
};

// ─── Maintenance ───

const maintenanceHandlers = {
  oracle_maintain(oracle, args) {
    return oracle.fullOptimizationCycle({
      maxHealsPerRun: args.maxHealsPerRun || 20,
    });
  },
};

// Combined dispatch map
const HANDLERS = Object.assign({},
  coreHandlers,
  searchHandlers,
  qualityHandlers,
  candidateHandlers,
  debugHandlers,
  storageHandlers,
  reflectorHandlers,
  llmHandlers,
  harvestHandlers,
  maintenanceHandlers,
);

module.exports = { HANDLERS };
