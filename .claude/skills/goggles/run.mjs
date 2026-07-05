#!/usr/bin/env node
'use strict';
// Runner for the `goggles` skill. Locates the remembrance-oracle-toolkit (the
// goggles engine lives at src/tools/goggles.js there) and runs it, from the
// toolkit dir so its core requires resolve.
//
// Modes:
//   run.mjs --map [dir]       build the MACRO map (whole codebase compressed,
//                             cached at <repo>/.remembrance/goggles-map.json)
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

// MACRO mode — compress the whole codebase into a coherency map and cache it.
if (argv[0] === '--map') {
  const dir = resolve(process.cwd(), argv[1] || '.');
  try {
    execFileSync('node', [engine, '--map', dir], { cwd: toolkit, stdio: 'inherit' });
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
