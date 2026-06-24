#!/usr/bin/env bash
set -euo pipefail

# remembranced installer — run the Remembrance Field as an always-on user service,
# so every tool (the `remembrance` CLI, MCP clients, your own apps) plugs into ONE
# local substrate. No root: it installs a `systemctl --user` unit. Idempotent —
# re-running re-renders the unit and restarts the service.
#
# Override with env: PORT=7787  REMEMBRANCE_STATE_DIR=$HOME/.local/share/remembrance

TOOLKIT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
PORT="${PORT:-7787}"
STATE_DIR="${REMEMBRANCE_STATE_DIR:-$HOME/.local/share/remembrance}"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="$UNIT_DIR/remembranced.service"
URL="http://127.0.0.1:$PORT"

[ -n "$NODE" ] || { echo "error: node not found on PATH (Node 22+ required)"; exit 1; }
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || { echo "error: Node 22+ required (found $("$NODE" --version))"; exit 1; }

mkdir -p "$STATE_DIR" "$UNIT_DIR"

# A write token, generated once and reused — so the field isn't open to anything
# that can reach the port (even though it's loopback-only).
TOKEN_FILE="$STATE_DIR/field-token"
if [ -f "$TOKEN_FILE" ]; then
  TOKEN="$(cat "$TOKEN_FILE")"
else
  TOKEN="$("$NODE" -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  printf '%s' "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi

render_unit() {
  sed \
    -e "s#__NODE__#${NODE}#g" \
    -e "s#__TOOLKIT__#${TOOLKIT}#g" \
    -e "s#__PORT__#${PORT}#g" \
    -e "s#__STATE_DIR__#${STATE_DIR}#g" \
    -e "s#__TOKEN_LINE__#Environment=FIELD_TOKEN=${TOKEN}#g" \
    "$TOOLKIT/deploy/remembranced.service"
}

if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  render_unit > "$UNIT"
  systemctl --user daemon-reload
  systemctl --user enable --now remembranced.service
  loginctl enable-linger "$USER" >/dev/null 2>&1 || true   # keep running after logout (best-effort)
  sleep 1
  systemctl --user --no-pager status remembranced.service | head -6 || true
else
  echo "systemd --user not available — start the daemon manually (or via your init):"
  echo "  HOST=127.0.0.1 PORT=$PORT REMEMBRANCE_STATE_DIR=$STATE_DIR FIELD_TOKEN=$TOKEN \\"
  echo "    nohup \"$NODE\" \"$TOOLKIT/scripts/field-server.js\" >\"$STATE_DIR/remembranced.log\" 2>&1 &"
fi

# Health check.
for _ in 1 2 3 4 5; do
  if curl -fsS "$URL/field" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 1
done
if [ "${HEALTHY:-}" = 1 ]; then
  echo "✓ remembranced healthy at $URL"
else
  echo "… not answering at $URL/field yet — check: systemctl --user status remembranced"
fi

cat <<EOF

remembranced is installed. Point every tool at the one local field by adding to
your shell rc (~/.bashrc / ~/.zshrc):

  export REMEMBRANCE_FIELD_URL="$URL"
  export REMEMBRANCE_FIELD_TOKEN="$TOKEN"

Then:
  remembrance ask "<question>"     # now recalls + stores through the daemon
  remembrance field                # the live field state

Manage:  systemctl --user {status|restart|stop|disable} remembranced
Token:   $TOKEN_FILE  (keep it private)
EOF
