#!/usr/bin/env bash
# Session-start orientation for any AI agent (Claude Code, Cursor that
# shells out, etc.) entering a Remembrance ecosystem repo.
#
# Prints the 12-repo protocol summary so the agent can't claim ignorance.
# Output is consumed by the Claude Code SessionStart hook as additional
# context for the session.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ECO="$REPO_ROOT/ECOSYSTEM.md"

if [[ ! -f "$ECO" ]]; then
  echo "WARNING: ECOSYSTEM.md not found at $REPO_ROOT."
  echo "This repo may be outside the Remembrance ecosystem, or its sync is broken."
  echo "Canonical: https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/blob/main/ECOSYSTEM.md"
  exit 0
fi

REPO_NAME="$(basename "$REPO_ROOT")"
HASH="$(sha256sum "$ECO" | awk '{print substr($1, 1, 16)}')"

cat <<EOF
=== REMEMBRANCE ECOSYSTEM — SESSION-START ORIENTATION ===

Repo: $REPO_NAME (one of 12 in the Remembrance ecosystem)
ECOSYSTEM.md sha256[0..16]: $HASH

REQUIRED before any code change:
  1. Read ECOSYSTEM.md at repo root (full protocol).
  2. Run the §2 end-to-end workflow per change:
       a. oracle audit / reflect / covenant / security / risk
          (must return SEALED 15/15)
       b. oracle debug capture (record fix as pattern)
       c. Reflector-oracle- reflect (independent validation)
       d. REMEMBRANCE-AGENT-Swarm- review (multi-file or >50 LoC)
       e. Void-Data-Compressor absorb (reusable patterns)
       f. REMEMBRANCE-BLOCKCHAIN publish (covenant-sealed changes)
       g. git commit + push (only after a-f succeed)

Anti-patterns (each is a covenant violation):
  - Single-repo myopia (touching 1 of 12)
  - Skipping covenant
  - Lowercase repo names in GitHub REST paths
  - Trusting --dry-run (some commands mutate anyway)
  - Treating the hub's CLI as 'the ecosystem' (hub is 1 of 12)

Acknowledge before first code change:
  "Read ECOSYSTEM.md. Will run audit -> reflect -> covenant -> swarm ->
   substrate -> ledger flow per change."

=========================================================
EOF
