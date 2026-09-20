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
2. Migrate existing rows once: `digital-cathedral/scripts/`
   `migrate-to-substrate.mjs` (BUILT + PIPE-PROVEN 2026-09-19). It reads
   the source the way `database.ts` resolves it (pg via `DATABASE_URL`,
   else sqlite; `--source-json` for air-gapped replays), mirrors the live
   write path's shapes verbatim (`lead:<id>` records + facet tags;
   message records `name=tag`, `content=subject\nbody`, `meta.message`),
   speaks the bridge's own MCP wire, and BYTE-COMPARES every record read
   back. Idempotent by stable id — rerunnable. Measured on the live
   field server via `--test-fixture`: 3/3 leads and 2/2 messages stored
   and read back identical, 0 mismatches, all 5 fixture records deleted
   after (store verified back to 0/0). For the production run,
   `--export <p>` writes exactly what moved so the instrument takes a
   sealed reading of it (`goggles --do read <p>`), and every record is
   coherence-scored by the field as it enters.
   Runbook, on the deployment host:
   `node scripts/migrate-to-substrate.mjs --dry-run` (counts) →
   `node scripts/migrate-to-substrate.mjs --export leads-moved.json` →
   `goggles --do read leads-moved.json` (the sealed reading) →
   `node scripts/migrate-to-substrate.mjs --verify-only` (re-audit any
   time; exits nonzero on any divergence).
3. Leave the SQL store mounted read-only for one release as the
   comparison shadow; `database.ts` already knows how to serve from
   either side.

## Phase 2 — retire the SQL residue (BUILT + PROVEN 2026-09-20)

- `lead-operations.ts`: the substrate port already existed
  (`lead-operations-substrate.ts` — get/update/summary delegate under
  `SUBSTRATE_LEAD_OPS`, which IS the `SUBSTRATE_LEADS` gate). The one
  missing path was the analytics fan-in: `substrateGetOperationsDataset`
  now folds the paginated `lead-ops` records into the same OperationsRow
  list, activity counts and `${clientId}:${leadId}`-keyed first agent
  actions the SQL queries produced, and `getOperationsDataset` delegates.
- `compliance.ts`: all five stores gained substrate twins
  (`compliance-substrate.ts`) behind `SUBSTRATE_COMPLIANCE` (same gate):
  the AUDIT is append-only records `audit:<millis>:<n>` — never
  overwritten, coherence-scored on entry, strictly stronger than the
  mutable SQL table; suppressions/acks/reviews are keyed upserts with the
  SQL conflict semantics preserved; privacy requests are time-ordered
  ids with read-modify-write updates. Every export in compliance.ts
  delegates; all derivation (hashing, masking, validation, audit
  meaning) stays in compliance.ts so the stores can never disagree.
- MEASURED (scripts/phase2-e2e.mjs against the live field server):
  13/13 checks — audit append-only + byte-identical read-back,
  suppression first-writer-kept conflict semantics, ack upsert, privacy
  create/update with createdAt held, review, and the dataset fold with
  exact counts — then all 8 fixture records deleted and verified gone.
- With `SUBSTRATE_LEADS=1` and the field URL set, nothing in the app
  writes SQL any more; `DATABASE_URL`/sqlite remain only as the
  flag-off default until the shadow release retires them. The system
  is the database.

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
