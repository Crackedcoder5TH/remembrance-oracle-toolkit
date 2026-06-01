#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { toWaveform, coherency, coherencyOf, Field, VoidClient, confirm, DIM } = require('../src/index');

const HELP = `remembrance-field — the Remembrance Field tool

Standalone (no network, offline structural reading):
  remembrance-field encode <text|@file> [--json]
      Encode input into the fractal waveform — a 29-D structural vector
      whose dimensions are the ecosystem's fractal language (atomic
      properties + structural histograms + structurality). Summary by
      default; --json = full array. Spec: docs/FRACTAL_WAVEFORM_SPEC.md.
  remembrance-field coherency <a|@file> <b|@file>
      Fractal coherency in [-1,1] (typically [0,1]) — cosine over the
      fractal vector, gated by structurality agreement so code-vs-prose
      is correctly damped.

Connected to your Void compressor (REMEMBRANCE_VOID_URL, default http://127.0.0.1:8080):
  remembrance-field score <text|@file>
      Score input against your collected substrate (real resonance via
      Void's byte-stretch encoder, not the offline fractal cosine).
  remembrance-field submit <code|@file> --name <name> [--language <l>] [--tags a,b] [--description <d>]
      Score the pattern, then ASK whether to add it to the canonical pattern library.
      --yes / --no skip the prompt; otherwise you are prompted (defaults to NO).

Connected to your field-server (REMEMBRANCE_FIELD_URL, default http://127.0.0.1:7787/mcp):
  remembrance-field resonance <code|@file> [--language <l>] [--k <n>] [--json]
      Lexical TF-IDF resonance of code against the proven pattern library.
      Real code finds family members; hallucinated code with invented
      identifiers does not. The anti-hallucination signal that fractal
      coherency cannot provide (fractal sees structure, not vocabulary).
  remembrance-field safety <code|@file> [--language <l>] [--description <d>] [--tags a,b] [--json]
      Combined safety check: covenant principles + security pattern scanner.
      Exits 0 if SEALED, 1 if UNSEALED. Flags eval, shell injection,
      hardcoded secrets, prototype pollution, SQL injection, etc.

Unified observation-driven evaluation:
  remembrance-field evaluate <text|@file> [--language <l>] [--execute --test <code|@file>]
      Look at the input, pick the right signals (safety always; resonance
      only for code-shaped input; exec_verify only with --execute AND
      supported language AND safety sealed), compose a verdict. The single
      call for "is this anti-hallucination-safe to use?". Exits 1 on
      verdict low.

Code verification (requires bearer token — server runs code in a sandbox):
  remembrance-field verify <code|@file> --language <js|python> [--test <code|@file>] [--timeout <ms>]
      Run code in a temp dir with hard timeout; report status (pass /
      smoke-pass / fail / timeout / blocked / skipped) and signal [0..1].
      Harm-screened before execution. Compose with `safety` for full
      anti-hallucination coverage: safety first (static), verify after
      (dynamic). Exit 0 pass, 1 fail/timeout/blocked, 2 skipped/error.

Field (shared conserved scalar):
  remembrance-field contribute --coherence <0..1> --source <label> [--cost <n>] [--url <u>] [--token <t>]
      Contribute to the field. With a queue configured, a failed send is saved locally.
  remembrance-field contribute ... --offline
      Skip the network and queue the contribution locally (work offline).
  remembrance-field sync [--queue <path>] [--url <u>] [--token <t>] [--max <n>]
      Flush the local offline queue to the field — sync up when you have internet.

Env: REMEMBRANCE_FIELD_URL, REMEMBRANCE_FIELD_TOKEN, REMEMBRANCE_FIELD_QUEUE (offline queue path),
     REMEMBRANCE_VOID_URL, REMEMBRANCE_AGENT_ID.
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

  if (cmd === 'resonance') {
    const code = readInput(pos[0]);
    if (!code) { process.stderr.write('resonance needs <code|@file>\n'); process.exit(2); }
    const field = new Field({
      url: typeof flags.url === 'string' ? flags.url : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
    });
    const r = await field.resonance(code, {
      language: typeof flags.language === 'string' ? flags.language : undefined,
      k: flags.k != null ? Number(flags.k) : undefined,
    });
    if (flags.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return; }
    if (!r || r.ok === false) { process.stderr.write('resonance unavailable: ' + (r && r.error || 'no result') + '\n'); process.exit(1); }
    if (r.score == null) {
      process.stdout.write(`resonance unavailable — library: ${JSON.stringify(r.library)}\n`);
      return;
    }
    process.stdout.write(`resonance ${r.score.toFixed(4)}  (bestMatch ${r.bestMatch.toFixed(4)}, meanTopK ${r.meanTopK.toFixed(4)}, k=${r.k})\n`);
    if (Array.isArray(r.topMatches)) {
      for (const m of r.topMatches.slice(0, 5)) process.stdout.write(`  ${m.similarity.toFixed(4)}  ${m.name}\n`);
    }
    return;
  }

  if (cmd === 'safety') {
    const code = readInput(pos[0]);
    if (!code) { process.stderr.write('safety needs <code|@file>\n'); process.exit(2); }
    const field = new Field({
      url: typeof flags.url === 'string' ? flags.url : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
    });
    const r = await field.safety(code, {
      language: typeof flags.language === 'string' ? flags.language : undefined,
      description: typeof flags.description === 'string' ? flags.description : undefined,
      tags: typeof flags.tags === 'string' ? flags.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    });
    if (flags.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return; }
    if (!r || r.ok === false) { process.stderr.write('safety unavailable: ' + (r && r.error || 'no result') + '\n'); process.exit(1); }
    process.stdout.write(`safety ${r.sealed ? 'SEALED' : 'UNSEALED'}  (covenant ${r.covenant.principlesPassed}/${r.covenant.totalPrinciples}, security ${r.security.riskLevel})\n`);
    if (r.covenant.violations && r.covenant.violations.length) {
      for (const v of r.covenant.violations) process.stdout.write(`  covenant: ${v.principle || v.reason || JSON.stringify(v)}\n`);
    }
    if (r.security.findings && r.security.findings.length) {
      for (const f of r.security.findings) process.stdout.write(`  security ${f.severity}: ${f.message}\n`);
    }
    process.exit(r.sealed ? 0 : 1);
  }

  if (cmd === 'evaluate') {
    const input = readInput(pos[0]);
    if (!input) { process.stderr.write('evaluate needs <text|@file>\n'); process.exit(2); }
    const language = typeof flags.language === 'string' ? flags.language : undefined;
    const execute = flags.execute === true;
    const testCode = typeof flags.test === 'string' ? readInput(flags.test) : undefined;
    const field = new Field({
      url: typeof flags.url === 'string' ? flags.url : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
    });
    const r = await field.evaluate(input, {
      language, execute, testCode,
      timeoutMs: flags.timeout != null ? Number(flags.timeout) : undefined,
      description: typeof flags.description === 'string' ? flags.description : undefined,
    });
    if (flags.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return; }
    if (!r || r.ok === false) { process.stderr.write('evaluate unavailable: ' + (r && r.error || 'no result') + '\n'); process.exit(1); }
    const o = r.observation || {};
    const v = r.verdict || {};
    process.stdout.write(`observed: structurality=${(o.structurality||0).toFixed(3)}  ${o.looksLikeCode?'code':o.looksLikeProse?'prose':'mixed'}\n`);
    process.stdout.write(`tools run: ${(r.toolsRun||[]).join(', ') || '(none)'}\n`);
    process.stdout.write(`verdict: ${v.trust}  score=${v.score}  ${v.reason||''}\n`);
    if (v.breakdown) {
      const parts = Object.entries(v.breakdown).map(([k,vv]) => `${k}=${typeof vv==='number'?vv.toFixed(3):vv}`);
      if (parts.length) process.stdout.write(`  breakdown: ${parts.join(', ')}\n`);
    }
    process.exit(v.trust === 'low' ? 1 : 0);
  }

  if (cmd === 'verify') {
    const code = readInput(pos[0]);
    if (!code) { process.stderr.write('verify needs <code|@file>\n'); process.exit(2); }
    const language = typeof flags.language === 'string' ? flags.language : undefined;
    if (!language) { process.stderr.write('verify needs --language (javascript|python)\n'); process.exit(2); }
    const testCode = typeof flags.test === 'string' ? readInput(flags.test) : undefined;
    const field = new Field({
      url: typeof flags.url === 'string' ? flags.url : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
    });
    const r = await field.verify(code, {
      language,
      testCode,
      timeoutMs: flags.timeout != null ? Number(flags.timeout) : undefined,
    });
    if (flags.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return; }
    if (!r || r.ok === false) { process.stderr.write('verify unavailable: ' + (r && r.error || 'no result') + '\n'); process.exit(1); }
    process.stdout.write(`${r.status}  signal=${r.signal == null ? 'null' : r.signal}  (${r.detail})\n`);
    // exit 0 on pass/smoke-pass; 1 on fail/timeout/blocked; 2 on skipped/error
    if (r.status === 'pass' || r.status === 'smoke-pass') process.exit(0);
    if (r.status === 'fail' || r.status === 'timeout' || r.status === 'blocked') process.exit(1);
    process.exit(2);
  }

  if (cmd === 'contribute') {
    const field = new Field({
      url: typeof flags.url === 'string' ? flags.url : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
      queuePath: typeof flags.queue === 'string' ? flags.queue : undefined,
    });
    const obs = { coherence: Number(flags.coherence), source: flags.source, cost: flags.cost != null ? Number(flags.cost) : 1.0 };
    const res = flags.offline ? field.queue(obs) : await field.contribute(obs);
    process.stdout.write(JSON.stringify(res) + '\n');
    process.exit(res.ok || res.queued ? 0 : 1);
  }

  if (cmd === 'sync') {
    const field = new Field({
      url: typeof flags.url === 'string' ? flags.url : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
      queuePath: typeof flags.queue === 'string' ? flags.queue : undefined,
    });
    const r = await field.sync({ max: flags.max != null ? Number(flags.max) : undefined });
    process.stdout.write(`synced ${r.synced}, remaining ${r.remaining}` + (r.error ? ` (${r.error})` : '') + '\n');
    process.exit(r.ok ? 0 : 1);
  }

  process.stderr.write(`unknown command: ${cmd}\n\n` + HELP);
  process.exit(2);
}

main().catch((e) => { process.stderr.write('error: ' + ((e && e.message) || e) + '\n'); process.exit(1); });
