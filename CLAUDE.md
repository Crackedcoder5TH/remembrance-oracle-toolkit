# Remembrance Oracle Toolkit — AI Instructions

## The Reflex: Query Before Write

Before writing any new function, utility, or pattern:

1. **Search first**: `node src/cli.js search "<what you need>" --limit 3`
2. **Resolve if match found**: `node src/cli.js resolve --description "<what you need>" --language <lang>`
3. **Use the proven code** if the oracle returns PULL (coherency > 0.7)
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

## Growing the Library

The library grows automatically via the two-tier system:
- **Proven** patterns (test-backed) live in the `patterns` table
- **Candidates** (coherent but unproven) live in the `candidates` table
- Run `node src/cli.js generate` to spawn candidates from proven patterns
- Run `node src/cli.js promote auto` to auto-promote candidates with tests

## MCP Server

For AI clients that support MCP, start the server:
```
node src/cli.js mcp
```

This exposes 16 tools: oracle_search, oracle_resolve, oracle_submit, oracle_query,
oracle_feedback, oracle_stats, oracle_register_pattern, oracle_nearest,
oracle_versions, oracle_semantic_diff, oracle_reflect, oracle_harvest,
oracle_covenant, oracle_candidates, oracle_generate, oracle_promote.

## Quick Reference

```bash
node src/cli.js search "debounce"          # Find a pattern
node src/cli.js resolve --description "..."  # Smart pull/evolve/generate
node src/cli.js patterns                    # Library stats
node src/cli.js candidates                  # Unproven candidates
node src/cli.js generate                    # Grow candidates from proven
node src/cli.js promote auto               # Promote candidates with tests
node src/cli.js analytics                   # Health report
node --test tests/*.test.js                # Run all tests
```

## Key Rules

- ALL code must pass the Covenant (15 principles) before storage
- ALL proven patterns have test proof — no exceptions
- Coherency is scored 0-1 across 5 dimensions
- The oracle threshold is 0.6 — code below this is rejected
- SERF healing can recover failed patterns via iterative refinement
