---
description: Check the wiring contract against the live field (the seams gap-gate), then propose wires for any gaps by resonance.
---

Check the ecosystem wiring contract and propose fixes for gaps. From the toolkit:

1. `npm run check:seams` — diff `seams.json` against the live field. Report each
   seam as FLOWING / STALE / MISSING. A declared seam that stopped contributing
   is silent drift — built but not flowing.
2. If anything is MISSING, `npm run propose:wire` — the goggles read each unwired
   file, find its nearest WIRED sibling, and propose the same field-coupling wire.
   Resonance proposes; you dispose — ground every proposal in the real file
   before wiring it (never a cargo-cult require).

Report the FLOWING/MISSING summary and any proposed wires.
