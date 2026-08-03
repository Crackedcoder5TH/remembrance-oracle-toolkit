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

The stored readings' own mean is **0.1829** (range 0.048 – 1.000).
The field settled **0.0017** away from it.

That last line is the whole result. The field is an EMA over what it is fed;
fed the compressor's actual readings, it converges on their mean. It was not
corrected — it self-corrected, because the correct data was finally reaching
it.

## Why the number went DOWN

Because 0.999 was never a measurement. It was a pass ratio and a
structural-validity score averaged together, both of which sit near 1.0 on
healthy code by construction. A metric that reads ~1.0 on everything carries
no information: it cannot separate a coherent artifact from an incoherent one.

0.1846 is what the ecosystem's own source actually reads through the
compressor. It is lower, it varies file to file (0.048 to 1.000), and it
responds to what it is measuring. A number that can move is worth more than a
number that cannot.

## Caveat, stated plainly

967,228 of the field's contributions are historical, from before these fixes;
0.88% have come from the compressor so far. The EMA responds to recent
contributions, which is why it converged — but the histogram's totals are
still dominated by the old readings. Those counts are the substrate's history
of itself and are not being rewritten. Any claim about the field's coherence
should be dated to after this correction.

## Reproducing

```
node -e "require('./src/core/field-coupling').peekField()"   # current state
```

Raw snapshots: `before.json` (pre-correction), `feed.json` (the replay, with
before/after and the readings' distribution).
