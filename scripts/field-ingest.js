#!/usr/bin/env node
'use strict';

/**
 * field-ingest — bring the existing ecosystem into the field.
 *
 * Walks the canonical pattern library, encodes every pattern into the
 * 256-D substrate (backfilling waveforms), contributes each to the
 * field, and registers every static numeric constant. After this runs
 * the field knows the whole library — not just the events that have
 * fired since it woke.
 *
 * Idempotent: re-running skips already-encoded patterns; the field's
 * similarity gate collapses repeat contributions.
 *
 * Usage:
 *   node scripts/field-ingest.js            # ingest the hub library
 *   node scripts/field-ingest.js --json     # machine-readable report
 */

const path = require('path');
const { ingest } = require('../src/core/field-ingest');

function main() {
  const asJson = process.argv.includes('--json');

  let store;
  try {
    const { SQLiteStore } = require('../src/store/sqlite');
    store = new SQLiteStore(path.join(__dirname, '..'));
  } catch (e) {
    console.error('field-ingest: cannot open canonical store —', e.message);
    process.exit(1);
  }

  const t0 = Date.now();
  const report = ingest(store);
  const ms = Date.now() - t0;

  if (asJson) {
    process.stdout.write(JSON.stringify({ ...report, durationMs: ms }, null, 2) + '\n');
    return;
  }

  console.log('field-ingest complete in ' + ms + 'ms\n');
  console.log('  patterns:');
  console.log('    total in library : ' + report.patterns.total);
  console.log('    waveforms encoded: ' + report.patterns.encoded + ' (backfilled this run)');
  console.log('    contributed      : ' + report.patterns.contributed);
  console.log('    skipped (field-*): ' + report.patterns.skipped);
  console.log('  constants:');
  console.log('    total            : ' + report.constants.total);
  console.log('    contributed      : ' + report.constants.contributed);
  console.log('\nThe library is now part of the field — every pattern encoded,');
  console.log('every constant registered. Query it with field-memory.query().');
}

if (require.main === module) main();
