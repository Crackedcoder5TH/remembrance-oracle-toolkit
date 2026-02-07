# Remembrance Oracle Toolkit

**Code memory that only stores proven code.** Every pattern passes validation, coherency scoring, and the Covenant filter before it earns a place in the library. Query it from any AI, CLI, or API — get back the most relevant, highest-quality code ranked on a 0-1 scale.

```bash
npx remembrance-oracle-toolkit search "binary search"
```

## Quick Start

### Install

```bash
npm install -g remembrance-oracle-toolkit
```

Or use directly:

```bash
npx remembrance-oracle-toolkit help
```

### 30-Second Tour

```bash
# Seed the library with 200+ proven patterns
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

Connect from any MCP-compatible AI client. 13 tools available:

| Tool | Description |
|------|-------------|
| `oracle_search` | Search patterns by query |
| `oracle_resolve` | Smart pull/evolve/generate decision |
| `oracle_submit` | Submit code for validation |
| `oracle_reflect` | SERF reflection loop |
| `oracle_covenant` | Covenant harm filter |
| `oracle_harvest` | Bulk harvest from directories |
| `oracle_register_pattern` | Register a named pattern |
| `oracle_feedback` | Report if code worked |
| `oracle_stats` | Store statistics |
| `oracle_nearest` | Nearest semantic terms |
| `oracle_versions` | Pattern version history |
| `oracle_semantic_diff` | Structural diff between patterns |
| `oracle_query` | Query stored entries |

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

Formula: `SERF(n+1) = I_AM + r_eff * Re[projection / (|overlap|² + ε)] + δ_canvas * exploration`

## CLI Reference

```
Commands:
  submit       Submit code for validation and storage
  query        Query for relevant, proven code
  search       Fuzzy search across patterns and history
  resolve      Smart retrieval — pull, evolve, or generate
  validate     Validate code without storing
  register     Register code as a named pattern
  patterns     Show pattern library statistics
  stats        Show store statistics
  seed         Seed library with built-in proven patterns
  reflect      SERF reflection loop — heal and refine code
  covenant     Check code against the Covenant seal
  analytics    Pattern analytics and health report
  harvest      Bulk harvest patterns from a repo or directory
  hooks        Install git hooks (pre-commit covenant, post-commit seed)
  import       Import patterns from exported JSON
  export       Export top patterns as JSON or markdown
  deploy       Start production server (env-configurable)
  dashboard    Start web dashboard (default port 3333)
  mcp          Start MCP server (JSON-RPC over stdio)
  diff         Compare two entries side by side
  sdiff        Semantic diff between two patterns
  versions     Show version history for a pattern
  users        Manage users (list, add, delete)
  audit        View append-only audit log
  nearest      Find nearest semantic vocabulary terms
  compose      Create composed pattern from components
  deps         Show dependency tree for a pattern

Pipe support:
  cat code.js | oracle submit --language javascript
  cat code.js | oracle validate --json
  cat code.js | oracle reflect | oracle submit
  cat code.js | oracle covenant --json
```

## Pattern Library

The library ships with 200+ proven, tested patterns across 5 languages:

| Language | Patterns | Categories |
|----------|----------|------------|
| JavaScript | 85+ | Algorithms, data structures, utilities, async, web |
| TypeScript | 33+ | Type guards, generics, branded types, patterns |
| Python | 37+ | Decorators, generators, comprehensions, stdlib |
| Go | 29+ | Channels, sync, error handling, generics |
| Rust | 24+ | Iterators, traits, error handling, smart pointers |

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
    seeds.js             — 200+ built-in proven patterns
  store/
    sqlite.js            — SQLite storage (WAL mode, schema v3)
    history.js           — Verified history store
  mcp/server.js          — MCP server (13 tools, JSON-RPC 2.0)
  dashboard/server.js    — Web dashboard + API + WebSocket
  auth/auth.js           — Token + API key auth (3 roles)
  ci/
    feedback.js          — CI feedback tracking
    auto-seed.js         — Auto-discover patterns from test suites
    harvest.js           — Bulk GitHub/directory harvester
    hooks.js             — Git hook integration
  deploy.js              — Production server entry point
  cli.js                 — CLI interface (30+ commands)
tests/                   — 410+ tests across 19 files
```

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
node --test tests/*.test.js   # 410+ tests
```

## License

MIT
