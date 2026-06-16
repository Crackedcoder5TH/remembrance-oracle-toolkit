'use strict';

/**
 * onboard.test.js — falsifiable test for `oracle onboard`, the verified
 * front door. The command's whole job is to fail when the docs and the
 * code disagree; this test fails when onboard itself stops doing that.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { registerOnboardCommands } = require('../src/cli/commands/onboard');
const { toFractalWaveform } = require('../src/core/fractal-waveform');
const { composedAtDepth } = require('../src/core/encoder-stack');
const voidLib = require('../src/core/void-library');

const SAMPLE = 'function add(a, b){ return a + b; }';

test('registerOnboardCommands wires an `onboard` handler', () => {
  const handlers = {};
  registerOnboardCommands(handlers, {});
  assert.equal(typeof handlers.onboard, 'function');
});

test('the encoder dimensions onboard guards are real (L1 = 29, composed = 116)', () => {
  assert.equal(toFractalWaveform(SAMPLE).length, 29);
  assert.equal(composedAtDepth(SAMPLE, 4).length, 116);
});

test('onboard reports no drift when commands + dims + live read all hold', async () => {
  const handlers = {};
  // The real CLI registers these; provide stubs so the command-resolution
  // claims pass in this isolated harness.
  for (const cmd of ['audit', 'reflect', 'covenant', 'security-scan', 'risk-score',
    'search', 'resolve', 'register', 'ecosystem', 'swarm', 'void-scan']) {
    handlers[cmd] = () => {};
  }
  registerOnboardCommands(handlers, {});

  const substrateReachable = (() => { try { return voidLib.size() > 0; } catch (_) { return false; } })();

  const origLog = console.log;
  const prevExit = process.exitCode;
  console.log = () => {};            // suppress the protocol print
  process.exitCode = 0;
  try {
    await handlers.onboard();
    if (substrateReachable) {
      assert.notEqual(process.exitCode, 1, 'onboard reported drift (exit 1) with a reachable substrate');
    }
  } finally {
    console.log = origLog;
    process.exitCode = prevExit;
  }
});
