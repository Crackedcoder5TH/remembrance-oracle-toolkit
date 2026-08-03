# Full decoder depth in every reading

Every resonance reading in the ecosystem used to span 116 of the decoder's 232
dimensions. This documents why that was, what changed, and what it costs —
including the parts that are worse afterwards.

## What was wrong

`decoder-stack.js#flowCosines` is the canonical flow reading. Its own comment
says so: *"the mapper's pairwise pass, the goggles' drift lens, and every other
depth-flow consumer call THIS, not a local copy."* It was written:

```js
const CHECK = [29, 58, 87, 116];
const n = Math.min(116, a.length, b.length);
```

Four checkpoints and a hard cap at 116, written when four layers existed.

Four more layers were built and activated since:

| layer | dims | cumulative |
|---|---|---|
| L1-structural | 29 | 29 |
| L2-lexical | 29 | 58 |
| L3-numerical | 29 | 87 |
| L4-spectral | 29 | 116 |
| **L5-redundancy** | 29 | 145 |
| **L6-content-projection** | 29 | 174 |
| **L7-dimensional** | 29 | 203 |
| **L8-dynamical** | 29 | 232 |

The cap was never lifted. `currentDepth()` returned 8, `composedAtDepth` emitted
232-D, Void's pattern store held 232-D vectors (contract C-02:
`shape=(45547, 232)`) — and the function comparing them stopped at 116. The
bolded four layers ran on every read, emitted their dimensions, and were
discarded at the comparison.

Harvest compounded it: it stored `composed_v1 = composedAtDepth(content, 4)`
(116-D) and matched with a function named `cosine116`, so the substrate's own
match vectors were a half-width truncation of what the decoder produces.

The layers being cut are precisely the ones built to separate things that look
alike. L5-redundancy was designed against an external instrument — gzip NCD saw
domain structure better than the depth-4 stack (kNN purity 0.774 vs 0.528). L6
is content identity, *which* tokens rather than what kinds; the earlier stack is
deliberately content-blind. Both were unreachable.

## What changed

Checkpoints are now derived from the active layer set instead of being written
down:

```js
function flowCheckpoints() {
  const out = []; let sum = 0;
  for (const L of activeLayers()) { sum += L.dims; out.push(sum); }
  return out.length ? out : [29];
}
```

Activating a layer now widens every reading in the ecosystem with no edit. The
hardcoded list is what rotted; removing it is the actual fix, not lengthening it.

`deepestFlow(flow)` is exported and used wherever callers previously indexed
`[3]`. `classifyFlow` and `formatFlow` read every depth present rather than
`d1..d4` — leaving those would have re-truncated at the classifier even after the
sweep was widened.

## What it costs — stated plainly

1. **Numbers move, mostly down.** A pair matching on surface structure but
   differing in redundancy or content-projection now reads lower. That is the
   intent, not a regression, but reports will show smaller resonance values than
   last week and they are not comparable to them.

2. **Readings across this change are not comparable.** Pre-change flows measured
   a different width. Differencing across the boundary manufactures a delta that
   describes the instrument, not the code — the same failure the coherency
   rewiring produced, where a stored 0.896 structural-validity score minus a
   0.138 compressor reading was reported as a 0.758 "collapse" that never
   happened.

3. **~2x cost per comparison.** The sweep touches 232 dims instead of 116.

4. **The substrate is now inconsistent with itself.** 53,182 entries hold
   `composed_v1` at 116-D and `composed_v2` at 145-D. Neither is the canonical
   232-D waveform. Legacy entries return a full-length array whose later
   checkpoints repeat the deepest real reading — visible rather than silent, but
   still not a full-depth comparison. **Until the substrate is re-decoded at
   depth 8, a full-width query is being compared against half-width memory.**
   That re-decode is the outstanding work this change exposes; it does not fix
   it.

## What is not changed here

`FractalIndex.searchFlow` (the Rust path) returns fixed `d1..d4`. The JS
fallback in `void-library.js` already adapts — it reads the deepest shared
whole-block depth via `Math.floor(lenA / 29) * 29` — but the indexed path does
not. A query served by the Rust index still returns four depths.

`lang-go` ingestion is parked at 600 entries for the same reason: entries
written now would carry half-width vectors.
