// Test: state-machine — inline assertions, no require
const sm1 = createStateMachine({
  initial: 'green',
  states: {
    green:  { on: { TIMER: 'yellow' } },
    yellow: { on: { TIMER: 'red' } },
    red:    { on: { TIMER: 'green' } },
  },
});

if (sm1.current !== 'green') throw new Error('Initial state should be green');
if (!sm1.matches('green')) throw new Error('matches() broken');

sm1.send('TIMER');
if (sm1.current !== 'yellow') throw new Error('Should be yellow');
sm1.send('TIMER');
if (sm1.current !== 'red') throw new Error('Should be red');
sm1.send('TIMER');
if (sm1.current !== 'green') throw new Error('Should cycle back to green');

// Unknown event stays in place
sm1.send('UNKNOWN_EVENT');
if (sm1.current !== 'green') throw new Error('Unknown event should not change state');

// History
const hist = sm1.history();
if (hist[0] !== 'green') throw new Error('History starts with initial');
if (hist.length !== 4) throw new Error('History length wrong: ' + hist.length);

// Guards
const sm2 = createStateMachine({
  initial: 'locked',
  states: {
    locked: { on: { UNLOCK: { target: 'unlocked', guard: (ctx) => ctx && ctx.key === 'secret' } } },
    unlocked: { on: { LOCK: 'locked' } },
  },
});
sm2.send('UNLOCK', { key: 'wrong' });
if (sm2.current !== 'locked') throw new Error('Guard should reject');
sm2.send('UNLOCK', { key: 'secret' });
if (sm2.current !== 'unlocked') throw new Error('Guard should allow');

// Actions
const log = [];
const sm3 = createStateMachine({
  initial: 'off',
  states: {
    off: { on: { TOGGLE: { target: 'on', action: (ctx, info) => log.push(info.from + '->' + info.to) } } },
    on:  { on: { TOGGLE: { target: 'off', action: (ctx, info) => log.push(info.from + '->' + info.to) } } },
  },
});
sm3.send('TOGGLE');
sm3.send('TOGGLE');
if (log[0] !== 'off->on' || log[1] !== 'on->off') throw new Error('Actions wrong: ' + JSON.stringify(log));

// Invalid config
let threw = false;
try { createStateMachine({}); } catch(e) { threw = true; }
if (!threw) throw new Error('Should reject empty config');
