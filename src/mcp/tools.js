/**
 * MCP Tool Definitions
 *
 * All tool schemas for the Remembrance Oracle MCP server.
 * Extracted from server.js for maintainability.
 */

const TOOLS = [
  // ─── Core (7) ───
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
    description: 'Smart retrieval — decides whether to PULL existing code, EVOLVE a close match, or GENERATE new code. Returns healed code, a whisper from the healed future, and candidate comparison notes.',
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

  // ─── Search (1) ───
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

  // ─── Quality (2) ───
  {
    name: 'oracle_reflect',
    description: 'Run the infinite reflection loop on code. Iteratively generates 5 candidates, scores them on coherence, and selects the best until coherence > 0.9 or 3 loops.',
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

  // ─── Candidates (3) ───
  {
    name: 'oracle_candidates',
    description: 'List candidate patterns — coherent but unproven code awaiting test proof.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Filter by language' },
        minCoherency: { type: 'number', description: 'Minimum coherency score (default: 0)' },
        method: { type: 'string', enum: ['variant', 'iterative-refine', 'approach-swap'], description: 'Filter by generation method' },
      },
    },
  },
  {
    name: 'oracle_auto_promote',
    description: 'Auto-promote all candidates that already have test code. Each is run through the full oracle validation pipeline.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_synthesize_tests',
    description: 'Synthesize test code for candidate patterns and optionally auto-promote.',
    inputSchema: {
      type: 'object',
      properties: {
        maxCandidates: { type: 'number', description: 'Max candidates to process (default: all)' },
        dryRun: { type: 'boolean', description: 'Preview without updating candidates (default: false)' },
        autoPromote: { type: 'boolean', description: 'Auto-promote candidates after synthesis (default: true)' },
      },
    },
  },

  // ─── Debug (6) ───
  {
    name: 'oracle_debug_capture',
    description: 'Capture an error→fix pair as a debug pattern. Automatically generates language and error variants.',
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
    description: 'Search for debug patterns (error→fix pairs) matching an error message. Searches across local, personal, and community stores.',
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
    description: 'Report whether an applied debug fix resolved the error.',
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
    name: 'oracle_debug_stats',
    description: 'Get debug oracle statistics — total patterns, confidence, resolution rates.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_debug_grow',
    description: 'Grow debug patterns by generating language and error variants from existing patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max patterns to process (default: all)' },
      },
    },
  },
  {
    name: 'oracle_debug_patterns',
    description: 'List all debug patterns, optionally filtered by language or error class.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Filter by programming language' },
        errorClass: { type: 'string', description: 'Filter by error class (e.g. TypeError, SyntaxError)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
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
  {
    name: 'oracle_reflector_auto_commit',
    description: 'Run the auto-commit safety pipeline: create backup branch, apply healed files, run build/test, merge only if tests pass. Returns pipeline result with test output.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repository root directory' },
        healedFiles: { type: 'array', description: 'Array of { path, code } healed files to commit' },
        testCommand: { type: 'string', description: 'Test command to run (default: npm test)' },
        buildCommand: { type: 'string', description: 'Build command to run before tests' },
        dryRun: { type: 'boolean', description: 'Simulate without writing changes' },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'oracle_reflector_pattern_hook',
    description: 'Query the pattern library for similar proven patterns before healing a file. Returns matched patterns, healing context, and suggested strategy.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the file to look up patterns for' },
        rootDir: { type: 'string', description: 'Repository root directory' },
        maxResults: { type: 'number', description: 'Max patterns to return (default: 3)' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'oracle_reflector_pattern_hook_stats',
    description: 'Get statistics on pattern-guided healings: how many healings used pattern library matches, average improvement guided vs unguided, top patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repository root directory' },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'oracle_reflector_resolve_config',
    description: 'Resolve the full reflector configuration by layering defaults, mode preset, saved config, and environment overrides. Returns the fully merged config.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repository root directory' },
        mode: { type: 'string', description: 'Preset mode: strict, balanced, or relaxed' },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'oracle_reflector_set_mode',
    description: 'Set the reflector mode for a repo (strict, balanced, relaxed). Persists to central config and applies preset thresholds.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repository root directory' },
        mode: { type: 'string', description: 'Mode name: strict, balanced, or relaxed' },
      },
      required: ['rootDir', 'mode'],
    },
  },
  {
    name: 'oracle_reflector_list_modes',
    description: 'List all available reflector preset modes with descriptions and threshold settings.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'oracle_reflector_notify',
    description: 'Send a Discord/Slack notification with healing results (coherence delta, files healed, whisper, PR link). Auto-detects platform from webhook URL.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repository root directory' },
        webhookUrl: { type: 'string', description: 'Discord or Slack webhook URL' },
        report: { type: 'object', description: 'Reflector report to format into notification' },
        repoName: { type: 'string', description: 'Repository name for the notification title' },
        prUrl: { type: 'string', description: 'PR URL to include in the notification' },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'oracle_reflector_notification_stats',
    description: 'Get notification delivery statistics: total sent, success rate, last notification.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repository root directory' },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'oracle_reflector_dashboard_data',
    description: 'Get all reflector dashboard data: coherence trend, recent healing runs, auto-commit stats, notification stats, current config mode.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: { type: 'string', description: 'Repository root directory' },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'oracle_llm_status',
    description: 'Check if Claude LLM engine is available for AI-powered operations.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_llm_transpile',
    description: 'Transpile a pattern to another language using Claude. Falls back to AST transpiler if Claude is unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID to transpile' },
        targetLanguage: { type: 'string', description: 'Target language (python, typescript, go, rust)' },
      },
      required: ['patternId', 'targetLanguage'],
    },
  },

  // ─── Storage (2) ───
  {
    name: 'oracle_sync',
    description: 'Sync patterns with your personal store (~/.remembrance/personal/). Bidirectional by default.',
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
    description: 'Share patterns to the community store (~/.remembrance/community/). Only shares test-backed patterns above 0.7 coherency.',
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

  // ─── Harvest (1) ───
  {
    name: 'oracle_harvest',
    description: 'Harvest patterns from a local directory or Git repo URL. Walks source files, extracts functions, and bulk-registers them as Oracle patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Local directory path or Git repo URL to harvest from' },
        language: { type: 'string', description: 'Filter by language (javascript, python, go, rust, typescript)' },
        dryRun: { type: 'boolean', description: 'Preview without registering patterns (default: false)' },
        splitMode: { type: 'string', enum: ['file', 'function'], description: 'Split mode: register whole files or individual functions (default: file)' },
        branch: { type: 'string', description: 'Git branch to clone (default: default branch)' },
        maxFiles: { type: 'number', description: 'Max standalone files to process (default: 200)' },
      },
      required: ['path'],
    },
  },

  // ─── Maintenance (1) ───
  {
    name: 'oracle_maintain',
    description: 'Run full maintenance cycle: self-improve (heal low-coherency patterns, promote candidates, clean stubs) → self-optimize (detect duplicates, analyze usage) → self-evolve (detect regressions, re-check coherency). Returns combined report.',
    inputSchema: {
      type: 'object',
      properties: {
        maxHealsPerRun: { type: 'number', description: 'Max patterns to heal per run (default: 20)' },
      },
    },
  },
];

module.exports = { TOOLS };
