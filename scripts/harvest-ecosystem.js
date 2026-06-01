#!/usr/bin/env node
'use strict';

/**
 * harvest-ecosystem — backfill the canonical code library from the ecosystem.
 *
 * The pattern library (patterns.json) is the substrate the swarm grounds in
 * (RAG) and scores against (the resonance hallucination filter). The more
 * proven code it holds, the better both work — so this captures coding
 * patterns from the owned ecosystem repos and folds them in.
 *
 * Design goal: the library only ever GROWS. Round-tripping the existing
 * patterns through the oracle's import→export is lossy (import dedups, export
 * re-scores against a coherency floor), so existing patterns are NOT sent
 * through it. Instead:
 *
 *   1. Load the existing patterns.json verbatim — these are preserved exactly.
 *   2. Boot the oracle empty (no auto-seed, no lifecycle) and harvest each
 *      source dir into it (test-backed + standalone functions).
 *   3. Export ONLY the freshly harvested patterns, filtered by a coherency
 *      floor (default 0.5) so weak/garbage harvests don't enter the library.
 *   4. Append the new patterns whose (name, language) — and code — aren't
 *      already present. Existing patterns always win ties.
 *   5. Write the union. If nothing new was added the file is byte-identical
 *      and the caller commits nothing.
 *
 * Usage:
 *   node scripts/harvest-ecosystem.js <dir> [<dir> ...]
 * Env:
 *   PATTERNS_FILE     output/library path (default: ./patterns.json)
 *   MIN_COHERENCY     floor for NEW harvests (default: 0.5)
 *   HARVEST_LANGUAGE  optional language filter passed to harvest
 */

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const { RemembranceOracle } = require('../src/api/oracle');
const { harvest } = require('../src/ci/harvest');

const PATTERNS_FILE = path.resolve(process.env.PATTERNS_FILE || path.join(process.cwd(), 'patterns.json'));
const MIN_COHERENCY = process.env.MIN_COHERENCY != null ? parseFloat(process.env.MIN_COHERENCY) : 0.5;
const LANGUAGE = (process.env.HARVEST_LANGUAGE || '').trim() || undefined;

const nameKey = (p) => `${String(p.name || '').toLowerCase()}|${String(p.language || '').toLowerCase()}`;
const codeKey = (p) => crypto.createHash('sha1').update(String(p.code || '')).digest('hex');

function loadExisting(file) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const arr = Array.isArray(d) ? d : (Array.isArray(d.patterns) ? d.patterns : []);
    return arr;
  } catch (_e) {
    return [];
  }
}

function main() {
  const dirs = process.argv.slice(2).filter(Boolean);
  if (dirs.length === 0) {
    console.error('Usage: node scripts/harvest-ecosystem.js <dir> [<dir> ...]');
    process.exit(2);
  }

  const existing = loadExisting(PATTERNS_FILE);
  const haveName = new Set(existing.map(nameKey));
  const haveCode = new Set(existing.map(codeKey));
  console.log(`[harvest-ecosystem] library before: ${existing.length} patterns (${PATTERNS_FILE})`);

  // Controlled boot: empty DB, no built-in seeds, no background lifecycle.
  // Existing patterns are deliberately NOT imported — they're merged verbatim
  // below, so the lossy import/re-score round-trip can never drop them.
  const oracle = new RemembranceOracle({
    autoSeed: false,
    autoSync: false,
    autoGrow: false,
    lifecycle: false,
  });

  let totalHarvested = 0;
  for (const dir of dirs) {
    const abs = path.resolve(dir);
    if (!fs.existsSync(abs)) {
      console.log(`[harvest-ecosystem] skip (missing): ${dir}`);
      continue;
    }
    try {
      const r = harvest(oracle, abs, { language: LANGUAGE, maxFiles: 2000 });
      totalHarvested += r.registered || 0;
      console.log(`[harvest-ecosystem] ${dir}: harvested ${r.harvested}, registered ${r.registered}, skipped ${r.skipped}, failed ${r.failed}`);
    } catch (e) {
      // One repo failing must not abort the whole backfill.
      console.error(`[harvest-ecosystem] ERROR harvesting ${dir}: ${e.message}`);
    }
  }

  // Export ONLY the freshly harvested patterns (the DB holds nothing else),
  // floored by coherency so weak harvests never enter the library.
  const harvestedPatterns = JSON.parse(
    oracle.export({ format: 'json', limit: 1000000, minCoherency: MIN_COHERENCY })
  ).patterns || [];

  const merged = existing.slice();
  let added = 0;
  for (const p of harvestedPatterns) {
    if (haveName.has(nameKey(p)) || haveCode.has(codeKey(p))) continue;
    merged.push(p);
    haveName.add(nameKey(p));
    haveCode.add(codeKey(p));
    added++;
  }

  if (added === 0) {
    console.log(`[harvest-ecosystem] no new patterns cleared the floor (${MIN_COHERENCY}); library unchanged at ${existing.length}.`);
    return;
  }

  const out = JSON.stringify({ exported: new Date().toISOString(), count: merged.length, patterns: merged }, null, 2);
  fs.writeFileSync(PATTERNS_FILE, out, 'utf8');
  console.log(`[harvest-ecosystem] library after: ${merged.length} patterns (+${added} new, ${totalHarvested} harvested this run)`);
}

main();
