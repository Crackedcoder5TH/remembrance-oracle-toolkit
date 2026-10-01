# Substrate integration — the Valor Legacies site on the Remembrance field

How the website, the Void compressor, the field-server database, and the
goggles run as one system, how it comes up automatically in a dev session, and
how to point it at real infrastructure in production.

> TL;DR — the site persists leads and CRM operations to a **field-server**
> (a coherence-scored SQLite record store, the "Valor Legacies database")
> instead of a plain relational DB, but only when you opt in with
> `SUBSTRATE_LEADS=1` and a reachable `REMEMBRANCE_FIELD_URL`. Otherwise it
> falls back to Postgres/SQLite unchanged. Nothing about the substrate is
> load-bearing for a default deploy — it is an additive layer.

## Topology

```
 Cathedral (Next.js)                       Field-server (:7787)              Void compressor (:8765)
 ┌───────────────────────┐   JSON-RPC     ┌────────────────────────┐        ┌──────────────────────┐
 │ app/lib/…             │   POST /mcp    │ tools: field · legacy  │  warms │ compressor_service.py│
 │  database.ts          │───────────────▶│        · recall        │───────▶│ 47k-pattern library  │
 │  substrate-leads.ts   │                │ legacy store → SQLite  │  scores│ 232-D canonical       │
 │  lead-operations-     │                │ .remembrance/oracle.db │◀───────│ coherence per write   │
 │    substrate.ts       │                │ = "Valor Legacies DB"  │        └──────────────────────┘
 │  valor/               │                └────────────────────────┘                 ▲
 │    remembrance-bridge │                                                            │ FOCUS coherence
 └───────────────────────┘                                                            │
            ▲                                                                          │
            │ SUBSTRATE_LEADS=1 + REMEMBRANCE_FIELD_URL                                │
            │                                                                          │
      Goggles (per-file FOCUS / META / MACRO) ─── read coherence through ─────────────┘
      Substrate index  pattern_index_fractal.json  (goggles memory: MACRO map + resonance)
```

Two independent services, one data plane:

| Piece | What it is | Default port / path |
|---|---|---|
| **Void compressor** | Produces the coherence reading (self-repetition of a byte-waveform against the 232-D pattern library). Nothing else computes coherence. | `127.0.0.1:8765` (`VOID_SVC_PORT`) |
| **Field-server** | JSON-RPC MCP server. `field` = field dynamics; `legacy` = durable record store (leads, lead-ops, site content); `recall` = resonance retrieval. Writes are coherence-scored via the compressor. | `:7787` (`FIELD_PORT` / `PORT`) |
| **oracle.db** | The field-server's SQLite `legacies` table — the actual Valor Legacies record store. | `$REMEMBRANCE_STATE_DIR/.remembrance/oracle.db` |
| **pattern_store.npz** | The compressor's 232-D pattern library (read-only at runtime). | `Void-Data-Compressor/pattern_store.npz` |
| **pattern_index_fractal.json** | The goggles' substrate memory — what powers the MACRO map and cross-repo META resonance. Grown by `--do harvest`. | `Void-Data-Compressor/pattern_index_fractal.json` |

## How the website chooses substrate vs. relational

`app/lib/database.ts` and `app/lib/lead-operations.ts` each delegate to the
substrate path only when **both** conditions hold (see
`app/lib/substrate-leads.ts`):

```
SUBSTRATE_LEADS enabled  ⇔  REMEMBRANCE_FIELD_URL is set  AND  SUBSTRATE_LEADS=1
```

- **Enabled** → leads (`substrate-leads.ts`) and their CRM operations
  (`lead-operations-substrate.ts`) are stored as `legacy` records
  (`lead:<id>`, `ops:<id>`) on the field-server.
- **Disabled** (default) → the relational adapter (`DATABASE_URL` → Postgres,
  else local SQLite) is used. Production is unchanged unless you opt in.

The bridge is **best-effort**: if the field is unreachable it degrades to
`null`/empty rather than throwing, so a missed field never takes down a request.

## Environment variables

| Var | Purpose |
|---|---|
| `REMEMBRANCE_FIELD_URL` | Field-server MCP endpoint, e.g. `http://127.0.0.1:7787/mcp` or `https://your-field.fly.dev/mcp`. Enables the field **dynamics** calls on its own. |
| `REMEMBRANCE_FIELD_TOKEN` | Bearer for field **writes**. Must equal the field-server's `FIELD_TOKEN`. Required on https; optional on loopback. |
| `SUBSTRATE_LEADS` | `1` to route lead + CRM **persistence** to the field. Without it, only dynamics use the field; persistence stays relational. |
| `DATABASE_URL` | Postgres for the relational path (used when `SUBSTRATE_LEADS` is off, and by the local dev fallback when unset → SQLite). |
| `VOID_SVC_PORT` | Compressor port the goggles + field-server reach (default `8765`). |
| `SUBSTRATE_PATH` | Path to `pattern_index_fractal.json` for goggles harvest / MACRO map. |

## Local / Claude-Code-on-the-web dev

It comes up **automatically**. The toolkit's SessionStart hook runs
`scripts/ensure-void-runtime.sh`, which is the single provisioner for the whole
substrate. On each session it (idempotently, best-effort, never failing the
session):

1. installs the Void python deps (`numpy` …) if missing;
2. warms the compressor on `:8765` (detached; ~65–100s cold, then ~1.5s reads);
3. seeds `pattern_index_fractal.json` with the empty state `{"index":{}}` if absent;
4. starts the field-server on `:7787` **after** a waiter confirms the compressor
   is warm — a `legacy` write against a cold compressor calls it synchronously
   and would freeze the field-server's event loop for the whole cold load;
5. wires the session env (`REMEMBRANCE_FIELD_URL`, `SUBSTRATE_LEADS=1`,
   `VOID_SVC_PORT`, `SUBSTRATE_PATH`, a persisted bearer token) so the cathedral
   reads/writes the local field.

Run it by hand anytime:

```bash
cd remembrance-oracle-toolkit
CLAUDE_ENV_FILE=/tmp/env CLAUDE_CODE_REMOTE=true sh scripts/ensure-void-runtime.sh
```

Grow the goggles' MACRO map for the site:

```bash
node .claude/skills/goggles/run.mjs --do harvest "$PWD/digital-cathedral/app" --as oracle
node .claude/skills/goggles/run.mjs --map digital-cathedral/app/lib
```

### Verify the stack

```bash
curl -s --noproxy 127.0.0.1 http://127.0.0.1:8765/health                # compressor: {"status":"ok",...}
curl -s --noproxy 127.0.0.1 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"legacy","arguments":{"action":"list","tags":["lead-ops"],"limit":3}}}' \
  http://127.0.0.1:7787/mcp                                             # field-server legacy store
```

## Production switch-over

The dev topology is loopback + a container-local `.remembrance/`. For
production, the same wiring points at deployed infrastructure — see
`deploy/FIELD-SERVER-DEPLOY.md`:

1. **Deploy a field-server** (Fly/Railway/Docker via `Dockerfile.field-server`,
   or `npx remembrance-field-server --port 7787 --token <secret>`). Point its
   `REMEMBRANCE_STATE_DIR` at a **mounted volume** so `oracle.db` persists.
2. In the cathedral's deploy env set:
   - `REMEMBRANCE_FIELD_URL=https://<your-field-host>/mcp`
   - `REMEMBRANCE_FIELD_TOKEN=<same secret as the field-server's FIELD_TOKEN>`
   - `SUBSTRATE_LEADS=1`
   - keep `DATABASE_URL` set — it stays the fallback and the exact/indexed
     analytics store.
3. Redeploy. Leads and CRM operations now persist to the shared field.

To roll back, unset `SUBSTRATE_LEADS` (or `REMEMBRANCE_FIELD_URL`): the site
returns to the relational adapter with no code change.

### Caveat — data persistence in ephemeral containers

In a Claude-Code-on-the-web session the field's `oracle.db` and the substrate
index live in the container's gitignored `.remembrance/`, so records written in
a session are **not** shared across containers and are lost when the container
is reclaimed. That is expected for dev. Durable, shared storage is exactly what
the production field-server + mounted volume above provides.
