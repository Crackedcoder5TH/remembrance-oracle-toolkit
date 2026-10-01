#!/usr/bin/env sh
# ensure-void-runtime.sh — the ONE provisioner for the Void compressor runtime
# the goggles read coherency through.
#
# Why this exists: the pip install was already written (setup-ecosystem.sh,
# Step 3) but wired into nothing, so no session ever ran it. The goggles engine
# then tried to cold-start the Void service on the hot read path, found no
# numpy, and every read either hung (manual `goggles <file>`) or came back
# DEGRADED with coherencySource=null (the Edit/Write hooks via
# field-tool.score → _voidCoherencyOf). This script is the single place that
# "provision the Void python runtime" lives; setup-ecosystem.sh and the
# SessionStart hook both call it, so there is no second copy to drift.
#
# The dependency LIST is Void-Data-Compressor/requirements.txt — never a hard
# coded second copy here. Idempotent: an `import numpy` check short-circuits, so
# a warm session pays nothing. LOUD by design: it prints exactly what state the
# pipeline is in, so a dark instrument is never silent (all diagnostics to
# stderr so nothing pollutes a hook's stdout JSON contract).

set -u

TOOLKIT_DIR=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)
VOID_ROOT=${VOID_ROOT:-"$(cd "$TOOLKIT_DIR/.." 2>/dev/null && pwd)/Void-Data-Compressor"}
REQ="$VOID_ROOT/requirements.txt"
PORT=${VOID_SVC_PORT:-8765}

say() { printf '[void-runtime] %s\n' "$1" >&2; }

if [ ! -d "$VOID_ROOT" ]; then
  say "Void-Data-Compressor not found at $VOID_ROOT — goggles will read JS-only (degraded). Set VOID_ROOT to fix."
  exit 0
fi

# ── 1. Python deps — the import IS the check; install only when missing ──────
if python3 -c 'import numpy' 2>/dev/null; then
  : # already provisioned — nothing to do
elif [ -f "$REQ" ]; then
  say "provisioning Void python deps from requirements.txt (first run only)..."
  PIP=$(command -v pip3 || command -v pip || true)
  if [ -n "$PIP" ] && "$PIP" install --quiet -r "$REQ"; then
    say "Void python deps installed — coherency pipeline is now available."
  else
    say "WARNING: could not install Void deps — goggles coherency will be UNAVAILABLE this session (readings fall back to JS-only)."
    exit 0
  fi
else
  say "WARNING: $REQ missing — cannot provision Void; goggles coherency UNAVAILABLE."
  exit 0
fi

# ── 2. Warm the compressor service so the first real read is fast ───────────
# Cold start loads the pattern library (~65-100s). We kick it off DETACHED so
# SessionStart returns immediately; the service persists to serve later reads.
if command -v curl >/dev/null 2>&1 \
   && curl -s --noproxy 127.0.0.1 --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  say "compressor service already warm on :${PORT}."
else
  say "warming compressor service in background (~65-100s to load the library); first goggle read will then be ~1.5s."
  # Detached via nohup+setsid-if-available so it survives this hook process.
  # The goggle engine owns the actual spawn command, so we do not duplicate it.
  if command -v setsid >/dev/null 2>&1; then
    setsid sh -c "cd '$TOOLKIT_DIR' && node .claude/skills/goggles/run.mjs '$TOOLKIT_DIR/package.json' >/dev/null 2>&1" >/dev/null 2>&1 &
  else
    nohup sh -c "cd '$TOOLKIT_DIR' && node .claude/skills/goggles/run.mjs '$TOOLKIT_DIR/package.json' >/dev/null 2>&1" >/dev/null 2>&1 &
  fi
fi

# ── 3. Substrate index — seed an empty one so harvest / `--map` can GROW it ──
# The macro map and `--do harvest` read pattern_index_fractal.json before they
# write it; on a fresh clone it is absent (the .remembrance data plane is
# gitignored), so both aborted with ENOENT and the MACRO lens stayed empty.
# An empty {"index":{}} is the valid zero state — harvest fills it, the map
# reads it. Never overwrite an existing index (that would erase witnessed work).
INDEX="$VOID_ROOT/pattern_index_fractal.json"
if [ ! -f "$INDEX" ]; then
  printf '{"index":{}}' > "$INDEX" 2>/dev/null \
    && say "seeded empty substrate index → $INDEX (harvest / --map can now grow it)." \
    || say "WARNING: could not seed $INDEX — MACRO map / harvest will be UNAVAILABLE."
fi

# ── 4. Field-server — the website's substrate DATABASE (leads + ops + site) ──
# The cathedral's remembrance-bridge speaks JSON-RPC to this server (default
# :7787); it is the durable `legacy` record store on the field's own SQLite
# (the "Valor Legacies database"), coherence-scored on write by the compressor
# above. Warming the compressor alone lit up the goggles but left the website's
# data path dark — this is the half that makes the substrate a real DB for the app.
FIELD_PORT=${FIELD_PORT:-7787}
FIELD_URL="http://127.0.0.1:${FIELD_PORT}/mcp"
# Bearer so writes are gated even on a shared container. It MUST be stable: the
# field-server is launched with it AND the cathedral bridge is handed it via the
# env file, so a fresh token on every run (including the "already up" path)
# would leave the two disagreeing and every write 401ing. Persist it once under
# the state dir and reuse it — an explicit REMEMBRANCE_FIELD_TOKEN still wins.
TOKFILE="$VOID_ROOT/.remembrance/field.token"
mkdir -p "$VOID_ROOT/.remembrance" 2>/dev/null || true
if [ -n "${REMEMBRANCE_FIELD_TOKEN:-}" ]; then
  FIELD_TOKEN_VAL="$REMEMBRANCE_FIELD_TOKEN"
elif [ -f "$TOKFILE" ]; then
  FIELD_TOKEN_VAL=$(cat "$TOKFILE" 2>/dev/null || echo "")
else
  FIELD_TOKEN_VAL=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))" 2>/dev/null || echo "")
  [ -n "$FIELD_TOKEN_VAL" ] && printf '%s' "$FIELD_TOKEN_VAL" > "$TOKFILE" 2>/dev/null || true
fi
if command -v curl >/dev/null 2>&1 \
   && curl -s --noproxy 127.0.0.1 --max-time 2 -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":0,"method":"tools/list"}' "$FIELD_URL" >/dev/null 2>&1; then
  say "field-server already up on :${FIELD_PORT} (the Valor Legacies substrate DB)."
else
  say "starting field-server on :${FIELD_PORT} once the compressor is warm (the first legacy write must not hit a cold compressor, which blocks the event loop)."
  START_FS="cd '$TOOLKIT_DIR' && REMEMBRANCE_STATE_DIR='$VOID_ROOT' VOID_SVC_PORT='$PORT' FIELD_TOKEN='$FIELD_TOKEN_VAL' node scripts/field-server.js --port '$FIELD_PORT'"
  # Detached waiter: poll compressor /health (up to ~150s), THEN boot the field
  # server. Keeps SessionStart non-blocking while guaranteeing warm-before-serve.
  WAITER="i=0; while [ \$i -lt 30 ]; do curl -s --noproxy 127.0.0.1 --max-time 2 http://127.0.0.1:${PORT}/health 2>/dev/null | grep -q ok && break; i=\$((i+1)); sleep 5; done; $START_FS >/dev/null 2>&1"
  if command -v setsid >/dev/null 2>&1; then
    setsid sh -c "$WAITER" >/dev/null 2>&1 &
  else
    nohup sh -c "$WAITER" >/dev/null 2>&1 &
  fi
fi

# ── 5. Wire the session env so the cathedral bridge uses the LOCAL field ─────
# With these set, the website's SUBSTRATE_LEADS path activates and every lead +
# CRM operation persists to the field-server above instead of the local
# relational fallback — the substrate becomes the app's system of record for
# the session. Best-effort: absent CLAUDE_ENV_FILE (non-web run), we skip it.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export REMEMBRANCE_FIELD_URL='$FIELD_URL'"
    echo "export VOID_SVC_PORT='$PORT'"
    echo "export SUBSTRATE_LEADS='1'"
    echo "export SUBSTRATE_PATH='$INDEX'"
    [ -n "$FIELD_TOKEN_VAL" ] && echo "export REMEMBRANCE_FIELD_TOKEN='$FIELD_TOKEN_VAL'"
  } >> "$CLAUDE_ENV_FILE" 2>/dev/null \
    && say "session env wired → REMEMBRANCE_FIELD_URL, VOID_SVC_PORT, SUBSTRATE_LEADS=1, SUBSTRATE_PATH (cathedral now reads/writes the substrate)."
fi
exit 0
