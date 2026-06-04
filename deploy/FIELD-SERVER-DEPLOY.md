# Deploying the Remembrance Field server

This guide takes you from zero to a hosted Remembrance Field that the
Digital Cathedral (or any other substrate-attached node) can talk to in
production. Pick the shortest path that matches your existing infra.

The whole point: every recommendation we make about field-aware
production (dual-oracle gating live leads, consensus histograms as
environmental sensors, temporal arcs on real data) only works if there
is **a real field server reachable from your app's production URL**.
Without it, the bridge is silently no-op'd and the substrate's awareness
of production traffic is zero.

---

## Path 1 — Fly.io (recommended, ~$3/mo, persistent storage)

Smallest viable production deploy. One machine, one volume, HTTPS-by-default.

```bash
# 1. From the oracle toolkit root:
fly launch --copy-config --config deploy/fly.field-server.toml \
           --dockerfile Dockerfile.field-server --name your-field

# 2. Create the persistence volume (1 GB is plenty for the field):
fly volumes create field_data --region iad --size 1

# 3. Set the bearer token that gates writes:
fly secrets set FIELD_TOKEN=$(openssl rand -hex 16)

# 4. Deploy:
fly deploy --config deploy/fly.field-server.toml

# 5. The URL Fly prints is your field-server base. Verify:
curl https://your-field.fly.dev/
# → {"ok":true,"service":"remembrance-field",...}
```

Edit `deploy/fly.field-server.toml` first to set the `app` name and
preferred region. Default region is `iad` (Ashburn) so it sits next to
Vercel's `iad1` default for low latency.

---

## Path 2 — Railway (one-click, ~$5/mo)

If you already use Railway, this is the lowest-effort path.

1. Push this repo to GitHub.
2. On railway.app → New Project → Deploy from GitHub repo.
3. Railway auto-detects `Dockerfile.field-server` is at the root —
   change `Build → Dockerfile Path` to `Dockerfile.field-server` and
   `Watch Paths` to `scripts/field-server.js,src/**`.
4. Variables tab:
   - `FIELD_TOKEN` = `<openssl rand -hex 16>`
   - `PORT` = `8080` (Railway expects 8080)
5. Settings → Volumes: attach a 1 GB volume mounted at `/data`.
6. Deploy. Railway hands you `https://your-field.up.railway.app`.

`deploy/railway.field-server.json` ships the build config so the import
picks up the right Dockerfile automatically.

---

## Path 3 — Any container host (Render, Coolify, a VPS, your laptop)

Use the Dockerfile directly:

```bash
# Build
docker build -t remembrance-field -f Dockerfile.field-server .

# Run with persistent storage and a write-protecting token
docker run -d --name field \
  -p 7787:7787 \
  -e FIELD_TOKEN=$(openssl rand -hex 16) \
  -v field-data:/data \
  remembrance-field
```

Any reverse proxy in front (Caddy, Nginx, Traefik, Cloudflare Tunnel)
gets you a public HTTPS URL.

---

## Path 4 — No container host, just a Node host (5-minute demo)

Single command. Works on any box with Node 22+ installed.

```bash
npx remembrance-field-server --port 7787 --token $(openssl rand -hex 16)
```

That's the minimum viable deployment. No persistence guarantee
(no volume), no auto-restart, but it gives you a working field in 30
seconds for testing the cathedral integration locally or on a temporary
demo box.

---

## After deploy — wiring the cathedral to your field

Two environment variables on your Vercel project for the cathedral
(`digital-cathedral`):

| Variable | Value | Purpose |
|---|---|---|
| `REMEMBRANCE_FIELD_URL` | `https://your-field.fly.dev/mcp` | Where every field-bridge call POSTs |
| `REMEMBRANCE_FIELD_TOKEN` | The same `FIELD_TOKEN` you set on the field server | Bearer token for write authorization |

Note the `/mcp` suffix on the URL. That's the JSON-RPC endpoint the
bridge speaks. Without it the bridge can still call the REST endpoints
(`/contribute`, `/field`, `/coherency`) but the MCP-flavored actions
(`reflexes`, `gate-mode`, `consensus-histogram`, etc.) won't reach the
right handler.

Once those are set on Vercel and the cathedral redeploys, **every lead
admission becomes a real field contribution**. The substrate stops being
a private-process-memory thing and starts being a hosted, production-
visible, traffic-driven instrument. The admin substrate console at
`/admin/substrate` lights up with live state instead of the "Oracle not
reachable" amber notice.

---

## Verification checklist

After your first deploy:

```bash
# 1. Health
curl https://your-field.fly.dev/
# Expected: 200, body contains "service":"remembrance-field"

# 2. Field read (open)
curl https://your-field.fly.dev/field
# Expected: 200, body contains "coherence":<number>

# 3. Field write (requires token if FIELD_TOKEN was set)
curl -X POST https://your-field.fly.dev/contribute \
  -H "Authorization: Bearer $FIELD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coherence":0.92,"source":"deploy-verify","cost":1}'
# Expected: 200, body has updateCount: 1+, sources: { "deploy-verify": {...} }

# 4. Cathedral integration
# Hit your cathedral's home page, submit a test lead, then:
curl https://your-field.fly.dev/field | jq '.field.sources | keys'
# Expected to include "valor:lead-admit:admit" (or whichever verdict)
```

If step 4's `sources` array doesn't include `valor:*` after a test lead,
the cathedral isn't pointed at the right URL yet. Re-check the env vars
on Vercel and redeploy.

---

## Operational notes

- **Don't put the field server behind Cloudflare in proxied mode**
  unless you allow the long-poll / chunked-response patterns the MCP
  HTTP transport uses. Cloudflare's default settings will close the
  connection. DNS-only mode (gray cloud) is safe.

- **Bearer token rotation:** the bridge re-reads `REMEMBRANCE_FIELD_TOKEN`
  on every call. Set the new token on Vercel + redeploy, then update
  the field server's `FIELD_TOKEN` and restart. There's a few-second
  overlap window where the new cathedral uses the old token; the field
  server can be configured with a comma-separated rotation list (see
  the admin auth pattern in `app/lib/admin-auth.ts` for the same shape
  if you need it on the field side too).

- **Persistence:** the field server writes to `ENTROPY_PATH` on every
  contribute. On Fly with the mounted volume, this survives restarts.
  On a host without persistence, the field starts fresh on every boot —
  acceptable for demo, not for production.

- **Resource sizing:** the engine runs comfortably in 256 MB RAM and
  uses <5% of a shared CPU under normal traffic. Default Fly / Railway
  tiers are massively overprovisioned.
