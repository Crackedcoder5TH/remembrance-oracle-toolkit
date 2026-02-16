/**
 * Remembrance Oracle Toolkit — Main Entry Point
 *
 * A code memory system that:
 * - Only stores code that PROVES itself (passes validation + coherency threshold)
 * - Scores all code on coherency (syntax, completeness, consistency, test proof)
 * - Serves the most relevant, highest-scoring code to any AI that queries it
 * - Tracks historical reliability so quality improves over time
 *
 * Secondary systems (Dashboard, Cloud, Auth, IDE, CI) are opt-in plugins.
 * Load them via the plugin system:
 *   const { PluginManager } = require('./plugins/manager');
 *   const { loadBuiltinPlugin } = require('./plugins/builtins');
 *   const pm = new PluginManager(oracle);
 *   loadBuiltinPlugin(pm, 'dashboard');
 */

const { RemembranceOracle } = require('./api/oracle');
const { computeCoherencyScore, detectLanguage } = require('./core/coherency');
const { validateCode } = require('./core/validator');
const { rankEntries, computeRelevance } = require('./core/relevance');
const { VerifiedHistoryStore } = require('./store/history');
const { SQLiteStore } = require('./store/sqlite');
const { AIConnector } = require('./connectors/connector');
const providers = require('./connectors/providers');
const githubBridge = require('./connectors/github-bridge');
const { PatternLibrary, classifyPattern, inferComplexity, THRESHOLDS } = require('./patterns/library');
const { parseCode, astCoherencyBoost } = require('./core/parsers/ast');
const { sandboxExecute, sandboxGo, sandboxRust } = require('./core/sandbox');
const { semanticSearch, semanticSimilarity, expandQuery, identifyConcepts } = require('./search/embeddings');
const { vectorSimilarity, embedDocument, nearestTerms } = require('./search/vectors');
const { MCPServer, startMCPServer } = require('./mcp/server');
const { WebSocketServer } = require('./core/websocket');
const { VersionManager, semanticDiff, extractFunctions } = require('./core/versioning');
const { generateAnalytics, computeTagCloud } = require('./analytics/analytics');
const { covenantCheck, getCovenant, formatCovenantResult, COVENANT_PRINCIPLES } = require('./core/covenant');
const { actionableFeedback, formatFeedback, covenantFeedback, coherencyFeedback } = require('./core/feedback');
const { reflectionLoop, formatReflectionResult, observeCoherence, reflectionScore, generateCandidates, STRATEGIES, DIMENSION_WEIGHTS } = require('./core/reflection');
const { DebugOracle, fingerprint: debugFingerprint, normalizeError, classifyError, computeConfidence, ERROR_CATEGORIES } = require('./debug/debug-oracle');
const { parseIntent, rewriteQuery, editDistance, applyIntentRanking, applyUsageBoosts, selectSearchMode, expandLanguages, smartSearch, INTENT_PATTERNS, CORRECTIONS, LANGUAGE_ALIASES, LANGUAGE_FAMILIES } = require('./core/search-intelligence');
const { healStalePatterns, healLowFeedback, healOverEvolved, computeUsageBoosts, actOnInsights, ACTIONABLE_DEFAULTS } = require('./analytics/actionable-insights');
const reflectorScoring = require('./reflector/scoring');
const reflectorMulti = require('./reflector/multi');
const reflectorReport = require('./reflector/report');
const { LLMClient, LLMGenerator } = require('./core/llm-generator');
const { transpile: astTranspile, parseJS, tokenize: astTokenize, toSnakeCase } = require('./core/ast-transpiler');
const { ClaudeBridge, findClaudeCLI, extractCodeBlock: extractLLMCode } = require('./core/claude-bridge');
const { ModulePattern, DependencyGraph, TemplateEngine, ModuleStore, scaffold, compose } = require('./patterns/multi-file');
const { PatternComposer, BUILT_IN_TEMPLATES } = require('./patterns/composer');
const { PluginManager, HookEmitter, VALID_HOOKS } = require('./plugins/manager');
const { health: healthCheck, metrics: metricsSnapshot, coherencyDistribution } = require('./health/monitor');
const { createOracleContext, evolve: selfEvolve, stalenessPenalty, evolvePenalty, evolutionAdjustment, needsAutoHeal, autoHeal, captureRejection, detectRegressions, recheckCoherency, EVOLUTION_DEFAULTS, LifecycleEngine, LIFECYCLE_DEFAULTS, HealingWhisper, WHISPER_INTROS, WHISPER_DETAILS, selfImprove, selfOptimize, fullCycle: fullOptimizationCycle, consolidateDuplicates, consolidateTags, pruneStuckCandidates, polishCycle, iterativePolish, OPTIMIZE_DEFAULTS } = require('./evolution');
const { retryWithBackoff, isRetryableError, withRetry, resilientFetchSource } = require('./core/resilience');

// Plugin system for opt-in subsystems
const { loadBuiltinPlugin, loadAllBuiltins, listBuiltins } = require('./plugins/builtins');

module.exports = {
  // Core
  RemembranceOracle,
  computeCoherencyScore,
  detectLanguage,
  validateCode,
  rankEntries,
  computeRelevance,
  VerifiedHistoryStore,
  SQLiteStore,

  // AI Connectors
  AIConnector,

  // Provider tool definitions (give these to the AI so it can call Oracle)
  OPENAI_TOOLS: providers.OPENAI_TOOLS,
  ANTHROPIC_TOOLS: providers.ANTHROPIC_TOOLS,
  GEMINI_TOOLS: providers.GEMINI_TOOLS,
  MCP_TOOLS: providers.MCP_TOOLS,

  // Provider translators
  fromOpenAI: providers.fromOpenAI,
  toOpenAI: providers.toOpenAI,
  fromAnthropic: providers.fromAnthropic,
  toAnthropic: providers.toAnthropic,
  fromGemini: providers.fromGemini,
  toGemini: providers.toGemini,
  fromMCP: providers.fromMCP,
  toMCP: providers.toMCP,

  // GitHub bridge
  parseIssueCommand: githubBridge.parseIssueCommand,
  formatAsComment: githubBridge.formatAsComment,

  // Pattern Library
  PatternLibrary,
  classifyPattern,
  inferComplexity,
  THRESHOLDS,

  // AST parsing
  parseCode,
  astCoherencyBoost,

  // Sandbox execution
  sandboxExecute,
  sandboxGo,
  sandboxRust,

  // Word vectors
  vectorSimilarity,
  embedDocument,
  nearestTerms,

  // MCP Server
  MCPServer,
  startMCPServer,

  // WebSocket
  WebSocketServer,

  // Versioning
  VersionManager,
  semanticDiff,
  extractFunctions,

  // Analytics
  generateAnalytics,
  computeTagCloud,

  // Covenant
  covenantCheck,
  getCovenant,
  formatCovenantResult,
  COVENANT_PRINCIPLES,

  // Actionable Feedback
  actionableFeedback,
  formatFeedback,
  covenantFeedback,
  coherencyFeedback,

  // Reflection
  reflectionLoop,
  formatReflectionResult,
  observeCoherence,
  reflectionScore,
  generateCandidates,
  STRATEGIES,
  DIMENSION_WEIGHTS,

  // Semantic search
  semanticSearch,
  semanticSimilarity,
  expandQuery,
  identifyConcepts,

  // Debug Oracle
  DebugOracle,
  debugFingerprint,
  normalizeError,
  classifyError,
  computeConfidence,
  ERROR_CATEGORIES,

  // Search Intelligence
  parseIntent,
  rewriteQuery,
  editDistance,
  applyIntentRanking,
  applyUsageBoosts,
  selectSearchMode,
  expandLanguages,
  smartSearch,
  INTENT_PATTERNS,
  CORRECTIONS,
  LANGUAGE_ALIASES,
  LANGUAGE_FAMILIES,

  // Actionable Insights
  healStalePatterns,
  healLowFeedback,
  healOverEvolved,
  computeUsageBoosts,
  actOnInsights,
  ACTIONABLE_DEFAULTS,

  // Self-Reflector Bot (from multi.js — engine + orchestrator + scheduler)
  reflectorScanDirectory: reflectorMulti.scanDirectory,
  reflectorEvaluateFile: reflectorMulti.evaluateFile,
  reflectorTakeSnapshot: reflectorMulti.takeSnapshot,
  reflectorHealFile: reflectorMulti.healFile,
  reflectorReflect: reflectorMulti.reflect,
  reflectorFormatReport: reflectorMulti.formatReport,
  reflectorFormatPRBody: reflectorMulti.formatPRBody,
  reflectorDefaultConfig: reflectorMulti.DEFAULT_CONFIG,
  reflectorCreateHealingBranch: reflectorReport.createHealingBranch,
  reflectorGenerateWorkflow: reflectorReport.generateReflectorWorkflow,
  reflectorFindExistingPR: reflectorReport.findExistingReflectorPR,
  reflectorRunReflector: reflectorMulti.runReflector,
  reflectorStartScheduler: reflectorMulti.startScheduler,
  reflectorLoadConfig: reflectorMulti.loadConfig,
  reflectorSaveConfig: reflectorMulti.saveConfig,
  reflectorGetStatus: reflectorMulti.getStatus,

  // Multi-Repo Reflector
  reflectorMultiSnapshot: reflectorMulti.multiSnapshot,
  reflectorCompareDimensions: reflectorMulti.compareDimensions,
  reflectorDetectDrift: reflectorMulti.detectDrift,
  reflectorUnifiedHeal: reflectorMulti.unifiedHeal,
  reflectorMultiReflect: reflectorMulti.multiReflect,
  reflectorFormatMultiReport: reflectorMulti.formatMultiReport,
  reflectorCodeSimilarity: reflectorMulti.codeSimilarity,
  reflectorExtractFunctionBody: reflectorMulti.extractFunctionBody,

  // Reflector Shared Utilities (from scoring.js)
  reflectorEnsureDir: reflectorScoring.ensureDir,
  reflectorLoadJSON: reflectorScoring.loadJSON,
  reflectorSaveJSON: reflectorScoring.saveJSON,
  reflectorTrimArray: reflectorScoring.trimArray,

  // Reflector Safety & Revert (from report.js)
  reflectorCreateBackup: reflectorReport.createBackup,
  reflectorLoadBackups: reflectorReport.loadBackupManifests,
  reflectorGetLatestBackup: reflectorReport.getLatestBackup,
  reflectorDryRun: reflectorReport.dryRun,
  reflectorCheckApproval: reflectorReport.checkApproval,
  reflectorRecordApproval: reflectorReport.recordApproval,
  reflectorRollback: reflectorReport.rollback,
  reflectorLoadRollbacks: reflectorReport.loadRollbacks,
  reflectorCoherenceGuard: reflectorReport.coherenceGuard,
  reflectorSafeReflect: reflectorReport.safeReflect,

  // Reflector Deep Scoring Engine
  reflectorDeepScore: reflectorScoring.deepScore,
  reflectorRepoScore: reflectorScoring.repoScore,
  reflectorCyclomaticComplexity: reflectorScoring.calculateCyclomaticComplexity,
  reflectorCommentDensity: reflectorScoring.analyzeCommentDensity,
  reflectorSecurityScan: reflectorScoring.securityScan,
  reflectorNestingDepth: reflectorScoring.analyzeNestingDepth,
  reflectorQualityMetrics: reflectorScoring.computeQualityMetrics,
  reflectorFormatDeepScore: reflectorScoring.formatDeepScore,

  // Reflector Central Configuration (from scoring.js)
  reflectorCentralDefaults: reflectorScoring.CENTRAL_DEFAULTS,
  reflectorLoadCentralConfig: reflectorScoring.loadCentralConfig,
  reflectorSaveCentralConfig: reflectorScoring.saveCentralConfig,
  reflectorSetCentralValue: reflectorScoring.setCentralValue,
  reflectorGetCentralValue: reflectorScoring.getCentralValue,
  reflectorResetCentralConfig: reflectorScoring.resetCentralConfig,
  reflectorValidateConfig: reflectorScoring.validateConfig,
  reflectorToEngineConfig: reflectorScoring.toEngineConfig,
  reflectorListConfigKeys: reflectorScoring.listConfigKeys,

  // Reflector History & Logging (from report.js)
  reflectorLoadHistoryV2: reflectorReport.loadHistoryV2,
  reflectorSaveRunRecord: reflectorReport.saveRunRecord,
  reflectorCreateRunRecord: reflectorReport.createRunRecord,
  reflectorAppendLog: reflectorReport.appendLog,
  reflectorReadLogTail: reflectorReport.readLogTail,
  reflectorComputeStats: reflectorReport.computeStats,
  reflectorTrendChart: reflectorReport.generateTrendChart,
  reflectorTimeline: reflectorReport.generateTimeline,

  // Reflector Orchestrator (from multi.js)
  reflectorOrchestrate: reflectorMulti.orchestrate,
  reflectorFormatOrchestration: reflectorMulti.formatOrchestration,

  // Reflector Error Handling (from scoring.js)
  reflectorErrorTypes: reflectorScoring.ERROR_TYPES,
  reflectorClassifyError: reflectorScoring.classifyError,
  reflectorWithErrorHandling: reflectorScoring.withErrorHandling,
  reflectorWithRetry: reflectorScoring.withRetry,
  reflectorWithCircuitBreaker: reflectorScoring.withCircuitBreaker,
  reflectorResetCircuitBreaker: reflectorScoring.resetCircuitBreaker,
  reflectorBuildErrorReport: reflectorScoring.buildErrorReport,

  // Reflector Real Coherence Scoring (from scoring.js)
  reflectorComputeCoherence: reflectorScoring.computeCoherence,
  reflectorComputeRepoCoherence: reflectorScoring.computeRepoCoherence,
  reflectorFormatCoherence: reflectorScoring.formatCoherence,
  reflectorScoreSyntaxValidity: reflectorScoring.scoreSyntaxValidity,
  reflectorScoreReadability: reflectorScoring.scoreReadability,
  reflectorScoreTestProof: reflectorScoring.scoreTestProof,
  reflectorScoreHistoricalReliability: reflectorScoring.scoreHistoricalReliability,
  reflectorCoherenceWeights: reflectorScoring.DEFAULT_WEIGHTS,

  // Reflector PR Comment Formatter (from report.js)
  reflectorFormatPRComment: reflectorReport.formatPRComment,
  reflectorFormatFileComment: reflectorReport.formatFileComment,
  reflectorFormatCheckRun: reflectorReport.formatCheckRun,
  reflectorProgressBar: reflectorReport.progressBar,
  reflectorScoreIndicator: reflectorReport.scoreIndicator,

  // Reflector Auto-Commit Safety (from report.js)
  reflectorCreateSafetyBranch: reflectorReport.createSafetyBranch,
  reflectorRunTestGate: reflectorReport.runTestGate,
  reflectorMergeIfPassing: reflectorReport.mergeIfPassing,
  reflectorSafeAutoCommit: reflectorReport.safeAutoCommit,
  reflectorAutoCommitStats: reflectorReport.autoCommitStats,
  reflectorFormatAutoCommit: reflectorReport.formatAutoCommit,
  reflectorLoadAutoCommitHistory: reflectorReport.loadAutoCommitHistory,

  // Reflector Pattern Library Hook (from report.js)
  reflectorHookBeforeHeal: reflectorReport.hookBeforeHeal,
  reflectorBatchPatternLookup: reflectorReport.batchPatternLookup,
  reflectorQueryPatternsForFile: reflectorReport.queryPatternsForFile,
  reflectorBuildHealingContext: reflectorReport.buildHealingContext,
  reflectorPatternHookStats: reflectorReport.patternHookStats,
  reflectorRecordPatternHookUsage: reflectorReport.recordPatternHookUsage,
  reflectorFormatPatternHook: reflectorReport.formatPatternHook,
  reflectorExtractFileHints: reflectorReport.extractFileHints,

  // Reflector Configurable Thresholds & Modes (from scoring.js)
  reflectorPresetModes: reflectorScoring.PRESET_MODES,
  reflectorEnvOverrides: reflectorScoring.ENV_OVERRIDES,
  reflectorReadEnvOverrides: reflectorScoring.readEnvOverrides,
  reflectorResolveConfig: reflectorScoring.resolveConfig,
  reflectorShouldAutoCreatePR: reflectorScoring.shouldAutoCreatePR,
  reflectorListModes: reflectorScoring.listModes,
  reflectorSetMode: reflectorScoring.setMode,
  reflectorGetCurrentMode: reflectorScoring.getCurrentMode,
  reflectorFormatResolvedConfig: reflectorScoring.formatResolvedConfig,

  // Reflector Discord/Slack Notifications (from report.js)
  reflectorNotify: reflectorReport.notify,
  reflectorNotifyFromReport: reflectorReport.notifyFromReport,
  reflectorFormatDiscordEmbed: reflectorReport.formatDiscordEmbed,
  reflectorFormatSlackBlocks: reflectorReport.formatSlackBlocks,
  reflectorDetectPlatform: reflectorReport.detectPlatform,
  reflectorNotificationStats: reflectorReport.notificationStats,
  reflectorLoadNotificationHistory: reflectorReport.loadNotificationHistory,

  // Reflector Dashboard Integration (from report.js)
  reflectorGatherDashboardData: reflectorReport.gatherDashboardData,
  reflectorGenerateDashboardHTML: reflectorReport.generateDashboardHTML,
  reflectorCreateReflectorDashboard: reflectorReport.createReflectorDashboard,
  reflectorStartReflectorDashboard: reflectorReport.startReflectorDashboard,
  reflectorHandleApiRequest: reflectorReport.handleApiRequest,

  // LLM Generation
  LLMClient,
  LLMGenerator,

  // AST Transpilation
  astTranspile,
  parseJS,
  astTokenize,
  toSnakeCase,

  // Claude Bridge (Native LLM)
  ClaudeBridge,
  findClaudeCLI,
  extractLLMCode,

  // Multi-File Patterns
  ModulePattern,
  DependencyGraph,
  TemplateEngine,
  ModuleStore,
  scaffold,
  compose,

  // Pattern Composition
  PatternComposer,
  BUILT_IN_TEMPLATES,

  // Plugin System
  PluginManager,
  HookEmitter,
  VALID_HOOKS,

  // Built-in Plugins (opt-in subsystems)
  loadBuiltinPlugin,
  loadAllBuiltins,
  listBuiltins,

  // Health & Metrics
  healthCheck,
  metricsSnapshot,
  coherencyDistribution,

  // Evolution Context
  createOracleContext,

  // Self-Evolution
  selfEvolve,
  stalenessPenalty,
  evolvePenalty,
  evolutionAdjustment,
  needsAutoHeal,
  autoHeal,
  captureRejection,
  detectRegressions,
  recheckCoherency,
  EVOLUTION_DEFAULTS,

  // Lifecycle Engine
  LifecycleEngine,
  LIFECYCLE_DEFAULTS,

  // Healing Whisper
  HealingWhisper,
  WHISPER_INTROS,
  WHISPER_DETAILS,

  // Self-Optimization
  selfImprove,
  selfOptimize,
  fullOptimizationCycle,
  consolidateDuplicates,
  consolidateTags,
  pruneStuckCandidates,
  polishCycle,
  iterativePolish,
  OPTIMIZE_DEFAULTS,

  // Resilience
  retryWithBackoff,
  isRetryableError,
  withRetry,
  resilientFetchSource,

};
