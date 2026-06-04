/**
 * Remembrance Bridge — cathedral to oracle field.
 *
 * One module, single responsibility: speak to the Remembrance Field
 * over HTTP (JSON-RPC to the MCP server). Mirrors the discipline of
 * Void's field_contribute.py:
 *
 *   - stdlib + fetch only — no new deps
 *   - fire-and-forget — never blocks the caller
 *   - never throws — best-effort, returns null/zeroed values on failure
 *   - short timeout — degrades silently if oracle is unreachable
 *
 * Used by every valor-side integration point (lead-ledger contributions,
 * covenant-gate dual-oracle calls, agent-tier histogram readings, the
 * coherency-vitals endpoint, the Sun's background heartbeat). One place
 * to resolve the field endpoint; one place to handle the failure mode.
 *
 * Endpoint defaults to http://127.0.0.1:7787/mcp (overridable via
 * REMEMBRANCE_FIELD_URL env var). Auth via REMEMBRANCE_FIELD_TOKEN —
 * the bearer is ONLY sent over loopback or HTTPS, never cleartext.
 */

const DEFAULT_FIELD_URL = "http://127.0.0.1:7787/mcp";
const TIMEOUT_MS = 1500;

function fieldUrl(): string {
  return (process.env.REMEMBRANCE_FIELD_URL || DEFAULT_FIELD_URL).trim();
}

function authToken(): string {
  return (process.env.REMEMBRANCE_FIELD_TOKEN || "").trim();
}

function isLoopbackOrHttps(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    const host = u.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Low-level MCP call. Best-effort: returns the result body on success,
 * null on any failure (network, timeout, non-2xx, malformed JSON).
 * Never throws.
 */
async function mcpCall<T = unknown>(action: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const url = fieldUrl();
  if (!isLoopbackOrHttps(url) && !url.startsWith("http://")) return null;
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "field",
      arguments: { action, ...args },
    },
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = authToken();
  if (token && (url.startsWith("https://") || isLoopbackOrHttps(url))) {
    headers.Authorization = `Bearer ${token}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
      redirect: "manual",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { content?: Array<{ text?: string }> }; error?: unknown };
    if (json.error) return null;
    const content = json.result?.content?.[0]?.text;
    if (!content) return null;
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Field state read ─────────────────────────────────────────────────

export interface FieldState {
  coherence: number;
  coherenceIntegral: number;
  globalEntropy: number;
  cascadeFactor: number;
  updateCount: number;
  timestamp?: string;
  sources?: Record<string, { count: number; lastCoherence: number; lastTimestamp: string }>;
  distinctSources?: number;
}

export async function peekField(opts: { includeSources?: boolean } = {}): Promise<FieldState | null> {
  return mcpCall<FieldState>("state", { includeSources: opts.includeSources === true });
}

// ── Cost / benefit contributions ─────────────────────────────────────

export async function recordCost(units: number, source: string, kind = "work"): Promise<void> {
  await mcpCall("record-cost", { units, source, kind });
}

export async function recordBenefit(coherence: number, source: string, cost = 1): Promise<void> {
  await mcpCall("record-benefit", { coherence, source, cost });
}

// ── Dual-oracle validation ───────────────────────────────────────────

export interface ValidationResult {
  accepted: boolean;
  shapeClass: string;
  suspect: boolean;
  reason: string | null;
  inputStats: { mean: number; variance: number; n: number };
  baseline: { mean: number; variance: number; n: number };
  projected: { current: number; projected: number; delta: number } | null;
  committed: boolean;
  source: string;
}

export async function validateContribution(
  source: string,
  coherence: number | number[],
  opts: { commit?: boolean; cost?: number } = {},
): Promise<ValidationResult | null> {
  return mcpCall<ValidationResult>("validate", {
    source,
    coherence,
    cost: opts.cost ?? 1,
    commit: opts.commit === true,
  });
}

// ── Environmental sensors ────────────────────────────────────────────

export interface ConsensusHistogram {
  window: number;
  total: number;
  counts: { "both-accept": number; "both-reject": number; "A-yes-B-no": number; "A-no-B-yes": number };
  ratios: { "both-accept": number; "both-reject": number; "A-yes-B-no": number; "A-no-B-yes": number };
  recent: Array<{ agreement: string; source: string | null; ts: number }>;
}

export async function consensusHistogram(windowN?: number): Promise<ConsensusHistogram | null> {
  return mcpCall<ConsensusHistogram>("consensus-histogram", windowN !== undefined ? { windowN } : {});
}

export interface FieldDirection {
  verdict: string;
  coherenceDelta: number;
  entropyDelta: number;
  cascadeDelta: number;
  windowN: number;
}

export async function fieldDirection(windowN = 5): Promise<FieldDirection | null> {
  return mcpCall<FieldDirection>("direction", { windowN });
}

export interface PressureRelease {
  cascade: number;
  entropy: number;
  release: {
    released: true;
    fromCascade: number;
    toCascade: number;
    cascadeDrop: number;
    magnitude: number;
    ts: string;
  } | null;
  recentReleases: Array<{ fromCascade: number; toCascade: number; cascadeDrop: number; ts: string }>;
}

export async function pressureRelease(): Promise<PressureRelease | null> {
  return mcpCall<PressureRelease>("pressure-release", {});
}

// ── Reflexes (the actor side) ────────────────────────────────────────

export interface ReflexResult {
  triggered: boolean;
  reflex: string;
  action?: string;
  reason?: string;
}

export interface ReflexBundle {
  fired: ReflexResult[];
  skipped: ReflexResult[];
  all: ReflexResult[];
}

export async function fireReflexes(): Promise<ReflexBundle | null> {
  return mcpCall<ReflexBundle>("reflexes", {});
}

// ── Variance-gate mode (operator-adjustable) ─────────────────────────

export interface VarianceGateMode {
  mode: "default" | "tightened" | "relaxed";
  displacementThreshold: number;
}

/** Read the current variance-gate mode (default | tightened | relaxed). */
export async function getVarianceGateMode(): Promise<VarianceGateMode | null> {
  return mcpCall<VarianceGateMode>("gate-mode", {});
}

// ── Learned shape signatures (read-only introspection) ───────────────

export interface LearnedShapeSignature {
  mean: number;
  variance: number;
  n: number;
  source: string;
  learnedAt: string;
}

export async function learnedShapesByDomain(): Promise<Record<string, LearnedShapeSignature[]> | null> {
  const result = await mcpCall<{ domains: Record<string, LearnedShapeSignature[]> }>("learned-shapes", {});
  return result ? result.domains : null;
}

// ── Method-registry self-introspection ───────────────────────────────

export interface MethodDescriptor {
  name: string;
  module: string;
  fn: string;
  effect: string;
  triggers: string[];
  triggerMode: "all" | "any";
  reversibility: string;
  cost: string;
  sideEffects: string[];
  cooldownMs: number;
}

export async function listMethods(): Promise<MethodDescriptor[] | null> {
  const result = await mcpCall<{ methods: MethodDescriptor[] }>("methods", {});
  return result ? result.methods : null;
}

export interface ResponseSelection {
  state: {
    cascade: number | null;
    entropy: number | null;
    coherence: number | null;
    adversarialRatio: number | null;
    cognitionVariance: number | null;
    direction: string | null;
  };
  applicable: MethodDescriptor[];
  specific: MethodDescriptor[];
  universal: MethodDescriptor[];
}

export async function selectResponseFor(): Promise<ResponseSelection | null> {
  return mcpCall<ResponseSelection>("respond", {});
}

// ── Manual relax trigger ─────────────────────────────────────────────

export interface RelaxResult {
  triggered: boolean;
  relaxed?: boolean;
  reason?: string;
  discovered?: number;
  before?: { globalEntropy: number; cascadeFactor: number };
  after?: { globalEntropy: number; cascadeFactor: number; coherence: number };
}

export async function triggerRelax(): Promise<RelaxResult | null> {
  return mcpCall<RelaxResult>("relax", {});
}

// ── Manual temporal snapshot trigger ─────────────────────────────────

export interface TemporalSnapshot {
  recorded: boolean;
  reason?: string;
  meanAdjacent?: number;
  arc?: number;
  versions?: number;
  span?: { from: string; to: string };
  sources?: string[];
}

export async function recordTemporalSnapshot(
  repoDir: string,
  filePath: string,
  maxVersions = 12,
): Promise<TemporalSnapshot | null> {
  return mcpCall<TemporalSnapshot>("temporal-snapshot", { repoDir, filePath, maxVersions });
}

// ── Health probe ─────────────────────────────────────────────────────

/**
 * Cheap call to determine whether the oracle is reachable right now.
 * Used by the vitals endpoint to decide whether to include the
 * Remembrance section in its response.
 */
export async function isReachable(): Promise<boolean> {
  const state = await peekField();
  return state !== null && typeof state.coherence === "number";
}
