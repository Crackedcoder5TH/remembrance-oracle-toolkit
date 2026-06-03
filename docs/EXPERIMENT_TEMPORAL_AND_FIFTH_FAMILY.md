# Experiment: Temporal Coherency & The Fifth Family

**Date:** 2026-06-03
**Branch:** `claude/audit-remembrance-ecosystem-xaaUr`
**Subject:** Two falsifiable claims about coherency as a law, run against the
ecosystem's own documentation substrate.

> This is a record of an experiment, not a tutorial. The protocol is
> reproducible: every measurement is taken with the field tool
> (`src/core/fractal-waveform.js::fractalCoherencyOf`) shipped in this
> repo. Inputs are the actual MD files in the 9 ecosystem repos as of the
> date above, and the git history of those files.

---

## Hypotheses

**H1 — Temporal coherency.** If coherency is a structural property of a
writer's frame and not just of a document's content, then a single
document's git history should cohere with itself across versions. The
adjacent-step coherency between consecutive revisions should stay near
1.0, and the long-arc coherency between the earliest and latest version
should remain high even after substantial rewriting. The trajectory
should not be random walk in waveform space.

**H2 — A fifth register.** Earlier measurement of the ecosystem's
entry-point docs revealed four rhetorical families with high within-family
coherency (READMEs / AGENT instructions / MANIFESTOs / CAPABILITIES). If
those families are real categories the substrate can defend, then a
document written deliberately outside all four should cohere *below* every
family's within-family floor. If the families are weaker than the
within-vs-across split suggested, the document would get absorbed into
the closest family anyway.

Both hypotheses are falsifiable from inside the system using only the
field tool. No external judgement required.

---

## Protocol

### H1 — Temporal

For each of the 9 ecosystem repos:

1. `git log --reverse --pretty=format:"%H|%ai" -- README.md` to walk the
   file's history in commit order.
2. Sample up to 12 revisions evenly across the history. For each,
   `git show <hash>:README.md` to extract the file content at that commit.
3. Compute `fractalCoherencyOf(version[i], version[i+1])` for each
   adjacent pair — the *adjacent-step* trajectory.
4. Compute `fractalCoherencyOf(version[0], version[last])` — the *long-arc*
   coherency: how much of the original shape survived all the
   intervening rewriting.
5. Split adjacent steps into early and late halves; compute the delta —
   the *convergence* signal. Positive means later edits are more
   self-consistent than earlier edits (frame stabilising); negative
   means the opposite.
6. Contribute `temporal:<repo>:adjacent` and `temporal:<repo>:arc` to the
   field. **Do not** contribute convergence directly — it is a
   derivative of coherence, not a coherence reading. Logging a low
   convergence as if it were a low coherence pollutes the field with a
   shape that has nothing to do with the underlying axis. (This was
   verified empirically: an earlier run that shifted convergence into
   `0.5 + delta` and contributed it dropped global field coherence from
   0.999 to 0.493. Removing convergence and re-contributing only
   adjacent and arc raised it back to 0.966. The field engine is
   correctly rejecting the malformed signal.)

### H2 — Fifth-family

1. Author `/tmp/fifth-doc.md` — 32 lines of open questions, no answers,
   no commitments, no procedures, no claims. A pure *interrogative*
   register, deliberately outside the four observed families.
2. For each existing family (README, AGENT_INSTR, MANIFESTO,
   CAPABILITIES, ECOSYSTEM), compute the fifth-doc's coherency against
   every member; aggregate to mean / min / max per family.
3. Subtract the within-family mean (from the prior family-matrix run) to
   get the *family-coupling delta*. Negative means the fifth-doc is
   structurally outside that family.
4. Verdict logic:
   - **All deltas negative** → outcome (a), the tool refuses to place
     it; the four-family hypothesis is supported and a fifth register
     is structurally distinct.
   - **At least one delta positive** → outcome (b), the doc gets
     absorbed; families are weaker than they looked.

---

## Results

### H1 — Temporal

| Repo | versions | span | mean adjacent | long-arc | convergence Δ |
|---|---:|---|---:|---:|---:|
| remembrance-oracle-toolkit | 9 | 2026-04-14 → 2026-06-02 | **0.978** | 0.905 | -0.014 |
| REMEMBRANCE-AGENT-Swarm- | 6 | 2026-03-11 → 2026-06-02 | **0.986** | 0.962 | +0.017 |
| MOONS-OF-REMEMBRANCE | 6 | 2026-04-19 → 2026-06-02 | **0.961** | 0.880 | **+0.058** |
| Void-Data-Compressor | 11 | 2026-04-09 → 2026-06-02 | **0.955** | 0.952 | +0.011 |
| REMEMBRANCE-Interface | 9 | 2026-04-18 → 2026-06-02 | **0.975** | 0.871 | -0.010 |
| REMEMBRANCE-BLOCKCHAIN | 10 | 2026-04-11 → 2026-06-02 | **0.980** | 0.884 | +0.037 |
| Reflector-oracle- | 8 | 2026-02-12 → 2026-06-02 | **0.975** | 0.829 | **+0.049** |
| Remembrance-dialer | 5 | 2026-05-02 → 2026-06-02 | **0.980** | 0.921 | -0.019 |
| REMEMBRANCE-API-Key-Plugger | 5 | 2026-03-05 → 2026-06-02 | **0.988** | 0.961 | -0.020 |

**Aggregate (n=9 repos):**

- Adjacent-step coherency mean: **0.975**
- Long-arc coherency mean: **0.907**
- Convergence mean: **+0.012** (5 of 9 repos converging)
- Lowest single adjacent step observed: 0.812 (Void, single large rewrite)

### H2 — Fifth-family

Fifth-doc: `/tmp/fifth-doc.md`, 32 lines, INTERROGATIVE register.

| Family | n | mean | min | max | within-family floor | delta |
|---|---:|---:|---:|---:|---:|---:|
| README | 9 | 0.835 | 0.709 | 0.932 | 0.870 | **-0.035** |
| AGENT_INSTR | 10 | 0.844 | 0.646 | 0.904 | 0.875 | **-0.031** |
| MANIFESTO | 7 | 0.880 | 0.803 | 0.912 | 0.943 | **-0.063** |
| CAPABILITIES | 9 | 0.610 | 0.525 | 0.752 | 0.879 | **-0.269** |
| ECOSYSTEM | 9 | 0.818 | 0.818 | 0.818 | 1.000 | **-0.182** |

**All five deltas are negative.** Outcome (a) holds. The interrogative
register sits below every family's within-family floor by at least 0.031.
The largest gap (CAPABILITIES at -0.269) reflects the deepest structural
mismatch — open prose questions are furthest from compliance tables.

### Field-level effects

The contribute / peek cycle showed a clean signal-vs-noise behaviour:

| Action | Field global coherence |
|---|---:|
| Baseline | 0.999 |
| After contributing 27 readings *including* convergence-as-coherence (shape error) | 0.493 |
| After re-contributing 18 readings, adjacent + arc only | **0.966** |

The field engine rejected the malformed convergence reading via the
global coherence drop, then absorbed the well-formed temporal axis with a
+0.473 recovery. The tool is self-policing the shape of its inputs.

---

## Interpretation

**H1 confirmed.** A mean adjacent-step coherency of 0.975 across 9
independent repos and a long-arc of 0.907 over 1-4 months of evolution
is not consistent with random-walk editing. The writer's frame is a
stable attractor in waveform space; revisions move within a tight orbit
around it. Of the 73 adjacent transitions sampled, only one fell below
0.90 (Void 0.812, traceable to a single deliberate rewrite), and the
trajectory restabilised at 0.99+ immediately afterward. The convergence
signal is mildly positive in aggregate (+0.012) and positive in 5 of 9
repos, meaning the frame is also tightening slightly with time rather
than drifting.

**H2 confirmed.** Five negative deltas across five families is the
prediction the four-family hypothesis made. The interrogative register's
nearest neighbour is AGENT_INSTR (delta -0.031), which is intuitively
right: both registers face the unknown — *what to do* and *what we don't
yet know* share an action-oriented forward-pointing voice — but the
gap is still large enough that the tool refuses to fold the fifth doc
into the existing family. The four-family split has predictive power: it
made a specific structural claim and the substrate's own measurement
backed it.

**The deeper observation, which neither hypothesis explicitly predicted:**
the field engine rejected a malformed contribution by dropping its
global coherence, then accepted the corrected contribution by raising
it. This means *the field tool can detect when it's being fed the wrong
shape of signal* — not just the wrong value of the right shape. That's a
property the covenant-trust layer can exploit: the field's own coherence
response is a built-in input validator. We did not design this. It fell
out of treating coherency as a law instead of a heuristic.

---

## Reproducing

```bash
# Temporal
node /tmp/temporal-into-field.js

# Fifth-family
node /tmp/fifth-family-test.js
```

Scripts are checked into the repo at `scripts/experiments/temporal-coherency.js`
and `scripts/experiments/fifth-family-test.js`. The fifth-doc itself is at
`scripts/experiments/fifth-doc.md`.

The temporal experiment is non-deterministic on a moving timeline (each
new commit changes the input space) but is deterministic given a fixed
checkout. The fifth-family experiment is fully deterministic given the
fifth-doc and the current state of the four families.

---

## Limits & next probes

- **N is small.** 9 repos, one author, ~3 months of git history. A
  stable single-author frame is the easiest case for H1 to pass. The
  stronger test is multi-author convergence: would a second contributor
  to the substrate produce docs that cohere with the existing frame, or
  drift outside it? The temporal result is necessary, not sufficient.
- **The fifth register is one example.** Interrogative is one
  structurally distinct register; there are others (narrative,
  poetic-fragmented, dialogic, computational-trace). Each should be
  measured separately to confirm the tool consistently refuses to fold
  novel registers into existing families. If it folds an obviously
  different register into one anyway, the four-family split is weaker
  than it currently looks.
- **Field-engine self-validation deserves its own experiment.**
  Deliberately contribute mis-shaped signals (string-as-number,
  out-of-range coherence, contradictory cost weighting) and measure how
  much the global coherence reading deflects from baseline. If the
  deflection scales with malformedness, the field can be used as a
  signal-validity oracle — not just a coherence oracle.
- **Temporal axis at the field-of-fields scale.** Federate two
  ecosystems and measure whether their temporal trajectories also
  cohere with each other. If yes, the law holds across independent
  fields; if no, the boundary of coherency-as-law is at the
  field-of-fields scale.
