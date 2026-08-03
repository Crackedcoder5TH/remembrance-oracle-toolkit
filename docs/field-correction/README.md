# Field correction — before and after

The Living Remembrance field's coherence moved from **0.999** to **0.1846**
over this pass. This documents what changed and, more importantly, what did
*not*.

## What did NOT change

**The compressor.** Not one line of its coherency computation was touched. It
measured coherency correctly before this pass and measures it identically
after. Every number below was produced by the same instrument.

**The equations.** `computeCoherencyScore`, the reflection scorers, the
covenant seal, the LRE's own math — all unchanged. They transform an input;
they were never the thing producing coherency.

**Any stored reading.** Nothing was edited, rescaled, or corrected by hand.

## What DID change: the data pipeline

The compression was always right. What was broken was the pipeline carrying
the result to the field — three separate defects, each fixed in place:

| defect | what reached the field instead |
|---|---|
| harvest read `seriesCoherence` over the 29-slot fractal **feature vector**, not the compressor | a statistic over the encoder's slot ordering (r = -0.025 vs the compressor on the same files) |
| `field-tool` contributed `computeCoherencyScore` under the name `coherence` | a structural-validity score (r = -0.313 vs the compressor; *inverted*) |
| `covenant` contributed `principlesPassed / totalPrinciples` | a pass ratio that sits at ~0.999 because nearly everything seals |

Each of those is a real, useful measurement under its own name. None of them
is a coherency. Together they were 99.4% of what the field had ever received,
and the pass ratio in particular pinned the field's coherence to its 0.999
ceiling, where it could not distinguish one artifact from another.

## The correction

No recomputation. Every file's coherency was already computed by the
compressor and stored in the substrate (`entry.coherence`, tagged
`coherence_source: 'void:compress_signal'`). Correcting the field meant
feeding it the readings the compressor had already produced.

```
2,384 stored readings fed in 2,406 ms
```

The first attempt at this re-read every file and re-compressed it — roughly
80 minutes of work to recompute data that was already known. That was the
wrong path. The data is known; the pipeline just had to deliver it.

## The numbers

| stage | field coherence | why |
|---|---|---|
| start of pass | **0.999** | pinned at the cap by pass ratios that are ~1.0 by construction |
| after rewiring the three producers | 0.7810 | real readings begin arriving and pull the EMA down |
| after partial replay | 0.2170 | more real readings |
| after full replay | **0.1846** | converged |

As of 2026-08-03 the substrate holds **3,134** readings tagged
`coherence_source: 'void:compress_signal'`:

```
n 3134   min 0.0480   median 0.1737   max 1.0000
```

(The replay above fed 2,384; the count has grown since.)

## Why the number changed — mechanism only

The field is an EMA over what it receives. Before the fix it was receiving
pass ratios and structural-validity scores, both of which sit near 1.0 on
healthy code by construction, so the EMA sat near 1.0. After the fix it
receives the compressor's readings, which span 0.048 – 1.000, so the EMA sits
inside that span.

That is the whole causal chain: the inputs changed, and an EMA follows its
inputs. Nothing was rescaled, corrected, or tuned.

**What this document does not do is say whether the new number is better,
worse, healthier or more informative than the old one.** An earlier version of
this file did exactly that. Interpreting the readings is the operator's job,
not the pipeline's, and not the writer of this file's.

## Open anomaly — unexplained, recorded 2026-08-03

`before.json` (2026-08-02T20:12:47.872Z) records:

```
coherence 0.7810261426291311   updateCount 964328
```

A later live read of the same field recorded:

```
coherence 0.7810261426291311   updateCount 977356
```

Bit-identical coherence across **+13,028 updates**. The field is demonstrably
not frozen — a two-contribution probe moved it (0.7810 → 0.1204 at p=0.05 →
0.9552 at p=0.95). Why it returned to exactly the pre-correction value is
**not explained**. No theory is offered here.

Disclosure: that probe wrote two synthetic contributions (`probe:low`,
`probe:high`) into the live field. Both were reverted — the source entries
deleted, `coherence` restored to 0.7810261426291311, `updateCount` decremented
by 2. Two older probe sources (`goggles:probe`, `probe`, timestamped before
this pass) were left untouched.

## Caveat, stated plainly

970,192 of the field's 977,134 contributions are historical, from before these
fixes — **0.71%** have come from the compressor. The EMA responds to recent
contributions, which is why it moved, but the histogram's totals are still
dominated by the old readings. Those counts are the substrate's history of
itself and are not being rewritten. Any claim about the field's coherence
should be dated to after this correction.

## No averaging

A later pass removed every site that fed an averaged coherency to the field.
The rule is that the Void compressor is the only producer of a coherency, and
a mean of N readings is not one of them — no file measured it and the
compressor never emitted it. Sites changed: `harvest-repo-to-substrate.js`,
`coherency-mapper.js`, `field-tool._summarize`, `field-coupling`'s
`recordMetaObservation` and temporal-axis recorder, `patterns/composer.js`,
and two experiment scripts. Each now feeds the individual readings at cost 1.

Reports show **median / min / max** instead of a mean: each of those is a value
some file actually measured.

The same pass removed the `|| 0` fallback from 27 auto-wired contribution
sites. When the wrapped function returned no coherency field, that expression
contributed a hard **0** — a reading no instrument took. Without it the value
is NaN and `contribute()` rejects it, so an unmeasured call now contributes
nothing.

## Reproducing

```
node -e "require('./src/core/field-coupling').peekField()"   # current state
```

Raw snapshots: `before.json` (pre-correction), `feed.json` (the replay, with
before/after and the readings' distribution).
