#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# Remembrance Ecosystem — One-Command Setup
#
# This script clones all repos and wires them together.
# Run from the directory where you want the ecosystem:
#
#   curl -sL https://raw.githubusercontent.com/Crackedcoder5TH/remembrance-oracle-toolkit/main/setup-ecosystem.sh | bash
#
# Or locally:
#   bash setup-ecosystem.sh
# ═══════════════════════════════════════════════════════════════════

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[0;33m'; NC='\033[0m'
step() { echo -e "${BLUE}[SETUP]${NC} $1"; }
ok()   { echo -e "${GREEN}[   OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[ WARN]${NC} $1"; }

GITHUB_ORG="Crackedcoder5TH"
REPOS=(
  "remembrance-oracle-toolkit"
  "Void-Data-Compressor"
  "Reflector-oracle-"
  "REMEMBRANCE-AGENT-Swarm-"
  "REMEMBRANCE-API-Key-Plugger"
  "Remembrance-dialer"
  "claw-code"
  "awesome-design-md"
)

# ─── Step 1: Clone all repos ─────────────────────────────────────
step "Cloning ecosystem repos..."
for repo in "${REPOS[@]}"; do
  if [ -d "$repo" ]; then
    warn "$repo already exists, pulling latest..."
    (cd "$repo" && git pull --ff-only 2>/dev/null) || true
  else
    git clone "https://github.com/${GITHUB_ORG}/${repo}.git" || warn "Failed to clone $repo"
  fi
done
ok "All repos cloned"

# ─── Step 2: Install Node.js dependencies ────────────────────────
step "Installing Node.js dependencies..."
for repo in "remembrance-oracle-toolkit" "Reflector-oracle-" "REMEMBRANCE-AGENT-Swarm-" "REMEMBRANCE-API-Key-Plugger" "Remembrance-dialer"; do
  if [ -f "$repo/package.json" ]; then
    (cd "$repo" && npm install 2>/dev/null) && ok "  $repo: npm install done" || warn "  $repo: npm install failed (may need manual fix)"
  fi
done

# ─── Step 3: Install Python dependencies ─────────────────────────
step "Installing Python dependencies..."
if [ -f "Void-Data-Compressor/requirements.txt" ]; then
  pip3 install -r "Void-Data-Compressor/requirements.txt" 2>/dev/null && ok "  Void-Data-Compressor: pip install done" || warn "  pip install failed"
fi

# ─── Step 4: Create .env from template ───────────────────────────
step "Setting up environment..."
if [ ! -f "remembrance-oracle-toolkit/.env" ]; then
  cp "remembrance-oracle-toolkit/.env.example" "remembrance-oracle-toolkit/.env"
  ok "Created .env from template — edit it to add your API keys"
else
  warn ".env already exists, skipping"
fi

# ─── Step 5: Initialize Oracle database ──────────────────────────
step "Initializing Oracle pattern store..."
(cd "remembrance-oracle-toolkit" && node -e "
  try {
    const { RemembranceOracle } = require('.');
    const oracle = new RemembranceOracle({ autoSeed: true });
    oracle.init().then(() => {
      const stats = oracle.stats();
      console.log('Oracle initialized: ' + (stats.totalEntries || stats.totalPatterns || 0) + ' patterns');
    });
  } catch(e) {
    console.log('Oracle init skipped: ' + e.message);
  }
" 2>/dev/null) || warn "Oracle init skipped (install deps first)"

# ─── Step 6: Link repos for local development ────────────────────
step "Linking ecosystem for local development..."

# Create symlink so Reflector can find Oracle locally
if [ -d "Reflector-oracle-/node_modules" ]; then
  rm -rf "Reflector-oracle-/node_modules/remembrance-oracle-toolkit" 2>/dev/null
  ln -sf "$(pwd)/remembrance-oracle-toolkit" "Reflector-oracle-/node_modules/remembrance-oracle-toolkit" 2>/dev/null && ok "  Reflector → Oracle: linked" || warn "  Reflector → Oracle: link failed"
fi

# ─── Step 7: Verify ──────────────────────────────────────────────
step "Verifying ecosystem..."
echo ""
echo "  Repos:"
for repo in "${REPOS[@]}"; do
  if [ -d "$repo" ]; then
    echo -e "    ${GREEN}✓${NC} $repo"
  else
    echo -e "    ${YELLOW}✗${NC} $repo (missing)"
  fi
done

echo ""
echo "  Services:"
echo "    Oracle Toolkit:     cd remembrance-oracle-toolkit && node src/cli.js"
echo "    Void Compressor:    cd Void-Data-Compressor && python3 api.py"
echo "    Reflector:          cd Reflector-oracle- && node src/cli.js run"
echo "    Agent Swarm:        cd REMEMBRANCE-AGENT-Swarm- && node src/cli.js"
echo ""
echo "  Docker (all at once):"
echo "    cd remembrance-oracle-toolkit"
echo "    cp .env.example .env  # Add your API keys"
echo "    docker compose up -d"
echo ""
echo "  Quick test:"
echo "    # Score a file"
echo "    cd remembrance-oracle-toolkit && node -e \"const o = require('.'); console.log(o.computeCoherencyScore('function add(a,b){return a+b}', {language:'javascript'}))\""
echo ""

ok "Ecosystem setup complete!"
