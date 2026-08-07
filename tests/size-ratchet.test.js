'use strict';
// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state

/**
 * size-ratchet.test.js — the monolith surface can only shrink.
 *
 * 70 of 407 src modules exceeded 500 lines when the baseline was frozen
 * (60,253 lines, 43% of src). This test is the CI half of the ratchet:
 * no new module over the cap, no grandfathered module growing past its
 * recorded size + slack. The road from 70 to 0 is enforced, not wished.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const {
  censusSizes, compareSizes, BASELINE_PATH, MAX_LINES, SLACK,
} = require('../scripts/size-ratchet');

test('no new monolith and no grandfathered growth past slack', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const cmp = compareSizes(censusSizes(), baseline.modules);
  const problems = [
    ...cmp.newMonoliths.map((e) => `NEW monolith: ${e.file} (${e.lines} lines, cap ${MAX_LINES})`),
    ...cmp.grown.map((e) => `GREW: ${e.file} ${e.baseline} -> ${e.lines} (+${e.lines - e.baseline}, slack ${SLACK})`),
  ];
  assert.deepStrictEqual(problems, [],
    'Size ratchet violated:\n  ' + problems.join('\n  ')
    + '\n\nSplit the module (walk-files.js and the mapper decomposition are the '
    + 'house pattern) or shrink it back. To release a module that dropped under '
    + 'the cap: node scripts/size-ratchet.js --save-baseline');
});

test('the ratchet detects a new monolith', () => {
  const cmp = compareSizes([{ file: 'src/x.js', lines: 501 }], {});
  assert.strictEqual(cmp.newMonoliths.length, 1);
});

test('the ratchet detects grandfathered growth past slack', () => {
  const cmp = compareSizes([{ file: 'src/x.js', lines: 600 + SLACK + 1 }], { 'src/x.js': 600 });
  assert.strictEqual(cmp.grown.length, 1);
});

test('growth within slack passes; shrinking under the cap is reported for release', () => {
  const ok = compareSizes([{ file: 'src/x.js', lines: 600 + SLACK }], { 'src/x.js': 600 });
  assert.strictEqual(ok.grown.length, 0);
  const rel = compareSizes([{ file: 'src/x.js', lines: 400 }], { 'src/x.js': 600 });
  assert.deepStrictEqual(rel.shrunkOut, ['src/x.js']);
});
