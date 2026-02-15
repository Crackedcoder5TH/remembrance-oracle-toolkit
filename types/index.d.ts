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
  success: boolean;
  accepted: boolean;
  entry?: Entry;
  validation?: ValidationResult;
  error?: string;
  reason?: string;
}

export interface RegisterResult {
  success: boolean;
  registered: boolean;
  pattern?: Pattern;
  validation: ValidationResult;
  error?: string;
  reason?: string;
  growth?: { candidates: number; synced: boolean };
}

export interface EvolveResult {
  success: boolean;
  evolved: boolean;
  pattern?: Pattern;
  error?: string;
}

export interface RetagResult {
  success: boolean;
  id?: string;
  name?: string;
  oldTags?: string[];
  newTags?: string[];
  added?: string[];
  updated?: boolean;
  error?: string;
}

export interface RetagAllResult {
  success: boolean;
  total: number;
  enriched: number;
  totalTagsAdded: number;
  dryRun: boolean;
  patterns: Array<{ id: string; name: string; added: string[]; total: number }>;
}

export interface FeedbackResult {
  success: boolean;
  newReliability?: number;
  healResult?: { healed: boolean; improvement: number; newCoherency: number } | null;
  error?: string;
}

export interface LifecycleStatus {
  running: boolean;
  counters?: Record<string, number>;
  cycleHistory?: Array<{ timestamp: string; results: unknown }>;
  reason?: string;
}

export interface WhisperSummary {
  text: string;
  events: unknown[];
  stats: Record<string, number>;
  hasActivity: boolean;
  durationMs: number;
}

export interface FullCycleResult {
  improvement?: unknown;
  optimization?: unknown;
  evolution?: unknown;
  whisperSummary?: WhisperSummary;
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
  | 'candidate_promoted'
  | 'auto_heal'
  | 'auto_grow'
  | 'auto_promote'
  | 'healing_start'
  | 'healing_progress'
  | 'healing_complete'
  | 'healing_failed'
  | 'rejection_captured'
  | 'deep_clean'
  | 'rollback'
  | 'security_veto'
  | 'debug_capture'
  | 'debug_feedback'
  | 'vote'
  | 'import_complete'
  | 'pattern_evolved';

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
  search(query: string, options?: { mode?: string; limit?: number; language?: string }): Pattern[];

  /** Smart search with intent parsing */
  smartSearch(query: string, options?: { limit?: number; language?: string }): { results: Pattern[]; intent: unknown };

  /** Parse search query intent */
  parseSearchIntent(query: string): { intent: string; language?: string; rewritten: string };

  /** Smart pull/evolve/generate decision */
  resolve(request: ResolveRequest): ResolveResult;

  /** Inspect a stored entry by ID */
  inspect(id: string): Entry | null;

  /** Report if pulled code worked */
  feedback(id: string, succeeded: boolean): FeedbackResult;

  /** Pattern library feedback */
  patternFeedback(id: string, succeeded: boolean): FeedbackResult;

  /** Get store summary statistics */
  stats(): Record<string, unknown>;

  /** Prune low-coherency entries */
  prune(minCoherency?: number): { removed: number };

  // Pattern Library
  patterns: PatternLibrary;
  patternStats(): { total: number; byLanguage: Record<string, number>; byType: Record<string, number> };
  retirePatterns(minScore?: number): { retired: number; remaining: number };
  deepClean(options?: { minCoherency?: number; removeDuplicates?: boolean; removeStubs?: boolean; dryRun?: boolean }): { removed: number; duplicates: number; stubs: number; tooShort: number; remaining: number };

  // Candidates
  candidates(filters?: { language?: string; method?: string }): Candidate[];
  candidateStats(): { total: number; byMethod: Record<string, number> };
  generateCandidates(options?: GenerateCandidatesOptions): Candidate[];
  promote(candidateId: string, testCode: string): Pattern;
  autoPromote(): { promoted: number; failed: number };
  smartAutoPromote(options?: { minCoherency?: number; minConfidence?: number; manualOverride?: boolean; dryRun?: boolean }): { promoted: number; skipped: number; vetoed: number; total: number; details: unknown[] };
  synthesizeTests(options?: SynthesizeOptions): { synthesis: unknown; promotion: unknown };

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
    author?: string;
  }): RegisterResult;

  evolvePattern(parentId: string, newCode: string, metadata?: Record<string, unknown>): EvolveResult;
  recycle(options?: { limit?: number }): { healed: number; failed: number };
  rollback(patternId: string, targetVersion?: number): { success: boolean; patternId: string; patternName: string; restoredVersion: number; previousVersion: number; restoredCode: string; reason?: string };
  verifyOrRollback(patternId: string): { passed: boolean; patternId?: string; patternName?: string; rolledBack?: boolean; restoredVersion?: number };
  healingStats(): HealingStats;

  // Auto-Tagging
  retag(id: string, options?: { dryRun?: boolean }): RetagResult;
  retagAll(options?: { dryRun?: boolean; minAdded?: number }): RetagAllResult;

  // Self-Evolution & Management
  selfEvolve(options?: Record<string, unknown>): unknown;
  selfImprove(options?: Record<string, unknown>): unknown;
  selfOptimize(options?: Record<string, unknown>): unknown;
  fullOptimizationCycle(options?: Record<string, unknown>): FullCycleResult;

  // Lifecycle
  getLifecycle(options?: Record<string, unknown>): unknown;
  startLifecycle(options?: Record<string, unknown>): unknown;
  stopLifecycle(): { stopped: boolean; reason?: string };
  lifecycleStatus(): LifecycleStatus;

  // Security
  securityScan(codeOrPatternId: string, options?: { language?: string; runExternalTools?: boolean }): SecurityScanResult;
  securityAudit(options?: { language?: string }): { scanned: number; clean: number; advisory: number; vetoed: number; details: unknown[] };

  // Voting
  vote(patternId: string, voter: string, vote: { score: number }): VoteResult;
  getVotes(patternId: string): { upvotes: number; downvotes: number; weightedScore: number } | null;
  topVoted(limit?: number): Pattern[];
  getVoterReputation(voterId: string): { voter: string; totalVotes: number; reputation: number; weight: number; recentVotes: unknown[] } | null;
  topVoters(limit?: number): Array<{ voter: string; totalVotes: number; reputation: number }>;

  // GitHub
  verifyGitHubToken(token: string): Promise<{ verified: boolean; username: string }>;
  startGitHubLogin(): Promise<{ userCode: string; verificationUri: string; deviceCode: string }>;
  pollGitHubLogin(deviceCode: string): Promise<{ verified: boolean; username: string }>;
  isVerifiedVoter(voterId: string): boolean;
  getVerifiedIdentity(voterId: string): unknown;
  listVerifiedIdentities(limit?: number): unknown[];

  // Sync & Federation
  sync(options?: SyncOptions): { synced?: number; error?: string };
  syncToGlobal(options?: SyncOptions): { synced?: number; error?: string };
  syncFromGlobal(options?: SyncOptions): { pulled?: number; error?: string };
  share(options?: ShareOptions): { shared: number; error?: string };
  pullCommunity(options?: Record<string, unknown>): { pulled: number; error?: string };
  federatedSearch(query: Record<string, unknown>): unknown;
  globalStats(): Record<string, unknown>;
  personalStats(): Record<string, unknown>;
  communityStats(): Record<string, unknown>;
  deduplicate(options?: { stores?: string[] }): { local: unknown; personal: unknown; community: unknown };

  // Remotes
  registerRemote(url: string, options?: Record<string, unknown>): unknown;
  removeRemote(urlOrName: string): unknown;
  listRemotes(): Array<{ name: string; url: string }>;
  remoteSearch(query: string, options?: Record<string, unknown>): Promise<{ results: Pattern[]; errors: unknown[] }>;
  checkRemoteHealth(): Promise<unknown>;
  fullFederatedSearch(query: string, options?: Record<string, unknown>): Promise<{ results: Pattern[]; localCount: number; repoCount: number; remoteCount: number; errors: unknown[] }>;

  // Repos
  discoverRepos(options?: Record<string, unknown>): unknown;
  registerRepo(repoPath: string): unknown;
  listRepos(): unknown[];
  crossRepoSearch(description: string, options?: Record<string, unknown>): { results: Pattern[] };

  // Debug Oracle
  debugCapture(params: { errorMessage: string; stackTrace?: string; fixCode: string; fixDescription?: string; language?: string; tags?: string[] }): { captured: boolean; pattern?: unknown; variants?: unknown; error?: string };
  debugSearch(params: { errorMessage: string; stackTrace?: string; language?: string; limit?: number; federated?: boolean }): unknown[];
  debugFeedback(id: string, resolved: boolean): { success: boolean; confidence?: number; error?: string };
  debugGrow(options?: { limit?: number }): { processed: number; error?: string };
  debugPatterns(filters?: Record<string, unknown>): unknown[];
  debugStats(): { totalPatterns: number; error?: string };
  debugShare(options?: Record<string, unknown>): { shared: number; error?: string };
  debugPullCommunity(options?: Record<string, unknown>): { pulled: number; error?: string };
  debugSyncPersonal(options?: Record<string, unknown>): { synced: number; error?: string };
  debugSeed(options?: Record<string, unknown>): { seeded: number; error?: string };
  debugGlobalStats(): Record<string, unknown>;

  // LLM / Claude Bridge
  isLLMAvailable(): boolean;
  llmTranspile(patternId: string, targetLanguage: string): { success: boolean; result?: unknown; method: string; error?: string };
  llmGenerateTests(patternId: string): { success: boolean; testCode?: string; method: string; error?: string };
  llmRefine(patternId: string): { success: boolean; refinedCode?: string; method: string; error?: string };
  llmAlternative(patternId: string): { success: boolean; alternative?: unknown; method: string; error?: string };
  llmDocs(patternId: string): { success: boolean; docs?: string; method: string; error?: string };
  llmAnalyze(code: string, language?: string): { success: boolean; analysis: unknown; method: string };
  llmExplain(patternId: string): { success: boolean; explanation?: string; method: string; error?: string };
  llmGenerate(options?: { languages?: string[]; maxPatterns?: number; methods?: string[]; autoPromote?: boolean }): { generated: number; stored: number; promoted: number; method: string; details: unknown[] };

  // Context
  generateContext(options?: { format?: 'markdown' | 'json' | 'text'; maxPatterns?: number; includeCode?: boolean }): { prompt: string; format: string; stats: Record<string, unknown> };
  exportContext(options?: { format?: 'markdown' | 'json' | 'text'; limit?: number }): string;

  // Import/Export
  export(options?: { format?: 'json' | 'markdown'; limit?: number; minCoherency?: number; language?: string; tags?: string[] }): string;
  import(data: string | Record<string, unknown>, options?: { skipValidation?: boolean; dryRun?: boolean; author?: string }): { imported: number; skipped: number; errors: string[]; results: unknown[] };

  // Diff
  diff(idA: string, idB: string): { a: unknown; b: unknown; diff: unknown[]; stats: { added: number; removed: number; same: number }; error?: string };

  // Events
  on(listener: OracleListener): () => void;

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
  pruneCandidates(minCoherency?: number): { removed: number; remaining: number };

  // Composition
  compose(spec: { name: string; components: string[]; code?: string; description?: string; tags?: string[] }): { composed: boolean; pattern?: Pattern; components?: Pattern[]; reason?: string };
  resolveDependencies(id: string): Pattern[];

  // Reliability
  setHealingRateProvider(fn: (patternId: string) => number): void;
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
