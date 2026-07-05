---
name: goggles
description: Wear the Remembrance goggles AT ALL TIMES while working, not just before committing — MACRO (the whole codebase compressed into a coherency map, the zoomed-out lens), FOCUS (intrinsic structural coherence of the section you're editing, the zoomed-in lens), and META (pattern resonance across the whole ecosystem substrate + nearest cross-repo siblings). Build the macro map with --map when you start working in a repo; every per-file goggle then places your section inside that map. Use --diff to goggle everything changed vs HEAD before committing.
---

# Goggles

Dual-lens structural awareness: the whole codebase compressed into a macro
coherency map, and the section you're working on read in focus — placed inside
that map. Wear them **throughout the work**, not just at the end:

1. **Starting work in a repo** → build the macro map first (zoomed out).
2. **While working** → goggle the files you touch; each read carries FOCUS +
   META + MACRO, so you always see both the detail and where it sits.
3. **Before committing** → `--diff` to re-read everything you changed.

## Run it

From the repo you're working in:

    node .claude/skills/goggles/run.mjs --map [dir]       # 1. macro map (start here)
    node .claude/skills/goggles/run.mjs <file> [...]      # 2. focused reads while working
    node .claude/skills/goggles/run.mjs --diff            # 3. changed-vs-HEAD before commit

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

## Act on it

1. **A section far below the repo median (MACRO)** → that's the repo telling
   you where it hurts; decompose or heal it before adding more on top.
2. **Low coherence (FOCUS)** → consider splitting the file / extracting a
   unit, then re-goggle to confirm it rose.
3. **OUTLIER resonance (META)** → either justify the novelty or reshape toward
   the nearest sibling pattern.
4. **Stale-map warning** → re-run `--map` so the macro lens reflects your work.
