'use strict';

/**
 * verify.test.js — falsifiable test for `oracle verify`, the truth-spine.
 * The point of verify is that the verdict folds correctly at every scale
 * (the fractal property) and that a single broken claim propagates up to
 * the ecosystem verdict. This test fails if either stops being true.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { registerVerifyCommands, leaf, branch } = require('../src/cli/commands/verify');
const { toFractalWaveform } = require('../src/core/fractal-waveform');
const { composedAtDepth } = require('../src/core/encoder-stack');

test('registerVerifyCommands wires a `verify` handler', () => {
  const handlers = {};
  registerVerifyCommands(handlers, {});
  assert.equal(typeof handlers.verify, 'function');
});

test('leaf encodes pass / fail / skip', () => {
  assert.deepEqual(
    { status: leaf('x', true).status, p: leaf('x', true).passed, t: leaf('x', true).total },
    { status: 'pass', p: 1, t: 1 });
  assert.equal(leaf('x', false).status, 'fail');
  const s = leaf('x', null);
  assert.equal(s.status, 'skip');
  assert.equal(s.total, 0); // a skip is not counted against the total
});

test('branch folds passed/total and status from its children', () => {
  const allPass = branch('e', [leaf('a', true), leaf('b', true)]);
  assert.deepEqual([allPass.passed, allPass.total, allPass.status], [2, 2, 'pass']);

  const oneFail = branch('e', [leaf('a', true), leaf('b', false)]);
  assert.deepEqual([oneFail.passed, oneFail.total, oneFail.status], [1, 2, 'partial']);

  const allFail = branch('e', [leaf('a', false), leaf('b', false)]);
  assert.equal(allFail.status, 'fail');

  const allSkip = branch('e', [leaf('a', null), leaf('b', null)]);
  assert.deepEqual([allSkip.total, allSkip.status], [0, 'skip']);
});

test('the fold is self-similar — a branch of branches folds like a branch of leaves (fractal)', () => {
  const ecosystem = branch('ecosystem', [
    branch('encoder', [leaf('L1', true), leaf('composed', true)]),
    branch('field', [leaf('flow', true), leaf('reach', true)]),
    branch('covenant', [leaf('seal', false)]),
  ]);
  // Counts roll up through every level identically.
  assert.equal(ecosystem.passed, 4);
  assert.equal(ecosystem.total, 5);
  // One broken leaf, three levels down, makes the whole ecosystem not-clean.
  assert.equal(ecosystem.status, 'partial');
});

test('the encoder dimensions verify guards are real (L1 = 29, composed = 116)', () => {
  assert.equal(toFractalWaveform('function f(){ return 1 }').length, 29);
  assert.equal(composedAtDepth('function f(){ return 1 }', 4).length, 116);
});
