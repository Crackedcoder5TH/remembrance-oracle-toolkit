# Oracle Compression Plan

**Goal:** Compress the entire oracle toolkit without losing any capabilities.

**Current state:** 183 source files, ~53,820 lines across 25 directories.
**Oracle store:** 1,182 patterns, avg coherency 0.856, 5 languages.

---

## Oracle Consultation Results

| Query | Oracle Verdict | Details |
|-------|---------------|---------|
| "compression" | **GENERATE** | No compression patterns exist — this is new territory |
| "code deduplication merging overlapping modules" | **GENERATE** | No existing consolidation patterns |
| "codebase size reduction without losing features" | **GENERATE** | Nothing close enough |
| "barrel re-export consolidation" | **PULL** (0.744) | Oracle has a proven barrel pattern (coherency 1.0) |
| "consolidate duplicate merge files" | Found `maintenance-auto-consolidate-ts` (coherency 0.96) | Proven consolidation pattern exists |

**Oracle's message:** *"Nothing in the remembrance matched your need closely enough. This is a space for new creation — write what the oracle has not yet seen, and it will remember."*

The oracle says: build it fresh, then register it as a new pattern.

---

## Current Codebase Anatomy

| Directory | Files | Lines | Role | Compressible? |
|-----------|-------|-------|------|---------------|
| `src/core/` | 28 | 10,341 | Coherency, covenant, reflection, feedback, search | **YES — HIGH** |
| `src/reflector/` | 24 | 7,016 | Codebase analysis, scoring, reporting | **YES — HIGH** |
| `src/evolution/` | 11 | 5,283 | Healing, optimization, lifecycle | **YES — MEDIUM** |
| `src/swarm/` | 19 | 4,215 | Multi-agent intelligence | MEDIUM |
| `src/cli/` | ~8 | 3,721 | Command interface | LOW |
| `src/api/` | 18 | 2,780 | Oracle public interface | LOW |
| `src/patterns/` | ~5 | 2,673 | Pattern library + composer | LOW |
| `src/dashboard/` | 6 | 2,415 | Web UI | MEDIUM |
| `src/debug/` | 2 | 2,297 | Error intelligence | LOW |
| `src/ci/` | 7 | 2,298 | Auto-register pipeline | LOW |
| `src/cloud/` | 3 | 1,440 | Remote sync | MEDIUM |
| `src/search/` | 3 | 1,200 | Embeddings + vectors | LOW |
| `src/auth/` | 3 | 1,187 | Token auth + teams | LOW |
| `src/plugins/` | 8 | 1,004 | Plugin architecture | LOW |
| `src/analytics/` | 3 | 875 | Reporting + insights | **YES — HIGH** |
| `src/connectors/` | 4 | 722 | AI provider bridges | LOW |
| `src/ide/` | 2 | 727 | IDE integration | **YES — MERGE** |
| `src/mcp/` | 3 | 692 | MCP protocol server | LOW |
| `src/constants/` | 1 | 238 | Centralized thresholds | LOW |
| `src/health/` | 1 | 231 | Health monitor | **YES — MERGE** |
| `src/store/` | ~3 | 1,625 | SQLite + history | LOW |

---

## Phase 1: Quick Wins (Eliminate directories, ~1,500 lines saved)

### 1.1 Merge `src/health/` → `src/dashboard/`
- **What:** Move `monitor.js` (231 lines) into `dashboard/monitoring.js`
- **Why:** Only used by dashboard routes + index.js exports
- **Savings:** -1 directory, cleaner dependency graph
- **Risk:** None — re-export from index.js preserves API

### 1.2 Merge `src/ide/` → `src/connectors/`
- **What:** Move `bridge.js` + `mcp-install.js` into `connectors/`
- **Why:** IDE bridge is a connector like GitHub/MCP — same category
- **Savings:** -1 directory
- **Risk:** Low — update plugin loader path

### 1.3 Relocate `src/analytics/` (split by actual owner)
- **What:**
  - Move `actionable-insights.js` (334 lines) → `src/evolution/actionable-insights.js`
    (it imports from evolution.js — that's where it belongs)
  - Merge `analytics.js` (158 lines) + `insights.js` (384 lines) → `src/dashboard/analytics.js`
- **Why:** Analytics reporting belongs with dashboard; lifecycle actions belong with evolution
- **Savings:** -1 directory, -1 file, eliminates circular dependency
- **Risk:** Low — straightforward move + re-export

**Phase 1 total: -3 directories, ~100 lines of dead import/export code eliminated**

---

## Phase 2: Core Consolidation (~2,000-3,000 lines saved)

### 2.1 Consolidate covenant files (6 → 3 files)
**Current:** 6 files, 797 lines
- `covenant.js` (303) — orchestrator
- `covenant-principles.js` (39) — 15 principle definitions
- `covenant-harm.js` (133) — harm patterns
- `covenant-deep-security.js` (77) — language security patterns
- `covenant-evolution.js` (226) — evolved principles
- `covenant-patterns.js` (19) — barrel re-export

**Proposed:**
- `covenant.js` — orchestrator (keep as-is)
- `covenant-data.js` — merge principles + harm + deep-security + barrel (268 lines → ~220)
- `covenant-evolution.js` — keep as-is (different lifecycle)

**Savings:** -3 files, ~50 lines (duplicate `_k()` helper eliminated)

### 2.2 Extract shared utilities from core (deduplicate across files)
**Duplicated helpers found:**
- `_k(...parts)` — join helper, duplicated in 3-5 files
- `_markerRe()` — TODO/FIXME regex, duplicated in 2 files
- Quote style detection — duplicated in 3 files
- `@oracle-pattern-definitions` flag checks — duplicated in 3 files
- Bracket balance checking — 2 different implementations

**Action:** Create `src/core/shared-utils.js` (~40 lines):
```javascript
const _k = (...parts) => parts.join('');
const _markerRe = () => new RegExp('\\b(' + ['TO'+'DO','FIX'+'ME','HA'+'CK','X'+'XX'].join('|') + ')\\b', 'g');
const detectQuoteStyle = (code) => { /* count single vs double */ };
const isOracleInfrastructure = (code) => code.includes('@oracle-infrastructure');
const isPatternDefinition = (code) => code.includes('@oracle-pattern-definitions');
```

**Savings:** ~80 lines of duplicated helpers

### 2.3 Consolidate reflector scoring (9 → 4 files)
**Current:** 9 scoring files, 1,764 lines
- `scoring-coherence.js` (347)
- `scoring-analysis-aggregate.js` (274)
- `scoring-analysis-complexity.js` (224)
- `scoring-config.js` (262)
- `scoring-errors.js` (185)
- `scoring-modes.js` (208)
- `scoring-analysis-security.js` (114)
- `scoring-utils.js` (92)
- `scoring-analysis.js` (18 — barrel)

**Proposed:**
- `scoring.js` — merge coherence + analysis-aggregate + analysis-complexity + analysis-security + utils (~750 lines from 1,051)
- `scoring-config.js` — merge config + modes + barrel (~400 lines from 488)
- `scoring-errors.js` — keep as-is (185)
- Delete `scoring-analysis.js` barrel (replaced by direct exports)

**Savings:** -5 files, ~300 lines (shared utilities, duplicate boilerplate)

### 2.4 Consolidate reflector reporting (8 → 4 files)
**Current:** 8 report files
- `report-safety.js` (532) — backup, rollback, dry-run
- `report-history.js` (344) — run logging
- `report-autocommit.js` (446) — safety branches, test gates
- `report-notifications.js` (346) — Slack/Discord
- `report-pattern-hook.js` (381) — pattern-guided healing
- `report-dashboard.js` (416) — web dashboard
- `report-github.js` (365) — git operations
- `report-pr.js` (278) — PR formatting
- `report-lazy.js` (26) — circular dep helper

**Proposed:**
- `report-safety.js` — merge safety + rollback + history (~700 from 902)
- `report-output.js` — merge PR + GitHub + notifications (~800 from 989)
- `report-dashboard.js` — keep as-is (416)
- `report-autocommit.js` — merge with pattern-hook (~650 from 827)
- Delete `report-lazy.js` (inline the helper)

**Savings:** -4 files, ~300 lines

### 2.5 Consolidate reflection files (5 → 3 files)
**Current:** 5 files, 841 lines
- `reflection.js` (21) — barrel
- `reflection-loop.js` (303) — main loop
- `reflection-transforms.js` (201) — 5 transforms
- `reflection-scorers.js` (223) — 5 scorers
- `reflection-serf.js` (93) — constants + similarity

**Proposed:**
- `reflection.js` — merge barrel + SERF constants + loop (~370 lines)
- `reflection-transforms.js` — keep as-is (201)
- `reflection-scorers.js` — keep as-is (223)

**Savings:** -2 files, ~50 lines

### 2.6 Consolidate feedback files (3 → 2 files)
**Current:** 3 files, 329 lines

**Proposed:**
- `feedback.js` — merge barrel + orchestrator + covenant feedback (~180 lines)
- `feedback-coherency.js` — keep as-is but use shared `_markerRe()` (137)

**Savings:** -1 file, ~15 lines

---

## Phase 3: Cross-System Deduplication (~700-1,000 lines saved)

### 3.1 Extract shared healing orchestrator
**Problem:** Both `evolution/recycler.js` and `reflector/multi-engine.js` implement healing loops wrapping the same `reflectionLoop()`.

**Action:** Create `src/core/healing-orchestrator.js` (~100 lines):
- Pre-heal backup/snapshot
- Call `reflectionLoop()` with config
- Post-heal validation
- Report generation

Both evolution and reflector use this instead of custom loops.

**Savings:** ~200 lines of duplicate loop scaffolding

### 3.2 Unify evolution lifecycle + self-optimize
**Problem:** `lifecycle.js` (444) and `self-optimize.js` (1,106) have overlapping cycle management.

**Action:** Merge into single `lifecycle.js` with self-optimization as a phase within the lifecycle rather than a separate system.

**Savings:** ~300 lines

### 3.3 Move reflector extended scoring to core
**Problem:** Reflector's scoring (complexity, security, readability) duplicates/extends core coherency but isn't available to evolution.

**Action:** Create `src/core/extended-coherency.js` — move the general-purpose scoring logic from reflector into core so both systems share it.

**Savings:** ~500 lines (deduplicated scoring logic)

---

## Phase 4: Structural Compression (~500 lines saved)

### 4.1 Compress `src/index.js` (421 lines → ~200 lines)
**Problem:** index.js individually re-exports 300+ symbols with verbose aliasing (e.g., `reflectorCreateHealingBranch`, `reflectorGenerateWorkflow`, etc.)

**Action:** Use the oracle's proven barrel pattern:
```javascript
// Instead of 120 individual reflector re-exports:
const reflector = { ...require('./reflector/scoring'), ...require('./reflector/multi'), ...require('./reflector/report') };
module.exports = { ...reflector, /* other modules */ };
```

Consumers access via `oracle.reflectorDeepScore()` — same API, fewer lines.

**Savings:** ~200 lines in index.js

### 4.2 Consolidate swarm files (19 → ~12 files)
**Current:** 19 files, 4,215 lines — many small utility files

**Candidates for merge:**
- `voice.js` (51) + `templates.js` (120) → `swarm-config.js`
- `visualization.js` (168) + `progress.js` (82) → `swarm-display.js`
- `queue.js` (122) + `pool.js` (197) → `swarm-pool.js`
- `recovery.js` (84) + `escalation.js` (113) → `swarm-resilience.js`

**Savings:** -7 files, ~100 lines of boilerplate

### 4.3 Compress cloud module (3 → 2 files)
- Merge `negotiation.js` (134) into `client.js` (307)
- Protocol negotiation is only used by the client

**Savings:** -1 file, ~30 lines

---

## Summary

| Phase | Action | Files Removed | Lines Saved | Risk |
|-------|--------|--------------|-------------|------|
| **Phase 1** | Directory merges (health, ide, analytics) | ~6 files, -3 dirs | ~100 | Low |
| **Phase 2** | Core consolidation (covenant, reflection, feedback, reflector scoring/reports) | ~15 files | ~800 | Low-Medium |
| **Phase 3** | Cross-system deduplication (healing, lifecycle, scoring) | ~3 files | ~1,000 | Medium |
| **Phase 4** | Structural compression (index.js, swarm, cloud) | ~8 files | ~330 | Low |
| **Total** | | **~32 files** | **~2,230 lines** | |

**Before:** 183 files, 53,820 lines, 25 directories
**After:** ~151 files, ~51,590 lines, 22 directories

---

## Capabilities Preserved (Zero Loss)

Every capability survives compression:

- All 1,182 oracle patterns remain intact
- All CLI commands work identically
- All MCP tools (10) remain available
- All API exports preserved (barrel re-exports)
- Covenant (15 principles) unchanged
- Reflection loop (SERF) unchanged
- Healing pipeline unchanged
- Three-tier storage (local/personal/community) unchanged
- Swarm intelligence unchanged
- Dashboard, Auth, Cloud all functional
- Git hooks (pre-commit, post-commit) unchanged
- Auto-register pipeline unchanged

---

## Execution Order

```
Phase 1.1  health/ → dashboard/          (safest, start here)
Phase 1.2  ide/ → connectors/            (safe, independent)
Phase 1.3  analytics/ → split            (safe, independent)
Phase 2.1  covenant consolidation         (core, careful)
Phase 2.2  shared-utils extraction        (core, careful)
Phase 2.3  reflector scoring merge        (reflector, medium)
Phase 2.4  reflector reporting merge      (reflector, medium)
Phase 2.5  reflection file merge          (core, careful)
Phase 2.6  feedback file merge            (core, easy)
Phase 3.1  healing orchestrator           (cross-system, careful)
Phase 3.2  lifecycle + self-optimize      (evolution, medium)
Phase 3.3  extended coherency to core     (cross-system, careful)
Phase 4.1  index.js barrel compression    (structural, easy)
Phase 4.2  swarm consolidation            (swarm, easy)
Phase 4.3  cloud merge                    (cloud, easy)
```

Run `node --test tests/*.test.js` after each phase to verify zero regression.

---

## Post-Compression: Register with Oracle

After compression succeeds and tests pass:

```bash
# Register the compression pattern itself
node src/cli.js register \
  --file COMPRESSION-PLAN.md \
  --name "oracle-full-compression" \
  --tags "refactoring,consolidation,compression,architecture"

# Feed back success
node src/cli.js feedback --id <id> --success
```

The oracle told us to GENERATE — once we execute this, the oracle will remember it for next time.
