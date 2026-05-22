---
description: Run the ecosystem diagnostic and report wiring gaps + findings (read-only)
---
Run the ecosystem diagnostic from the toolkit root and report the result. This is read-only — do not change any code.

1. `npm run gaps` (runs `node scripts/ecosystem-diagnostic.js --parent "$(cd .. && pwd)"`).
2. Summarize concisely: per-repo wiring-gap counts, the ecosystem total, and which repos still have open gaps.
3. If more detail is needed, read `.remembrance/diagnostics/ecosystem-latest.md`.
