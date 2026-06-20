# Deploy the Field — the engine behind the interface

This deploys **one thing**: the Remembrance **field-server** (the LRE engine).
It is the only piece the interface needs to come alive. One deploy → one URL →
the console, the Valor Legacies database, Claude's recall, every number — all
light up. Until it's set, the interface honestly shows **zeros**.

> **Why not just the GitHub token?** The GitHub token edits your repos' *code*.
> This deploys a *running program* the interface can talk to over HTTP. A repo is
> a blueprint; this is the engine actually running.
>
> **Do I need `ORACLE_URL`, `VOID_URL`, …?** No. Those only color the per-service
> status dots on the console (health probes against separately-deployed services).
> Leave them blank and those nodes show "down" — everything else works. The
> **only** variable that matters is `REMEMBRANCE_FIELD_URL`.

The image is `Dockerfile.field-server` (node:22-slim, non-root, healthcheck,
persists to `/data`). `railway.json` already points at it. The same image runs on
Railway, Fly, Render, or any container host.

---

## Railway (recommended — ~4 steps)

1. **New Project → Deploy from GitHub repo →** `remembrance-oracle-toolkit`.
   Railway reads `railway.json` and builds `Dockerfile.field-server` automatically.
2. **Add a Volume** (service → *Volumes*), mount path **`/data`**.
   *(The image already sets `REMEMBRANCE_STATE_DIR=/data`, so this is the only
   persistence step. Skip it and the field resets on every restart.)*
3. **Variables →** set `FIELD_TOKEN` to a strong secret (this gates writes).
4. **Deploy.** When it's green, open *Settings → Networking → Generate Domain* and
   copy the `https://…up.railway.app` URL.

That URL is your field. Verify it:

```bash
curl https://YOUR-FIELD.up.railway.app/                       # -> 200
curl -s -X POST https://YOUR-FIELD.up.railway.app/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"field_read","arguments":{}}}'
# -> a JSON field state with coherence + updateCount
```

---

## Wire the interface (the part that flips zeros → live)

Wherever the **interface** is deployed (e.g. Vercel project settings → Environment
Variables), set:

| Variable | Value |
|---|---|
| `REMEMBRANCE_FIELD_URL` | `https://YOUR-FIELD.up.railway.app` (the URL from above) |
| `REMEMBRANCE_FIELD_TOKEN` | the **same** secret you set as `FIELD_TOKEN` |

Redeploy the interface. The console, database, vitals, and Claude recall now read
the live field. (`REMEMBRANCE_FIELD_TOKEN` is only needed for *writes* — creating
records, chat memory; reads work without it.)

---

## Other hosts (same image)

```bash
# Fly.io
fly launch --dockerfile Dockerfile.field-server --name your-field
fly volumes create data --size 1            # then mount at /data
fly secrets set FIELD_TOKEN=your-secret

# Render — New → Web Service → Docker, dockerfilePath Dockerfile.field-server,
#   add a Disk mounted at /data, env FIELD_TOKEN=your-secret

# Any VPS with Docker
docker build -t remembrance-field -f Dockerfile.field-server .
docker run -d -p 7787:7787 -e FIELD_TOKEN=your-secret \
  -v /srv/remembrance:/data remembrance-field
```

**Always mount a volume at `/data`.** Without it the field and the Valor Legacies
database are ephemeral and reset on restart (the server prints this warning on
boot). With it, `entropy.json` + `oracle.db` survive across restarts.
