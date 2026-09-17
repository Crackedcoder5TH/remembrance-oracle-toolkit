#!/bin/sh
# ecosystem-boot.sh — bring the WHOLE instrument up in one container.
#
# The field-server image (Dockerfile.field-server) ships the hub alone, so
# the deployed goggles could not reach the repos the instrument is made of:
# no Void compressor (every coherency fell back to the corpus read), no
# chain (nothing witnessed), no mirrors. This boot closes that: the one
# surface on the deploy is the same one surface as everywhere else.
#
#   1. Clone (or fast-forward) every ecosystem repo as siblings under
#      $ECOSYSTEM_HOME — shallow, the layout every module resolves against
#      (store-path.js, void-service.js VOID_ROOT, chain lookups).
#   2. Install the substrate-fractal wheel Void ships in dist/ (the fast
#      path; the service degrades to the slow path without it and says so).
#   3. Start the Void compressor service through its ONE controller
#      (scripts/service-ctl.py — no second spawner, per the trap ledger).
#   4. exec the field server from the hub — the MCP/HTTP surface the
#      goggles verbs and the interface speak to.
#
# Env:
#   ECOSYSTEM_HOME   parent of all repos            (default /eco)
#   GITHUB_TOKEN     token for private clones       (optional; public without)
#   ECOSYSTEM_BRANCH branch to clone                (default: each repo's default)
#   SKIP_VOID=1      skip wheel + service           (field-server-only mode)
#   SKIP_CLONE=1     trust the repos already there  (baked or mounted)
#
# Fails loud, never half-up: a repo that cannot clone is named and the boot
# stops — a surface missing its instrument must not come up looking whole.
set -eu

ECOSYSTEM_HOME="${ECOSYSTEM_HOME:-/eco}"
HUB="$ECOSYSTEM_HOME/remembrance-oracle-toolkit"
VOID="$ECOSYSTEM_HOME/Void-Data-Compressor"
OWNER="${ECOSYSTEM_OWNER:-Crackedcoder5TH}"
REPOS="remembrance-oracle-toolkit Void-Data-Compressor REMEMBRANCE-BLOCKCHAIN REMEMBRANCE-Interface MOONS-OF-REMEMBRANCE REMEMBRANCE-AGENT-Swarm- REMEMBRANCE-API-Key-Plugger"

if [ "${SKIP_CLONE:-0}" != "1" ]; then
  mkdir -p "$ECOSYSTEM_HOME"
  for repo in $REPOS; do
    dest="$ECOSYSTEM_HOME/$repo"
    if [ -d "$dest/.git" ]; then
      git -C "$dest" pull --ff-only || echo "[boot] $repo: pull failed, running on the clone as-is"
      continue
    fi
    # baked without .git (Docker COPY of the build context strips or omits
    # it): the repo is already here — cloning INTO a non-empty dir would
    # fail the whole boot for a repo we already have
    if [ -d "$dest" ] && [ -n "$(ls -A "$dest" 2>/dev/null)" ]; then
      echo "[boot] $repo: present without .git (baked) — using as-is"
      continue
    fi
    if [ -n "${GITHUB_TOKEN:-}" ]; then
      url="https://x-access-token:${GITHUB_TOKEN}@github.com/$OWNER/$repo.git"
    else
      url="https://github.com/$OWNER/$repo.git"
    fi
    echo "[boot] cloning $repo"
    git clone --depth 1 ${ECOSYSTEM_BRANCH:+--branch "$ECOSYSTEM_BRANCH"} "$url" "$dest" \
      || { echo "[boot] FATAL: $repo did not clone — the surface must not come up without its instrument"; exit 1; }
  done
fi

export VOID_ROOT="${VOID_ROOT:-$VOID}"

if [ "${SKIP_VOID:-0}" != "1" ]; then
  # the fast-path wheel Void ships; the service names the slow path itself when absent
  if ls "$VOID"/dist/*.whl >/dev/null 2>&1; then
    python3 -m pip install --no-index --break-system-packages "$VOID"/dist/*.whl 2>/dev/null \
      || echo "[boot] wheel install failed — the service will use the slow path and say so"
  fi
  echo "[boot] starting the Void compressor through its one controller"
  ( cd "$VOID" && python3 scripts/service-ctl.py start --wait ) \
    || { echo "[boot] FATAL: the instrument did not come up — refusing to serve a surface without it"; exit 1; }
fi

# BOOT_CLONE_ONLY=1: stop after the layout is proven (CI and pre-deploy
# checks exercise the clone without holding a port).
if [ "${BOOT_CLONE_ONLY:-0}" = "1" ]; then
  echo "[boot] clone-only: layout ready under $ECOSYSTEM_HOME"
  for repo in $REPOS; do
    [ -d "$ECOSYSTEM_HOME/$repo/.git" ] && echo "  present: $repo" || echo "  MISSING: $repo"
  done
  exit 0
fi

echo "[boot] the one surface is up — serving the field from the hub"
cd "$HUB"
exec node scripts/field-server.js
