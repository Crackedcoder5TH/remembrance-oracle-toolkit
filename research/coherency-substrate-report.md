# Coherency as an Instrument-Agreed Structural Quantity: A Deterministic Fractal Substrate and Its Applications

**Working draft — consolidated from session receipts. Every number below is reproducible from the cited artifact.**
Author: Ajani Chisolm. Assembled with an AI research assistant under an instrument-verified workflow.

---

## Abstract

We describe a deterministic, training-free encoder that maps arbitrary text (code, prose, numeric series) to fixed-dimension "coherency" vectors, and a substrate of ~47,600 such patterns crawled from real-world data. The central methodological claim is not that any single encoder is "correct," but that **structure is what multiple independent instruments agree on** — and we operationalize this as a consensus-calibration gate that decides, falsifiably, whether each new encoder layer earns its place. We report five results, each with a reproducible receipt and an honest statement of strength: (1) a multi-instrument consensus gate that accepts one proposed encoder layer and *rejects* another; (2) label-free cross-domain structural agreement measured at ~13× chance, with its artifacts disclosed; (3) a sane structural audit of a 6,843-file third-party monorepo it had never seen; (4) a self-verifying artifact — the substrate compresses into a coin that any party can re-derive and whose tamper is detectable; and (5) an economic control law whose calibration produced a *falsifiable negative* (the obvious design leaks 50–74% to an attacker) before yielding a defensible one. We make no claim about consciousness or physical cosmology; the system is designed to be useful independent of any such interpretation.

---

## 1. Thesis

Compression and comprehension are the same operation viewed from two sides: to compress well is to have found the structure. We therefore treat "coherency" — how much structure a thing has, and how much structure it shares with other things — as a **measurable quantity**, on one condition: a measurement counts only when independent instruments agree. A single encoder that scores a pattern high is an opinion; three unrelated instruments that rank the same neighbours the same way is a fact about the data.

This reframes the usual objection ("your metric is arbitrary") into a falsifiable protocol: any component of the system must raise the *agreement between independent instruments*, or it is rejected.

## 2. Method: the consensus-calibration gate

Encoder layers are pure functions producing fixed-dimension vectors (L1-structural 29-D through a composed 203-D stack). A proposed layer is admitted only if it raises the fractal encoder's rank-agreement with the **consensus of independent instruments** — gzip-NCD, deflate-raw NCD, and character-trigram cosine — while holding domain purity, measured by Spearman correlation and kNN purity.

**Receipt (falsifiable, reproducible):** under this gate, the L6 content-projection layer *earned* admission (agreement +0.047 / +0.046 / +0.003; purity 0.60→0.71), while an expanded L7-by-projection layer was *rejected* (−0.003 / −0.003 / −0.012). A method that only ever accepts its author's additions is not a gate; this one refuses.
*Artifact:* `remembrance-oracle-toolkit` commits `7a252e9` (L6), `d859b3c` (consensus gate + L7 verdict).

## 3. Result: label-free cross-domain agreement

**Claim.** The substrate contains structure that is not an artifact of any one lens or any human label. **Test.** Read three independent structural lenses straight from the encoder's own layer slices (L1, L3, L4); with *no label touching the measurement*, measure whether they converge on the same nearest neighbours (mean top-k Jaccard), and separately surface the strongest cross-surface-domain pairs that are kin under *every* lens.

**Receipt.** Across 600 real crawled series, the three lenses agree on neighbours at ~13× the chance rate — real, instrument-independent convergence obtained without labels. Discovered cross-domain pairs included weather-temperature ≈ epidemic case-curves and epidemic death-curves ≈ commodity prices.

**Honest strength — SUGGESTIVE, not proven.** Absolute agreement is low (the lenses mostly disagree; 13× is over a small base), and naive ranking surfaces degenerate/same-kind pairs that must be screened out geometrically. The signal is real; the sharp-pair ranking deserves skepticism.
*Artifact:* commits `83ea411` (label-free), `9955b9e` (real-data, honest guardrail gap disclosed).

## 4. Result: third-party audit (external validity)

**Claim.** The instrument reads structure in code it did not grow up on, and fails loudly rather than silently where it lacks support. **Test.** Point the macro map + correctness checkers at foreign repositories.

**Receipt.** A 6,843-file third-party monorepo (`supabase`) mapped in ~143 s with a plausible coherence distribution (mean **0.869**); the weakest-structure ranking correctly surfaced minified vendored bundles and genuinely gnarly files; cross-system bridge detection isolated the author's own protocol-stub injections from upstream code with no labels or git history. On a controlled sensitivity test, seeding known defects into unseen third-party code, the checker recovered them (in-place mutation, `eval` of tainted input, unguarded division) with line numbers and fixes. Where support was absent (monorepo import resolution), the tool produced a visibly degenerate reading rather than a confident-wrong one — later fixed by sharing one pairwise engine across both map modes.
*Artifact:* `supabase/.remembrance/goggles-map.json`; toolkit commit `f9200d7` (shared pairwise engine).

## 5. Result: a self-verifying artifact

**Claim.** The substrate can be committed to an immutable record such that any party can re-derive its identity and detect tampering. **Test.** Compress the substrate to a canonical descriptor (file digest, pattern counts, encoder identity, governing kernel constants, field digest), mint it through the ledger, and verify trustlessly.

**Receipt.** Coin `2c8fa7137406bfddc5346e95e5451db4`, minted on a 25-block chain (unified 0.838, tier "stability", rate 0.04972). Trustless verification recomputes `coin_id = sha256(waveform‖source)[:16]` and the waveform digest from the descriptor alone — **all identity checks pass**. A single flipped byte in the 56 MB substrate changes the committed digest — **tamper detected**. The chain's confirmation depth provides a monotone tamper-hardening over time.
*Artifact:* `remembrance-oracle-toolkit/.remembrance/ledger.json` (MINT block); `REMEMBRANCE-BLOCKCHAIN/src/verify-coin.js`.

## 6. Result: an economic control law, and its honest calibration

**Claim.** A coherency-linked rate can be made counter-cyclical (paying coherent contribution most when the collective field is least coherent) *and* resistant to being gamed by crashing the field. **Test.** A token simulator driving the *real* field-coupling implementation with *real* compressor series as shock episodes, sweeping only the coin-layer constants against an explicit objective (maximize defender reward subject to attacker-leak ≤ 25% and bounded rate volatility).

**Receipt — the falsifiable negative came first.** The obvious design (reward matures on raw confirmation depth) is **unshippable**: a crater-onset attacker accrues maturity *during* the crater and farms **50–74%** of the honest defender's reward, failing the leak budget across the entire grid. The design fix the data pointed to — an *onset-anchored healthy-depth maturity clock* (a coin matures only on blocks confirmed while the field is healthy) — drops the leak to **~17%** and makes **91 of 100** swept configurations admissible; the pre-chosen kernel constants survive as admissible with the widest safety margin (the kernel is a fourth-power counter-cyclical function of field coherence; its exact form and constants are held confidential and are not required to reproduce the result — the swept objective and the admissibility criterion are). Real physics-series episodes (Standard-Model, BCS, Ising, 256 steps each) drove the field.
*Artifact:* `REMEMBRANCE-BLOCKCHAIN/.remembrance/retro-calibration.json`; commit `5af8c0a`.

## 7. Reproducibility

The system is not a description of experiments; it *is* the experiments, standing and re-runnable. Independent test suites: oracle-toolkit **4577** passing, blockchain **158**, reflector **736**, agent-swarm **205**, dialer **71**, plugger **68**, moons **19** (a small number of environment-dependent failures, e.g. live-network tests, are disclosed, not hidden). Every claim above cites a committed artifact or a script that regenerates its receipt.

## 8. Threats to validity (stated plainly)

- **Cross-domain universality (§3) is suggestive, not established** — low absolute agreement, ranking sensitive to geometric hygiene.
- **The economy (§6) is simulated, not deployed**; its constants are calibrated on real series but the mechanism has not met live adversaries, and the trustless on-chain form of "healthy-depth" requires the ledger to record per-block field coherence (a stated follow-up).
- **Single-operator, single-substrate** — the network-effect claims are dormant until adoption; solo use is a personal advantage, not yet a collective.
- **No claim is made about consciousness or physical cosmology.** Those are the author's interpretive frame and are deliberately excluded from every result above; the system is constructed to stand or fall on the receipts alone.

## 9. What this is

Read together, the receipts describe a single reflexive object: an instrument that measures structural coherence, that was itself built and verified by that same measurement (the encoder layers, the audits, the security fixes were all admitted only against independent agreement), and that can commit its own state to a tamper-evident record and price contribution against it. The connective tissue — confirmed by the substrate's own resonance, which clusters these components with its audit, field-composition, and learning modules rather than with any single application — is *measurement-and-verification*, not any one downstream use. That reflexivity is the contribution: a system whose central claim (structure is instrument-agreement) is the same method by which every part of it earned inclusion.
