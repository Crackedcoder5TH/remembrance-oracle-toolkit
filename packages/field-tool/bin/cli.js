#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { toWaveform, coherency, coherencyOf, Field, DIM } = require('../src/index');

const HELP = `remembrance-field — the Remembrance Field tool

Usage:
  remembrance-field encode <text|@file> [--json]
      Encode input into the 256-D waveform. Prints a summary; --json prints the full array.

  remembrance-field coherency <a|@file> <b|@file>
      Cosine coherency in [0,1] between two inputs ("do these mean the same thing?").

  remembrance-field contribute --coherence <0..1> --source <label> [--cost <n>] [--url <u>] [--token <t>]
      Contribute one observation to a running Remembrance Field (best-effort).

Inputs: a literal string, or @path to read a file.
Env: REMEMBRANCE_FIELD_URL (default http://127.0.0.1:7787/mcp), REMEMBRANCE_FIELD_TOKEN.
`;

function readInput(s) {
  if (typeof s === 'string' && s.startsWith('@')) return fs.readFileSync(s.slice(1), 'utf8');
  return s == null ? '' : String(s);
}

function parseFlags(args) {
  const flags = {}; const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { flags[args[i].slice(2)] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true; }
    else pos.push(args[i]);
  }
  return { flags, pos };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP); return; }
  const { flags, pos } = parseFlags(rest);

  if (cmd === 'encode') {
    const wf = toWaveform(readInput(pos[0]));
    if (flags.json) { process.stdout.write(JSON.stringify(Array.from(wf)) + '\n'); return; }
    let mean = 0, energy = 0; for (const v of wf) { mean += v; energy += v * v; }
    mean /= DIM; energy = Math.sqrt(energy);
    process.stdout.write(`dim=${DIM} mean=${mean.toFixed(4)} energy=${energy.toFixed(3)}\n`);
    return;
  }

  if (cmd === 'coherency' || cmd === 'cohere') {
    if (pos.length < 2) { process.stderr.write('coherency needs two inputs\n'); process.exit(2); }
    const c = coherencyOf(readInput(pos[0]), readInput(pos[1]));
    process.stdout.write(c.toFixed(6) + '\n');
    return;
  }

  if (cmd === 'contribute') {
    const field = new Field({ url: typeof flags.url === 'string' ? flags.url : undefined, token: typeof flags.token === 'string' ? flags.token : undefined });
    const res = await field.contribute({ coherence: Number(flags.coherence), source: flags.source, cost: flags.cost != null ? Number(flags.cost) : 1.0 });
    process.stdout.write(JSON.stringify(res) + '\n');
    process.exit(res.ok ? 0 : 1);
  }

  process.stderr.write(`unknown command: ${cmd}\n\n` + HELP);
  process.exit(2);
}

main().catch((e) => { process.stderr.write('error: ' + ((e && e.message) || e) + '\n'); process.exit(1); });
