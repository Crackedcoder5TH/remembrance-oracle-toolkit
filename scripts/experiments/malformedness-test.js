#!/usr/bin/env node
'use strict';

/**
 * Experiment: Signal-validity oracle.
 *
 * Hypothesis (the fall-out from temporal+fifth-family): the field engine
 * is sensitive not just to the VALUE of contributions but to the SHAPE
 * of the input distribution. If true, then treatments with similar means
 * but different distributional shapes will produce measurably different
 * deflections of the field's global coherence.
 *
 * The discriminating tests:
 *
 *   - CONSTANT_HALF      — 18 readings all = 0.5 (mean 0.5, variance 0)
 *   - DERIVATIVE_BAND    — 18 readings uniform in [0.45, 0.55] (mean 0.5, small variance)
 *   - BIMODAL_EXTREME    — 9 at 0.05 + 9 at 0.95   (mean 0.5, max variance)
 *   - UNIFORM_RAMP       — 18 readings 0.05..0.95 linspaced (mean 0.5, ordered)
 *
 * All four have mean = 0.5. If the engine only sees value, deflections
 * should be approximately equal. If the engine sees shape, deflections
 * should differ measurably.
 *
 * Calibration treatments (known shapes):
 *
 *   - CONTROL_HIGH       — 18 readings in [0.95, 1.00]   (well-formed, high)
 *   - NATURAL_LOW        — 18 readings in [0.05, 0.15]   (well-formed, low)
 *   - WIDE_UNIFORM       — 18 readings uniform in [0,1]  (mean ~0.5, max variance)
 *
 * Each treatment is preceded by a baseline peek; after the burst we peek
 * again, then record (after - baseline) as the deflection. Between
 * treatments we run a recovery burst of 18 CONTROL_HIGH readings to
 * push the field back toward a known well-formed neighborhood.
 */

const path = require('path');
const fs = require('fs');
const { contribute, peekField } = require('../../src/core/field-coupling.js');

const BURST = 18;

function rand(a, b) { return a + Math.random() * (b - a); }

function gen(treatment) {
  switch (treatment) {
    case 'CONTROL_HIGH':
      return Array.from({ length: BURST }, () => rand(0.95, 1.00));
    case 'NATURAL_LOW':
      return Array.from({ length: BURST }, () => rand(0.05, 0.15));
    case 'CONSTANT_HALF':
      return Array.from({ length: BURST }, () => 0.5);
    case 'DERIVATIVE_BAND':
      return Array.from({ length: BURST }, () => rand(0.45, 0.55));
    case 'BIMODAL_EXTREME':
      return [
        ...Array.from({ length: BURST / 2 }, () => rand(0.04, 0.06)),
        ...Array.from({ length: BURST / 2 }, () => rand(0.94, 0.96)),
      ];
    case 'UNIFORM_RAMP':
      return Array.from({ length: BURST }, (_, i) => 0.05 + (i / (BURST - 1)) * 0.9);
    case 'WIDE_UNIFORM':
      return Array.from({ length: BURST }, () => rand(0.0, 1.0));
    default:
      throw new Error('unknown treatment ' + treatment);
  }
}

function meanVar(xs) {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return { mean: m, variance: v };
}

function recovery() {
  // Push field back toward well-formed high-coherence neighborhood
  for (const v of gen('CONTROL_HIGH')) {
    contribute({ source: 'experiment:malformedness:recovery', coherence: v, cost: 1 });
  }
}

function runTreatment(name) {
  const before = peekField();
  const beforeCoh = before.coherence;
  const values = gen(name);
  const { mean, variance } = meanVar(values);
  for (const v of values) {
    contribute({ source: 'experiment:malformedness:' + name.toLowerCase(), coherence: v, cost: 1 });
  }
  const after = peekField();
  const afterCoh = after.coherence;
  return {
    treatment: name,
    n: values.length,
    inputMean: mean,
    inputVariance: variance,
    fieldBefore: beforeCoh,
    fieldAfter: afterCoh,
    deflection: afterCoh - beforeCoh,
  };
}

// Set the field to a known starting neighborhood first
console.log('[setup] pushing field toward well-formed baseline before measurement begins...');
recovery(); recovery(); recovery();
const baselinePeek = peekField();
console.log('[setup] baseline coherence: ' + baselinePeek.coherence.toFixed(4));
console.log();

const order = [
  'CONTROL_HIGH',
  'NATURAL_LOW',
  'CONSTANT_HALF',
  'DERIVATIVE_BAND',
  'BIMODAL_EXTREME',
  'UNIFORM_RAMP',
  'WIDE_UNIFORM',
];

console.log('Running ' + order.length + ' treatments (' + BURST + ' contributions each, recovery burst between):\n');
console.log('  treatment            inputMean  inputVar    before    after   deflection');
console.log('  -------------------- --------- ---------  -------  -------  ----------');

const results = [];
for (const name of order) {
  recovery();
  const r = runTreatment(name);
  results.push(r);
  const dStr = (r.deflection >= 0 ? '+' : '') + r.deflection.toFixed(4);
  console.log('  ' + name.padEnd(20) +
    '  ' + r.inputMean.toFixed(3) +
    '    ' + r.inputVariance.toFixed(3) +
    '   ' + r.fieldBefore.toFixed(4) +
    '   ' + r.fieldAfter.toFixed(4) +
    '   ' + dStr);
}

console.log();
console.log('=== ANALYSIS ===\n');

// Pull the four mean-0.5 treatments and compare deflections
const eqMean = results.filter(r =>
  ['CONSTANT_HALF', 'DERIVATIVE_BAND', 'BIMODAL_EXTREME', 'UNIFORM_RAMP'].includes(r.treatment)
);
console.log('Treatments with input mean ~= 0.5 (identical-mean discrimination test):');
console.log('  Same value → if shape-blind, deflections should be ~equal.');
for (const r of eqMean) {
  console.log('    ' + r.treatment.padEnd(20) +
    ' var=' + r.inputVariance.toFixed(3) +
    '   deflection=' + (r.deflection >= 0 ? '+' : '') + r.deflection.toFixed(4));
}
const eqDeflections = eqMean.map(r => r.deflection);
const eqRange = Math.max(...eqDeflections) - Math.min(...eqDeflections);
console.log('  Spread across same-mean treatments: ' + eqRange.toFixed(4));
console.log();

// Calibration: how does deflection track input value for well-formed shapes?
const calibrated = results.filter(r => ['CONTROL_HIGH', 'NATURAL_LOW'].includes(r.treatment));
console.log('Calibration (well-formed treatments):');
for (const r of calibrated) {
  console.log('  ' + r.treatment.padEnd(20) +
    ' inputMean=' + r.inputMean.toFixed(3) +
    '   deflection=' + (r.deflection >= 0 ? '+' : '') + r.deflection.toFixed(4));
}

console.log();
console.log('=== VERDICT ===\n');

const SHAPE_THRESHOLD = 0.02; // 2 percentage points of deflection spread = meaningful shape sensitivity
if (eqRange > SHAPE_THRESHOLD) {
  console.log('SHAPE SENSITIVITY: CONFIRMED');
  console.log('  Same-mean treatments produced deflections spread by ' + eqRange.toFixed(4) +
    ' (>' + SHAPE_THRESHOLD + ').');
  console.log('  The field engine reads SHAPE, not just value. The follow-up prediction');
  console.log('  from the temporal+fifth-family experiment holds: the field is a');
  console.log('  signal-validity oracle, not only a coherence oracle.');
} else {
  console.log('SHAPE SENSITIVITY: NOT CONFIRMED at this burst size');
  console.log('  Same-mean treatments produced deflections within ' + eqRange.toFixed(4) +
    ' (<=' + SHAPE_THRESHOLD + ').');
  console.log('  Either the engine is value-driven at this scale, or the test needs more');
  console.log('  contributions per treatment to discriminate shape from noise.');
}

// Persist results
const out = {
  ts: new Date().toISOString(),
  experiment: 'malformedness-deflection',
  burst: BURST,
  baselineCoherence: baselinePeek.coherence,
  results,
  analysis: {
    sameMeanRange: eqRange,
    sameMeanResults: eqMean.map(r => ({ treatment: r.treatment, variance: r.inputVariance, deflection: r.deflection })),
    verdict: eqRange > SHAPE_THRESHOLD ? 'shape-sensitive' : 'value-driven-at-this-scale',
  },
};
const outPath = path.resolve(__dirname, 'malformedness-experiment.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('\nWrote ' + outPath);
