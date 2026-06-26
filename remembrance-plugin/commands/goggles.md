---
description: Open the Remembrance Field Goggles on your changes — FOCUS (structure), META (resonance + nearest siblings), ECOSYSTEM CAPABILITIES (callable ecosystem functions), and meta-debug. The standing tool whenever you code.
argument-hint: "[file ...] | --diff"
---

Run the Remembrance Field Goggles on: $ARGUMENTS  (use `--diff` to goggle everything changed vs HEAD).

    node "${CLAUDE_PLUGIN_ROOT}/skills/goggles/run.mjs" $ARGUMENTS

Then read the output with these rules:

- **coherence (FOCUS)** is STRUCTURE only — **never** a correctness or trust
  signal. A well-formed wrong file scores high. Use it to see how your change
  morphs the shape, not to decide whether the code is right.
- **resonance (META)** + nearest siblings tell you where the code sits in the
  ecosystem; read the siblings before committing — a change ripples to them.
- **ECOSYSTEM CAPABILITIES** lists the callable functions in those siblings —
  reach for an existing ecosystem function before re-implementing one.
- **meta-debug** findings are real defects to fix (the orthogonal correctness axis).

Goggle before every commit.
