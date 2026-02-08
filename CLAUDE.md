# Remembrance Oracle Toolkit — AI Instructions

## The Reflex: Query Before Write

Before writing any new function, utility, or pattern:

1. **Search first**: `node src/cli.js search "<what you need>" --limit 3`
2. **Resolve if match found**: `node src/cli.js resolve --description "<what you need>" --language <lang>`
3. **Use the proven code** if the oracle returns PULL (coherency >= 0.68)
4. **Adapt the code** if the oracle returns EVOLVE
5. **Write new code** only if the oracle returns GENERATE or no match exists

## The Feedback Loop: Report After Use

After using a pulled pattern or writing new code that passes tests:

1. **Feed back success**: `node src/cli.js feedback --id <id> --success`
2. **Register new patterns**: If you wrote a new utility function with tests, register it:
   ```
   node src/cli.js register --file <code.js> --test <test.js> --name <name> --tags <tags>
   ```
3. **Submit to store**: For validated code without a pattern name:
   ```
   node src/cli.js submit --file <code.js> --test <test.js> --language javascript
   ```

## Automatic Growth

The library grows automatically — every time you register or submit proven code:
- **Candidates are spawned** — language variants (TS, Python) + SERF refinements
- **No manual `generate` needed** — the loop runs on every proven pattern
- **Candidates** live in the `candidates` table until promoted with test proof
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

This exposes 59 tools across 10 categories:

- **Core**: oracle_search, oracle_resolve, oracle_submit, oracle_query, oracle_feedback, oracle_stats, oracle_register_pattern, oracle_nearest, oracle_smart_search
- **Versioning**: oracle_versions, oracle_semantic_diff, oracle_rollback, oracle_verify
- **Reflection**: oracle_reflect, oracle_covenant, oracle_harvest, oracle_compose, oracle_compose_templates
- **Candidates**: oracle_candidates, oracle_generate, oracle_promote, oracle_auto_promote, oracle_smart_promote, oracle_synthesize_tests
- **Security**: oracle_security_scan, oracle_security_audit
- **Federation**: oracle_remote_search, oracle_remotes, oracle_full_search, oracle_cross_search, oracle_repos
- **Voting**: oracle_vote, oracle_top_voted, oracle_reputation
- **Storage**: oracle_sync, oracle_share, oracle_community, oracle_global_stats
- **Debug**: oracle_debug_capture, oracle_debug_search, oracle_debug_feedback, oracle_debug_grow, oracle_debug_stats, oracle_debug_share
- **LLM**: oracle_llm_status, oracle_llm_transpile, oracle_llm_tests, oracle_llm_refine, oracle_llm_analyze, oracle_llm_explain, oracle_llm_generate
- **Transpiler**: oracle_transpile, oracle_verify_transpile, oracle_context
- **Reliability**: oracle_healing_stats, oracle_reliability, oracle_report_bug
- **Integration**: oracle_mcp_install, oracle_github_identity

## Quick Reference

```bash
node src/cli.js search "debounce"          # Find a pattern
node src/cli.js resolve --description "..."  # Smart pull/evolve/generate
node src/cli.js patterns                    # Library stats
node src/cli.js candidates                  # Unproven candidates
node src/cli.js generate                    # Manual batch generate (usually automatic)
node src/cli.js promote auto               # Promote candidates with tests
node src/cli.js synthesize                  # Generate tests + auto-promote
node src/cli.js sync push                  # Sync to personal store
node src/cli.js share                      # Share to community store
node src/cli.js global                     # View personal + community stats
node src/cli.js analytics                  # Health report
node src/cli.js cloud --port 8888          # Start cloud federation server
node src/cli.js remote add <url>           # Add remote oracle
node src/cli.js mcp-install                # Auto-register MCP in AI editors
node src/cli.js github verify              # Link GitHub identity
node src/cli.js vote --id <id> --score 5   # Vote on a pattern
node src/cli.js debug search --error "..."  # Search debug patterns
node src/cli.js transpile --id <id> --to python  # Transpile pattern
node src/cli.js context --id <id>          # Export AI context
node --test tests/*.test.js               # Run all tests
```

## Key Rules

- ALL code must pass the Covenant (15 principles) before storage
- ALL proven patterns have test proof — no exceptions
- Coherency is scored 0-1 across 5 dimensions
- The oracle threshold is 0.6 — code below this is rejected
- SERF healing can recover failed patterns via iterative refinement
- Registering proven code automatically spawns candidates (the loop runs itself)
