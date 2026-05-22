---
description: Close the ecosystem wiring gaps in one repo — real integration, never a cargo-cult require
argument-hint: <repo-name>
---
Close the ecosystem-diagnostic wiring gaps for: $ARGUMENTS

Wiring gaps are ecosystem primitives a repo should import but doesn't: `remembrance-lexicon`, `coherency` (`src/unified/coherency`), `reflection-serf`, `temporal-projection`. The diagnostic detects them by regex over file contents — so a bare *unused* `require()` would technically "close" the gap. **Do not do that.** Each integration must genuinely affect behavior.

1. `npm run gaps` from the toolkit; read the gap list for $ARGUMENTS.
2. Inspect the repo: layout, `package.json`, and any existing toolkit/field bridge (`oracle-link.js`, `toolkitPool.js`, or an inline dual-path require). Reuse the seeded `ecosystem-toolkit-reach` pattern (`seeds/code/ecosystem-toolkit-reach.js`): file-path require, dep-first then sibling-clone, degrades to null, never throws.
3. For each missing primitive, find a REAL call site — score content with the coherency scorer, gate with reflection-serf, project time-aligned data with temporal-projection, label/validate with the lexicon — somewhere the result actually changes output. (Python repos: Python-side reach + `python -m py_compile`.)
4. ALWAYS Read a file before editing it. After editing, `node --check` (or `python -m py_compile`) each changed file.
5. Commit with a clear message. Push with the safe pattern: fetch first, rebase/merge if the remote moved, never force-push, never `reset --hard`.
6. Re-run `npm run gaps`; confirm $ARGUMENTS dropped to 0 gaps. Report what you wired and the before/after count.
