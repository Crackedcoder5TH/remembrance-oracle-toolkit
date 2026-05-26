#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { toWaveform, coherency, coherencyOf, Field, VoidClient, confirm, DIM } = require('../src/index');

const HELP = `remembrance-field — the Remembrance Field tool

Standalone (no network):
  remembrance-field encode <text|@file> [--json]
      Encode input into the 256-D waveform. Summary by default; --json = full array.
  remembrance-field coherency <a|@file> <b|@file>
      Cosine coherency in [0,1] between two inputs.

Connected to your Void compressor (REMEMBRANCE_VOID_URL, default http://127.0.0.1:8080):
  remembrance-field score <text|@file>
      Score input against your collected substrate (real resonance, not a bare cosine).
  remembrance-field submit <code|@file> --name <name> [--language <l>] [--tags a,b] [--description <d>]
      Score the pattern, then ASK whether to add it to the canonical pattern library.
      --yes / --no skip the prompt; otherwise you are prompted (defaults to NO).

Field (shared conserved scalar):
  remembrance-field contribute --coherence <0..1> --source <label> [--cost <n>] [--url <u>] [--token <t>]

Env: REMEMBRANCE_FIELD_URL, REMEMBRANCE_FIELD_TOKEN, REMEMBRANCE_VOID_URL, REMEMBRANCE_AGENT_ID.
Inputs: a literal string, or @path to read a file.
`;

function readInput(s) {
  if (typeof s === 'string' && s.startsWith('@')) return fs.readFileSync(s.slice(1), 'utf8');
  return s == null ? '' : String(s);
}

function parseFlags(args) {
  const flags = {}; const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { flags[args[i].slice(2)] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true; }
    else if (args[i] === '-y') flags.yes = true;
    else pos.push(args[i]);
  }
  return { flags, pos };
}

function voidCoherence(res) {
  // /coherence returns a coherence score under one of a few keys depending on version.
  if (!res || res.ok === false) return null;
  const b = res.body;
  if (b && typeof b === 'object') {
    for (const k of ['coherence', 'coherency', 'score', 'unified']) {
      if (typeof b[k] === 'number') return b[k];
    }
  }
  return null;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP); return; }
  const { flags, pos } = parseFlags(rest);

  if (cmd === 'encode') {
    const wf = toWaveform(readInput(pos[0]));
    if (flags.json) { process.stdout.write(JSON.stringify(Array.from(wf)) + '\n'); return; }
    let mean = 0, energy = 0; for (const v of wf) { mean += v; energy += v * v; }
    process.stdout.write(`dim=${DIM} mean=${(mean / DIM).toFixed(4)} energy=${Math.sqrt(energy).toFixed(3)}\n`);
    return;
  }

  if (cmd === 'coherency' || cmd === 'cohere') {
    if (pos.length < 2) { process.stderr.write('coherency needs two inputs\n'); process.exit(2); }
    process.stdout.write(coherencyOf(readInput(pos[0]), readInput(pos[1])).toFixed(6) + '\n');
    return;
  }

  if (cmd === 'score') {
    const text = readInput(pos[0]);
    const void_ = new VoidClient({ url: typeof flags.url === 'string' ? flags.url : undefined });
    const res = await void_.coherence(text);
    const c = voidCoherence(res);
    if (c == null) {
      process.stderr.write(`Void not reachable at ${void_.url} — substrate scoring needs a running Void compressor.\n` +
        `Set REMEMBRANCE_VOID_URL, or use \`coherency\` for offline pairwise comparison.\n`);
      process.exit(1);
    }
    process.stdout.write(`substrate coherence = ${c.toFixed(6)}  (via ${void_.url})\n`);
    return;
  }

  if (cmd === 'submit') {
    const code = readInput(pos[0]);
    const name = typeof flags.name === 'string' ? flags.name : '';
    if (!name) { process.stderr.write('submit needs --name <name>\n'); process.exit(2); }
    const void_ = new VoidClient({ url: typeof flags.url === 'string' ? flags.url : undefined });

    // Show the substrate score first so the user can make an informed choice.
    const scored = voidCoherence(await void_.coherence(code));
    process.stdout.write(`Pattern "${name}" — ${code.length} chars` +
      (scored != null ? `, substrate coherence ${scored.toFixed(4)}` : ', (Void offline — score unavailable)') + '\n');

    const force = flags.yes ? true : (flags.no ? false : undefined);
    const yes = await confirm('Add this pattern to the canonical pattern library?', { force, defaultValue: false });
    if (!yes) { process.stdout.write('Skipped — pattern was NOT contributed.\n'); return; }

    const res = await void_.submitPattern({
      name, code,
      language: typeof flags.language === 'string' ? flags.language : undefined,
      tags: typeof flags.tags === 'string' ? flags.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      description: typeof flags.description === 'string' ? flags.description : undefined,
    });
    if (res.ok === false) { process.stderr.write('Submission failed: ' + (res.error || JSON.stringify(res.body)) + '\n'); process.exit(1); }
    process.stdout.write('Submitted: ' + JSON.stringify(res.body) + '\n');
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
