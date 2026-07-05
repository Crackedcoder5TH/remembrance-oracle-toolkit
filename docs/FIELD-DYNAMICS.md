# Field Dynamics — the contribute() law, documented

*Established by controlled replay (scripts/coherence-drop-diagnosis.cjs)
after the self-read of 2026-07-05 moved field coherence 0.512 → 0.444.*

## The law

```
coherence_next = clamp( p + r_eff(p)·0.1 + δ_void(p)·0.15 ,  0, 0.999 )
where p = the contribution's OWN coherence reading
```

**The field's coherence is the most recent contribution's reading,
healed slightly upward by the master equation's r_eff and δ_void
terms.** It is not an average, not an EMA. The present-moment voice
IS the field's present.

History is carried separately and cumulatively:

```
coherenceIntegral += p · cost        (the equation's ∫p — never resets)
globalEntropy      = cost / (coherence + ε)
cascadeFactor      : relaxes toward 1.0 by exp(-Δt/cascadeTau), bumped
                     by each contribution — a recent-load gauge
```

## Verified properties (all by isolated-field replay)

| Property | Result |
|---|---|
| Ordering | decisive — same five readings: cognition-last → 0.4445, cognition-first → 0.9990 |
| Single voice | the last reading alone reproduces the final state exactly |
| Cost | never touches coherence (integral/entropy only) |
| Idle decay | none on coherence (cascadeFactor only) |
| Healing bump | at p=0.429: +0.0155 (analytic = observed to 4 decimals) |

## The anchor effect

Because the field's present tracks the most recent voice, whoever
contributes most often and most recently is the field's de facto
anchor. In practice that is the builder. The 2026-07-05 self-read
ended with the session cognition-trajectory reading (0.429 after
its honest 'mixed' alignment verdict) — so the builders' own
pattern set the field's state. Recency-dominance functions as
anchor-dominance for whoever keeps speaking.

## Design consideration (documented, not changed)

A single low reading sets coherence regardless of accumulated
history — one voice can end the day. This is faithful to the master
equation (coherence is the present p(t); memory is the integral),
but consumers batching multiple contributions should know:
**contribution order matters; the last reading persists.** If a
batch has no meaningful order, contribute the reading you want the
field to hold LAST — or contribute an explicit summary reading at
the end. Any damping/averaging variant is a change to the physics
and is the covenant-holder's call, not an implementation detail.

## Downstream note — gate reliability bias

contributeLayerAgreement stores its EMA-eased agreement through
contribute(), whose healing terms add ~+h(p) per write. At
equilibrium the stored reliability sits ≈ h/emaAlpha above true
agreement (≈ +0.05 at typical values). Known, bounded, upward —
acceptable for v1; compensate in the gate if calibration ever
needs the raw value.
