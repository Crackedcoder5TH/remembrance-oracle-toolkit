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
 * A trap may carry a `guard`: { tools: <regex over tool names>,
 * input?: <regex over the stringified tool input> }. This hook runs as
 * PreToolUse on ALL tools ('.*') and, when a guarded trap matches the
 * call, RIDES THE CALL AS CONTEXT — the trap's own text, the same on
 * every matching call, and nothing is denied here.
 *
 * NO DENY-ONCE (the operator's root ruling, 2026-10-22: "stop that double
 * write bypass at the root"). Deny-once trained the identical resend: the
 * first call was refused, the unchanged retry passed, and the lesson was
 * scrolled past both times. The correction now arrives WITH the act, every
 * time, and the one hard stop lives where it is judged — the commit door,
 * where THE TRAP EQUATION reads the message and the staged patch
 * (goggles --do commit / --do brief). Same fix shape as goggles-pre-hook.
 *
 * Posture: an internal error never blocks a call on this hook's own
 * account — the settings-level `|| deny` still fails CLOSED if this
 * script cannot run at all, per the wall ruling.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function outContext(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: text,
    },
  }));
  process.exit(0);
}
outContext.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 11, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };

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

// The traps ride the call as context — the same on every matching call,
// nothing denied, no per-session memory to train a resend against. The
// hard stop lives at the commit door (THE TRAP EQUATION).
let body = '';
try {
  const brief = require('./brief');
  body = brief.renderTraps(hits);
} catch (_) {
  body = hits.map((t) => `✗ WRONG: ${t.wrong}\n✓ TRUTH: ${t.truth}\n⚑ TELL: ${t.tell}\n→ DO: ${t.correct}`).join('\n\n');
}

outContext(
  'TRAP GUARD — the ledger has recorded this exact move (' + toolName + '). '
  + 'Mistakes already made here; read them before this call\'s work lands. '
  + 'The stop is at the commit: THE TRAP EQUATION reads the message and the '
  + 'staged patch.\n\n' + body);
