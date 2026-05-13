/**
 * MCP Tool Definitions
 *
 * 15 focused tools (down from 55+).
 * Extracted from server.js for maintainability.
 */

const TOOLS = [
  // ─── 1. Search (unified: search + smart_search + query) ───
  {
    name: 'oracle_search',
    description: 'Unified search across proven code patterns. Supports basic, smart (intent-aware with typo correction), and structured query modes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        language: { type: 'string', description: 'Filter by language (javascript, python, go, rust, typescript)' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
        mode: { type: 'string', enum: ['hybrid', 'semantic', 'smart'], description: 'Search mode: hybrid (default), semantic, or smart (intent-aware with typo correction)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (structured query mode)' },
        description: { type: 'string', description: 'Description to match (structured query mode — used instead of query)' },
      },
      required: [],
    },
  },

  // ─── 2. Resolve ───
  {
    name: 'oracle_resolve',
    description: 'Smart retrieval — decides whether to PULL existing code, EVOLVE a close match, or GENERATE new code. Returns healed code and a whisper from the healed future.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What you need the code to do' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Relevant tags' },
        language: { type: 'string', description: 'Preferred language' },
        heal: { type: 'boolean', description: 'Run healing on matched code (default: true)', default: true },
      },
      required: ['description'],
    },
  },

  // ─── 3. Submit ───
  {
    name: 'oracle_submit',
    description: 'Submit code for validation and storage. Code must pass covenant and coherency checks.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to submit' },
        language: { type: 'string', description: 'Code language' },
        description: { type: 'string', description: 'What the code does' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        testCode: { type: 'string', description: 'Test code to validate against' },
      },
      required: ['code'],
    },
  },

  // ─── 4. Register ───
  {
    name: 'oracle_register',
    description: 'Register code as a named, reusable pattern in the library.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pattern name' },
        code: { type: 'string', description: 'The code' },
        language: { type: 'string', description: 'Language' },
        description: { type: 'string', description: 'What it does' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
        testCode: { type: 'string', description: 'Test code' },
      },
      required: ['name', 'code'],
    },
  },

  // ─── 5. Feedback ───
  {
    name: 'oracle_feedback',
    description: 'Report whether previously pulled code worked in practice.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entry or pattern ID' },
        success: { type: 'boolean', description: 'Whether the code worked' },
      },
      required: ['id', 'success'],
    },
  },

  // ─── 6. Stats ───
  {
    name: 'oracle_stats',
    description: 'Get statistics about the Oracle store, pattern library, and candidates.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ─── 7. Debug (quantum field: capture + observe + feedback + stats + grow + patterns + decohere + reexcite + entanglement + field) ───
  {
    name: 'oracle_debug',
    description: 'Quantum debug oracle — error→fix patterns as a quantum field. Actions: capture (inject pattern in |superposition⟩), search (observe/collapse states with tunneling + interference), feedback (post-measurement update, propagates entanglement), stats (quantum field statistics), grow (expand field with entangled variants), patterns (list with quantum state), decohere (sweep stale patterns), reexcite (restore decohered pattern), entanglement (show entanglement graph), field (quantum field overview).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['capture', 'search', 'feedback', 'stats', 'grow', 'patterns', 'decohere', 'reexcite', 'entanglement', 'field'], description: 'Quantum debug action to perform' },
        errorMessage: { type: 'string', description: 'Error message (for capture/search)' },
        stackTrace: { type: 'string', description: 'Stack trace (for capture/search)' },
        fixCode: { type: 'string', description: 'Fix code (for capture)' },
        fixDescription: { type: 'string', description: 'Fix description (for capture)' },
        language: { type: 'string', description: 'Programming language' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (for capture)' },
        id: { type: 'string', description: 'Debug pattern ID (for feedback/reexcite/entanglement)' },
        resolved: { type: 'boolean', description: 'Whether the fix resolved the error (for feedback)' },
        limit: { type: 'number', description: 'Max results (for search/grow/patterns)' },
        errorClass: { type: 'string', description: 'Error class filter (for patterns)' },
        federated: { type: 'boolean', description: 'Search all tiers (for search, default: true)' },
        maxDays: { type: 'number', description: 'Max days without observation before decoherence (for decohere, default: 180)' },
        depth: { type: 'number', description: 'Entanglement graph traversal depth (for entanglement, default: 2)' },
      },
      required: ['action'],
    },
  },

  // ─── 8. Sync (unified: sync + share) ───
  {
    name: 'oracle_sync',
    description: 'Sync patterns across storage tiers. Scope: personal (private store), community (shared store), or both.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['personal', 'community', 'both'], description: 'Storage scope: personal (default), community (share), or both' },
        direction: { type: 'string', enum: ['push', 'pull', 'both'], description: 'Sync direction (default: both, only for personal scope)' },
        dryRun: { type: 'boolean', description: 'Preview without making changes (default: false)' },
        language: { type: 'string', description: 'Filter by language' },
        patterns: { type: 'array', items: { type: 'string' }, description: 'Pattern names to share (community scope only)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (community scope only)' },
        minCoherency: { type: 'number', description: 'Minimum coherency to share (default: 0.7, community scope only)' },
      },
    },
  },

  // ─── 9. Harvest ───
  {
    name: 'oracle_harvest',
    description: 'Harvest patterns from a local directory or Git repo URL. Walks source files, extracts functions, and bulk-registers them.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local directory path or Git repo URL' },
        language: { type: 'string', description: 'Filter by language' },
        dryRun: { type: 'boolean', description: 'Preview without registering (default: false)' },
        splitMode: { type: 'string', enum: ['file', 'function'], description: 'Split mode (default: file)' },
        branch: { type: 'string', description: 'Git branch to clone' },
        maxFiles: { type: 'number', description: 'Max files to process (default: 200)' },
      },
      required: ['path'],
    },
  },

  // ─── 10. Maintain (unified: maintain + candidates + auto_promote + synthesize + reflect + covenant) ───
  {
    name: 'oracle_maintain',
    description: 'Maintenance and quality operations. Actions: full-cycle (default — heal, promote, optimize, evolve), candidates (list unproven), promote (auto-promote with tests), synthesize (generate tests + promote), reflect (SERF refinement loop), covenant (check code against principles).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['full-cycle', 'candidates', 'promote', 'synthesize', 'reflect', 'covenant'], description: 'Maintenance action (default: full-cycle)' },
        code: { type: 'string', description: 'Code for reflect/covenant actions' },
        language: { type: 'string', description: 'Language filter' },
        description: { type: 'string', description: 'Description for covenant metadata check' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for covenant metadata check' },
        maxLoops: { type: 'number', description: 'Max reflection iterations (for reflect, default: 3)' },
        targetCoherence: { type: 'number', description: 'Stop when coherence exceeds this (for reflect, default: 0.9)' },
        maxCandidates: { type: 'number', description: 'Max candidates to process (for synthesize)' },
        dryRun: { type: 'boolean', description: 'Preview without changes (for synthesize)' },
        minCoherency: { type: 'number', description: 'Min coherency filter (for candidates)' },
        method: { type: 'string', enum: ['variant', 'iterative-refine', 'approach-swap'], description: 'Filter by generation method (for candidates)' },
        maxHealsPerRun: { type: 'number', description: 'Max patterns to heal (for full-cycle, default: 20)' },
      },
    },
  },

  // ─── 11. Healing (lineage, stats, variants, improvements) ───
  {
    name: 'oracle_healing',
    description: 'Healing memory — query healed variants, healing lineage, persistent stats, and improvement queries. Actions: lineage (variant ancestry for a pattern), stats (per-pattern or aggregate healing stats), improved (patterns that improved above a threshold), variants (all healed variants for a pattern), best (best healed variant for a pattern).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['lineage', 'stats', 'improved', 'variants', 'best'], description: 'Healing action (default: stats)' },
        patternId: { type: 'string', description: 'Pattern ID (for lineage/stats/variants/best)' },
        minDelta: { type: 'number', description: 'Minimum coherency improvement (for improved, default: 0.2)' },
      },
      required: ['action'],
    },
  },

  // ─── 12. Swarm (multi-agent orchestration) ───
  {
    name: 'oracle_swarm',
    description: 'Swarm orchestrator — route tasks to multiple AI agents for collective intelligence. Actions: code (generate via swarm), review (multi-agent code review), heal (improve code via swarm), status (check readiness), providers (list available agents).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['code', 'review', 'heal', 'status', 'providers'], description: 'Swarm action (default: code)' },
        task: { type: 'string', description: 'Task description (for code action)' },
        code: { type: 'string', description: 'Code to review or heal (for review/heal actions)' },
        language: { type: 'string', description: 'Target language (default: javascript)' },
        crossScoring: { type: 'boolean', description: 'Enable peer cross-scoring (default: true)' },
      },
      required: ['action'],
    },
  },
  // ─── 13. Pending Feedback ───
  {
    name: 'oracle_pending_feedback',
    description: 'List patterns that were pulled or evolved but have not yet received feedback. Helps close the feedback loop by showing what still needs a success/failure report.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ─── 14. Fractal (fractal math engines + code alignment) ───
  {
    name: 'oracle_fractal',
    description: 'Fractal system — 5 mathematical engines (Sierpinski, Mandelbrot, Barnsley, Julia, Lyapunov) and code alignment scoring. Actions: analyze (fractal alignment of code), engines (list engines), resonance (find best fractal for code), sierpinski/mandelbrot/julia/lyapunov (run engine directly).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['analyze', 'engines', 'resonance', 'sierpinski', 'mandelbrot', 'julia', 'lyapunov'], description: 'Fractal action (default: analyze)' },
        code: { type: 'string', description: 'Code to analyze (for analyze/resonance)' },
        description: { type: 'string', description: 'Task description (for resonance, improves matching)' },
        level: { type: 'number', description: 'Sierpinski recursion depth (default: 5)' },
        cr: { type: 'number', description: 'Real part of c (for mandelbrot/julia, default: -0.75/-0.7)' },
        ci: { type: 'number', description: 'Imaginary part of c (for mandelbrot/julia, default: 0.1/0.27015)' },
        r: { type: 'number', description: 'Growth rate parameter (for lyapunov, default: 3.57)' },
        sequence: { type: 'string', description: 'Lyapunov sequence pattern (e.g., "AB", "AABB")' },
        maxIter: { type: 'number', description: 'Max iterations (for mandelbrot, default: 100)' },
      },
      required: ['action'],
    },
  },
  // ─── 14. Audit (bug detection across all subcommands) ───
  {
    name: 'oracle_audit',
    description: 'AST-based bug audit — 6 bug classes (state-mutation, security, concurrency, type, integration, edge-case) with scope, taint, nullability, and call-graph analysis. Actions: check (run on files/staged), baseline (snapshot known debt), baseline-show, baseline-clear, explain (worked examples), feedback (fix/dismiss/show), prior (Bayesian bug-prior risk), cross-file (real call-graph cascade), summary (rich report).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check', 'baseline', 'baseline-show', 'baseline-clear', 'explain', 'feedback-fix', 'feedback-dismiss', 'feedback-show', 'prior', 'cross-file', 'summary'], description: 'Audit action' },
        file: { type: 'string', description: 'Target file (for check/explain/prior/cross-file)' },
        rule: { type: 'string', description: 'Rule id (for explain and feedback-fix/dismiss)' },
        bugClass: { type: 'string', description: 'Filter by bug class (for check)' },
        minSeverity: { type: 'string', enum: ['high', 'medium', 'low', 'info'], description: 'Minimum severity filter' },
        autoFix: { type: 'boolean', description: 'Apply confident fixes in place (for check)' },
        dryRun: { type: 'boolean', description: 'Preview auto-fix without writing' },
        noBaseline: { type: 'boolean', description: 'Do not hide findings already in baseline' },
      },
      required: ['action'],
    },
  },

  // ─── 15. Lint (style hints) ───
  {
    name: 'oracle_lint',
    description: 'Style and opinion checks (parameter validation, TODO comments, parseInt radix, var usage). Not bugs — these are conventions you opt into.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File to lint' },
        code: { type: 'string', description: 'Inline code (alternative to file)' },
      },
      required: [],
    },
  },

  // ─── 16. Smell (architectural) ───
  {
    name: 'oracle_smell',
    description: 'Architectural smells: long functions, deep nesting, too many parameters, god files, feature envy. Opt-in structural hints with override-able thresholds.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File to scan' },
        code: { type: 'string', description: 'Inline code (alternative to file)' },
        longFunctionLines: { type: 'number', description: 'Threshold for smell/long-function' },
        deepNestingDepth: { type: 'number', description: 'Threshold for smell/deep-nesting' },
        tooManyParams: { type: 'number', description: 'Threshold for smell/too-many-params' },
      },
      required: [],
    },
  },

  // ─── 17. Analyze (unified envelope) ───
  {
    name: 'oracle_analyze',
    description: 'Run the unified analysis envelope on a source string or file. Returns every signal (audit, lint, smell, prior, covenant, coherency, fingerprint) in a single pass. Parse once, reuse everywhere.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path to analyze' },
        code: { type: 'string', description: 'Inline source (alternative to file)' },
        language: { type: 'string', description: 'Language hint (auto-detected from path if omitted)' },
        include: { type: 'array', items: { type: 'string' }, description: 'Which envelope fields to include in the result (default: audit, lint, smell, coherency, meta)' },
      },
      required: [],
    },
  },

  // ─── 18. Heal (unified pipeline: confident → serf → llm → swarm → generate) ───
  {
    name: 'oracle_heal',
    description: 'Unified healing pipeline. Escalation ladder: confident auto-fix (0) → SERF structural reflection (1) → LLM (2) → Swarm consensus (3) → pattern-pull / regenerate (4). Every level reads the same envelope and returns the same result shape. Caps via maxLevel.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File to heal (read from disk)' },
        code: { type: 'string', description: 'Inline source (alternative to file)' },
        maxLevel: { type: 'string', enum: ['confident', 'serf', 'llm', 'swarm', 'generate'], description: 'Stop the escalation at this level (default: generate)' },
        targetRule: { type: 'string', description: 'Only attempt fixes for this ruleId' },
        dryRun: { type: 'boolean', description: 'Do not write the file, just return the healed source' },
        writeFile: { type: 'boolean', description: 'Write the healed source back to disk (default: false)' },
      },
      required: [],
    },
  },

  // ─── 19. Risk (Phase 2 bug probability scorer) ───
  {
    name: 'oracle_risk',
    description: 'File-level bug probability score combining semantic coherency and cyclomatic complexity. Returns a 0..1 probability, a LOW/MEDIUM/HIGH classification, top risk factors, and specific recommendations. Use `file` for a single file or `dir` to batch-scan a directory tree (excludes node_modules/.git/.remembrance by default). Validated at Spearman ρ ≈ +0.26 across random samples from src/ — good for ranking, not absolute classification.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Single file path to score (mutually exclusive with dir)' },
        code: { type: 'string', description: 'Inline source to score (alternative to file)' },
        dir: { type: 'string', description: 'Directory path to batch-scan (mutually exclusive with file/code)' },
        topN: { type: 'number', description: 'For dir scans: how many worst offenders to return (default 10)' },
        filter: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'For dir scans: only return files in this risk bucket' },
      },
      required: [],
    },
  },

  // ─── 15. Test Forge (auto-generate, run, score tests) ───
  {
    name: 'oracle_forge',
    description: 'Test Forge — auto-generate, run, and score tests for oracle patterns. Actions: forge (generate tests for untested patterns), run (run all tests), score (score test quality), promote (full pipeline: generate + run + score + promote).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['forge', 'run', 'score', 'promote'], description: 'Forge action (default: forge)' },
        id: { type: 'string', description: 'Pattern ID to generate test for (forge action only)' },
        dryRun: { type: 'boolean', description: 'Preview without storing tests (default: false)' },
        limit: { type: 'number', description: 'Max patterns to process' },
      },
    },
  },

  // ─── 22. Diagnostic (cathedral covenant scan) ───
  {
    name: 'oracle_diagnostic',
    description: 'Run the cathedral diagnostic — AST + regex + void-scan across every file in a target tree. Applies suppressions (`oracle-ignore` comments) on both paths. Actions: run (full scan), fix (apply auto-fixes to disk), dry-fix (show what would be fixed), suggest-suppressions (draft oracle-ignore comments), summary (load latest report). Produces .remembrance/diagnostics/cathedral-latest.{json,md}.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run', 'fix', 'dry-fix', 'suggest-suppressions', 'summary'], description: 'Diagnostic action (default: run)' },
        path: { type: 'string', description: 'Target path (default: digital-cathedral)' },
      },
    },
  },

  // ─── 23. Ratchet (covenant enforcement) ───
  {
    name: 'oracle_ratchet',
    description: 'Covenant ratchet — "quality floor only rises" enforcement. Compares cathedral-latest.json against the saved baseline. Fails (non-zero result) if high severity count rises, AST findings rise, or total findings exceed baseline+tolerance. Actions: check (enforce), save-baseline (stamp current as new floor), status (return JSON verdict without enforcing).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check', 'save-baseline', 'status'], description: 'Ratchet action (default: check)' },
        tolerance: { type: 'number', description: 'Tolerance for total-findings drift (default: 5)' },
      },
    },
  },

  // ─── 24. Ecosystem (cross-repo audit + wiring gaps) ───
  {
    name: 'oracle_ecosystem',
    description: 'Cross-repo ecosystem diagnostic + ratchet. Audits every remembrance sibling repo under the parent dir, reports findings per repo, and detects wiring gaps (primitives a repo should import but does not). Actions: run (full audit), ratchet (enforce no regression), save-baseline (stamp), summary (load latest), gaps (just the wiring-gap list).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run', 'ratchet', 'save-baseline', 'summary', 'gaps'], description: 'Ecosystem action (default: run)' },
        parent: { type: 'string', description: 'Parent directory containing the 12 repos (default: ..)' },
      },
    },
  },

  // ─── 25. Reason (cross-pattern abstract reasoning) ───
  {
    name: 'oracle_reason',
    description: 'Cross-pattern abstract reasoning. Finds analogies, builds metaphors, identifies conceptual bridges, and detects identity relationships between a source pattern and matches from a cascade. Returns a reasoning report with discovered relationships and confidence per relationship.',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePattern: { type: 'object', description: 'The source pattern to reason from (name, optionally tags + code).' },
        cascadeMatches: { type: 'array', items: { type: 'object' }, description: 'Cascade-matched patterns to reason against. Each entry has at least name + correlation.' },
      },
      required: ['sourcePattern', 'cascadeMatches'],
    },
  },

  // ─── 28-32. Remembrance Field (LRE) — expose the conserved field as MCP ───
  {
    name: 'field_state',
    description: 'Read the LivingRemembranceEngine field state — the ecosystem-wide conserved scalar that every producer contributes to. Returns coherence, globalEntropy, cascadeFactor, updateCount, timestamp, and the per-source histogram. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        includeSources: { type: 'boolean', description: 'Include the per-source histogram (can be large; default: true)', default: true },
      },
      required: [],
    },
  },
  {
    name: 'field_contribute',
    description: 'Contribute an observation to the LRE field. The MCP caller participates as a producer: pass cost (work units), coherence (alignment 0..N — ratchets up unbounded), and source (identity string like "agent:claude:my-task"). Returns the new field state. The field updates persistently; every caller sees the same conserved scalar.',
    inputSchema: {
      type: 'object',
      properties: {
        cost: { type: 'number', description: 'Work units consumed by this operation (default: 1)', default: 1 },
        coherence: { type: 'number', description: 'Alignment score (typically 0..1, but unbounded above — coherency ratchets up).' },
        source: { type: 'string', description: 'Caller identity, e.g. "agent:claude:my-task" or "mcp-client:tool-x"' },
      },
      required: ['coherence', 'source'],
    },
  },
  {
    name: 'field_pressure',
    description: 'Get the field-driven backpressure signal. Returns hot=true when globalEntropy or cascadeFactor exceeds thresholds — high-volume producers should self-throttle when hot. Replaces hardcoded rate limits with conserved-field dynamics.',
    inputSchema: {
      type: 'object',
      properties: {
        entropyThreshold: { type: 'number', description: 'Hot when globalEntropy exceeds this (default: 10)', default: 10 },
        cascadeThreshold: { type: 'number', description: 'Hot when cascadeFactor exceeds this (default: 4)', default: 4 },
      },
      required: [],
    },
  },
  {
    name: 'field_introspect',
    description: 'Ask the field who has been contributing. Returns the per-source histogram sorted by count (hot paths first), plus totals. Useful for finding silent-but-plumbed sources (the field knows what fires; this surfaces the gap). Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        topN: { type: 'number', description: 'Return the top-N most-active sources (default: 25, use 0 for all)', default: 25 },
        prefix: { type: 'string', description: 'Filter sources by prefix (e.g. "void:" returns only Void producers)' },
      },
      required: [],
    },
  },
  {
    name: 'field_sources_diff',
    description: 'Given a list of expected source labels, return which are firing in the field vs silent. The diagnostic primitive for "what should be wired but isn\'t" — pass the labels you expect to see, get back the gap. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        expected: { type: 'array', items: { type: 'string' }, description: 'List of source labels to check' },
      },
      required: ['expected'],
    },
  },

  // ─── 27. Ecosystem Orient (cross-repo protocol on connect) ───
  {
    name: 'ecosystem_orient',
    description: 'Returns the canonical Remembrance 12-repo ecosystem protocol (ECOSYSTEM.md) plus the required per-change workflow checklist (audit → reflect → covenant → swarm → substrate → ledger). Any MCP-using agent SHOULD call this once at session start, before making code changes. Read-only; no side effects.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['full', 'checklist', 'topology'], description: 'full (default) = whole ECOSYSTEM.md, checklist = just the §2 workflow, topology = just the §1 repo table' },
      },
      required: [],
    },
  },

  // ─── 26. Meditate (auto-improvement loop, single tick) ───
  {
    name: 'oracle_meditate',
    description: 'Run a single tick of the auto-improvement loop: discover gaps in the periodic table, propose candidate fills, validate each through the structural-safety filter and coherency gates, return the proposals. Output is advisory — proposals stay in `pending` status until explicitly approved. Bounded by maxProposals to prevent runaway compute.',
    inputSchema: {
      type: 'object',
      properties: {
        maxProposals: { type: 'number', description: 'Max proposals to generate this tick (default: 3)', default: 3 },
        autoApprove: { type: 'boolean', description: 'Auto-approve proposals at or above the autonomous-mode threshold (default: false)', default: false },
      },
      required: [],
    },
  },
];

module.exports = { TOOLS };
