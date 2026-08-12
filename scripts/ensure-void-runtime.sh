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
exit 0
