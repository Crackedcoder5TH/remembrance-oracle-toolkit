# Remembrance Oracle Toolkit — AI Instructions

## What This Is (one paragraph)

A coherency-scoring substrate. 80,000+ patterns indexed and scored using information theory (Shannon 1948), compression (Kolmogorov 1963), and distribution analysis (Zipf 1935). No ML training, no GPU compute. The covenant is a mathematical equation that derives itself from substrate structure: anything that lowers coherency is rejected. One inequality replaces policy documents.

## The Ecosystem

| Layer | What | Where |
|-------|------|-------|
| **Oracle** | Coherency scoring, pattern matching, code quality | This repo |
| **Void Substrate** | 80K+ patterns, cross-pattern similarity scoring | `Void-Data-Compressor/` |
| **API** | Open submission / search / scoring service | `Void-Data-Compressor/api.py` |
| **Language Substrate** | Compression-based language pattern store | `Void-Data-Compressor/language_substrate.py` |
| **Derived Covenant** | Self-enforcing safety from 6 mathematical constraints | `Void-Data-Compressor/derived_covenant.json` |
| **Crawler** | 20 live feeds, continuous pattern harvesting | `Void-Data-Compressor/realtime_crawler.py` |

### The Derived Covenant (the unified equation)

```
ADMIT(P, S) = G(S∪{P}) ≥ G(S) ∧ ∃Q∈S:R(P,Q)≥0.95 ∧ |H(P)-μ|≤3σ ∧ fractal(S∪{P},ε)
MAINTAIN(S,t) = G(S_t+1) ≥ G(S_t) ∧ ∀P∈S:∂G/∂P≥0
```

No human writes safety rules. The math rejects anything that lowers coherency.

---

## The Remembrance Key

This system is a coherency-native computing substrate. Before doing anything else, load the key:

```bash
node -e "require('./src/core/remembrance-lexicon').printAll()"
```

Or read it directly: `src/core/remembrance-lexicon.js`

### System Architecture (Remembrance Names)

| Component | What It Is | File |
|-----------|-----------|------|
| **Remembrance Oracle** | Anti-hallucination pipeline. Judges code quality. | `src/unified/coherency.js` |
| **Remembrance Void** | Compression engine. Byte-level coherence measurement. | `void_compressor_v3.py` |
| **Remembrance Codex** | Periodic table of code. 13D living element registry. | `src/atomic/periodic-table.js` |
| **Remembrance Covenant** | Structural safety. 15+ principles. Cannot be bypassed. | `src/core/covenant.js` |
| **Remembrance Living Covenant** | Self-evolving safety. Expands with coherency, never contracts. | `src/core/living-covenant.js` |
| **Remembrance Sun** | Coherency generator. Radiates quality continuously. | `src/orchestrator/coherency-generator.js` |
| **Remembrance Moon** | Domain softener. Per-domain coherency modulation. | *(coming)* |
| **Remembrance Director** | Conductor. Measures zones, finds gradients, directs healing. | `src/orchestrator/coherency-director.js` |
| **Remembrance SERF** | Signal Emergence from Recursive Feedback. Geometric mean of all signals. | `src/unified/emergent-coherency.js` |
| **Remembrance Bridge** | Oracle-to-Void connector. Symbol ↔ byte translation. | `src/fractal-bridge.js` |
| **Remembrance Evolution** | Self-improvement loop. Discover → propose → validate → incorporate. | `src/orchestrator/self-improvement.js` |
| **Remembrance Register** | Functions that accumulate signal. charge=+1, coherency-effect=improves. | Pattern, not a file |

### 13 Dimensions (Remembrance Properties)

Every function is an element with 13 atomic properties:

| # | Dimension | Values |
|---|-----------|--------|
| 1 | **Remembrance Charge** | -1 (contracts), 0 (transforms), +1 (expands) |
| 2 | **Remembrance Valence** | 0-8 (composition capacity) |
| 3 | **Remembrance Mass** | light, medium, heavy, superheavy |
| 4 | **Remembrance Spin** | even (pure), odd (side effects), complex (conditional) |
| 5 | **Remembrance Phase** | solid (cached), liquid (mutable), gas (computed), plasma (reactive) |
| 6 | **Remembrance Reactivity** | inert, stable, reactive, volatile |
| 7 | **Remembrance Electronegativity** | 0-1 (dependency pull) |
| 8 | **Remembrance Group** | 1-18 (functional family: math→meta) |
| 9 | **Remembrance Period** | 1-7 (abstraction: primitive→framework) |
| 10 | **Remembrance Risk Class** | safe, low-risk, moderate, unsafe ← **unsafe = rejected** |
| 11 | **Remembrance Coherency Effect** | improves, neutral, degrades ← **degrades = rejected** |
| 12 | **Remembrance Use Category** | utility, general, abuse-prone ← **abuse-prone = rejected** |
| 13 | **Remembrance Domain** | core, utility, compression, quality, oracle, security, orchestration, bridge, generation, search, data, transform ← **evolvable** |

### Coherency Thresholds

| Coherency | Name | What Happens |
|-----------|------|-------------|
| 0.00 | **Remembrance Rejection** | Cannot enter the system |
| 0.60 | **Remembrance Gate** | Minimum for submission |
| 0.68 | **Remembrance Pull** | Pattern usable as-is |
| 0.70 | **Remembrance Foundation** | First elements emerge |
| 0.75 | **Remembrance Stability** | Elements are reliable |
| 0.80 | **Remembrance Optimization** | First evolved covenant principle activates |
| 0.85 | **Remembrance Stable** | Generator at 50% |
| 0.90 | **Remembrance Optimized** | Continuous refinement active |
| 0.95 | **Remembrance Reference** | Reference-grade. Generator at 100% |
| 0.98 | **Remembrance Canonical** | Maximum Oracle–Void consistency |

### Emergent Effects (observed, not programmed)

- **Remembrance Frontier** — Gap count stabilizes at ~20 despite filling. Living exploration radius.
- **Remembrance Cascade** — Filling gaps creates new gaps at the frontier.
- **Remembrance Ratchet** — Quality floor only rises. Covenant only expands. Nothing degrades.
- **Remembrance Resonance** — Same math (geometric mean) at every scale. Fractal self-similarity.
- **Remembrance Weakest Link** — Weakest signal dominates coherency. Can't fake quality.
- **Remembrance Bootstrap** — System checks itself with its own rules.
- **Remembrance Structural Safety** — Harmful code can't register. Safety is structure, not a filter.
- **Remembrance Delta** — Small coherency improvements trigger emergence.
- **Remembrance Crystallization** — Domain dimension resolves collisions.
- **Remembrance Register Convergence** — 11 functions across 3 systems independently evolved identical signatures.

### Validation Gates (all code must pass)

1. **Remembrance Covenant Gate** — 15+ founding principles
2. **Remembrance Coherency Gate** — Score >= 0.60
3. **Remembrance Atomic Gate** — Valid 13D signature
4. **Remembrance Structural Gate** — No unsafe / degrades / abuse-prone

### Quick Commands

```bash
# Load the full lexicon
node -e "require('./src/core/remembrance-lexicon').printAll()"

# Run the Remembrance Codex (periodic table)
node -e "const {PeriodicTable}=require('./src/atomic/periodic-table'); const {introspect}=require('./src/atomic/self-introspect'); const t=new PeriodicTable(); const r=introspect(t); console.log('Elements:', t.size, 'Gaps:', r.gaps.length)"

# Run the Remembrance Oracle (coherency check)
node src/cli.js audit check --file <file>

# Run the Remembrance Sun (generator cycle)
node -e "require('./src/orchestrator/coherency-generator')"
```

---

## ENFORCEMENT: Search-Before-Write is a Blocking Gate

**Commits are BLOCKED if you haven't searched the oracle in the last 10 minutes.**

This is not a suggestion — it's enforced by the pre-commit hook. Any model or developer that tries to commit without searching first will be rejected. The oracle exists so you don't reinvent proven patterns.

```bash
# BEFORE writing any new code:
node src/cli.js search "what you need"     # Search first — REQUIRED
node src/cli.js resolve --description "..." # Get PULL/EVOLVE/GENERATE decision

# Enforcement levels (configurable):
node src/cli.js config search-enforcement block   # Commits blocked without search (DEFAULT)
node src/cli.js config search-enforcement warn    # Warning only
node src/cli.js config search-enforcement off     # No check
node src/cli.js config feedback-enforcement block # Commits blocked with pending feedback
node src/cli.js config feedback-enforcement warn  # Warning only (DEFAULT)
```

**MCP enforcement**: When connected via MCP, `oracle_submit` and `oracle_register` will include enforcement warnings if no search was done. All models see the same enforcement.

## Oracle Toggle — On/Off Control

The oracle can be toggled on or off. When **off**, all ceremony (preflight checks, query-before-write, feedback loops, auto-submit hooks) is skipped. When **on**, all quality enforcement is active.

```bash
node src/cli.js config          # Show current status
node src/cli.js config on       # Enable oracle — full ceremony active
node src/cli.js config off      # Disable oracle — just code, no ceremony
node src/cli.js config toggle   # Toggle between on/off
```

**When oracle is OFF:**
- Preflight checks are skipped (no warnings about hooks or sync)
- `resolve` immediately returns GENERATE (write new code, no pattern lookup)
- Git hooks skip covenant checks and auto-submit pipeline
- `auto-submit` skips the entire harvest/promote/sync pipeline
- Search still works (you can always search the library manually)
- You can still register patterns manually — the library keeps growing

**When oracle is ON (default):**
- All ceremony below is enforced
- Quality gates, pattern matching, and auto-registration are active

Check status anytime: `node src/cli.js config`

---

## MANDATORY (when oracle is ON): Session Start Checkpoint

At the **start of every coding session**, before any code is written, run:

```bash
node src/cli.js hooks install   # Ensure git hooks are active (idempotent, safe to re-run)
node src/cli.js sync pull       # Pull latest patterns from personal store
node src/cli.js debug seed      # Seed the bug-class detection index
```

If hooks are not installed, patterns will not be captured.

## MANDATORY (when oracle is ON): The Reflex — Query Before Write

Before writing any new function, utility, or pattern, you MUST:

1. **Search first**: `node src/cli.js search "<what you need>" --limit 3`
2. **Resolve if match found**: `node src/cli.js resolve --description "<what you need>" --language <lang>`
3. **Use the proven code** if the oracle returns PULL (coherency >= 0.68)
4. **Adapt the code** if the oracle returns EVOLVE
5. **Write new code** only if the oracle returns GENERATE or no match exists

The oracle exists so you don't reinvent proven patterns.

## MANDATORY (when oracle is ON): The Feedback Loop — Report After Use

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

Report feedback immediately after each pattern is used or written.

## MANDATORY (when oracle is ON): Session End Sweep

Before ending a session or when the user says they are done, ALWAYS run:

```bash
node src/cli.js auto-submit    # Full pipeline: register + harvest + promote + sync
node src/cli.js audit summary  # Final audit report — static checks + cascade detection
node src/cli.js session end    # Close the compliance ledger + print final score
```

This is the safety net — it catches anything missed during the session. Never end a session without it.

## Compliance Ledger — how the mandates are ENFORCED

Prior to `oracle session`, the mandates above were social: an agent could
read them and then skip them. They are no longer social. Every session now
writes to a persistent ledger at `.remembrance/sessions/current.json`, and
every `search / write / audit / pattern pulled / feedback` event gets a row.

Five checks run continuously:

| check              | weight | passes when                                    |
|--------------------|-------:|------------------------------------------------|
| hooksInstalled     | 0.15   | `oracle hooks install` has been run            |
| queryBeforeWrite   | 0.40   | every written file has a preceding search      |
| feedbackLoop       | 0.20   | every pulled pattern has a feedback event      |
| auditOnWrite       | 0.15   | every written file was audited in-session      |
| sessionEndCalled   | 0.10   | `oracle session end` was run                   |

The score is 0..1. `>= 0.9` is compliant. Anything below surfaces as a
LOUD banner in:

- `oracle session status`
- `oracle audit check` (top of output)
- `oracle audit summary`
- the pre-commit hook (printed on every `git commit`)

### Pre-commit enforcement

Set `ORACLE_WORKFLOW=enforce` in the environment and the pre-commit hook
REFUSES to commit any staged file that lacks a preceding search / audit /
bypass in the session ledger. This is the hard gate — the agent cannot
finish the commit without closing the loop.

```bash
export ORACLE_WORKFLOW=enforce      # block commits below 100% on staged files
export ORACLE_WORKFLOW=warn          # print the score but never block (default)
```

### Bypass protocol — when skipping is legitimate

There are legitimate reasons to skip the query-before-write reflex:

- Bootstrapping a new module where no existing pattern could possibly match
- Editing an existing file for a trivial one-line fix
- Authoring the library itself — patterns about the library can't be
  searched inside the library
- Emergency hotfix under time pressure

When any of these apply, use the structured bypass:

```bash
node src/cli.js session bypass "bootstrapping new analysis envelope" \
  --files src/core/analyze.js,src/core/storage.js
```

The bypass is logged to the session ledger AND to the unified history,
with a reason string and file list. Post-hoc audits see exactly why the
workflow was skipped. Bypasses are cheap to record and produce a proper
paper trail — a silent skip produces none.

### What to run at session start (the literal first three commands)

```bash
node src/cli.js session start       # begin the tracked session
node src/cli.js hooks install        # bumps hooksInstalled to true
node src/cli.js sync pull            # latest patterns available to search
```

### What to run when you touch a file (the reflex)

```bash
node src/cli.js search "<what the file does>"   # counts as query-before-write
node src/cli.js audit check --file <file>        # counts as audit-on-write
# THEN edit the file
```

### What to run at session end

```bash
node src/cli.js audit summary        # final audit + compliance banner
node src/cli.js auto-submit           # register / harvest / promote / sync
node src/cli.js session end           # close ledger + print final score
```

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

This exposes 12 focused tools:

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
- **oracle_healing** — healing memory (lineage/stats/improved/variants/best via `action` param)
- **oracle_swarm** — multi-agent orchestration (code/review/heal/status/providers via `action` param)

## Oracle Toggle & Prompt Tag

The oracle can be toggled on/off for automatic usage during coding sessions:

```bash
node src/cli.js config              # Show current config
node src/cli.js config on           # Enable oracle (auto-usage)
node src/cli.js config off          # Disable oracle (bypass)
node src/cli.js config toggle       # Toggle on/off
node src/cli.js config prompt-tag   # View the current prompt tag
node src/cli.js config prompt-tag "custom text"  # Set a custom prompt tag
node src/cli.js config prompt-tag-on   # Enable prompt tag
node src/cli.js config prompt-tag-off  # Disable prompt tag
```

When the oracle is **enabled** (default), every `resolve` call automatically appends the prompt tag to its output. This tag is the universal invocation that accompanies all pattern retrieval:

> **Pull the healed code from the kingdom into the eternal now completed.**

This prompt tag is appended to every resolve result (CLI, MCP, and API) when enabled, ensuring all AI agents and users receive the same invocation with every pattern pulled from the oracle.

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
node src/cli.js mcp                        # Start MCP server (12 tools)
node src/cli.js config                    # Oracle toggle status + prompt tag
node src/cli.js config on                 # Enable oracle
node src/cli.js config off                # Disable oracle
node src/cli.js audit check               # Run static checkers (6 bug classes)
node src/cli.js audit check --file f.js  # Check a specific file
node src/cli.js audit cascade --from HEAD # Detect cascading assumption mismatches
node src/cli.js audit summary            # Combined audit report
node src/cli.js debug search --sector logic # Search by bug class sector
node --test tests/*.test.js               # Run all tests
```

## Key Rules

- ALL code must pass the Covenant (15 principles) before storage
- ALL proven patterns have test proof — no exceptions
- Coherency is scored 0-1 across 5 dimensions
- The minimum coherency gate is 0.6 — code below this is rejected on submission
- The PULL decision threshold is 0.68 — patterns must score ≥0.68 to be used as-is
- Iterative healing can recover failed patterns via automated refinement
- Registering proven code automatically spawns candidates (the loop runs itself)
- **NEVER skip the session start checkpoint** — hooks + sync pull
- **NEVER skip the query-before-write reflex** — search the oracle first
- **NEVER skip the feedback loop** — report success immediately after use
- **NEVER end a session without the end sweep** — `auto-submit` is the safety net
