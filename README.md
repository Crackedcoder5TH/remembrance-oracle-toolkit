# remembrance-oracle-toolkit

**A code-pattern library with similarity-based retrieval, multi-dimensional
quality scoring, and a structural safety filter.**

> **Part of the [Remembrance Ecosystem](https://github.com/Crackedcoder5TH/Void-Data-Compressor)** —
> reference implementation of [Coherency Protocol v1.0](https://github.com/Crackedcoder5TH/Void-Data-Compressor/blob/main/COHERENCY_PROTOCOL.md).
> **Role**: text + atomic scoring service, MCP server, periodic-table-of-code registry.
> **Verified capabilities**: see [CAPABILITIES.md](./CAPABILITIES.md).
> **Conformance**: 44/44 substrate contracts pass via
> `verify_capabilities --strict` in the [substrate hub](https://github.com/Crackedcoder5TH/Void-Data-Compressor).

```bash
npm install remembrance-oracle-toolkit
```

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

*Code retrieval, quality scoring, structural safety. No model. No
gradient descent. No predictions. The math is the gate.*
