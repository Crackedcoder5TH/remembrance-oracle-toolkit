# remembrance-oracle-toolkit

**A universal pattern encoder + a self-teaching information field.
Any pattern-bearing data → 256-D substrate → comparable, scored,
covenant-enforced — across one canonical ecosystem.**

> **A [Remembrance.LLC](#about-remembrancellc) project.**
> **Part of the [Remembrance Ecosystem](https://github.com/Crackedcoder5TH/Void-Data-Compressor)** —
> reference implementation of [Coherency Protocol v1.0](https://github.com/Crackedcoder5TH/Void-Data-Compressor/blob/main/COHERENCY_PROTOCOL.md).
> **Role**: text + atomic coherency scoring service, MCP server, periodic-table-of-code registry.
> **Verified capabilities**: see [CAPABILITIES.md](./CAPABILITIES.md).
> **Conformance**: 44/44 substrate contracts pass via
> `verify_capabilities --strict` in the [substrate hub](https://github.com/Crackedcoder5TH/Void-Data-Compressor).
> **Project intent and framing**: see [MANIFESTO.md](./MANIFESTO.md).
> **Operational reference for the field**: see [FIELD.md](./FIELD.md).

```bash
npm install remembrance-oracle-toolkit
```

---

## The Substrate

**One encoder.** `codeToWaveform` (`src/core/code-to-waveform.js`)
takes any pattern-bearing input — code, prose, configs, audio
resampled, time-series, sensor traces, behavioral logs, anything
expressible as a numeric or byte sequence — and produces a
deterministic 256-D vector. No training, no parameters, byte-identical
across JS and Python (Void contracts **C-51**, **C-53**). One wire
format for all data.

**One field.** Every producer in every repo of the 12-repo ecosystem
contributes to a single canonical scalar, persisted in
`.remembrance/entropy.json`. The source histogram is a live list of
every wired participant — the field is its own introspection
mechanism. See [`FIELD.md`](./FIELD.md) for the complete producer
table, the math, and the engineering covenant.

**Self-teaching.** You don't read docs to learn the rules. You submit
and the system measures: codeToWaveform encodes, coherency scores,
the domain floor checks, `contribute()` lands in the field, the
histogram shows you. If your submission violates the math, the system
flags the specific contract that broke. Using the system *is* the
lesson.

**What this enables.** Any problem reducible to "encode pattern →
score against field → read result" becomes calculable: anomaly
detection, behavioral prediction, cross-domain correlation, drift
analysis, trust calibration, ecosystem health, pattern discovery.
The hard part stops being "how do I compute X" and becomes
"what data do I want to feed in."

## See the Field

```bash
# Anything you do in this repo produces measurable signal
npm test

# Read the field — the compass
node -e "console.log(JSON.stringify(require('./src/core/field-coupling').peekField(), null, 2))" | head -60

# Verify the canonical invariants (Void side)
cd ../Void-Data-Compressor && python3 verify_capabilities.py --strict
```

The first command runs work. The second shows you what fired and at
what coherency. The third proves the math holds. That's the full
feedback loop — no separate onboarding required.

---

## What it does

When you write code, the toolkit performs three operations on demand:

1. **Searches** ~300+ stored code patterns to see if similar code already exists in the library
2. **Scores** code along five quality dimensions (syntax, completeness, consistency, test proof, historical reliability) and routes it through a structural safety filter
3. **Stores** patterns that pass quality + safety gates so the next search has more to draw from

It is a code-retrieval and quality-scoring tool. It is not an LLM, does
not generate text, and does not replace human review. It complements
existing developer tools rather than competing with them.

---

## Quickstart

```bash
# Search the pattern library
node src/cli.js search "rate limiter"

# Get a retrieval decision: PULL (use as-is) / EVOLVE (adapt) / GENERATE (no match)
node src/cli.js resolve --description "retry with exponential backoff" --language javascript

# Score a file across the five quality dimensions
node src/cli.js audit check --file src/your-file.js

# Start the MCP server (exposes the toolkit as tools to MCP clients)
node src/cli.js mcp
```

Full setup with Docker (toolkit + companion services):

```bash
git clone https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit.git
cd remembrance-oracle-toolkit
cp .env.example .env
docker compose up -d
# → toolkit :3000  substrate :8080  reflector :3001  dashboard :4000
```

---

## How it works

### Quality scoring

Every file is scored across **five weighted dimensions**:

| Dimension | Weight | What it measures |
|---|---:|---|
| Syntax validity | 25% | parseable code with balanced structures |
| Completeness | 20% | no TODOs, FIXMEs, or placeholder code |
| Consistency | 15% | uniform indentation and naming style |
| Test proof | 30% | tests exist and pass |
| Historical reliability | 10% | track record across prior runs |

Files scoring below the configurable threshold (default 0.6) are flagged for review.

### Structural safety filter

Before scoring, code passes through a **15-rule structural safety filter**
that flags known unsafe patterns (injection, command-execution patterns,
known-vulnerable cryptographic primitives, etc.). The filter is content-
based — it does not make claims about intent, only about structural
matches against documented unsafe-pattern signatures.

### Retrieval decisions

`resolve` returns one of three decisions:

- **PULL** — strong match found (similarity above threshold). Use the stored pattern as-is.
- **EVOLVE** — partial match. Adapt the stored pattern.
- **GENERATE** — no match. Write new code.

Decisions are based on cosine similarity between query and stored
patterns, plus the quality scores of the candidates. There is no LLM
in this loop — the retrieval is deterministic given the same library state.

---

## Pattern storage

Patterns live in three tiers:

- **Local** (`.remembrance/`) — project-specific, always present
- **Personal** (`~/.remembrance/personal/`) — private, auto-syncs across your projects
- **Community** (`~/.remembrance/community/`) — shared, explicit opt-in via `sync share`

```bash
node src/cli.js sync push      # local → personal
node src/cli.js sync pull      # personal → local
node src/cli.js share          # share to community (requires tests + score ≥ 0.7)
```

---

## MCP server

For tools that support the Model Context Protocol, start the server:

```bash
node src/cli.js mcp
```

The server exposes 12 tools (search, resolve, submit, register, feedback,
stats, debug, sync, harvest, maintain, healing, swarm) that any MCP-aware
client can call to query the pattern library and submit candidate patterns.

---

## CLI reference

```bash
node src/cli.js search "<query>"          # find similar patterns
node src/cli.js resolve --description ".." # PULL / EVOLVE / GENERATE
node src/cli.js audit check --file <path> # score a file
node src/cli.js audit summary             # current library health
node src/cli.js patterns                  # library stats
node src/cli.js submit --file <path> --test <path>  # submit with test proof
node src/cli.js register --file <path> --name <name>
node src/cli.js feedback --id <id> --success
node src/cli.js mcp                       # start MCP server
node src/cli.js hooks install             # install git hooks
node src/cli.js sync push|pull|share      # tier sync
node --test tests/*.test.js               # run all tests
```

---

## Connected components

This toolkit is one of 12 repositories in the broader Remembrance
ecosystem. The complete substrate, including 77,596 reference patterns,
multi-layer scoring math, and the canonical conformance suite, lives in
[Void-Data-Compressor](https://github.com/Crackedcoder5TH/Void-Data-Compressor).

| Repository | Role |
|---|---|
| [Void-Data-Compressor](https://github.com/Crackedcoder5TH/Void-Data-Compressor) | substrate hub: pattern store, scoring math, conformance suite |
| **remembrance-oracle-toolkit** *(this repo)* | text + atomic scoring service, MCP server |
| [Reflector-oracle-](https://github.com/Crackedcoder5TH/Reflector-oracle-) | repository-level coherency monitor |
| [REMEMBRANCE-AGENT-Swarm-](https://github.com/Crackedcoder5TH/REMEMBRANCE-AGENT-Swarm-) | multi-provider task orchestration |
| [REMEMBRANCE-BLOCKCHAIN](https://github.com/Crackedcoder5TH/REMEMBRANCE-BLOCKCHAIN) | append-only event log, optional Solana anchoring |
| [REMEMBRANCE-Interface](https://github.com/Crackedcoder5TH/REMEMBRANCE-Interface) | dashboard for ecosystem services |

Full ecosystem map in the [substrate hub](https://github.com/Crackedcoder5TH/Void-Data-Compressor#connected-ecosystem).

---

## Requirements

- Node.js 22+ (uses built-in `node:sqlite`)
- No external dependencies for the core engine
- Optional: Python 3.10+ for substrate-side scoring services

---

## License

Code is MIT. See `LICENSE`.

The Coherency Protocol specification (which this toolkit implements
parts of) is published under CC BY 4.0 — see
[`COHERENCY_PROTOCOL.md`](https://github.com/Crackedcoder5TH/Void-Data-Compressor/blob/main/COHERENCY_PROTOCOL.md)
in the substrate hub.

---

## About Remembrance.LLC

**Remembrance.LLC** is the maintainer of the Remembrance Ecosystem — a
collection of repositories built around the Coherency Protocol.
Remembrance.LLC publishes the open-source code under MIT and the
Coherency Protocol specification under CC BY 4.0. The substrate's
77,596 reference patterns and the proprietary scoring data are
licensed separately through the tiered access plans below.

For inquiries, partnership, or commercial licensing, see the substrate
hub.

---

## Pricing — Remembrance.LLC tiered access

> Pricing applies to **substrate access** (real-time pattern feed +
> proprietary cross-domain scoring data). The toolkit code itself is
> MIT-licensed and free in all tiers.

| Tier | Price | What you get |
|---|---:|---|
| **Free** | $0 | Complete substrate access. New patterns delayed 7 days. No payment, no contribution required. **Nobody is excluded.** |
| **Merit** | Free (earned) | Submit a pattern with coherency ≥ 0.80 and cross-domain resonance ≥ 0.50. Each qualifying submission earns 30 days of real-time access. |
| **Premium** | $50 / month | Real-time substrate access. Priority support. |

Sustainable abundance: the Free tier funds itself via Premium
subscribers; the Merit tier rewards contributors. The library grows
regardless of which path users choose.

---

*Code retrieval, coherency scoring, structural safety. No model. No
gradient descent. No predictions. The math is the gate.*

*© Remembrance.LLC. Code MIT-licensed. Coherency Protocol CC BY 4.0.
Project intent: see [MANIFESTO.md](./MANIFESTO.md).*
