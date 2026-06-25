---
name: goggles
description: Read code through the Remembrance goggles before committing — FOCUS (intrinsic structural coherence), META (pattern resonance across the whole ecosystem substrate + nearest cross-repo siblings), and meta-debug (audit findings that catch real defects the diff reads clean on). Use after writing or changing code and before committing. Pass file paths, or use --diff to goggle everything changed in the current repo vs HEAD.
---

# Goggles

Reads code through the ecosystem lens and reports three *distinct* signals from
one field read. Run it on the files you just changed, before you commit.

## Run it

From the repo you're working in:

    node .claude/skills/goggles/run.mjs <file> [<file> ...]

Or goggle everything changed vs HEAD:

    node .claude/skills/goggles/run.mjs --diff

The runner finds the `remembrance-oracle-toolkit` (the goggles engine) on its
own; set `ORACLE_TOOLKIT=/path/to/remembrance-oracle-toolkit` to override.

## Read the output

- **coherence** (FOCUS) — intrinsic STRUCTURE only (syntax / completeness /
  consistency / AST). **⚠ This is NOT a coding trust signal whatsoever.** It
  measures structure in whatever it is pointed at, *never* correctness — a
  well-formed wrong file scores high (`1+1=3` in clean syntax still reads
  "solid"). Treat the goggles as an **overlay** that shows how your change morphs
  the shape of the codebase; you still fill in — and judge — the content. Rough
  bands: `<0.70` weak, `0.70–0.80` loose, `0.80–0.93` solid, `≥0.93` strong. A
  low score is a **decompose** hint (one file doing too much), never proof of a
  bug; a high score is **never** proof of its absence.
- **resonance** (META) — how much the code is shaped like the library's
  patterns; `CONSONANT` fits, `OUTLIER` is novel. Read the nearest siblings it
  lists before committing — a change here ripples to them.
- **ECOSYSTEM CAPABILITIES** — the callable functions in those nearest siblings,
  printed right under them. Every relevant ecosystem function is carried in the
  goggles, so reach for an existing one before re-implementing
  (`node scripts/build-capability-index.js` regenerates the index).
- **meta-debug** — the audit checkers; a `HIGH` finding is a real defect to fix.
  This is the orthogonal correctness axis the other two can't see (a bug can be
  perfectly coherent *and* perfectly consonant).

## Act on it

1. **Fix every meta-debug HIGH finding.** That's a real bug.
2. **Low coherence** → consider splitting the file / extracting a unit, then
   re-goggle to confirm it rose.
3. **OUTLIER resonance** → either justify the novelty or reshape toward the
   nearest sibling pattern.
