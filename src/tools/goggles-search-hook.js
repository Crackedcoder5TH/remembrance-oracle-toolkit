#!/usr/bin/env node
'use strict';

/**
 * goggles-search-hook — the wall over the harness's own search and read tools.
 *
 * The bash wall (goggles-bash-hook.js) refuses grep/rg/find/ls/cat on the
 * tree inside the ecosystem. The harness also offers Grep and Glob as TOOLS,
 * which never touch the shell and so never met the wall — the same hand
 * search through a side door. This hook closes it:
 *
 *   Grep, Glob  → refused inside an ecosystem repo; the verb is named
 *                 (`--do find`, `--do resonance`). Outside (the scratchpad)
 *                 they are allowed.
 *   Read        → allowed, and RECORDED: one JSON line per read in
 *                 .remembrance/goggles-reads.jsonl, so the count of files an
 *                 agent looked at without a goggle reading is itself a reading.
 *
 * Fails closed: an unreadable tool input is a denial, not a pass.
 */
const fs = require('node:fs');
const path = require('node:path');

function out(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}

process.on('uncaughtException', (e) => {
  try { out('deny', 'GOGGLES — WALL FAULT refused (fail closed)\n  ' + String(e && e.message || e)); } catch (_) { process.exit(0); }
});

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { raw = ''; }
let input = null;
if (raw.trim()) { try { input = JSON.parse(raw); } catch (_) { input = null; } }
if (!input || typeof input !== 'object') out('deny', 'GOGGLES — WALL FAULT refused (fail closed)\n  no parseable tool input.');

const tool = String(input.tool_name || '');
const ti = input.tool_input || {};
const ECO = path.resolve(__dirname, '..', '..', '..');
let roots = [];
try {
  roots = fs.readdirSync(ECO).map((d) => path.join(ECO, d)).filter((d) =>
    fs.existsSync(path.join(d, 'coins.ledger.json')) || fs.existsSync(path.join(d, '.claude', 'skills', 'goggles', 'run.mjs')));
} catch (_) { roots = []; }
const within = (p) => !!p && roots.some((r) => p === r || String(p).startsWith(r + path.sep));
const cwd = String(input.cwd || process.env.PWD || process.cwd() || '');
const target = ti.path || ti.file_path || '';
const inside = within(cwd) || within(path.resolve(cwd || '.', String(target || '.')));

if (tool === 'Grep' || tool === 'Glob') {
  if (!inside) process.exit(0);
  out('deny',
    'GOGGLES — HAND SEARCH refused (' + tool + ')\n' +
    '  Inside the ecosystem the goggles are the only surface, for any model, without exception.\n' +
    '  A search is a reading and is recorded; take it through the verb:\n' +
    '        node .claude/skills/goggles/run.mjs --do find ' + JSON.stringify(String(ti.pattern || '<regex>')) + (ti.path ? ' ' + ti.path : '') + '\n' +
    '        node .claude/skills/goggles/run.mjs --do resonance      (what a pattern resembles)\n' +
    '        node .claude/skills/goggles/run.mjs --do browse         (the tree, through the goggles)\n' +
    '  Outside the ecosystem (the scratchpad) Grep and Glob are yours.');
}

if (tool === 'Read') {
  if (inside) {
    try {
      const dir = path.join(__dirname, '..', '..', '.remembrance');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'goggles-reads.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), file: path.resolve(cwd || '.', String(target)), cwd }) + '\n');
    } catch (_) { /* the ledger never blocks a read */ }
  }
  process.exit(0);
}

process.exit(0);
