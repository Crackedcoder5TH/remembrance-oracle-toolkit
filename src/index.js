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
const { semanticSearch, semanticSimilarity, expandQuery, identifyConcepts } = require('./core/embeddings');
const { CIFeedbackReporter, wrapWithTracking } = require('./ci/feedback');
const { vectorSimilarity, embedDocument, nearestTerms } = require('./core/vectors');
const { MCPServer, startMCPServer } = require('./mcp/server');
const { createDashboardServer, startDashboard, createRateLimiter } = require('./dashboard/server');
const { WebSocketServer } = require('./core/websocket');
const { VersionManager, semanticDiff, extractFunctions } = require('./core/versioning');
const { AuthManager, authMiddleware, ROLES, canWrite, canManageUsers, canRead } = require('./auth/auth');
const { generateAnalytics, computeTagCloud } = require('./core/analytics');
const { discoverPatterns, autoSeed } = require('./ci/auto-seed');
const { harvest, harvestFunctions, splitFunctions } = require('./ci/harvest');
const { installHooks, uninstallHooks, runPreCommitCheck } = require('./ci/hooks');
const { covenantCheck, getCovenant, formatCovenantResult, COVENANT_PRINCIPLES } = require('./core/covenant');
const { reflectionLoop, formatReflectionResult, observeCoherence, serfScore, generateCandidates, STRATEGIES, DIMENSION_WEIGHTS } = require('./core/reflection');
const { DebugOracle, fingerprint: debugFingerprint, normalizeError, classifyError, computeConfidence, ERROR_CATEGORIES } = require('./core/debug-oracle');
const { IDEBridge, SEVERITY: IDE_SEVERITY } = require('./ide/bridge');
const { parseIntent, rewriteQuery, editDistance, applyIntentRanking, expandLanguages, smartSearch, INTENT_PATTERNS, CORRECTIONS, LANGUAGE_ALIASES, LANGUAGE_FAMILIES } = require('./core/search-intelligence');
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

  // Reflection / SERF
  reflectionLoop,
  formatReflectionResult,
  observeCoherence,
  serfScore,
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
  expandLanguages,
  smartSearch,
  INTENT_PATTERNS,
  CORRECTIONS,
  LANGUAGE_ALIASES,
  LANGUAGE_FAMILIES,

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
};
