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
- CORRECTION (measured 2026-09-23): the line that stood here — "nothing
  in the app writes SQL any more" — was false. `app/lib/client-database/`
  (buyer accounts, their delivery filters, and `lead_purchases`, the
  money) had no substrate path and wrote pg/sqlite whatever the flag.
- CLOSED 2026-09-23 — the buyer store:
  - `client-database/substrate-adapter.ts` implements all 16 methods of
    `ClientDbAdapter` on the legacy store; `index.ts` selects it under
    the same gate (`SUBSTRATE_CLIENTS = SUBSTRATE_LEADS`). UNIQUE(email)
    and the purchase cap (exclusive / maxBuyers / exclusive-blocks-shared)
    run through the field server's new `store_guarded` action: check and
    insert inside one `BEGIN IMMEDIATE`, with tags re-checked exactly in
    JS (ids carry `_`, a LIKE wildcard). Calls go through the bridge's new
    `legacyStrict`, so "field unreachable" is an error, never an empty
    list — a money store must not read an outage as "unsold".
  - `migrate-to-substrate.mjs` now replays `clients`, `client_filters`
    and `lead_purchases` too (verbatim shapes, byte-compared; purchases as
    plain upserts — history is never refused by the guard).
  - SECURITY, found on the way: the field server gated only `legacy
    store`. `get`/`list`/`resonant`/`update`/`delete` and `recall` were
    open — every lead's name, email, phone and DOB readable and deletable
    by anyone who could reach the URL. Every legacy action and recall now
    require the bearer (MCP and REST); all known consumers (the bridge,
    the GEV proxy, both scripts) already send it.
  - MEASURED (`scripts/phase2-clients-e2e.mjs`, live field server with
    the token enforced): 29/29 — 10 auth refusals/grants, email
    uniqueness across case, hashed-email lookup, shared cap, exclusivity
    both ways, a return freeing a seat, 12 simultaneous checkouts against
    max 3 → exactly 3 inserted / 9 sold_out, and the `_`-wildcard twin
    not counted. `migrate-to-substrate.mjs --test-fixture`: 5 tables,
    8/8 records byte-identical. All fixture records deleted; every tag
    verified back to 0.
- With `SUBSTRATE_LEADS=1` and the field URL set, nothing in the app
  writes SQL any more — now true: the five SQL touchpoints
  (`database.ts`, `lead-operations.ts`, `compliance.ts`, and the two
  client adapters) all sit behind the gate. `DATABASE_URL`/sqlite remain
  only as the flag-off default until the shadow release retires them.
  The system is the database.

## Phase 3 — memory (the idle valor/ lib goes live)

MEASURED 2026-09-23 before starting: the lib is not idle — three of the
four items have callers — but item 1, the core, is not done.

- On lead ingest: `lead-coherency` scores through the field (a coherency
  originates from the Void compressor — never computed app-side).
  TODAY every ingest path (`api/leads`, `api/agent/leads`, the purchase
  routes) computes the score in the app (`scoreLeadByCoherency`: Pearson
  cascade vs the 16-D archetypes). The field already scores every stored
  lead through Void (`legacy store` → `field-tool.read`,
  `coherenceSource: void:compress_signal`) and returns it; the bridge's
  `storeRecord` type drops it. RULED (operator, 2026-09-23): option (a) —
  the Void reading becomes THE lead coherency; the archetype cascade
  stays as the bot/fraud gate under a name that no longer says
  "coherency". Also on this path: `_legacyEncode` stores `coherence || 0`,
  so an unreachable compressor records "no reading" as a reading of 0 —
  it must store null.
- Marketplace + portal search: `resonance-search` instead of SQL LIKE.
  TODAY the marketplace already ranks by lexical resonance live in the
  browser. The remaining LIKE sites are exact lookups (email dedup, admin
  name/email search, client search) where LIKE is the right operation;
  the field's waveform resonance is a kin/duplicate detector, not a way
  to find one person.
- Routing: `agent-routing` histograms decide which agent sees which lead.
  TODAY auto-distribution is off by default (self-serve marketplace);
  the agent API routes through host validation + tier visibility. Unused:
  `getAgentHistogram` / `evaluateAgentTrust`.
- Admin: recall over the record store (the field's recall verb) replaces
  ad-hoc report queries. TODAY not wired; admin reports are aggregations
  (revenue, stats) that recall cannot replace — recall fits "similar
  leads" views.

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
