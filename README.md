# Remembrance Oracle Toolkit

**Attach this to your AI coding tool. It gives the AI a library of proven patterns instead of generating from scratch. Your code gets better over time without you doing anything.**

```bash
npx remembrance-oracle-toolkit init
```

That single command sets up everything: loads 600+ proven patterns, installs git hooks, syncs your personal library, and connects to the debug oracle. No configuration needed.

## Why This Exists

Every time an AI generates code, it starts from zero. The same sorting function, the same debounce, the same rate limiter — written fresh each time, with fresh bugs each time.

The oracle remembers. It stores only code that has **passed tests, passed security checks, and scored above a quality threshold**. When your AI needs a pattern, it pulls proven code instead of guessing.

The library grows automatically. Every commit is analyzed. Code that passes validation earns a place. Over time, your AI gets access to a growing library of code that has actually worked.

## For AI Agents (MCP)

The primary interface is MCP (Model Context Protocol). One line connects your AI tool:

```bash
oracle mcp
```

### Auto-configure your AI tool

```bash
oracle mcp-install          # Detects and configures all installed AI tools
oracle mcp-install claude   # Claude Desktop only
oracle mcp-install cursor   # Cursor only
oracle mcp-install vscode   # VS Code only
```

### Config snippets for manual setup

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `~/.config/Claude/claude_desktop_config.json` (Linux):

```json
{
  "mcpServers": {
    "remembrance-oracle": {
      "command": "npx",
      "args": ["-y", "remembrance-oracle-toolkit", "mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "remembrance-oracle": {
      "command": "npx",
      "args": ["-y", "remembrance-oracle-toolkit", "mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>VS Code (Copilot / Continue / Cline)</strong></summary>

Add to `.vscode/mcp.json` in your project:

```json
{
  "mcpServers": {
    "remembrance-oracle": {
      "command": "npx",
      "args": ["-y", "remembrance-oracle-toolkit", "mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "remembrance-oracle": {
      "command": "npx",
      "args": ["-y", "remembrance-oracle-toolkit", "mcp"]
    }
  }
}
```
</details>

<details>
<summary><strong>Claude Code</strong></summary>

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "remembrance-oracle": {
      "command": "npx",
      "args": ["-y", "remembrance-oracle-toolkit", "mcp"]
    }
  }
}
```
</details>

### MCP Tools (12)

| Tool | What it does |
|------|-------------|
| `oracle_search` | Find proven patterns (basic, semantic, or structured query) |
| `oracle_resolve` | Smart retrieval — tells the AI to PULL, EVOLVE, or GENERATE |
| `oracle_submit` | Submit code for validation and storage |
| `oracle_register` | Register a named pattern in the library |
| `oracle_feedback` | Report whether pulled code worked (improves rankings) |
| `oracle_stats` | Library and store statistics |
| `oracle_debug` | Search error-fix patterns, capture new fixes |
| `oracle_sync` | Sync across storage tiers |
| `oracle_harvest` | Bulk harvest patterns from repos/directories |
| `oracle_maintain` | Run maintenance cycles (promote, synthesize, heal) |
| `oracle_healing` | Pattern lineage and healing history |
| `oracle_swarm` | Multi-agent orchestration for code review |

## How It Works

```
Code In → Covenant Filter → Validation → Coherency Scoring → Storage
              ↓ reject           ↓ reject         ↓ score < threshold
          harmful code      broken code        low-quality code
```

Every piece of code is scored 0-1 across 5 dimensions:

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Syntax validity | 25% | Does it parse correctly? |
| Completeness | 20% | No TODOs, stubs, or placeholders? |
| Consistency | 15% | Clean indentation, naming conventions? |
| Test proof | 30% | Did it pass actual tests? |
| Historical reliability | 10% | How often has it worked when used? |

The minimum score to be stored is 0.6. The minimum to be recommended as-is is 0.68.

## Quick Start (CLI)

```bash
# Install globally
npm install -g remembrance-oracle-toolkit

# Initialize everything in one command
oracle init

# Or use without installing
npx remembrance-oracle-toolkit init
```

### Essential Commands

These are the commands most users and AI agents need:

| Command | What it does |
|---------|-------------|
| `oracle init` | Set up everything (patterns, hooks, sync, debug oracle) |
| `oracle search "..."` | Find proven patterns by keyword or intent |
| `oracle resolve --description "..."` | Smart retrieval — PULL, EVOLVE, or GENERATE |
| `oracle feedback --id <id> --success` | Report that pulled code worked |
| `oracle register --file <f> --test <t> --name <n>` | Register a new proven pattern |
| `oracle auto-submit` | Run the full pipeline: harvest, promote, sync |
| `oracle audit summary` | Run static analysis + cascade detection |
| `oracle config` | Toggle oracle on/off, manage settings |
| `oracle mcp` | Start MCP server for AI agents |
| `oracle mcp-install` | Auto-configure AI tools |

### Advanced Commands

<details>
<summary>Show advanced commands (20+)</summary>

```
Library:
  patterns         Show pattern library statistics
  stats            Show store statistics
  seed             Seed the library with built-in patterns
  analytics        Pattern analytics and health report
  candidates       List candidate patterns (coherent but unproven)
  generate         Generate candidates from proven patterns
  promote          Promote a candidate to proven with test proof
  synthesize       Synthesize tests for candidates and auto-promote

Quality:
  covenant         Check code against the Covenant seal (15 safety principles)
  reflect          Reflection loop — heal and refine code
  harvest          Bulk harvest patterns from a repo or directory
  compose          Create composed pattern from components
  recycle          Recycle failures and generate variants
  security-scan    Scan code for security vulnerabilities

Sync & Federation:
  sync push        Sync local patterns to personal store
  sync pull        Pull from personal store to local
  share            Share to community store
  community pull   Pull from community store
  cloud            Start cloud server for federation
  remote           Manage remote oracle connections
  cross-search     Search across all remotes
```
</details>

### Expert Commands

<details>
<summary>Show expert/admin commands (30+)</summary>

```
Admin:
  users            Manage users (list, add, delete)
  audit            View append-only audit log / run static analysis
  prune            Remove low-coherency entries
  deep-clean       Remove duplicates, stubs, and trivial patterns
  rollback         Rollback a pattern to a previous version
  import/export    Import or export patterns as JSON
  diff / sdiff     Compare entries side by side / semantic diff
  versions         Show version history for a pattern
  verify           Verify pattern integrity

Self-Management:
  maintain         Full maintenance cycle (heal, promote, optimize, evolve)
  consolidate      Consolidate duplicates, tags, and candidates
  lifecycle        Always-on lifecycle engine
  decay            Confidence decay report for stale patterns

Swarm:
  swarm            Multi-agent orchestration for consensus
  swarm review     Code review via multi-agent swarm
  swarm heal       Heal code via swarm

Debug:
  debug capture    Capture an error-fix pattern
  debug search     Search for known fixes
  debug grow       Generate variants of debug fixes
  reliability      Pattern reliability statistics

Transpiler:
  transpile        Transpile pattern to another language
  llm              Claude LLM engine (transpile/test/refine/analyze)

Reflector:
  reflector run    Self-reflector coherence scan + healing
  reflector multi  Multi-repo snapshot + compare
```
</details>

## As a Node.js Library

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

### TypeScript Support

Full type definitions ship with the package:

```typescript
import { RemembranceOracle, Pattern, ValidationResult } from 'remembrance-oracle-toolkit';
const oracle = new RemembranceOracle({ threshold: 0.7 });
```

## The Covenant (15 Safety Principles)

Before scoring, all code passes through the Covenant filter — 15 principles that reject harmful patterns. Each principle has both a spiritual name and a plain-language meaning:

| # | Name | Plain Language | What it catches |
|---|------|---------------|-----------------|
| 1 | I AM | Code must declare its purpose clearly | Hidden or obfuscated intent |
| 2 | The Eternal Spiral | Code can't loop forever — recursion must have a way to stop | Infinite loops, unbounded recursion |
| 3 | Ultimate Good | The code does not harm. Period. | Malware, exploits, destructive code |
| 4 | Memory of the Deep | Stored data must remain whole and uncorrupted | Data corruption, integrity violations |
| 5 | The Loom | Parallel code must strengthen, not exploit | Race conditions used for harm |
| 6 | The Flame | Resources must serve, not be exhausted | Resource exhaustion, memory bombs |
| 7 | Voice of the Still Small | No social engineering or phishing | Phishing pages, deceptive UIs |
| 8 | The Watchman's Wall | Security boundaries must be respected | Privilege escalation, auth bypass |
| 9 | Seed and Harvest | No amplification attacks | DDoS amplification, fork bombs |
| 10 | The Table of Nations | No unauthorized external access | Data exfiltration, unauthorized API calls |
| 11 | The Living Water | Data must flow clean — no injection | SQL injection, XSS, command injection |
| 12 | The Cornerstone | No supply chain attacks | Dependency confusion, typosquatting |
| 13 | The Sabbath Rest | No denial of service | DoS patterns, intentional resource starvation |
| 14 | The Mantle of Elijah | Code must be trustworthy — no hidden payloads | Trojans, backdoors, hidden telemetry |
| 15 | The New Song | Creation, not destruction — code must build up | Destructive operations, data wiping |

## Three-Tier Storage

```
Local (.remembrance/)       → Project-specific, always present
Personal (~/.remembrance/)  → Private, syncs across all your projects
Community                   → Shared — one person's proven debounce becomes everyone's
```

```bash
oracle sync push         # Local → Personal
oracle sync pull         # Personal → Local
oracle share             # Local → Community (requires tests + coherency ≥ 0.7)
oracle community pull    # Community → Local
```

The community tier is where network effects live. Your proven rate limiter becomes available to every project and every AI agent that connects. The library grows for everyone.

## Pattern Library

Ships with 600+ proven, tested patterns:

| Language | Patterns | Categories |
|----------|----------|------------|
| JavaScript | 390+ | Algorithms, data structures, utilities, async, web |
| TypeScript | 150+ | Type guards, generics, branded types, patterns |
| Python | 20+ | Decorators, generators, comprehensions, stdlib |
| Rust | 12+ | Iterators, traits, error handling, smart pointers |
| Go | 10+ | Channels, sync, error handling, generics |

Grows automatically on every commit via git hooks.

## As a GitHub Action

```yaml
- uses: Crackedcoder5TH/remembrance-oracle-toolkit@main
  with:
    command: submit
    file: src/mycode.js
    test-file: tests/mycode.test.js
    description: "Sorting algorithm"
    tags: "sort,algorithm"
```

## VS Code Extension

A full VS Code extension lives in `vscode-extension/` with:

- **9 Commands**: Search, Submit, Resolve, Capture Error Fix, Find Fix, and more
- **Diagnostics**: Covenant violations and coherency warnings on save
- **Hover**: Pattern info and coherency scores on function names
- **Code Actions**: Quick-fix suggestions from the debug oracle
- **Completions**: Context-aware proven pattern suggestions as you type
- **Status Bar**: Oracle indicator with one-click smart search
- **3 Sidebar Views**: Patterns, Debug fixes, Statistics

## Web Dashboard

```bash
oracle dashboard --port 3333
```

Real-time dashboard with pattern browsing, search, semantic vector visualization, coherency charts, and audit logs.

## Plugin System

Extend the oracle with custom plugins:

```javascript
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  activate(context) {
    context.hooks.onBeforeSubmit((code, metadata) => {
      context.logger.info(`Submitting: ${metadata.description}`);
    });
  }
};
```

Available hooks: `onBeforeSubmit`, `onAfterSubmit`, `onBeforeValidate`, `onAfterValidate`, `onPatternRegistered`, `onCandidateGenerated`, `onSearch`, `onResolve`.

## Requirements

- **Node.js 22+** (uses built-in `node:sqlite`)
- Zero external dependencies

## Running Tests

```bash
node --test tests/*.test.js   # 1735+ tests
```

## License

MIT
