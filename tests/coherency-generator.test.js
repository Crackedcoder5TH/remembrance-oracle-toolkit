'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CoherencyGenerator, GENERATOR_STATES } = require('../src/orchestrator/coherency-generator');

describe('CoherencyGenerator', () => {
  let gen;
  beforeEach(() => { gen = new CoherencyGenerator(); });

  it('starts dormant at zero power', () => {
    assert.equal(gen.state, GENERATOR_STATES.DORMANT);
    assert.equal(gen.power, 0);
  });

  it('ignites at specified power level', () => {
    const result = gen.ignite(0.1);
    assert.equal(result.status, 'ignited');
    assert.equal(result.power, 0.1);
    assert.equal(gen.state, GENERATOR_STATES.ACTIVE);
  });

  it('clamps power between 0 and 1', () => {
    gen.ignite(1.5);
    assert.equal(gen.power, 1);
    gen.shutdown();
    gen.state = GENERATOR_STATES.DORMANT;
    gen.ignite(-0.3);
    assert.equal(gen.power, 0);
  });

  it('cannot ignite when already active', () => {
    gen.ignite(0.1);
    const result = gen.ignite(0.5);
    assert.equal(result.status, 'already-active');
  });

  it('runs a cycle and produces results', async () => {
    gen.ignite(0.1);
    const result = await gen.runCycle();
    assert.ok(!result.skipped, 'Cycle should not be skipped when active');
    assert.equal(result.cycle, 1);
    assert.ok(typeof result.surplus === 'number');
    assert.ok(typeof result.radiated === 'number');
    assert.ok(typeof result.globalCoherency === 'number');
  });

  it('skips cycle when dormant', async () => {
    const result = await gen.runCycle();
    assert.ok(result.skipped);
  });

  it('increases power level', () => {
    gen.ignite(0.1);
    const change = gen.increasePower(0.5);
    assert.equal(change.from, 0.1);
    assert.equal(change.to, 0.5);
    assert.equal(gen.power, 0.5);
  });

  it('shuts down cleanly', () => {
    gen.ignite(0.1);
    const result = gen.shutdown('test');
    assert.equal(result.status, 'shutdown');
    assert.equal(gen.state, GENERATOR_STATES.SHUTDOWN);
  });

  it('tracks cycle count', async () => {
    gen.ignite(0.1);
    await gen.runCycle();
    await gen.runCycle();
    await gen.runCycle();
    assert.equal(gen.cycleCount, 3);
  });

  it('records history', async () => {
    gen.ignite(0.1);
    await gen.runCycle();
    gen.shutdown();
    assert.ok(gen.history.length >= 3); // ignite + cycle + shutdown
    assert.equal(gen.history[0].event, 'ignite');
    assert.equal(gen.history[gen.history.length - 1].event, 'shutdown');
  });

  it('has covenant-aligned atomic properties', () => {
    assert.equal(gen.atomicProperties.harmPotential, 'none');
    assert.equal(gen.atomicProperties.alignment, 'healing');
    assert.equal(gen.atomicProperties.intention, 'benevolent');
    assert.equal(gen.atomicProperties.charge, 1);
  });

  it('passes covenant self-check', () => {
    assert.ok(gen._covenantSelfCheck());
  });

  it('status() reports correct state', () => {
    gen.ignite(0.3);
    const status = gen.status();
    assert.equal(status.state, GENERATOR_STATES.ACTIVE);
    assert.equal(status.power, 0.3);
    assert.ok(status.atomicProperties);
  });
});

describe('GENERATOR_STATES', () => {
  it('has all expected states', () => {
    assert.ok(GENERATOR_STATES.DORMANT);
    assert.ok(GENERATOR_STATES.ACTIVE);
    assert.ok(GENERATOR_STATES.RADIATING);
    assert.ok(GENERATOR_STATES.SHUTDOWN);
  });
});
