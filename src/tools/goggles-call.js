#!/usr/bin/env node
'use strict';

/**
 * goggles-call — invoke a capability the goggles surfaced.
 *
 * The goggles list the ecosystem's functions nearest to whatever you are
 * looking at, with their parameter lists. That told you a capability EXISTS
 * and what it takes; it still left you to work out which repo the path
 * resolves from, how to require it, and how to shape the arguments. Three
 * steps between seeing a capability and using it, each one a chance to get it
 * wrong — `orchestrate diagnose` was called three different wrong ways in one
 * session for exactly this reason.
 *
 * This closes that gap. The reference printed beside every listed function is
 * the thing you run:
 *
 *   goggles --do call oracle/src/core/living-remembrance.js#getEngine
 *   goggles --do call oracle/src/core/coherency-mapper.js#mapFromSubstrate '"/home/user/Void-Data-Compressor"'
 *
 * Arguments are JSON, one per parameter, so objects and arrays pass through
 * unmangled. Bare words are accepted as strings when they are not valid JSON,
 * because quoting every path is the kind of friction that sends people back to
 * writing a one-off script.
 *
 * Read-only by default in spirit — it calls what you name and nothing else —
 * but it IS a real invocation: a function with side effects will have them.
 * The signature and doc line are printed before the call so you see what you
 * are about to run.
 */

const fs = require('fs');
const path = require('path');

const ORACLE = path.resolve(__dirname, '..', '..');
const PARENT = path.resolve(ORACLE, '..');

// prefix -> repo dir, mirroring scripts/build-capability-index.js so a
// reference printed by the goggles resolves to the file it named.
const REPOS = {
  'oracle': 'remembrance-oracle-toolkit',
  'void': 'Void-Data-Compressor',
  'rmb-blockchain': 'REMEMBRANCE-BLOCKCHAIN',
  'rmb-swarm': 'REMEMBRANCE-AGENT-Swarm-',
  'rmb-dialer': 'Remembrance-dialer',
  'rmb-plugger': 'REMEMBRANCE-API-Key-Plugger',
  'rmb-interface': 'REMEMBRANCE-Interface',
  'moons': 'MOONS-OF-REMEMBRANCE',
  'reflector': 'Reflector-oracle-',
  'website': path.join('remembrance-oracle-toolkit', 'digital-cathedral'),
};

function resolveRef(ref) {
  const hash = ref.lastIndexOf('#');
  if (hash < 0) return { error: 'reference must be <path>#<fn> — e.g. oracle/src/core/covenant.js#covenantCheck' };
  const rel = ref.slice(0, hash);
  const fn = ref.slice(hash + 1);
  if (!fn) return { error: 'no function named after #' };

  const slash = rel.indexOf('/');
  const prefix = slash > 0 ? rel.slice(0, slash) : null;
  const repo = prefix && REPOS[prefix];
  const abs = repo
    ? path.join(PARENT, repo, rel.slice(slash + 1))
    : path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) return { error: `not found: ${abs}` };
  return { abs, fn, rel };
}

function parseArg(a) {
  try { return JSON.parse(a); } catch (_) { return a; }
}

function main() {
  const argv = process.argv.slice(2);
  const ref = argv[0];
  if (!ref || ref === '--help') {
    console.error('usage: goggles --do call <path>#<fn> [jsonArg ...]');
    console.error('  the reference is printed beside every function the goggles surface');
    process.exit(ref ? 0 : 2);
  }

  const r = resolveRef(ref);
  if (r.error) { console.error('goggles call: ' + r.error); process.exit(1); }

  // Show what is about to run, from the same index the goggles print from.
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(ORACLE, 'ecosystem-capabilities.json'), 'utf8'));
    const c = idx.callSigs && idx.callSigs[r.rel] && idx.callSigs[r.rel][r.fn];
    if (c) {
      console.error(`→ ${r.fn}(${c.params})${c.doc ? `   — ${c.doc}` : ''}`);
    }
  } catch (_) { /* index optional */ }

  let mod;
  try {
    mod = require(r.abs);
  } catch (e) {
    console.error(`goggles call: cannot load ${r.rel} — ${e.message}`);
    process.exit(1);
  }

  const target = mod && (mod[r.fn] !== undefined ? mod[r.fn] : (mod.default && mod.default[r.fn]));
  if (target === undefined) {
    const available = Object.keys(mod || {}).filter((k) => typeof mod[k] === 'function');
    console.error(`goggles call: ${r.fn} is not exported by ${r.rel}`);
    if (available.length) console.error('  exported functions: ' + available.slice(0, 15).join(', '));
    process.exit(1);
  }
  if (typeof target !== 'function') {
    // A constant is a legitimate thing to surface; print it rather than fail.
    console.log(JSON.stringify(target, null, 1));
    process.exit(0);
  }

  const args = argv.slice(1).map(parseArg);
  let out;
  try {
    out = target(...args);
  } catch (e) {
    console.error(`goggles call: ${r.fn} threw — ${e.message}`);
    process.exit(1);
  }

  const show = (v) => {
    if (v === undefined) { console.log('(undefined)'); return; }
    try { console.log(JSON.stringify(v, null, 1)); }
    catch (_) { console.log(String(v)); }        // circular / non-serialisable
  };

  if (out && typeof out.then === 'function') {
    out.then((v) => { show(v); process.exit(0); })
      .catch((e) => { console.error(`goggles call: ${r.fn} rejected — ${e.message}`); process.exit(1); });
  } else {
    show(out);
  }
}

main();

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
resolveRef.atomicProperties = { charge: -1, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 16, period: 3, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };
parseArg.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 9, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
main.atomicProperties = { charge: -1, valence: 1, mass: "medium", spin: "odd", phase: "liquid", reactivity: "low", electronegativity: 1, group: 3, period: 4, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };
