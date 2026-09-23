#!/usr/bin/env node
/**
 * TRAP GUARD — the trap ledger's teeth, over EVERY tool (the operator's
 * ruling, 2026-09-20: the trap ledger has the same teeth as the goggles
 * and forces the agent to listen).
 *
 * The brief gate already denies the first EDIT of a trapped file; the
 * wall already denies off-surface SHELL. What had no teeth was every
 * other tool — an MCP scheduler call, a workflow spawn — where a trap's
 * lesson applied and was scrolled past. Measured 2026-09-20: an hourly
 * Routine was created to "always run" the ratchet battery while the
 * instrument already ran it three layers deep; no hook fired, the ledger
 * had no reach.
 *
 * Now a trap may carry a `guard`: { tools: <regex over tool names>,
 * input?: <regex over the stringified tool input> }. This hook runs as
 * PreToolUse on ALL tools ('.*') and, when a guarded trap matches the
 * call, DENIES ONCE per (session, trap) with the trap's own text — the
 * brief gate's exact shape: the correction arrives before the act, and
 * the identical retry passes. Deny-once, never deny-always: a gate that
 * keeps firing gets routed around.
 *
 * Posture: the deny path is deliberate; an internal error never blocks a
 * call on this hook's own account (the brief gate's recorded stance) —
 * the settings-level `|| deny` still fails CLOSED if this script cannot
 * run at all, per the wall ruling.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { quiet } = require('../core/quiet');

const ROOT = path.resolve(__dirname, '..', '..');

function out(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) { process.exit(0); }
const toolName = String(input.tool_name || '');
if (!toolName) process.exit(0);

let seed = null;
try { seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seeds', 'traps.seed.json'), 'utf8')); } catch (_) { seed = null; }
const traps = (seed && Array.isArray(seed.traps) ? seed.traps : []).filter((t) => t && t.guard && typeof t.guard.tools === 'string');
if (!traps.length) process.exit(0);

let inputStr = '';
const hits = [];
for (const trap of traps) {
  let toolRe;
  try { toolRe = new RegExp(trap.guard.tools); } catch (_) { continue; }
  if (!toolRe.test(toolName)) continue;
  if (trap.guard.input) {
    if (!inputStr) { try { inputStr = JSON.stringify(input.tool_input || {}); } catch (_) { inputStr = ''; } }
    let inRe;
    try { inRe = new RegExp(trap.guard.input); } catch (_) { continue; }
    if (!inRe.test(inputStr)) continue;
  }
  hits.push(trap);
}
if (!hits.length) process.exit(0);

// deny-once per (session, trap) — the retry passes
const seenPath = path.join(ROOT, '.remembrance', 'trap-guarded.json');
let seen = {};
try { seen = JSON.parse(fs.readFileSync(seenPath, 'utf8')); } catch (_) { seen = {}; }
const session = String(input.session_id || 'nosession');
const fresh = hits.filter((t) => !seen[session + '::' + String(t.wrong || '').slice(0, 120)]);
if (!fresh.length) process.exit(0);

for (const t of fresh) seen[session + '::' + String(t.wrong || '').slice(0, 120)] = Date.now();
try {
  fs.mkdirSync(path.dirname(seenPath), { recursive: true });
  fs.writeFileSync(seenPath, JSON.stringify(seen, null, 1));
} catch (e) { quiet('tools:trap-guard-hook:seen-write', e); /* if the memory cannot be written, deny once and move on */ }

let body = '';
try {
  const brief = require('./brief');
  body = brief.renderTraps(fresh);
} catch (_) {
  body = fresh.map((t) => `✗ WRONG: ${t.wrong}\n✓ TRUTH: ${t.truth}\n⚑ TELL: ${t.tell}\n→ DO: ${t.correct}`).join('\n\n');
}

out('deny',
  'TRAP GUARD — the ledger has recorded this exact move (' + toolName + '). Read the trap, '
  + 'then retry the identical call if it still holds; the retry passes. This is the one-time '
  + 'cost of a mistake already made once.\n\n' + body);
