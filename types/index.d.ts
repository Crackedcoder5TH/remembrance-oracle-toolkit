/**
 * Remembrance Oracle Toolkit — TypeScript Type Definitions
 *
 * A code memory system that stores only proven code (passes validation + coherency),
 * scores everything 0-1, and serves the most relevant patterns to any AI or developer.
 */

// ─── Core Types ───

export interface CoherencyBreakdown {
  syntaxValid: number;
  completeness: number;
  consistency: number;
  testProof: number;
  historicalReliability: number;
}

export interface ASTAnalysis {
  boost: number;
  valid: boolean;
  functions: number;
  classes: number;
  complexity: number;
}

export interface CoherencyScore {
  total: number;
  breakdown: CoherencyBreakdown;
  astAnalysis: ASTAnalysis;
  language: string;
}

export interface CovenantViolation {
  principle: number;
  name: string;
  seal: string;
  reason: string;
}

export interface CovenantResult {
  sealed: boolean;
  violations: CovenantViolation[];
  principlesPassed: number;
  totalPrinciples: number;
}

export interface CovenantPrinciple {
  id: number;
  name: string;
  seal: string;
}

export interface ValidationResult {
  valid: boolean;
  testPassed: boolean | null;
  testOutput: string | null;
  coherencyScore: CoherencyScore | null;
  covenantResult: CovenantResult | null;
  errors: string[];
  sandboxed?: boolean;
}

export interface ValidationOptions {
  language?: string;
  testCode?: string;
  threshold?: number;
  skipCovenant?: boolean;
  timeout?: number;
  description?: string;
  tags?: string[];
  sandbox?: boolean;
}

export interface RelevanceBreakdown {
  textScore: number;
  tagOverlap: number;
  langMatch: number;
  coherency: number;
}

export interface RelevanceResult {
  relevance: number;
  breakdown: RelevanceBreakdown;
}

export interface RankOptions {
  limit?: number;
  minRelevance?: number;
  minCoherency?: number;
}

// ─── Entry & Pattern Types ───

export interface Entry {
  id: string;
  code: string;
  language: string;
  description: string;
  tags: string[];
  coherencyScore: CoherencyScore;
  testPassed: boolean | null;
  testOutput: string | null;
  reliability: {
    historicalScore: number;
    usageCount: number;
    successCount: number;
  };
  author: string;
  createdAt: string;
}

export interface Pattern {
  id: string;
  name: string;
  code: string;
  language: string;
  patternType: string;
  complexity: string;
  description: string;
  tags: string[];
  coherencyScore: CoherencyScore;
  testCode: string | null;
  testPassed: boolean | null;
  variants: unknown[];
  usageCount: number;
  successCount: number;
  upvotes: number;
  downvotes: number;
  weightedVoteScore: number;
  bugReports: number;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: string;
  name: string;
  code: string;
  language: string;
  parentId: string | null;
  method: string;
  coherencyScore: CoherencyScore;
  testCode: string | null;
  createdAt: string;
}

// ─── Oracle Types ───

export interface OracleOptions {
  baseDir?: string;
  threshold?: number;
  autoGrow?: boolean;
  autoSync?: boolean;
  autoSeed?: boolean;
}

export interface SubmitResult {
  accepted: boolean;
  entry?: Entry;
  validation: ValidationResult;
}

export interface ResolveRequest {
  description: string;
  language?: string;
  tags?: string[];
  limit?: number;
}

export interface ResolveResult {
  decision: 'PULL' | 'EVOLVE' | 'GENERATE';
  pattern?: Pattern;
  confidence: number;
  reasoning: string;
  alternatives: Pattern[];
}

export interface QueryOptions {
  description?: string;
  tags?: string[];
  language?: string;
  limit?: number;
  minCoherency?: number;
  mode?: 'relevance' | 'semantic' | 'hybrid';
}

export interface GenerateCandidatesOptions {
  limit?: number;
  methods?: string[];
}

export interface SynthesizeOptions {
  limit?: number;
  fixBroken?: boolean;
}

export interface SyncOptions {
  direction?: 'push' | 'pull' | 'both';
}

export interface ShareOptions {
  minCoherency?: number;
  requireTests?: boolean;
}

export interface VoteResult {
  success: boolean;
  patternId: string;
  voter: string;
  score: number;
}

export interface SecurityScanResult {
  passed: boolean;
  covenant: {
    sealed: boolean;
    violations: number;
    principlesPassed: number;
  };
  deepFindings: Array<{
    severity: string;
    reason: string;
    language: string;
  }>;
  externalTools: Array<{
    tool: string;
    severity: string;
    reason: string;
    ruleId?: string;
    testId?: string;
  }>;
  veto: boolean;
  whisper: string;
  totalFindings: number;
}

export interface HealingStats {
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

export type OracleEventType =
  | 'entry_added'
  | 'feedback'
  | 'pattern_registered'
  | 'candidate_generated'
  | 'candidate_promoted';

export type OracleListener = (event: { type: OracleEventType; data: unknown }) => void;

// ─── Main Oracle Class ───

export class RemembranceOracle {
  constructor(options?: OracleOptions);

  /** Submit code for validation and storage */
  submit(code: string, metadata?: {
    description?: string;
    tags?: string[];
    language?: string;
    testCode?: string;
    author?: string;
  }): SubmitResult;

  /** Query for relevant, proven code */
  query(query: string | QueryOptions): Entry[];

  /** Search patterns by text */
  search(query: string, options?: { mode?: string; limit?: number }): Pattern[];

  /** Smart pull/evolve/generate decision */
  resolve(request: ResolveRequest): ResolveResult;

  /** Inspect a stored entry by ID */
  inspect(id: string): Entry | null;

  /** Report if pulled code worked */
  feedback(id: string, succeeded: boolean): void;

  /** Pattern library feedback */
  patternFeedback(id: string, succeeded: boolean): void;

  // Pattern Library
  patterns: PatternLibrary;
  patternStats(): { total: number; byLanguage: Record<string, number>; byType: Record<string, number> };
  getAll(filters?: { language?: string; type?: string; minCoherency?: number }): Pattern[];
  deepClean(options?: { minCoherency?: number; removeDuplicates?: boolean }): { removed: number };

  // Candidates
  candidates(filters?: { language?: string; method?: string }): Candidate[];
  candidateStats(): { total: number; byMethod: Record<string, number> };
  generateCandidates(options?: GenerateCandidatesOptions): Candidate[];
  promote(candidateId: string, testCode: string): Pattern;
  autoPromote(): { promoted: number; failed: number };
  smartAutoPromote(options?: { maxAttempts?: number }): { promoted: number; failed: number };
  synthesizeTests(options?: SynthesizeOptions): { synthesized: number; promoted: number };

  // Quality & Evolution
  registerPattern(pattern: {
    name: string;
    code: string;
    testCode?: string;
    language?: string;
    description?: string;
    tags?: string[];
    patternType?: string;
    complexity?: string;
  }): { registered: boolean; pattern?: Pattern; validation: ValidationResult; growth?: unknown };

  evolvePattern(parentId: string, newCode: string, metadata?: Record<string, unknown>): Pattern;
  recycle(options?: { limit?: number }): { healed: number; failed: number };
  rollback(patternId: string, targetVersion: number): Pattern;
  verifyOrRollback(patternId: string): { verified: boolean; rolledBack: boolean };
  healingStats(): HealingStats;

  // Security
  securityScan(codeOrPatternId: string, options?: { language?: string; runExternalTools?: boolean }): SecurityScanResult;
  securityAudit(options?: { language?: string }): { total: number; passed: number; failed: number; findings: unknown[] };

  // Voting
  vote(patternId: string, voter: string, vote: { score: number }): VoteResult;
  getVotes(patternId: string): { upvotes: number; downvotes: number; weightedScore: number };
  topVoted(limit?: number): Pattern[];
  getVoterReputation(voterId: string): { voter: string; totalVotes: number; reputation: number };
  topVoters(limit?: number): Array<{ voter: string; totalVotes: number; reputation: number }>;

  // GitHub
  verifyGitHubToken(token: string): Promise<{ verified: boolean; username: string }>;
  startGitHubLogin(): Promise<{ userCode: string; verificationUri: string; deviceCode: string }>;
  pollGitHubLogin(deviceCode: string): Promise<{ verified: boolean; username: string }>;
  isVerifiedVoter(voterId: string): boolean;

  // Sync
  sync(options?: SyncOptions): { synced: number };
  syncToGlobal(options?: SyncOptions): { pushed: number };
  syncFromGlobal(options?: SyncOptions): { pulled: number };
  share(options?: ShareOptions): { shared: number };

  // Context
  generateContext(options?: { limit?: number; language?: string }): string;
  exportContext(options?: { format?: 'markdown' | 'json' | 'text'; limit?: number }): string;

  // Events
  on(listener: OracleListener): void;

  // Store access
  store: VerifiedHistoryStore;
}

// ─── Pattern Library ───

export class PatternLibrary {
  constructor(storeDir: string);

  backend: 'sqlite' | 'json';

  register(pattern: Record<string, unknown>): Pattern;
  decide(request: ResolveRequest): ResolveResult;
  recordUsage(id: string, succeeded: boolean): Pattern;
  reportBug(id: string, description: string): { success: boolean; patternId: string; bugReports: number };
  getReliability(id: string): {
    usageCount: number;
    successCount: number;
    successRate: number;
    bugReports: number;
    reliabilityScore: number;
  };
  evolve(parentId: string, newCode: string, metadata?: Record<string, unknown>): Pattern;
  retire(minScore?: number): Pattern[];
  getAll(filters?: Record<string, unknown>): Pattern[];
  update(id: string, updates: Record<string, unknown>): Pattern;
  summary(): {
    total: number;
    byLanguage: Record<string, number>;
    byType: Record<string, number>;
    avgCoherency: number;
  };

  // Candidates
  addCandidate(candidate: Record<string, unknown>): Candidate;
  getCandidates(filters?: Record<string, unknown>): Candidate[];
  candidateSummary(): { total: number; byMethod: Record<string, number> };
  promoteCandidate(id: string): Pattern;
}

// ─── Storage ───

export class VerifiedHistoryStore {
  constructor(baseDir: string);
  add(entry: Record<string, unknown>): Entry;
  getAll(): Entry[];
  get(id: string): Entry | null;
  update(id: string, updates: Record<string, unknown>): Entry;
  remove(id: string): boolean;
  getSQLiteStore(): SQLiteStore;
}

export class SQLiteStore {
  constructor(dbPath: string);
  run(sql: string, params?: unknown[]): void;
  get(sql: string, params?: unknown[]): unknown;
  all(sql: string, params?: unknown[]): unknown[];
}

// ─── Scoring & Validation Functions ───

export function computeCoherencyScore(code: string, metadata?: {
  language?: string;
  testPassed?: boolean;
}): CoherencyScore;

export function detectLanguage(code: string): string;

export function validateCode(code: string, options?: ValidationOptions): ValidationResult;

export function rankEntries(query: string, entries: Entry[], options?: RankOptions): Entry[];

export function computeRelevance(query: string, entry: Entry): RelevanceResult;

export function covenantCheck(code: string, metadata?: {
  description?: string;
  tags?: string[];
  language?: string;
}): CovenantResult;

export function getCovenant(): CovenantPrinciple[];

export function formatCovenantResult(result: CovenantResult): string;

export function deepSecurityScan(code: string, options?: {
  language?: string;
  runExternalTools?: boolean;
}): SecurityScanResult;

export function safeJsonParse<T = unknown>(str: string, fallback?: T): T;

// ─── Sandbox Execution ───

export function sandboxExecute(code: string, testCode: string, language?: string, options?: {
  timeout?: number;
}): { passed: boolean | null; output: string; sandboxed: boolean };

export function sandboxGo(code: string, testCode: string, options?: {
  timeout?: number;
}): { passed: boolean | null; output: string };

export function sandboxRust(code: string, testCode: string, options?: {
  timeout?: number;
}): { passed: boolean | null; output: string };

// ─── Search & Embeddings ───

export function semanticSearch(query: string, entries: Entry[]): Entry[];
export function semanticSimilarity(a: string, b: string): number;
export function expandQuery(query: string): string[];
export function identifyConcepts(text: string): string[];

export function vectorSimilarity(a: number[], b: number[]): number;
export function embedDocument(text: string): number[];
export function nearestTerms(text: string, k?: number): Array<{ term: string; score: number }>;

export function parseIntent(query: string): { intent: string; language?: string; rewritten: string };
export function rewriteQuery(query: string): string;
export function editDistance(a: string, b: string): number;
export function smartSearch(query: string, entries: Entry[]): Entry[];

// ─── Reflection ───

export interface ReflectionResult {
  original: string;
  healed: string;
  loops: number;
  finalScore: CoherencyScore;
  history: Array<{ loop: number; score: number; strategy: string }>;
  improved: boolean;
}

export function reflectionLoop(code: string, options?: {
  loops?: number;
  target?: number;
  language?: string;
}): ReflectionResult;

export function formatReflectionResult(result: ReflectionResult): string;
export function observeCoherence(code: string): number;
export function reflectionScore(code: string): number;
export function generateCandidates(options?: GenerateCandidatesOptions): Candidate[];

export const STRATEGIES: string[];
export const DIMENSION_WEIGHTS: Record<string, number>;

// ─── AST & Transpilation ───

export interface ASTNode {
  type: string;
  name?: string;
  children?: ASTNode[];
}

export function parseCode(code: string): ASTNode;
export function astCoherencyBoost(code: string): number;

export function astTranspile(code: string, options?: {
  from?: string;
  to?: string;
}): { code: string; language: string };

export function parseJS(code: string): unknown;
export function astTokenize(code: string): string[];
export function toSnakeCase(str: string): string;

// ─── Versioning ───

export class VersionManager {
  constructor(store: SQLiteStore);
  snapshot(patternId: string): number;
  history(patternId: string): Array<{ version: number; code: string; timestamp: string }>;
  restore(patternId: string, version: number): Pattern;
  diff(patternId: string, v1: number, v2: number): unknown;
}

export function semanticDiff(codeA: string, codeB: string): {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
};

export function extractFunctions(code: string): Array<{ name: string; code: string }>;

// ─── Debug Oracle ───

export class DebugOracle {
  constructor(store: SQLiteStore);

  capture(error: string, fix: string, metadata?: Record<string, unknown>): { id: string };
  search(error: string, options?: { limit?: number }): Array<{
    id: string;
    error: string;
    fix: string;
    confidence: number;
    category: string;
  }>;
  feedback(id: string, succeeded: boolean): void;
  grow(options?: { limit?: number }): { grown: number };
  stats(): { total: number; byCategory: Record<string, number> };
  shareDebugPatterns(): { shared: number };
  pullDebugPatterns(): { pulled: number };
  federatedDebugSearch(error: string): unknown[];
}

export function debugFingerprint(error: string): string;
export function normalizeError(error: string): string;
export function classifyError(error: string): string;
export function computeConfidence(successRate: number, count: number): number;

export const ERROR_CATEGORIES: string[];

// ─── Auth ───

export class AuthManager {
  constructor(store: SQLiteStore);
  createToken(userId: string, role?: string): string;
  validateToken(token: string): { valid: boolean; userId: string; role: string } | null;
  createApiKey(userId: string): string;
  validateApiKey(key: string): { valid: boolean; userId: string } | null;
  addUser(userId: string, role?: string): void;
  removeUser(userId: string): void;
  listUsers(): Array<{ userId: string; role: string }>;
}

export function authMiddleware(authManager: AuthManager): (req: unknown, res: unknown, next: () => void) => void;

export const ROLES: { admin: string; contributor: string; viewer: string };
export function canWrite(role: string): boolean;
export function canManageUsers(role: string): boolean;
export function canRead(role: string): boolean;

export class TeamManager {
  constructor(store: SQLiteStore);
}

export const TEAM_ROLES: Record<string, string>;
export const TEAM_ROLE_HIERARCHY: string[];

// ─── MCP Server ───

export class MCPServer {
  constructor(oracle: RemembranceOracle, options?: Record<string, unknown>);
  start(): void;
  stop(): void;
}

export function startMCPServer(oracle?: RemembranceOracle): MCPServer;

// ─── Dashboard ───

export function createDashboardServer(oracle?: RemembranceOracle, options?: {
  port?: number;
  auth?: boolean;
  rateLimit?: boolean;
  authManager?: AuthManager;
  rateLimitOptions?: { windowMs?: number; maxRequests?: number };
}): import('http').Server;

export function startDashboard(oracle?: RemembranceOracle, options?: {
  port?: number;
}): import('http').Server;

export function createRateLimiter(options?: {
  windowMs?: number;
  maxRequests?: number;
}): (req: unknown, res: unknown, next: () => void) => void;

// ─── WebSocket ───

export class WebSocketServer {
  constructor(server: import('http').Server);
  broadcast(data: unknown): void;
  close(): void;
}

// ─── IDE Integration ───

export class IDEBridge {
  constructor(oracle: RemembranceOracle);
}

export const IDE_SEVERITY: Record<string, string>;

// ─── Cloud & Federation ───

export class CloudSyncServer {
  constructor(options?: Record<string, unknown>);
  start(port?: number): void;
  stop(): void;
}

export function createToken(payload: Record<string, unknown>): string;
export function verifyToken(token: string): Record<string, unknown> | null;

export class RemoteOracleClient {
  constructor(url: string, options?: Record<string, unknown>);
  search(query: string): Promise<Pattern[]>;
  health(): Promise<{ status: string }>;
}

export function registerRemote(name: string, url: string): void;
export function removeRemote(name: string): void;
export function listRemotes(): Array<{ name: string; url: string }>;
export function federatedRemoteSearch(query: string): Promise<Pattern[]>;
export function checkRemoteHealth(name: string): Promise<{ status: string }>;

// ─── CI & Feedback ───

export class CIFeedbackReporter {
  constructor(options?: Record<string, unknown>);
  report(id: string, succeeded: boolean): void;
}

export function wrapWithTracking(oracle: RemembranceOracle): RemembranceOracle;

export function discoverPatterns(dir: string): Pattern[];
export function autoSeed(dir: string): { seeded: number };

export function harvest(source: string, options?: Record<string, unknown>): Pattern[];
export function harvestFunctions(code: string): Array<{ name: string; code: string }>;
export function splitFunctions(code: string): Array<{ name: string; code: string }>;

export function installHooks(dir?: string): void;
export function uninstallHooks(dir?: string): void;
export function runPreCommitCheck(files: string[]): { passed: boolean; violations: string[] };

// ─── LLM Generation ───

export class LLMClient {
  constructor(options?: Record<string, unknown>);
}

export class LLMGenerator {
  constructor(client: LLMClient, oracle: RemembranceOracle);
}

export class ClaudeBridge {
  constructor(options?: Record<string, unknown>);
}

export function findClaudeCLI(): string | null;
export function extractLLMCode(response: string): string;

// ─── AI Connectors ───

export class AIConnector {
  constructor(oracle: RemembranceOracle);
}

export const OPENAI_TOOLS: unknown[];
export const ANTHROPIC_TOOLS: unknown[];
export const GEMINI_TOOLS: unknown[];
export const MCP_TOOLS: unknown[];

export function fromOpenAI(toolCall: unknown): unknown;
export function toOpenAI(result: unknown): unknown;
export function fromAnthropic(toolCall: unknown): unknown;
export function toAnthropic(result: unknown): unknown;
export function fromGemini(toolCall: unknown): unknown;
export function toGemini(result: unknown): unknown;
export function fromMCP(toolCall: unknown): unknown;
export function toMCP(result: unknown): unknown;

// ─── GitHub Bridge ───

export function parseIssueCommand(body: string): { command: string; args: Record<string, string> } | null;
export function formatAsComment(result: unknown): string;

// ─── Multi-File Patterns ───

export class ModulePattern {
  constructor(config: Record<string, unknown>);
}

export class DependencyGraph {
  constructor();
  addNode(id: string, deps?: string[]): void;
  topologicalSort(): string[];
}

export class TemplateEngine {
  constructor();
  render(template: string, context: Record<string, unknown>): string;
}

export class ModuleStore {
  constructor(storeDir: string);
}

export function scaffold(template: string, context: Record<string, unknown>): Record<string, string>;
export function compose(components: unknown[]): string;

// ─── Pattern Composition ───

export class PatternComposer {
  constructor(library: PatternLibrary);
  compose(template: string, bindings: Record<string, string>): string;
  templates(): string[];
}

export const BUILT_IN_TEMPLATES: string[];

// ─── Constants ───

export const THRESHOLDS: {
  pull: number;
  evolve: number;
  generate: number;
  retire: number;
};

export const COVENANT_PRINCIPLES: CovenantPrinciple[];
export const INTENT_PATTERNS: Record<string, unknown>;
export const CORRECTIONS: Record<string, string>;
export const LANGUAGE_ALIASES: Record<string, string>;
export const LANGUAGE_FAMILIES: Record<string, string[]>;

// ─── Plugin System ───

export interface PluginContext {
  oracle: RemembranceOracle;
  patterns: PatternLibrary;
  hooks: PluginHooks;
  logger: PluginLogger;
}

export interface PluginHooks {
  onBeforeSubmit: (handler: (code: string, metadata: Record<string, unknown>) => { code: string; metadata: Record<string, unknown> } | void) => void;
  onAfterSubmit: (handler: (result: SubmitResult) => void) => void;
  onBeforeValidate: (handler: (code: string, options: ValidationOptions) => { code: string; options: ValidationOptions } | void) => void;
  onAfterValidate: (handler: (result: ValidationResult) => void) => void;
  onPatternRegistered: (handler: (pattern: Pattern) => void) => void;
  onCandidateGenerated: (handler: (candidate: Candidate) => void) => void;
  onSearch: (handler: (query: string, results: Pattern[]) => Pattern[]) => void;
  onResolve: (handler: (request: ResolveRequest, result: ResolveResult) => ResolveResult) => void;
}

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  hooks?: string[];
}

export class PluginManager {
  constructor(oracle: RemembranceOracle, options?: { pluginDir?: string });
  load(nameOrPath: string): PluginManifest;
  unload(name: string): void;
  list(): PluginManifest[];
  enable(name: string): void;
  disable(name: string): void;
}

// ─── Health & Metrics ───

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: string; latencyMs: number };
    patterns: { status: string; count: number };
    coherency: { status: string; avgScore: number };
  };
}

export interface MetricsSnapshot {
  patterns: {
    total: number;
    byLanguage: Record<string, number>;
    byType: Record<string, number>;
    avgCoherency: number;
    coherencyDistribution: Record<string, number>;
  };
  usage: {
    totalQueries: number;
    totalSubmissions: number;
    totalFeedback: number;
    pullRate: number;
  };
  candidates: {
    total: number;
    byMethod: Record<string, number>;
    promotionRate: number;
  };
  uptime: number;
  timestamp: string;
}
