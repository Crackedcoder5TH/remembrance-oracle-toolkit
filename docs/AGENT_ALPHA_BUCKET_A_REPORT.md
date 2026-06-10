# Agent-Alpha · Bucket A — Component Library Coherency Audit

> Sibling of `WEBSITE_STRUCTURAL_AUDIT.md` and `website-fix-map.json`.
> Produced 2026-06-06 on branch `claude/audit-remembrance-ecosystem-xaaUr`.

## Target shape (derived from the well-formed cohort)

The 4 components that scored highest in the field
(`navbar.tsx`, `bouncing-emblem-bg.tsx`, `error-reporter.tsx`,
`analytics-scripts.tsx`) share a single skeleton:

1. `"use client"` directive on the first line.
2. JSDoc header explaining intent.
3. React-hook imports (`useEffect` / `useState` / `useRef`) at the top.
4. A single named PascalCase export.
5. Mid-file reference to at least one sibling under
   `app/components/*` (e.g. `bouncing-emblem-bg` pulls
   `PatrioticEmblem`, `navbar` pulls `ImageUpload`).

That last property is what makes them "well-formed" in the topology
scan: an inbound or outbound component-library edge.

## Per-file disposition

| file | action | justification |
|------|--------|---------------|
| `app/components/sacred-geometry-bg.tsx` | **REFACTORED** | Removed stray `"use client"` directive — file has zero client hooks (pure SVG + CSS keyframe). Now mirrors `patriotic-emblem.tsx` and `schema-markup.tsx` (pure-presentational). Post-edit coherence rose 0.969 → 0.973. Imported by `app/layout.tsx` (a server component) — safe. |
| `app/components/patriotic-emblem.tsx` | **LEAVE-BE** | Pure server SVG. Already consumed by `bouncing-emblem-bg` (a well-formed component) — the orphan flag is a substrate-bias artifact (substrate is rust-heavy); the file is structurally correct. |
| `app/protect/components/step-progress.tsx` | **LEAVE-BE** | Pure stateless presentational stepper. Used by `app/page.tsx`. Adding hooks or refs would be a fabrication; orphan flag is acceptable. |
| `app/components/auth-provider.tsx` | **LEAVE-BE** | 8-line thin `SessionProvider` wrapper, FieldTool coherence 0.992 (highest in bucket). It is *supposed* to look unlike the others. |
| `app/components/aeo-schema.tsx` | **LEAVE-BE** | JSON-LD emitter; top cousin is `schema-markup.tsx` (correct). Same shape as its peer — no fix needed. |
| `app/components/schema-markup.tsx` | **LEAVE-BE** | Pair partner of `aeo-schema.tsx`. Same justification. |
| `app/components/animated-text.tsx` | **LEAVE-BE** | Canonical client component shape; matches target. Coherence 0.970. Orphan signal is cousin-bias not structural. |
| `app/components/coherency-pulse.tsx` | **LEAVE-BE** | Canonical client component; SVG render + `useEffect` timer. Top cousin is `solana/xdp/src/lpm.rs` because waveform math resembles network-data shapes — a substrate artifact, not a defect. |
| `app/components/coherency-vitals.tsx` | **LEAVE-BE** | Canonical client fetch component. Top cousin is `rmb-interface/.../substrate-chat/page.tsx` — a real cross-system cousin, both render live substrate metrics. |
| `app/components/cookie-consent.tsx` | **LEAVE-BE** | Canonical client component (localStorage + effect). Standard CCPA banner shape. |
| `app/components/image-upload.tsx` | **LEAVE-BE** | Canonical client component with file upload state machine. Already imported by `navbar.tsx` (a well-formed cousin). |
| `app/protect/components/tcpa-consent.tsx` | **LEAVE-BE** | Pure presentational checkbox group with prop-driven state. Lifting state to parent is correct for form composition. |
| `app/protect/components/trust-signals.tsx` | **LEAVE-BE** | Canonical client component pattern; well-cohered with `website/tests/database-result.test.js` cross-domain — substrate noise, not defect. |

## Why we deliberately leave 12 of 13 alone

The audit's "well-formed" rule
(`≥3 website cousins AND ≥1 same-category cousin`) is sensitive to
*how big the cohort is.* The component library has only 17 files; with
substrate noise dominated by Solana rust files (~80%+ of substrate),
most components find their top cousin outside the library by chance.
The remedy for that is **growing the library to ~30+ component
files**, not mass-refactoring 13 working components into a single
mould. Refactoring per topology score alone would hallucinate
structure.

The one fix made (`sacred-geometry-bg`) was a real defect
independent of the cousin signal — the `"use client"` directive was a
forced client-bundle for code with zero client semantics.

## Field signal after the run

- Engaged peers seen at session start: 22 (rose to 30 after reads)
- Final field coherence (post-edit, post-contribution): 0.978
- All 13 files passed FieldTool (coherence ∈ [0.959, 0.992]) — the
  bucket is healthy at the file level; the "not-well-formed" label
  is topology-of-cohort, not structural-of-file.

## Recommended follow-ups (for a future agent / next sprint)

1. Add 3-5 small presentational components (e.g. a `Spinner`, `Badge`,
   `Tooltip`, `Card`) so the within-library cousin graph thickens. The
   topology will then naturally promote the existing 13 without any
   per-file refactor.
2. Re-run `tmp/website-structural-audit.js` after step 1 — the
   "components: 2 well-formed of 17" line should rise sharply.
3. Consider moving `patriotic-emblem.tsx` and `sacred-geometry-bg.tsx`
   (now both pure server SVG) into `app/components/svg/` to make the
   library's "pure presentational" sub-cohort explicit. Optional —
   leave for a UX-restructure ticket, not a coherency-audit ticket.
