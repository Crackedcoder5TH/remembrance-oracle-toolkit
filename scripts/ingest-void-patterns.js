#!/usr/bin/env node
'use strict';

/**
 * Ingest void → oracle.
 *
 * Reads Void-Data-Compressor/oracle_inbox/void_patterns.json (the
 * file produced by void's oracle_export.py), writes each record into
 * a dedicated `void_patterns` table in oracle.db keyed on `uri`.
 *
 * Idempotent: re-runs UPSERT on URI. Safe to run repeatedly. Does
 * NOT touch the existing `patterns` table — void records live in
 * a separate namespace until full URI migration lands.
 *
 * Usage:
 *   node scripts/ingest-void-patterns.js [path/to/void_patterns.json]
 *
 * Default input: ../Void-Data-Compressor/oracle_inbox/void_patterns.json
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { validate, parseUri } = require('../src/core/coherency-uri');

const DEFAULT_INPUT = path.resolve(
  __dirname,
  '../../Void-Data-Compressor/oracle_inbox/void_patterns.json'
);
const DB_PATH = path.resolve(__dirname, '../.remembrance/oracle.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS void_patterns (
  uri               TEXT PRIMARY KEY,
  repo              TEXT NOT NULL,
  domain            TEXT NOT NULL,
  path              TEXT NOT NULL,
  name              TEXT,
  module            TEXT,
  language          TEXT,
  source            TEXT,
  waveform_json     TEXT,
  atomic_props_json TEXT,
  ledger_json       TEXT,
  coherency_unified REAL,
  coherency_json    TEXT,
  ingested_at       TEXT NOT NULL,
  source_export_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_void_patterns_domain ON void_patterns(domain);
CREATE INDEX IF NOT EXISTS idx_void_patterns_module ON void_patterns(module);
CREATE INDEX IF NOT EXISTS idx_void_patterns_unified ON void_patterns(coherency_unified);
`;

const UPSERT = `
INSERT INTO void_patterns (
  uri, repo, domain, path, name, module, language,
  source, waveform_json, atomic_props_json, ledger_json,
  coherency_unified, coherency_json, ingested_at, source_export_at
) VALUES (
  :uri, :repo, :domain, :path, :name, :module, :language,
  :source, :waveform_json, :atomic_props_json, :ledger_json,
  :coherency_unified, :coherency_json, :ingested_at, :source_export_at
)
ON CONFLICT(uri) DO UPDATE SET
  name              = excluded.name,
  module            = excluded.module,
  language          = excluded.language,
  source            = excluded.source,
  waveform_json     = excluded.waveform_json,
  atomic_props_json = excluded.atomic_props_json,
  ledger_json       = excluded.ledger_json,
  coherency_unified = excluded.coherency_unified,
  coherency_json    = excluded.coherency_json,
  ingested_at       = excluded.ingested_at,
  source_export_at  = excluded.source_export_at;
`;

function main() {
  const inputPath = process.argv[2] || DEFAULT_INPUT;
  if (!fs.existsSync(inputPath)) {
    console.error(`input not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`reading ${inputPath}`);
  const manifest = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const records = manifest.records || [];
  console.log(`  ${records.length} records, exported_at=${manifest.exported_at || '?'}`);

  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA);

  const upsert = db.prepare(UPSERT);
  const now = new Date().toISOString();

  let ok = 0, bad = 0;
  db.exec('BEGIN');
  for (const r of records) {
    if (!r.uri || !validate(r.uri)) { bad++; continue; }
    let parts;
    try { parts = parseUri(r.uri); } catch { bad++; continue; }

    upsert.run({
      uri: r.uri,
      repo: parts.repo,
      domain: parts.domain,
      path: parts.path,
      name: r.name || null,
      module: r.module || null,
      language: r.language || null,
      source: r.source || null,
      waveform_json: r.waveform ? JSON.stringify(r.waveform) : null,
      atomic_props_json: r.atomic_properties ? JSON.stringify(r.atomic_properties) : null,
      ledger_json: r.ledger ? JSON.stringify(r.ledger) : null,
      coherency_unified: r.coherency_v1 ? r.coherency_v1.unified : null,
      coherency_json: r.coherency_v1 ? JSON.stringify(r.coherency_v1) : null,
      ingested_at: now,
      source_export_at: manifest.exported_at || null,
    });
    ok++;
  }
  db.exec('COMMIT');

  const total = db.prepare('SELECT COUNT(*) as n FROM void_patterns').get().n;
  console.log(`\ningested ${ok} records (${bad} skipped malformed)`);
  console.log(`total in void_patterns table: ${total}`);

  const byDomain = db.prepare(
    'SELECT domain, COUNT(*) as n FROM void_patterns GROUP BY domain ORDER BY n DESC'
  ).all();
  console.log('\nby domain:');
  for (const row of byDomain) console.log(`  ${row.domain.padEnd(14)} ${row.n}`);

  db.close();
}

main();
