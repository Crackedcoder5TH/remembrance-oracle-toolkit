#!/usr/bin/env bash
# ecosystem-sweep — git status across every sibling Remembrance repo.
# Run via: npm run sweep   (from the remembrance-oracle-toolkit root)
set -u

parent="$(cd "$(dirname "$0")/../.." && pwd)"

for d in "$parent"/*/; do
  [ -d "${d}.git" ] || continue
  name="$(basename "$d")"
  n="$(git -C "$d" status --short 2>/dev/null | wc -l | tr -d ' ')"
  branch="$(git -C "$d" branch --show-current 2>/dev/null)"
  printf '  %-30s %3s uncommitted   [%s]\n' "$name" "$n" "$branch"
done
