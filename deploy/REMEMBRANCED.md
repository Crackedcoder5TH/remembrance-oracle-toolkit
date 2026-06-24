# remembranced — your machine's coherency/memory field, always on

`remembranced` runs the Remembrance Field (`scripts/field-server.js`) as a local
service so it's **always on** and **every tool plugs into one substrate** — the
`remembrance` CLI, MCP clients (Claude Desktop, Cursor, the API connector), and
your own apps all talk to the same loopback field.

Rent the brain, own the memory: this daemon *is* the memory — local, private,
yours. Librarians (cloud or local models) are swappable on top of it.

## Install (no root)

```bash
bash scripts/remembranced-install.sh
```

It installs a `systemctl --user` unit bound to **127.0.0.1:7787**, generates a
write **token**, points durable state at `~/.local/share/remembrance`, enables +
starts the service, and health-checks it. Idempotent — re-run any time. Override
with `PORT=...` or `REMEMBRANCE_STATE_DIR=...`.

No systemd (some containers / WSL without it)? The installer prints the exact
`nohup` command to run it manually.

## Wire your tools to it

Add to your shell rc:

```bash
export REMEMBRANCE_FIELD_URL="http://127.0.0.1:7787"
export REMEMBRANCE_FIELD_TOKEN="<printed by the installer; also in the state dir>"
```

- **CLI:** `remembrance ask "…"` now recalls + stores through the daemon (single
  writer), and `remembrance field` shows the live state.
- **MCP clients:** register `http://127.0.0.1:7787/mcp` (discovery at
  `/.well-known/mcp`). Tools: `field_contribute`, `field_read`, `coherency`,
  `legacy`, `recall`.
- **Apps:** the cathedral and any repo using `field-coupling` already bridge
  their contributions to `REMEMBRANCE_FIELD_URL`.

## Manage

```bash
systemctl --user status remembranced     # is it up?
systemctl --user restart remembranced    # after an upgrade
systemctl --user stop remembranced
systemctl --user disable --now remembranced   # uninstall the service
```

## Security model

- **Loopback only** (`HOST=127.0.0.1`) — not exposed to your network.
- **Reads open, writes token-gated** — the bearer token guards `contribute` and
  `legacy store`. Keep `~/.local/share/remembrance/field-token` private.
- The substrate (`<state>/.remembrance/oracle.db`) and field (`entropy.json`)
  live on a real path, so your memory survives restarts.

## What's next

- Make a **local model** (ollama) the default librarian → fully sovereign,
  offline, cloud API as an optional senior consult.
- Point the daemon's `REMEMBRANCE_FIELD_URL` at a shared field if you want this
  machine to contribute to a wider substrate instead of only its local one.
