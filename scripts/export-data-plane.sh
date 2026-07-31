#!/usr/bin/env bash
set -euo pipefail

# export-data-plane.sh — copy the substrate's live data plane to a mounted
# drive as a verifiable snapshot.
#
# The fractal index (~110MB) and pattern store (17MB) are untracked live
# data: git history holds only stale generations, so whatever disk runs
# the substrate is the canonical copy. This makes a second canonical copy
# on your drive, with integrity you can check years later:
#
#   snapshot-<UTC timestamp>/
#     pattern_index_fractal.json     the 232-D substrate index
#     pattern_store.npz              the deduplicated fractal store
#     pattern_store.legacy256.npz    last 256-D generation (rollback)
#     entropy.json                   LRE field state
#     goggles-{map,readings,learning}.json   instrument memory
#     git-bundles/*.bundle           FULL git history of every repo
#     git-history-coin.json          the sealed recovery coin (chain copy)
#     MANIFEST.sha256                sha256 of every file above
#
# Usage:
#   scripts/export-data-plane.sh /media/ajani/MyDrive      # your mount
#   REMEMBRANCE_DRIVE=/mnt/drive scripts/export-data-plane.sh
#   scripts/export-data-plane.sh --verify <snapshot-dir>   # re-check hashes
#
# Point it at wherever your hard drive mounts; it refuses to run against
# a target that does not exist (no silent local "exports").

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
HOME_DIR="${ECOSYSTEM_HOME:-/home/user}"
HUB="$HOME_DIR/remembrance-oracle-toolkit"
VOID="$HOME_DIR/Void-Data-Compressor"
CHAIN="$HOME_DIR/REMEMBRANCE-BLOCKCHAIN"

if [ "${1:-}" = "--verify" ]; then
  SNAP="${2:?usage: export-data-plane.sh --verify <snapshot-dir>}"
  cd "$SNAP"
  if sha256sum -c MANIFEST.sha256 --quiet; then
    echo -e "${GREEN}snapshot verifies clean:${NC} $SNAP"
    exit 0
  else
    echo -e "${RED}INTEGRITY FAILURE${NC} in $SNAP" >&2
    exit 1
  fi
fi

TARGET="${1:-${REMEMBRANCE_DRIVE:-}}"
if [ -z "$TARGET" ]; then
  echo "usage: export-data-plane.sh <mounted-drive-path>   (or set REMEMBRANCE_DRIVE)" >&2
  exit 2
fi
if [ ! -d "$TARGET" ]; then
  echo -e "${RED}target does not exist:${NC} $TARGET — mount the drive first" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAP="$TARGET/remembrance-data-plane/snapshot-$STAMP"
mkdir -p "$SNAP/git-bundles"

echo "exporting data plane → $SNAP"

copy() { [ -f "$1" ] && cp "$1" "$SNAP/$2" && echo "  + $2" || echo "  - skipped (missing): $2"; }

copy "$VOID/pattern_index_fractal.json"      pattern_index_fractal.json
copy "$VOID/pattern_store.npz"               pattern_store.npz
copy "$VOID/pattern_store.legacy256.npz"     pattern_store.legacy256.npz
copy "$HUB/.remembrance/entropy.json"        entropy.json
copy "$HUB/.remembrance/goggles-map.json"    goggles-map.json
copy "$HUB/.remembrance/goggles-readings.json" goggles-readings.json
copy "$HUB/.remembrance/goggles-learning.json" goggles-learning.json
copy "$CHAIN/data/git-history-coin.json"     git-history-coin.json

# Git bundles: everything the coin minted — both the in-repo small ones
# and the external heavy ones (Void, hub). The drive carries ALL of them.
for b in "$CHAIN"/data/git-bundles/*.bundle "$CHAIN"/data/git-bundles-external/*.bundle; do
  [ -f "$b" ] && cp "$b" "$SNAP/git-bundles/$(basename "$b")" && echo "  + git-bundles/$(basename "$b")"
done

cd "$SNAP"
find . -type f ! -name MANIFEST.sha256 -exec sha256sum {} + | sort -k2 > MANIFEST.sha256
echo -e "${GREEN}manifest:${NC} $(wc -l < MANIFEST.sha256) files hashed"
du -sh "$SNAP" | awk '{print "snapshot size: " $1}'
echo "verify later with: scripts/export-data-plane.sh --verify $SNAP"
