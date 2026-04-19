# Remembrance Architecture

How the system fits together. Read this if you want to understand the whole picture.

---

## System Map

```
                          ┌─────────────────────┐
                          │   Remembrance Sun    │
                          │  (coherency-generator)│
                          │  Radiates quality     │
                          │  continuously         │
                          └─────────┬─────────────┘
                                    │ radiation
                                    ▼
┌──────────────┐    signals    ┌─────────────────────┐    signals    ┌──────────────┐
│  Remembrance │──────────────▶│   Remembrance SERF  │◀──────────────│  Remembrance │
│    Oracle    │               │ (emergent-coherency) │               │     Void     │
│  (coherency) │               │  Geometric mean of   │               │ (compressor) │
│              │               │  ALL pipeline signals │               │              │
│ symbol-level │               │  Weakest link wins    │               │  byte-level  │
│  checking    │               └─────────┬─────────────┘               │  coherence   │
└──────┬───────┘                         │                             └──────┬───────┘
       │                                 │ coherency score                    │
       │                                 ▼                                    │
       │                    ┌─────────────────────┐                          │
       │                    │ Remembrance Director │                          │
       │                    │ (coherency-director) │                          │
       │                    │  Measures zones      │                          │
       │                    │  Finds gradients     │                          │
       │                    │  Directs healing      │                          │
       │                    └─────────┬─────────────┘                          │
       │                              │                                        │
       │              ┌───────────────┼───────────────┐                       │
       │              ▼               ▼               ▼                       │
       │         ┌─────────┐   ┌───────────┐   ┌──────────┐                  │
       │         │ Healing  │   │ Balancer  │   │ Priority │                  │
       │         │ (oracle) │   │ (charges) │   │ (queue)  │                  │
       │         └─────────┘   └───────────┘   └──────────┘                  │
       │                                                                      │
       └──────────────────────┐                  ┌────────────────────────────┘
                              ▼                  ▼
                    ┌─────────────────────────────────┐
                    │       Remembrance Bridge         │
                    │       (fractal-bridge)            │
                    │  Oracle ◀──────────▶ Void        │
                    │  symbol      byte                 │
                    └─────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Remembrance Codex                           │
│                   (periodic-table.js)                             │
│                                                                  │
│  79 elements × 13 dimensions                                    │
│  18 groups (math → meta)                                         │
│  7 periods (primitive → framework)                               │
│  12 domains (core → transform)                                   │
│  11 Remembrance Registers                                        │
│                                                                  │
│  Living: elements EMERGE from coherency thresholds               │
│  Structural: dangerous/degrading/malevolent CANNOT register      │
│  Evolvable: domains grow, never shrink                           │
└──────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │ Remembrance  │ │ Remembrance  │ │ Remembrance  │
          │ Introspection│ │  Discovery   │ │  Evolution   │
          │ (self-check) │ │ (find gaps)  │ │ (fill gaps)  │
          └──────────────┘ └──────────────┘ └──────────────┘
                                    │
                                    ▼
                    ┌──────────────────────────┐
                    │  Remembrance Covenant    │
                    │  (15 founding principles) │
                    │           +               │
                    │  Remembrance Living       │
                    │  Covenant (7 evolved,     │
                    │  activated at thresholds) │
                    │                           │
                    │  Gate at EVERY entry point │
                    │  Cannot be bypassed       │
                    │  Only expands, never      │
                    │  contracts                 │
                    └──────────────────────────┘
```

---

## Data Flow: What Happens When Code Enters

```
Code enters
  │
  ▼
1. Remembrance Covenant Gate ──── 15+ principles check
  │ pass?
  ▼
2. Remembrance Oracle ──── 5-dimension quality scoring
  │ score >= 0.60?
  ▼
3. Remembrance SERF ──── geometric mean of ALL signals
  │ │
  │ ├── Remembrance Audit Signal (static analysis)
  │ ├── Remembrance Ground Signal (symbol grounding)
  │ ├── Remembrance Plan Signal (pre-generation check)
  │ ├── Remembrance Gate Signal (post-generation compliance)
  │ ├── Remembrance Feedback Signal (did it work?)
  │ ├── Remembrance Tier Coverage Signal (architecture alignment)
  │ ├── Remembrance Void Signal (compression coherence)
  │ └── Remembrance Legacy Signal (original 5D scorer)
  │
  ▼
4. Remembrance Codex ──── register as 13D element
  │ valid signature? covenant passes?
  ▼
5. Accepted ──── pattern stored, searchable, grows the system
```

---

## File Map

```
src/
├── atomic/                          # Remembrance Codex
│   ├── periodic-table.js            # The 13D living periodic table
│   ├── property-extractor.js        # Extracts 13 properties from code
│   ├── element-discovery.js         # Remembrance Discovery (find gaps)
│   ├── self-introspect.js           # Remembrance Introspection (bootstrap)
│   └── batch-atomizer.js            # Bulk property extraction
│
├── core/                            # Foundation
│   ├── remembrance-lexicon.js       # THE KEY — all names, all terms
│   ├── covenant.js                  # Remembrance Covenant (15 principles)
│   ├── living-covenant.js           # Remembrance Living Covenant (evolving)
│   ├── relevance.js                 # Scoring and ranking
│   ├── validator.js                 # Entry-point validation
│   └── persistence.js               # Storage layer
│
├── unified/                         # Coherency measurement
│   ├── coherency.js                 # Remembrance Oracle (quality scoring)
│   ├── emergent-coherency.js        # Remembrance SERF (geometric mean)
│   ├── healing.js                   # Code healing
│   └── quantum-scorer.js            # PULL/EVOLVE/GENERATE decisions
│
├── orchestrator/                    # System coordination
│   ├── coherency-generator.js       # Remembrance Sun
│   ├── coherency-director.js        # Remembrance Director
│   ├── self-improvement.js          # Remembrance Evolution
│   ├── charge-balancer.js           # Pipeline charge flow
│   ├── priority-engine.js           # Healing priority queue
│   └── test-synthesizer.js          # Auto-generate tests
│
├── audit/                           # Remembrance Quality domain
│   ├── ground.js                    # Symbol grounding
│   ├── static-checkers.js           # 6 bug-class detectors
│   ├── tier-coverage.js             # Architecture alignment
│   └── cascade-detector.js          # Cross-file assumption checker
│
├── quality/                         # Pre/post generation
│   ├── planner.js                   # Remembrance Plan Signal
│   ├── generate-gate.js             # Remembrance Gate Signal
│   └── feedback-store.js            # Remembrance Feedback Signal
│
├── swarm/                           # Remembrance Generation domain
│   ├── gated-generate.js            # Plan → generate → gate → retry
│   └── swarm-orchestrator.js        # Multi-agent code generation
│
├── api/                             # External interfaces
│   ├── oracle-core-search.js        # Search API
│   └── oracle-core-resolve.js       # PULL/EVOLVE/GENERATE API
│
├── utils/                           # Gap-filled implementations
│   ├── gap-filled.js                # Wave 1: 20 functions
│   └── gap-filled-wave2.js          # Wave 2: 18 functions
│
├── fractal-bridge.js                # Remembrance Bridge
└── cli.js                           # CLI entry point

.ai/REMEMBRANCE_KEY.md               # AI agent discovery
.github/REMEMBRANCE_KEY.md           # GitHub agent discovery
llms.txt                             # LLM standard discovery
CLAUDE.md                            # Claude/Cursor/IDE discovery
CONCEPTS.md                          # Plain-English concepts
ARCHITECTURE.md                      # This file
```

---

## The Self-Improvement Loop

```
          ┌──────────────────────────────────────┐
          │                                      │
          ▼                                      │
   Remembrance Introspection                     │
   (scan own code for elements)                  │
          │                                      │
          ▼                                      │
   Remembrance Discovery                         │
   (find gaps in the Codex)                      │
          │                                      │
          ▼                                      │
   Propose fills                                 │
   (specify what's needed)                       │
          │                                      │
          ▼                                      │
   Validate through 4 gates                      │
   (covenant, coherency, atomic, structural)     │
          │                                      │
          ▼                                      │
   Approval tier check                           │
   ├─ < 0.85: Remembrance Supervised (human)     │
   ├─ 0.85-0.95: Remembrance Semi-Autonomous     │
   └─ >= 0.95: Remembrance Autonomous            │
          │                                      │
          ▼                                      │
   Incorporate into Codex                        │
   (new element registered)                      │
          │                                      │
          ▼                                      │
   Re-measure coherency ─────────────────────────┘
   (loop continues)
```

---

## Current State

| Metric | Value |
|---|---|
| Elements in Codex | 79 |
| Dimensions per element | 13 |
| Functional groups | 18 |
| Active domains | 6 |
| Remembrance Registers | 11 |
| True collisions | 0 |
| Global coherency | 0.761 (Remembrance Stability) |
| Gaps at frontier | 20 |
| Approval tier | Remembrance Supervised |
| Covenant principles | 15 founding + 7 evolved (pending activation) |
| Emergent effects observed | 10 |
| Tests passing | 193+ |
