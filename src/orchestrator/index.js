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
const { CoherencyGenerator, GENERATOR_STATES } = require('./coherency-generator');

module.exports = {
  CoherencyDirector, CoherencyField, CoherencyZone,
  signalToCharge, analyzeChargeFlow, analyzeFieldCharge, analyzeCodebaseCharge,
  computeZonePriority, rankZones, computeHealingBudget,
  synthesizeTestStubs, extractExportedFunctions,
  CoherencyGenerator, GENERATOR_STATES,
};
