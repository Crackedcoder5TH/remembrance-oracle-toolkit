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
const { safeJsonParse } = require('../core/covenant');

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
    description: 'List candidate patterns — coherent but unproven code awaiting test proof. Candidates are generated from proven patterns via language transpilation, iterative refinement, or approach swaps.',
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
    name: 'oracle_generate',
    description: 'Generate candidate patterns from all proven patterns. Runs the continuous growth loop: proven → coherency → language variants → candidates store. The library is always growing.',
    inputSchema: {
      type: 'object',
      properties: {
        languages: { type: 'array', items: { type: 'string' }, description: 'Languages to generate variants in (default: [python, typescript])' },
        methods: { type: 'array', items: { type: 'string' }, description: 'Generation methods to use (default: [variant, iterative-refine, approach-swap])' },
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
    name: 'oracle_smart_promote',
    description: 'Smart auto-promote: promotes candidates meeting coherency >= threshold, covenant check, sandbox tests, and parent confidence. Stricter than basic auto-promote.',
    inputSchema: {
      type: 'object',
      properties: {
        minCoherency: { type: 'number', description: 'Min coherency to promote (default: 0.9)' },
        minConfidence: { type: 'number', description: 'Min parent reliability (default: 0.8)' },
        manualOverride: { type: 'boolean', description: 'Skip confidence check (default: false)' },
        dryRun: { type: 'boolean', description: 'Preview without promoting (default: false)' },
      },
    },
  },
  {
    name: 'oracle_security_scan',
    description: 'Deep security scan: covenant + language-specific vulnerability patterns + optional external tools (Semgrep, Bandit). Whispers a veto message if unsafe.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to scan (or pattern ID)' },
        language: { type: 'string', description: 'Language (default: javascript)' },
        runExternalTools: { type: 'boolean', description: 'Run Semgrep/Bandit if installed (default: false)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_security_audit',
    description: 'Scan all patterns in the library for security issues. Returns audit report with clean/advisory/vetoed counts.',
    inputSchema: {
      type: 'object',
      properties: {
        runExternalTools: { type: 'boolean', description: 'Run external security tools (default: false)' },
      },
    },
  },
  {
    name: 'oracle_rollback',
    description: 'Rollback a pattern to a previous version. Uses versioning history to restore code.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID to rollback' },
        version: { type: 'number', description: 'Target version (default: previous)' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_verify',
    description: 'Verify a pattern passes its tests. Auto-rolls back to last passing version if tests fail.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID to verify' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_healing_stats',
    description: 'Get healing success rate statistics across all patterns.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_reliability',
    description: 'Get full reliability breakdown for a pattern (usage + bugs + healing).',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_report_bug',
    description: 'Report a bug against a pattern. Decreases its reliability score.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID' },
        description: { type: 'string', description: 'Bug description' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_remote_search',
    description: 'Search patterns across registered remote oracle servers over HTTP. Queries all remotes in parallel and deduplicates results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        language: { type: 'string', description: 'Filter by language' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_remotes',
    description: 'Manage remote oracle servers. Actions: list, add (requires url), remove (requires url or name), health.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove', 'health'], description: 'Action' },
        url: { type: 'string', description: 'Remote server URL' },
        name: { type: 'string', description: 'Friendly name for the remote' },
        token: { type: 'string', description: 'JWT token for authentication' },
      },
    },
  },
  {
    name: 'oracle_full_search',
    description: 'Ultimate federated search: local + personal + community + sibling repos + remote servers. Searches everywhere and merges results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        language: { type: 'string', description: 'Filter by language' },
        limit: { type: 'number', description: 'Max results (default: 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_cross_search',
    description: 'Search patterns across multiple repo oracle stores (local filesystem). Discovers sibling repos with .remembrance/ directories.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Search query' },
        language: { type: 'string', description: 'Filter by language' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['description'],
    },
  },
  {
    name: 'oracle_repos',
    description: 'List, discover, or register repos for cross-repo federated search.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'discover', 'add'], description: 'Action to perform' },
        path: { type: 'string', description: 'Repo path (for add action)' },
      },
    },
  },
  {
    name: 'oracle_vote',
    description: 'Vote on a pattern (upvote or downvote). Community votes affect pattern reliability scoring.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'Pattern ID to vote on' },
        voter: { type: 'string', description: 'Voter identifier (default: anonymous)' },
        vote: { type: 'number', description: '1 for upvote, -1 for downvote' },
      },
      required: ['patternId', 'vote'],
    },
  },
  {
    name: 'oracle_top_voted',
    description: 'Get top-voted patterns by community score.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max patterns to return (default: 20)' },
      },
    },
  },
  {
    name: 'oracle_reputation',
    description: 'Get voter reputation profile or top contributors. Actions: check (voter profile), top (leaderboard).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check', 'top'], description: 'Action (default: check)' },
        voter: { type: 'string', description: 'Voter ID for check action' },
        limit: { type: 'number', description: 'Max results for top action (default: 20)' },
      },
    },
  },
  {
    name: 'oracle_transpile',
    description: 'Transpile JavaScript code to another language using the AST-based transpiler. Supports Python, TypeScript, Go, and Rust.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript source code to transpile' },
        targetLanguage: { type: 'string', enum: ['python', 'typescript', 'go', 'rust'], description: 'Target language' },
      },
      required: ['code', 'targetLanguage'],
    },
  },
  {
    name: 'oracle_verify_transpile',
    description: 'Transpile JS code to Go/Rust, generate test code, and verify compilation. Returns transpiled code, generated tests, and compilation status.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript source code' },
        testCode: { type: 'string', description: 'JavaScript test code for the function' },
        targetLanguage: { type: 'string', enum: ['go', 'rust'], description: 'Target language' },
      },
      required: ['code', 'targetLanguage'],
    },
  },
  {
    name: 'oracle_context',
    description: 'Generate an exportable AI system prompt context. Describes available patterns, categories, stats, and usage instructions. Formats: markdown, json, text.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['markdown', 'json', 'text'], description: 'Output format (default: markdown)' },
        maxPatterns: { type: 'number', description: 'Max patterns to include (default: 50)' },
        includeCode: { type: 'boolean', description: 'Include source code in output (default: false)' },
      },
    },
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
        patternId: { type: 'string', description: 'ID of the pattern to transpile' },
        targetLanguage: { type: 'string', description: 'Target language (python, typescript, go, rust, etc.)' },
      },
      required: ['patternId', 'targetLanguage'],
    },
  },
  {
    name: 'oracle_llm_tests',
    description: 'Generate tests for a pattern using Claude. Falls back to static test synthesis if unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'ID of the pattern' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_llm_refine',
    description: 'Refine a pattern using Claude to improve weak coherency dimensions. Falls back to reflection.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'ID of the pattern to refine' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_llm_analyze',
    description: 'Analyze code quality using Claude. Returns issues, suggestions, complexity, and quality score.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to analyze' },
        language: { type: 'string', description: 'Programming language' },
      },
      required: ['code'],
    },
  },
  {
    name: 'oracle_llm_explain',
    description: 'Explain a pattern in plain language using Claude.',
    inputSchema: {
      type: 'object',
      properties: {
        patternId: { type: 'string', description: 'ID of the pattern to explain' },
      },
      required: ['patternId'],
    },
  },
  {
    name: 'oracle_llm_generate',
    description: 'LLM-enhanced candidate generation. Uses Claude for higher-quality variants, falls back to regex/reflection.',
    inputSchema: {
      type: 'object',
      properties: {
        maxPatterns: { type: 'number', description: 'Max source patterns to process (default 10)' },
        languages: { type: 'array', items: { type: 'string' }, description: 'Target languages for variants' },
      },
    },
  },
  // Pattern Composition
  {
    name: 'oracle_compose',
    description: 'Compose multiple patterns into a cohesive module. Accepts pattern names, a template name, or a natural language description.',
    inputSchema: {
      type: 'object',
      properties: {
        patterns: { type: 'array', items: { type: 'string' }, description: 'Pattern names to compose' },
        template: { type: 'string', description: 'Built-in template name (rest-api, auth-service, task-queue, data-pipeline, resilient-service)' },
        describe: { type: 'string', description: 'Natural language description to auto-detect patterns' },
        language: { type: 'string', description: 'Target language (default: javascript)' },
        glue: { type: 'string', enum: ['module', 'class', 'function'], description: 'How to combine patterns (default: module)' },
      },
    },
  },
  {
    name: 'oracle_compose_templates',
    description: 'List available composition templates.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'oracle_mcp_install',
    description: 'Auto-register the oracle MCP server in AI editors (Claude Desktop, Cursor, VS Code, Cline). Returns installation status or performs install/uninstall.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['install', 'uninstall', 'status'], description: 'Action to perform (default: status)' },
        target: { type: 'string', description: 'Specific editor target (claude, cursor, vscode, claudeCode) — omit for all' },
        useNpx: { type: 'boolean', description: 'Use npx instead of direct node path (default: false)' },
      },
    },
  },
  {
    name: 'oracle_github_identity',
    description: 'Manage GitHub identity for verified community voting. Verify a GitHub token, check identity status, or list verified voters.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['verify', 'status', 'check', 'list'], description: 'Action to perform' },
        token: { type: 'string', description: 'GitHub personal access token (for verify action)' },
        voterId: { type: 'string', description: 'Voter ID to check (for check action)' },
      },
      required: ['action'],
    },
  },

  // ─── Auto-Tagging Tools ───
  {
    name: 'oracle_retag',
    description: 'Re-tag a single pattern with aggressive auto-tagging. Enriches existing tags with keywords extracted from code structure, description, domain detection, and concept clusters. Never removes user-provided tags.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Pattern ID to re-tag' },
        dryRun: { type: 'boolean', description: 'Preview new tags without saving (default: false)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'oracle_retag_all',
    description: 'Batch re-tag ALL patterns in the library with aggressive auto-tagging. Enriches every pattern with domain, concept, and code-structure tags for instant future search.',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: { type: 'boolean', description: 'Preview without saving (default: false)' },
      },
    },
  },
  {
    name: 'oracle_auto_tag',
    description: 'Preview what tags the auto-tagger would generate for a given code snippet. Useful for understanding tag extraction before submitting.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to analyze for tags' },
        description: { type: 'string', description: 'Description of the code' },
        language: { type: 'string', description: 'Code language' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Existing user tags to preserve' },
      },
      required: ['code'],
    },
  },

  // ─── Open Source Registry Tools ───
  {
    name: 'oracle_registry_list',
    description: 'List curated open source repositories available for pattern harvesting. Filter by language or topic.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Filter by language (javascript, python, go, rust, typescript)' },
        topic: { type: 'string', description: 'Filter by topic (e.g., algorithm, utility, data-structure)' },
      },
    },
  },
  {
    name: 'oracle_registry_search',
    description: 'Search curated open source repos by keyword. Scores results by name, topic, and description match.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g., "sorting algorithms", "functional utility")' },
        language: { type: 'string', description: 'Filter by language' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_registry_import',
    description: 'Import patterns from a curated open source repo by name. Validates license, harvests code, registers patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Repo name from curated registry (e.g., "lodash", "javascript-algorithms")' },
        language: { type: 'string', description: 'Filter harvested patterns by language' },
        dryRun: { type: 'boolean', description: 'Preview without registering (default: false)' },
        splitMode: { type: 'string', enum: ['file', 'function'], description: 'Split mode for standalone files (default: file)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'oracle_registry_batch',
    description: 'Batch import patterns from multiple curated repos at once. Optionally filter by language.',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', description: 'Import only repos for this language' },
        dryRun: { type: 'boolean', description: 'Preview without registering (default: false)' },
        maxFiles: { type: 'number', description: 'Max files per repo (default: 100)' },
      },
    },
  },
  {
    name: 'oracle_registry_discover',
    description: 'Search GitHub for open source repos by topic, language, and star count. Requires network access.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for GitHub repos' },
        language: { type: 'string', description: 'Filter by programming language' },
        minStars: { type: 'number', description: 'Minimum star count (default: 100)' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'oracle_registry_license',
    description: 'Check if an SPDX license is compatible for pattern harvesting. Categorizes as permissive, weak-copyleft, strong-copyleft, or unknown.',
    inputSchema: {
      type: 'object',
      properties: {
        license: { type: 'string', description: 'SPDX license identifier (e.g., MIT, GPL-3.0, Apache-2.0)' },
        allowCopyleft: { type: 'boolean', description: 'Allow strong copyleft licenses (default: false)' },
      },
      required: ['license'],
    },
  },
  {
    name: 'oracle_registry_provenance',
    description: 'Show provenance (source repo, license, commit) for imported patterns. Filter by source or license.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Filter by source repo name' },
        license: { type: 'string', description: 'Filter by license type' },
      },
    },
  },
  {
    name: 'oracle_registry_duplicates',
    description: 'Find duplicate or near-duplicate patterns across sources. Uses code fingerprinting and token similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Similarity threshold 0-1 (default: 0.85)' },
        language: { type: 'string', description: 'Filter by language' },
      },
    },
  },
];

class MCPServer {
  constructor(oracle) {
    this.oracle = oracle || new RemembranceOracle();
    this._initialized = false;
  }

  async handleRequest(msg) {
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
      return await this._handleToolCall(id, params);
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown method: ${method}` },
    };
  }

  async _handleToolCall(id, params) {
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
            heal: args.heal !== false,
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
            reflectionScore: h.reflectionScore,
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
            methods: args.methods || ['variant', 'iterative-refine', 'approach-swap'],
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

        case 'oracle_smart_promote':
          result = this.oracle.smartAutoPromote({
            minCoherency: args.minCoherency || 0.9,
            minConfidence: args.minConfidence || 0.8,
            manualOverride: args.manualOverride || false,
            dryRun: args.dryRun || false,
          });
          break;

        case 'oracle_security_scan':
          result = this.oracle.securityScan(args.code, {
            language: args.language,
            runExternalTools: args.runExternalTools || false,
          });
          break;

        case 'oracle_security_audit':
          result = this.oracle.securityAudit({ runExternalTools: args.runExternalTools || false });
          break;

        case 'oracle_rollback':
          result = this.oracle.rollback(args.patternId, args.version);
          break;

        case 'oracle_verify':
          result = this.oracle.verifyOrRollback(args.patternId);
          break;

        case 'oracle_healing_stats':
          result = this.oracle.healingStats();
          break;

        case 'oracle_reliability':
          result = this.oracle.patterns.getReliability(args.patternId);
          break;

        case 'oracle_report_bug':
          result = this.oracle.patterns.reportBug(args.patternId, args.description || '');
          break;

        case 'oracle_remote_search':
          result = await this.oracle.remoteSearch(args.query, { language: args.language, limit: args.limit || 20 });
          break;

        case 'oracle_remotes': {
          const act = args.action || 'list';
          if (act === 'add') result = this.oracle.registerRemote(args.url, { name: args.name, token: args.token });
          else if (act === 'remove') result = this.oracle.removeRemote(args.url || args.name);
          else if (act === 'health') result = await this.oracle.checkRemoteHealth();
          else result = this.oracle.listRemotes();
          break;
        }

        case 'oracle_full_search':
          result = await this.oracle.fullFederatedSearch(args.query, { language: args.language, limit: args.limit || 50 });
          break;

        case 'oracle_cross_search':
          result = this.oracle.crossRepoSearch(args.description, { language: args.language, limit: args.limit || 20 });
          break;

        case 'oracle_repos': {
          const action = args.action || 'list';
          if (action === 'discover') result = this.oracle.discoverRepos();
          else if (action === 'add') result = this.oracle.registerRepo(args.path || '.');
          else result = this.oracle.listRepos();
          break;
        }

        case 'oracle_vote':
          result = this.oracle.vote(args.patternId, args.voter || 'anonymous', args.vote);
          break;

        case 'oracle_top_voted':
          result = this.oracle.topVoted(args.limit || 20);
          break;

        case 'oracle_reputation': {
          const act = args.action || 'check';
          if (act === 'top') result = this.oracle.topVoters(args.limit || 20);
          else result = this.oracle.getVoterReputation(args.voter || 'anonymous');
          break;
        }

        case 'oracle_transpile': {
          const { transpile: astTranspile } = require('../core/ast-transpiler');
          result = astTranspile(args.code, args.targetLanguage);
          break;
        }

        case 'oracle_verify_transpile': {
          const { transpile: vtTranspile, generateGoTest, generateRustTest, verifyTranspilation } = require('../core/ast-transpiler');
          const vtResult = vtTranspile(args.code, args.targetLanguage);
          if (!vtResult.success) { result = vtResult; break; }
          const funcMatch = args.code.match(/function\s+(\w+)/);
          const fName = funcMatch ? funcMatch[1] : 'unknown';
          let genTest = null;
          if (args.testCode) {
            genTest = args.targetLanguage === 'go' ? generateGoTest(vtResult.code, args.testCode, fName) : generateRustTest(vtResult.code, args.testCode, fName);
          }
          let verification = null;
          if (genTest) {
            verification = verifyTranspilation(vtResult.code, genTest, args.targetLanguage);
          }
          result = { ...vtResult, generatedTest: genTest, verification };
          break;
        }

        case 'oracle_context':
          result = this.oracle.generateContext({
            format: args.format || 'markdown',
            maxPatterns: args.maxPatterns || 50,
            includeCode: args.includeCode || false,
          });
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

        case 'oracle_llm_status':
          result = { available: this.oracle.isLLMAvailable(), engine: 'claude-bridge' };
          break;

        case 'oracle_llm_transpile':
          result = this.oracle.llmTranspile(args.patternId, args.targetLanguage);
          break;

        case 'oracle_llm_tests':
          result = this.oracle.llmGenerateTests(args.patternId);
          break;

        case 'oracle_llm_refine':
          result = this.oracle.llmRefine(args.patternId);
          break;

        case 'oracle_llm_analyze':
          result = this.oracle.llmAnalyze(args.code, args.language || 'javascript');
          break;

        case 'oracle_llm_explain':
          result = this.oracle.llmExplain(args.patternId);
          break;

        case 'oracle_llm_generate':
          result = this.oracle.llmGenerate({
            maxPatterns: args.maxPatterns || 10,
            languages: args.languages || ['python', 'typescript'],
          });
          break;

        case 'oracle_compose': {
          const { PatternComposer } = require('../patterns/composer');
          const composer = new PatternComposer(this.oracle);
          if (args.template) {
            const tmpl = composer.templates().find(t => t.name === args.template);
            result = tmpl ? composer.compose({ patterns: tmpl.patterns, language: args.language || 'javascript', glue: args.glue || 'module' }) : { error: 'Unknown template' };
          } else if (args.describe) {
            result = composer.composeFromDescription(args.describe, args.language || 'javascript');
          } else if (args.patterns) {
            result = composer.compose({ patterns: args.patterns, language: args.language || 'javascript', glue: args.glue || 'module' });
          } else {
            result = { error: 'Provide patterns, template, or describe' };
          }
          break;
        }

        case 'oracle_compose_templates': {
          const { PatternComposer: PC } = require('../patterns/composer');
          const comp = new PC(this.oracle);
          result = comp.templates();
          break;
        }

        case 'oracle_mcp_install': {
          const mcpInstall = require('../ide/mcp-install');
          const action = args.action || 'status';
          const opts = args.useNpx ? { command: 'npx' } : {};

          if (action === 'status') {
            result = mcpInstall.checkInstallation();
          } else if (action === 'install') {
            result = args.target
              ? mcpInstall.installTo(args.target, opts)
              : mcpInstall.installAll(opts);
          } else if (action === 'uninstall') {
            result = args.target
              ? mcpInstall.uninstallFrom(args.target)
              : mcpInstall.uninstallAll();
          } else {
            result = { error: 'Unknown action. Use install, uninstall, or status.' };
          }
          break;
        }

        case 'oracle_github_identity': {
          const { GitHubIdentity } = require('../auth/github-oauth');
          const sqliteStore = this.oracle.store.getSQLiteStore ? this.oracle.store.getSQLiteStore() : null;
          const ghIdentity = new GitHubIdentity({ store: sqliteStore });
          const action = args.action;

          if (action === 'verify' && args.token) {
            result = await ghIdentity.verifyToken(args.token);
          } else if (action === 'check' && args.voterId) {
            const identity = ghIdentity.getIdentity(args.voterId);
            result = identity ? { verified: true, ...identity } : { verified: false };
          } else if (action === 'list' || action === 'status') {
            result = ghIdentity.listIdentities(50);
          } else {
            result = { error: 'Provide action (verify/check/list) with required params' };
          }
          break;
        }

        // ─── Auto-Tagging Handlers ───

        case 'oracle_retag': {
          result = this.oracle.retag(args.id, { dryRun: args.dryRun || false });
          break;
        }

        case 'oracle_retag_all': {
          result = this.oracle.retagAll({ dryRun: args.dryRun || false });
          break;
        }

        case 'oracle_auto_tag': {
          const { autoTag, tagDiff } = require('../core/auto-tagger');
          const generated = autoTag(args.code, {
            description: args.description || '',
            language: args.language,
            tags: args.tags || [],
          });
          const diff = tagDiff(args.tags || [], generated);
          result = { tags: generated, added: diff.added, kept: diff.kept, total: diff.total };
          break;
        }

        // ─── Open Source Registry Handlers ───

        case 'oracle_registry_list': {
          const { listRegistry } = require('../ci/open-source-registry');
          result = listRegistry({ language: args.language, topic: args.topic });
          break;
        }

        case 'oracle_registry_search': {
          const { searchRegistry } = require('../ci/open-source-registry');
          result = searchRegistry(args.query, { language: args.language, limit: args.limit || 10 });
          break;
        }

        case 'oracle_registry_import': {
          const { batchImport, getRegistryEntry, checkLicense } = require('../ci/open-source-registry');
          const entry = getRegistryEntry(args.name);
          if (!entry) { result = { error: `"${args.name}" not found in registry` }; break; }
          const licCheck = checkLicense(entry.license);
          if (!licCheck.allowed) { result = { error: `License blocked: ${entry.license} — ${licCheck.reason}` }; break; }
          result = batchImport(this.oracle, [args.name], {
            language: args.language, dryRun: args.dryRun || false,
            splitMode: args.splitMode || 'file', skipLicenseCheck: true,
          });
          break;
        }

        case 'oracle_registry_batch': {
          const { listRegistry: listRegs, batchImport: batchImp } = require('../ci/open-source-registry');
          const repos = listRegs({ language: args.language });
          const names = repos.map(r => r.name);
          result = batchImp(this.oracle, names, {
            language: args.language, dryRun: args.dryRun || false,
            maxFiles: args.maxFiles || 100,
          });
          break;
        }

        case 'oracle_registry_discover': {
          const { discoverReposSync } = require('../ci/open-source-registry');
          result = discoverReposSync(args.query, {
            language: args.language, minStars: args.minStars || 100, limit: args.limit || 10,
          });
          break;
        }

        case 'oracle_registry_license': {
          const { checkLicense: checkLic } = require('../ci/open-source-registry');
          result = checkLic(args.license, { allowCopyleft: args.allowCopyleft || false });
          break;
        }

        case 'oracle_registry_provenance': {
          const { getProvenance: getProv } = require('../ci/open-source-registry');
          result = getProv(this.oracle, { source: args.source, license: args.license });
          break;
        }

        case 'oracle_registry_duplicates': {
          const { findDuplicates: findDups } = require('../ci/open-source-registry');
          result = findDups(this.oracle, { threshold: args.threshold || 0.85, language: args.language });
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

  rl.on('line', async (line) => {
    try {
      const msg = safeJsonParse(line.trim(), null);
      if (!msg) throw new Error('Invalid JSON');
      const response = await server.handleRequest(msg);
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
