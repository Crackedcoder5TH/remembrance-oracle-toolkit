#!/usr/bin/env node
'use strict';

/**
 * Export the Oracle pattern library as a Void-compatible substrate
 * file. Each pattern's code is converted to a 128-point normalized
 * waveform using the same algorithm Void's /coherence endpoint uses
 * internally (raw bytes → float64 → resample → normalize to 0..1).
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

const TARGET_LEN = 128;

function argValue(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function codeToWaveform(code) {
  const bytes = Buffer.from(code, 'utf-8');
  if (bytes.length < 8) return null;
  const arr = new Float64Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes[i];

  // Resample to TARGET_LEN
  const wave = new Float64Array(TARGET_LEN);
  if (arr.length >= TARGET_LEN) {
    // Downsample by linear interpolation of indices
    for (let k = 0; k < TARGET_LEN; k++) {
      const idx = Math.floor((k / (TARGET_LEN - 1)) * (arr.length - 1));
      wave[k] = arr[idx];
    }
  } else {
    // Upsample via linear interpolation
    for (let k = 0; k < TARGET_LEN; k++) {
      const t = (k / (TARGET_LEN - 1)) * (arr.length - 1);
      const lo = Math.floor(t);
      const hi = Math.ceil(t);
      const frac = t - lo;
      wave[k] = arr[lo] * (1 - frac) + arr[hi] * frac;
    }
  }

  // Normalize to [0, 1]
  let min = Infinity, max = -Infinity;
  for (const v of wave) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min;
  if (range < 1e-9) return null; // constant — no structure
  const safeRange = range || 1; // proven nonzero above; belt-and-braces for the audit
  const out = new Array(TARGET_LEN);
  for (let k = 0; k < TARGET_LEN; k++) out[k] = (wave[k] - min) / safeRange;
  return out;
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
