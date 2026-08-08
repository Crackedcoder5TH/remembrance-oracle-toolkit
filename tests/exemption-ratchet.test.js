'use strict';

/**
 * exemption-ratchet.test.js — the exemption surface can only shrink.
 *
 * The covenant's trusted annotations exempt a file from the fractal
 * scanners. ~489 files carry one after the 2026-08 compliance sweep, and
 * an uncounted exemption surface is where a gate's strength erodes. This
 * test IS the CI half of the ratchet: it fails the suite the moment a
 * commit adds a new exempt file without an explicit --save-baseline.
 *
 * List-based on purpose — a count ratchet lets a new exemption hide
 * behind a removal; the list catches every new exempt file by name.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const {
  censusExemptions, compareToBaseline, BASELINE_PATH,
} = require('../scripts/exemption-ratchet');

test('exemption surface has not grown past the baseline', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const census = censusExemptions();
  const cmp = compareToBaseline(census, baseline.files);
  assert.deepStrictEqual(
    cmp.added.map((e) => e.file), [],
    'Exemption surface GREW — these files newly carry a covenant exemption '
    + 'annotation:\n  ' + cmp.added.map((e) => `${e.file} [@oracle-${e.kind}]`).join('\n  ')
    + '\n\nThe relief valve is not a default. Either declare real '
    + 'atomicProperties and gate the mutations, or accept the growth '
    + 'explicitly: node scripts/exemption-ratchet.js --save-baseline '
    + '(which feeds each new file\'s stored Void-compressor reading into '
    + 'the field as the cost of growth).',
  );
});

test('the ratchet detects growth (a guard that cannot fail is not a guard)', () => {
  const baseline = ['a.js', 'b.js'];
  const grown = [{ file: 'a.js', kind: 'infrastructure' },
    { file: 'b.js', kind: 'infrastructure' },
    { file: 'c.js', kind: 'pattern-definitions' }];
  const cmp = compareToBaseline(grown, baseline);
  assert.strictEqual(cmp.added.length, 1);
  assert.strictEqual(cmp.added[0].file, 'c.js');
});

test('a swap cannot hide behind a removal (list-based, not count-based)', () => {
  const baseline = ['a.js', 'b.js'];
  const swapped = [{ file: 'a.js', kind: 'infrastructure' },
    { file: 'c.js', kind: 'infrastructure' }];   // b removed, c added — count unchanged
  const cmp = compareToBaseline(swapped, baseline);
  assert.strictEqual(cmp.count, cmp.baselineCount, 'count alone would pass this');
  assert.strictEqual(cmp.added.length, 1, 'the list still catches the new exemption');
  assert.deepStrictEqual(cmp.removed, ['b.js']);
});

test('shrinkage passes and is reported for re-baselining', () => {
  const baseline = ['a.js', 'b.js'];
  const shrunk = [{ file: 'a.js', kind: 'infrastructure' }];
  const cmp = compareToBaseline(shrunk, baseline);
  assert.strictEqual(cmp.added.length, 0);
  assert.deepStrictEqual(cmp.removed, ['b.js']);
});
