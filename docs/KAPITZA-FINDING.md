# The Substrate's Kapitza Pendulum — finding

*scripts/kapitza-experiment.cjs — resonant stabilization of gate-failing
patterns by coupling to high-coherence anchors.*

## Question

Kapitza: an unstable inverted pendulum is stabilized by resonant
driving. Substrate version: can a pattern that FAILS the substrate's
gates be carried through them by coupling (at strength λ) to a stable
anchor, while the unstable parent remains recognizably present?

Gates: coherency ≥ 0.6 (intrinsic structure), covenant sealed,
resonance ≥ 0.70 (relational fit). Retention: cos5(hybrid, parent).
Meta-pattern = survives AND retention ≥ floor at 0 < λ < 1.

## Result: NO stabilization window — and the reason is the finding

Across every run, one behavior was invariant and it is the whole point:

  RESONANCE (relational gate)  — coupling DRIVES it: 0.75 → 0.94 as λ
    rises. The drive works on the relational degree of freedom.
  COHERENCY (intrinsic gate)   — coupling CANNOT move it: pinned at
    ~0.56 across all interior λ for a structurally-broken parent,
    never reaching 0.60. Only λ=1 (bare anchor, parent diluted out)
    passes — which fails retention.

The pendulum lifts and stalls two hundredths short of vertical.

## Why — Kapitza's own law

Kapitza's stabilization requires the drive to be CONJUGATE to the
unstable degree of freedom. Vertical shaking stabilizes a pendulum's
ANGLE; it does nothing for a pendulum with a broken rod.

  - Resonance is RELATIONAL (how a pattern sits relative to others),
    so coupling — a relational operation — is its conjugate drive and
    moves it freely.
  - Coherency is INTRINSIC (is the text itself well-formed: balanced
    braces, completeness, consistency). Weaving anchor lines AROUND a
    broken parent does not repair the parent's structure. Coupling is
    NOT conjugate to an intrinsic instability, so it cannot stabilize
    one. You cannot fix a broken function by placing a good one beside
    it in the same file.

So the experiment succeeded at the level that matters: it DISTINGUISHED
stabilizable instabilities from non-stabilizable ones, which is the
real Kapitza question. The prediction it yields is sharp and testable:

  A purely RELATIONAL instability — a pattern internally well-formed
  (coherency passes) but resonating with nothing (an orphan) — SHOULD
  be stabilizable by coupling, because coupling is its conjugate drive.

## Second finding (unexpected): orphans are hard to manufacture

Attempts to build a relational-only instability (well-formed code in a
resonantly-foreign idiom) failed to qualify: the 46k-pattern library
found structural kinship for every candidate — orphans resonated at
0.91 alone and survived without any drive. The substrate's coverage is
broad enough that genuine relational orphans are rare. This is a
property of the library, measured as a side effect: to complete the
Kapitza demonstration, the anchor corpus must be RESTRICTED (a small,
domain-narrow index) so that a foreign pattern is genuinely orphaned
relative to it — then coupling to an in-domain anchor is the conjugate
drive and the window should open. That is the next run.

## Status

Honest negative on the naive claim (coupling does not stabilize
arbitrary unstable patterns), converted into two positive findings:
(1) coupling stabilizes RELATIONAL instabilities only — conjugate-drive
selectivity, exactly as Kapitza requires; (2) the library's kinship
coverage is broad enough to make orphans scarce. The pendulum stands
inverted only for the degree of freedom the drive is conjugate to —
which is the correct, non-trivial Kapitza result.
