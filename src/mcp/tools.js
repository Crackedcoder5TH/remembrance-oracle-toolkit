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

  // ─── 28. Remembrance Field (LRE) — the conserved ecosystem field, one tool ───
  {
    name: 'field',
    description: 'The Remembrance Field — the LivingRemembranceEngine conserved scalar that every producer across the ecosystem contributes to. One tool, dispatched by `action`: state (default) recalls the field — coherence, coherenceIntegral, globalEntropy, cascadeFactor, updateCount, and the per-source histogram; contribute participates as a producer (pass cost, coherence, source); validate is the signal-validity oracle — classify a candidate contribution (or batch via coherence:number[]) against the rolling baseline of recent activity and return {accepted, shapeClass, suspect, projected, ...} without committing unless commit:true is passed. The shape classes (constant-displaced, narrow-band-displaced, constant-aligned, narrow-band-aligned, bimodal, wide-uniform, natural-high/low/mid, learned-natural) reproduce the empirically-measured response of the field engine to malformed input shapes (H3 — see docs/EXPERIMENT_TEMPORAL_AND_FIFTH_FAMILY.md). The variance gate is itself growable: when a contribution\'s shape signature passes both oracles and gets absorbed by the covenant, its (mean, variance, n) signature is recorded; future structurally similar contributions classify as `learned-natural` and bypass the H3-default narrow-band/constant rejection. Same ratchet discipline as the covenant — only verified material teaches. The "displaced" variants are how synthetic / fabricated readings show up before they reach the engine. pressure returns the field-driven backpressure signal (hot when entropy/cascade saturate); pressure-release takes a snapshot and detects whether a release event just occurred since the last call — when the substrate was holding cascade tension and a contribution relieved it. record-cost contributes pure work/money/energy under the entropy side without claiming a coherency benefit; record-benefit contributes a coherency-positive outcome (verified pattern, healed file, passed audit) under the coherency side; the engine\'s master equation `entropy = cost / (coherence + ε)` auto-balances the two so the covenant aim — always raise net coherency — is enforced by the field\'s own dynamics. record-meta-observation aggregates a trajectory of scores, classifies it via the dual oracle, and contributes the classification back as a structured meta:* observation — making "the substrate measured my work" a normal recorded type of contribution. consensus-histogram returns counts/ratios of the four absorption outcomes (both-accept / both-reject / A-yes-B-no / A-no-B-yes) over a recent window — read it as the environmental sensor for what kind of pressure the substrate is under (adversarial vs degraded supply vs healthy growth). cognition-trajectory reads the field-goggles persistent buffer to report the working agent\'s session signature (n, mean, variance, shapeClass). learned-shapes returns the variance-gate\'s learned signatures grouped by source-prefix domain. direction returns a verdict over a recent snapshot window — healing / degrading / saturating / relaxing / steady / gaining-coherence / losing-coherence / mixed — derived from the (coherence, entropy, cascade) delta vector. temporal-snapshot walks a file\'s git history and contributes adjacent + arc fractal coherency as temporal:* sources — continuous self-measurement of any file\'s structural stability across revisions. introspect returns the per-source histogram sorted by count, for finding silent-but-plumbed sources; sources-diff takes expected source labels and returns which are firing vs silent; checkpoint commits the field state to the blockchain (L2 ledger + Solana + Cosmos anchors); audit runs a coherence-gated ecosystem audit on a file or code target — the current field coherence selects the depth (below 0.65 = full audit: audit/lint/smell/covenant signals plus a reflection heal pass; at or above 0.65 = fast scan: coherency + risk only), and the audit work-cost is balanced back into the field so heavy audits raise globalEntropy and trip the field backpressure, and a file audit ends with the orchestrator ruling for the directory the audited file lives in; direct asks the coherency orchestrator for its authoritative ruling — the final voice on how coherency should flow and what should be fixed next: separate coherency and entropy readings, the flow direction, the priority-ranked fix-next queue with root cause, and the healing budget — every item carrying a community score, its coherency measured against the collective field coherence; offload posts a unit of work (kind + payload) to the shared work-queue and waits for the coherency-judged result — a cool node computes it at once, a hot node sends it to the pool; relax is the throttle-up entropy relaxation: when the field is hot, it runs the resonance detector and injects its discovered coherence to relax globalEntropy (best-effort — returns triggered:false when the field is not hot, on cooldown, or the detector is unreachable). contribute, checkpoint, audit, direct, offload, and relax change the field; validate is non-mutating unless commit:true; the read actions leave its state unchanged but still witness it (records-on-read snapshots), so none is strictly side-effect-free.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['state', 'contribute', 'validate', 'pressure', 'pressure-release', 'record-cost', 'record-benefit', 'record-meta-observation', 'consensus-histogram', 'cognition-trajectory', 'learned-shapes', 'direction', 'temporal-snapshot', 'introspect', 'sources-diff', 'checkpoint', 'audit', 'direct', 'offload', 'relax'], description: 'Field operation. Default: state — recall the field.' },
        includeSources: { type: 'boolean', description: 'state/checkpoint: include the per-source histogram (state defaults true, checkpoint defaults false).' },
        cost: { type: 'number', description: 'contribute / validate / record-benefit: work units consumed (default: 1).' },
        coherence: { description: 'contribute / record-benefit: alignment score (number, 0..1). validate: number for a single candidate, or number[] for a batch — the shape of the array is what is classified.' },
        source: { type: 'string', description: 'contribute / validate / record-cost / record-benefit / record-meta-observation: caller identity, e.g. "agent:claude:my-task".' },
        commit: { type: 'boolean', description: 'validate: when true, write the candidate(s) to the field if the verdict is accepted. Default false (validate is non-mutating).' },
        units: { type: 'number', description: 'record-cost: work units spent — compute time, money, energy, swarm runs. Raises entropy without claiming coherency benefit.' },
        kind: { type: 'string', description: 'record-cost: optional kind tag used to construct a default source label, e.g. "compute", "money", "swarm-run". Default "work".' },
        scores: { type: 'array', items: { type: 'number' }, description: 'record-meta-observation: per-edit/per-measurement coherency readings. The trajectory shape gets classified via the dual oracle and contributed as a meta:* source.' },
        sessionId: { type: 'string', description: 'record-meta-observation: optional session id appended to the meta-source label.' },
        windowN: { type: 'number', description: 'consensus-histogram / direction: how many recent decisions / snapshots to aggregate. consensus-histogram default = all; direction default = 5.' },
        statePath: { type: 'string', description: 'cognition-trajectory: override the default ~/.claude/.field-goggles-state.json path.' },
        repoDir: { type: 'string', description: 'temporal-snapshot: absolute path to the git repo whose file you want to measure.' },
        filePath: { type: 'string', description: 'temporal-snapshot: path to the file (relative to repoDir) whose history will be walked.' },
        maxVersions: { type: 'number', description: 'temporal-snapshot: cap on history depth (default 12).' },
        entropyThreshold: { type: 'number', description: 'pressure: hot when globalEntropy exceeds this (default: 10).' },
        cascadeThreshold: { type: 'number', description: 'pressure: hot when cascadeFactor exceeds this (default: 4).' },
        topN: { type: 'number', description: 'introspect: return the top-N most-active sources (default: 25, 0 = all).' },
        prefix: { type: 'string', description: 'introspect: filter sources by prefix, e.g. "void:".' },
        expected: { type: 'array', items: { type: 'string' }, description: 'sources-diff: the source labels to check (required for that action).' },
        file: { type: 'string', description: 'audit: path to the file to audit.' },
        code: { type: 'string', description: 'audit: inline source to audit (alternative to file).' },
        language: { type: 'string', description: 'audit: language hint (auto-detected from the file path if omitted).' },
        dir: { type: 'string', description: 'direct: directory scanned as coherency zones (default: src).' },
        kind: { type: 'string', description: 'offload: the work kind — an executor must be registered for it (e.g. audit, echo).' },
        payload: { description: 'offload: the work input passed to the executor.' },
        timeoutMs: { type: 'number', description: 'offload: how long to wait for a result before returning a timeout (default: 30000).' },
      },
      required: [],
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
