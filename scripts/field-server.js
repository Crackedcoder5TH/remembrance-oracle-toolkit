#!/usr/bin/env node
'use strict';

/**
 * Remembrance Field — hostable server for any caller (MCP, REST, browser, human).
 *
 * Starts ONLY the Living Remembrance Engine field surface — no full-oracle
 * bootstrap, no autoSync — so it's reliable to host (Railway / Fly / a VPS).
 * Binds 0.0.0.0:$PORT, persists to $ENTROPY_PATH (point at a volume), optional
 * bearer auth via $FIELD_TOKEN.
 *
 * Faces:
 *   1. MCP (Streamable HTTP, JSON-RPC 2.0) at POST /mcp: `initialize`,
 *      `tools/list`, `tools/call` for field_contribute · field_read · coherency.
 *      Register the URL in Claude Desktop / Cursor / the API MCP connector.
 *   2. Plain REST (for agents/humans that don't speak MCP):
 *        GET  /field           -> field state
 *        POST /coherency       {a,b} -> {coherency}
 *        POST /contribute      {coherence,source,cost} -> field state  (write)
 *   3. GET /  — health/peek JSON.  GET /.well-known/mcp — discovery manifest.
 *   4. Legacy webhook: tools/call name "field" + {action:"contribute"}.
 *
 * Auth model: reads (field_read/coherency/GET) are OPEN; writes
 * (field_contribute / POST /contribute) require Bearer $FIELD_TOKEN when one is
 * set. CORS is enabled so browsers and web agents can call it directly.
 * Per-IP rate limit via $RATE_LIMIT_PER_MIN (default 120; 0 disables).
 */

const http = require('node:http');
const { contribute, peekField } = require('../src/core/field-coupling');
const { codeToWaveform, waveformCosine } = require('../src/core/code-to-waveform');
const { scoreResonance, libraryStatus } = require('../src/scoring/pattern-resonance');
const { covenantCheck } = require('../src/core/covenant');
const { securityScan } = require('../src/reflector/scoring-analysis-security');
const { verifyExecution } = require('../src/scoring/exec-verify');
const { recordOperation } = require('../src/scoring/operational-signal');
const { evaluate: evaluateInput } = require('../src/scoring/evaluate');

// ── CLI argument parsing ─────────────────────────────────────────────
// Recommendation #3 — lower activation energy. Anyone can now run
//   npx remembrance-field-server --port 7787 --token <secret>
// and have a working field server in 30 seconds, no clone required.
// Flags override env vars; env vars stay supported for deploy configs
// (Vercel, Railway, Fly, systemd) where flags are awkward.
function parseCliArgs(argv) {
  const args = { help: false, version: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--help': case '-h':       args.help = true; break;
      case '--version': case '-v':    args.version = true; break;
      case '--port': case '-p':       args.port = parseInt(next(), 10); break;
      case '--host': case '-H':       args.host = next(); break;
      case '--token': case '-t':      args.token = next(); break;
      case '--entropy-path': case '-e': args.entropyPath = next(); break;
      case '--rate-limit': case '-r':  args.rateLimit = parseInt(next(), 10); break;
      default:
        if (a.startsWith('--')) {
          console.error(`field-server: unknown flag ${a}. Try --help.`);
          process.exit(2);
        }
    }
  }
  return args;
}

const CLI = parseCliArgs(process.argv);

if (CLI.help) {
  console.log(`remembrance-field-server — hostable Remembrance Field

Starts the Living Remembrance Engine field surface as an HTTP/MCP/REST
server. Persists to .remembrance/entropy.json (or --entropy-path) and
exposes the field to any agent, MCP client, or browser.

Usage:
  npx remembrance-field-server [options]

Options:
  -p, --port <n>            TCP port (default 7787, or $PORT)
  -H, --host <addr>         Bind address (default 0.0.0.0, or $HOST)
  -t, --token <secret>      Bearer token required for writes (default $FIELD_TOKEN)
  -e, --entropy-path <p>    Persistence file (default .remembrance/entropy.json, or $ENTROPY_PATH)
  -r, --rate-limit <n>      Requests per minute per IP (default 120, 0 = off)
  -v, --version             Print version and exit
  -h, --help                Show this message

Endpoints (once running):
  POST /mcp                 JSON-RPC 2.0 MCP surface (Claude Desktop, Cursor)
  POST /contribute          REST write: {coherence, source, cost}
  POST /coherency           REST: {a, b} -> {coherency}
  GET  /field               REST read: full field state
  GET  /                    Health peek
  GET  /.well-known/mcp     MCP discovery manifest

Auth: reads are open; writes require the bearer token when one is set.
CORS is enabled so browsers and web agents can call this directly.

Examples:
  npx remembrance-field-server
  npx remembrance-field-server --port 8080 --token \$(openssl rand -hex 16)
  PORT=7787 FIELD_TOKEN=secret npx remembrance-field-server`);
  process.exit(0);
}

if (CLI.version) {
  try {
    const pkg = require('../package.json');
    console.log(pkg.version);
  } catch { console.log('unknown'); }
  process.exit(0);
}

// Apply CLI overrides to env so the downstream code keeps reading process.env.
if (CLI.port != null && Number.isFinite(CLI.port)) process.env.PORT = String(CLI.port);
if (CLI.host) process.env.HOST = CLI.host;
if (CLI.token) process.env.FIELD_TOKEN = CLI.token;
if (CLI.entropyPath) process.env.ENTROPY_PATH = CLI.entropyPath;
if (CLI.rateLimit != null && Number.isFinite(CLI.rateLimit)) process.env.RATE_LIMIT_PER_MIN = String(CLI.rateLimit);

const PORT = parseInt(process.env.PORT, 10) || 7787;
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = (process.env.FIELD_TOKEN || process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();
const DEFAULT_PROTOCOL = '2025-06-18';
const RATE_LIMIT_PER_MIN = (() => { const n = parseInt(process.env.RATE_LIMIT_PER_MIN, 10); return Number.isFinite(n) ? n : 120; })();

const TOOLS = [
  {
    name: 'field_contribute',
    description: 'Contribute one coherence observation (0..1) to the shared Remembrance field.',
    inputSchema: {
      type: 'object',
      properties: {
        coherence: { type: 'number', description: 'alignment reading in [0,1]' },
        source: { type: 'string', description: 'source label, e.g. "my-app:event"' },
        cost: { type: 'number', description: 'work units', default: 1 },
      },
      required: ['coherence', 'source'],
    },
  },
  {
    name: 'field_read',
    description: 'Read the current Remembrance field state (coherence, integral, cascade, per-source histogram).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'coherency',
    description: 'Cosine coherency in [0,1] between two texts — "do these mean the same thing?". Offline, no field write.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      required: ['a', 'b'],
    },
  },
  {
    name: 'pattern_resonance',
    description: 'Lexical TF-IDF resonance of code against the proven pattern library. High = code reuses real proven vocabulary; low = code reaches for invented identifiers (a hallucination tell). Offline, no field write.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'code to score' },
        language: { type: 'string', description: 'optional language filter' },
        k: { type: 'number', description: 'top-K patterns to average (default 5, max 20)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'evaluate',
    description: 'Observation-driven anti-hallucination dispatcher. Looks at the input first (structurality, atomic signature, language hint), looks at the current field state, then decides which signals to run: safety_check always on non-trivial input, pattern_resonance only on code-shaped input, exec_verify only if requested AND code-shaped AND a supported language AND safety sealed. Returns observation, tools run, results, and a composed verdict. Contributes the verdict back to the field (the "vice versa" loop). exec_verify execution requires the bearer token; everything else is open.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'the text or code to evaluate' },
        language: { type: 'string', description: 'optional language hint (improves resonance + enables exec_verify routing)' },
        execute: { type: 'boolean', description: 'if true AND code-shaped AND supported language AND safety sealed, run exec_verify' },
        testCode: { type: 'string', description: 'optional test code when execute=true' },
        timeoutMs: { type: 'number', description: 'exec_verify timeout, clamped 500..30000' },
        description: { type: 'string', description: 'optional description, improves safety scoring' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['input'],
    },
  },
  {
    name: 'exec_verify',
    description: 'Run code in a sandboxed temp dir with a hard timeout and report whether it executes correctly. Harm-screened first via covenant-harm patterns (never runs anything that trips it). Status: pass (test ran, exit 0), smoke-pass (no test, ran clean), fail, timeout, blocked, skipped. JS and Python supported. Compose safety_check BEFORE this for full anti-hallucination coverage. Token-gated (writes nothing, but executes untrusted code).',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'code to execute' },
        language: { type: 'string', description: 'javascript|js|python|py (others abstain)' },
        testCode: { type: 'string', description: 'optional test that references the code\'s symbols' },
        timeoutMs: { type: 'number', description: 'hard timeout, clamped 500..30000 (default 5000)' },
      },
      required: ['code', 'language'],
    },
  },
  {
    name: 'safety_check',
    description: 'Combined safety scan: covenant principles (15 ethical/integrity rules) + security pattern scanner (eval, shell injection, hardcoded secrets, SQL injection, prototype pollution, etc.). Returns sealed:true only if BOTH layers pass. Offline, no field write.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'code to check' },
        language: { type: 'string', description: 'optional language hint (improves security pattern matching)' },
        description: { type: 'string', description: 'optional pattern description (improves accuracy)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'optional tags' },
      },
      required: ['code'],
    },
  },
  {
    name: 'goggles',
    description: 'The goggles dual-vision read of code: FOCUS (intrinsic structural coherence + verdict) AND META (pattern resonance against the substrate + verdict + nearest cross-repo neighbours), plus the meta-debug audit (high-severity findings with fix suggestions) — everything the goggles produce, in one call. Offline read, no field write.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'code to read' },
        language: { type: 'string', description: 'optional language hint (default javascript)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'audit',
    description: 'Meta-debug: run the AST audit checkers and return HIGH-severity findings (security/type/concurrency/edge-case) as { bugClass, line, reality, suggestion } — the defect axis coherence and resonance cannot see. Offline read, no field write.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'code to audit' },
        language: { type: 'string', description: 'optional language hint' },
      },
      required: ['code'],
    },
  },
  {
    name: 'goggles_params',
    description: "The goggles' consolidated tuning numbers, read from the Living Remembrance Engine (the single source of truth) so a consumer mirrors the same thresholds. Offline read, no field write.",
    inputSchema: { type: 'object', properties: {} },
  },
];

// Delegates to the canonical waveformCosine (gated fractal coherency).
// Direct plain-cosine over the fractal vector would bypass the
// structurality gate that is the whole point of the new encoder.
const cosine = waveformCosine;

// Is this tool call a WRITE (mutates the field)? Writes are token-gated.
// Two distinct checks:
//   isContributeTool — dispatch within callTool to the contribute action
//   isPrivilegedTool — gate access at the HTTP boundary (token required)
//
// Privileged is the broader set: contribute (mutates the field) PLUS
// exec_verify (doesn't mutate field but DOES run untrusted code with real
// resource cost and harm-screen-escape risk). Same threat surface, same
// gating.
function isContributeTool(name, action) {
  if (name === 'field_contribute') return true;
  if (name === 'field' && (action || 'contribute') === 'contribute') return true;
  return false;
}
function isPrivilegedTool(name, action) {
  // evaluate is open at the tool level — it gates exec_verify internally
  // based on opts.execute and only the execution path requires privilege.
  // For the HTTP boundary we check that here too: if evaluate carries
  // execute:true, treat it as privileged.
  if (isContributeTool(name, action)) return true;
  if (name === 'exec_verify') return true;
  return false;
}
function isPrivilegedEvaluate(args) {
  return args && args.execute === true;
}

// ─── goggles surface: the dual-vision read (FOCUS coherence + META resonance)
// plus the meta-debug audit, so the interface can read everything the goggles
// produce over the wire. Lazy-loaded — a missing module degrades the tool, never
// the server boot. All reads, open like the other non-mutating tools. ───
function _ft() { try { return require('../src/core/field-tool'); } catch (_) { return null; } }
function _auditMod() {
  try { return require('../src/audit/ast-checkers'); }
  catch (_) { try { return require('../src/audit/static-checkers'); } catch (_) { return null; } }
}
function gogglesCfg() {
  try { return require('../src/core/living-remembrance').gogglesParams() || {}; } catch (_) { return {}; }
}
function auditFindings(code, language) {
  const a = _auditMod();
  if (!a || typeof a.auditCode !== 'function') return [];
  try { return (a.auditCode(code, { minSeverity: 'high', language }) || {}).findings || []; }
  catch (_) { return []; }
}
function gogglesRead(code, language) {
  const cfg = gogglesCfg();
  const ft = _ft();
  let coherence = null; let resonance = null; let nearest = []; let lexical = [];
  if (ft && typeof ft.read === 'function') {
    try {
      const r = ft.read(
        { content: code, name: 'goggles', language: language || 'javascript' },
        { source: 'field-server:goggles', growSubstrate: false, topK: 7 },
      );
      coherence = (typeof r.coherence === 'number') ? r.coherence : null;
      const vr = r.voidResonance || {};
      resonance = (typeof vr.meanTopK === 'number') ? vr.meanTopK : null;
      nearest = (vr.topMatches || []).slice(0, 5).map((x) => ({ name: x.name, score: x.d4 ?? x.similarity ?? 0 }));
      const lf = cfg.lexFloor ?? 0.20;
      lexical = ((r.codeResonance && r.codeResonance.topMatches) || [])
        .filter((x) => (x.similarity ?? 0) >= lf).slice(0, 3)
        .map((x) => ({ name: x.name, score: x.similarity ?? 0 }));
    } catch (_) { /* degrade to nulls */ }
  }
  const band = (v, hi, mid, lo, labels) => (v == null ? null
    : v >= hi ? labels[0] : v >= mid ? labels[1] : v >= lo ? labels[2] : labels[3]);
  return {
    // FOCUS — what you're working at (intrinsic structure, not correctness)
    focus: {
      coherence,
      structure: band(coherence, cfg.structureStrong ?? 0.93, cfg.structureSolid ?? 0.80, cfg.structureLoose ?? 0.70, ['strong', 'solid', 'loose', 'weak']),
    },
    // META — where it sits in the whole codebase (pattern resonance)
    meta: {
      resonance,
      verdict: band(resonance, cfg.resonanceConsonant ?? 0.90, cfg.resonanceFamiliar ?? 0.82, cfg.resonanceDistinct ?? 0.70, ['CONSONANT', 'FAMILIAR', 'DISTINCT', 'OUTLIER']),
      nearest,
      lexical,
    },
    // meta-debug — the defect axis the other two can't see
    findings: auditFindings(code, language),
  };
}

// Dispatch a tool call. Accepts the new tool names AND the legacy "field"
// tool (with an `action` argument) so existing webhook producers keep working.
function callTool(name, args = {}) {
  const action = args.action;
  if (isContributeTool(name, action)) {
    const coherence = Number(args.coherence);
    const source = typeof args.source === 'string' ? args.source.trim() : '';
    if (!Number.isFinite(coherence) || !source) throw new Error('coherence (number) and source (non-empty string) are required');
    contribute({ cost: Number(args.cost) || 1, coherence: Math.max(0, Math.min(1, coherence)), source });
    return peekField();
  }
  if (name === 'field_read' || (name === 'field' && ['read', 'peek', 'state'].includes(action))) {
    return peekField();
  }
  if (name === 'coherency') {
    const a = args.a == null ? '' : String(args.a);
    const b = args.b == null ? '' : String(args.b);
    return { coherency: cosine(codeToWaveform(a), codeToWaveform(b)) };
  }
  if (name === 'pattern_resonance') {
    const code = args.code == null ? '' : String(args.code);
    const result = scoreResonance(code, {
      language: typeof args.language === 'string' ? args.language : undefined,
      k: Number(args.k) || undefined,
    });
    if (result == null) return { score: null, library: libraryStatus() };
    return { ...result, library: libraryStatus() };
  }
  if (name === 'evaluate') {
    const input = args.input == null ? '' : String(args.input);
    return evaluateInput(input, {
      language: typeof args.language === 'string' ? args.language : undefined,
      execute: args.execute === true,
      testCode: typeof args.testCode === 'string' ? args.testCode : undefined,
      timeoutMs: Number(args.timeoutMs) || undefined,
      description: typeof args.description === 'string' ? args.description : undefined,
      tags: Array.isArray(args.tags) ? args.tags : undefined,
    });
  }
  if (name === 'exec_verify') {
    const code = args.code == null ? '' : String(args.code);
    const language = typeof args.language === 'string' ? args.language : undefined;
    const testCode = typeof args.testCode === 'string' ? args.testCode : undefined;
    const timeoutMs = Number(args.timeoutMs) || undefined;
    // Async: we return the promise; the JSON-RPC handler awaits it via the
    // dispatcher path which already supports async tool results.
    return verifyExecution(code, { language, testCode, timeoutMs });
  }
  if (name === 'safety_check' || name === 'covenant_check' /* legacy alias */) {
    const code = args.code == null ? '' : String(args.code);
    const meta = {
      language: args.language,
      description: args.description,
      tags: Array.isArray(args.tags) ? args.tags : undefined,
    };
    const cov = covenantCheck(code, meta);
    const sec = securityScan(code, args.language);
    // The security findings are heterogeneous {severity, message, count}; the
    // covenant violations are {principle, reason}. Carry both layers so the
    // caller sees which layer flagged what; aggregate to one `sealed` verdict.
    const securityHasHighOrCrit = (sec.findings || []).some(
      (f) => f.severity === 'high' || f.severity === 'critical');
    return {
      sealed: cov.sealed && !securityHasHighOrCrit,
      covenant: {
        sealed: cov.sealed,
        violations: cov.violations,
        principlesPassed: cov.principlesPassed,
        totalPrinciples: cov.totalPrinciples,
      },
      security: {
        score: sec.score,
        riskLevel: sec.riskLevel,
        findings: sec.findings,
        totalFindings: sec.totalFindings,
      },
    };
  }
  if (name === 'goggles') {
    return gogglesRead(args.code == null ? '' : String(args.code),
      typeof args.language === 'string' ? args.language : undefined);
  }
  if (name === 'audit') {
    const findings = auditFindings(args.code == null ? '' : String(args.code),
      typeof args.language === 'string' ? args.language : undefined);
    return { findings, total: findings.length };
  }
  if (name === 'goggles_params') {
    return gogglesCfg();
  }
  throw new Error('unknown tool: ' + name);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

function send(res, code, obj) {
  const body = obj === null ? '' : JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...CORS });
  res.end(body);
}
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

// Reads are open; writes require the bearer token when one is configured.
function isAuthed(req) {
  if (!TOKEN) return true;
  return (req.headers['authorization'] || '') === 'Bearer ' + TOKEN;
}

// ── Per-IP fixed-window rate limit (in-memory, best-effort). ──
const _hits = new Map();
function rateLimited(req) {
  if (RATE_LIMIT_PER_MIN <= 0) return false;
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  const win = Math.floor(Date.now() / 60000);
  let e = _hits.get(ip);
  if (!e || e.win !== win) { e = { win, n: 0 }; _hits.set(ip, e); }
  e.n++;
  if (_hits.size > 5000) { for (const [k, v] of _hits) if (v.win !== win) _hits.delete(k); } // prune stale windows
  return e.n > RATE_LIMIT_PER_MIN;
}

function manifest() {
  return {
    service: 'remembrance-field',
    version: '0.2.0',
    description: 'Shared conserved-scalar Remembrance field + offline coherency. Callable via MCP or plain REST.',
    mcp: { endpoint: '/mcp', transport: 'streamable-http (JSON-RPC 2.0)', protocolVersion: DEFAULT_PROTOCOL, tools: TOOLS },
    rest: {
      'GET /': 'health + field peek',
      'GET /field': 'read current field state',
      'POST /coherency': '{ a, b } -> { coherency }  (open)',
      'POST /resonance': '{ code, language?, k? } -> { score, bestMatch, topMatches, library }  (open — anti-hallucination signal)',
      'POST /safety': '{ code, language?, description?, tags? } -> { sealed, covenant:{...}, security:{...} }  (open — covenant principles + pattern scanner combined)',
      'POST /verify': '{ code, language, testCode?, timeoutMs? } -> { status, signal, detail }  (write — bearer token required: runs code in a sandbox)',
      'POST /evaluate': '{ input, language?, execute?, testCode?, ... } -> { observation, toolsRun, results, verdict }  (open by default, bearer token required when execute:true — observation-driven dispatcher; runs only the signals that make sense for the input)',
      'POST /contribute': '{ coherence, source, cost? } -> field state  (write — bearer token if configured)',
    },
    auth: TOKEN
      ? 'public reads; writes (field_contribute / POST /contribute) require Authorization: Bearer <FIELD_TOKEN>'
      : 'open (no FIELD_TOKEN set — anyone can read and write)',
    cors: 'enabled (*)',
  };
}

function handleRpc(msg, res, authed) {
  const { id, method, params } = msg || {};
  if (id === undefined || id === null) return send(res, 202, null); // notification
  try {
    if (method === 'initialize') {
      const pv = (params && params.protocolVersion) || DEFAULT_PROTOCOL;
      return send(res, 200, ok(id, { protocolVersion: pv, capabilities: { tools: {} }, serverInfo: { name: 'remembrance-field', version: '0.2.0' } }));
    }
    if (method === 'ping') return send(res, 200, ok(id, {}));
    if (method === 'tools/list') return send(res, 200, ok(id, { tools: TOOLS }));
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const evalNeedsAuth = name === 'evaluate' && isPrivilegedEvaluate(args);
      if ((isPrivilegedTool(name, args.action) || evalNeedsAuth) && !authed) {
        return send(res, 200, ok(id, { content: [{ type: 'text', text: 'Error: unauthorized — a bearer token is required to write to the field' }], isError: true }));
      }
      // Per-tool operational tracking — source `op:server:mcp:<tool>` so
      // the per-source histogram tells you which tool is hot, slow, or
      // failing. Budgets: exec_verify gets a long budget (sandbox), the
      // rest default to 200ms (MCP roundtrip).
      const _toolStart = Date.now();
      const _toolBudget = name === 'exec_verify' ? 5000 : 200;
      // callTool may return a value OR a Promise (exec_verify is async).
      // Promise.resolve handles both uniformly without changing existing
      // sync tool semantics.
      return Promise.resolve()
        .then(() => callTool(name, args))
        .then((out) => {
          recordOperation({
            source: 'op:server:mcp:' + (name || 'unknown'),
            durationMs: Date.now() - _toolStart,
            expectedMs: _toolBudget,
            ok: true,
          });
          return send(res, 200, ok(id, { content: [{ type: 'text', text: JSON.stringify(out) }] }));
        })
        .catch((e) => {
          recordOperation({
            source: 'op:server:mcp:' + (name || 'unknown'),
            durationMs: Date.now() - _toolStart,
            expectedMs: _toolBudget,
            ok: false,
          });
          return send(res, 200, ok(id, { content: [{ type: 'text', text: 'Error: ' + ((e && e.message) || e) }], isError: true }));
        });
    }
    return send(res, 200, err(id, -32601, 'method not found: ' + method));
  } catch (e) {
    return send(res, 200, err(id, -32603, String((e && e.message) || e)));
  }
}

function readBody(req, cb) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on('end', () => cb(raw));
}

// Operational-budget table — per-endpoint expected latency. The signal
// `latencyCoherence(actual, expected)` smooths from 1.0 at 0ms to 0.5
// at the budget to ~0 at 10× the budget. These are realistic working
// expectations for a locally-hosted field server; tune as the field
// itself tells you what's normal.
const OP_BUDGETS = {
  '/':              50,
  '/mcp':          200,
  '/.well-known/mcp': 30,
  '/manifest':      30,
  '/field':         30,
  '/coherency':    100,
  '/resonance':    200,
  '/safety':       150,
  '/verify':      5000,   // sandboxed execution — long budget
  '/contribute':    50,
};

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];

  // Operational tracking — every served request contributes one
  // observation to the field's per-source histogram with source
  // `op:server:http:<METHOD>:<path>`. Latency = response time, ok =
  // status < 400. Best-effort; failures here never block the response.
  const _opStart = Date.now();
  res.once('finish', () => {
    try {
      const code = res.statusCode || 200;
      recordOperation({
        source: 'op:server:http:' + (req.method || 'UNK') + ':' + path,
        durationMs: Date.now() - _opStart,
        expectedMs: OP_BUDGETS[path] != null ? OP_BUDGETS[path] : 100,
        ok: code < 400,
      });
    } catch (_) { /* best-effort */ }
  });

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (rateLimited(req)) return send(res, 429, { error: 'rate limit exceeded — try again shortly' });

  if (req.method === 'GET') {
    if (path === '/mcp') return send(res, 405, { error: 'MCP endpoint — POST JSON-RPC here' });
    if (path === '/.well-known/mcp' || path === '/manifest') return send(res, 200, manifest());
    let field = null; try { field = peekField(); } catch (_e) { /* best-effort */ }
    if (path === '/field') return send(res, 200, { ok: true, field });
    return send(res, 200, { ok: true, service: 'remembrance-field', mcp: '/mcp', manifest: '/.well-known/mcp', tools: TOOLS.map((t) => t.name), field });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST (MCP/REST) or GET (health)' });

  const authed = isAuthed(req);

  // ── Plain-REST shim (no JSON-RPC envelope) ──
  if (path === '/coherency') {
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('coherency', { a: p.a, b: p.b })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }
  if (path === '/resonance') {
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('pattern_resonance', { code: p.code, language: p.language, k: p.k })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }
  if (path === '/goggles') {
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('goggles', { code: p.code, language: p.language })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }
  if (path === '/audit') {
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('audit', { code: p.code, language: p.language })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }
  if (path === '/goggles-params') {
    return readBody(req, () => {
      try { return send(res, 200, callTool('goggles_params', {})); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }
  if (path === '/safety' || path === '/covenant' /* legacy alias */) {
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('safety_check', { code: p.code, language: p.language, description: p.description, tags: p.tags })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }
  if (path === '/evaluate') {
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      if (p.execute === true && !authed) {
        return send(res, 401, { error: 'unauthorized — bearer token required for execute:true' });
      }
      Promise.resolve()
        .then(() => callTool('evaluate', {
          input: p.input, language: p.language, execute: p.execute,
          testCode: p.testCode, timeoutMs: p.timeoutMs,
          description: p.description, tags: p.tags,
        }))
        .then((out) => send(res, 200, out))
        .catch((e) => send(res, 400, { error: String((e && e.message) || e) }));
    });
  }
  if (path === '/verify') {
    if (!authed) return send(res, 401, { error: 'unauthorized — bearer token required to execute code' });
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      Promise.resolve()
        .then(() => callTool('exec_verify', { code: p.code, language: p.language, testCode: p.testCode, timeoutMs: p.timeoutMs }))
        .then((out) => send(res, 200, out))
        .catch((e) => send(res, 400, { error: String((e && e.message) || e) }));
    });
  }
  if (path === '/contribute') {
    if (!authed) return send(res, 401, { error: 'unauthorized — bearer token required to write' });
    return readBody(req, (raw) => {
      let p; try { p = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'bad json' }); }
      try { return send(res, 200, callTool('field_contribute', { coherence: p.coherence, source: p.source, cost: p.cost })); }
      catch (e) { return send(res, 400, { error: String((e && e.message) || e) }); }
    });
  }

  // ── MCP / JSON-RPC (POST /mcp or root) ──
  readBody(req, (raw) => {
    let msg;
    try { msg = JSON.parse(raw || '{}'); } catch { return send(res, 400, err(null, -32700, 'parse error')); }
    if (Array.isArray(msg)) {
      const out = msg.filter((m) => m && m.id != null).map((m) => new Promise((r) => handleRpc(m, { writeHead() {}, end(b) { r(b ? JSON.parse(b) : null); } }, authed)));
      return Promise.all(out).then((arr) => send(res, 200, arr.filter(Boolean)));
    }
    return handleRpc(msg, res, authed);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[field-server] Remembrance Field on ${HOST}:${PORT}` +
    (TOKEN ? ' (public read; bearer write)' : ' (open — set FIELD_TOKEN to gate writes)') +
    ` | MCP: /mcp · REST: /coherency,/contribute,/field · manifest: /.well-known/mcp` +
    ` | rate: ${RATE_LIMIT_PER_MIN > 0 ? RATE_LIMIT_PER_MIN + '/min/ip' : 'off'}` +
    ` | persist: ${process.env.ENTROPY_PATH || '.remembrance/entropy.json (ephemeral without a volume)'}`);
});
