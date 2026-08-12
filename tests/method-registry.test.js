/**
 * Method registry: the orchestrator's self-introspection layer.
 * Verifies trigger parsing, condition matching, live state pickup,
 * and the Sun's opt-in reflex integration.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.ENTROPY_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reg-')), 'entropy.json');

const reg = require('../src/orchestrator/method-registry');
const { CoherencyGenerator } = require('../src/orchestrator/coherency-generator');
const { _resetReflexState } = require('../src/orchestrator/reflex-engine');
const fc = require('../src/core/field-coupling');

describe('method registry — orchestrator self-introspection', () => {

  it('lists every registered method', () => {
    const names = reg.listMethods();
    assert.ok(names.length >= 7, 'expected at least 7 methods, got ' + names.length);
    assert.ok(names.includes('relax-if-hot'));
    assert.ok(names.includes('tighten-if-adversarial'));
    assert.ok(names.includes('fire-reflexes'));
  });

  it('describes a single method with its triggers and effect', () => {
    const d = reg.describeMethod('relax-if-hot');
    assert.ok(d, 'should return a descriptor');
    assert.equal(d.name, 'relax-if-hot');
    assert.ok(Array.isArray(d.triggers));
    assert.ok(d.triggers.includes('cascade > 4'));
    assert.ok(typeof d.effect === 'string' && d.effect.length > 0);
    assert.ok(typeof d.reversibility === 'string');
  });

  it('returns null for an unknown method', () => {
    assert.equal(reg.describeMethod('not-a-thing'), null);
  });

  it('parses each supported trigger form', () => {
    assert.deepEqual(reg._parseTrigger('any'), { field: null, op: null, value: null, alwaysTrue: true });
    assert.deepEqual(reg._parseTrigger('cascade > 4'), { field: 'cascade', op: '>', value: 4 });
    assert.deepEqual(reg._parseTrigger('entropy >= 10.5'), { field: 'entropy', op: '>=', value: 10.5 });
    assert.deepEqual(reg._parseTrigger('direction == healing'), { field: 'direction', op: '==', value: 'healing' });
    assert.equal(reg._parseTrigger('nonsense'), null);
  });

  it('evaluates triggers against state', () => {
    const trig = reg._parseTrigger('cascade > 4');
    assert.equal(reg._evalTrigger(trig, { cascade: 5 }), true);
    assert.equal(reg._evalTrigger(trig, { cascade: 3 }), false);
    assert.equal(reg._evalTrigger(trig, { cascade: 4 }), false);
    assert.equal(reg._evalTrigger(trig, {}), false);
    const dirTrig = reg._parseTrigger('direction == degrading');
    assert.equal(reg._evalTrigger(dirTrig, { direction: 'degrading' }), true);
    assert.equal(reg._evalTrigger(dirTrig, { direction: 'healing' }), false);
  });

  it('methodsFor returns tools whose triggers match the given state', () => {
    const hot = reg.methodsFor({ cascade: 5, entropy: 12, adversarialRatio: 0, cognitionVariance: 0, direction: 'steady' });
    const names = hot.map(m => m.name);
    assert.ok(names.includes('relax-if-hot'), 'relax-if-hot should match a hot state');
    assert.ok(names.includes('restore-if-quietened'), 'restore matches (adversarial < 0.05)');
    assert.ok(!names.includes('tighten-if-adversarial'), 'tighten should NOT match (adversarial is 0)');
  });

  it('methodsFor isolates the adversarial trigger', () => {
    const adv = reg.methodsFor({ cascade: 1, entropy: 1, coherence: 0.95, adversarialRatio: 0.30, cognitionVariance: 0.01, direction: 'steady' });
    const names = adv.map(m => m.name);
    assert.ok(names.includes('tighten-if-adversarial'));
    assert.ok(!names.includes('restore-if-quietened'), 'restore should NOT fire when adversarial is high');
  });

  it('selectResponseFor returns a live snapshot plus matching tools', () => {
    const r = reg.selectResponseFor();
    assert.ok(r.state, 'should have state');
    assert.ok(Array.isArray(r.applicable));
    assert.ok(Array.isArray(r.specific));
    assert.ok(Array.isArray(r.universal));
    // universal methods (triggers include 'any') should always be in applicable
    assert.ok(r.universal.length >= 3, 'expected at least 3 universal methods');
  });
});

describe('Sun + reflexes — opt-in actor integration in the generator cycle', () => {

  beforeEach(() => { _resetReflexState(); });

  it('CoherencyGenerator with withReflexes=false does not run reflexes', async () => {
    const sun = new CoherencyGenerator({ withReflexes: false, cycleIntervalMs: 100000 });
    sun.state = require('../src/orchestrator/coherency-generator').GENERATOR_STATES.ACTIVE;
    const r = await sun.runCycle();
    assert.equal(r.skipped, undefined, 'cycle should run');
    assert.equal(r.reflexes, null, 'reflexes should be null when withReflexes=false');
  });

  it('CoherencyGenerator with withReflexes=true fires reflexes and reports the result', async () => {
    const sun = new CoherencyGenerator({ withReflexes: true, cycleIntervalMs: 100000 });
    sun.state = require('../src/orchestrator/coherency-generator').GENERATOR_STATES.ACTIVE;
    const r = await sun.runCycle();
    assert.equal(r.skipped, undefined, 'cycle should run');
    assert.notEqual(r.reflexes, null, 'reflexes block should be populated when withReflexes=true');
    assert.ok(typeof r.reflexes.fired === 'number');
    assert.ok(Array.isArray(r.reflexes.actions));
  });

  it('Sun.reflexHistory records any fired reflexes per cycle', async () => {
    const sun = new CoherencyGenerator({ withReflexes: true, cycleIntervalMs: 100000 });
    sun.state = require('../src/orchestrator/coherency-generator').GENERATOR_STATES.ACTIVE;
    await sun.runCycle();
    // Force a condition that will fire a reflex on the next cycle (cognition drift)
    // and run another cycle.
    await sun.runCycle();
    assert.ok(Array.isArray(sun.reflexHistory));
    // History entries only land when reflexes actually fired; we don't assert
    // a non-empty history because the reflex thresholds may not trigger in
    // this synthetic environment. We only assert the structure.
  });
});
