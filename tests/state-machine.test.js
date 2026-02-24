const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createStateMachine } = require('../seeds/state-machine');

describe('state-machine', () => {
  function trafficLight() {
    return createStateMachine({
      initial: 'green',
      states: {
        green:  { on: { TIMER: 'yellow' } },
        yellow: { on: { TIMER: 'red' } },
        red:    { on: { TIMER: 'green' } },
      },
    });
  }

  it('should start in initial state', () => {
    const sm = trafficLight();
    assert.equal(sm.current, 'green');
    assert.ok(sm.matches('green'));
  });

  it('should transition on events', () => {
    const sm = trafficLight();
    assert.equal(sm.send('TIMER'), 'yellow');
    assert.equal(sm.send('TIMER'), 'red');
    assert.equal(sm.send('TIMER'), 'green');
  });

  it('should ignore unknown events', () => {
    const sm = trafficLight();
    assert.equal(sm.send('UNKNOWN'), 'green');
  });

  it('should track history', () => {
    const sm = trafficLight();
    sm.send('TIMER');
    sm.send('TIMER');
    assert.deepEqual(sm.history(), ['green', 'yellow', 'red']);
  });

  it('should support guards', () => {
    const sm = createStateMachine({
      initial: 'idle',
      states: {
        idle: {
          on: {
            START: {
              target: 'running',
              guard: (ctx) => ctx && ctx.authorized === true,
            },
          },
        },
        running: { on: { STOP: 'idle' } },
      },
    });

    // Guard rejects
    assert.equal(sm.send('START', { authorized: false }), 'idle');
    // Guard allows
    assert.equal(sm.send('START', { authorized: true }), 'running');
  });

  it('should support actions', () => {
    const log = [];
    const sm = createStateMachine({
      initial: 'off',
      states: {
        off: {
          on: {
            TOGGLE: {
              target: 'on',
              action: (ctx, info) => log.push(`${info.from}->${info.to}`),
            },
          },
        },
        on: {
          on: {
            TOGGLE: {
              target: 'off',
              action: (ctx, info) => log.push(`${info.from}->${info.to}`),
            },
          },
        },
      },
    });

    sm.send('TOGGLE');
    sm.send('TOGGLE');
    assert.deepEqual(log, ['off->on', 'on->off']);
  });

  it('should support subscribe/unsubscribe', () => {
    const sm = trafficLight();
    const events = [];
    const unsub = sm.subscribe((e) => events.push(e.to));
    sm.send('TIMER');
    sm.send('TIMER');
    unsub();
    sm.send('TIMER');
    assert.deepEqual(events, ['yellow', 'red']); // third not captured
  });

  it('should reject invalid config', () => {
    assert.throws(() => createStateMachine({}));
    assert.throws(() => createStateMachine({ initial: 'x', states: {} }));
  });

  it('should reject invalid target states', () => {
    const sm = createStateMachine({
      initial: 'a',
      states: {
        a: { on: { GO: 'nonexistent' } },
      },
    });
    assert.throws(() => sm.send('GO'), /Invalid target/);
  });
});
