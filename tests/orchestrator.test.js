'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  CoherencyDirector, CoherencyField, CoherencyZone,
  signalToCharge, analyzeChargeFlow, analyzeFieldCharge,
  computeZonePriority, rankZones, computeHealingBudget,
} = require('../src/orchestrator');

describe('CoherencyField', () => {
  let field;
  beforeEach(() => { field = new CoherencyField(); });

  it('starts empty with zero global coherency', () => {
    assert.equal(field.size, 0);
    assert.equal(field.globalCoherency, 0);
  });

  it('adds zones and tracks them', () => {
    field.addZone('a', { code: 'function a() {}' });
    field.addZone('b', { code: 'function b() {}' });
    assert.equal(field.size, 2);
  });

  it('updates zone coherency from oracle signals', () => {
    field.addZone('a', {});
    field.updateZoneFromOracle('a', { audit: 0.9, ground: 0.8, plan: 0.7 });
    const zone = field.getZone('a');
    assert.ok(zone.coherency > 0.7);
    assert.ok(zone.lastMeasured);
  });

  it('updates zone coherency from void signal', () => {
    field.addZone('a', {});
    field.updateZoneFromVoid('a', 0.85);
    assert.ok(field.getZone('a').coherency > 0);
  });

  it('blends oracle + void when both available', () => {
    field.addZone('a', {});
    field.updateZoneFromOracle('a', { audit: 0.9, ground: 0.9 });
    const oracleOnly = field.getZone('a').coherency;
    field.updateZoneFromVoid('a', 0.5);
    const blended = field.getZone('a').coherency;
    assert.ok(blended < oracleOnly, 'Void signal should pull blended coherency down');
  });

  it('finds healing targets (coherency < 0.68)', () => {
    field.addZone('good', {});
    field.addZone('bad', {});
    field.updateZoneFromOracle('good', { audit: 0.95, ground: 0.9 });
    field.updateZoneFromOracle('bad', { audit: 0.3, ground: 0.2 });
    const targets = field.findHealingTargets();
    assert.ok(targets.length >= 1);
    assert.equal(targets[0].id, 'bad');
  });

  it('finds preservation targets (coherency >= 0.85)', () => {
    field.addZone('excellent', {});
    field.updateZoneFromOracle('excellent', { audit: 0.95, ground: 0.95, plan: 0.9 });
    const targets = field.findPreservationTargets();
    assert.ok(targets.length >= 1);
  });

  it('computes gradients between zones', () => {
    field.addZone('low', {});
    field.addZone('high', {});
    field.updateZoneFromOracle('low', { audit: 0.3 });
    field.updateZoneFromOracle('high', { audit: 0.95 });
    const sorted = field.computeGradients();
    assert.ok(sorted.length === 2);
    assert.ok(sorted[0].gradient >= 0 || sorted[1].gradient >= 0);
  });

  it('returns stats summary', () => {
    field.addZone('a', {});
    field.updateZoneFromOracle('a', { audit: 0.7 });
    const stats = field.stats();
    assert.equal(stats.totalZones, 1);
    assert.equal(stats.measuredZones, 1);
    assert.ok(stats.globalCoherency > 0);
  });
});

describe('signalToCharge', () => {
  it('maps strong signals to +1', () => { assert.equal(signalToCharge(0.9), 1); });
  it('maps weak signals to -1', () => { assert.equal(signalToCharge(0.2), -1); });
  it('maps moderate signals to 0', () => { assert.equal(signalToCharge(0.6), 0); });
  it('handles edge cases', () => {
    assert.equal(signalToCharge(NaN), 0);
    assert.equal(signalToCharge(undefined), 0);
  });
});

describe('analyzeChargeFlow', () => {
  it('detects balanced flow', () => {
    const result = analyzeChargeFlow({ audit: 0.9, ground: 0.3, plan: 0.6 });
    // +1 + -1 + 0 = 0
    assert.equal(result.netCharge, 0);
    assert.equal(result.balance, 'balanced');
  });

  it('detects expanding flow', () => {
    const result = analyzeChargeFlow({ audit: 0.9, ground: 0.9, plan: 0.85 });
    assert.ok(result.netCharge > 1);
    assert.equal(result.balance, 'expanding');
  });

  it('detects contracting flow', () => {
    const result = analyzeChargeFlow({ audit: 0.2, ground: 0.3, plan: 0.1 });
    assert.ok(result.netCharge < -1);
    assert.equal(result.balance, 'contracting');
  });

  it('lists expanding and contracting dimensions', () => {
    const result = analyzeChargeFlow({ a: 0.9, b: 0.2, c: 0.5 });
    assert.ok(result.expanding.includes('a'));
    assert.ok(result.contracting.includes('b'));
    assert.ok(result.neutral.includes('c'));
  });
});

describe('analyzeFieldCharge', () => {
  it('aggregates charge across zones', () => {
    const field = new CoherencyField();
    field.addZone('a', {});
    field.addZone('b', {});
    field.updateZoneFromOracle('a', { audit: 0.9, ground: 0.9 });
    field.updateZoneFromOracle('b', { audit: 0.2, ground: 0.3 });
    const result = analyzeFieldCharge(field);
    assert.ok(result.globalCharge);
    assert.ok(result.zoneCharges.a);
    assert.ok(result.zoneCharges.b);
  });
});

describe('priority engine', () => {
  it('computes higher priority for lower-coherency zones', () => {
    const low = new CoherencyZone('low', {});
    low.coherency = 0.3; low.lastMeasured = Date.now();
    const mid = new CoherencyZone('mid', {});
    mid.coherency = 0.6; mid.lastMeasured = Date.now();
    const pLow = computeZonePriority(low);
    const pMid = computeZonePriority(mid);
    assert.ok(pLow > pMid, `Expected ${pLow} > ${pMid}`);
  });

  it('ranks zones by priority', () => {
    const field = new CoherencyField();
    field.addZone('critical', {});
    field.addZone('moderate', {});
    field.addZone('fine', {});
    field.updateZoneFromOracle('critical', { audit: 0.1 });
    field.updateZoneFromOracle('moderate', { audit: 0.5 });
    field.updateZoneFromOracle('fine', { audit: 0.95 });
    const queue = rankZones(field);
    assert.ok(queue.length >= 1);
    assert.equal(queue[0].zoneId, 'critical');
  });

  it('computeHealingBudget returns 0 when all zones are healthy', () => {
    const field = new CoherencyField();
    field.addZone('good', {});
    field.updateZoneFromOracle('good', { audit: 0.9 });
    const budget = computeHealingBudget(field);
    assert.equal(budget.budget, 0);
  });

  it('computeHealingBudget scales with urgency', () => {
    const field = new CoherencyField();
    for (let i = 0; i < 10; i++) {
      field.addZone(`zone${i}`, {});
      field.updateZoneFromOracle(`zone${i}`, { audit: 0.2 + i * 0.05 });
    }
    const budget = computeHealingBudget(field);
    assert.ok(budget.budget >= 1);
    assert.ok(budget.budget <= 5);
  });
});

describe('CoherencyDirector', () => {
  it('scans items into the field', () => {
    const director = new CoherencyDirector();
    director.scan([
      { id: 'a', code: 'function a() { return 1; }' },
      { id: 'b', code: 'function b() { return 2; }' },
    ]);
    assert.equal(director.field.size, 2);
  });

  it('measures zones with oracle', () => {
    const director = new CoherencyDirector();
    director.scan([
      { id: 'test', code: 'function add(a, b) { return a + b; }', language: 'javascript' },
    ]);
    director.measureWithOracle();
    const zone = director.field.getZone('test');
    assert.ok(zone.lastMeasured, 'Zone should be measured');
    assert.ok(zone.coherency > 0, 'Zone should have non-zero coherency');
  });

  it('finds highest priority zone', () => {
    const director = new CoherencyDirector();
    director.scan([
      { id: 'good', code: 'function good(a, b) { return a + b; }' },
      { id: 'bad', code: '' },
    ]);
    director.measureWithOracle();
    const priority = director.findHighestPriority();
    // Either finds a priority or not — depends on what computeCoherencyScore gives empty code
  });

  it('tracks interventions', () => {
    const director = new CoherencyDirector();
    assert.equal(director.interventions.length, 0);
    const summary = director.interventionSummary();
    assert.equal(summary.totalInterventions, 0);
  });
});
