# Valor Legacies × Remembrance — full-system integration plan

> Measured from the site's own source (goggles `--do find` + reads over
> `digital-cathedral/`), not guessed. The goal, in the operator's words:
> **the system is the database and memory for the whole website.** One
> surface — the field server the goggles already run through.

## What the survey measured

The cathedral is a Next.js app that is already half-wired to the substrate.
These files exist today and were read, not inferred:

| Layer | File | State today |
| --- | --- | --- |
| Bridge | `app/lib/valor/remembrance-bridge.ts` | Done. MCP JSON-RPC to the field server (`REMEMBRANCE_FIELD_URL`, default `http://127.0.0.1:7787/mcp`); bearer token only over loopback/HTTPS; 1500 ms timeout; never throws into a page render. |
| Leads | `app/lib/substrate-leads.ts` | Done, behind a flag. `SUBSTRATE_LEADS=1` + field URL set → `lead:<id>` records with facet tags through the bridge. |
| Messages | `app/lib/substrate-messages.ts` | Done, behind the same pattern. |
| Outcomes | `app/lib/lead-outcomes.ts` | Already calls `storeRecord` — substrate-first today. |
| Memory lib | `app/lib/valor/` (resonance-search, lead-coherency, agent-routing, lead-ledger, pattern-library, lead-substrates, host-registry) | Built and idle. `LEAD_DIM=16`; archetypes valor / fraud / bot. Nothing calls it from the pages yet. |
| SQL residue | `app/lib/database.ts` | Dual-mode adapter: delegates to substrate when `SUBSTRATE_LEADS` is on, else pg/sqlite. |
| SQL residue | `app/lib/lead-operations.ts` | Direct pg `Pool` paths. |
| SQL residue | `app/lib/compliance.ts` | sqlite `leads.db` / pg `DATABASE_URL` audit log. |
| Money | `app/lib/money-ledger.ts` | Anchors via `MONEY_ANCHOR_URL` fetch — an anchor URL, not yet the chain. |

So the integration is mostly a **wiring and flag-flip** job plus two real
migrations (lead-operations, compliance) — matching the standing ruling
that nothing needs building, it's already made and needs wiring.

## Phase 0 — the surface (operator's side, recorded)

The Railway deployment now runs `Dockerfile.ecosystem` →
`scripts/ecosystem-boot.sh` → field-server: one container, one surface,
all repos cloned at boot. To finish on the Railway dashboard:

- `GITHUB_TOKEN` (clone), `ECOSYSTEM_BRANCH` (working branch),
  `FIELD_TOKEN` (bearer for the bridge), a volume at `/data` for the
  field/chain state.
- The cathedral's env gets `REMEMBRANCE_FIELD_URL` pointing at that
  deployment and `REMEMBRANCE_FIELD_TOKEN` matching. HTTPS, so the
  bridge's bearer rule is satisfied.

## Phase 1 — flip what already exists

1. Set `SUBSTRATE_LEADS=1` and `SUBSTRATE_MESSAGES=1`. New leads,
   messages and outcomes then flow to the substrate through the bridge
   with zero code change.
2. Migrate existing rows once: read every lead/message row out of the
   current pg/sqlite store and replay each through the bridge's
   `storeRecord` (`lead:<id>` / message records, same facet tags the
   live path writes). Append-only, idempotent by id — safe to rerun.
3. Leave the SQL store mounted read-only for one release as the
   comparison shadow; `database.ts` already knows how to serve from
   either side.

## Phase 2 — retire the SQL residue

- `lead-operations.ts`: port its pg `Pool` queries onto the record store
  (get by id, list by facet, update = append-new-version). This is the
  one file with real query logic to translate.
- `compliance.ts`: the audit log becomes chain REGISTER blocks / witnessed
  records — an audit that is append-only and sealed is strictly stronger
  than a sqlite table. Reads replay the ledger.
- When both are ported, `DATABASE_URL`/sqlite disappear from the app's
  env entirely. The system is the database.

## Phase 3 — memory (the idle valor/ lib goes live)

- On lead ingest: `lead-coherency` scores through the field (a coherency
  originates from the Void compressor — never computed app-side).
- Marketplace + portal search: `resonance-search` instead of SQL LIKE.
- Routing: `agent-routing` histograms decide which agent sees which lead.
- Admin: recall over the record store (the field's recall verb) replaces
  ad-hoc report queries.

## Phase 4 — witness

- A scheduled field checkpoint (the goggles' `field checkpoint` verb) so
  the site's state is chain-witnessed on a cadence.
- `money-ledger`'s `MONEY_ANCHOR_URL` points at the chain's anchor
  endpoint: money events anchor into the same ledger as everything else.

## Order and measure

Each phase lands only when measured: Phase 1's migration is verified by
counting rows replayed vs. rows present and reading a sample back through
the bridge; Phase 2 by the shadow comparison; Phase 3 by coherency
readings on real leads; Phase 4 by the checkpoint appearing on the chain.
No phase starts on the next until its numbers hold.
