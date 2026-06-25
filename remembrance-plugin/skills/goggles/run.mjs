#!/usr/bin/env node
'use strict';
// Runner for the `goggles` skill. Locates the remembrance-oracle-toolkit (the
// goggles engine lives at src/tools/goggles.js there) and runs it on each file,
// from the toolkit dir so its core requires resolve. Accepts explicit paths or
// `--diff` to goggle everything changed vs HEAD in the current repo.

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
let files = [];
if (argv[0] === '--diff') {
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], { encoding: 'utf8' });
  files = out.split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => /\.(tsx?|jsx?|mjs|cjs|py|json|md|css|sh)$/.test(f));
} else {
  files = argv.filter((a) => !a.startsWith('--'));
}

if (!files.length) {
  console.error('goggles: no files to read. Pass file paths, or --diff for changed files.');
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
