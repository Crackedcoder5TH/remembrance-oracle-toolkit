// @oracle-infrastructure — internal machinery whose flagged functions are NESTED helper closures inside its exported functions (AST-parser internals, CLI, daemon, reflector analysis, lifecycle manager) — implementation internals, not module-scope periodic-table elements
/**
 * Admin CLI commands: users, audit, auto-seed, ci-feedback, ci-stats, ci-track, hooks, registry
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { c, colorScore } = require('../colors');
const { parseDryRun } = require('../validate-args');

function registerAdminCommands(handlers, { oracle, jsonOut }) {
  // ── ORGANS (decomposition #5) ──
  require('./admin/audit').registerAuditCommands(handlers, { oracle, jsonOut });
  require('./admin/loops').registerLoopCommands(handlers, { oracle, jsonOut });
  require('./admin/atomic').registerAtomicCommands(handlers, { oracle, jsonOut });
  require('./admin/tools').registerToolsCommands(handlers, { oracle, jsonOut });
  require('./admin/auto').registerAutoCommands(handlers, { oracle, jsonOut });
  require('./admin/session').registerSessionCommands(handlers, { oracle, jsonOut });
  require('./admin/status').registerStatusCommands(handlers, { oracle, jsonOut });
  require('./admin/quality').registerQualityCommands(handlers, { oracle, jsonOut });


  // Wire the unified history log on first command invocation. Every
  // event emitted on the bus is appended to .remembrance/history/events.log
  // so `oracle history` can replay it.
  try {
    const { wireHistory } = require('../../core/history');
    wireHistory(process.cwd());
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[admin] history wiring failed:', e?.message || e);
  }

  // Wire cross-subsystem reactions so every subsystem learns from
  // every other. A feedback.fix now fans out to audit calibration,
  // pattern-library reliability, and debug-oracle amplitude all at
  // once — see src/core/reactions.js for the subscription graph.
  try {
    const { wireReactions } = require('../../core/reactions');
    wireReactions(oracle, { storageRoot: process.cwd() });
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[admin] reactions wiring failed:', e?.message || e);
  }

  // Wire the session compliance ledger. Every search/write/audit/feedback
  // event on the bus is recorded into the active session so `oracle session
  // status` can compute a live compliance score, and the pre-commit hook
  // can block on non-compliance when ORACLE_WORKFLOW=enforce.
  try {
    const { wireCompliance } = require('../../core/compliance');
    wireCompliance(process.cwd());
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[admin] compliance wiring failed:', e?.message || e);
  }

  // Auto-discover + auto-wire ecosystem peers. Runs best-effort at
  // bootstrap: if the Void Compressor, Reflector, Swarm, etc. are
  // alive in the environment, their bindings install automatically
  // so every CLI command benefits from them without explicit opt-in.
  // Skipped when ORACLE_ECOSYSTEM=off.
  if ((process.env.ORACLE_ECOSYSTEM || 'on').toLowerCase() !== 'off') {
    try {
      const eco = require('../../core/ecosystem');
      // Announce ourselves so peers find us. Sync filesystem writes —
      // cheap and doesn't block the CLI. We deliberately do NOT call
      // ensureWired() here: autoWireAll runs health checks that use
      // execFileSync and can add seconds to every CLI invocation.
      // Commands that actually depend on the ecosystem being wired
      // (e.g. `oracle ecosystem connect`) call `await eco.ensureWired()`
      // themselves, which memoizes the in-flight promise.
      eco.announceModule(process.cwd());
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[admin] ecosystem init failed:', e?.message || e);
    }
  }


  // Pick the audit backend. The AST-based checker is the default because
  // it eliminates the regex-era false positives on regex flags, SQL PRAGMA
  // template literals, already-guarded null derefs, and comment content.
  // Users can opt back into the legacy regex checker via
  // ORACLE_AUDIT_BACKEND=regex if the new backend misbehaves on a file
  // the old one handled.
  function loadAuditBackend() {
    const backend = (process.env.ORACLE_AUDIT_BACKEND || 'ast').toLowerCase();
    if (backend === 'regex' || backend === 'legacy') {
      return require('../../audit/static-checkers');
    }
    return require('../../audit/ast-checkers');
  }

  /**
   * Compute the mean Phase 2 risk score across the repo's src/
   * directory. Returns null on any error so callers can degrade
   * gracefully. Used by `session start` / `session end` to track
   * risk deltas across a work session.
   */
  function computeSessionMeanRisk(repoRoot) {
    try {
      const { scanDirectory } = require('../../quality/risk-scanner');
      const srcDir = path.join(repoRoot, 'src');
      if (!fs.existsSync(srcDir)) return null;
      const report = scanDirectory(srcDir, { topN: 1 });
      return report.stats.meanProbability;
    } catch {
      return null;
    }
  }


  // `oracle lint` — style / opinion checks that used to live as low-severity
  // findings in `audit check`. These are NOT bugs — they're conventions
  // you opt into. Split out so the bug audit stays focused on real bugs.

  // `oracle risk-score` — file-level bug-probability score. Combines
  // Oracle's semantic coherency (ρ = -0.30 vs audit findings) and
  // cyclomatic complexity (ρ = +0.35) into a 0..1 probability with
  // a risk level (LOW|MEDIUM|HIGH), component breakdown, and
  // actionable recommendations. See docs/benchmarks/risk-score-
  // phase2.md for the empirical basis.

  // `oracle risk-scan` — batch risk scan across a directory tree.
  // Walks the tree, scores every source file, and reports the
  // distribution + top N worst offenders. Excludes node_modules,
  // .git, .remembrance, dist, build, and digital-cathedral (which
  // holds intentionally-buggy fixtures) by default.

  // `oracle void-scan` — sliding-window Void coherence diagnostic.
  // Calls Void Compressor's /coherence endpoint on each window and
  // surfaces the regions with the lowest coherence. DIAGNOSTIC ONLY:
  // the empirical study in docs/benchmarks/ found this hits known
  // bugs ~33% of the time, not enough to be a detector, but enough
  // to be a useful "weirdest regions of this file" signal.
  // `oracle feedback-stats` — stage 5 of the anti-hallucination
  // pipeline. Reports the state of the prediction→outcome store that
  // every `oracle risk-score` call contributes to. Once enough paired
  // rows accumulate (~200+), the training loop can retune the risk-
  // score weights using real outcomes instead of the v1 baseline.

  // ── COHERENCY ORCHESTRATOR ─────────────────────────────────────────
  // ── COHERENCY GENERATOR ──────────────────────────────────────────────

  // ── SELF-IMPROVEMENT LOOP ──────────────────────────────────────────

  // ── LIVING COVENANT ──────────────────────────────────────────────────

  // ── COHERENCY RECALIBRATION ─────────────────────────────────────────


  // ── ATOMIC CODING ──────────────────────────────────────────────────
  //
  // Three subcommands for the periodic table of code:
  //   oracle atomic analyze --file <f>   — extract atomic properties
  //   oracle atomic discover [--max N]   — find gaps in property space
  //   oracle atomic table [--json]       — show the periodic table


  // `oracle plan` — stage 1 of the anti-hallucination generation
  // pipeline. Takes a high-level intent + a proposed symbol list and
  // verifies each symbol against the four-tier ground-truth chain
  // (built-ins → session-seen → oracle library → repo scan). Returns
  // a verified plan or a list of missing symbols that need revision.
  //
  // Usage:
  //   oracle plan --intent "description" --symbols a,b,c [--json]
  //   cat plan.json | oracle plan --stdin  (draft-plan shape)
  //
  // The caller is expected to iterate: if ok=false, re-prompt the
  // generator with the missing list, receive a revised plan, repeat
  // until ok=true. Then hand the plan to `oracle generate` which
  // enforces that every call site uses only verified symbols.

  // `oracle generate-gate` — stage 2 of the anti-hallucination pipeline.
  // Takes a verified plan + a draft file and rejects the draft if any
  // call site uses a symbol that isn't in the plan, isn't defined
  // locally, and isn't a built-in. Returns structured violations so
  // a caller (CLI, swarm, MCP) can re-prompt the generator.
  //
  // Usage:
  //   oracle generate-gate --plan plan.json --draft path/to/draft.js [--json]
  //
  // The --plan file is the JSON output of `oracle plan --json`.

  // `oracle ground <file>` — grounding check for AI-generated code.
  // Parses the file's identifier references, cross-checks against the
  // session ledger's touched-identifier set + JS/Node built-ins, and
  // reports any function calls that don't resolve to anything the
  // agent has observed. Designed to run as a PostToolUse hook after
  // every Edit/Write so fabricated APIs get caught at write-time
  // instead of test-time.


  // `oracle smell` — architectural smell detectors. These are structural
  // hints (long functions, deep nesting, too many params, god files,
  // feature envy) that aren't bugs but suggest maintainability trouble.

  // `oracle history` — unified event timeline across every subsystem.
  // Reads from the history namespace populated by src/core/events via
  // wireHistory. Supports --type, --prefix, --since, --until, --limit.
  // `oracle session` — compliance ledger for agent / human sessions.
  // Makes the CLAUDE.md mandates operational: start / status / end /
  // bypass / record. The pre-commit hook reads from this ledger and
  // blocks commits when ORACLE_WORKFLOW=enforce is set and
  // compliance is incomplete.
  // `oracle ecosystem` — discover peer modules (Oracle, Void, Reflector,
  // Swarm, Dialer, API Key Plugger) and auto-wire any that are alive.
  // Layer 1: static manifests (filesystem walk for remembrance.json)
  // Layer 2: runtime registry (~/.remembrance/modules/*.json)
  // Layer 3: event-bus reactions (ecosystem.peer.found / lost)



  // Compact payload summary for the history timeline.
  function formatPayload(p) {
    if (!p || typeof p !== 'object') return c.dim(String(p || ''));
    const bits = [];
    if (p.ruleId) bits.push(c.cyan(p.ruleId));
    if (p.file)   bits.push(c.dim(String(p.file).slice(-40)));
    if (p.level)  bits.push(`level=${p.level}`);
    if (p.success !== undefined) bits.push(p.success ? c.green('ok') : c.red('fail'));
    if (p.patchCount !== undefined) bits.push('patches=' + p.patchCount);
    return bits.join(' ');
  }















}

module.exports = { registerAdminCommands };
