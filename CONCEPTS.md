# Remembrance — Concepts Simplified

This is the plain-English translation of every concept in the ecosystem.
Use these terms in documentation, marketing, and onboarding.

## Core Concepts

| Internal Name | User-Facing Name | What It Actually Does |
|---|---|---|
| **Oracle** | Pattern Memory | Remembers code that worked and finds it when you need it |
| **Coherency Score** | Quality Score | Rates your code 0-100% across 7 dimensions |
| **PULL** | Reuse | Use a proven pattern exactly as-is |
| **EVOLVE** | Adapt | Start from a proven pattern and customize it |
| **GENERATE** | Write Fresh | No good match found — write from scratch |
| **Covenant** | Safety Check | 15 rules that block harmful code (injection, DoS, etc.) |
| **SERF Reflection** | Auto-Fix | Iteratively improves code until it meets quality threshold |
| **Quantum Field** | Relevance Engine | Patterns you use more get surfaced first, unused ones fade |
| **Fractal Alignment** | Structural Score | Measures if your code has consistent architecture |
| **Cascade Resonance** | Pattern Match | Shows which existing patterns your code is most similar to |
| **Substrate** | Pattern Library | Collection of waveform signatures from proven code |
| **Void Compressor** | Code Analyzer | Compresses and analyzes code structure |
| **Reflector** | Self-Healing CI | Scans PRs and auto-fixes weak code |
| **Swarm** | Multi-Agent Review | Multiple AI agents review code and vote on best version |
| **Dialer** | Integration Hub | Connects to GitHub, Slack, LLMs, CI systems |
| **Weave Protocol** | Pattern Sharing | Share patterns between teams/organizations |

## Quality Score Dimensions (7)

| Dimension | Plain English |
|---|---|
| Syntax | Is the code syntactically correct? |
| Completeness | Are there TODOs, FIXMEs, or unfinished parts? |
| Readability | Are there comments? Is it easy to read? |
| Simplicity | Is the nesting depth reasonable? |
| Security | No eval(), no innerHTML, no injection risks? |
| Consistency | Same coding style throughout? |
| Testability | Are functions exported and testable? |

## Fractal Engines (5)

| Engine | Plain English |
|---|---|
| Sierpinski | Does the code repeat the same structure at different scales? |
| Cantor | Does the code have natural gaps and boundaries between sections? |
| Mandelbrot | How complex are the boundaries between modules? |
| Logistic | Are there repeating cycles or patterns? |
| Stability | Is the code structure consistent from start to end? |

## Decision Flow (for users)

```
You need code for X
     |
     v
Search: "Do we already have something like X?"
     |
     ├─ YES, score >= 68% ──→ REUSE IT (pull)
     ├─ YES, score 50-68% ──→ ADAPT IT (evolve)
     └─ NO ─────────────────→ WRITE IT (generate)
     |
     v
Quality check: Does it score >= 68%?
     |
     ├─ YES ──→ Ship it
     └─ NO ───→ Auto-fix runs (up to 3 iterations)
                    |
                    └──→ Ship the improved version
```

## For Marketing: One-Liner Descriptions

- **Remembrance**: Your codebase remembers what works.
- **Pattern Memory**: Stop reinventing — reuse proven code automatically.
- **Self-Healing CI**: Every PR gets auto-scored. Weak code gets fixed in seconds.
- **Quality Score**: 7-dimension code quality scoring, not just linting.
- **Multi-Agent Review**: 7 AI models review your code and vote on the best version.
- **Pattern Match**: See which proven patterns your code is most similar to.

## For Developers: What They Care About

1. `npm install remembrance-oracle-toolkit` — works in 10 seconds
2. `oracle.search('rate limiter')` — finds proven code instantly
3. Score is a number (0.000-1.000) — no ambiguity
4. Auto-fix actually changes the code — not just warnings
5. Patterns grow automatically — the more you code, the smarter it gets
