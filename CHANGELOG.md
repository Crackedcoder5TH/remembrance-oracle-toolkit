# Changelog

All notable changes to this project will be documented in this file.

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
