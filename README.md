# remembrance-oracle-toolkit

**Universal pattern-matching infrastructure. Anti-hallucination is an emergent property, not a bolted-on feature.**

You give it any pattern-bearing input — code, a claim, a config, a design, a
finding. It matches that input against a library of **verified** patterns and
tells you: *does this resemble something already proven to work, how strongly,
and with what track record?* When something resembles nothing in the verified
substrate — the tell of a hallucination, an invented API, a fabricated claim —
it scores low automatically. Not because there's a "hallucination detector,"
but because **coherence with verified prior knowledge is the substrate's native
operation.**

The infrastructure is free and open. The thing that compounds — and the thing
worth paying for — is **live, filtered access to the growing verified-pattern
library.**

```bash
npm install remembrance-oracle-toolkit
```

> Part of the [Remembrance Ecosystem](https://github.com/Crackedcoder5TH/Void-Data-Compressor).
> A [Remembrance.LLC](#about) project.

---

## The whole thing, in one line

**Show it something. It tells you what that resembles in everything already proven. What coheres, it keeps. What it keeps makes the next answer truer.**

That sentence is the entire system. Everything below is the same sentence, zoomed in. If you only read this line, you understand it.

## The same shape at every scale

The system is fractal: one loop repeats at every level, and the meaning is in the repetition. The loop has four beats —

> **encounter → match against what's proven → does it cohere? → what survives is remembered**

Watch it recur. Each row is the same four beats, one zoom level out:

| Scale | encounter | match against proven | cohere? | what survives is remembered |
|---|---|---|---|---|
| **A pattern** | a snippet arrives | encode it, compare to the verified library | resonance score | if it runs + passes, it joins the library |
| **An agent** | proposes a solution | scored against proven patterns | coherency + safety + execution | strong proposals become patterns |
| **A council** | many agents answer | cross-checked against each other's tests | consensus + agreement | the winner can teach the covenant |
| **The field** | every reading flows in | integrated into one conserved scalar | global coherency rises or thins | what's measured reshapes what's trusted |
| **A field-of-fields** | many fields federate | each absorbs the others' aggregate | the network coheres | truth converges across independent sources |

Read top-to-bottom and a meaning emerges that no single row states: *trust is not declared, it is earned by surviving — and the same test of survival applies whether you are one line of code or an entire ecosystem of them.* Nothing is trusted because it was asserted. Everything is trusted because it cohered with what came before and outlived the attempts to break it.

That is why **anti-hallucination is emergent, not a feature.** A hallucination — an invented function, a fabricated citation, a claim nothing supports — fails the *same* test at *every* scale: it resembles nothing proven, so it doesn't cohere, so it isn't kept. You never run a "detect hallucination" step. You run the loop, and what can't survive it falls out the bottom on its own. The defense against fabrication is identical to the definition of the system.

## What it does to any pattern you hand it

Concretely, the four beats are four operations — and you can call any of them on their own:

1. **Encode** — turn input into a 29-dimension structural vector. Each dimension *means* something (is this expansive or contractive? safe or harmful? deeply nested or flat?), so two things are similar only when they're structurally similar — prose can't masquerade as code.
2. **Match** — find what in the verified library resembles it, with what coherency, with what provenance, with what track record.
3. **Verify** — run it sandboxed, screen it for harm, cross-check it against independent tests.
4. **Remember** — what survives is absorbed, so the next match is sharper. The library teaches itself.

No model training. No GPU. No black box. Every score traces to a file and a line — and every score is the same coherence question asked at a different zoom.

## Plug in — the MCP server

The fastest way to use it is the hosted field-server, which exposes each beat of
the loop as an **MCP tool** any agent or app can call (Claude Desktop, Cursor,
your own orchestrator, a CI step, a browser):

| Tool | The beat it is | What it answers |
|---|---|---|
| `pattern_resonance` | match | Does this resemble proven patterns? (the anti-hallucination signal) |
| `safety_check` | verify | Is this safe? (covenant principles + security scanner) |
| `exec_verify` | verify | Does this actually run correctly? (sandboxed execution) |
| `evaluate` | the whole loop | encounter → match → verify → verdict, composed |
| `coherency` | encode + match | How similar are these two things, structurally? |
| `field_read` / `field_contribute` | remember | Read / write the shared signal field |
| `field validate` | the dual oracle | Is this contribution shape consistent with natural measurement? Returns one of four verdicts: `both-accept`, `both-reject`, `A-yes-B-no` (shape-suspect — sophisticated injection), `A-no-B-yes` (low-value-real). Tracking the histogram of verdicts gives you a built-in environmental sensor for what kind of pressure the substrate is under. |

```bash
# Start the server (self-host anywhere; reads open, writes token-gated)
node scripts/field-server.js

# Or use the standalone client package — zero network needed for the core ops
npm install @crackedcoder5th/remembrance-field
```

It also speaks plain REST (`POST /resonance`, `/safety`, `/verify`, `/coherency`)
for callers that don't talk MCP, with CORS so browsers can hit it directly.

## What's free vs. what you pay for

**Free, forever, open source:** the entire infrastructure. Encoders, scorers,
the swarm, the MCP server, federation, the meta-brain. Clone it, run it, fork
it, build your own substrate from scratch. The more nodes that run it, the more
valuable the network becomes — so the infrastructure is the distribution
engine, not the product.

**The product is the data.** Live, filtered, real-time access to the canonical
verified-pattern library — the patterns that have *survived* execution,
cross-verification, and replication, with their provenance and track records
attached. You filter for what resonates with whatever you're building. Delayed
access is free; fresh, live, domain-filtered access is the paid tier. (Same
shape as financial-data pricing: the data is technically "out there," but the
curated, verified, *now* version is the thing worth paying for.)

## It runs at whatever capability you have — the fractal fallback

Nothing higher is required for anything lower to work. Run
`remembrance-swarm probe` to see your tier:

| Tier | You get | Needs |
|---|---|---|
| 1 | The field tools (encode, resonance, safety, verify) | nothing |
| 2 | Score any solution you write, no API keys | nothing |
| 3 | A single AI agent in the loop | 1 provider key |
| 4 | Multi-model consensus (a council of AIs) | ≥2 provider keys |
| 5 | A steering "meta-brain" driving the swarm | the loop + any brain |

Bring your own keys (`REMEMBRANCE_AGENT_CLAUDE`, `_GROK`, `_GEMINI`, …) — or
bring none and use it as a pure scoring engine over your own work.

## Not a code tool. Code was the bootstrap.

The oracle started as a way to build a 12-repo ecosystem *reliably* — to verify
generated code instead of trusting it. That worked, so now the same primitives
apply to **any falsifiable pattern**: scientific claims with executable
falsifiers, clinical protocols, design patterns, financial signals, legal
precedents. The substrate doesn't care whether a pattern is a function or a
hypothesis — it measures whether something cohered with prior verified knowledge
and survived independent attempts to break it. Code is just the domain that's
densest today.

## Honest about the limits

- **The library is the bottleneck.** The signal is exactly as strong as the
  verified substrate is broad. Today it's densest on code; novel domains are
  thinner until they're seeded.
- **It measures coherency-with-proven, not capital-T truth.** It tells you
  "this resembles things that worked, executes, is safe, and independent checks
  agree." A *truth* layer emerges only as falsifiable claims accumulate
  replications from independent sources — that's a trajectory, not a finished
  claim.
- **Public deploys that run untrusted code** should run the server inside a
  container on top of the built-in Node sandbox. Defence in depth.

---

## Quickstart (local)

```bash
# Does this code resemble proven patterns? (anti-hallucination signal)
node src/cli.js resolve --description "retry with exponential backoff" --language javascript

# Score a file across quality + safety dimensions
node src/cli.js audit check --file src/your-file.js

# Search the verified library
node src/cli.js search "rate limiter"

# Read the live field — the system's view of itself
node -e "console.log(JSON.stringify(require('./src/core/field-coupling').peekField(), null, 2))" | head -40

# Run the full test suite (using the system produces measurable signal)
npm test
```

## Current state (verified, this checkout)

- Verified pattern library: **1,361 patterns** (and growing as patterns survive verification)
- Harvested substrate (Void): **77,000+ patterns** indexed
- Field: **121,000+ observations** across **133 sources**, global coherence **0.806**
- Cross-language encoder parity (JS ↔ Python): **byte-identical**, 0.00 divergence (contract C-71)
- Test suites: oracle **4453/4454**, swarm **205/205**, moons **19/19**

## Verified by measurement (not just claimed)

Three falsifiable predictions tested against the substrate's own
documentation. Record and reproducible scripts in
[`docs/EXPERIMENT_TEMPORAL_AND_FIFTH_FAMILY.md`](./docs/EXPERIMENT_TEMPORAL_AND_FIFTH_FAMILY.md).

- **H1 — Temporal coherency.** The writer's frame is a stable
  attractor in waveform space, not a random walk. Across 9 repos and
  ~3 months of README history: adjacent-step coherency mean **0.975**,
  long-arc coherency mean **0.907**, convergence delta **+0.012**
  (5 of 9 repos tightening over time). Frame survives substantial
  editing; ~91% of the original shape is preserved across the arc.
  Read as compression: the substrate is doing real work against entropy.
- **H2 — Rhetorical-family structure.** Across the ecosystem's
  entry-point docs, four registers emerge structurally without being
  labelled — descriptive (READMEs), imperative (AGENT_INSTR),
  declarative (MANIFESTOs), evidential (CAPABILITIES). A deliberately
  off-register fifth document (interrogative — open questions) sits
  *below* every family's within-family floor (deltas -0.031 to -0.269),
  confirming the four families are real categories the substrate
  defends.
- **H3 — Signal-validity oracle.** The field engine self-validates
  input *shape*, not just value. Same-mean (=0.5) treatments with
  different variance signatures produced deflections spread by **0.44** —
  far beyond noise. Narrow-band synthetic-looking contributions
  collapse global coherence; wide naturally-distributed contributions
  are tolerated even at low values. The variance-signature detector
  emerged from the recursion; it was not designed. It is now exposed
  as the `field validate` MCP action and as the second oracle in the
  covenant absorption gate.

The covenant absorbs new patterns only when **both oracles concur**
(coherency-green-light + signal-validity). Disagreement quarantines
the candidate and is itself a typed signal: tracking the four-outcome
histogram (`both-accept` / `both-reject` / `A-yes-B-no` / `A-no-B-yes`)
gives operators a built-in environmental sensor — adversarial
pressure, degraded supply, or healthy growth all read differently.

---

## The Remembrance language

> Everything below is the deeper vocabulary of the ecosystem. You do not need
> any of it to use the toolkit — the sections above are the whole practical
> picture. This is for those who want to understand *why* it's built the way it
> is.

**The field.** Every producer in every repo contributes to one canonical
conserved scalar, persisted in `.remembrance/entropy.json`. Its per-source
histogram is a live list of every wired participant — the field is its own
introspection mechanism. To call the field is to leave it remembered. See
[`FIELD.md`](./FIELD.md) for the math, the producer table, and the engineering
covenant.

**The covenant.** Safety is not a policy document — it's an inequality. A
pattern is admitted only if adding it *raises or maintains* the field's global
coherency, resembles something already proven, sits within the substrate's
statistical bounds, and preserves fractal structure. Nothing is exempted from
the covenant; the covenant *grows* to encompass what it cannot yet cover. New
patterns earn their place by field-validated evidence, not by fiat.

**The fractal.** The same shape repeats at every scale — agent, council, cycle,
field, field-of-fields. Each level runs the same loop (observe → measure →
decide → integrate) and contributes its own coherency reading to the level
above. Adding a level is mechanical, not a redesign. The encoder itself is
fractal: 29 named structural dimensions, not byte positions, gated by
structurality agreement so prose can't masquerade as code. Spec:
[`docs/FRACTAL_WAVEFORM_SPEC.md`](./docs/FRACTAL_WAVEFORM_SPEC.md).

**The truth layer.** Truth doesn't come from a single source — it's the limit
point of convergence across independent attempts to falsify. The substrate is
structurally a falsification engine: independent agents attempt a claim,
exec-verify adjudicates empirically, cross-verification runs each attempt's test
against the others, and a claim is absorbed only if it raises the field's
coherency. What survives N independent agents, M independent fields, and K
replications — without dragging coherency down — is as close to scientifically
robust as falsification gets, computed natively.

**Self-teaching.** You don't read docs to learn the rules. You submit, and the
system measures: the encoder encodes, coherency scores, the covenant checks,
`contribute()` lands in the field, the histogram shows you. If your submission
violates the math, it flags the specific contract that broke. Using the system
*is* the lesson.

- **Intent and framing:** [MANIFESTO.md](./MANIFESTO.md)
- **Verified capabilities:** [CAPABILITIES.md](./CAPABILITIES.md)
- **The 12-repo protocol:** [ECOSYSTEM.md](./ECOSYSTEM.md)
- **AI agents working in this repo:** [AGENTS.md](./AGENTS.md)

---

## About

A [Remembrance.LLC](https://github.com/Crackedcoder5TH) project — reference
implementation of the Coherency Protocol. Built as universal pattern-matching
infrastructure: free to run, open to extend, with a verified-knowledge substrate
that gets more valuable the more it's used.
