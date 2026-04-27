#!/usr/bin/env node
'use strict';

/**
 * Export oracle → void.
 *
 * Reads every row from oracle.db's `patterns` table, builds a
 * canonical function record per row (URI via labelOraclePattern,
 * coherency_v1 with text_score taken from coherency_total), writes
 * everything to ../Void-Data-Compressor/void_inbox/oracle_patterns.json.
 *
 * Symmetric to void's oracle_export.py — closes the round-trip.
 *
 * Usage:
 *   node scripts/export-oracle-patterns.js [output-path]
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { labelOraclePattern, parseUri } = require('../src/core/coherency-uri');
const { makeRecord } = require('../src/core/function-record');
const { compute: computeCoherency } = require('../src/unified/coherency-v1');

const DB_PATH = path.resolve(__dirname, '../.remembrance/oracle.db');
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  '../../Void-Data-Compressor/void_inbox/oracle_patterns.json'
);

function _safeParse(json, fallback = null) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

function main() {
  const outPath = process.argv[2] || DEFAULT_OUTPUT;
  if (!fs.existsSync(DB_PATH)) {
    console.error(`oracle.db not found at ${DB_PATH}`);
    process.exit(1);
  }
  console.log(`reading ${DB_PATH}`);
  const db = new DatabaseSync(DB_PATH, { readonly: true });

  const rows = db.prepare(`
    SELECT id, name, code, language, pattern_type, complexity, description,
           coherency_total, coherency_json, version, created_at, updated_at,
           usage_count, success_count, source_url, source_repo
    FROM patterns
  `).all();
  console.log(`  ${rows.length} patterns in oracle store`);

  const records = [];
  let bad = 0;
  for (const row of rows) {
    if (!row.name) { bad++; continue; }

    let uri;
    try {
      uri = labelOraclePattern({
        name: row.name,
        language: row.language,
      });
    } catch (e) {
      bad++; continue;
    }

    // Build coherency_v1 — text_score from existing coherency_total,
    // waveform_score and atomic_score remain null (void will fill those
    // when it ingests these records and runs its own analysis).
    const coh = computeCoherency({
      textScore: typeof row.coherency_total === 'number' ? row.coherency_total : null,
    });

    // First-seen / last-used as a partial ledger
    let ledger = null;
    if (row.created_at || row.updated_at) {
      ledger = {
        observed_start: row.created_at || row.updated_at,
        observed_end:   row.updated_at || row.created_at,
        // cadence — unknown without telemetry; mark as variable
        cadence:        'variable',
      };
    }

    const rec = makeRecord(uri, {
      name: row.name,
      module: row.pattern_type || 'oracle',
      language: row.language || 'unknown',
      source: row.code || undefined,
      ledger: ledger || undefined,
      coherencyV1: coh,
    });

    // Add oracle-specific telemetry (preserved verbatim for round-trip)
    rec.oracle_meta = {
      id: row.id,
      pattern_type: row.pattern_type,
      complexity: row.complexity,
      description: row.description,
      version: row.version,
      usage_count: row.usage_count,
      success_count: row.success_count,
      source_url: row.source_url,
      source_repo: row.source_repo,
      coherency_breakdown: _safeParse(row.coherency_json),
    };
    records.push(rec);
  }

  db.close();

  const manifest = {
    spec_version: 1,
    exported_at: new Date().toISOString(),
    source_repo: 'oracle',
    source_path: __filename,
    pattern_count: records.length,
    records,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\nwrote ${outPath} (${records.length} records, ${sizeKb} KB)`);
  if (bad) console.log(`skipped: ${bad} malformed`);

  // Quick coherency summary
  const unifieds = records
    .map(r => r.coherency_v1?.unified)
    .filter(x => typeof x === 'number');
  if (unifieds.length) {
    unifieds.sort((a, b) => a - b);
    const median = unifieds[Math.floor(unifieds.length / 2)];
    const mean = unifieds.reduce((a, b) => a + b, 0) / unifieds.length;
    console.log('\ncoherency_v1.unified summary:');
    console.log(`  min:    ${unifieds[0].toFixed(4)}`);
    console.log(`  median: ${median.toFixed(4)}`);
    console.log(`  mean:   ${mean.toFixed(4)}`);
    console.log(`  max:    ${unifieds[unifieds.length - 1].toFixed(4)}`);
  }

  // Domain distribution (everything will be 'code' for oracle but show it)
  const byDomain = {};
  for (const r of records) {
    try {
      const d = parseUri(r.uri).domain;
      byDomain[d] = (byDomain[d] || 0) + 1;
    } catch { /* ignore */ }
  }
  console.log('\ndomain distribution:');
  for (const [d, n] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${d.padEnd(14)} ${n}`);
  }
}

main();
