'use strict';

/**
 * The Coherency Orchestrator — unified export.
 *
 * Three modules, one conductor:
 *   coherency-director  — maps zones, measures, heals, preserves, flows
 *   charge-balancer      — reads atomic charges, balances pipeline flow
 *   priority-engine      — ranks zones by impact, computes healing budget
 */

const { CoherencyDirector, CoherencyField, CoherencyZone } = require('./coherency-director');
const { signalToCharge, analyzeChargeFlow, analyzeFieldCharge, analyzeCodebaseCharge } = require('./charge-balancer');
const { computeZonePriority, rankZones, computeHealingBudget } = require('./priority-engine');
const { synthesizeTestStubs, extractExportedFunctions } = require('./test-synthesizer');

module.exports = {
  // Director (the conductor)
  CoherencyDirector,
  CoherencyField,
  CoherencyZone,

  // Charge balancer
  signalToCharge,
  analyzeChargeFlow,
  analyzeFieldCharge,
  analyzeCodebaseCharge,

  // Priority engine
  computeZonePriority,
  rankZones,
  computeHealingBudget,

  // Test synthesizer
  synthesizeTestStubs,
  extractExportedFunctions,
};
