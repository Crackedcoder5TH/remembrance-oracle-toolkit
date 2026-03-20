# 30-Second Quickstart

Get a code memory oracle running in your project in under a minute.

## Install & Initialize (One Command)

```bash
npx remembrance-oracle-toolkit init
```

That's it. This single command:
- Loads 600+ proven, tested patterns across JavaScript, TypeScript, Python, Go, and Rust
- Installs git hooks so new code is automatically captured on every commit
- Syncs your personal pattern library (grows across all your projects)
- Seeds the debug oracle with common error-fix patterns
- Creates a CLAUDE.md so AI agents know how to use the oracle

Or install globally first:

```bash
npm install -g remembrance-oracle-toolkit
oracle init
```

## Connect to Your AI Tool

The oracle works best when your AI coding tool can access it directly via MCP:

```bash
oracle mcp-install   # Auto-detects Claude Desktop, Cursor, VS Code, etc.
```

Or start the MCP server manually:

```bash
oracle mcp
```

Now your AI pulls proven code from the library instead of generating from scratch.

## Search for Code

```bash
oracle search "binary search"
oracle search "rate limiting" --mode semantic
```

## Smart Retrieval

```bash
oracle resolve --description "debounce function for React"
```

The oracle decides:
- **PULL** (coherency >= 0.68) — use this proven code as-is
- **EVOLVE** — adapt this similar pattern to your needs
- **GENERATE** — no match found, write it fresh

## Submit Your Own Code

Your code must prove itself — pass the Covenant filter, tests, and coherency scoring:

```bash
oracle submit --file mycode.js --test mytest.js --tags "sort,algorithm"
```

## What Happens Automatically

After `oracle init`, everything runs on autopilot:

1. **Every commit** — git hooks analyze your code, extract new patterns, validate them
2. **Proven code gets stored** — only code that passes tests and quality checks
3. **Library grows** — language variants and refinements are generated automatically
4. **Sync happens** — patterns sync to your personal store across projects

## End of Session

When you're done coding:

```bash
oracle auto-submit    # Catches anything the hooks missed
oracle audit summary  # Quick health check
```

## Three-Tier Storage

```
Local (.remembrance/)       → This project
Personal (~/.remembrance/)  → All your projects (private)
Community                   → Shared with everyone
```

```bash
oracle sync push         # Local → Personal
oracle share             # Local → Community (requires tests + coherency ≥ 0.7)
oracle community pull    # Community → Local
```

## Next Steps

- [Full README](README.md) — all commands, MCP config snippets, architecture
- [VS Code Extension](README.md#vs-code-extension) — editor integration
- [Plugin System](README.md#plugin-system) — extend the oracle
