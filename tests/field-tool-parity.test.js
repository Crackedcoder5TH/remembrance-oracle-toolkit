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
