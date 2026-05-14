# Changelog

All notable changes to this project will be documented in this file.

## [3.7.0] - Dead-Feature Wiring + Field as Compass

### Added — every dead constant from `src/constants/thresholds.js` and `src/quantum/quantum-core.js` is now wired and observable
- `CASCADE_THRESHOLD` (was: imported once, never read; doc-promise "amplitude above this spawns new entangled variants"):
  `QuantumField.feedback()` now detects an upward crossing on success
  and fires `onCascade`. Oracle's default handler spawns 2 entangled
  variants via the existing `recycler._generateTournamentContenders`,
  stores them as candidates tagged `cascade-spawn` with `parentPattern`,
  and entangles spawned siblings. Emits `cascade_spawn` event.
- `PHASE_DRIFT_RATE` (was: imported, never read; doc-promise "phase
  drift per day"): new `applyPhaseDrift(currentPhase, lastObservedAt,
  now)` in `quantum-core.js`. `decoherenceSweep()` now persists drifted
  phase alongside decohered amplitude. Sweep report carries
  `phaseDrifted` per table and `totalPhaseDrifted` at the top level.
- `DOMAIN_FLOOR_ADJUSTMENTS` + `getDomainFloor()` (was: defined,
  exported, never imported anywhere): `validateCode` now accepts
  `options.domain`. The per-domain floor is a non-negotiable MINIMUM —
  an explicit caller threshold is ratcheted up to the floor for
  domains that demand stricter coherency (e.g. security: 0.65).
  `submit()` and `registerPattern()` propagate `domain` through.

### Added — `src/core/event-field-bridge.js`
- The compass: every `oracle._emit(...)` event lands in the LRE field
  via `field-coupling.contribute()` with source key `event:<type>`.
- 26 event types mapped to calibrated coherence signals (positive
  outcomes 0.75-0.95, maintenance 0.4-0.7, failures 0.1-0.3).
- Unknown event types skipped (no mislabeling).
- Cost extracted from batch hints (`spawned`, `totalDecohered`,
  `harvested`, etc.) where present.
- Closes the 19-events-with-6-handlers gap previously observed.

### Added — field contributions for every new trigger
- `quantum:cascade-spawn:<table>` (cascade trigger fires)
- `quantum:decoherence-sweep` (one summary per sweep, avg amplitude)
- `quantum:phase-drift-sweep` (one summary if any phase advanced)
- `validator:domain:<domain>` (per-domain validation)
- `validator:domain-floor-ratchet:<domain>` (when floor lifts threshold)

### Fixed
- `src/core/living-remembrance.js:138` — hub JS LRE now clamps
  `newCoherence` at 0.999 to restore Void contract **C-56** parity
  with the Python LRE and the TS LRE. Comment previously asserted
  "unbounded ratcheting" as intent; empirically observed
  `coherence = 1.005` in `.remembrance/entropy.json` before fix.

### Added — documentation
- `FIELD.md` — canonical operational reference for the LRE field.
  Tables of every producer, source key, cost/coherence semantics,
  the update math, the cap invariants, verification commands, the
  covenant for AI participants.
- `AGENTS.md` updated to point at `FIELD.md` after `ECOSYSTEM.md`
  and surface the engineering covenant up front.

### Tests
- `tests/quantum-field.test.js`: +6 cases (cascade trigger, sweep
  phase drift, sweep field contribution)
- `tests/quantum-core.test.js`: +5 cases (applyPhaseDrift math)
- `tests/validator-domain-floor.test.js`: NEW file, 11 cases
- `tests/event-field-bridge.test.js`: NEW file, 11 cases
- Hub suite: 4424/4424 pass (was 4390 → +34 new tests, zero regressions)

## [3.6.0] - Evolution Subsystem Reorganization

### Changed
- Reorganized evolution subsystem into dedicated `src/evolution/` directory
- Added `OracleContext` adapter interface to decouple evolution from raw oracle
- Moved evolution.js, self-optimize.js, lifecycle.js, whisper.js to `src/evolution/`
- Added barrel re-exports in `index.js` with `createOracleContext`
- Created shims in `src/core/` for backward compatibility
- All functions accept both OracleContext and raw oracle via duck-typing
- 1735 tests pass, no breaking changes

## [3.5.1] - Desync Fix

### Fixed
- `addPattern()` duplicate prevention via `addPatternIfNotExists()`
- Added UNIQUE index `idx_patterns_unique_name_lang` at SQLite level
- Auto-deduplication of existing data on schema migration
- Case-insensitive dedup keys in `federatedQuery`
- `transferPattern` fallback path now checks for existing patterns

## [3.5.0] - Self-Management System

### Added
- Lifecycle engine (`src/core/lifecycle.js`) — event-driven auto-management with configurable thresholds
- Healing whisper (`src/core/whisper.js`) — event aggregation and summary text
- Self-optimize (`src/core/self-optimize.js`) — two-phase improvement cycle (improve + optimize)
- CLI commands: `evolve`, `improve`, `optimize`, `full-cycle`, `lifecycle start/stop/status/run/history`
- Oracle methods: `selfImprove()`, `selfOptimize()`, `fullOptimizationCycle()`

## [3.4.0] - Auto-Tagger

### Added
- Aggressive keyword extraction and categorization (`src/core/auto-tagger.js`)
- 6 tag sources: code domain, description keywords, concept clusters, language detection, name extraction, pattern name
- 40+ domain detectors (auth, crypto, database, network, UI, React, Solana, blockchain, AI, etc.)
- 8 construct detectors (recursive, closure, singleton, factory, builder, iterator, generic, higher-order)
- Auto-runs in `oracle.submit()` and `oracle.registerPattern()`
- CLI: `oracle retag <id>` and `oracle retag all` with `--dry-run` support
- MCP tools: `oracle_retag`, `oracle_retag_all`, `oracle_auto_tag`

## [3.3.0] - Self-Evolution Engine

### Added
- Auto-heal for patterns with <40% success rate after 5+ uses
- Staleness penalty: linear ramp 0-0.15 from 30-180 days unused
- Evolve penalty: 0.05 per child fork (3+ threshold), capped at 0.20
- Rejection capture for recycler healing
- Regression detection for patterns with success rate drop >= 0.3
- Full cycle: `oracle.selfEvolve()` runs all checks + healing

## [3.2.0] - Extension System

### Added
- Plugin registries (`src/plugins/registry.js`) for runners, principles, storage, search
- 3-tier embedding engine (builtin 64D, Ollama, plugin) via `src/core/embedding-engine.js`
- Insights module (`src/core/insights.js`) for usage trends, evolve tracking, staleness, search analytics
- Federation hub (`src/federation/hub.js`) for team management with push/pull and activity tracking

## [3.1.0] - Plugin System & Health

### Added
- Plugin system (`src/plugins/manager.js`) with HookEmitter and 8 hooks
- Health monitor (`src/health/monitor.js`) with `health()`, `metrics()`, `coherencyDistribution()`
- Actionable feedback with line-number covenant diagnostics
- TypeScript type definitions (`types/index.d.ts`)
- QUICKSTART.md — 30-second quickstart guide
- Dashboard endpoints: `/api/health` (full health check), `/api/metrics` (coherency distribution + usage)
- Validator: `result.feedback` field with actionable feedback on rejection
- CLI: `oracle plugin load/list/unload`
- CLI: `oracle init`/`oracle setup` fixed
