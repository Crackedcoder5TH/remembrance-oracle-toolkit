'use strict';
// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state

/**
 * field-tool-parity.test.js — the published package's vendored encoder
 * modules must stay byte-identical to the canonical ones in src/core.
 *
 * packages/field-tool ships standalone (a published npm package cannot
 * require() into the repo), so it carries COPIES of the canonical
 * encoder layers. Copies drift silently; ECOSYSTEM §7 says one encoder.
 * This test turns silent drift into a loud failure: any divergence
 * between a canonical module and its vendored twin fails CI until the
 * copy is re-synced (cp src/core/<f> packages/field-tool/src/<f>).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MIRRORED = [
  'lexical-waveform.js',
  'numerical-waveform.js',
  'redundancy-waveform.js',
  'spectral-waveform.js',
  'content-projection.js',
  'dimensional-waveform.js',
  'dynamical-waveform.js',
];

test('vendored field-tool encoder modules match canonical byte-for-byte', () => {
  for (const f of MIRRORED) {
    const canonical = fs.readFileSync(path.join(ROOT, 'src', 'core', f));
    const vendored = fs.readFileSync(path.join(ROOT, 'packages', 'field-tool', 'src', f));
    assert.ok(canonical.equals(vendored),
      `${f} drifted from canonical — re-sync: cp src/core/${f} packages/field-tool/src/${f}`);
  }
});

// fractal-waveform.js is NOT byte-mirrored: oracle and field-tool carry two
// trusted reference implementations of docs/FRACTAL_WAVEFORM_SPEC.md, and
// both headers claim byte-identical vectors for the same input. Nothing
// enforced that claim — this does. Any spec change must land in both files
// before this passes again.
test('dual fractal-waveform implementations produce identical vectors', () => {
  const oracleEnc = require(path.join(ROOT, 'src', 'core', 'fractal-waveform'));
  const fieldEnc = require(path.join(ROOT, 'packages', 'field-tool', 'src', 'fractal-waveform'));
  const samples = [
    'src/core/fractal-waveform.js',   // JS source (self-referential input)
    'src/core/mapper/pairs.js',       // JS source, different shape
    'README.md',                      // prose
    'package.json',                   // data
  ];
  assert.equal(oracleEnc.FRACTAL_DIM, fieldEnc.FRACTAL_DIM, 'FRACTAL_DIM diverged');
  for (const f of samples) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.deepStrictEqual(
      Array.from(oracleEnc.toFractalWaveform(text)),
      Array.from(fieldEnc.toFractalWaveform(text)),
      `encoder vectors diverged on ${f} — the two reference implementations no longer agree with the spec`);
  }
});
