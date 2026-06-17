# The kill-test

This is the falsification test the Remembrance interface points you at. It is
here, in the open toolkit, so you can **run our central claim yourself** — no
private engine, no account, no faith.

## The claim under test

The substrate carries *real* cross-domain coherence — genuine structural bridges
between unrelated domains — not noise that happens to look structured.

## How it's tested (and why it's honest)

We try to kill the claim with the hardest fair null there is: a **phase-randomized
surrogate** (Theiler et al., 1992). It keeps each domain's power spectrum intact
and destroys only its phase — so anything that survives is real phase-coherent
structure, not a spectral artifact. A cross-domain correlation counts as real only
where the observed |r| beats the surrogates **less than 1% of the time**. A plain
shuffle null runs alongside as the easy baseline.

A **null result is informative**: if survival sits at ~1% (the false-positive
floor), the claim fails and we'd say so. It doesn't.

## Run it

```bash
pip install numpy
python3 run.py
```

Deterministic (seed 42), runs in seconds. It ships with its own input —
`falsification_dataset.npz`, the derived domain waveforms the run was measured on
(~461 KB of aggregated signatures, **not** raw source). Reproduces
`coherence_falsification_v2_report.json` exactly.

## The pinned verdict

```
domain-pair (substrate-wide), 738 domains, 271,953 cross-domain pairs
survive phase null (p<0.01):  17,683  (6.50%)   ← 6.5× above the 1% floor
survive shuffle null:         36,573  (13.45%)
verdict: REAL
```

The structure survives the hard null many-fold above chance. The full
live-substrate version of this test lives in the (private) Void compressor; this
self-contained copy is the part you can hold in your own hands.
