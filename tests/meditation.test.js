'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MeditationEngine, MEDITATION_DEFAULTS, STATE } =
  require('../src/core/meditation');

function makeStubOracle() {
  // Minimal stub matching the Oracle surface meditation expects:
  // stats(), search(), submit(). Returns predictable patterns so the
  // benchmark + activities can run deterministically.
  const patterns = [
    { name: 'p1', language: 'js',  coherency: 0.85, tags: ['util', 'pure'] },
    { name: 'p2', language: 'js',  coherency: 0.90, tags: ['util'] },
    { name: 'p3', language: 'py',  coherency: 0.75, tags: ['math'] },
    { name: 'p4', language: 'py',  coherency: 0.80, tags: ['math', 'pure'] },
  ];
  return {
    stats:  () => ({ patterns }),
    search: () => patterns,
    submit: () => ({ success: true }),
  };
}

test('MeditationEngine constructs with defaults', () => {
  const eng = new MeditationEngine(makeStubOracle());
  assert.ok(eng);
  const status = eng.status();
  assert.equal(status.state, STATE.IDLE);
  assert.equal(status.cyclesCompleted, 0);
  assert.equal(status.config.enabled, true);
});

test('MeditationEngine respects custom config', () => {
  const eng = new MeditationEngine(makeStubOracle(), {
    enabled: false,
    idleThresholdMs: 1000,
    maxCyclesPerSession: 3,
  });
  const status = eng.status();
  assert.equal(status.config.enabled, false);
  assert.equal(status.config.idleThreshold, 1000);
  assert.equal(status.config.maxCycles, 3);
});

test('touch() resets the idle timer', () => {
  const eng = new MeditationEngine(makeStubOracle());
  const before = eng.status().lastActivity;
  // simulate small delay
  const wait = new Promise(r => setTimeout(r, 5));
  return wait.then(() => {
    eng.touch();
    const after = eng.status().lastActivity;
    assert.ok(new Date(after).getTime() >= new Date(before).getTime());
  });
});

test('STATE constants are exposed and named correctly', () => {
  const expected = ['IDLE', 'MEDITATING', 'RESTING', 'INTERRUPTED'];
  for (const s of expected) assert.ok(s in STATE, `${s} missing`);
  assert.equal(STATE.IDLE, 'idle');
  assert.equal(STATE.MEDITATING, 'meditating');
});

test('MEDITATION_DEFAULTS lists all 7 activities', () => {
  assert.ok(Array.isArray(MEDITATION_DEFAULTS.activities));
  assert.equal(MEDITATION_DEFAULTS.activities.length, 7);
  for (const a of ['self-reflection', 'consolidation',
                    'synthetic-exploration', 'cross-domain-synthesis',
                    'coherency-optimization', 'prophecy', 'meta-loop']) {
    assert.ok(MEDITATION_DEFAULTS.activities.includes(a),
      `missing activity: ${a}`);
  }
});

test('start() then stop() leaves engine in idle state', () => {
  const eng = new MeditationEngine(makeStubOracle());
  eng.start();
  assert.equal(eng.status().state, STATE.IDLE);
  eng.stop();
  assert.equal(eng.status().state, STATE.IDLE);
});

test('meditateSingle() runs and returns a session result', { timeout: 30000 }, async () => {
  // Use temp dir for journal so we don't pollute real .remembrance/.
  // Override restDurationMs to ~50ms so the engine's post-session
  // rest doesn't keep the test pending for 30 minutes.
  //
  // The engine uses timer.unref() in its rest period, which lets the
  // event loop close before the await resolves. We hold a no-unref
  // keepalive interval for the duration of the test to prevent the
  // node:test runner from cancelling our pending promise.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'med-test-'));
  const eng = new MeditationEngine(makeStubOracle(), {
    maxCyclesPerSession: 2,
    cycleDurationMs: 5000,
    idleThresholdMs: 0,
    restDurationMs: 50,
    journalPath: path.join(tmp, 'journal.jsonl'),
  });
  const keepalive = setInterval(() => {}, 100);
  try {
    const result = await eng.meditateSingle();
    assert.ok(result, 'meditateSingle should return a session result object');
    assert.ok(typeof result.sessionId === 'string');
    assert.ok(typeof result.cycles === 'number');
    assert.ok(result.benchmark, 'should include benchmark before/after');
    assert.ok(typeof result.benchmark.before.total === 'number');
    assert.ok(typeof result.benchmark.after.total === 'number');
    // The substrate's monotone-coherency principle: meditation must
    // either improve or hold steady; if vetoed it gets logged.
    if (result.vetoed) {
      assert.ok(result.benchmark.delta < 0, 'veto should fire only on negative delta');
    }
  } finally {
    clearInterval(keepalive);
    eng.stop();
  }
});
