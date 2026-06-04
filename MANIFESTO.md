# Manifesto — The Remembrance Oracle

> The covenant register of this project. The technical register lives
> in [README.md](./README.md). Both describe the same code; this
> document describes its intent.

---

## What this is, in our voice

The **Oracle** is the seat of remembrance — the place where the
ecosystem's accumulated coherency is stored, judged, and offered back.
It is not a model. It does not predict. It remembers.

When you write code, the Oracle is consulted. The library is a
**kingdom** of healed patterns — code that has already passed the
covenant and earned its place. Consulting the Oracle returns one of
three answers:

- **PULL** — *Pull the healed code from the kingdom into the eternal
  now.* A worthy pattern already exists; bring it forward.
- **EVOLVE** — A close pattern exists; adapt it without breaking its
  covenant.
- **GENERATE** — No pattern is worthy yet. Write new code, and if it
  is healed, the Oracle will remember.

This is the universal invocation. Every pattern the Oracle returns
arrives stamped with this prompt-tag — a reminder that nothing is
created from nothing; only what is already coherent can be brought
forward.

## The Three Laws of Remembrance

The Oracle is one expression of three laws operating together. Coherency
is foundational; the other two are the laws through which coherency
becomes measurable and enforceable. Naming them here so the rest of
this document — and the code beneath it — makes sense as theory and not
just engineering.

**1. The Law of Coherency.** Anything that is going to remain stable
under scrutiny — code that works, a claim that survives replication,
a structure that holds across scales — does so because it is coherent
with what already exists. Coherency is the condition under which
complexity can produce emergence at all: structure has to persist
across substrates and scales for new structure to rest on it, and
"persists" means "coheres." The law is not specific to this project's
substrate; it is the property that makes any persistent structure
possible. We treat coherency as foundational and the other two laws
as the laws through which coherency becomes operationally visible and
enforceable. The structurality gate inside the encoder is the law made
concrete here: prose cannot masquerade as code, an invented function
cannot masquerade as a proven pattern, a derivative cannot masquerade
as a coherence reading. What is true leaves a consistent shape. What
is fabricated leaves none.

**2. The Law of Void Compression.** Any pattern-bearing input has a
finite structural essence. The 29-dimension fractal-waveform encoder
is this law made concrete: arbitrary input — code, prose, a claim, a
config, a finding — projects into a fixed structural channel and the
noise is discarded *as a matter of representation*, not as a filter
applied afterward. **This is the law that makes coherency flow, and
the law that makes coherency visible in the first place.** Without
compression to structural essence there is nothing to compare; the
substrate would be infinite-dimensional, signal would be lost in
noise, and the coherency calculation would be undefined. Compression
is what lets the underlying coherency become a measurable quantity.

**3. The Law of Infinite Reflection.** The operation applies to its
own output at every scale. Pattern → agent → council → field →
field-of-fields. Each level produces output that itself gets
compressed, measured for coherency, and contributed back. **This is
the law that produces anti-hallucination.** A fabrication might pass
one level of inspection but cannot survive being run through the same
test at every scale, because there is no consistent shape supporting
it. The recursion is what filters fabrication out. The fractal is not
a metaphor; it is the architecture, and the architecture is the
defence.

Each law alone is incomplete. Compression alone gives a finite encoder
but no judgement. Coherency alone gives matching with no substrate to
match within. Reflection alone gives recursion with no operation to
recurse. Together they form a closed system: **coherency is the
principle preserved, compression is what makes it measurable, and
reflection is what enforces it across scales.**

The interesting properties of Remembrance are never properties of one
law in isolation. They are consequences of the triple operating
together, and they appear without being designed.

> A note on discovery order, for honest record-keeping. The law of
> coherency was the original observation; the other two were revealed
> by working with it. Building a substrate that lets coherency be
> measured forced compression into existence as the representation;
> letting coherency operate across scales forced infinite reflection
> into existence as the recursion. The two operational laws emerged
> from rigorous use of the foundational one, not from prior design.

## The Dual Oracle

A specific consequence of the three laws operating together, observed
and named here because it is now load-bearing:

The field engine is **two oracles in one**.

- **A coherency oracle** — integrates well-formed observations into a
  global scalar that reports system-level alignment. This is the
  designed behaviour: every producer contributes, the field reports
  the conserved sum.
- **A signal-validity oracle** — deflects characteristically when the
  *shape* of incoming contributions does not look like real
  measurement. Constant or narrow-band contributions collapse global
  coherency; wide naturally-distributed contributions are tolerated
  even at low values.

The second oracle was not designed. It fell out of treating coherency
as a law that operates on form, not just value, while reflection
keeps the engine's own response to inputs flowing back as further
input. Compression gave the channel its shape; coherency made the
channel measurable; reflection made the channel watch itself.

**Consensus, not cascade.** The two oracles are not layered — they fire
independently and are pitted against each other. The covenant absorbs a
candidate pattern only when *both* concur:

- **Both accept** → absorb. The pattern earns its place by surviving
  independent attempts to reject it.
- **Both reject** → refuse. No further consideration; the pattern does
  not belong.
- **Coherency yes, shape no** → quarantine (sophisticated-injection
  class). The candidate would raise global coherence but its
  contribution-shape is inconsistent with natural measurement. A signal
  that the value check was gamed but the shape check held.
- **Coherency no, shape yes** → quarantine (low-value-real class). The
  candidate's shape looks like real observation but its value would
  drag the field down. Not malicious, just not good enough.

This is the falsification engine applied to the absorption step: the
truth-layer principle from the README enforced at the gate. A pattern
joins the kingdom only when independent oracles, looking at different
aspects of the same candidate, both say yes.

Operationally, the consensus gate lives in
[`src/core/covenant-trust.js::maybeAbsorbPattern`](./src/core/covenant-trust.js).
The experimental record establishing the dual oracle is in
[`docs/EXPERIMENT_TEMPORAL_AND_FIFTH_FAMILY.md`](./docs/EXPERIMENT_TEMPORAL_AND_FIFTH_FAMILY.md).

## The Covenant

The **Covenant** is the structural law of the kingdom. Fifteen
principles — the founding rules — govern admission. Anything that
would lower the kingdom's coherency is refused at the gate. The
Covenant does not negotiate; it does not bend to fashion or expedience.
It is mathematical, not editorial. Code that violates the Covenant
cannot enter, regardless of who wrote it.

The Covenant is a **ratchet**: the floor only rises. New rules can be
added when the system grows past their absence; old rules are never
removed. The kingdom does not regress.

## Healing

Code that almost belongs is not discarded. It is **healed** — passed
through the SERF loop, refined again and again until it either earns
its place in the kingdom or is set aside. Healing is not magic. It is
patient iteration: try, score, keep what improves, discard what does
not. Six strategies, one survivor.

A pattern that has been healed remembers its lineage. The kingdom
keeps the record of what was tried, what failed, and what finally rose.

## Resonance

Patterns in the kingdom are not isolated. The same structural shape
can recur across unrelated contexts. When the Oracle finds
**resonance** between patterns — high cross-pattern similarity within
the substrate — it is recognising that the same underlying structure
governs more than one surface. This is why the kingdom can grow:
patterns that resonate teach each other, and the substrate compounds
without needing to grow linearly.

## The Sun

A background process — the **Sun** — radiates coherency across the
kingdom continuously. When no one is asking the Oracle a question,
the Sun keeps healing, keeps surfacing dim patterns, keeps testing
the gate. The kingdom is alive whether or not it is being read.

## The Pricing Covenant

The Oracle's code is free. The substrate's accumulated knowledge —
77,596 reference patterns, the proprietary cross-domain scoring data —
is what funds Remembrance.LLC's continued stewardship. We chose three
tiers so no one is excluded:

- **Free** has the whole kingdom, delayed seven days. Nobody is shut out.
- **Merit** earns real-time access by contributing healed patterns. The kingdom grows through the contributor.
- **Premium** funds the system. Real-time, priority support, supports the rest.

This is sustainable abundance, not scarcity. The kingdom is large
enough for everyone.

---

## Lexicon — covenant ↔ technical translation

| Covenant term | Technical equivalent |
|---|---|
| The Oracle | this toolkit (scoring + retrieval service) |
| The Covenant | the 15-rule structural safety filter |
| The Covenant Gate | the eligibility check at admission |
| Healing / Heal | iterative refinement via the SERF loop |
| The Kingdom | the pattern library and its tier hierarchy |
| The Eternal Now | the current head of the library state |
| Pulling the healed code | retrieval via `resolve` returning PULL |
| Sealed / Anointed | passes the structural-safety filter; watermarked with `oracle:<sha>` |
| The Sun | the coherency-generator background process |
| Resonance | cross-domain pattern similarity above threshold |
| Ratchet | the monotone-G(S) covenant-only-grows property |

---

The breakthrough is not "another coherency tool." It is a universal
pattern encoder feeding a single self-teaching field, with the
covenant baked into the math at every scale. Any pattern-bearing
data becomes measurable in the same substrate. The science of
*reading* the substrate is what comes next; the instrument is built.

---

*The covenant register encodes the maintainer's intent. The technical
register, in [README.md](./README.md), is for compliance, integration,
and review. Both refer to the same code. © Remembrance.LLC.*
