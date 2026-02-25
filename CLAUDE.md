# Remembrance Oracle Toolkit — AI Instructions

## MANDATORY: Session Start Checkpoint

At the **start of every coding session**, before any code is written, run:

```bash
node src/cli.js hooks install   # Ensure git hooks are active (idempotent, safe to re-run)
node src/cli.js sync pull       # Pull latest patterns from personal store
```

This is NON-NEGOTIABLE. If hooks are not installed, patterns will not be captured.

## MANDATORY: The Reflex — Query Before Write

Before writing any new function, utility, or pattern, you MUST:

1. **Search first**: `node src/cli.js search "<what you need>" --limit 3`
2. **Resolve if match found**: `node src/cli.js resolve --description "<what you need>" --language <lang>`
3. **Use the proven code** if the oracle returns PULL (coherency >= 0.68)
4. **Adapt the code** if the oracle returns EVOLVE
5. **Write new code** only if the oracle returns GENERATE or no match exists

Do NOT skip this step. The oracle exists so you don't reinvent proven patterns.

## MANDATORY: The Feedback Loop — Report After Use

After using a pulled pattern or writing new code that passes tests, you MUST:

1. **Feed back success**: `node src/cli.js feedback --id <id> --success`
2. **Register new patterns**: If you wrote a new utility function with tests, register it:
   ```
   node src/cli.js register --file <code.js> --test <test.js> --name <name> --tags <tags>
   ```
3. **Submit to store**: For validated code without a pattern name:
   ```
   node src/cli.js submit --file <code.js> --test <test.js> --language javascript
   ```

Do NOT batch these up. Report feedback immediately after each pattern is used or written.

## MANDATORY: Session End Sweep

Before ending a session or when the user says they are done, ALWAYS run:

```bash
node src/cli.js auto-submit    # Full pipeline: register + harvest + promote + sync
```

This is the safety net — it catches anything missed during the session. Never end a session without it.

## Auto-Registration (Automatic Pattern Capture)

Pattern registration is now **automatic on every commit** via git hooks:

1. **Hooks must be installed** (session start checkpoint handles this)
2. **Every commit triggers**: diff analysis → function extraction → dedup → registration
3. **No manual registration needed per-commit** — the post-commit hook calls `auto-register` → `harvest` → `promote` → `sync`

The pipeline:
- **Step 0 — Auto-Register**: Analyzes `git diff` to find new/modified functions, matches them to test files, and registers individually
- **Step 1 — Harvest**: Broad directory scan for any remaining unregistered patterns
- **Step 2 — Promote**: Auto-promotes candidates that have test proof
- **Step 3 — Sync**: Syncs proven patterns to personal store

Manual commands:
```bash
node src/cli.js auto-register              # Register functions from last commit
node src/cli.js auto-register --dry-run    # Preview without registering
node src/cli.js auto-register --whole-file # Register whole files instead of functions
node src/cli.js auto-submit                # Full pipeline: register + harvest + promote + sync
node src/cli.js hooks install              # Install pre-commit + post-commit hooks
node src/cli.js hooks uninstall            # Remove hooks
```

## Automatic Growth

The library grows automatically — every time you register or submit proven code:
- **Candidates are spawned** — language variants (TS, Python) + automated refinements
- **No manual `generate` needed** — the loop runs on every proven pattern
- **Candidates** live in the `candidates` table until promoted with test proof
- **Git hooks handle registration** — no need to manually register after coding
- Run `node src/cli.js promote auto` to auto-promote candidates with tests
- Run `node src/cli.js synthesize` to generate tests and promote in one step

## Three-Tier Storage

- **Local** (`.remembrance/`) — project-specific, always present
- **Personal** (`~/.remembrance/personal/`) — private, auto-syncs across projects
- **Community** (`~/.remembrance/community/`) — shared, explicit `oracle share`

```bash
node src/cli.js sync push      # Sync local → personal (private)
node src/cli.js sync pull      # Pull personal → local
node src/cli.js share          # Share to community (requires tests + coherency ≥ 0.7)
node src/cli.js community pull # Pull from community → local
```

## MCP Server

For AI clients that support MCP, start the server:
```
node src/cli.js mcp
```

This exposes 10 focused tools:

- **oracle_search** — unified search (basic, smart/intent-aware, structured query)
- **oracle_resolve** — smart retrieval (PULL/EVOLVE/GENERATE decision)
- **oracle_submit** — submit code for validation and storage
- **oracle_register** — register named patterns in the library
- **oracle_feedback** — report whether pulled code worked
- **oracle_stats** — store, pattern, and candidate statistics
- **oracle_debug** — debug oracle (capture/search/feedback/stats/grow/patterns via `action` param)
- **oracle_sync** — sync across tiers (personal/community/both via `scope` param)
- **oracle_harvest** — bulk harvest patterns from repos/directories
- **oracle_maintain** — maintenance (full-cycle/candidates/promote/synthesize/reflect/covenant via `action` param)

## Quick Reference

```bash
node src/cli.js search "debounce"          # Find a pattern
node src/cli.js resolve --description "..."  # Smart pull/evolve/generate
node src/cli.js patterns                    # Library stats
node src/cli.js candidates                  # Unproven candidates
node src/cli.js promote auto               # Promote candidates with tests
node src/cli.js synthesize                  # Generate tests + auto-promote
node src/cli.js maintain                   # Full maintenance cycle (heal + optimize + evolve)
node src/cli.js auto-register              # Register new functions from last commit
node src/cli.js auto-submit                # Full pipeline: register + harvest + promote + sync
node src/cli.js hooks install              # Install git hooks (covenant + auto-register)
node src/cli.js sync push                  # Sync to personal store
node src/cli.js share                      # Share to community store
node src/cli.js debug search --error "..."  # Search debug patterns
node src/cli.js mcp                        # Start MCP server (10 tools)
node --test tests/*.test.js               # Run all tests
```

## Key Rules

- ALL code must pass the Covenant (15 principles) before storage
- ALL proven patterns have test proof — no exceptions
- Coherency is scored 0-1 across 5 dimensions
- The oracle threshold is 0.6 — code below this is rejected
- Iterative healing can recover failed patterns via automated refinement
- Registering proven code automatically spawns candidates (the loop runs itself)
- **NEVER skip the session start checkpoint** — hooks + sync pull
- **NEVER skip the query-before-write reflex** — search the oracle first
- **NEVER skip the feedback loop** — report success immediately after use
- **NEVER end a session without the end sweep** — `auto-submit` is the safety net
