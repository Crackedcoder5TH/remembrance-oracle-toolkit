'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const { reachToolkitModule } = require('./ecosystem-toolkit-reach');

test('returns null for an unreachable module instead of throwing', () => {
  assert.strictEqual(
    reachToolkitModule('core', 'definitely-not-a-real-module-zzz'),
    null
  );
});

test('never throws even when the toolkit is absent', () => {
  assert.doesNotThrow(() => reachToolkitModule('unified', 'coherency'));
});

test('accepts a multi-segment path', () => {
  // No assertion on the value (depends on environment) — just that the
  // variadic path joins and resolves without error.
  assert.doesNotThrow(() => reachToolkitModule('core', 'remembrance-lexicon'));
});
