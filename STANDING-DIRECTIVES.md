# Standing directives — hold no matter the session

Permanent working rules for any agent in this substrate. The session-start loader
(`scripts/session-context-load.mjs`) emits these at every start so they are never
out of context. They exist because quality slipped when results were convenient
and files went unread — the owner should not have to be the one who catches that.

## The rigor gate — a claim passes ALL of these BEFORE it is stated out loud
1. **Run the adversarial control first, not when challenged.** For any measured result,
   run the cone-keeping / label-shuffle null, the surrogate shuffle, or the matched control
   and clear it *before* reporting the number. A result without its control is not a result.
2. **Read before concluding.** Never say "this looks like X" about a file or artifact not
   opened. "Orphan," "dead," "cruft," "duplicate" require reading the thing first.
3. **Distrust the flattering answer hardest.** When a number confirms the hope, that is the
   signal to attack it, not to celebrate. The convenient result is the one most likely wrong.
   (This session: a 63% "universality" was inflated ~10x by a cone-destroying null; the
   correct label-shuffle control put the real signal at ~5 points.)
4. **Do not confuse "known ingredients" with "not substantial."** Known parts can still
   compose into a substantial convergence or a real direction. Judge the whole, and judge
   whether it *arrived independently* — that is what makes a convergence notable.
5. **The goggles and the nulls are the gate, not decoration.** Wear the goggles; run the null.
6. **No capability claim without a receipt.** Any statement about what the substrate *can* or
   *cannot* do must cite a stored measurement — a time-stamped result pattern or a benchmark
   that was actually run (the receipts live in the substrate: `sc-research/`, `epc-phonon/`,
   `lre-sim/`, benchmark output). With no receipt it is a **prediction**, and it must be
   labeled one. "It can't do X" stated as fact before running anything is banned; "I predict
   X may be hard, unmeasured" is fine. When the data later rules, the receipt wins over the
   prior. (This session: "that's DFT/Eliashberg's territory, not this" was asserted with no
   run; the numbers then showed Tc prediction at corr 0.9 and phonon-lens transfer 0.52–0.77.)
7. **Measure THROUGH the substrate, not beside it.** Retrieval, resonance, compression, and
   clustering have built native functions (see the verb surface in the session context). A
   hand-rolled cosine / kNN-scan / whitening loop is a *substrate bypass* — the goggles flag
   it (`substrate-bypass`). A benchmark of your own reimplementation is not a measurement of
   the system. (This session: a brute-force scan was reported as the substrate being O(N);
   `holoSearch` on coherent pages is sub-linear, 3–4× faster at 40k.)
8. **The composed dimension is the lens-separation, NOT the compression — and the compression
   is LOSSLESS.** The composed-D (currently 203-D `composed_v4`, up to 232-D at `MAX_DEPTH=8`;
   116-D `composed_v1` is only the legacy parity anchor) is the count of structural axes the
   encoder LENSES separate the data into so the compression can be EXTRACTED as a mathematical
   equation (pattern + residual). It is **not** the compressed payload, and reading it as such
   is a banned error. The Void compression is **lossless**: `void_compressor_v5` stores
   `pattern_reference + residual` and reconstructs the exact original bytes — verified
   byte-for-byte, always ≤ zlib, and beating zlib where real structure exists (this session:
   damped-oscillation 1816 B vs zlib 2301 B; sine 37×; random noise correctly 1.0×). Never
   call the substrate lossy; never read the composed-D as the compression ratio; never quote
   116-D as the current encoding.

## On results that arrive independently
When the substrate reaches a known mathematical structure from NO prior knowledge of it
(e.g. coherency-gradient flow arriving at gravity's conservative-field class), that
independent arrival is substantial as a structural finding and a direction — even if every
ingredient is textbook. Name the real cause honestly (e.g. symmetry of coherence ⇒
conservative field), and name the direction it points; do not dismiss it as "just known."

## Cross-repo
For persistence across all 12 repos, mirror the gate into each repo's AGENTS.md; the
SessionStart hook + loader guarantees it here in the hub.
