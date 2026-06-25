#!/usr/bin/env node
'use strict';

/**
 * ingest-git-history — compress the ecosystem's GitHub history into a field
 * histogram via the field-tool read() engine (the same Void fractal encoder the
 * goggles use).
 *
 * Each commit (subject + body + numstat, bounded to 4 KB) is one read(): the
 * Void compressor encodes it to a waveform, scores it against the substrate, and
 * contributes its coherence to the field under a per-repo source
 * (`git-history:<repo>`). The result is a per-repo histogram — a lossy, low-
 * dimensional projection of the commit stream. The semantic content stays in
 * git; what this captures is the coherence/shape distribution.
 *
 * It writes the histogram as a loadable seed in the blockchain data dir. Load it
 * back with:
 *   FIELD_SEED_PATH=<...>/git-history-histogram.seed.json \
 *     node -e "console.log(require('./src/core/field-memory')._restoreFromSeed())"
 *
 *   node scripts/ingest-git-history.js          # all non-merge commits
 *   LIMIT=20 node scripts/ingest-git-history.js  # first N per repo (smoke test)
 *
 * The histogram is per-repo by design; the substrate is not grown (growSubstrate
 * false) so the coding library stays clean — this builds a histogram, not patterns.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ORACLE = path.resolve(__dirname, '..');
const PARENT = path.resolve(ORACLE, '..');

// Isolate the field so the histogram is git-history ONLY (not mixed with a live field).
if (!process.env.ENTROPY_PATH) {
  process.env.ENTROPY_PATH = path.join(os.tmpdir(), `git-history-entropy.${process.pid}.json`);
}
try { fs.unlinkSync(process.env.ENTROPY_PATH); } catch (_) { /* fresh */ }

const ft = require(path.join(ORACLE, 'src/core/field-tool'));
const { peekField } = require(path.join(ORACLE, 'src/core/field-coupling'));

// tag -> directory name under the ecosystem parent.
const REPOS = [
  ['remembrance-oracle-toolkit', 'remembrance-oracle-toolkit'],
  ['rmb-blockchain', 'REMEMBRANCE-BLOCKCHAIN'],
  ['rmb-swarm', 'REMEMBRANCE-AGENT-Swarm-'],
  ['void', 'Void-Data-Compressor'],
  ['moons', 'MOONS-OF-REMEMBRANCE'],
  ['rmb-dialer', 'Remembrance-dialer'],
  ['rmb-plugger', 'REMEMBRANCE-API-Key-Plugger'],
];
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : 0; // 0 = all
const SEED = process.env.GIT_HISTORY_SEED ||
  path.join(PARENT, 'REMEMBRANCE-BLOCKCHAIN', 'data', 'git-history-histogram.seed.json');

const perRepo = {};
let total = 0;
const t0 = Date.now();

for (const [tag, name] of REPOS) {
  const dir = path.join(PARENT, name);
  if (!fs.existsSync(path.join(dir, '.git'))) { continue; }
  let hashes;
  try {
    hashes = execSync(`git -C "${dir}" rev-list --all --no-merges`, { encoding: 'utf8', maxBuffer: 1 << 26 })
      .split('\n').filter(Boolean);
  } catch (_) { continue; }
  if (LIMIT) hashes = hashes.slice(0, LIMIT);
  const cohs = [];
  for (const h of hashes) {
    let blob;
    try {
      const msg = execSync(`git -C "${dir}" show -s --format='%s%n%b' ${h}`, { encoding: 'utf8', maxBuffer: 1 << 24 });
      const stat = execSync(`git -C "${dir}" show --numstat --format='' ${h}`, { encoding: 'utf8', maxBuffer: 1 << 24 });
      blob = (msg + '\n' + stat).slice(0, 4000);
    } catch (_) { continue; }
    const r = ft.read(
      { content: blob, name: `${tag}@${h.slice(0, 12)}`, language: 'git' },
      { source: `git-history:${tag}`, growSubstrate: false, autoEntangle: false },
    );
    if (r && Number.isFinite(r.coherence)) cohs.push(r.coherence);
    total++;
  }
  const n = cohs.length;
  const mean = n ? cohs.reduce((s, x) => s + x, 0) / n : 0;
  perRepo[tag] = {
    n, mean: +mean.toFixed(4),
    min: n ? +Math.min(...cohs).toFixed(4) : 0,
    max: n ? +Math.max(...cohs).toFixed(4) : 0,
  };
  console.error(`  ${tag}: ${n} commits, mean coherence ${perRepo[tag].mean}`);
}

const field = peekField();
if (field) {
  fs.writeFileSync(SEED, JSON.stringify(field, null, 2));
  console.error(`seed written -> ${SEED}`);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.error(`ingested ${total} commits in ${elapsed}s`);
console.log(JSON.stringify({ perRepo, total, elapsed, seed: SEED }, null, 2));
