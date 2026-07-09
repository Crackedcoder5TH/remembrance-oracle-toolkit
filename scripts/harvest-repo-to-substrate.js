#!/usr/bin/env node
'use strict';

/**
 * harvest-repo-to-substrate.js — grow the Void pattern library with a
 * repo's current files, so the substrate's memory catches up to the code.
 *
 * The macro map (coherency-mapper.mapFromSubstrate) reads from
 * pattern_index_fractal.json, which is only grown on an explicit harvest
 * (every live read is growSubstrate:false to keep temp reads out of the
 * library). This is that explicit harvest: walk a repo, encode each file
 * the library hasn't witnessed yet, and add it under the repo's
 * namespace. Idempotent — a file already indexed under its namespace is
 * left untouched, so re-runs only add what's new.
 *
 * Schema per entry (matches the existing index):
 *   <namespace>/<relpath>: {
 *     fractal:     29-D  (L1 structural, the JS↔Python parity anchor)
 *     composed_v1: 116-D (depth-4 composed — what mapFromSubstrate reads)
 *     composed_v2: 145-D (depth-5 composed — the current canonical)
 *     source_file, ingested_from, ingested_at
 *   }
 *
 * Encoding uses the CURRENT encoder (post the catastrophic-backtracking
 * fix in fractal-waveform.js). That fix is byte-identical to the old
 * encoder on 705/711 real files; the 6 that differ drift <=0.005 in one
 * dim (cosine impact ~1e-5), so new entries sit consistently alongside
 * the existing ones.
 *
 * Usage:
 *   node scripts/harvest-repo-to-substrate.js <repo-name-or-path> [--dry]
 *   node scripts/harvest-repo-to-substrate.js REMEMBRANCE-BLOCKCHAIN
 *   node scripts/harvest-repo-to-substrate.js all
 */

const fs = require('node:fs');
const path = require('node:path');
const { toFractalWaveform } = require('../src/core/fractal-waveform');
const { composedAtDepth } = require('../src/core/encoder-stack');
const {
  DEFAULT_EXTENSIONS, DEFAULT_SKIP_DIRS,
} = require('../src/core/coherency-mapper');

const HOME = process.env.HARVEST_HOME || '/home/user';
const INDEX_PATH = process.env.SUBSTRATE_PATH
  || path.join(HOME, 'Void-Data-Compressor', 'pattern_index_fractal.json');
const CONTENT_CAP = 64000;
const MIN_CHARS = 60;

// namespace ↔ repo directory (the aliases the substrate already uses)
const NS_TO_REPO = {
  'oracle': 'remembrance-oracle-toolkit',
  'void': 'Void-Data-Compressor',
  'rmb-blockchain': 'REMEMBRANCE-BLOCKCHAIN',
  'rmb-swarm': 'REMEMBRANCE-AGENT-Swarm-',
  'rmb-interface': 'REMEMBRANCE-Interface',
  'rmb-dialer': 'Remembrance-dialer',
  'rmb-plugger': 'REMEMBRANCE-API-Key-Plugger',
  'moons': 'MOONS-OF-REMEMBRANCE',
  'reflector': 'Reflector-oracle-',
  'claw': 'claw-code',
  'awesomedesign': 'awesome-design-md',
};
const REPO_TO_NS = Object.fromEntries(Object.entries(NS_TO_REPO).map(([ns, r]) => [r, ns]));

function resolveTarget(arg) {
  if (NS_TO_REPO[arg]) return { ns: arg, dir: path.join(HOME, NS_TO_REPO[arg]) };
  const base = path.basename(arg.replace(/\/+$/, ''));
  if (REPO_TO_NS[base]) return { ns: REPO_TO_NS[base], dir: path.join(HOME, base) };
  return null;
}

function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) { if (!DEFAULT_SKIP_DIRS.has(e.name)) stack.push(full); }
      else if (e.isFile() && DEFAULT_EXTENSIONS.includes(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

function cosine116(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length, 116);
  for (let i = 0; i < n; i++) { const x = a[i] || 0, y = b[i] || 0; dot += x * y; na += x * x; nb += y * y; }
  return (na > 1e-12 && nb > 1e-12) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const targetArg = args.find((a) => !a.startsWith('--'));
  if (!targetArg) {
    console.error('usage: harvest-repo-to-substrate.js <repo-name-or-path|all> [--dry]');
    process.exit(2);
  }

  const targets = targetArg === 'all'
    ? Object.keys(NS_TO_REPO).map((ns) => ({ ns, dir: path.join(HOME, NS_TO_REPO[ns]) }))
    : [resolveTarget(targetArg)].filter(Boolean);
  if (!targets.length) { console.error('unknown repo: ' + targetArg); process.exit(1); }

  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const index = idx.index;
  const now = new Date().toISOString();
  const beforeTotal = Object.keys(index).length;

  // Pre-index existing composed_v1 vectors for the "what arises" resonance
  // report — nearest cross-repo neighbour of each newly harvested file.
  const composedAll = [];
  for (const [name, e] of Object.entries(index)) {
    if (e.composed_v1) composedAll.push([name, e.composed_v1]);
  }

  let added = 0, skipped = 0;
  const arose = [];

  for (const { ns, dir } of targets) {
    if (!fs.existsSync(dir)) { console.error('  skip (missing): ' + dir); continue; }
    const files = walk(dir);
    for (const f of files) {
      const rel = path.relative(dir, f);
      const key = ns + '/' + rel;
      if (index[key]) { skipped++; continue; }
      let content;
      try { content = fs.readFileSync(f, 'utf8').slice(0, CONTENT_CAP); } catch { continue; }
      if (content.length < MIN_CHARS) { skipped++; continue; }

      const fractal = Array.from(toFractalWaveform(content));
      const composed_v1 = Array.from(composedAtDepth(content, 4));
      const composed_v2 = Array.from(composedAtDepth(content, 5));

      if (!dry) {
        index[key] = {
          fractal,
          source_file: key,
          ingested_from: dir,
          ingested_at: now,
          composed_v1,
          composed_v2,
        };
      }
      added++;

      // What does this newly-witnessed file resonate with, cross-repo?
      let best = null, bestScore = -1;
      for (const [name, vec] of composedAll) {
        if (name.startsWith(ns + '/')) continue;   // cross-repo only
        const s = cosine116(composed_v1, vec);
        if (s > bestScore) { bestScore = s; best = name; }
      }
      if (best && bestScore >= 0.90) arose.push({ from: key, to: best, score: bestScore });
      composedAll.push([key, composed_v1]);        // future files can match this one
    }
  }

  console.log(`harvest ${dry ? '(dry run) ' : ''}complete:`);
  console.log(`  +${added} files witnessed · ${skipped} already indexed`);
  console.log(`  substrate: ${beforeTotal} → ${beforeTotal + (dry ? 0 : added)} entries`);

  if (!dry) {
    if (idx.total_patterns != null) idx.total_patterns = Object.keys(index).length;
    idx.ingestion_log = idx.ingestion_log || [];
    idx.ingestion_log.push({ at: now, added, targets: targets.map((t) => t.ns), tool: 'harvest-repo-to-substrate' });
    const tmp = INDEX_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(idx));
    fs.renameSync(tmp, INDEX_PATH);
    console.log(`  written → ${INDEX_PATH}`);
  }

  // "Anything interesting" — the strongest unexpected cross-repo bonds.
  arose.sort((a, b) => b.score - a.score);
  const cross = arose.filter((a) => a.to.split('/')[0] !== a.from.split('/')[0]);
  if (cross.length) {
    console.log('\n  strongest cross-repo resonances the harvest surfaced:');
    for (const a of cross.slice(0, 12)) {
      console.log('   ' + a.score.toFixed(3) + '  ' + a.from + '  ↔  ' + a.to);
    }
  }
}

main();
