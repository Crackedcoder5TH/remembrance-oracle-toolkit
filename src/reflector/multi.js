/**
 * Remembrance Reflector BOT — Consolidated Multi Module (Barrel)
 *
 * Re-exports all symbols from the four sub-modules so that existing
 * `require('./multi')` calls continue to work unchanged.
 *
 * Sub-modules:
 *   multi-engine.js      — Core reflector engine
 *   multi-analysis.js    — Multi-repo analysis
 *   multi-orchestrator.js — Full workflow orchestrator
 *   multi-scheduler.js   — Task scheduling
 */

const engine = require('./multi-engine');
const analysis = require('./multi-analysis');
const orchestrator = require('./multi-orchestrator');
const scheduler = require('./multi-scheduler');

module.exports = {
  // Engine
  ...engine,
  // Multi-repo analysis
  ...analysis,
  // Orchestrator
  ...orchestrator,
  // Scheduler
  ...scheduler,
};
