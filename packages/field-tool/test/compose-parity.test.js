'use strict';
// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { composed, LAYER_DIM } = require('../src/compose');

// The package's composed() must be byte-identical to the oracle
// substrate's decoder-stack — the standalone telescope is the SAME
// telescope. If the oracle isn't a sibling (published package alone),
// the parity assertion is skipped but the self-consistency checks run.
test('composed produces the full 8-layer 232-D signature', () => {
  const v = composed('function f(x) { return x + 1; }', 8);
  assert.equal(v.length, 8 * LAYER_DIM);
  for (const x of v) assert.ok(Number.isFinite(x));
});

test('composed is deterministic', () => {
  const t = 'The river flows through the field, returning what was given.';
  assert.deepEqual(Array.from(composed(t, 8)), Array.from(composed(t, 8)));
});

test('depth clamps to [1,8]', () => {
  assert.equal(composed('abc def ghi', 1).length, LAYER_DIM);
  assert.equal(composed('abc def ghi', 9).length, 8 * LAYER_DIM);
});

test('byte-identical to the oracle decoder-stack when present', () => {
  let composedAtDepth;
  try { ({ composedAtDepth } = require('../../../src/core/decoder-stack')); }
  catch (_) { return; } // published-standalone: no oracle sibling, skip
  const samples = [
    'function f(x){return x+1;}',
    'def g(a):\n  return [i for i in a if i > 0]',
    JSON.stringify(Array.from({ length: 60 }, (_, i) => +Math.sin(i / 3).toFixed(4))),
    'Coherency emerges where the residual is held still.',
    '{"a":1,"b":[2,3,4]}',
  ];
  for (const s of samples) {
    const a = composed(s, 8), b = composedAtDepth(s, 8);
    assert.equal(a.length, b.length, `length for ${s.slice(0, 20)}`);
    for (let i = 0; i < a.length; i++) {
      assert.ok(Math.abs(a[i] - b[i]) < 1e-12, `dim ${i} drift on ${s.slice(0, 20)}`);
    }
  }
});
