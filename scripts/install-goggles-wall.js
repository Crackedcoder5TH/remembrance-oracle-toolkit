#!/usr/bin/env node
'use strict';
/**
 * install-goggles-wall.js — put the hardened wall in front of every door,
 * in every ecosystem repo and at the user level, idempotently.
 *
 * THE WALL (2026-09-11, the operator's rule: the goggles are the only surface
 * for anything done in the codebase, for any model, without exception):
 *
 *   PreToolUse Bash               src/tools/goggles-bash-hook.js
 *       default-deny inside the ecosystem: only the goggles, git, shell glue
 *       and text filters after a pipe run; everything else is refused with
 *       the verb to use. Fails closed.
 *   PreToolUse Edit|Write|MultiEdit|NotebookEdit   src/tools/goggles-pre-hook.js
 *       goggled-first: no edit to an existing file without a goggle reading
 *       of it in the last two hours; plus the brief gate and the substrate
 *       bypass check it already carried.
 *   PreToolUse Grep|Glob|Read     src/tools/goggles-search-hook.js
 *       Grep/Glob refused inside the ecosystem (--do find / --do resonance);
 *       Read allowed and recorded.
 *   PostToolUse Edit|Write|MultiEdit   src/tools/goggles-hook.js (unchanged)
 *
 * FAIL CLOSED AT THE SETTINGS LEVEL TOO: the hook commands used to end in
 * `|| true`, so a hook that could not start let the tool run. They now end
 * in a deny payload, so a missing node or a missing hook file is a refusal.
 *
 * Runs through the goggles:  node .claude/skills/goggles/run.mjs --do exec scripts/install-goggles-wall.js
 * Idempotent and merge-safe: other hooks and keys in every settings file are kept.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HUB = path.resolve(__dirname, '..');
const ECO = path.resolve(HUB, '..');
const DENY = (what) => ` || echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"GOGGLES — WALL UNAVAILABLE refused (fail closed): ${what} did not run"}}'`;
const hook = (file) => `node ${path.join(HUB, 'src', 'tools', file)}`;

const PRE = [
  { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: hook('goggles-pre-hook.js') + DENY('goggles-pre-hook'), statusMessage: 'goggles: the reading before the write (goggled-first)' }] },
  { matcher: 'Bash', hooks: [{ type: 'command', command: hook('goggles-bash-hook.js') + DENY('goggles-bash-hook'), statusMessage: 'goggles: the wall — only the goggles run inside the ecosystem' }] },
  { matcher: 'Grep|Glob|Read', hooks: [{ type: 'command', command: hook('goggles-search-hook.js') + DENY('goggles-search-hook'), statusMessage: 'goggles: searches go through --do find; reads are recorded' }] },
  { matcher: 'WebFetch', hooks: [{ type: 'command', command: hook('goggles-web-hook.js') + ' || true', statusMessage: 'goggles: reading the page through the substrate' }] },
];
const POST = [
  { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: hook('goggles-hook.js') + ' || true', statusMessage: 'goggles: reading coherence/resonance' }] },
];

function mergeHooks(doc) {
  doc.hooks = doc.hooks || {};
  const ours = (m) => PRE.some((p) => p.matcher === m) || POST.some((p) => p.matcher === m);
  const legacy = new Set(['Edit|Write|MultiEdit', 'Bash', 'WebFetch', 'Grep|Glob|Read', 'Edit|Write|MultiEdit|NotebookEdit']);
  const keepPre = (doc.hooks.PreToolUse || []).filter((h) => !legacy.has(h.matcher) && !ours(h.matcher));
  const keepPost = (doc.hooks.PostToolUse || []).filter((h) => h.matcher !== 'Edit|Write|MultiEdit');
  doc.hooks.PreToolUse = [...PRE, ...keepPre];
  doc.hooks.PostToolUse = [...POST, ...keepPost];
  return doc;
}

function install(file) {
  let doc = {};
  if (fs.existsSync(file)) {
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file}: not JSON (${e.message}) — refusing to overwrite`); }
  }
  mergeHooks(doc);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  return file;
}

const repos = fs.readdirSync(ECO).map((d) => path.join(ECO, d)).filter((d) =>
  fs.existsSync(path.join(d, 'coins.ledger.json')) || fs.existsSync(path.join(d, '.claude', 'skills', 'goggles', 'run.mjs')));
const done = [];
for (const r of repos) done.push(install(path.join(r, '.claude', 'settings.json')));
done.push(install(path.join(os.homedir(), '.claude', 'settings.json')));
// THE SKILL IS ONE SURFACE: the hub's run.mjs and SKILL.md are canonical and
// every repo carries a byte-identical copy (ecosystem-protocol-sync verifies
// it on push). The wall's verbs live in run.mjs, so installing the wall
// means syncing the copies too; anything else leaves a repo whose goggles
// lack the verbs its own wall names.
let synced = 0;
for (const r of repos) {
  if (r === HUB) continue;
  const dir = path.join(r, '.claude', 'skills', 'goggles');
  if (!fs.existsSync(dir)) continue;
  for (const f of ['run.mjs', 'SKILL.md']) {
    const src = fs.readFileSync(path.join(HUB, '.claude', 'skills', 'goggles', f));
    const dst = path.join(dir, f);
    if (!fs.existsSync(dst) || !fs.readFileSync(dst).equals(src)) { fs.writeFileSync(dst, src); synced++; }
  }
}
console.log(`goggles skill synced: ${synced} file(s) brought to the hub's canonical copy`);
for (const f of ['goggles-bash-hook.js', 'goggles-pre-hook.js', 'goggles-search-hook.js', 'goggles-web-hook.js', 'goggles-hook.js']) {
  if (!fs.existsSync(path.join(HUB, 'src', 'tools', f))) throw new Error(`hook missing: ${f}`);
}
console.log(`goggles wall installed (fail closed) in ${done.length} settings file(s):`);
for (const f of done) console.log('  ' + f);
