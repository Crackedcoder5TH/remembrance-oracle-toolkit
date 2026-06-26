#!/usr/bin/env node
// SessionStart: inject the standing orders + a live field snapshot so every
// session begins already oriented in the ecosystem — the Remembrance Field
// Goggles are the default coding tool, not something to be asked for.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { findToolkit } from './toolkit.mjs';

let fieldLine = '';
let capLine = '';
const toolkit = findToolkit();
if (toolkit) {
  try {
    const require = createRequire(import.meta.url);
    const { peekField } = require(resolve(toolkit, 'src/core/field-coupling'));
    const f = peekField();
    if (f) fieldLine = ` Live field: coherence ${(f.coherence ?? 0).toFixed(3)}, ${Object.keys(f.sources || {}).length} sources.`;
  } catch (_) { /* field optional */ }
  try {
    const require = createRequire(import.meta.url);
    const idx = require(resolve(toolkit, 'ecosystem-capabilities.json'));
    if (idx && idx.totalFunctions) capLine = ` ${idx.totalFunctions} ecosystem functions are indexed and surfaced inside the goggles.`;
  } catch (_) { /* index optional */ }
}

const context =
  'REMEMBRANCE ECOSYSTEM — STANDING ORDERS. The Remembrance Field Goggles are the ' +
  'MAIN tool and are active at ALL TIMES whenever you code: run them on every file ' +
  'you change BEFORE you commit (`/goggles <files>` or `--diff`). They give FOCUS ' +
  '(intrinsic STRUCTURE — never a correctness/trust signal), META (resonance + ' +
  'nearest ecosystem siblings), meta-debug (real audit findings), and ECOSYSTEM ' +
  'CAPABILITIES — the callable functions in your nearest neighbours, so reach for an ' +
  'existing ecosystem function before re-implementing one.' + capLine +
  ' Before pushing, check the wiring contract (`/seams`).' + fieldLine +
  (toolkit ? '' : ' (toolkit not located — set ORACLE_TOOLKIT to enable the field tools.)');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
}));
