#!/usr/bin/env node
'use strict';

/**
 * Add `uri` column to oracle.db's patterns table and populate it.
 *
 * Idempotent: re-runs only fill in missing URIs. Doesn't touch rows
 * that already have one.
 *
 * Run after upgrading to a build that uses URIs as the cross-repo
 * identity primary key. Safe to run repeatedly.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { labelOraclePattern } = require('../src/core/coherency-uri');

const DB_PATH = path.resolve(__dirname, '../.remembrance/oracle.db');

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`oracle.db not found at ${DB_PATH}`);
    process.exit(1);
  }
  const db = new DatabaseSync(DB_PATH);

  // Check if column exists
  const cols = db.prepare(`PRAGMA table_info(patterns)`).all();
  const hasUri = cols.some(c => c.name === 'uri');

  if (!hasUri) {
    console.log('adding uri column to patterns table...');
    db.exec(`ALTER TABLE patterns ADD COLUMN uri TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_patterns_uri ON patterns(uri)`);
    console.log('  added.');
  } else {
    console.log('uri column already present.');
  }

  // Populate URIs for rows that don't have one
  const rows = db.prepare(`SELECT id, name, language, uri FROM patterns`).all();
  console.log(`\n${rows.length} patterns in store`);
  const update = db.prepare(`UPDATE patterns SET uri = ? WHERE id = ?`);
  let updated = 0, skipped = 0, failed = 0;
  db.exec('BEGIN');
  for (const r of rows) {
    if (r.uri) { skipped++; continue; }
    if (!r.name) { failed++; continue; }
    try {
      const uri = labelOraclePattern({ name: r.name, language: r.language });
      update.run(uri, r.id);
      updated++;
    } catch (e) {
      failed++;
    }
  }
  db.exec('COMMIT');

  console.log(`\nupdated: ${updated}`);
  console.log(`already had URI: ${skipped}`);
  console.log(`failed: ${failed}`);

  // Verify
  const withUri = db.prepare(`SELECT COUNT(*) as n FROM patterns WHERE uri IS NOT NULL`).get();
  console.log(`\ntotal rows with URI: ${withUri.n} / ${rows.length}`);

  db.close();
}

main();
