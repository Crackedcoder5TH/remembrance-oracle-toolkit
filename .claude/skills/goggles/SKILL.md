---
name: goggles
description: Wear the Remembrance goggles AT ALL TIMES while working, not just before committing — MACRO (the whole codebase compressed into a coherency map, the zoomed-out lens), FOCUS (intrinsic structural coherence of the section you're editing, the zoomed-in lens), META (pattern resonance across the whole ecosystem substrate + nearest cross-repo siblings), META-DEBUG (audit checkers + the substrate learning loop — the correctness axis), and Δ (how your edits moved every reading since the last look). MANDATORY - after every goggle run, report the full readings to the user in words - what the goggles SAW, not that they ran. Build the macro map with --map when you start working in a repo; every per-file goggle then places your section inside that map. Use --diff to goggle everything changed vs HEAD before committing.
---

# Goggles

Dual-lens structural awareness: the whole codebase compressed into a macro
coherency map, and the section you're working on read in focus — placed inside
that map, audited for defects, and tracked across edits. Wear them
**throughout the work**, not just at the end:

1. **Starting work in a repo** → build the macro map first (zoomed out).
2. **While working** → goggle the files you touch; each read carries FOCUS +
   META + MACRO + META-DEBUG + Δ, so you always see the detail, where it
   sits, whether it's correct, and which way your edits are moving it.
3. **Before committing** → `--diff` to re-read everything you changed.

## MANDATORY reporting protocol (hardcoded — not optional)

After EVERY goggle run, report to the user **what the goggles saw** — never
just that they ran. The report must cover, in words:

1. **FOCUS + Δ** — the section's coherence and how the latest edits moved it
   (`Δ SINCE LAST READ`). If coherence dropped, say so and why you believe so.
2. **META** — the consonance verdict and the nearest ecosystem siblings, and
   what those neighbours *mean* (e.g. "its cousins are validation-shaped code,
   which is what this is").
3. **MACRO** — where the file sits in the codebase: its neighborhood (which
   in-repo siblings, what flow shapes), its flags, the substrate-drift
   reading (current / drifted / never witnessed).
4. **META-DEBUG** — every surfaced finding, what you did about each one, and
   whether prior findings were resolved ("reinforced in the field"). A HIGH
   finding is a real defect: fix it or explicitly flag it as a false positive
   (`flagFalsePositive`) — never silently ignore it.

If a reading is unavailable (no map, unwitnessed file), report THAT — the
absence is itself a reading (the substrate hasn't seen this work yet).

## Run it

From the repo you're working in:

    node .claude/skills/goggles/run.mjs --map [dir]       # 1. macro map (start here)
    node .claude/skills/goggles/run.mjs <file> [...]      # 2. focused reads while working
    node .claude/skills/goggles/run.mjs --diff            # 3. changed-vs-HEAD before commit

## Drive it — the goggles are the ONE surface

Reading and DRIVING the substrate are the same tool. The read modes above
SEE it; `--do <verb>` runs the substrate's operations, each routed to its
canonical script across the ecosystem so you never need to know where the
operation physically lives:

    run.mjs --do field                 # peek the Living Remembrance field state
    run.mjs --do drift [repo|all]      # substrate drift check (no encoding)
    run.mjs --do harvest [repo|all]    # witness files (sanitized at the doorway)
    run.mjs --do absorb                # hub patterns → Void (export → inbox)
    run.mjs --do publish <json>        # publish a pattern/coin to the ledger
    run.mjs --do coin [--publish]      # mint the git-history recovery coin
    run.mjs --do export <drive-path>   # export the data plane to a mounted drive
    run.mjs --do verify <snapshot>     # re-check an export's integrity


`--map` is **substrate-native**: the Void already compressed every ingested
file into vectors, so the map is a read over that existing compression —
seconds for any repo, nothing re-encoded. Its coverage section also names the
files the substrate hasn't witnessed yet (your new work). Add `--deep` to
force the live re-encode path (un-ingested repos, or to add intrinsic
per-file coherence to the map).

The map is cached at `<repo>/.remembrance/goggles-map.json`; per-file goggles
read it back automatically and warn when it's stale. The runner finds the
`remembrance-oracle-toolkit` (the goggles engine) on its own; set
`ORACLE_TOOLKIT=/path/to/remembrance-oracle-toolkit` to override.

## Read the output

- **MACRO** — the zoomed-out lens: repo-wide coherence distribution (mean /
  median), where THIS section sits in it (percentile), its flags in the map
  (ORPHAN / DUPLICATE / WELL-FORMED), and repo-wide counts (orphans, duplicate
  pairs, cross-system bridges). `--map` also prints per-category health, fix
  buckets, and the weakest-structure files — the repo's own worklist.
- **coherence** (FOCUS) — intrinsic STRUCTURE only (syntax / completeness /
  consistency / AST), *not* correctness. Rough bands: `<0.70` weak, `0.70–0.80`
  loose, `0.80–0.93` solid, `≥0.93` strong. A low score is a **decompose** hint
  (one file doing too much), never proof of a bug.
- **resonance** (META) — how much the code is shaped like the library's
  patterns; `CONSONANT` fits, `OUTLIER` is novel. Read the nearest siblings it
  lists before committing — a change here ripples to them.
- **META-DEBUG** — the audit checkers (AST taint/type/edge-case analysis) run
  on the goggled file, fed through the substrate learning loop: a finding you
  FIX is reinforced (amplitude up, eventually promoted into the shared pattern
  library); a finding repeatedly shown-and-ignored decays and self-suppresses
  as a false-positive class. 🛑 marks findings inside your goggled lines.
- **Δ SINCE LAST READ** — coherence/resonance/finding deltas vs your previous
  goggle of the same file: which direction the edits are moving the code.
- The PostToolUse hook (`goggles-hook.js`, installed in each repo's
  `.claude/settings.json`) additionally fires after every Edit/Write with the
  same three signals plus a per-edit coherence delta — exception-only (speaks
  when coherence moves, resonance reads OUTLIER, or meta-debug finds a defect).

## Act on it

1. **A section far below the repo median (MACRO)** → that's the repo telling
   you where it hurts; decompose or heal it before adding more on top.
2. **Low coherence (FOCUS)** → consider splitting the file / extracting a
   unit, then re-goggle to confirm it rose.
3. **OUTLIER resonance (META)** → either justify the novelty or reshape toward
   the nearest sibling pattern.
4. **Stale-map warning** → re-run `--map` so the macro lens reflects your work.
