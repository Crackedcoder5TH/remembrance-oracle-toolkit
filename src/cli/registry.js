'use strict';

/**
 * Command registry — single source of truth for CLI commands.
 * Used by showHelp() and for validation that all handlers are documented.
 */

const CATEGORIES = [
  {
    name: 'Core',
    commands: [
      { name: 'submit', description: 'Submit code for validation and storage' },
      { name: 'query', description: 'Query for relevant, proven code' },
      { name: 'search', description: 'Fuzzy search across patterns and history' },
      { name: 'smart-search', description: 'Intent-aware search with typo correction + ranking' },
      { name: 'resolve', description: 'Smart retrieval — pull, evolve, or generate decision' },
      { name: 'validate', description: 'Validate code without storing' },
      { name: 'register', description: 'Register code as a named pattern in the library' },
      { name: 'feedback', description: 'Report if pulled code worked' },
      { name: 'inspect', description: 'Inspect a stored entry' },
      { name: 'init', description: 'Initialize oracle in current project', alias: 'setup' },
    ],
  },
  {
    name: 'Library',
    commands: [
      { name: 'patterns', description: 'Show pattern library statistics' },
      { name: 'stats', description: 'Show store statistics' },
      { name: 'seed', description: 'Seed the library with built-in + native patterns' },
      { name: 'analytics', description: 'Show pattern analytics and library health report' },
      { name: 'candidates', description: 'List candidate patterns (coherent but unproven)' },
      { name: 'generate', description: 'Generate candidates from proven patterns' },
      { name: 'promote', description: 'Promote a candidate to proven with test proof' },
      { name: 'synthesize', description: 'Synthesize tests for candidates and auto-promote' },
      { name: 'bug-report', description: 'Generate a diagnostic bug report' },
    ],
  },
  {
    name: 'Quality',
    commands: [
      { name: 'covenant', description: 'Check code against the Covenant seal' },
      { name: 'reflect', description: 'Reflection loop — heal and refine code' },
      { name: 'harvest', description: 'Bulk harvest patterns from a repo or directory' },
      { name: 'compose', description: 'Create a composed pattern from existing components' },
      { name: 'deps', description: 'Show dependency tree for a pattern' },
      { name: 'recycle', description: 'Recycle failures and generate variants' },
      { name: 'retag', description: 'Re-run auto-tagger on a pattern or all patterns' },
      { name: 'security-scan', description: 'Scan code for security vulnerabilities' },
      { name: 'security-audit', description: 'Audit stored patterns for security issues' },
    ],
  },
  {
    name: 'Open Source Registry',
    commands: [
      { name: 'registry list', description: 'List curated open source repos (--language, --topic)' },
      { name: 'registry search', description: 'Search curated repos by topic or keyword' },
      { name: 'registry import', description: 'Import patterns from a curated repo by name' },
      { name: 'registry batch', description: 'Batch import from multiple repos at once' },
      { name: 'registry discover', description: 'Search GitHub for repos by topic/stars/language' },
      { name: 'registry license', description: 'Check license compatibility for a repo' },
      { name: 'registry provenance', description: 'Show provenance (source/license) for imported patterns' },
      { name: 'registry duplicates', description: 'Find duplicate patterns across sources' },
    ],
  },
  {
    name: 'Federation',
    commands: [
      { name: 'cloud', description: 'Start cloud server for remote federation' },
      { name: 'remote', description: 'Manage remote oracle connections' },
      { name: 'repos', description: 'Manage local repo index' },
      { name: 'cross-search', description: 'Search across all remotes' },
      { name: 'sync', description: 'Sync patterns with personal store' },
      { name: 'share', description: 'Share patterns to community store' },
      { name: 'community', description: 'Browse/pull community patterns' },
      { name: 'global', description: 'Show combined global store statistics' },
      { name: 'nearest', description: 'Find nearest semantic vocabulary terms' },
      { name: 'dedup', description: 'Deduplicate patterns across stores' },
    ],
  },
  {
    name: 'Voting & Identity',
    commands: [
      { name: 'vote', description: 'Vote on a pattern (--id <id> --score 1-5)' },
      { name: 'top-voted', description: 'Show top-voted patterns' },
      { name: 'reputation', description: 'View/manage contributor reputation' },
      { name: 'github', description: 'Link GitHub identity for verified voting' },
    ],
  },
  {
    name: 'Transpiler & AI',
    commands: [
      { name: 'transpile', description: 'Transpile pattern to another language' },
      { name: 'verify-transpile', description: 'Verify a transpiled pattern matches original' },
      { name: 'context', description: 'Export AI context for a pattern' },
      { name: 'llm', description: 'Claude LLM engine — transpile/test/refine/analyze/explain' },
    ],
  },
  {
    name: 'Self-Management',
    commands: [
      { name: 'maintain', description: 'Full maintenance cycle: heal, promote, optimize, evolve (replaces evolve/improve/optimize/full-cycle)' },
      { name: 'consolidate', description: 'Consolidate duplicates, tags, and candidates (--dry-run)' },
      { name: 'polish', description: 'Full polish cycle: consolidate + improve + optimize + evolve' },
      { name: 'lifecycle', description: 'Always-on lifecycle engine (start, stop, status, run, history)' },
    ],
  },
  {
    name: 'Debug',
    commands: [
      { name: 'debug', description: 'Debug oracle — capture/search/grow error\u2192fix patterns' },
      { name: 'reliability', description: 'Pattern reliability statistics' },
    ],
  },
  {
    name: 'Integration',
    commands: [
      { name: 'mcp', description: 'Start MCP server (JSON-RPC over stdio, 23 tools)' },
      { name: 'mcp-install', description: 'Auto-register MCP in AI editors (Claude, Cursor, VS Code)' },
      { name: 'setup', description: 'Initialize oracle in current project', alias: 'init' },
      { name: 'dashboard', description: 'Start web dashboard (default port 3333) [auth]' },
      { name: 'deploy', description: 'Start production-ready server (configurable via env vars) [auth]' },
      { name: 'hooks', description: 'Install/uninstall git hooks' },
      { name: 'plugin', description: 'Manage plugins (load, list, unload)' },
    ],
  },
  {
    name: 'Admin',
    commands: [
      { name: 'users', description: 'Manage users (list, add, delete)' },
      { name: 'audit', description: 'View append-only audit log' },
      { name: 'prune', description: 'Remove low-coherency entries' },
      { name: 'deep-clean', description: 'Remove duplicates, stubs, and trivial patterns' },
      { name: 'rollback', description: 'Rollback a pattern to a previous version' },
      { name: 'import', description: 'Import patterns from exported JSON' },
      { name: 'export', description: 'Export top patterns as JSON or markdown' },
      { name: 'diff', description: 'Compare two entries side by side' },
      { name: 'sdiff', description: 'Semantic diff between two patterns' },
      { name: 'versions', description: 'Show version history for a pattern' },
      { name: 'verify', description: 'Verify pattern integrity' },
      { name: 'healing-stats', description: 'Show SERF healing statistics' },
      { name: 'auto-seed', description: 'Auto-discover and seed patterns from test suite' },
      { name: 'ci-feedback', description: 'Report CI test results' },
      { name: 'ci-stats', description: 'Show CI feedback tracking statistics' },
      { name: 'ci-track', description: 'Track CI pipeline for a pattern' },
    ],
  },
];

const OPTIONS = [
  { flag: '--file', arg: '<path>', description: 'Code file to submit/validate/register' },
  { flag: '--test', arg: '<path>', description: 'Test file for validation' },
  { flag: '--name', arg: '<name>', description: 'Pattern name (for register)' },
  { flag: '--description', arg: '<text>', description: 'Description for query/submit/resolve' },
  { flag: '--tags', arg: '<comma,list>', description: 'Tags for query/submit/resolve' },
  { flag: '--language', arg: '<lang>', description: 'Language filter' },
  { flag: '--id', arg: '<id>', description: 'Entry ID for inspect/feedback' },
  { flag: '--success', arg: '', description: 'Mark feedback as successful' },
  { flag: '--failure', arg: '', description: 'Mark feedback as failed' },
  { flag: '--min-coherency', arg: '<n>', description: 'Minimum coherency threshold' },
  { flag: '--limit', arg: '<n>', description: 'Max results for query' },
  { flag: '--json', arg: '', description: 'Output as JSON (pipe-friendly)' },
  { flag: '--no-color', arg: '', description: 'Disable colored output' },
  { flag: '--mode', arg: '<hybrid|semantic>', description: 'Search mode (default: hybrid)' },
  { flag: '--status', arg: '<pass|fail>', description: 'CI test result for ci-feedback' },
];

const PIPE_EXAMPLES = [
  'cat code.js | oracle submit --language javascript',
  'cat code.js | oracle validate --json',
  'cat code.js | oracle reflect | oracle submit',
  'cat code.js | oracle covenant --json',
];

/**
 * Generate help text from the registry.
 * @param {object} c - Color helper object from cli/colors.js
 * @returns {string} Formatted help text
 */
function generateHelp(c) {
  const lines = ['', c.boldCyan('Remembrance Oracle Toolkit'), ''];

  // Compute max command name width for alignment
  let maxName = 0;
  for (const cat of CATEGORIES) {
    for (const cmd of cat.commands) {
      const display = cmd.alias ? `${cmd.name}` : cmd.name;
      if (display.length > maxName) maxName = display.length;
    }
  }
  const pad = maxName + 2; // 2 spaces after longest name

  // Commands by category
  for (const cat of CATEGORIES) {
    lines.push(c.bold(`${cat.name}:`));
    for (const cmd of cat.commands) {
      const nameStr = c.cyan(cmd.name);
      const padding = ' '.repeat(Math.max(1, pad - cmd.name.length));
      const aliasStr = cmd.alias ? ` ${c.dim(`(alias: ${cmd.alias})`)}` : '';
      lines.push(`  ${nameStr}${padding}${cmd.description}${aliasStr}`);
    }
    lines.push('');
  }

  // Options
  lines.push(c.bold('Options:'));
  let maxFlag = 0;
  for (const opt of OPTIONS) {
    const full = opt.arg ? `${opt.flag} ${opt.arg}` : opt.flag;
    if (full.length > maxFlag) maxFlag = full.length;
  }
  const optPad = maxFlag + 2;
  for (const opt of OPTIONS) {
    const full = opt.arg ? `${c.yellow(opt.flag)} ${opt.arg}` : c.yellow(opt.flag);
    const rawLen = opt.arg ? `${opt.flag} ${opt.arg}`.length : opt.flag.length;
    const oPad = ' '.repeat(Math.max(1, optPad - rawLen));
    lines.push(`  ${full}${oPad}${opt.description}`);
  }
  lines.push('');

  // Pipe examples
  lines.push(c.bold('Pipe support:'));
  for (const ex of PIPE_EXAMPLES) {
    lines.push(`  ${c.dim(ex)}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Get a flat list of all command names (including aliases).
 * Useful for validation against registered handlers.
 */
function getAllCommandNames() {
  const names = new Set();
  for (const cat of CATEGORIES) {
    for (const cmd of cat.commands) {
      const base = cmd.name.split(' ')[0]; // 'registry list' → 'registry'
      names.add(base);
      if (cmd.alias) names.add(cmd.alias);
    }
  }
  return names;
}

module.exports = { CATEGORIES, OPTIONS, PIPE_EXAMPLES, generateHelp, getAllCommandNames };
