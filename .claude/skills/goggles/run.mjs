#!/usr/bin/env node
'use strict';
// Runner for the `goggles` skill. Locates the remembrance-oracle-toolkit (the
// goggles engine lives at src/tools/goggles.js there) and runs it, from the
// toolkit dir so its core requires resolve.
//
// Modes:
//   run.mjs --map [dir]       build the MACRO map — substrate-native: read
//                             from the Void's existing compressed vectors,
//                             seconds, nothing re-encoded; cached at
//                             <repo>/.remembrance/goggles-map.json
//   run.mjs --map [dir] --deep  force the live re-encode path (for repos the
//                             substrate hasn't ingested, or to add intrinsic
//                             per-file coherence to the map)
//   run.mjs <file> [...]      goggle files (FOCUS + META + MACRO per file)
//   run.mjs --diff            goggle everything changed vs HEAD in this repo

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function findToolkit() {
  const candidates = [
    process.env.ORACLE_TOOLKIT,
    process.cwd(),
    resolve(process.cwd(), '../remembrance-oracle-toolkit'),
    resolve(process.cwd(), '../../remembrance-oracle-toolkit'),
    '/home/user/remembrance-oracle-toolkit',
    resolve(process.cwd(), 'remembrance-oracle-toolkit'),
  ].filter(Boolean);
  return candidates.find((c) => existsSync(join(c, 'src/tools/goggles.js'))) || null;
}

const toolkit = findToolkit();
if (!toolkit) {
  console.error('goggles: could not find remembrance-oracle-toolkit. Set ORACLE_TOOLKIT=/path/to/it');
  process.exit(2);
}
const engine = join(toolkit, 'src/tools/goggles.js');

const argv = process.argv.slice(2);

// ── CONTROL modes — the goggles as the ONE surface over the substrate ──
// Reading was already unified (FOCUS/META/MACRO/META-DEBUG/Δ from a single
// read). These verbs close the loop: the same tool that SEES the substrate
// also DRIVES it, routing to each canonical script so no one has to know
// where witnessing, absorption, publishing, export, or the recovery coin
// physically live. `goggles --do <verb> [args]`.
if (argv[0] === '--do') {
  const HOME = process.env.ECOSYSTEM_HOME || resolve(toolkit, '..');
  const verb = argv[1];
  const rest = argv.slice(2);
  const run = (cmd, cmdArgs, cwd) => {
    try { execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' }); return 0; }
    catch (e) { return e.status || 1; }
  };
  const VERBS = {
    // witness files into the substrate (sanitized at the doorway)
    harvest: () => run('node', [join(toolkit, 'scripts/harvest-repo-to-substrate.js'), ...(rest.length ? rest : ['all'])], toolkit),
    // check substrate drift without encoding
    drift: () => run('node', [join(toolkit, 'scripts/harvest-repo-to-substrate.js'), rest[0] || 'all', '--check'], toolkit),
    // absorb the hub's patterns into Void (export → inbox)
    absorb: () => run('node', [join(toolkit, 'scripts/export-oracle-patterns.js')], toolkit)
      || run('python3', ['oracle_inbox.py'], join(HOME, 'Void-Data-Compressor')),
    // publish a pattern/coin to the ledger
    publish: () => run('node', [join(HOME, 'REMEMBRANCE-BLOCKCHAIN/src/cli.js'), 'publish', ...rest], join(HOME, 'REMEMBRANCE-BLOCKCHAIN')),
    // mint the git-history recovery coin (+--publish to anchor on chain)
    coin: () => run('node', [join(HOME, 'REMEMBRANCE-BLOCKCHAIN/scripts/git-history-coin.js'), ...rest], join(HOME, 'REMEMBRANCE-BLOCKCHAIN')),
    // export the data plane to a mounted drive (verify with `--do verify <snap>`)
    export: () => run('bash', [join(toolkit, 'scripts/export-data-plane.sh'), ...rest], toolkit),
    verify: () => run('bash', [join(toolkit, 'scripts/export-data-plane.sh'), '--verify', ...rest], toolkit),
    // peek the Living Remembrance field state
    field: () => run('node', ['-e', "console.log(JSON.stringify(require('./src/core/field-coupling').peekField(),null,1))"], toolkit),
    // ── routed because they were being called directly ──────────────────
    // Every verb below already existed as a script. Nothing new was built;
    // they were simply unreachable from the one surface, so anyone needing
    // them had to know where they lived and bypass the goggles to run them.
    // That is what made the goggles feel incomplete — not missing features.
    //
    // the falsifiable contracts (Void's truth-spine, the CI definition of
    // complete). NOT `verify` — that name is taken by export verification
    // below, and the collision is exactly why this was run by hand.
    contracts: () => run('python3', ['verify_capabilities.py', ...rest], join(HOME, 'Void-Data-Compressor')),
    // coherency orchestrator: status · changed · diagnose --file <f> · heal --file <f>
    orchestrate: () => run('node', [join(toolkit, 'src/cli.js'), 'orchestrate', ...rest], toolkit),
    // audit what actually feeds the field — every contribute({coherence}) site
    audit: () => run('node', [join(toolkit, 'scripts/audit-field-contributions.js'), ...rest], toolkit),
    // tell the goggles a META-DEBUG finding was a false positive.
    // `--match "<substring>"` for a class, or an exact fingerprint.
    fp: () => run('node', [join(toolkit, 'src/tools/goggles-fp.js'), ...rest], toolkit),
    // remove index keys written under an OLDER scheme whose file the
    // substrate already holds under the current one. Never touches genuine
    // deletions — those are history. Dry-run unless --apply.
    prune: () => run('node', [join(toolkit, 'scripts/prune-superseded-keys.js'), ...rest], toolkit),
    // replay the coherencies the compressor already produced into the field.
    // A data-pipeline fix does not need a recomputation — every witnessed file
    // already carries its reading. ~2s for the whole substrate.
    replay: () => run('node', [join(toolkit, 'scripts/replay-substrate-readings.js'), ...rest], toolkit),
    // RUN a capability the goggles surfaced. Every function they list prints
    // its own `<path>#<fn>` reference; this invokes it, so seeing a capability
    // and using it are the same surface. Args are JSON, one per parameter.
    //   goggles --do call oracle/src/core/covenant.js#covenantCheck '"const x=1"'
    call: () => run('node', [join(toolkit, 'src/tools/goggles-call.js'), ...rest], toolkit),
    // UNFOLD EVERY ENTRY AGAIN AT THE CANONICAL DECODER WIDTH. Coherency is
    // NOT recomputed — it comes off the compressor reading the bytes and does
    // not depend on how many lens axes the decoder separates them into.
    //   goggles --do redecode [namespace|all] [--apply]
    redecode: () => run('node', [join(toolkit, 'scripts/redecode-substrate.js'), ...rest], toolkit),
    // THE RAW READINGS, AS THE COMPRESSOR PRODUCED THEM. No median, no mean,
    // no range standing in for the numbers. Coherency is time-independent, so
    // nothing here is ordered by ingest time or turned into a trend.
    //   goggles --do state [namespace|all] [--limit N] [--json <path>]
    state: () => run('node', [join(toolkit, 'scripts/substrate-state.js'), ...rest], toolkit),
    // WHERE THE SUBSTRATE HAS NO MEMORY. The inverse of resonance, read from
    // the same vectors at the same full decoder width — nothing re-decoded.
    // `delta_void` existed as an equation TERM (delta0*(1-p), derived from the
    // reading alone) but nothing ever measured an actual hole in the space.
    //   goggles --do void [namespace|all] [--sample N]
    void: () => run('node', [join(toolkit, 'scripts/void-map.js'), ...rest], toolkit),
    // READ THE WEB through the substrate: fetch a URL, compress + score it,
    // contribute the reading to the field. Browsing was the last blind spot
    // (WebFetch matches no hook, so a fetched page was never witnessed).
    browse: () => run('node', [join(toolkit, 'scripts/goggle-web.js'), ...rest], toolkit),
  };
  if (!verb || !VERBS[verb]) {
    console.error('goggles --do <verb>: ' + Object.keys(VERBS).join(' · '));
    console.error('  the goggles are the one surface — see the substrate (--map/--diff/<file>) AND drive it (--do <verb>)');
    process.exit(verb ? 1 : 0);
  }
  process.exit(VERBS[verb]());
}

// MACRO mode — read the whole-codebase coherency map from the substrate's
// existing compression (or rebuild live with --deep) and cache it.
if (argv[0] === '--map') {
  const rest = argv.slice(1).filter((a) => a !== '--deep');
  const deep = argv.includes('--deep');
  const dir = resolve(process.cwd(), rest[0] || '.');
  try {
    execFileSync('node', [engine, '--map', dir, ...(deep ? ['--deep'] : [])], { cwd: toolkit, stdio: 'inherit' });
    process.exit(0);
  } catch (e) {
    process.exit(e.status || 1);
  }
}

let files = [];
if (argv[0] === '--diff') {
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { encoding: 'utf8' });
  files = out.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => /\.(tsx?|jsx?|mjs|cjs|py|json|md|css|sh)$/.test(f));
} else {
  files = argv.filter((a) => !a.startsWith('--'));
}

if (!files.length) {
  console.error('goggles: no files to read. Pass file paths, --diff for changed files, or --map [dir] for the macro map.');
  process.exit(1);
}

let failures = 0;
for (const f of files) {
  const abs = resolve(process.cwd(), f);
  if (!existsSync(abs)) { console.error(`goggles: skip (not found) ${f}`); failures++; continue; }
  process.stdout.write(`\n══════════ ${f} ══════════\n`);
  try {
    process.stdout.write(execFileSync('node', [engine, abs], { cwd: toolkit, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    process.stdout.write((e.stdout || '') + (e.stderr || String(e)) + '\n');
    failures++;
  }
}
process.exit(failures ? 1 : 0);
