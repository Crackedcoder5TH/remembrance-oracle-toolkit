/**
 * Remembrance Oracle Toolkit — Main Entry Point
 *
 * A code memory system that:
 * - Only stores code that PROVES itself (passes validation + coherency threshold)
 * - Scores all code on coherency (syntax, completeness, consistency, test proof)
 * - Serves the most relevant, highest-scoring code to any AI that queries it
 * - Tracks historical reliability so quality improves over time
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
const { CIFeedbackReporter, wrapWithTracking } = require('./ci/feedback');
const { vectorSimilarity, embedDocument, nearestTerms } = require('./search/vectors');
const { MCPServer, startMCPServer } = require('./mcp/server');
const { createDashboardServer, startDashboard, createRateLimiter } = require('./dashboard/server');
const { WebSocketServer } = require('./core/websocket');
const { VersionManager, semanticDiff, extractFunctions } = require('./core/versioning');
const { AuthManager, authMiddleware, ROLES, canWrite, canManageUsers, canRead } = require('./auth/auth');
const { TeamManager, TEAM_ROLES, TEAM_ROLE_HIERARCHY } = require('./auth/teams');
const { generateAnalytics, computeTagCloud } = require('./analytics/analytics');
const { discoverPatterns, autoSeed } = require('./ci/auto-seed');
const { harvest, harvestFunctions, splitFunctions } = require('./ci/harvest');
const { installHooks, uninstallHooks, runPreCommitCheck } = require('./ci/hooks');
const { covenantCheck, getCovenant, formatCovenantResult, COVENANT_PRINCIPLES } = require('./core/covenant');
const { actionableFeedback, formatFeedback, covenantFeedback, coherencyFeedback } = require('./core/feedback');
const { reflectionLoop, formatReflectionResult, observeCoherence, reflectionScore, generateCandidates, STRATEGIES, DIMENSION_WEIGHTS } = require('./core/reflection');
const { DebugOracle, fingerprint: debugFingerprint, normalizeError, classifyError, computeConfidence, ERROR_CATEGORIES } = require('./debug/debug-oracle');
const { IDEBridge, SEVERITY: IDE_SEVERITY } = require('./ide/bridge');
const { parseIntent, rewriteQuery, editDistance, applyIntentRanking, applyUsageBoosts, selectSearchMode, expandLanguages, smartSearch, INTENT_PATTERNS, CORRECTIONS, LANGUAGE_ALIASES, LANGUAGE_FAMILIES } = require('./core/search-intelligence');
const { healStalePatterns, healLowFeedback, healOverEvolved, computeUsageBoosts, actOnInsights, ACTIONABLE_DEFAULTS } = require('./analytics/actionable-insights');
const reflectorEngine = require('./reflector/engine');
const reflectorGithub = require('./reflector/github');
const reflectorScheduler = require('./reflector/scheduler');
const reflectorMulti = require('./reflector/multi');
const reflectorSafety = require('./reflector/safety');
const reflectorScoring = require('./reflector/scoring');
const reflectorConfig = require('./reflector/config');
const reflectorHistory = require('./reflector/history');
const reflectorUtils = require('./reflector/utils');
const reflectorOrchestrator = require('./reflector/orchestrator');
const reflectorErrorHandler = require('./reflector/errorHandler');
const reflectorCoherenceScorer = require('./reflector/coherenceScorer');
const reflectorPRFormatter = require('./reflector/prFormatter');
const reflectorAutoCommit = require('./reflector/autoCommit');
const reflectorPatternHook = require('./reflector/patternHook');
const reflectorModes = require('./reflector/modes');
const reflectorNotifications = require('./reflector/notifications');
const reflectorDashboard = require('./reflector/dashboard');
const { CloudSyncServer, createToken, verifyToken } = require('./cloud/server');
const { RemoteOracleClient, registerRemote, removeRemote, listRemotes, federatedRemoteSearch, checkRemoteHealth } = require('./cloud/client');
const { LLMClient, LLMGenerator } = require('./core/llm-generator');
const { transpile: astTranspile, parseJS, tokenize: astTokenize, toSnakeCase } = require('./core/ast-transpiler');
const { ClaudeBridge, findClaudeCLI, extractCodeBlock: extractLLMCode } = require('./core/claude-bridge');
const { ModulePattern, DependencyGraph, TemplateEngine, ModuleStore, scaffold, compose } = require('./patterns/multi-file');
const { PatternComposer, BUILT_IN_TEMPLATES } = require('./patterns/composer');
const { PluginManager, HookEmitter, VALID_HOOKS } = require('./plugins/manager');
const { health: healthCheck, metrics: metricsSnapshot, coherencyDistribution } = require('./health/monitor');
const { createOracleContext, evolve: selfEvolve, stalenessPenalty, evolvePenalty, evolutionAdjustment, needsAutoHeal, autoHeal, captureRejection, detectRegressions, recheckCoherency, EVOLUTION_DEFAULTS, LifecycleEngine, LIFECYCLE_DEFAULTS, HealingWhisper, WHISPER_INTROS, WHISPER_DETAILS, selfImprove, selfOptimize, fullCycle: fullOptimizationCycle, consolidateDuplicates, consolidateTags, pruneStuckCandidates, polishCycle, iterativePolish, OPTIMIZE_DEFAULTS } = require('./evolution');
const { retryWithBackoff, isRetryableError, withRetry, resilientFetchSource } = require('./core/resilience');

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

  // Dashboard
  createDashboardServer,
  startDashboard,
  createRateLimiter,

  // WebSocket
  WebSocketServer,

  // Versioning
  VersionManager,
  semanticDiff,
  extractFunctions,

  // Auth
  AuthManager,
  authMiddleware,
  ROLES,
  canWrite,
  canManageUsers,
  canRead,

  // Teams / Enterprise
  TeamManager,
  TEAM_ROLES,
  TEAM_ROLE_HIERARCHY,

  // Auto-seed
  discoverPatterns,
  autoSeed,

  // Analytics
  generateAnalytics,
  computeTagCloud,

  // Harvest
  harvest,
  harvestFunctions,
  splitFunctions,

  // Git Hooks
  installHooks,
  uninstallHooks,
  runPreCommitCheck,

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

  // CI Feedback
  CIFeedbackReporter,
  wrapWithTracking,

  // Debug Oracle
  DebugOracle,
  debugFingerprint,
  normalizeError,
  classifyError,
  computeConfidence,
  ERROR_CATEGORIES,

  // IDE Integration
  IDEBridge,
  IDE_SEVERITY,

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

  // Self-Reflector Bot
  reflectorScanDirectory: reflectorEngine.scanDirectory,
  reflectorEvaluateFile: reflectorEngine.evaluateFile,
  reflectorTakeSnapshot: reflectorEngine.takeSnapshot,
  reflectorHealFile: reflectorEngine.healFile,
  reflectorReflect: reflectorEngine.reflect,
  reflectorFormatReport: reflectorEngine.formatReport,
  reflectorFormatPRBody: reflectorEngine.formatPRBody,
  reflectorDefaultConfig: reflectorEngine.DEFAULT_CONFIG,
  reflectorCreateHealingBranch: reflectorGithub.createHealingBranch,
  reflectorGenerateWorkflow: reflectorGithub.generateReflectorWorkflow,
  reflectorFindExistingPR: reflectorGithub.findExistingReflectorPR,
  reflectorRunReflector: reflectorScheduler.runReflector,
  reflectorStartScheduler: reflectorScheduler.startScheduler,
  reflectorLoadConfig: reflectorScheduler.loadConfig,
  reflectorSaveConfig: reflectorScheduler.saveConfig,
  reflectorGetStatus: reflectorScheduler.getStatus,

  // Multi-Repo Reflector
  reflectorMultiSnapshot: reflectorMulti.multiSnapshot,
  reflectorCompareDimensions: reflectorMulti.compareDimensions,
  reflectorDetectDrift: reflectorMulti.detectDrift,
  reflectorUnifiedHeal: reflectorMulti.unifiedHeal,
  reflectorMultiReflect: reflectorMulti.multiReflect,
  reflectorFormatMultiReport: reflectorMulti.formatMultiReport,
  reflectorCodeSimilarity: reflectorMulti.codeSimilarity,
  reflectorExtractFunctionBody: reflectorMulti.extractFunctionBody,

  // Reflector Shared Utilities
  reflectorEnsureDir: reflectorUtils.ensureDir,
  reflectorLoadJSON: reflectorUtils.loadJSON,
  reflectorSaveJSON: reflectorUtils.saveJSON,
  reflectorTrimArray: reflectorUtils.trimArray,

  // Reflector Safety & Revert
  reflectorCreateBackup: reflectorSafety.createBackup,
  reflectorLoadBackups: reflectorSafety.loadBackupManifests,
  reflectorGetLatestBackup: reflectorSafety.getLatestBackup,
  reflectorDryRun: reflectorSafety.dryRun,
  reflectorCheckApproval: reflectorSafety.checkApproval,
  reflectorRecordApproval: reflectorSafety.recordApproval,
  reflectorRollback: reflectorSafety.rollback,
  reflectorLoadRollbacks: reflectorSafety.loadRollbacks,
  reflectorCoherenceGuard: reflectorSafety.coherenceGuard,
  reflectorSafeReflect: reflectorSafety.safeReflect,

  // Reflector Deep Scoring Engine
  reflectorDeepScore: reflectorScoring.deepScore,
  reflectorRepoScore: reflectorScoring.repoScore,
  reflectorCyclomaticComplexity: reflectorScoring.calculateCyclomaticComplexity,
  reflectorCommentDensity: reflectorScoring.analyzeCommentDensity,
  reflectorSecurityScan: reflectorScoring.securityScan,
  reflectorNestingDepth: reflectorScoring.analyzeNestingDepth,
  reflectorQualityMetrics: reflectorScoring.computeQualityMetrics,
  reflectorFormatDeepScore: reflectorScoring.formatDeepScore,

  // Reflector Central Configuration
  reflectorCentralDefaults: reflectorConfig.CENTRAL_DEFAULTS,
  reflectorLoadCentralConfig: reflectorConfig.loadCentralConfig,
  reflectorSaveCentralConfig: reflectorConfig.saveCentralConfig,
  reflectorSetCentralValue: reflectorConfig.setCentralValue,
  reflectorGetCentralValue: reflectorConfig.getCentralValue,
  reflectorResetCentralConfig: reflectorConfig.resetCentralConfig,
  reflectorValidateConfig: reflectorConfig.validateConfig,
  reflectorToEngineConfig: reflectorConfig.toEngineConfig,
  reflectorListConfigKeys: reflectorConfig.listConfigKeys,

  // Reflector History & Logging
  reflectorLoadHistoryV2: reflectorHistory.loadHistoryV2,
  reflectorSaveRunRecord: reflectorHistory.saveRunRecord,
  reflectorCreateRunRecord: reflectorHistory.createRunRecord,
  reflectorAppendLog: reflectorHistory.appendLog,
  reflectorReadLogTail: reflectorHistory.readLogTail,
  reflectorComputeStats: reflectorHistory.computeStats,
  reflectorTrendChart: reflectorHistory.generateTrendChart,
  reflectorTimeline: reflectorHistory.generateTimeline,

  // Reflector Orchestrator
  reflectorOrchestrate: reflectorOrchestrator.orchestrate,
  reflectorFormatOrchestration: reflectorOrchestrator.formatOrchestration,

  // Reflector Error Handling
  reflectorErrorTypes: reflectorErrorHandler.ERROR_TYPES,
  reflectorClassifyError: reflectorErrorHandler.classifyError,
  reflectorWithErrorHandling: reflectorErrorHandler.withErrorHandling,
  reflectorWithRetry: reflectorErrorHandler.withRetry,
  reflectorWithCircuitBreaker: reflectorErrorHandler.withCircuitBreaker,
  reflectorResetCircuitBreaker: reflectorErrorHandler.resetCircuitBreaker,
  reflectorBuildErrorReport: reflectorErrorHandler.buildErrorReport,

  // Reflector Real Coherence Scoring
  reflectorComputeCoherence: reflectorCoherenceScorer.computeCoherence,
  reflectorComputeRepoCoherence: reflectorCoherenceScorer.computeRepoCoherence,
  reflectorFormatCoherence: reflectorCoherenceScorer.formatCoherence,
  reflectorScoreSyntaxValidity: reflectorCoherenceScorer.scoreSyntaxValidity,
  reflectorScoreReadability: reflectorCoherenceScorer.scoreReadability,
  reflectorScoreTestProof: reflectorCoherenceScorer.scoreTestProof,
  reflectorScoreHistoricalReliability: reflectorCoherenceScorer.scoreHistoricalReliability,
  reflectorCoherenceWeights: reflectorCoherenceScorer.DEFAULT_WEIGHTS,

  // Reflector PR Comment Formatter
  reflectorFormatPRComment: reflectorPRFormatter.formatPRComment,
  reflectorFormatFileComment: reflectorPRFormatter.formatFileComment,
  reflectorFormatCheckRun: reflectorPRFormatter.formatCheckRun,
  reflectorProgressBar: reflectorPRFormatter.progressBar,
  reflectorScoreIndicator: reflectorPRFormatter.scoreIndicator,

  // Reflector Auto-Commit Safety
  reflectorCreateSafetyBranch: reflectorAutoCommit.createSafetyBranch,
  reflectorRunTestGate: reflectorAutoCommit.runTestGate,
  reflectorMergeIfPassing: reflectorAutoCommit.mergeIfPassing,
  reflectorSafeAutoCommit: reflectorAutoCommit.safeAutoCommit,
  reflectorAutoCommitStats: reflectorAutoCommit.autoCommitStats,
  reflectorFormatAutoCommit: reflectorAutoCommit.formatAutoCommit,
  reflectorLoadAutoCommitHistory: reflectorAutoCommit.loadAutoCommitHistory,

  // Reflector Pattern Library Hook
  reflectorHookBeforeHeal: reflectorPatternHook.hookBeforeHeal,
  reflectorBatchPatternLookup: reflectorPatternHook.batchPatternLookup,
  reflectorQueryPatternsForFile: reflectorPatternHook.queryPatternsForFile,
  reflectorBuildHealingContext: reflectorPatternHook.buildHealingContext,
  reflectorPatternHookStats: reflectorPatternHook.patternHookStats,
  reflectorRecordPatternHookUsage: reflectorPatternHook.recordPatternHookUsage,
  reflectorFormatPatternHook: reflectorPatternHook.formatPatternHook,
  reflectorExtractFileHints: reflectorPatternHook.extractFileHints,

  // Reflector Configurable Thresholds & Modes
  reflectorPresetModes: reflectorModes.PRESET_MODES,
  reflectorEnvOverrides: reflectorModes.ENV_OVERRIDES,
  reflectorReadEnvOverrides: reflectorModes.readEnvOverrides,
  reflectorResolveConfig: reflectorModes.resolveConfig,
  reflectorShouldAutoCreatePR: reflectorModes.shouldAutoCreatePR,
  reflectorListModes: reflectorModes.listModes,
  reflectorSetMode: reflectorModes.setMode,
  reflectorGetCurrentMode: reflectorModes.getCurrentMode,
  reflectorFormatResolvedConfig: reflectorModes.formatResolvedConfig,

  // Reflector Discord/Slack Notifications
  reflectorNotify: reflectorNotifications.notify,
  reflectorNotifyFromReport: reflectorNotifications.notifyFromReport,
  reflectorFormatDiscordEmbed: reflectorNotifications.formatDiscordEmbed,
  reflectorFormatSlackBlocks: reflectorNotifications.formatSlackBlocks,
  reflectorDetectPlatform: reflectorNotifications.detectPlatform,
  reflectorNotificationStats: reflectorNotifications.notificationStats,
  reflectorLoadNotificationHistory: reflectorNotifications.loadNotificationHistory,

  // Reflector Dashboard Integration
  reflectorGatherDashboardData: reflectorDashboard.gatherDashboardData,
  reflectorGenerateDashboardHTML: reflectorDashboard.generateDashboardHTML,
  reflectorCreateReflectorDashboard: reflectorDashboard.createReflectorDashboard,
  reflectorStartReflectorDashboard: reflectorDashboard.startReflectorDashboard,
  reflectorHandleApiRequest: reflectorDashboard.handleApiRequest,

  // Cloud Sync
  CloudSyncServer,
  createToken,
  verifyToken,

  // Remote Federation
  RemoteOracleClient,
  registerRemote,
  removeRemote,
  listRemotes,
  federatedRemoteSearch,
  checkRemoteHealth,

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
