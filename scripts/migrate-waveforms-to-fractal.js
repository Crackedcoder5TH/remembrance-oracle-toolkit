#!/usr/bin/env node
'use strict';

/**
 * migrate-waveforms-to-fractal.js — one-shot data migration.
 *
 * Walks the sqlite `patterns` table and rewrites every stored 256-D
 * byte-stretch waveform (and its digest) into the new 29-D fractal
 * encoding, re-derived from the pattern's source `code` column. This is
 * what the new encoder is FOR: it speaks the ecosystem's fractal
 * language, so historical patterns should speak it too.
 *
 * Idempotent: rows with no waveform are left alone; rows whose
 * waveform is already 29-D (fresh writes since the encoder swap) are
 * left alone; only legacy 256-D rows are rewritten.
 *
 * Default mode is dry-run (counts + sample). Pass `--commit` to write.
 * Other flags:
 *   --db <path>       sqlite file (default .remembrance/oracle.db)
 *   --limit <n>       cap rewrites (testing)
 *   --verbose         per-row log
 */

const path = require('path');
const { SQLiteStore } = require('../src/store/sqlite');
const { codeToWaveform, waveformCosine, digestWaveform, TARGET_LEN, BYTE_TARGET_LEN } =
  require('../src/core/code-to-waveform');

function parseArgs(argv) {
  const out = { commit: false, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') out.commit = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--db') out.db = argv[++i];
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const store = new SQLiteStore(args.db ? path.dirname(path.dirname(path.resolve(args.db))) : root);
  const db = store.db;

  const rows = db.prepare('SELECT id, code, coherency_json FROM patterns').all();

  const stats = {
    total: rows.length,
    noWaveform: 0,
    alreadyFractal: 0,
    legacyByte: 0,
    rewritten: 0,
    skippedNoCode: 0,
    parseError: 0,
    other: 0,
  };
  const samples = [];

  const update = db.prepare('UPDATE patterns SET coherency_json = ? WHERE id = ?');
  const edits = [];

  for (const row of rows) {
    let cj;
    try { cj = JSON.parse(row.coherency_json || '{}'); }
    catch { stats.parseError++; continue; }

    if (!Array.isArray(cj.waveform)) { stats.noWaveform++; continue; }
    if (cj.waveform.length === TARGET_LEN) { stats.alreadyFractal++; continue; }
    if (cj.waveform.length !== BYTE_TARGET_LEN) { stats.other++; continue; }

    stats.legacyByte++;

    if (!row.code || typeof row.code !== 'string' || !row.code.trim()) {
      stats.skippedNoCode++;
      continue;
    }
    if (args.limit && stats.rewritten >= args.limit) continue;

    const newWf = Array.from(codeToWaveform(row.code));
    const newDigest = digestWaveform(newWf);

    const before = { wfLen: cj.waveform.length, digest: cj.digest };
    cj.waveform = newWf;
    cj.digest = newDigest;
    cj.waveformEncoder = 'fractal-v1';

    edits.push({ id: row.id, json: JSON.stringify(cj) });
    stats.rewritten++;

    if (samples.length < 3) {
      samples.push({ id: row.id, before, after: { wfLen: newWf.length, digest: newDigest } });
    }

    if (args.verbose) {
      process.stdout.write(`  ${row.id}  ${before.wfLen}-D ${before.digest} -> ${newWf.length}-D ${newDigest}\n`);
    }
  }

  if (args.commit && edits.length) {
    db.exec('BEGIN');
    try {
      for (const e of edits) update.run(e.json, e.id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  console.log('');
  console.log('migrate-waveforms-to-fractal — ' + (args.commit ? 'COMMITTED' : 'DRY-RUN (use --commit to apply)'));
  console.log('  total patterns:        ' + stats.total);
  console.log('  no waveform field:     ' + stats.noWaveform);
  console.log('  already fractal (' + TARGET_LEN + '-D): ' + stats.alreadyFractal);
  console.log('  legacy byte (256-D):   ' + stats.legacyByte);
  console.log('  other length:          ' + stats.other);
  console.log('  parse errors:          ' + stats.parseError);
  console.log('  skipped (no code):     ' + stats.skippedNoCode);
  console.log('  rewritten:             ' + stats.rewritten);
  if (samples.length) {
    console.log('  sample rewrites:');
    for (const s of samples) {
      console.log(`    ${s.id}: ${s.before.wfLen}-D ${s.before.digest} -> ${s.after.wfLen}-D ${s.after.digest}`);
    }
  }
  store.close && store.close();
}

main();
