/**
 * MCP Tool Definitions
 *
 * 12 focused tools (down from 55+).
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
      required: ['query'],
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

  // ─── 7. Debug (unified: capture + search + feedback + stats + grow + patterns) ───
  {
    name: 'oracle_debug',
    description: 'Debug oracle — manage error→fix patterns. Actions: capture (save error→fix), search (find fixes), feedback (report fix result), stats (debug statistics), grow (generate variants), patterns (list all).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['capture', 'search', 'feedback', 'stats', 'grow', 'patterns'], description: 'Debug action to perform' },
        errorMessage: { type: 'string', description: 'Error message (for capture/search)' },
        stackTrace: { type: 'string', description: 'Stack trace (for capture/search)' },
        fixCode: { type: 'string', description: 'Fix code (for capture)' },
        fixDescription: { type: 'string', description: 'Fix description (for capture)' },
        language: { type: 'string', description: 'Programming language' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags (for capture)' },
        id: { type: 'string', description: 'Debug pattern ID (for feedback)' },
        resolved: { type: 'boolean', description: 'Whether the fix resolved the error (for feedback)' },
        limit: { type: 'number', description: 'Max results (for search/grow/patterns)' },
        errorClass: { type: 'string', description: 'Error class filter (for patterns)' },
        federated: { type: 'boolean', description: 'Search all tiers (for search, default: true)' },
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
];

module.exports = { TOOLS };
