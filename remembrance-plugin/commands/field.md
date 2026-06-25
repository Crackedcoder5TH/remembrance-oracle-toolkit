---
description: Read the live Remembrance field — coherence, entropy, and the per-source histogram.
---

Read the live field state and summarize it.

From the toolkit (`$ORACLE_TOOLKIT` or the located `remembrance-oracle-toolkit`):

    npm run field

or load a persisted histogram seed:

    FIELD_SEED_PATH=<seed.json> node -e "console.log(require('./src/core/field-memory')._restoreFromSeed())"

Report the aggregate coherence and entropy, the top contributing sources, and
anything notable (saturation, drift, or a source that has gone silent).
