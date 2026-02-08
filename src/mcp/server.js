/**
 * MCP (Model Context Protocol) Server
 *
 * Exposes the Remembrance Oracle as an MCP-compatible tool server.
 * Communicates via JSON-RPC 2.0 over stdin/stdout.
 *
 * Any AI client that supports MCP can connect and use:
 * - oracle_search: Search for proven code patterns
 * - oracle_resolve: Smart pull/evolve/generate decision
 * - oracle_submit: Submit code for validation and storage
 * - oracle_query: Query stored entries
 * - oracle_feedback: Report if pulled code worked
 * - oracle_stats: Get store statistics
 * - oracle_register_pattern: Register a pattern in the library
 * - oracle_nearest: Find nearest vocabulary terms
 */

const readline = require('readline');
const { RemembranceOracle } = require('../api/oracle');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'remembrance-oracle', version: '1.0.0' };

const TOOLS = [
  {
    name: 'oracle_search',
    description: 'Search for proven, validated code patterns. Returns ranked results by relevance and coherency.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query (e.g., "binary search", "rate limiting")' },
        language: { type: 'string', description: 'Filter by language (javascript, python, go, rust, typescript)' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
        mode: { type: 'string', enum: ['hybrid', 'semantic'], description: 'Search mode (default: hybrid)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_resolve',
    description: 'Smart retrieval — decides whether to PULL existing code, EVOLVE a close match, or GENERATE new code.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What you need the code to do' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Relevant tags' },
        language: { type: 'string', description: 'Preferred language' },
      },
      required: ['description'],
    },
  },
  {
    name: 'oracle_submit',
    description: 'Submit code for validation and storage. Code must pass coherency checks.',
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
  {
    name: 'oracle_query',
    description: 'Query stored validated code entries by description, tags, and language.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Description to match against' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter by' },
        language: { type: 'string', description: 'Language filter' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
      },
    },
  },
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
  {
    name: 'oracle_stats',
    description: 'Get statistics about the Oracle store and pattern library.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_register_pattern',
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
  {
    name: 'oracle_nearest',
    description: 'Find the nearest semantic vocabulary terms to a query. Useful for understanding how the Oracle interprets your intent.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query to find nearest terms for' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_versions',
    description: 'Get version history for a pattern, showing all saved snapshots.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID to get history for' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_semantic_diff',
    description: 'Perform a semantic diff between two code entries, showing function-level changes and structural analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        idA: { type: 'string', description: 'ID of the first entry/pattern' },
        idB: { type: 'string', description: 'ID of the second entry/pattern' },
      },
      required: ['idA', 'idB'],
    },
  },
  {
    name: 'oracle_reflect',
    description: 'Run the SERF infinite reflection loop on code. Iteratively generates 5 candidates, scores them on coherence, and selects the best until coherence > 0.9 or 3 loops.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to refine through reflection' },
        language: { type: 'string', description: 'Code language' },
        maxLoops: { type: 'number', description: 'Maximum reflection iterations (default: 3)' },
        targetCoherence: { type: 'number', description: 'Stop when coherence exceeds this (default: 0.9)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_harvest',
    description: 'Bulk harvest patterns from a local directory. Walks source files, extracts functions, and registers them as patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local directory path to harvest from' },
        language: { type: 'string', description: 'Filter by language (javascript, python, go, rust, typescript)' },
        dryRun: { type: 'boolean', description: 'Preview without registering (default: false)' },
        splitMode: { type: 'string', enum: ['file', 'function'], description: 'Split patterns by file or individual function (default: file)' },
        maxFiles: { type: 'number', description: 'Max files to process (default: 200)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'oracle_candidates',
    description: 'List candidate patterns — coherent but unproven code awaiting test proof. Candidates are generated from proven patterns via language transpilation, SERF refinement, or approach swaps.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Filter by language' },
        minCoherency: { type: 'number', description: 'Minimum coherency score (default: 0)' },
        method: { type: 'string', enum: ['variant', 'serf-refine', 'approach-swap'], description: 'Filter by generation method' },
      },
    },
  },
  {
    name: 'oracle_generate',
    description: 'Generate candidate patterns from all proven patterns. Runs the continuous growth loop: proven → coherency → language variants → candidates store. The library is always growing.',
    inputSchema: {
      type: 'object',
      properties: {
        languages: { type: 'array', items: { type: 'string' }, description: 'Languages to generate variants in (default: [python, typescript])' },
        methods: { type: 'array', items: { type: 'string' }, description: 'Generation methods to use (default: [variant, serf-refine, approach-swap])' },
        maxPatterns: { type: 'number', description: 'Max proven patterns to process (default: all)' },
        minCoherency: { type: 'number', description: 'Minimum coherency for candidates (default: 0.5)' },
      },
    },
  },
  {
    name: 'oracle_promote',
    description: 'Promote a candidate to proven by providing test proof. The candidate runs through the full oracle validation pipeline with the given test code.',
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: { type: 'string', description: 'ID of the candidate to promote' },
        testCode: { type: 'string', description: 'Test code that proves the candidate works' },
      },
      required: ['candidateId'],
    },
  },
  {
    name: 'oracle_auto_promote',
    description: 'Auto-promote all candidates that already have test code. Each is run through the full oracle validation pipeline.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_synthesize_tests',
    description: 'Synthesize test code for candidate patterns. Analyzes function signatures, translates parent tests, and generates edge-case assertions. Optionally auto-promotes candidates with new tests.',
    inputSchema: {
      type: 'object',
      properties: {
        maxCandidates: { type: 'number', description: 'Max candidates to process (default: all)' },
        dryRun: { type: 'boolean', description: 'Preview without updating candidates (default: false)' },
        autoPromote: { type: 'boolean', description: 'Auto-promote candidates after synthesis (default: true)' },
      },
    },
  },
  {
    name: 'oracle_sync',
    description: 'Sync patterns with your personal store (~/.remembrance/personal/). Bidirectional by default. Personal store is private — grows automatically across projects.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['push', 'pull', 'both'], description: 'Sync direction (default: both)' },
        dryRun: { type: 'boolean', description: 'Preview without making changes (default: false)' },
        language: { type: 'string', description: 'Filter by language when pulling (default: all)' },
      },
    },
  },
  {
    name: 'oracle_share',
    description: 'Share patterns to the community store (~/.remembrance/community/). Explicit action — only shares test-backed patterns above 0.7 coherency. Community patterns can be pulled by anyone.',
    inputSchema: {
      type: 'object',
      properties: {
        patterns: { type: 'array', items: { type: 'string' }, description: 'Pattern names to share (default: all eligible)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
        minCoherency: { type: 'number', description: 'Minimum coherency to share (default: 0.7)' },
        dryRun: { type: 'boolean', description: 'Preview without making changes (default: false)' },
      },
    },
  },
  {
    name: 'oracle_community',
    description: 'Browse or pull from the community store (~/.remembrance/community/). Use action "stats" to view, "pull" to pull patterns into local.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['stats', 'pull'], description: 'Action to perform (default: stats)' },
        language: { type: 'string', description: 'Filter by language when pulling' },
        maxPull: { type: 'number', description: 'Max patterns to pull (default: all)' },
        dryRun: { type: 'boolean', description: 'Preview without making changes (default: false)' },
      },
    },
  },
  {
    name: 'oracle_global_stats',
    description: 'Get combined statistics for personal + community stores. Shows totals and breakdown by store type.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_covenant',
    description: 'Check code against the Covenant seal (The Kingdom\'s Weave). Code must pass all 15 principles to be accepted.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The code to check against the covenant' },
        description: { type: 'string', description: 'Optional description for metadata intent check' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for metadata intent check' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_smart_search',
    description: 'Intelligent search with intent parsing, typo correction, abbreviation expansion, cross-language support, and contextual ranking. Better than oracle_search for natural language queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query (supports typos, abbreviations, intent signals)' },
        language: { type: 'string', description: 'Preferred language (js, py, ts, go, rust, etc.)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        mode: { type: 'string', enum: ['hybrid', 'semantic'], description: 'Search mode (default hybrid)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_debug_capture',
    description: 'Capture an error→fix pair as a debug pattern. Automatically generates language variants and error variants for exponential growth.',
    inputSchema: {
      type: 'object',
      properties: {
        errorMessage: { type: 'string', description: 'The error message' },
        stackTrace: { type: 'string', description: 'Optional stack trace' },
        fixCode: { type: 'string', description: 'The code that fixes the error' },
        fixDescription: { type: 'string', description: 'Human description of the fix' },
        language: { type: 'string', description: 'Programming language' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
      },
      required: ['errorMessage', 'fixCode'],
    },
  },
  {
    name: 'oracle_debug_search',
    description: 'Search for debug patterns (error→fix pairs) matching an error message. Searches across local, personal, and community stores for the best fixes ranked by confidence.',
    inputSchema: {
      type: 'object',
      properties: {
        errorMessage: { type: 'string', description: 'The error to find fixes for' },
        stackTrace: { type: 'string', description: 'Optional stack trace for better matching' },
        language: { type: 'string', description: 'Preferred language for fixes' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
        federated: { type: 'boolean', description: 'Search all tiers — local, personal, community (default: true)' },
      },
      required: ['errorMessage'],
    },
  },
  {
    name: 'oracle_debug_feedback',
    description: 'Report whether an applied debug fix resolved the error. Successful resolutions increase confidence and trigger cascading variant generation.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Debug pattern ID' },
        resolved: { type: 'boolean', description: 'Whether the fix resolved the error' },
      },
      required: ['id', 'resolved'],
    },
  },
  {
    name: 'oracle_debug_grow',
    description: 'Generate debug pattern variants from all high-confidence patterns. Exponential growth engine — language variants, error variants, and cascade amplification.',
    inputSchema: {
      type: 'object',
      properties: {
        minConfidence: { type: 'number', description: 'Minimum confidence to process (default: 0.5)' },
        maxPatterns: { type: 'number', description: 'Max patterns to process (default: all)' },
        languages: { type: 'array', items: { type: 'string' }, description: 'Languages for variants (default: [python, typescript, go])' },
      },
    },
  },
  {
    name: 'oracle_debug_stats',
    description: 'Get debug oracle statistics — total patterns, confidence, resolution rates, breakdown by category and language.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_debug_share',
    description: 'Share proven debug patterns to the community store. Requires confidence >= 0.5 and at least 1 successful resolution.',
    inputSchema: {
      type: 'object',
      properties: {
        minConfidence: { type: 'number', description: 'Minimum confidence to share (default: 0.5)' },
        category: { type: 'string', description: 'Filter by error category' },
        language: { type: 'string', description: 'Filter by language' },
        dryRun: { type: 'boolean', description: 'Preview without sharing (default: false)' },
      },
    },
  },
  {
    name: 'oracle_reflector_snapshot',
    description: 'Take a coherence snapshot of the codebase. Evaluates all source files on 5 dimensions: simplicity, readability, security, unity, correctness.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root directory to scan (default: current directory)' },
        minCoherence: { type: 'number', description: 'Coherence threshold (default: 0.7)' },
        maxFiles: { type: 'number', description: 'Max files to scan (default: 50)' },
      },
    },
  },
  {
    name: 'oracle_reflector_run',
    description: 'Run the self-reflector: scan codebase, evaluate coherence, heal files below threshold via SERF, and optionally create a healing branch/PR.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root directory to scan (default: current directory)' },
        minCoherence: { type: 'number', description: 'Coherence threshold for healing (default: 0.7)' },
        maxFiles: { type: 'number', description: 'Max files to scan (default: 50)' },
        push: { type: 'boolean', description: 'Push healing branch to remote (default: false)' },
        openPR: { type: 'boolean', description: 'Open a PR with healing changes (default: false)' },
        autoMerge: { type: 'boolean', description: 'Auto-merge high-coherence PRs (default: false)' },
      },
    },
  },
  {
    name: 'oracle_reflector_evaluate',
    description: 'Evaluate a single file\'s coherence across all SERF dimensions.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file to evaluate' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'oracle_reflector_heal',
    description: 'Heal a single file via SERF reflection loop. Returns the healed code with coherence improvement and whisper explanation.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file to heal' },
        maxLoops: { type: 'number', description: 'Max SERF loops (default: 3)' },
        targetCoherence: { type: 'number', description: 'Target coherence (default: 0.95)' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'oracle_reflector_status',
    description: 'Get the self-reflector status: configuration, last run, and recent run history.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root directory (default: current directory)' },
      },
    },
  },
  {
    name: 'oracle_reflector_config',
    description: 'Get or update the self-reflector configuration (interval, thresholds, push/PR settings).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root directory (default: current directory)' },
        intervalHours: { type: 'number', description: 'Run interval in hours' },
        minCoherence: { type: 'number', description: 'Minimum coherence threshold' },
        autoMerge: { type: 'boolean', description: 'Auto-merge high-coherence PRs' },
        push: { type: 'boolean', description: 'Push healing branches' },
        openPR: { type: 'boolean', description: 'Open PRs with healing changes' },
      },
    },
  },
  {
    name: 'oracle_reflector_multi',
    description: 'Run the full multi-repo reflector: snapshot both repos, compare dimensions, detect drift, and unify healing across repos.',
    inputSchema: {
      type: 'object',
      properties: {
        repos: { type: 'array', items: { type: 'string' }, description: 'Array of repo root paths (at least 2)' },
        minCoherence: { type: 'number', description: 'Coherence threshold (default: 0.7)' },
        maxFiles: { type: 'number', description: 'Max files per repo (default: 50)' },
      },
      required: ['repos'],
    },
  },
  {
    name: 'oracle_reflector_compare',
    description: 'Compare coherence dimensions between two repos side-by-side. Shows which repo leads on each dimension and the divergence severity.',
    inputSchema: {
      type: 'object',
      properties: {
        repos: { type: 'array', items: { type: 'string' }, description: 'Array of 2 repo root paths' },
        maxFiles: { type: 'number', description: 'Max files per repo (default: 50)' },
      },
      required: ['repos'],
    },
  },
  {
    name: 'oracle_reflector_drift',
    description: 'Detect pattern drift between two repos. Finds shared functions that have diverged, unique functions in each repo, and computes convergence scores.',
    inputSchema: {
      type: 'object',
      properties: {
        repos: { type: 'array', items: { type: 'string' }, description: 'Array of 2 repo root paths' },
        maxFiles: { type: 'number', description: 'Max files per repo (default: 50)' },
      },
      required: ['repos'],
    },
  },
  // ─── Safety & Revert Tools ───
  {
    name: 'oracle_reflector_dry_run',
    description: 'Simulate healing without modifying files. Returns projected changes, coherence improvements, and what would happen if healing were applied.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        minCoherence: { type: 'number', description: 'Min coherence threshold (default: 0.7)' },
        maxFiles: { type: 'number', description: 'Max files to scan (default: 50)' },
      },
    },
  },
  {
    name: 'oracle_reflector_safe_run',
    description: 'Run the reflector with full safety protections: backup, coherence guard, approval gate, and auto-rollback if coherence drops.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        minCoherence: { type: 'number', description: 'Min coherence threshold (default: 0.7)' },
        requireApproval: { type: 'boolean', description: 'Require manual approval before merge (default: false)' },
        autoRollback: { type: 'boolean', description: 'Auto-rollback on coherence drop (default: true)' },
        dryRun: { type: 'boolean', description: 'Preview mode — no changes applied (default: false)' },
      },
    },
  },
  {
    name: 'oracle_reflector_rollback',
    description: 'Rollback to a previous backup state. Reverts healing changes and verifies coherence after restore.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        backupId: { type: 'string', description: 'Specific backup ID to rollback to (default: latest)' },
      },
    },
  },
  {
    name: 'oracle_reflector_backups',
    description: 'List all available backup manifests for the repository. Shows backup IDs, timestamps, and strategies.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
      },
    },
  },
  // ─── Deep Scoring Engine Tools ───
  {
    name: 'oracle_reflector_deep_score',
    description: 'Deep coherence analysis of a file: cyclomatic complexity, comment density, security scan, nesting depth, code quality metrics, and aggregate weighted score.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code to analyze' },
        language: { type: 'string', description: 'Language (auto-detected if not provided)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_reflector_repo_score',
    description: 'Compute aggregate repo-level deep coherence scores: worst/best files, security findings, dimension averages, health status.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        maxFiles: { type: 'number', description: 'Max files to scan (default: 50)' },
      },
    },
  },
  {
    name: 'oracle_reflector_security_scan',
    description: 'Scan code for security anti-patterns: hardcoded secrets, eval, injection risks, XSS, prototype pollution, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code to scan' },
        language: { type: 'string', description: 'Language (auto-detected if not provided)' },
      },
      required: ['code'],
    },
  },
  // ─── Central Configuration Tools ───
  {
    name: 'oracle_reflector_central_config',
    description: 'View the central reflector configuration with all sections: thresholds, scanning, healing, safety, scoring weights, schedule, github, logging.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
      },
    },
  },
  {
    name: 'oracle_reflector_central_set',
    description: 'Set a specific config value using dot-notation. Example: key="thresholds.minCoherence", value=0.8',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        key: { type: 'string', description: 'Dot-notation key (e.g. thresholds.minCoherence)' },
        value: { description: 'Value to set (number, boolean, string, or array)' },
      },
      required: ['key', 'value'],
    },
  },
  // ─── History & Logging Tools ───
  {
    name: 'oracle_reflector_history',
    description: 'View run history with before/after coherence scores, changes applied, and whisper text for each run.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        last: { type: 'number', description: 'Number of recent runs to return (default: 10)' },
      },
    },
  },
  {
    name: 'oracle_reflector_trend',
    description: 'Generate an ASCII trend chart of coherence scores over time. Shows visual progression of codebase health.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        last: { type: 'number', description: 'Number of recent runs to chart (default: 30)' },
      },
    },
  },
  {
    name: 'oracle_reflector_stats',
    description: 'Compute statistics from run history: total runs, avg coherence, trend direction, best/worst runs, total files healed.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
      },
    },
  },
  {
    name: 'oracle_reflector_orchestrate',
    description: 'Run the full orchestrated workflow: config → snapshot → deep-score → heal → safety → whisper → PR → history. Returns per-step timing and status.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
        dryRun: { type: 'boolean', description: 'Simulate without changes (default: false)' },
        push: { type: 'boolean', description: 'Push healing branch' },
        openPR: { type: 'boolean', description: 'Open a PR' },
      },
    },
  },
  {
    name: 'oracle_reflector_coherence',
    description: 'Compute real coherence score for a file using the weighted formula: 0.25*syntax + 0.20*readability + 0.15*security + 0.30*test_proof + 0.10*reliability.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to source file' },
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'oracle_reflector_repo_coherence',
    description: 'Compute repo-level coherence with dimensional breakdown (syntax, readability, security, test proof, reliability).',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repo root (default: cwd)' },
      },
    },
  },
  {
    name: 'oracle_reflector_format_pr',
    description: 'Generate rich markdown PR body from a reflector report: coherence delta, top 3 healed changes, whisper, deep score, security findings, dimensional breakdown, approval prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        report: { type: 'object', description: 'Reflector/orchestration report object' },
      },
      required: ['report'],
    },
  },
];

class MCPServer {
  constructor(oracle) {
    this.oracle = oracle || new RemembranceOracle();
    this._initialized = false;
  }

  handleRequest(msg) {
    const { id, method, params } = msg;

    // Notifications (no id)
    if (method === 'notifications/initialized') {
      this._initialized = true;
      return null; // No response for notifications
    }

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };
    }

    if (method === 'tools/call') {
      return this._handleToolCall(id, params);
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown method: ${method}` },
    };
  }

  _handleToolCall(id, params) {
    const { name, arguments: args = {} } = params || {};

    try {
      let result;

      switch (name) {
        case 'oracle_search':
          result = this.oracle.search(args.query || '', {
            limit: args.limit || 5,
            language: args.language,
            mode: args.mode || 'hybrid',
          });
          break;

        case 'oracle_resolve':
          result = this.oracle.resolve({
            description: args.description || '',
            tags: args.tags || [],
            language: args.language,
          });
          break;

        case 'oracle_submit':
          result = this.oracle.submit(args.code, {
            language: args.language,
            description: args.description || '',
            tags: args.tags || [],
            testCode: args.testCode,
          });
          break;

        case 'oracle_query':
          result = this.oracle.query({
            description: args.description || '',
            tags: args.tags || [],
            language: args.language,
            limit: args.limit || 5,
          });
          break;

        case 'oracle_feedback':
          result = this.oracle.feedback(args.id, args.success);
          break;

        case 'oracle_stats': {
          const storeStats = this.oracle.stats();
          const patternStats = this.oracle.patternStats();
          result = { store: storeStats, patterns: patternStats };
          break;
        }

        case 'oracle_register_pattern':
          result = this.oracle.registerPattern({
            name: args.name,
            code: args.code,
            language: args.language,
            description: args.description || '',
            tags: args.tags || [],
            testCode: args.testCode,
          });
          break;

        case 'oracle_nearest': {
          const { nearestTerms } = require('../core/vectors');
          result = nearestTerms(args.query || '', args.limit || 10);
          break;
        }

        case 'oracle_versions': {
          const { VersionManager } = require('../core/versioning');
          const sqliteStore = this.oracle.store.getSQLiteStore();
          const vm = new VersionManager(sqliteStore);
          result = vm.getHistory(args.patternId);
          break;
        }

        case 'oracle_semantic_diff': {
          const { semanticDiff } = require('../core/versioning');
          const entryA = this.oracle.patterns.getAll().find(p => p.id === args.idA) || this.oracle.store.get(args.idA);
          const entryB = this.oracle.patterns.getAll().find(p => p.id === args.idB) || this.oracle.store.get(args.idB);
          if (!entryA) throw new Error(`Entry ${args.idA} not found`);
          if (!entryB) throw new Error(`Entry ${args.idB} not found`);
          result = semanticDiff(entryA.code, entryB.code, entryA.language);
          break;
        }

        case 'oracle_reflect': {
          const { reflectionLoop } = require('../core/reflection');
          result = reflectionLoop(args.code || '', {
            language: args.language,
            maxLoops: args.maxLoops || 3,
            targetCoherence: args.targetCoherence || 0.9,
          });
          // Trim history code to keep response size reasonable
          result.history = result.history.map(h => ({
            loop: h.loop,
            coherence: h.coherence,
            strategy: h.strategy,
            serfScore: h.serfScore,
          }));
          break;
        }

        case 'oracle_harvest': {
          const { harvest } = require('../ci/harvest');
          result = harvest(this.oracle, args.path || '.', {
            language: args.language,
            dryRun: args.dryRun || false,
            splitMode: args.splitMode || 'file',
            maxFiles: args.maxFiles || 200,
          });
          break;
        }

        case 'oracle_candidates': {
          const filters = {};
          if (args.language) filters.language = args.language;
          if (args.minCoherency) filters.minCoherency = args.minCoherency;
          if (args.method) filters.generationMethod = args.method;
          const candidates = this.oracle.candidates(filters);
          const stats = this.oracle.candidateStats();
          result = { stats, candidates: candidates.slice(0, 50) };
          break;
        }

        case 'oracle_generate':
          result = this.oracle.generateCandidates({
            languages: args.languages || ['python', 'typescript'],
            methods: args.methods || ['variant', 'serf-refine', 'approach-swap'],
            maxPatterns: args.maxPatterns || Infinity,
            minCoherency: args.minCoherency || 0.5,
          });
          break;

        case 'oracle_promote':
          result = this.oracle.promote(args.candidateId, args.testCode);
          break;

        case 'oracle_auto_promote':
          result = this.oracle.autoPromote();
          break;

        case 'oracle_synthesize_tests':
          result = this.oracle.synthesizeTests({
            maxCandidates: args.maxCandidates,
            dryRun: args.dryRun || false,
            autoPromote: args.autoPromote !== false,
          });
          break;

        case 'oracle_sync': {
          const dir = args.direction || 'both';
          const opts = { dryRun: args.dryRun || false, language: args.language };
          if (dir === 'push') result = this.oracle.syncToGlobal(opts);
          else if (dir === 'pull') result = this.oracle.syncFromGlobal(opts);
          else result = this.oracle.sync(opts);
          break;
        }

        case 'oracle_share': {
          result = this.oracle.share({
            patterns: args.patterns,
            tags: args.tags,
            minCoherency: args.minCoherency || 0.7,
            dryRun: args.dryRun || false,
          });
          break;
        }

        case 'oracle_community': {
          const action = args.action || 'stats';
          if (action === 'pull') {
            result = this.oracle.pullCommunity({
              language: args.language,
              maxPull: args.maxPull || Infinity,
              dryRun: args.dryRun || false,
            });
          } else {
            result = this.oracle.communityStats();
          }
          break;
        }

        case 'oracle_global_stats': {
          const gStats = this.oracle.globalStats();
          const federated = this.oracle.federatedSearch();
          result = { ...gStats, globalOnly: federated.globalOnly, personalOnly: federated.personalOnly, communityOnly: federated.communityOnly };
          break;
        }

        case 'oracle_covenant': {
          const { covenantCheck } = require('../core/covenant');
          result = covenantCheck(args.code || '', {
            description: args.description || '',
            tags: args.tags || [],
          });
          break;
        }

        case 'oracle_smart_search':
          result = this.oracle.smartSearch(args.query, {
            language: args.language,
            limit: args.limit || 10,
            mode: args.mode || 'hybrid',
          });
          break;

        case 'oracle_debug_capture':
          result = this.oracle.debugCapture({
            errorMessage: args.errorMessage,
            stackTrace: args.stackTrace || '',
            fixCode: args.fixCode,
            fixDescription: args.fixDescription || '',
            language: args.language || 'javascript',
            tags: args.tags || [],
          });
          break;

        case 'oracle_debug_search':
          result = this.oracle.debugSearch({
            errorMessage: args.errorMessage,
            stackTrace: args.stackTrace || '',
            language: args.language,
            limit: args.limit || 5,
            federated: args.federated !== false,
          });
          break;

        case 'oracle_debug_feedback':
          result = this.oracle.debugFeedback(args.id, args.resolved);
          break;

        case 'oracle_debug_grow':
          result = this.oracle.debugGrow({
            minConfidence: args.minConfidence || 0.5,
            maxPatterns: args.maxPatterns || Infinity,
            languages: args.languages,
          });
          break;

        case 'oracle_debug_stats':
          result = this.oracle.debugStats();
          break;

        case 'oracle_debug_share':
          result = this.oracle.debugShare({
            minConfidence: args.minConfidence || 0.5,
            category: args.category,
            language: args.language,
            dryRun: args.dryRun || false,
          });
          break;

        case 'oracle_reflector_snapshot': {
          const { takeSnapshot } = require('../reflector/engine');
          result = takeSnapshot(args.path || process.cwd(), {
            minCoherence: args.minCoherence || 0.7,
            maxFilesPerRun: args.maxFiles || 50,
          });
          // Trim file-level code from response
          result.files = result.files.map(f => ({
            path: f.relativePath || f.path,
            language: f.language,
            coherence: f.coherence,
            dimensions: f.dimensions,
            covenantSealed: f.covenantSealed,
            error: f.error,
          }));
          break;
        }

        case 'oracle_reflector_run': {
          const { runReflector } = require('../reflector/scheduler');
          result = runReflector(args.path || process.cwd(), {
            minCoherence: args.minCoherence,
            maxFilesPerRun: args.maxFiles,
            push: args.push || false,
            openPR: args.openPR || false,
            autoMerge: args.autoMerge || false,
          });
          break;
        }

        case 'oracle_reflector_evaluate': {
          const { evaluateFile } = require('../reflector/engine');
          result = evaluateFile(args.filePath);
          break;
        }

        case 'oracle_reflector_heal': {
          const { healFile } = require('../reflector/engine');
          result = healFile(args.filePath, {
            maxSerfLoops: args.maxLoops || 3,
            targetCoherence: args.targetCoherence || 0.95,
          });
          // Include healed code in response
          if (result.healed) {
            result.healedCode = result.healed.code;
          }
          // Remove full code objects to keep response size manageable
          delete result.original;
          delete result.healed;
          break;
        }

        case 'oracle_reflector_status': {
          const { getStatus } = require('../reflector/scheduler');
          result = getStatus(args.path || process.cwd());
          break;
        }

        case 'oracle_reflector_config': {
          const { loadConfig, saveConfig } = require('../reflector/scheduler');
          const rootDir = args.path || process.cwd();
          const cfg = loadConfig(rootDir);
          const updatable = ['intervalHours', 'minCoherence', 'autoMerge', 'push', 'openPR'];
          let updated = false;
          for (const key of updatable) {
            if (args[key] !== undefined) {
              cfg[key] = args[key];
              updated = true;
            }
          }
          if (updated) saveConfig(rootDir, cfg);
          result = cfg;
          break;
        }

        case 'oracle_reflector_multi': {
          const { multiReflect } = require('../reflector/multi');
          if (!args.repos || args.repos.length < 2) throw new Error('Need at least 2 repo paths');
          result = multiReflect(args.repos, {
            minCoherence: args.minCoherence,
            maxFilesPerRun: args.maxFiles,
          });
          // Trim large fields from response
          if (result.drift && result.drift.details) {
            result.drift.details.diverged = result.drift.details.diverged.slice(0, 20);
            result.drift.details.identical = result.drift.details.identical.slice(0, 10);
            result.drift.details.uniqueA = result.drift.details.uniqueA.slice(0, 10);
            result.drift.details.uniqueB = result.drift.details.uniqueB.slice(0, 10);
          }
          break;
        }

        case 'oracle_reflector_compare': {
          const { multiSnapshot, compareDimensions } = require('../reflector/multi');
          if (!args.repos || args.repos.length < 2) throw new Error('Need at least 2 repo paths');
          const snap = multiSnapshot(args.repos, { maxFilesPerRun: args.maxFiles });
          result = compareDimensions(snap);
          break;
        }

        case 'oracle_reflector_drift': {
          const { detectDrift } = require('../reflector/multi');
          if (!args.repos || args.repos.length < 2) throw new Error('Need at least 2 repo paths');
          result = detectDrift(args.repos, { maxFilesPerRun: args.maxFiles });
          // Trim details
          if (result.details) {
            result.details.diverged = result.details.diverged.slice(0, 20);
            result.details.identical = result.details.identical.slice(0, 10);
            result.details.uniqueA = result.details.uniqueA.slice(0, 10);
            result.details.uniqueB = result.details.uniqueB.slice(0, 10);
          }
          break;
        }

        case 'oracle_reflector_dry_run': {
          const { dryRun } = require('../reflector/safety');
          const dir = args.rootDir || process.cwd();
          result = dryRun(dir, {
            minCoherence: args.minCoherence,
            maxFilesPerRun: args.maxFiles,
          });
          break;
        }

        case 'oracle_reflector_safe_run': {
          const { safeReflect } = require('../reflector/safety');
          const dir = args.rootDir || process.cwd();
          result = safeReflect(dir, {
            minCoherence: args.minCoherence,
            requireApproval: args.requireApproval,
            autoRollback: args.autoRollback !== false,
            dryRunMode: args.dryRun === true,
          });
          // Strip healed file code to avoid huge responses
          if (result.healedFiles) {
            result.healedFiles = result.healedFiles.map(f => ({
              path: f.path,
              size: f.code ? f.code.length : 0,
            }));
          }
          break;
        }

        case 'oracle_reflector_rollback': {
          const { rollback: doRollback } = require('../reflector/safety');
          const dir = args.rootDir || process.cwd();
          result = doRollback(dir, { backupId: args.backupId, verify: true });
          break;
        }

        case 'oracle_reflector_backups': {
          const { loadBackupManifests } = require('../reflector/safety');
          const dir = args.rootDir || process.cwd();
          result = loadBackupManifests(dir);
          break;
        }

        case 'oracle_reflector_deep_score': {
          const { deepScore } = require('../reflector/scoring');
          result = deepScore(args.code, { language: args.language });
          break;
        }

        case 'oracle_reflector_repo_score': {
          const { repoScore } = require('../reflector/scoring');
          const dir = args.rootDir || process.cwd();
          result = repoScore(dir, { maxFilesPerRun: args.maxFiles });
          // Trim individual file details to avoid huge responses
          if (result.files) {
            result.files = result.files.map(f => ({
              path: f.path,
              aggregate: f.aggregate,
              serfCoherence: f.serfCoherence,
              security: { score: f.security.score, riskLevel: f.security.riskLevel, totalFindings: f.security.findings.length },
            }));
          }
          break;
        }

        case 'oracle_reflector_security_scan': {
          const { securityScan: doScan } = require('../reflector/scoring');
          const { detectLanguage: detect } = require('../core/coherency');
          const lang = args.language || detect(args.code);
          result = doScan(args.code, lang);
          break;
        }

        case 'oracle_reflector_central_config': {
          const { loadCentralConfig, validateConfig } = require('../reflector/config');
          const dir = args.rootDir || process.cwd();
          const config = loadCentralConfig(dir);
          const validation = validateConfig(config);
          result = { config, validation };
          break;
        }

        case 'oracle_reflector_central_set': {
          const { setCentralValue, validateConfig } = require('../reflector/config');
          const dir = args.rootDir || process.cwd();
          const config = setCentralValue(dir, args.key, args.value);
          const validation = validateConfig(config);
          result = { key: args.key, value: args.value, valid: validation.valid, issues: validation.issues };
          break;
        }

        case 'oracle_reflector_history': {
          const { loadHistoryV2 } = require('../reflector/history');
          const dir = args.rootDir || process.cwd();
          const history = loadHistoryV2(dir);
          const last = args.last || 10;
          result = { runs: history.runs.slice(-last), total: history.runs.length };
          break;
        }

        case 'oracle_reflector_trend': {
          const { generateTrendChart } = require('../reflector/history');
          const dir = args.rootDir || process.cwd();
          result = { chart: generateTrendChart(dir, { last: args.last || 30 }) };
          break;
        }

        case 'oracle_reflector_stats': {
          const { computeStats } = require('../reflector/history');
          const dir = args.rootDir || process.cwd();
          result = computeStats(dir);
          break;
        }

        case 'oracle_reflector_orchestrate': {
          const { orchestrate } = require('../reflector/orchestrator');
          const dir = args.rootDir || process.cwd();
          result = orchestrate(dir, {
            dryRun: args.dryRun || false,
            push: args.push || false,
            openPR: args.openPR || false,
          });
          break;
        }

        case 'oracle_reflector_coherence': {
          const { computeCoherence } = require('../reflector/coherenceScorer');
          const dir = args.rootDir || process.cwd();
          result = computeCoherence(args.filePath, { rootDir: dir });
          break;
        }

        case 'oracle_reflector_repo_coherence': {
          const { computeRepoCoherence } = require('../reflector/coherenceScorer');
          const dir = args.rootDir || process.cwd();
          result = computeRepoCoherence(dir);
          break;
        }

        case 'oracle_reflector_format_pr': {
          const { formatPRComment } = require('../reflector/prFormatter');
          result = { markdown: formatPRComment(args.report || {}) };
          break;
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Unknown tool: ${name}` }],
              isError: true,
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        },
      };
    }
  }
}

/**
 * Start the MCP server, reading JSON-RPC messages from stdin.
 */
function startMCPServer(oracle) {
  const server = new MCPServer(oracle);
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    try {
      const msg = JSON.parse(line.trim());
      const response = server.handleRequest(msg);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });

  return server;
}

// Allow running directly: node src/mcp/server.js
if (require.main === module) {
  startMCPServer();
}

module.exports = { MCPServer, startMCPServer, TOOLS };
