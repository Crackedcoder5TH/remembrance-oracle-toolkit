# Remembrance Oracle Toolkit

**Code memory that only stores proven code.** Every pattern passes validation, coherency scoring, and the Covenant filter before it earns a place in the library. Query it from any AI, CLI, or API — get back the most relevant, highest-quality code ranked on a 0-1 scale.

```bash
npx remembrance-oracle-toolkit search "binary search"
```

> **New to the oracle?** Read the [30-Second Quickstart](QUICKSTART.md) to be running in under a minute.

## Quick Start

```bash
npm install -g remembrance-oracle-toolkit
oracle seed                    # Load 600+ proven patterns
oracle search "rate limiting"  # Find code
oracle submit --file mycode.js --test mytest.js  # Store proven code
```

Or without installing:

```bash
npx remembrance-oracle-toolkit search "binary search"
```

### TypeScript Support

Full type definitions ship with the package:

```typescript
import { RemembranceOracle, Pattern, ValidationResult } from 'remembrance-oracle-toolkit';
const oracle = new RemembranceOracle({ threshold: 0.7 });
```

### 30-Second Tour

```bash
# Seed the library with 600+ proven patterns
oracle seed

# Search for code
oracle search "rate limiting" --mode semantic

# Submit your own code (must prove itself)
oracle submit --file mycode.js --test mytest.js --tags "sort,algorithm"

# Pipe code through the Covenant filter
cat mycode.js | oracle covenant --json

# Heal code with SERF reflection
cat mycode.js | oracle reflect --output healed.js

# Start the web dashboard
oracle dashboard

# Start the production server
PORT=8080 oracle deploy
```

### As a Node.js Library

```javascript
const { RemembranceOracle } = require('remembrance-oracle-toolkit');

const oracle = new RemembranceOracle();

// Submit code — it must prove itself
const result = oracle.submit('function add(a, b) { return a + b; }', {
  description: 'Add two numbers',
  tags: ['math', 'utility'],
  language: 'javascript',
  testCode: 'if (add(2, 3) !== 5) throw new Error("FAIL");',
});

// Query — get ranked, proven code
const results = oracle.search('math utility', { mode: 'semantic', limit: 5 });

// Smart retrieval — pull, evolve, or generate
const decision = oracle.resolve({
  description: 'sorting function',
  language: 'javascript',
});
// → { decision: 'PULL', pattern: { name: 'merge-sort', code: '...', coherency: 0.925 } }
```

### As an MCP Server (for AI Agents)

```bash
# Start the MCP server (JSON-RPC 2.0 over stdio)
oracle mcp
```

Connect from any MCP-compatible AI client. 59 tools across 13 categories:

| Category | Tools | Description |
|----------|-------|-------------|
| **Core** | `oracle_search`, `oracle_resolve`, `oracle_submit`, `oracle_query`, `oracle_feedback`, `oracle_stats`, `oracle_register_pattern`, `oracle_nearest`, `oracle_smart_search` | Search, submit, resolve, and track patterns |
| **Versioning** | `oracle_versions`, `oracle_semantic_diff`, `oracle_rollback`, `oracle_verify` | Version history and structural diffing |
| **Reflection** | `oracle_reflect`, `oracle_covenant`, `oracle_harvest`, `oracle_compose`, `oracle_compose_templates` | SERF healing, harm filter, harvesting |
| **Candidates** | `oracle_candidates`, `oracle_generate`, `oracle_promote`, `oracle_auto_promote`, `oracle_smart_promote`, `oracle_synthesize_tests` | Candidate lifecycle and promotion |
| **Security** | `oracle_security_scan`, `oracle_security_audit` | Vulnerability scanning |
| **Federation** | `oracle_remote_search`, `oracle_remotes`, `oracle_full_search`, `oracle_cross_search`, `oracle_repos` | Multi-server remote search |
| **Voting** | `oracle_vote`, `oracle_top_voted`, `oracle_reputation` | Community pattern voting |
| **Storage** | `oracle_sync`, `oracle_share`, `oracle_community`, `oracle_global_stats` | Three-tier storage management |
| **Debug** | `oracle_debug_capture`, `oracle_debug_search`, `oracle_debug_feedback`, `oracle_debug_grow`, `oracle_debug_stats`, `oracle_debug_share` | Error→fix pattern database |
| **LLM** | `oracle_llm_status`, `oracle_llm_transpile`, `oracle_llm_tests`, `oracle_llm_refine`, `oracle_llm_analyze`, `oracle_llm_explain`, `oracle_llm_generate` | Claude AI integration |
| **Transpiler** | `oracle_transpile`, `oracle_verify_transpile`, `oracle_context` | Cross-language transpilation |
| **Reliability** | `oracle_healing_stats`, `oracle_reliability`, `oracle_report_bug` | Healing and bug tracking |
| **Integration** | `oracle_mcp_install`, `oracle_github_identity` | IDE setup and GitHub identity |

### As a GitHub Action

```yaml
- uses: Crackedcoder5TH/remembrance-oracle-toolkit@main
  with:
    command: submit
    file: src/mycode.js
    test-file: tests/mycode.test.js
    description: "Sorting algorithm"
    tags: "sort,algorithm"
```

## How It Works

```
Code In → Covenant Filter → Validation → Coherency Scoring → Storage
              ↓ reject           ↓ reject         ↓ score < threshold
          harmful code      broken code        low-quality code
```

### Coherency Scoring (0-1)

Every piece of code is scored across 5 dimensions:

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Syntax validity | 25% | Does it parse correctly? |
| Completeness | 20% | No TODOs, stubs, or placeholders? |
| Consistency | 15% | Clean indentation, naming conventions? |
| Test proof | 30% | Did it pass actual tests? |
| Historical reliability | 10% | How often has it worked when used? |

### The Covenant (15 Principles)

Before coherency scoring, all code passes through the Covenant filter — 15 principles that reject harmful patterns:

```bash
oracle covenant list
```

Includes protection against: SQL injection, command injection, XSS, credential exposure, infinite loops, resource exhaustion, and more.

### SERF Reflection Loop

Iteratively refines code through 6 transforms (simplify, secure, readable, unify, correct, heal), scoring each on 5 dimensions until coherence exceeds 0.9:

```bash
oracle reflect --file code.js --loops 3 --target 0.9
```

## CLI Reference

```
Core:
  submit        Submit code for validation and storage
  query         Query for relevant, proven code
  search        Fuzzy search across patterns and history
  smart-search  Intent-aware search with typo correction + ranking
  resolve       Smart retrieval — pull, evolve, or generate
  validate      Validate code without storing
  register      Register code as a named pattern
  feedback      Report if pulled code worked
  inspect       Inspect a stored entry

Library:
  patterns      Show pattern library statistics
  stats         Show store statistics
  seed          Seed the library with built-in + native patterns
  analytics     Pattern analytics and health report
  candidates    List candidate patterns (coherent but unproven)
  generate      Generate candidates from proven patterns
  promote       Promote a candidate to proven with test proof
  synthesize    Synthesize tests for candidates and auto-promote

Quality:
  covenant      Check code against the Covenant seal
  reflect       SERF reflection loop — heal and refine code
  harvest       Bulk harvest patterns from a repo or directory
  compose       Create composed pattern from components
  deps          Show dependency tree for a pattern
  recycle       Recycle failures and generate variants

Federation:
  cloud         Start cloud server for remote federation
  remote        Manage remote oracle connections
  cross-search  Search across all remotes
  sync          Sync patterns with personal store
  share         Share patterns to community store
  community     Browse/pull community patterns
  global        Show combined global store statistics

Voting & Identity:
  vote          Vote on a pattern (--id <id> --score 1-5)
  top-voted     Show top-voted patterns
  reputation    View/manage contributor reputation
  github        Link GitHub identity for verified voting

Transpiler & AI:
  transpile     Transpile pattern to another language
  context       Export AI context for a pattern
  llm           Claude LLM engine (transpile/test/refine/analyze/explain)

Debug:
  debug         Debug oracle — capture/search/grow error→fix patterns
  reliability   Pattern reliability statistics

Integration:
  mcp           Start MCP server (59 tools, JSON-RPC over stdio)
  mcp-install   Auto-register MCP in AI editors (Claude, Cursor, VS Code)
  setup         Initialize oracle in current project
  dashboard     Start web dashboard (default port 3333)
  deploy        Start production server (env-configurable)
  hooks         Install git hooks (pre-commit covenant, post-commit seed)

Admin:
  users         Manage users (list, add, delete)
  audit         View append-only audit log
  prune         Remove low-coherency entries
  deep-clean    Remove duplicates, stubs, and trivial patterns
  rollback      Rollback a pattern to a previous version
  import        Import patterns from exported JSON
  export        Export top patterns as JSON or markdown
  diff          Compare two entries side by side
  sdiff         Semantic diff between two patterns
  versions      Show version history for a pattern
  nearest       Find nearest semantic vocabulary terms

Pipe support:
  cat code.js | oracle submit --language javascript
  cat code.js | oracle validate --json
  cat code.js | oracle reflect | oracle submit
  cat code.js | oracle covenant --json
```

## Pattern Library

The library ships with 600+ proven, tested patterns across 5 languages:

| Language | Patterns | Categories |
|----------|----------|------------|
| JavaScript | 390+ | Algorithms, data structures, utilities, async, web |
| TypeScript | 150+ | Type guards, generics, branded types, patterns |
| Python | 20+ | Decorators, generators, comprehensions, stdlib, native |
| Rust | 12+ | Iterators, traits, error handling, smart pointers, native |
| Go | 10+ | Channels, sync, error handling, generics, native |

Grow it further:

```bash
# Harvest from any local project
oracle harvest /path/to/project --split function

# Auto-discover patterns from test suites
oracle auto-seed --dir /path/to/project

# Import from exported JSON
oracle import --file patterns.json
```

## Web Dashboard

```bash
oracle dashboard --port 3333
```

Tabs: **Patterns** | **Search** | **History** | **Vectors** | **Analytics** | **Audit Log**

Features:
- Real-time WebSocket updates
- Semantic vector visualization
- Coherency distribution charts
- Tag cloud and language breakdown
- Pattern health monitoring

## Production Deployment

```bash
# Configure via environment variables
PORT=8080 \
HOST=0.0.0.0 \
AUTH=true \
LOG=true \
RATE_LIMIT=true \
RATE_MAX=100 \
oracle deploy
```

Or use the deploy script directly:

```bash
PORT=8080 node src/deploy.js
```

Features: graceful shutdown, rate limiting, auth (token + API key), CORS, request logging.

## Git Hooks

```bash
# Install pre-commit (covenant check) + post-commit (auto-seed)
oracle hooks install

# Run manually
oracle hooks run pre-commit
```

The pre-commit hook blocks any staged file that violates the Covenant. The post-commit hook auto-discovers and seeds patterns from your committed code.

## Architecture

```
src/
  api/oracle.js          — Main Oracle API (submit, query, resolve, feedback, import, export)
  core/
    coherency.js         — Coherency scoring engine (5 dimensions)
    validator.js         — Code validation (Covenant → tests → coherency)
    relevance.js         — TF-IDF relevance matching + ranking
    covenant.js          — 15-principle harm filter (Step 0)
    reflection.js        — SERF infinite reflection loop (6 transforms)
    analytics.js         — Pattern analytics and health reports
    vectors.js           — Word vector embeddings (186 terms, 32 dims)
    embeddings.js        — Concept clusters for semantic search
    websocket.js         — RFC 6455 WebSocket server
    versioning.js        — Snapshot history + semantic diffing
    sandbox.js           — Sandboxed code execution
  patterns/
    library.js           — Pattern library (decision engine + composition)
    seeds.js             — 100+ built-in JS/TS patterns + native seeds loader
    seeds-python.js      — 10 idiomatic Python patterns
    seeds-go.js          — 8 idiomatic Go patterns
    seeds-rust.js        — 8 idiomatic Rust patterns
  store/
    sqlite.js            — SQLite storage (WAL mode, schema v3)
    history.js           — Verified history store
  mcp/server.js          — MCP server (59 tools, JSON-RPC 2.0)
  dashboard/server.js    — Web dashboard + API + WebSocket
  auth/auth.js           — Token + API key auth (3 roles)
  ci/
    feedback.js          — CI feedback tracking
    auto-seed.js         — Auto-discover patterns from test suites
    harvest.js           — Bulk GitHub/directory harvester
    hooks.js             — Git hook integration
  deploy.js              — Production server entry point
  cloud/server.js        — Cloud federation server (HTTP + WebSocket + JWT)
  cloud/client.js        — Remote oracle client
  ide/mcp-install.js     — Auto-register MCP in AI editors
  auth/github-oauth.js   — GitHub OAuth identity verification
  core/debug-oracle.js   — Debug pattern database (capture→search→grow)
  core/persistence.js    — Three-tier storage (local/personal/community)
  core/recycler.js       — Exponential variant generation
  core/test-synth.js     — Test synthesis for candidate promotion
  connectors/
    github-bridge.js     — GitHub issue/PR integration
  plugins/manager.js     — Plugin system (hooks, lifecycle, isolation)
  health/monitor.js      — Health checks + metrics collection
  cli.js                 — CLI interface (66+ commands)
tests/                   — 1228+ tests across 38 files
types/index.d.ts         — Full TypeScript type definitions
```

## Plugin System

Extend the oracle with custom plugins:

```javascript
// my-plugin.js
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  activate(context) {
    // Hook into the submit pipeline
    context.hooks.onBeforeSubmit((code, metadata) => {
      context.logger.info(`Submitting: ${metadata.description}`);
    });

    // Hook into validation
    context.hooks.onAfterValidate((result) => {
      if (!result.valid) {
        context.logger.warn(`Validation failed: ${result.errors.join(', ')}`);
      }
    });

    // Modify search results
    context.hooks.onSearch((query, results) => {
      return results.filter(r => r.coherencyScore?.total > 0.8);
    });
  }
};
```

```bash
# Load a plugin
oracle plugin load ./my-plugin.js

# List plugins
oracle plugin list

# Unload a plugin
oracle plugin unload my-plugin
```

From code:

```javascript
const { RemembranceOracle, PluginManager } = require('remembrance-oracle-toolkit');
const oracle = new RemembranceOracle();
const plugins = new PluginManager(oracle);
plugins.load('./my-plugin.js');
```

Available hooks: `onBeforeSubmit`, `onAfterSubmit`, `onBeforeValidate`, `onAfterValidate`, `onPatternRegistered`, `onCandidateGenerated`, `onSearch`, `onResolve`.

## Health & Metrics

The dashboard exposes health and metrics endpoints:

```bash
# Health check
curl http://localhost:3333/api/health

# Metrics snapshot
curl http://localhost:3333/api/metrics
```

```json
{
  "status": "healthy",
  "version": "3.1.0",
  "uptime": 3600,
  "checks": {
    "database": { "status": "ok", "latencyMs": 2 },
    "patterns": { "status": "ok", "count": 892 },
    "coherency": { "status": "ok", "avgScore": 0.82 }
  }
}
```

Metrics include: pattern counts by language/type, coherency distribution, usage tracking, candidate promotion rates, and uptime.

## Storage

All data lives in `.remembrance/` (SQLite with WAL mode, JSON fallback):

```
.remembrance/
  oracle.db              — SQLite database (patterns, entries, audit log)
  verified-history.json  — JSON fallback store
```

## Requirements

- **Node.js 22+** (uses built-in `node:sqlite`)
- Zero external dependencies

## Running Tests

```bash
node --test tests/*.test.js   # 1228+ tests
```

## License

MIT
