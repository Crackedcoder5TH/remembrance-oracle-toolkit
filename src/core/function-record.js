'use strict';

/**
 * Read/write helpers for the canonical function record.
 *
 * JS twin of void's function_record.py. See FUNCTION_RECORD_SPEC.md
 * in the Void-Data-Compressor repo for the schema. Both modules
 * MUST produce byte-identical JSON for the same input — the spec
 * pins field order via JSON.stringify with sorted keys.
 */

const fs = require('fs');
const path = require('path');
const { uriToFilename } = require('./coherency-uri');

const SPEC_VERSION = 1;
const RECORDS_DIR = 'function_records';

function makeRecord(uri, {
  name, module, language,
  source, waveform, atomicProperties, ledger, coherencyV1,
}) {
  if (!uri) throw new Error('makeRecord: uri required');
  if (!name) throw new Error('makeRecord: name required');
  if (!module) throw new Error('makeRecord: module required');
  if (!language) throw new Error('makeRecord: language required');

  const rec = {
    spec_version: SPEC_VERSION,
    uri,
    name,
    module,
    language,
  };
  if (source !== undefined) rec.source = source;
  if (waveform !== undefined) rec.waveform = Array.from(waveform).map(Number);
  if (atomicProperties !== undefined) rec.atomic_properties = atomicProperties;
  if (ledger !== undefined) rec.ledger = ledger;
  if (coherencyV1 !== undefined) rec.coherency_v1 = coherencyV1;
  return rec;
}

function writeRecord(rec, rootDir = '.') {
  const outDir = path.join(rootDir, RECORDS_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const fn = uriToFilename(rec.uri);
  const fp = path.join(outDir, fn);
  // Match Python's json.dump(indent=2, sort_keys=True) — sort top-level keys.
  // Nested objects keep their natural order; deep sorting is reserved for
  // when canonical hashing of records is needed (future work).
  const sorted = Object.keys(rec).sort().reduce((o, k) => { o[k] = rec[k]; return o; }, {});
  fs.writeFileSync(fp, JSON.stringify(sorted, null, 2));
  return fp;
}

function readRecord(uri, rootDir = '.') {
  const fp = path.join(rootDir, RECORDS_DIR, uriToFilename(uri));
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

module.exports = { SPEC_VERSION, makeRecord, writeRecord, readRecord };
