# Domain Test: Operational Telemetry (2026-08-08)

Pre-registered before measurement (task #52): does the universal claim
hold on a modality the substrate has never seen — real system logs from
the machine it runs on? Three hypotheses, declared falsifiable, all
measured through the instrument's own surfaces (`composedCosineOf` at
full decoder depth; goggles FOCUS via the compressor service). Corpus:
five genuine logs from five different producers (`dpkg`, `apt/history`,
`apt/term`, `alternatives`, `fontconfig`), uniform 40KB caps, plus code
and prose controls. No labels shown to the instrument at any point.

## H1 — unlabeled grouping · HOLDS

| pair class | n | mean cosine |
|---|---|---|
| log ↔ log | 10 | **0.8572** |
| log ↔ control (code/prose) | 10 | 0.7109 |
| log ↔ byte-scrambled log | 5 | 0.7803 |

Separation +0.146: telemetry recognizes telemetry across five distinct
producers, without labels. Honest caveat, reported as measured: the
scrambled floor is high (0.780) — byte-distribution carries a large
share of the composed cosine on this modality, so the structure-beyond-
bytes margin (+0.077) is thinner here than the 30-domain note's numeric
corpora (+0.31–0.38). A scrambled log still reads closer to logs than
real code does. The cosine groups; the compressor discriminates (below).

## H2 — structure destruction detected · HOLDS

Intact dpkg log FOCUS coherence **0.217** vs byte-scrambled **0.082** —
a 2.6× collapse through the compressor path.

## H3 — dose-response · HOLDS, with a finding better than the hypothesis

Two corruption ladders on the same file:

| corruption | 0% | 10% | 30% | 50% | scrambled |
|---|---|---|---|---|---|
| row-shuffle (line order) | 0.217 | 0.212 | 0.215 | 0.203 | — |
| within-line grammar | 0.217 | **0.194** | **0.164** | **0.128** | 0.082 |

Row-shuffle reads FLAT — and that is the instrument being right, not
failing: dpkg rows are timestamped, near-independent records; permuting
them destroys almost no structure, and the reading says so. Corrupting
the field grammar *inside* lines — the structure that actually makes a
log a log — produces a strictly monotone, near-linear decline all the
way to the scrambled floor. The instrument did not merely detect
corruption; it distinguished corruption that destroys structure from
corruption that doesn't, on a modality it had never seen.

## Verdict

The universal claim survives its telemetry test with one honest
qualifier: at the composed-cosine layer, byte-palette similarity is a
larger share of affinity for logs than for numeric domains, so
grouping margins are thinner; the compressor path is the discriminating
instrument for this modality. Nothing degraded; one caveat gained.
Method files: scratchpad domain-test corpus, seeds fixed (42, 7).
