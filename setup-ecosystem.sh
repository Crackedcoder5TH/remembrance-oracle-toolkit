#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════
# Remembrance Ecosystem — One-Command Setup
#
# Clones every repo, installs Node + Python deps, stamps covenant
# baselines, and prints next-step commands. Run from the parent
# directory where you want the ecosystem to live:
#
#   mkdir -p ~/remembrance && cd ~/remembrance
#   curl -sL https://raw.githubusercontent.com/Crackedcoder5TH/remembrance-oracle-toolkit/main/setup-ecosystem.sh | bash
#
# Or locally:
#   bash setup-ecosystem.sh
#
# Flags:
#   SKIP_INSTALL=1   clone only, don't run npm/pip
#   SKIP_BASELINE=1  don't run the initial diagnostic / baseline
#   BRANCH=main      checkout a specific branch (default: main)
# ═══════════════════════════════════════════════════════════════════════

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "${BLUE}[SETUP]${NC} $1"; }
ok()   { echo -e "${GREEN}[   OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[ WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }

GITHUB_ORG="${GITHUB_ORG:-Crackedcoder5TH}"
BRANCH="${BRANCH:-main}"

# All 12 ecosystem repos. Order matters — oracle + void are prerequisites
# for the others, so they clone/install first.
REPOS_CORE=(
  "remembrance-oracle-toolkit"
  "Void-Data-Compressor"
)
REPOS_SERVICES=(
  "Reflector-oracle-"
  "REMEMBRANCE-AGENT-Swarm-"
  "REMEMBRANCE-Interface"
  "REMEMBRANCE-BLOCKCHAIN"
  "MOONS-OF-REMEMBRANCE"
  "REMEMBRANCE-API-Key-Plugger"
  "Remembrance-dialer"
)
REPOS_EXTRAS=(
  "claw-code"
  "awesome-design-md"
)
ALL_REPOS=("${REPOS_CORE[@]}" "${REPOS_SERVICES[@]}" "${REPOS_EXTRAS[@]}")

# ─── Step 1: Clone ─────────────────────────────────────────────────────
step "Cloning ${#ALL_REPOS[@]} ecosystem repos..."
for repo in "${ALL_REPOS[@]}"; do
  if [ -d "$repo/.git" ]; then
    warn "$repo already exists — fetching latest on $BRANCH"
    (cd "$repo" && git fetch origin "$BRANCH" 2>/dev/null && git checkout "$BRANCH" 2>/dev/null && git pull --ff-only 2>/dev/null) || warn "  $repo: pull skipped"
  else
    if git clone --branch "$BRANCH" "https://github.com/${GITHUB_ORG}/${repo}.git" 2>/dev/null; then
      ok "  cloned $repo"
    else
      # Fallback: try default branch if requested branch doesn't exist
      if git clone "https://github.com/${GITHUB_ORG}/${repo}.git" 2>/dev/null; then
        ok "  cloned $repo (default branch — $BRANCH not found)"
      else
        fail "  could not clone $repo (check GitHub access)"
      fi
    fi
  fi
done
ok "Clone phase complete"

if [ "${SKIP_INSTALL:-0}" = "1" ]; then
  warn "SKIP_INSTALL=1 — skipping dependency install"
else
  # ─── Step 2: Node installs ────────────────────────────────────────────
  step "Installing Node.js dependencies..."
  for repo in "remembrance-oracle-toolkit" "Reflector-oracle-" "REMEMBRANCE-AGENT-Swarm-" \
              "REMEMBRANCE-Interface" "REMEMBRANCE-BLOCKCHAIN" "MOONS-OF-REMEMBRANCE" \
              "REMEMBRANCE-API-Key-Plugger" "Remembrance-dialer" "claw-code"; do
    if [ -f "$repo/package.json" ]; then
      (cd "$repo" && npm install --prefer-offline --no-audit --no-fund >/dev/null 2>&1) \
        && ok "  $repo: node deps installed" \
        || warn "  $repo: npm install had warnings (may still work)"
    fi
  done

  # The cathedral ships inside the oracle repo at digital-cathedral/
  if [ -f "remembrance-oracle-toolkit/digital-cathedral/package.json" ]; then
    (cd "remembrance-oracle-toolkit/digital-cathedral" && npm install --prefer-offline --no-audit --no-fund >/dev/null 2>&1) \
      && ok "  digital-cathedral: node deps installed" \
      || warn "  digital-cathedral: npm install had warnings"
  fi

  # ─── Step 3: Python installs ──────────────────────────────────────────
  step "Installing Python dependencies..."
  if command -v pip3 >/dev/null 2>&1 || command -v pip >/dev/null 2>&1; then
    PIP=$(command -v pip3 || command -v pip)
    if [ -f "Void-Data-Compressor/requirements.txt" ]; then
      "$PIP" install --quiet -r "Void-Data-Compressor/requirements.txt" 2>/dev/null \
        && ok "  Void-Data-Compressor: pip deps installed" \
        || warn "  Void-Data-Compressor: pip install had warnings"
    fi
    # ruff enables Python audit in cathedral-diagnostic
    "$PIP" install --quiet ruff 2>/dev/null \
      && ok "  ruff installed (enables Python audit)" \
      || warn "  ruff install failed (Python audit will be skipped)"
  else
    warn "  pip not found — Python-side features will be limited"
  fi
fi

# ─── Step 4: Environment file ─────────────────────────────────────────
step "Setting up environment..."
if [ ! -f "remembrance-oracle-toolkit/.env" ] && [ -f "remembrance-oracle-toolkit/.env.example" ]; then
  cp "remembrance-oracle-toolkit/.env.example" "remembrance-oracle-toolkit/.env"
  ok "  created remembrance-oracle-toolkit/.env (edit to add API keys)"
fi
if [ ! -f "remembrance-oracle-toolkit/digital-cathedral/.env" ] \
   && [ -f "remembrance-oracle-toolkit/digital-cathedral/.env.example" ]; then
  cp "remembrance-oracle-toolkit/digital-cathedral/.env.example" "remembrance-oracle-toolkit/digital-cathedral/.env"
  ok "  created digital-cathedral/.env (edit to add API keys)"
fi

# ─── Step 5: Stamp covenant baselines ─────────────────────────────────
if [ "${SKIP_BASELINE:-0}" = "1" ]; then
  warn "SKIP_BASELINE=1 — skipping initial diagnostic"
else
  step "Running initial covenant diagnostic + stamping baselines..."
  if [ -d "remembrance-oracle-toolkit" ]; then
    (cd "remembrance-oracle-toolkit" && {
      node scripts/cathedral-diagnostic.js --json-only >/dev/null 2>&1 || true
      node scripts/covenant-ratchet.js --save-baseline >/dev/null 2>&1 || true
      node scripts/ecosystem-diagnostic.js --parent "$(cd .. && pwd)" >/dev/null 2>&1 || true
      node scripts/ecosystem-ratchet.js --save-baseline >/dev/null 2>&1 || true
    }) && ok "  baselines stamped (cathedral + ecosystem)" \
      || warn "  baseline stamping had issues — run manually after setup"
  fi
fi

# ─── Step 6: Install the unified `remembrance` CLI ─────────────────────
step "Installing unified CLI..."
BIN_PATH="remembrance-oracle-toolkit/bin/remembrance"
if [ -f "$BIN_PATH" ]; then
  chmod +x "$BIN_PATH" 2>/dev/null || true
  ok "  CLI available at: $BIN_PATH"
  echo "  Add to PATH:  export PATH=\"\$PATH:$(pwd)/remembrance-oracle-toolkit/bin\""
fi

# ─── Step 7: Verification ──────────────────────────────────────────────
step "Verifying ecosystem..."
MISSING=0
for repo in "${ALL_REPOS[@]}"; do
  if [ -d "$repo" ]; then
    echo -e "  ${GREEN}✓${NC} $repo"
  else
    echo -e "  ${YELLOW}✗${NC} $repo (missing)"
    MISSING=$((MISSING + 1))
  fi
done

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Remembrance Ecosystem Setup Complete${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Add API keys (optional, feature-gated):"
echo "     \$EDITOR remembrance-oracle-toolkit/.env"
echo ""
echo "  2. Run a coherency check against any file:"
echo "     cd remembrance-oracle-toolkit"
echo "     node src/cli.js audit check --file <path>"
echo ""
echo "  3. Start the cathedral (Valor Legacies) locally:"
echo "     cd remembrance-oracle-toolkit/digital-cathedral && npm run dev"
echo ""
echo "  4. Run the cross-repo diagnostic anytime:"
echo "     cd remembrance-oracle-toolkit"
echo "     node scripts/ecosystem-diagnostic.js"
echo ""
echo "  Docs:"
echo "     remembrance-oracle-toolkit/QUICKSTART.md"
echo "     remembrance-oracle-toolkit/CLAUDE.md"
echo ""
if [ "$MISSING" -gt 0 ]; then
  warn "$MISSING repo(s) missing — some features may be unavailable"
fi
ok "Done."
