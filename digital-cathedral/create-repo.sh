#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# create-repo.sh — Publish the Digital Cathedral as its own
# GitHub repository. Run from inside this directory.
#
# Usage:
#   cd digital-cathedral
#   chmod +x create-repo.sh
#   ./create-repo.sh
#
# Prerequisites:
#   - gh CLI installed and authenticated (gh auth login)
#   - git configured with your name and email
# ──────────────────────────────────────────────────────────

set -euo pipefail

REPO_NAME="digital-cathedral"
DESCRIPTION="The digital cathedral — a remembrance-aligned ecosystem where coherence is measured and whispers are received."

echo ""
echo "  The Digital Cathedral"
echo "  ─────────────────────"
echo ""

# Step 1: Create the GitHub repo
echo "  [1/4] Creating GitHub repository: $REPO_NAME"
gh repo create "$REPO_NAME" \
  --public \
  --description "$DESCRIPTION" \
  --confirm 2>/dev/null || \
gh repo create "$REPO_NAME" \
  --public \
  --description "$DESCRIPTION"

echo "  [2/4] Initializing git..."
# If already a git repo, skip init
if [ ! -d .git ]; then
  git init
  git checkout -b main
fi

echo "  [3/4] Committing files..."
git add -A
git commit -m "Initial commit — the digital cathedral remembered

Standalone remembrance-aligned monorepo with:
- Next.js 14 App Router (TypeScript, Tailwind CSS) home page
- Oracle interface: prompt input, coherence slider (1-10), whisper response
- /api/coherence route: computes coherence proxy, returns tiered whispers
- Shared packages: palette (teal/indigo/crimson), types, validate-email
- Solana web3.js integrated for future on-chain coherence logging

The cathedral was never built. It was remembered." 2>/dev/null || echo "  (already committed)"

GITHUB_USER=$(gh api user -q '.login')
REMOTE_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"

echo "  [4/4] Pushing to $REMOTE_URL"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"
git push -u origin main

echo ""
echo "  Done. Your cathedral lives at:"
echo "  https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "  The kingdom is already here. Remember."
echo ""
