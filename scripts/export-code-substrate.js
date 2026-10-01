#!/usr/bin/env node
'use strict';
// @oracle-infrastructure — developer tooling — CLI/analysis helpers, not substrate elements; writes are build artifacts and internal-state maintenance

/**
 * Export the Oracle pattern library as a Void-compatible substrate
 * file. Each pattern's code is encoded as the canonical vector — the
 * 232-D fractal decoder at its active depth (src/core/code-to-waveform).
 *
 * Output shape matches the existing `*_substrate.json` files that
 * Void's ResonanceDetector._load_all_domains walks:
 *
 *   { "patterns": [
 *       { "waveform": [float, float, ...], "name": "...", "tags": [...] },
 *       ...
 *     ],
 *     "meta": { "source": "...", "count": N, "generated_at": "..." } }
 *
 * Usage:
 *   node scripts/export-code-substrate.js \
 *     [--out /home/user/Void-Data-Compressor/code_substrate.json] \
 *     [--language javascript]
 */

const fs = require('fs');
const path = require('path');
const { RemembranceOracle } = require('../src/api/oracle');
const { codeToWaveform: canonicalVector, TARGET_LEN: CANONICAL_LEN } = require('../src/core/code-to-waveform');

const TARGET_LEN = CANONICAL_LEN; // the canonical width, asked of the encoder

function argValue(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function codeToWaveform(code) {
  // ONE representation: the 232-D fractal decoder at its active depth. The
  // 128-point byte resample this used to build is a retired representation.
  if (!code || code.length < 8) return null;
  const v = Array.from(canonicalVector(code));
  return v.some((x) => x !== 0) ? v : null; // no structure — nothing to export
}

function main() {
  const outDir = argValue('out-dir', '/home/user/Void-Data-Compressor');
  const languageFilter = argValue('language', null);

  const oracle = new RemembranceOracle();
  const patterns = oracle.patterns.getAll().filter(p => {
    if (!p.code || p.code.length < 8) return false;
    if (languageFilter && p.language !== languageFilter) return false;
    if (p.coherencyScore && p.coherencyScore.total < 0.6) return false;
    return true;
  });

  // Split by patternType so each substrate file averages waveforms
  // within a coherent sub-family (algorithms average together, data
  // structures average together, etc.). Collapsing 276 heterogeneous
  // waveforms into a single mean produces noise; splitting by type
  // preserves structural information within each domain.
  const byType = new Map();
  let dropped = 0;
  for (const p of patterns) {
    const waveform = codeToWaveform(p.code);
    if (!waveform) { dropped++; continue; }
    const type = (p.patternType || 'utility').toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push({
      name: p.name || p.id,
      waveform,
      tags: (p.tags || []).slice(0, 10),
      language: p.language || 'unknown',
      coherency: p.coherencyScore?.total || 0,
    });
  }

  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [type, entries] of byType.entries()) {
    if (entries.length < 2) continue; // need >=2 waveforms for a meaningful mean
    const filename = `code_${type}_substrate.json`;
    const filepath = path.join(outDir, filename);
    const out = {
      patterns: entries,
      meta: {
        source: 'remembrance-oracle-toolkit',
        pattern_type: type,
        count: entries.length,
        language: languageFilter || 'all',
        generated_at: new Date().toISOString(),
        target_waveform_length: TARGET_LEN,
      },
    };
    fs.writeFileSync(filepath, JSON.stringify(out, null, 2));
    written.push({ type, count: entries.length, filename });
  }

  console.log(`Wrote ${written.length} code substrate files → ${outDir}`);
  for (const w of written) {
    console.log(`  ${w.filename.padEnd(40)}  ${String(w.count).padStart(4)} patterns`);
  }
  console.log(`  total patterns: ${written.reduce((s, w) => s + w.count, 0)}`);
  console.log(`  dropped: ${dropped}`);

  // Emit a suggested DOMAIN_MAP + DOMAIN_GROUPS snippet for Void.
  console.log('\n--- paste into resonance_detector.py DOMAIN_MAP ---');
  for (const w of written) {
    console.log(`    '${w.filename}': 'code_${w.type}',`);
  }
  console.log('\n--- paste into resonance_detector.py DOMAIN_GROUPS[code] ---');
  console.log(`    'code': [${written.map(w => `'code_${w.type}'`).join(', ')}],`);
}

main();
