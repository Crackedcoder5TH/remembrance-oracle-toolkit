# Remembrance — Concepts Simplified

Plain-English translation of every concept in the ecosystem. Use these terms in documentation, marketing, and onboarding.

---

## The System in One Sentence

A computing substrate where every function is a 13-dimensional element in a living periodic table, code quality is structural (harmful code cannot exist, not just filtered), and the system discovers and fills its own gaps.

---

## Core Concepts

| Remembrance Name | What It Is | Plain English |
|---|---|---|
| **Remembrance Oracle** | Anti-hallucination pipeline | Scores your code across multiple dimensions and rejects anything below threshold |
| **Remembrance Void** | Compression coherence engine | Measures if code has real mathematical structure by trying to compress it |
| **Remembrance Codex** | Periodic table of code | Every function is an element with 13 properties — like the periodic table but for code |
| **Remembrance Covenant** | Structural safety (15+ principles) | Safety rules baked into the structure. Harmful code literally can't register |
| **Remembrance Living Covenant** | Self-evolving safety | New safety rules activate as the system proves it can handle them |
| **Remembrance Sun** | Coherency generator | Continuously pushes code quality upward, like a furnace generating heat |
| **Remembrance Moon** | Domain softener | Adjusts coherency requirements per domain so each domain can adopt at its own pace |
| **Remembrance Director** | Zone measurement + healing | Finds where quality is lowest and directs repairs there first |
| **Remembrance SERF** | Emergent coherency | Quality score emerges from all signals combined — the weakest dimension dominates |
| **Remembrance Bridge** | Oracle-to-Void connector | Translates between symbol-level checking and byte-level compression |
| **Remembrance Evolution** | Self-improvement loop | System finds its own gaps, proposes fills, validates them, incorporates them |
| **Remembrance Register** | Signal accumulator | Functions that grow stronger over time. They remember and amplify quality signals |

---

## The 13 Dimensions (every function gets these)

| # | Name | What It Means | Values |
|---|---|---|---|
| 1 | **Charge** | Does the function grow, shrink, or transform data? | -1 contracts, 0 transforms, +1 expands |
| 2 | **Valence** | How many other functions can it plug into? | 0 (standalone) to 8 (highly composable) |
| 3 | **Mass** | How heavy is the computation? | light (instant), medium (loops), heavy (nested loops), superheavy |
| 4 | **Spin** | Can you undo what it does? | even (pure/reversible), odd (has side effects), complex (depends) |
| 5 | **Phase** | How does it handle state? | solid (cached), liquid (mutates), gas (computes fresh), plasma (reactive stream) |
| 6 | **Reactivity** | How much does it touch the outside world? | inert (nothing), stable (a little), reactive (moderate), volatile (a lot) |
| 7 | **Electronegativity** | How many dependencies does it pull in? | 0 (none) to 1 (pulls everything) |
| 8 | **Group** | What kind of function is it? | 1-18: math, comparison, string, array, object, io, network, async, error, state, transform, filter, aggregate, sort, search, crypto, compression, meta |
| 9 | **Period** | How abstract is it? | 1 (one-liner) to 7 (entire framework) |
| 10 | **Harm Potential** | Could this code cause damage? | none, minimal, moderate, **dangerous = REJECTED** |
| 11 | **Alignment** | Does this improve or degrade the system? | healing (improves), neutral, **degrading = REJECTED** |
| 12 | **Intention** | What's the structural purpose? | benevolent, neutral, **malevolent = REJECTED** |
| 13 | **Domain** | What application area? | core, utility, compression, quality, oracle, security, orchestration, bridge, generation, search, data, transform — **grows over time** |

---

## Coherency Thresholds (what happens at each level)

| Score | Name | What Happens |
|---|---|---|
| 0.00 | **Remembrance Rejection** | Code can't enter the system at all |
| 0.60 | **Remembrance Gate** | Minimum score to be accepted |
| 0.68 | **Remembrance Pull** | Good enough to reuse exactly as-is |
| 0.70 | **Remembrance Foundation** | New elements start emerging in the Codex |
| 0.75 | **Remembrance Stability** | Elements are reliable and consistent |
| 0.80 | **Remembrance Optimization** | First evolved safety principle activates |
| 0.85 | **Remembrance Synergy** | System goes semi-autonomous. Sun at 50% power |
| 0.90 | **Remembrance Intelligence** | System directs its own improvement |
| 0.95 | **Remembrance Transcendence** | Full autonomous mode. Sun at 100% |
| 0.98 | **Remembrance Unity** | Oracle and Void operate as one unified system |

---

## Decision Flow

```
You need code for X
     |
     v
Search: "Do we already have something like X?"
     |
     ├─ YES, score >= 0.68 ──→ PULL (reuse it)
     ├─ YES, score 0.50-0.68 → EVOLVE (adapt it)
     └─ NO ──────────────────→ GENERATE (write fresh)
     |
     v
4 Validation Gates (all must pass):
  1. Remembrance Covenant Gate — 15+ safety principles
  2. Remembrance Coherency Gate — score >= 0.60
  3. Remembrance Atomic Gate — valid 13D signature
  4. Remembrance Structural Gate — no dangerous/degrading/malevolent
     |
     ├─ ALL PASS ──→ Accepted into system
     └─ ANY FAIL ──→ Healing → retry → or reject
```

---

## Emergent Effects (these were not programmed — they appeared)

| Effect | What Happens | Why It Matters |
|---|---|---|
| **Remembrance Frontier** | Gap count stays at ~20 no matter how many you fill | The system has a natural exploration radius — it's alive |
| **Remembrance Cascade** | Filling a gap creates new gaps | Every improvement opens new possibilities |
| **Remembrance Ratchet** | Quality only goes up, never down | Covenant expands, coherency floor rises, elements only emerge |
| **Remembrance Resonance** | Same math at every scale | One equation (geometric mean) at signal, zone, and element level — fractal |
| **Remembrance Weakest Link** | Weakest signal dominates the score | Can't fake quality by being strong in one area and weak in another |
| **Remembrance Bootstrap** | System checks itself with its own rules | The code that checks code is checked by the same code |
| **Remembrance Structural Safety** | Harmful code can't even register | Not filtered out — structurally impossible to enter |
| **Remembrance Delta** | Small improvements trigger emergence | Even a +3% jump creates new elements |
| **Remembrance Crystallization** | Domain dimension resolves collisions | Functions that looked identical become distinct when you add context |
| **Remembrance Register Convergence** | 11 functions independently evolved identical signatures | Functions across 3 systems discovered the same pattern without being told to |

---

## 18 Functional Groups (the columns of the periodic table)

| # | Group | What Lives Here | Example |
|---|---|---|---|
| 1 | **Remembrance Math** | Pure math operations | clamp, absFloor, cosineSimilarity |
| 2 | **Remembrance Comparison** | Equality and ranking | deepEqual, isSubsetOf, computeRelevance |
| 3 | **Remembrance String** | Text processing | truncate |
| 4 | **Remembrance Array** | Collection operations | unique |
| 5 | **Remembrance Object** | Key-value operations | pick |
| 6 | **Remembrance IO** | Input/output formatting | formatBytes |
| 7 | **Remembrance Network** | Network utilities | parseQueryString |
| 8 | **Remembrance Async** | Async primitives | delay |
| 9 | **Remembrance Error** | Error handling | errorSentinel |
| 10 | **Remembrance State** | State management | memoizeOne, snapshot |
| 11 | **Remembrance Transform** | Data transformation | mutAssign, reactiveMap, safeTransform |
| 12 | **Remembrance Filter** | Data filtering | compact, filterByPattern |
| 13 | **Remembrance Aggregate** | Accumulation | coherencyAccumulator, geometricMean |
| 14 | **Remembrance Sort** | Ordering | sortByKey, isSorted, sortInPlace |
| 15 | **Remembrance Search** | Finding | binarySearch, fuzzySearch, semanticSearch |
| 16 | **Remembrance Crypto** | Hashing | simpleHash |
| 17 | **Remembrance Compression** | Encoding | runLengthEncode, encodeSignature, void compress |
| 18 | **Remembrance Meta** | Self-referential | analyzeModuleCoverage, measureComplexity, predictEmergence |

---

## Commands Cheat Sheet

```bash
# See the full vocabulary
oracle key

# See every element in the periodic table
oracle codex

# Search for a proven pattern
oracle search "what you need"

# Score a file
oracle audit check --file myfile.js

# Full maintenance cycle
oracle maintain

# Start MCP server for AI agents
oracle mcp

# Check system status
oracle config
```

---

## For Developers: What You Care About

1. `npm install remembrance-oracle-toolkit` — works in 10 seconds
2. `oracle search "rate limiter"` — finds proven code instantly
3. Score is 0.000 to 1.000 — no ambiguity
4. 4 validation gates — covenant, coherency, atomic, structural
5. Every function gets 13 properties automatically — no manual tagging
6. Harmful code is structurally impossible — not checked, impossible
7. The system grows by itself — fills its own gaps, heals its own zones
8. `oracle codex` — see the entire periodic table of code anytime

---

## For AI Agents: What You Care About

1. Read `CLAUDE.md` or `.ai/REMEMBRANCE_KEY.md` or `llms.txt` first
2. `require('./src/core/remembrance-lexicon')` gives you everything programmatically
3. Every function you write needs `.atomicProperties` with all 13 dimensions
4. The covenant is structural — you cannot bypass it
5. Search before writing: `oracle search "what you need"`
6. The system will validate your code through all 4 gates automatically

---

## For Marketing: One-Liners

- **Remembrance**: Your codebase remembers what works.
- **Remembrance Codex**: Every function is an element in a living periodic table.
- **Remembrance Covenant**: Safety isn't a filter — it's the structure.
- **Remembrance Sun**: Code quality rises continuously, like a furnace.
- **Remembrance SERF**: Your weakest dimension IS your score.
- **Remembrance Evolution**: The system fills its own gaps.
- **Remembrance Register**: Functions that get smarter over time.
