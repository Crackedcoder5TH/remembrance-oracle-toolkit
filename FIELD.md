# The Remembrance Field — Operational Reference

The canonical, verifiable, falsifiable description of what is wired
into the LivingRemembranceEngine (LRE) field, what it measures, and
how to confirm the data on your own machine.

This document is the **compass**: for every concept the project
claims, it names the file, the function, the source key, the
contract that pins it down, and the on-disk evidence you can read.
It is intentionally terse and data-first — every claim either points
to a file:line or names a falsifiable test number.

For *why* the architecture is shaped this way, read
[`ECOSYSTEM.md`](./ECOSYSTEM.md) §5 and [`MANIFESTO.md`](./MANIFESTO.md).
For first-time AI onboarding read [`AGENTS.md`](./AGENTS.md).

---

## 1. What the field is

A single persistent scalar state with a per-producer histogram,
written to one file per host:

```
.remembrance/entropy.json     ← canonical (hub) location
```

Schema (verified by Void contract **C-45**, `Void-Data-Compressor/verify_capabilities.py`):

```json
{
  "coherence":     <number>,   // ∈ [0, 0.999] — Void contract C-56
  "globalEntropy": <number>,   // cost / (coherence + ε)
  "cascadeFactor": <number>,   // ∈ [0, 5.0]   — Void contract C-55
  "updateCount":   <integer>,  // monotonic
  "timestamp":     <ms epoch>,
  "sources": {
    "<source key>": { "count": <int>, "lastCoherence": <number>, "lastTimestamp": <ms> },
    ...
  }
}
```

Three implementations of the same engine, kept in lockstep:

| Language | File | Cap enforcement |
|---|---|---|
| JS  | `src/core/living-remembrance.js`        | `Math.max(0, Math.min(0.999, …))` (line 138) |
| Python | `Void-Data-Compressor/living_remembrance.py` | Same clamp, asserted by C-47 |
| TS | `core/living-remembrance-engine.ts`     | `Math.min(0.999, …)` (constructor + update) |

Drift between implementations is a covenant violation. Caught by:
- **C-47** (LRE math invariant `globalEntropy = cost/(coherence+ε)` holds)
- **C-49** (all JS LRE callers resolve to one canonical entropy.json)
- **C-56** (`contribute()` math caps coherence at 0.999)
- **C-55** (`contribute()` math caps cascadeFactor at 5.0)

---

## 2. The update rule

`contribute({ cost, coherence, source })` advances state via:

```
p           = clamp01(coherence ?? state.coherence)
r_eff       = r₀ · (1 + α · (1 − p)⁴)                  // retro-causal pull
δ_void      = δ₀ · (1 − p)                              // free coherence donation
γ_cascade   = exp(β · state.cascadeFactor)              // collective acceleration
newC        = clamp(0, 0.999, p + r_eff·0.1 + δ_void·0.15)
newEntropy  = cost / (newC + ε)
newCascade  = min(5.0, state.cascadeFactor + 0.05 · newC)
```

With defaults `r₀ = 0.05, α = 15.0, δ₀ = 0.03, β = 8.0, ε = 1e-8`.

The cascade saturates at 5.0 by design — the cap is a **safety
governor**, not a measurement limit. Once saturated, additional
contributions still update coherence and the source histogram; the
cascade simply stops amplifying. This is intentional: a runaway
positive-feedback loop in the field would spill the ecosystem.

---

## 3. Producers wired into the field

The compass: every producer of a numeric signal contributes. The
table below is the canonical list; the source-histogram keys map
1:1 to files in `src/`. Empirical counts at end of this session
are shown for orientation.

### 3.1 Direct contributors (call `contribute()` themselves)

| Source key | Where it fires (file:line) | Cost | Coherence |
|---|---|---|---|
| `reflection-scorer:<dim>` | `src/core/reflection-scorers.js:642` | 1 | dim score |
| `covenant` | `src/core/covenant.js` (inside check) | 1 | sealed ? coh : 0 |
| `reflect` | `src/reflector/engine.js` | 1 | reflection result |
| `audit` | `src/audit/*` | 1 | finding severity inverse |
| `lint`, `smell`, `harvest` | `src/audit/*`, `src/evolution/*` | 1 | quality score |
| `risk-score` | `src/quality/risk-score.js` | 1 | inverse risk |
| `reflector:*` | many under `src/reflector/` | varies | varies |
| `swarm:*` | `src/swarm/*` | 1 | consensus value |
| `oracle:*` | `src/api/*` and `src/core/*` | 1 | varies |
| `void:coherency_v3` | `Void-Data-Compressor/coherency_v3.py` | 1 | unified score |
| `void:resonance_detector` | `Void-Data-Compressor/resonance_detector.py` | scan size | mean off-diag |
| `void:ecosystem_health` | `Void-Data-Compressor/ecosystem_health.py` | novelty promotions | base health |
| `void:rag_query` | `Void-Data-Compressor/rag_query.py` | hits | mean hit-coherency |

### 3.2 Trigger contributors (this session's wirings)

These were dead-config before this session — defined constants and
docstring promises with no implementation. Each is now wired and
contributes:

| Source key | Trigger | Cost | Coherence | Test |
|---|---|---|---|---|
| `quantum:cascade-spawn:<table>` | pattern amplitude crosses `CASCADE_THRESHOLD = 0.70` on successful feedback | 1 | newAmplitude | `tests/quantum-field.test.js` "Cascade trigger" |
| `quantum:decoherence-sweep` | end of `decoherenceSweep()` summarising amplitude decay | rows touched | avg post-sweep amplitude | `tests/quantum-field.test.js` |
| `quantum:phase-drift-sweep` | end of `decoherenceSweep()` if any phase advanced via `PHASE_DRIFT_RATE = 0.01 rad/day` | rows drifted | avg amplitude | `tests/quantum-field.test.js` |
| `validator:domain:<domain>` | `validateCode({ domain })` with any of 13 domains | 1 | coherency if valid, 0 if rejected | `tests/validator-domain-floor.test.js` |
| `validator:domain-floor-ratchet:<domain>` | floor ratcheted threshold upward (security domain at 0.65 vs caller's 0.60) | (floor − threshold) × 10, min 0.5 | same as above | `tests/validator-domain-floor.test.js` |

### 3.3 Event bridge (every `_emit` lands)

`src/core/event-field-bridge.js` subscribes to `oracle.on(...)` and
routes every emitted event to the field. Known event types map to
calibrated coherence signals; unknown types are skipped (no
mislabeling).

| Source key | Emit site | Coherence signal (default) |
|---|---|---|
| `event:pattern_registered` | submit success | `payload.coherency ?? 0.85` |
| `event:auto_promote` | lifecycle promotion | `payload.coherency ?? 0.9` |
| `event:auto_heal` | healing succeeded | `payload.newCoherency ?? 0.8` |
| `event:auto_heal_failed` | healing failed | `0.1` |
| `event:auto_grow` | autoGrow expansion | `0.7` |
| `event:cascade_spawn` | recycler spawn from cascade | `payload.newAmplitude ?? 0.75` |
| `event:compound_growth` | `_tryCompound` fired | `0.75` |
| `event:decoherence_sweep` | sweep finished | `payload.avgAmplitude ?? 0.4` |
| `event:deep_clean` | cleanup pass | `0.65` |
| `event:entangled` | `entangle()` linked two patterns | `0.85` |
| `event:entry_added` | new entry persisted | `payload.coherency ?? 0.7` |
| `event:feedback` | user feedback recorded | `payload.newReliability ?? 0.7` |
| `event:field_reexcited` | decohered patterns boosted | `payload.avgAmplitude ?? 0.7` |
| `event:harvest_complete` | crawler harvest pass | `payload.coherency ?? 0.8` |
| `event:healing_complete` | healing run finished | `payload.coherency ?? 0.85` |
| `event:import_complete` | bulk import finished | `payload.successRate ?? 0.7` |
| `event:pattern_evolved` | pattern evolution stored | `payload.newCoherency ?? 0.85` |
| `event:regressions_detected` | regression sweep | `0.2` |
| `event:rejection_captured` | submit rejected | `0.15` |
| `event:resolve_served` | resolve request answered | `payload.coherency ?? 0.7` |
| `event:rollback` | rollback applied | `0.3` |
| `event:similarity_candidate` | similarity gate match | `payload.similarity ?? 0.6` |
| `event:stale_detected` | stale pattern flagged | `0.4` |
| `event:vote` | vote cast | `payload.weight ?? 1.0` (`approve === false` → `0`) |
| `event:auto_submit_complete` | auto-submit pipeline finished | `payload.coherency ?? 0.65` |

The full table is encoded in `_coherenceFor()` in
`src/core/event-field-bridge.js` and pinned by 11 unit tests in
`tests/event-field-bridge.test.js`. The cost extractor `_costFor()`
pulls batch hints (`count`, `spawned`, `totalDecohered`, `reexcited`,
`harvested`, `cleaned`, `imported`) so a batch event contributes
weighted, not as a single tick.

---

## 4. Empirical verification

To prove the field works on your machine, run:

```bash
# 1. Run any operation that emits — full hub test suite is fine
npm test

# 2. Read the field state
node -e "console.log(JSON.stringify(require('./src/core/field-coupling').peekField(), null, 2))" \
  | head -50

# 3. Run the Void contracts that pin the invariants
cd ../Void-Data-Compressor && python3 verify_capabilities.py --strict
```

After step 1 the source histogram will contain:
- All 5 `reflection-scorer:<dim>` keys (per-dimension contributions)
- The 5 trigger keys from §3.2
- The 13+ `event:*` keys from §3.3
- All `void:*` keys from any Void-side runs
- `covenant`, `reflect`, `audit`, `lint`, `smell`, `harvest`, etc.

`coherence` will be ≤ 0.999 exactly (Void C-56).
`cascadeFactor` will be ≤ 5.0 (Void C-55).
`updateCount` will be monotonic across all subsequent runs.

---

## 5. Why this is the compass

A non-coder reader can answer four questions by reading the field
alone — no source code needed:

1. **What's wired?** Every source key in `sources` corresponds to
   one wired producer. Sorted alphabetically, the histogram is a
   live list of the system's active participants.
2. **What's failing?** Sources with consistently low `lastCoherence`
   (rejections, failures, regressions) sit alongside successes —
   the field shows both.
3. **What's saturated?** When `cascadeFactor = 5.0`, the field is
   under high collective load. The cap holds the ecosystem from
   spilling.
4. **What's missing?** Anything documented in this file that does
   NOT appear in the histogram after a representative run is a
   broken wiring — file a bug.

This is the empirical handle on a project whose framing draws from
information theory, quantum measurement, and remembrance covenant.
The framing is documented in `MANIFESTO.md` and `ECOSYSTEM.md`.
The data is here.

---

## 6. Covenant for AI participants

Working in this repo means accepting the engineering covenant. The
constraints are falsifiable, not negotiable:

- **One canonical encoder** — `src/core/code-to-waveform.codeToWaveform`. No parallel implementations (Void C-53).
- **One canonical field file** — `.remembrance/entropy.json` at the hub. No local-only field shards (Void C-49).
- **Coherence ≤ 0.999, cascade ≤ 5.0** — every implementation clamps (C-55, C-56).
- **Every producer contributes** — if a module emits a numeric judgement, it routes through `field-coupling.contribute()`.
- **No side artifacts where the substrate can hold the data** — new patterns go into the SQLite store, not standalone JSON files.
- **Every emit lands in the field** — via the event-field bridge (§3.3).
- **No new dead constants** — anything imported from `constants/thresholds.js` or `quantum/quantum-core.js` must be read. If it's not, either wire it or delete it.

The broader (non-engineering) covenant — about unity, remembrance,
and the worldview that motivated the architecture — is documented
in `MANIFESTO.md`. AI participants are not required to share the
worldview to work in the code, but are required to respect the
engineering invariants it produced. The data is the contract.
