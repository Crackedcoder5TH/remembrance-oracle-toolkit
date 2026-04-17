'use strict';

/**
 * Charge Balancer — balances the charge flow across the pipeline.
 *
 * Every atomized function has a charge: +1 (expands), -1 (contracts),
 * 0 (transforms). A balanced pipeline has net charge near zero —
 * expansions are matched by contractions, with transforms in between.
 *
 * When charge is unbalanced:
 *   - Net positive (too much expansion) → data grows unchecked,
 *     complexity increases, coherency may drop from noise
 *   - Net negative (too much contraction) → data shrinks too
 *     aggressively, information is lost, coherency drops from
 *     over-filtering
 *   - Net zero (balanced) → the pipeline transforms without
 *     growing or shrinking, maintaining coherency
 *
 * The charge balancer reads atomic properties from both the oracle's
 * own functions and the void compressor's functions, computes the
 * net charge across the active pipeline, and recommends which
 * dimensions to heal to restore balance.
 *
 * It also maps pipeline signals to charges: a strong signal (> 0.8)
 * is positive-charge (that dimension is expanding trust), a weak
 * signal (< 0.4) is negative-charge (that dimension is contracting
 * confidence), and moderate signals are neutral.
 */

/**
 * Map a pipeline signal value to a charge.
 * @param {number} value - signal strength (0-1)
 * @returns {number} -1, 0, or +1
 */
function signalToCharge(value) {
  if (typeof value !== 'number' || !isFinite(value)) return 0;
  if (value >= 0.8) return 1;   // strong → expanding
  if (value <= 0.4) return -1;  // weak → contracting
  return 0;                      // moderate → transforming
}

/**
 * Analyze the charge flow across a set of pipeline signals.
 *
 * @param {object} signals - { audit: 0.9, ground: 0.3, plan: 0.7, ... }
 * @returns {{
 *   chargeMap: object,       // { audit: +1, ground: -1, plan: 0, ... }
 *   netCharge: number,       // sum of all charges
 *   expanding: string[],     // signals with +1 charge
 *   contracting: string[],   // signals with -1 charge
 *   neutral: string[],       // signals with 0 charge
 *   balance: string,         // 'balanced' | 'expanding' | 'contracting'
 *   recommendation: string   // what to do
 * }}
 */
function analyzeChargeFlow(signals) {
  const chargeMap = {};
  const expanding = [];
  const contracting = [];
  const neutral = [];

  for (const [name, value] of Object.entries(signals)) {
    const charge = signalToCharge(value);
    chargeMap[name] = charge;
    if (charge > 0) expanding.push(name);
    else if (charge < 0) contracting.push(name);
    else neutral.push(name);
  }

  const netCharge = Object.values(chargeMap).reduce((s, c) => s + c, 0);

  let balance, recommendation;
  if (Math.abs(netCharge) <= 1) {
    balance = 'balanced';
    recommendation = 'Flow is balanced. No intervention needed.';
  } else if (netCharge > 1) {
    balance = 'expanding';
    recommendation = `Net charge is +${netCharge} (over-expanding). ` +
      `Consider strengthening contracting dimensions: ${contracting.length > 0 ? contracting.join(', ') : 'none currently contracting — add filtering/validation'}.`;
  } else {
    balance = 'contracting';
    recommendation = `Net charge is ${netCharge} (over-contracting). ` +
      `Heal these weak dimensions to restore balance: ${contracting.join(', ')}.`;
  }

  return {
    chargeMap, netCharge, expanding, contracting, neutral,
    balance, recommendation,
  };
}

/**
 * Analyze charge flow from a CoherencyField's zone data.
 * Aggregates per-zone charges into a global charge picture.
 *
 * @param {CoherencyField} field
 * @returns {{ zoneCharges: object, globalCharge: object }}
 */
function analyzeFieldCharge(field) {
  const zoneCharges = {};

  for (const zone of field.zones.values()) {
    if (!zone.lastMeasured) continue;
    const signals = { ...zone.oracleSignals };
    if (zone.voidCoherency !== null) signals.void = zone.voidCoherency;
    zoneCharges[zone.id] = analyzeChargeFlow(signals);
  }

  // Global charge = average net charge across all zones
  const nets = Object.values(zoneCharges).map(z => z.netCharge);
  const globalNet = nets.length > 0 ? nets.reduce((s, n) => s + n, 0) / nets.length : 0;

  // Find which signal names are most frequently contracting
  const contractingFrequency = {};
  for (const zc of Object.values(zoneCharges)) {
    for (const name of zc.contracting) {
      contractingFrequency[name] = (contractingFrequency[name] || 0) + 1;
    }
  }

  const mostContracting = Object.entries(contractingFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, frequency: count / nets.length }));

  return {
    zoneCharges,
    globalCharge: {
      netCharge: Math.round(globalNet * 100) / 100,
      balance: Math.abs(globalNet) <= 0.5 ? 'balanced' : globalNet > 0 ? 'expanding' : 'contracting',
      mostContracting,
      recommendation: mostContracting.length > 0
        ? `Priority healing: ${mostContracting[0].name} is contracting in ${mostContracting[0].count}/${nets.length} zones`
        : 'All dimensions balanced across zones.',
    },
  };
}

/**
 * Read atomic properties from the oracle's own functions and compute
 * the structural charge balance of the codebase itself.
 *
 * @returns {{ functions: Array, netCharge: number, balance: string }}
 */
function analyzeCodebaseCharge() {
  const functions = [];

  try {
    const { introspect } = require('../atomic/self-introspect');
    const { PeriodicTable } = require('../atomic/periodic-table');
    const table = new PeriodicTable();
    const result = introspect(table, { includeVoid: true });

    for (const el of result.registered) {
      const element = table.getElement(el.signature);
      if (element && element.properties) {
        functions.push({
          name: el.name,
          charge: element.properties.charge || 0,
          alignment: element.properties.alignment || 'neutral',
          harmPotential: element.properties.harmPotential || 'none',
        });
      }
    }
  } catch { /* introspection unavailable */ }

  const netCharge = functions.reduce((s, f) => s + f.charge, 0);
  const balance = Math.abs(netCharge) <= 2 ? 'balanced' : netCharge > 0 ? 'expanding' : 'contracting';

  return { functions, netCharge, balance };
}

module.exports = {
  signalToCharge,
  analyzeChargeFlow,
  analyzeFieldCharge,
  analyzeCodebaseCharge,
};

// ── Atomic self-description (batch-generated) ────────────────────
signalToCharge.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
analyzeChargeFlow.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 3, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
analyzeFieldCharge.atomicProperties = {
  charge: 0, valence: 0, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
analyzeCodebaseCharge.atomicProperties = {
  charge: 0, valence: 2, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 1, group: 2, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
