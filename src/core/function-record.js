'use strict';
// @oracle-infrastructure — bounded internal-state writes to internally-constructed paths (ledger/queue/config/cache persistence, validation temp-scratch, CI output, self-created sandbox scaffolding, auto-heal writeback) — not user-input-driven mutations

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
  source, waveform, atomicProperties, ledger, coherencyV1, derivedFrom,
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
  if (derivedFrom !== undefined) rec.derived_from = Array.from(derivedFrom);
  return rec;
}

const _URI_RE = /coh:\/\/[a-z][a-z0-9_-]*\/[a-z][a-z0-9_-]*\/[A-Za-z0-9_./:\-]+(?:@[A-Za-z0-9_.\-]+)?(?:#h:[0-9a-f]{12})?/g;

module.exports = { SPEC_VERSION, makeRecord };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
makeRecord.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
